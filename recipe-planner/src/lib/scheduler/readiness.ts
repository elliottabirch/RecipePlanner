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
 * Passive-window awareness (2026-07-17): check-off is overloaded — for a step
 * with passive time it means "the active part is done; the timer is now
 * running", not "done". A producer that has been checked off but whose
 * simmer/bake is still counting down does NOT yet satisfy its dependents.
 * Callers pass `runningPassiveSet` — the ids of checked-off producers whose
 * passive window has not yet elapsed (CookMode derives this from `getCountdown`
 * against the live wall clock). Such a producer keeps the dependent "waiting"
 * and is reported separately in `simmering` so the chip can read
 * "12:34 left on the simmer" rather than a bare "ready". Default-empty so every
 * existing caller/test keeps its pre-passive behaviour unchanged.
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
  /**
   * StepInstance.id of every upstream producer that IS checked off but whose
   * passive window is still running (checked ∩ runningPassiveSet). These also
   * block readiness, but are surfaced distinctly from `waitingOn` so the chip
   * can show a remaining-time label instead of "waiting on: …".
   */
  simmering: string[];
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function deriveReadiness(
  stepInstanceId: string,
  weekGraph: WeekGraph,
  checkedSet: ReadonlySet<string>,
  runningPassiveSet: ReadonlySet<string> = EMPTY_SET
): ReadinessResult {
  const producerIds = weekGraph.edges
    .filter((edge) => edge.to === stepInstanceId)
    .map((edge) => edge.from);

  const waitingOn = producerIds.filter((id) => !checkedSet.has(id));
  const simmering = producerIds.filter(
    (id) => checkedSet.has(id) && runningPassiveSet.has(id)
  );

  return {
    state:
      waitingOn.length === 0 && simmering.length === 0 ? "ready" : "waiting",
    waitingOn,
    simmering,
  };
}
