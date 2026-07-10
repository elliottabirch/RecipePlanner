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
 * Because `retimeSchedule` has no access to the week-graph's precedence
 * edges (by design — it only ever sees the flat, already-precedence-valid
 * `fixedOrder`), precedence is modeled as a simple running clock: each
 * step's earliest candidate start is bounded by the previous step's own
 * computed end. Combined with the implicit singleton "cook" resource (which
 * serializes every step's active window regardless of precedence — see
 * `resources.ts`), this reproduces the same forward-sweep timing an SSGS
 * decode would produce for a linear activity list, without re-deriving the
 * DAG.
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
 * elapsed minutes for steps the cook has already checked off) and a starting
 * `resourceModel` timeline (the occupancy already committed before this
 * recompute — an empty timeline for a from-scratch schedule).
 *
 * Walks `fixedOrder` exactly once, in order, and never reorders it:
 *  - **Checked-off steps** (present in `actualCompletions`): the real
 *    elapsed time replaces the GA's estimate. The step is placed at the
 *    running precedence bound and occupies the resource model for its
 *    actual duration — no feasibility search, since it already happened.
 *  - **Not-yet-started steps**: placed at the earliest feasible instant at
 *    or after the running precedence bound, using the same
 *    `isFeasibleAt`/`occupyResources`/`nextCandidateTime` resource model the
 *    GA's SSGS decode uses (`resources.ts`) — no duplicate constraint logic.
 *
 * A late actual completion (real time > estimate) pushes the running
 * precedence bound later, which shifts every downstream step's start/end by
 * that same delta — exactly the "clock adapts" behavior D-01a.3 requires.
 */
export function retimeSchedule(
  fixedOrder: StepInstance[],
  actualCompletions: Map<string, number>,
  resourceModel: ResourceTimeline,
  config: SchedulerConfig
): Schedule {
  const timeline = cloneTimeline(resourceModel);
  const capacityConfig: ResourceCapacityConfig = {
    ovenRackSlots: config.oven_rack_slots,
    burnerCount: config.burner_count,
  };

  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  let precedenceBound = 0;

  for (const instance of fixedOrder) {
    const actualElapsed = actualCompletions.get(instance.id);

    if (actualElapsed !== undefined) {
      // Already checked off: the real elapsed time replaces the estimate.
      // No feasibility search — it already happened in reality. Model the
      // full real duration as the step's "active" occupancy so the
      // implicit singleton cook is correctly marked busy for exactly as
      // long as the cook actually spent on it.
      const start = precedenceBound;
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
      precedenceBound = end;
      continue;
    }

    // Not yet started: use the estimate and the standard resource-feasibility
    // search (same model the GA's SSGS decode uses).
    let candidate = precedenceBound;
    while (!isFeasibleAt(candidate, instance.step, timeline, capacityConfig)) {
      candidate = nextCandidateTime(candidate, timeline);
    }
    const active = instance.step.active_minutes ?? 0;
    const passive = instance.step.passive_minutes ?? 0;
    const end = candidate + active + passive;

    starts.set(instance.id, candidate);
    ends.set(instance.id, end);
    occupyResources(timeline, instance.step, candidate, end);
    precedenceBound = end;
  }

  return { order: fixedOrder, starts, ends };
}
