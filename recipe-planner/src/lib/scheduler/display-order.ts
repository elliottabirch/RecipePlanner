/**
 * Frozen display-order helpers for cook mode's rendered card sequence
 * (PREP-04, D-01a.3, 260717-25d). `retimeSchedule` recomputes `Schedule`'s
 * `starts`/`ends` on every check-off, but the RENDERED list must not — a
 * genuine overrun still shifts times without permitting the cards a cook has
 * already read to swap positions. This module makes "sort once, at
 * generation, never on retime" a pure, testable operation.
 *
 * Deliberately React-free so it is unit-testable in isolation (see
 * `display-order.test.ts`) and reusable from `CookMode.tsx` without any hook
 * plumbing — the same reason `readiness.ts` (`readiness.ts:11-14`) is
 * extracted this way. `vitest.config.ts` is `environment: "node"` with no
 * `.test.tsx` support and no jsdom/testing-library in the project — this is
 * how the shuffle regression gets a real automated test without standing up
 * any component-test infrastructure.
 *
 * Two functions, two moments:
 *  - `freezeDisplayOrder` runs ONCE, at schedule generation (and at the one
 *    real thaw, an explicit regenerate) — it is the exact `orderedByTime`
 *    sort body that already existed, moved verbatim, returning ids instead
 *    of instances (a frozen list is an ORDERING, not a snapshot of the step
 *    data itself).
 *  - `applyDisplayOrder` runs on every render, sorting the CURRENT
 *    `schedule.order` by each instance's index in the frozen id list —
 *    `schedule.starts` is not an input to this sort at all. That is the
 *    entire fix: the live starts still drive the displayed TIMES (callers
 *    keep reading `schedule.starts` directly for that), but they no longer
 *    drive the SEQUENCE.
 */
import type { Schedule, StepInstance } from "./types";

/**
 * Sort a copy of `schedule.order` by `schedule.starts`, tie-broken by
 * activity-list index for a stable, deterministic result — the same sort
 * `orderedByTime` has always used, moved here so it runs exactly once per
 * generation instead of on every render. Do NOT change the sort itself: it
 * exists because `schedule.order` is topological (a post-smoke assembly can
 * be listed early though its clock time is 20h out), and reproducing that
 * topological order is exactly the bug this corrects. Returns step instance
 * ids, not instances — this is an ordering to be replayed against whatever
 * `schedule.order` looks like later, not a snapshot of the steps themselves.
 */
export function freezeDisplayOrder(schedule: Schedule): string[] {
  const orderIndex = new Map(
    schedule.order.map((inst, i) => [inst.id, i] as const)
  );
  return [...schedule.order]
    .sort((a, b) => {
      const sa = schedule.starts.get(a.id) ?? 0;
      const sb = schedule.starts.get(b.id) ?? 0;
      return (
        sa - sb || (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
      );
    })
    .map((inst) => inst.id);
}

/**
 * Sort `schedule.order` by each instance's index in `frozenIds` — NEVER by
 * `schedule.starts`. This is what lets a retime move the displayed times
 * (the cards keep reading `schedule.starts` for those) without ever
 * re-sorting the sequence a cook is already following.
 *
 * An id present in `schedule.order` but absent from `frozenIds` cannot occur
 * without a regenerate (the week graph doesn't refresh mid-session), but is
 * handled deterministically anyway: it sorts to the END, tie-broken by
 * activity-list index, and is NEVER dropped. Appending is deterministic and
 * visible — new work shows up at the end where a cook will find it — whereas
 * dropping it would hide a real step, and re-sorting the whole list around a
 * single unknown id would reintroduce the exact permutation this function
 * exists to prevent. Degrade one step, never the list.
 */
export function applyDisplayOrder(
  schedule: Schedule,
  frozenIds: readonly string[]
): StepInstance[] {
  const activityIndex = new Map(
    schedule.order.map((inst, i) => [inst.id, i] as const)
  );
  const frozenIndex = new Map(frozenIds.map((id, i) => [id, i] as const));

  return [...schedule.order].sort((a, b) => {
    const fa = frozenIndex.get(a.id);
    const fb = frozenIndex.get(b.id);
    if (fa !== undefined && fb !== undefined) return fa - fb;
    if (fa !== undefined) return -1; // a is known, b is unknown -> a first
    if (fb !== undefined) return 1; // b is known, a is unknown -> b first
    // Both unknown (should not happen outside a regenerate) — fall back to
    // activity-list index for a stable, deterministic result.
    return (
      (activityIndex.get(a.id) ?? 0) - (activityIndex.get(b.id) ?? 0)
    );
  });
}
