import type { PlannedMeal, TemplateSlot, WeeklyPlan } from "../types";

/**
 * Per-recipe last-planned date (ISO `start_date` string), or absent from the
 * map if the recipe has never appeared in any *dated* plan. Undated plans
 * (pre-backfill, or if start_date is somehow null) are excluded from the
 * computation — they contribute no signal, they don't count as "recent".
 *
 * PocketBase `date`-type fields serialize as ISO 8601 strings; lexicographic
 * string comparison is chronologically correct for this format without
 * parsing to `Date` objects (04-RESEARCH.md Pattern 5).
 */
export function computeLastPlannedDates(
  plans: WeeklyPlan[],
  plannedMeals: PlannedMeal[]
): Map<string, string> {
  const planDateById = new Map(
    plans
      .filter((p) => p.start_date)
      .map((p) => [p.id, p.start_date as string])
  );

  const lastPlanned = new Map<string, string>();
  for (const meal of plannedMeals) {
    const date = planDateById.get(meal.weekly_plan);
    if (!date) continue;
    const existing = lastPlanned.get(meal.recipe);
    if (!existing || date > existing) {
      lastPlanned.set(meal.recipe, date);
    }
  }
  return lastPlanned;
}

/**
 * AC#6: never-planned recipes sort first (most stale), then ascending
 * last-planned date (oldest first), ties (including the never-planned group
 * among themselves) broken by name asc then id asc — deterministic and
 * order-independent across repeated calls/renders.
 *
 * Never mutates the input array (copies before sorting).
 */
export function orderPoolByLRU<T extends { id: string; name: string }>(
  recipes: T[],
  lastPlanned: Map<string, string>
): T[] {
  return [...recipes].sort((a, b) => {
    const dateA = lastPlanned.get(a.id);
    const dateB = lastPlanned.get(b.id);
    if (!dateA && !dateB) return tieBreak(a, b);
    if (!dateA) return -1;
    if (!dateB) return 1;
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return tieBreak(a, b);
  });
}

function tieBreak(
  a: { id: string; name: string },
  b: { id: string; name: string }
): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * WEEK-03 tag-pool eligibility: a recipe is in a slot's pool if its tags
 * intersect the slot's `pool_tags` (match-any).
 */
export function poolForSlot<T extends { id: string }>(
  slot: Pick<TemplateSlot, "pool_tags">,
  recipes: T[],
  recipeTags: Map<string, string[]>
): T[] {
  const poolTagIds = new Set(slot.pool_tags);
  return recipes.filter((recipe) =>
    (recipeTags.get(recipe.id) || []).some((tagId) => poolTagIds.has(tagId))
  );
}
