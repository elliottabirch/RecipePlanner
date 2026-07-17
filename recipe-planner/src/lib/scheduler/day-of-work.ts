/**
 * Day-of work collector (quick task 260716-u4p). Cook mode's "All steps
 * complete!" message (`CookMode.tsx:704-712`) only ever meant "every
 * prep-day step in `weekGraph` has been checked off" — it said nothing
 * about `just_in_time` steps, which never enter `weekGraph` in the first
 * place (`week-graph.ts:158` drops them before scheduling). Reaching that
 * message with real day-of cooking still ahead used to render an
 * affirmative, incorrect "complete" claim; this module is what lets cook
 * mode name that remaining work instead of asserting it doesn't exist.
 *
 * `collectDayOfWork` is the DELIBERATE COMPLEMENT of the exclusion at
 * `week-graph.ts:158` (`step.timing === Timing.JustInTime`). Read the two
 * together — if one changes, the other must change with it, or a step can
 * fall into the gap between them (dropped from the week graph AND never
 * reported here): invisible on every surface.
 */
import { Timing, type RecipeStep } from "../types";
import type { MealKeyedRecipeData } from "../aggregation/types";

export interface DayOfMeal {
  plannedMealId: string;
  recipeName: string;
  steps: RecipeStep[];
}

/**
 * Walk `mealData` in iteration order (the same order `buildWeekGraph`
 * itself iterates in — see week-graph.ts pass (1)), so output is
 * deterministic without a sort. One `DayOfMeal` per PLANNED MEAL (not per
 * recipe): the same recipe planned twice this week is two separate
 * day-of cooks, keyed on `plannedMealId`, mirroring `buildWeekGraph`'s own
 * per-instance node ids.
 */
export function collectDayOfWork(mealData: MealKeyedRecipeData): DayOfMeal[] {
  const result: DayOfMeal[] = [];

  for (const [plannedMealId, recipeData] of mealData) {
    // Predicate on `step.timing === Timing.JustInTime` and NOTHING else.
    //
    // Deliberately NOT `isJustInTimeStep` (aggregation/utils/step-utils.ts)
    // — that helper ALSO requires `step_type === StepType.Assembly`, which
    // recreates the exact hole `week-graph.ts:158` doesn't have: a `prep`
    // step tagged `just_in_time` would be excluded from the week graph
    // (which only checks `timing`) but then never reported here either (if
    // this predicate required Assembly too) — invisible on BOTH surfaces.
    // Prod has zero such steps today (verified 2026-07-16: all 17 tagged
    // `prep` steps are `batch`), so this is latent, not live — but this
    // module's whole job is to be the week-graph's exact complement, and
    // that only holds if it never adds a condition the exclusion doesn't
    // have. Do not "simplify" this to reuse `isJustInTimeStep`.
    const steps = recipeData.steps.filter(
      (step) => step.timing === Timing.JustInTime
    );
    if (steps.length === 0) continue;

    result.push({
      plannedMealId,
      recipeName: recipeData.recipe.name,
      steps,
    });
  }

  return result;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One-line summary for the cook-mode "prep day complete" state, e.g.:
 * "4 meals still need day-of cooking: Harissa Cod with Chickpeas (1 step),
 * Mushroom Bourguignon (Simple) (2 steps), salad and salmon (2 steps),
 * Creamy Tomato Soup (1 step)"
 *
 * `null` for an empty list — the genuinely-complete case, where the
 * existing "All steps complete!" wording stays true and unchanged.
 */
export function formatDayOfSummary(meals: DayOfMeal[]): string | null {
  if (meals.length === 0) return null;

  const perMeal = meals
    .map((meal) => `${meal.recipeName} (${pluralize(meal.steps.length, "step")})`)
    .join(", ");

  return `${pluralize(meals.length, "meal")} still need day-of cooking: ${perMeal}`;
}
