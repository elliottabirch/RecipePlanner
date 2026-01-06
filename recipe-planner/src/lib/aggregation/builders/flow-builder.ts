import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
  AggregatedFlowStep,
  ExpandedProductNode,
} from "../types.js";
import {
  createProductKey,
  shouldCreateInstances,
} from "../utils/product-utils";

// ============================================================================
// Flow Connection Builder Functions
// ============================================================================

/**
 * Create product-to-step flow connections for a single step
 * Returns array of flow connections
 */
export function createProductToStepFlows(
  step: AggregatedFlowStep,
  plannedMeal: PlannedMealWithRecipe,
  recipeData: RecipeGraphData,
  mealCount: number
): { productId: string; stepId: string }[] {
  const flows: { productId: string; stepId: string }[] = [];

  step.inputs.forEach((input) => {
    const node: ExpandedProductNode | undefined = recipeData.productNodes.find(
      (n) => n.expand?.product?.id === input.productId
    );
    const product = node?.expand?.product;

    if (!product) return;

    if (shouldCreateInstances(product.type)) {
      // Create flows for all instances
      const instances = (node.quantity || 1) * mealCount;
      for (let i = 0; i < instances; i++) {
        const productKey = createProductKey(
          input.productId,
          product.type,
          node.meal_destination,
          plannedMeal.id,
          i
        );
        flows.push({ productId: productKey, stepId: step.stepId });
      }
    } else {
      // Single aggregated flow
      flows.push({ productId: input.productId, stepId: step.stepId });
    }
  });

  return flows;
}

/**
 * Create step-to-product flow connections for a single step
 * Returns array of flow connections
 */
export function createStepToProductFlows(
  step: AggregatedFlowStep,
  plannedMeal: PlannedMealWithRecipe,
  recipeData: RecipeGraphData,
  mealCount: number
): { stepId: string; productId: string }[] {
  const flows: { stepId: string; productId: string }[] = [];

  step.outputs.forEach((output) => {
    const node: ExpandedProductNode | undefined = recipeData.productNodes.find(
      (n) => n.expand?.product?.id === output.productId
    );
    const product = node?.expand?.product;

    if (!product) return;

    if (shouldCreateInstances(product.type)) {
      // Create flows for all instances
      const instances = (node.quantity || 1) * mealCount;
      for (let i = 0; i < instances; i++) {
        const productKey = createProductKey(
          output.productId,
          product.type,
          node.meal_destination,
          plannedMeal.id,
          i
        );
        flows.push({ stepId: step.stepId, productId: productKey });
      }
    } else {
      // Single aggregated flow
      flows.push({ stepId: step.stepId, productId: output.productId });
    }
  });

  return flows;
}

/**
 * Add unique flows to flow arrays (deduplication)
 * Mutates the existingFlows array
 */
export function addUniqueProductToStepFlows(
  existingFlows: { productId: string; stepId: string }[],
  newFlows: { productId: string; stepId: string }[]
): void {
  newFlows.forEach((flow) => {
    const isDuplicate = existingFlows.some(
      (existing) =>
        existing.productId === flow.productId && existing.stepId === flow.stepId
    );
    if (!isDuplicate) {
      existingFlows.push(flow);
    }
  });
}

/**
 * Add unique flows to flow arrays (deduplication)
 * Mutates the existingFlows array
 */
export function addUniqueStepToProductFlows(
  existingFlows: { stepId: string; productId: string }[],
  newFlows: { stepId: string; productId: string }[]
): void {
  newFlows.forEach((flow) => {
    const isDuplicate = existingFlows.some(
      (existing) =>
        existing.stepId === flow.stepId && existing.productId === flow.productId
    );
    if (!isDuplicate) {
      existingFlows.push(flow);
    }
  });
}
