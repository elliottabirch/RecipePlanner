/**
 * Cheap check-off recompute (PREP-04, D-01a.3): "order is authoritative, the
 * clock adapts." Re-times the GA's already-decided `fixedOrder` in one
 * forward pass, using actual completion durations in place of estimates for
 * checked-off steps and the resource-feasibility model (`resources.ts`) in
 * place of estimates for not-yet-started steps.
 *
 * `retimeSchedule` NEVER sorts, reverses, or otherwise permutes `fixedOrder`
 * — the returned `Schedule.order` is the exact same array the GA decided
 * (05-RESEARCH.md Pattern 3, 05-CONTEXT.md D-01a.3). Re-running the GA on
 * every check-off is explicitly forbidden: it would let the order jump
 * around mid-cook, breaking the tablet's calm now/next sequence. This
 * function is an O(n) forward sweep, not a re-evolution.
 *
 * `retimeSchedule` bounds each step by the maximum end of its real
 * precedence predecessors (`precedenceEdges`) — the exact `max(predecessor
 * ends)` rule `decodeSSGS` uses (`genetic.ts`). This is what preserves the
 * GA's parallelism: an independent step packs into another step's passive
 * window (the cook is free during passive time — `resources.ts`) instead of
 * waiting for its full end. With no actual completions, walking the GA's
 * `schedule.order` under this rule reproduces `generateSchedule`'s start
 * times exactly, so a check-off never reshuffles the clock-ordered view.
 *
 * A PRIOR version bounded each step by the *previous activity-list step's*
 * end instead of its DAG predecessors' — which serialized everything
 * (collapsing the passive-window packing) and made the first check-off snap
 * the schedule from interleaved clock order to topological order.
 */
import {
  emptyResourceTimeline,
  isFeasibleAt,
  nextCandidateTime,
  occupyResources,
  type ResourceCapacityConfig,
} from "./resources";
import type {
  ResourceTimeline,
  Schedule,
  SchedulerConfig,
  StepInstance,
  WeekGraphEdge,
} from "./types";

/** Shallow-clone a `ResourceTimeline` so `retimeSchedule` never mutates the
 * caller's `resourceModel` object in place. */
function cloneTimeline(timeline: ResourceTimeline): ResourceTimeline {
  const empty = emptyResourceTimeline();
  return {
    cookBusy: [...timeline.cookBusy],
    ovenUsage: [...timeline.ovenUsage],
    activeBurners: [...timeline.activeBurners],
    singletonAppliances: Object.fromEntries(
      Object.keys(empty.singletonAppliances).map((key) => [
        key,
        [...(timeline.singletonAppliances[key as keyof typeof timeline.singletonAppliances] ?? [])],
      ])
    ) as ResourceTimeline["singletonAppliances"],
  };
}

/**
 * Re-time `fixedOrder` given `actualCompletions` (StepInstance.id -> actual
 * elapsed minutes for steps the cook has already checked off), a starting
 * `resourceModel` timeline (the occupancy already committed before this
 * recompute — an empty timeline for a from-scratch schedule), and the
 * week-graph's `precedenceEdges` (producer -> consumer) so each step is
 * bounded by its REAL predecessors, not the previous activity-list step.
 *
 * Walks `fixedOrder` exactly once, in order, and never reorders it. Each step
 * is bounded by max end of its DAG predecessors (0 if none), then placed at
 * the earliest feasible instant at or after that bound via the same
 * `isFeasibleAt`/`occupyResources`/`nextCandidateTime` model the GA's SSGS
 * decode uses (`resources.ts`) — checked-off and not-yet-started steps run the
 * identical placement search, so a checked step lands exactly where the decode
 * put it. The only difference is duration: a checked-off step's estimate is
 * replaced by its real elapsed time, split so its passive tail (cook-free)
 * absorbs any overrun — see the loop body — instead of collapsing to
 * all-active (which busied the cook through passive windows and reshuffled).
 *
 * With empty `actualCompletions` this is byte-for-byte `decodeSSGS` over the
 * same order + DAG, so it reproduces `generateSchedule`'s starts. An on-time
 * completion reproduces that step's own footprint too, so nothing else moves;
 * only a genuine overrun pushes its true downstream dependents later — the
 * "clock adapts" behavior D-01a.3 requires, without shoving unrelated steps.
 *
 * `precedenceEdges` defaults to `[]`: with no edges every bound is 0 and the
 * resource model alone orders the steps (correct for a purely cook-bound
 * chain), preserving the original 4-arg call sites/tests.
 */
export function retimeSchedule(
  fixedOrder: StepInstance[],
  actualCompletions: Map<string, number>,
  resourceModel: ResourceTimeline,
  config: SchedulerConfig,
  precedenceEdges: readonly WeekGraphEdge[] = []
): Schedule {
  const timeline = cloneTimeline(resourceModel);
  const capacityConfig: ResourceCapacityConfig = {
    ovenRackSlots: config.oven_rack_slots,
    burnerCount: config.burner_count,
  };

  // Predecessors by consumer id: edge.to depends on edge.from (same shape as
  // decodeSSGS's graphIndex.predecessors).
  const predecessorsById = new Map<string, string[]>();
  for (const edge of precedenceEdges) {
    const list = predecessorsById.get(edge.to) ?? [];
    list.push(edge.from);
    predecessorsById.set(edge.to, list);
  }

  const starts = new Map<string, number>();
  const ends = new Map<string, number>();

  for (const instance of fixedOrder) {
    // Bound = latest end among this step's DAG predecessors (all placed
    // earlier, since fixedOrder is topological), 0 if it has none.
    const predecessorBound = (predecessorsById.get(instance.id) ?? []).reduce(
      (bound, predId) => Math.max(bound, ends.get(predId) ?? 0),
      0
    );
    const actualElapsed = actualCompletions.get(instance.id);

    // Effective footprint. A checked-off step's real elapsed time replaces its
    // estimate, but must NOT collapse to all-active: a step with a passive
    // phase (bake, smoke) leaves the cook FREE during that phase, so other
    // work still packs into it. Modeling a completed passive step as all-active
    // busied the cook through its whole passive window and shoved every packed
    // step later — the first-check-off reshuffle. So:
    //   - a step with a passive phase keeps its (estimated) active window; any
    //     overrun is absorbed by the passive tail (cook stays free there);
    //   - a pure hands-on step (no passive phase) counts the whole elapsed as
    //     active (the cook really was busy the entire time).
    // On-time completions therefore reproduce the estimate's footprint exactly,
    // so nothing else moves; only a genuine overrun shifts true dependents.
    // The step still runs the same feasibility search as an unstarted one, so
    // its placement matches the GA decode.
    let effStep = instance.step;
    if (actualElapsed !== undefined) {
      const estActive = instance.step.active_minutes ?? 0;
      const estPassive = instance.step.passive_minutes ?? 0;
      const activeOcc =
        estPassive > 0 ? Math.min(estActive, actualElapsed) : actualElapsed;
      effStep = {
        ...instance.step,
        active_minutes: activeOcc,
        passive_minutes: Math.max(0, actualElapsed - activeOcc),
      };
    }

    let candidate = predecessorBound;
    while (!isFeasibleAt(candidate, effStep, timeline, capacityConfig)) {
      candidate = nextCandidateTime(candidate, timeline);
    }
    const active = effStep.active_minutes ?? 0;
    const passive = effStep.passive_minutes ?? 0;
    const end = candidate + active + passive;

    starts.set(instance.id, candidate);
    ends.set(instance.id, end);
    occupyResources(timeline, effStep, candidate, end);
  }

  return { order: fixedOrder, starts, ends };
}
