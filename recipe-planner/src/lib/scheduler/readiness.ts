/**
 * Pure readiness-derivation helper for cook mode's assembly-step chip
 * (PREP-04, D-03, 05-UI-SPEC.md Surface 1). Consumes the week-graph's
 * incoming precedence edges (the same `WeekGraph` the GA schedules over,
 * from `week-graph.ts`) plus a checked-off set (`cook_progress`'s checked
 * `StepInstance.id`s, as surfaced by `useCookProgress`) and derives a binary
 * chip state: "waiting" (lists each un-checked upstream producer) or
 * "ready" (every upstream producer has been checked off — AND-semantics,
 * RESEARCH A4: a consumer waits on ALL matching producers, not just one).
 * A step with no upstream producers is ready at t=0 (nothing to wait on).
 *
 * Deliberately React-free and PocketBase-free so it is unit-testable in
 * isolation (see readiness.test.ts) and reusable from CookMode.tsx without
 * any hook plumbing.
 */
import type { WeekGraph } from "./types";

export interface ReadinessResult {
  state: "waiting" | "ready";
  /** StepInstance.id of every upstream producer not yet checked off. */
  waitingOn: string[];
}

export function deriveReadiness(
  stepInstanceId: string,
  weekGraph: WeekGraph,
  checkedSet: ReadonlySet<string>
): ReadinessResult {
  const producerIds = weekGraph.edges
    .filter((edge) => edge.to === stepInstanceId)
    .map((edge) => edge.from);

  const waitingOn = producerIds.filter((id) => !checkedSet.has(id));

  return {
    state: waitingOn.length === 0 ? "ready" : "waiting",
    waitingOn,
  };
}
