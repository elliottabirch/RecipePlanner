/**
 * Shopping-line -> per-meal-node mapping.
 *
 * The aggregation output (`AggregatedProduct.sources` / `AggregatedFlowProduct.mealSources`)
 * carries only recipe-name strings — no back-link to the planned meal or the
 * underlying `recipe_product_node`. The swap dialog needs that back-link (phase
 * doc item 9), so this module re-derives it from `plannedMeals` x meal-keyed
 * `recipeData` — data already loaded client-side by Outputs.tsx.
 *
 * Two planned meals of the SAME recipe share `original_node` identity (the
 * node id is a property of the recipe graph) but must resolve to two distinct
 * swap targets, keyed by `plannedMealId` (SHOP-03 / phase doc item 9
 * acceptance). A product used via two nodes within ONE meal likewise fans out
 * to two targets for that meal.
 *
 * Pure module — no React import, no PocketBase import.
 */
import type { PlannedMealWithRecipe, RecipeGraphData } from "./aggregation";

export interface SwapTarget {
  plannedMealId: string;
  recipeName: string;
  /** recipe_product_node ID — what meal_variant_overrides.original_node needs. */
  nodeId: string;
  quantity?: number;
  unit?: string;
}

/**
 * Returns one SwapTarget per matching recipe_product_node across all planned
 * meals. A product used in no planned meal yields an empty array.
 */
export function getMealNodeTargetsForProduct(
  productId: string,
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): SwapTarget[] {
  const targets: SwapTarget[] = [];

  for (const meal of plannedMeals) {
    const data = recipeData.get(meal.id);
    if (!data) continue;

    for (const node of data.productNodes) {
      if (node.expand?.product?.id === productId) {
        targets.push({
          plannedMealId: meal.id,
          recipeName: data.recipe.name,
          nodeId: node.id,
          quantity: node.quantity,
          unit: node.unit,
        });
      }
    }
  }

  return targets;
}
