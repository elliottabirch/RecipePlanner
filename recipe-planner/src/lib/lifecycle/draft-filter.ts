/**
 * Draft-exclusion filter builder (D-04, IMP-01). The single correctness-critical
 * guard keeping unpublished recipes out of meal planning.
 *
 * FAIL-OPEN by design: the filter excludes only rows whose status is exactly
 * "draft" and KEEPS rows whose status is unset/empty. Existing recipes read
 * `status == ""` (an un-set PocketBase select returns "", Pitfall 1); the
 * fail-closed `status = "published"` form would silently vanish every such row
 * from planning. This module therefore emits ONLY the not-equals-draft form and
 * NEVER the equals-published form (threat T-06-03a).
 *
 * Consumed by `lib/api.ts` getAll's `filter` option at the two planning call
 * sites (WeekWizard, WeeklyPlans — Plan 05).
 */

/**
 * The PocketBase filter string excluding draft recipes while keeping unset
 * status plannable. Pass directly as `getAll(collection, { filter })`.
 */
export const DRAFT_EXCLUDING_FILTER = 'status != "draft"';

/** Returns the fail-open draft-exclusion filter string. */
export function buildDraftExcludingFilter(): string {
  return DRAFT_EXCLUDING_FILTER;
}

/**
 * Pure predicate mirroring the filter's semantics for unit-testing without a
 * live DB. A recipe is plannable unless its status is exactly "draft" — unset,
 * empty, "published", and any unknown value are all plannable (fail-open).
 */
export function isPlannable(status?: string): boolean {
  return status !== "draft";
}
