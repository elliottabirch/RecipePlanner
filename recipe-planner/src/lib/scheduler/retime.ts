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
 * Walks `fixedOrder` exactly once, in order, and never reorders it. Each
 * step's precedence bound = max end of its DAG predecessors (0 if none):
 *  - **Checked-off steps** (present in `actualCompletions`): the real
 *    elapsed time replaces the GA's estimate. Placed at the precedence bound,
 *    occupying the resource model for its actual duration — no feasibility
 *    search, since it already happened.
 *  - **Not-yet-started steps**: placed at the earliest feasible instant at
 *    or after the precedence bound, using the same
 *    `isFeasibleAt`/`occupyResources`/`nextCandidateTime` resource model the
 *    GA's SSGS decode uses (`resources.ts`) — no duplicate constraint logic.
 *
 * With empty `actualCompletions` this is byte-for-byte `decodeSSGS` over the
 * same order + DAG, so it reproduces `generateSchedule`'s starts. A late
 * actual completion pushes only its true downstream dependents later — the
 * "clock adapts" behavior D-01a.3 requires — instead of shoving every
 * later-listed step.
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

    if (actualElapsed !== undefined) {
      // Already checked off: the real elapsed time replaces the estimate.
      // No feasibility search — it already happened in reality. Model the
      // full real duration as the step's "active" occupancy so the
      // implicit singleton cook is correctly marked busy for exactly as
      // long as the cook actually spent on it.
      const start = predecessorBound;
      const end = start + actualElapsed;
      const actualStep = {
        active_minutes: actualElapsed,
        passive_minutes: 0,
        resource: instance.step.resource,
        oven_temp_f: instance.step.oven_temp_f,
        rack_slots: instance.step.rack_slots,
      };
      starts.set(instance.id, start);
      ends.set(instance.id, end);
      occupyResources(timeline, actualStep, start, end);
      continue;
    }

    // Not yet started: use the estimate and the standard resource-feasibility
    // search (same model the GA's SSGS decode uses).
    let candidate = predecessorBound;
    while (!isFeasibleAt(candidate, instance.step, timeline, capacityConfig)) {
      candidate = nextCandidateTime(candidate, timeline);
    }
    const active = instance.step.active_minutes ?? 0;
    const passive = instance.step.passive_minutes ?? 0;
    const end = candidate + active + passive;

    starts.set(instance.id, candidate);
    ends.set(instance.id, end);
    occupyResources(timeline, instance.step, candidate, end);
  }

  return { order: fixedOrder, starts, ends };
}
