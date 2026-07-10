/**
 * Connective-recipe detection (todo: connective-recipe-batch-then-consume).
 *
 * When one recipe batch-produces an inventory item (e.g. "Create meatballs" ->
 * `meatballs frozen [inventory]`) and another recipe consumes it, the consumer
 * carries a zero-time "pull from freezer" connector step (e.g. "pull out
 * meatballs": Assembly, 0 active / 0 passive, single `inventory` input ->
 * `stored` output). When BOTH recipes are in the SAME weekly plan the item is
 * made fresh this week, so that pull step is a spurious graph connector, not a
 * real cook-day task.
 *
 * This module is the single source of truth for detecting those steps, shared
 * by the two aggregation paths that surface them:
 *  - `buildWeekGraph` (cook mode) elides the pull node and rewires
 *    producer -> consumer.
 *  - `buildProductFlowGraph` (batch prep + product flow) skips the pull step.
 *
 * It is the inverse of the `missing-pull-step` linter: there we flag a
 * stored/inventory input with NO in-plan producer; here the producer IS present
 * (the input product id is in `collectProducedProductIds`), so the pull is
 * redundant. Keeping both off the same producer-set test keeps them consistent.
 */
import { ProductType, StepType, type RecipeStep } from "../../types";
import type { RecipeGraphData } from "../types";

/**
 * Every product id produced by ANY step across the plan (the target product of
 * a step_to_product edge, in any planned meal). A pull step's inventory input
 * counts as "made in-plan" when its product id is in this set.
 */
export function collectProducedProductIds(
  mealData: Map<string, RecipeGraphData>
): Set<string> {
  const produced = new Set<string>();
  for (const recipeData of mealData.values()) {
    for (const edge of recipeData.stepToProductEdges) {
      const productId = recipeData.productNodes.find(
        (node) => node.id === edge.target
      )?.expand?.product?.id;
      if (productId) produced.add(productId);
    }
  }
  return produced;
}

/**
 * True when `step` is a spurious in-plan pull connector: a zero-time Assembly
 * step whose single input is an `inventory` product that some step in the plan
 * produces (`producedProductIds`). Deliberately strict — a real cook/assembly
 * task takes time and/or has multiple inputs, so it never matches.
 */
export function isSpuriousInPlanPull(
  step: RecipeStep,
  recipeData: RecipeGraphData,
  producedProductIds: ReadonlySet<string>
): boolean {
  if (step.step_type !== StepType.Assembly) return false;
  // PocketBase stores un-set number fields as 0, never null — a real task has
  // a nonzero active or passive time.
  if ((step.active_minutes ?? 0) !== 0 || (step.passive_minutes ?? 0) !== 0) {
    return false;
  }
  const inputEdges = recipeData.productToStepEdges.filter(
    (edge) => edge.target === step.id
  );
  if (inputEdges.length !== 1) return false;
  const inputProduct = recipeData.productNodes.find(
    (node) => node.id === inputEdges[0].source
  )?.expand?.product;
  if (!inputProduct || inputProduct.type !== ProductType.Inventory) return false;
  return producedProductIds.has(inputProduct.id);
}

/**
 * Week-graph `StepInstance.id`s (`${plannedMealId}::${stepId}`) of every
 * spurious in-plan pull connector — consumed by `buildWeekGraph`'s elision pass.
 */
export function collectSpuriousPullInstanceIds(
  mealData: Map<string, RecipeGraphData>,
  producedProductIds: ReadonlySet<string>
): Set<string> {
  const ids = new Set<string>();
  for (const [plannedMealId, recipeData] of mealData) {
    for (const step of recipeData.steps) {
      if (isSpuriousInPlanPull(step, recipeData, producedProductIds)) {
        ids.add(`${plannedMealId}::${step.id}`);
      }
    }
  }
  return ids;
}

/**
 * Raw `RecipeStep.id`s of every spurious in-plan pull connector — consumed by
 * `buildProductFlowGraph`/`processRecipeSteps` to skip them. Step records are
 * globally unique, and spuriousness is plan-global (depends only on the step's
 * input product + `producedProductIds`), so a flat id set is sufficient.
 */
export function collectSpuriousPullStepIds(
  mealData: Map<string, RecipeGraphData>,
  producedProductIds: ReadonlySet<string>
): Set<string> {
  const ids = new Set<string>();
  for (const recipeData of mealData.values()) {
    for (const step of recipeData.steps) {
      if (isSpuriousInPlanPull(step, recipeData, producedProductIds)) {
        ids.add(step.id);
      }
    }
  }
  return ids;
}
