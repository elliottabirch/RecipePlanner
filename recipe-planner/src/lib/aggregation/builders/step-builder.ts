import type { StepType } from "../../types";
import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
  AggregatedFlowStep,
  ExpandedProductNode,
} from "../types.js";
import {
  createStepSignature,
  shouldIncludeInBatchPrep,
  createStepSource,
  addStepSource,
} from "../utils/step-utils";

// ============================================================================
// Step Aggregation Builder Functions
// ============================================================================

/**
 * Extract input products for a step
 */
export function extractStepInputs(
  stepId: string,
  recipeData: RecipeGraphData,
  mealCount: number
): {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}[] {
  const inputEdges = recipeData.productToStepEdges.filter(
    (e) => e.target === stepId
  );

  return inputEdges
    .map((edge) => {
      const node: ExpandedProductNode | undefined =
        recipeData.productNodes.find((n) => n.id === edge.source);
      const product = node?.expand?.product;
      if (!product) return null;

      return {
        productId: product.id,
        productName: product.name,
        quantity: (node.quantity || 0) * mealCount,
        unit: node.unit || "",
      };
    })
    .filter((input): input is NonNullable<typeof input> => input !== null);
}

/**
 * Extract output products for a step
 */
export function extractStepOutputs(
  stepId: string,
  recipeData: RecipeGraphData,
  mealCount: number
): {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}[] {
  const outputEdges = recipeData.stepToProductEdges.filter(
    (e) => e.source === stepId
  );

  return outputEdges
    .map((edge) => {
      const node: ExpandedProductNode | undefined =
        recipeData.productNodes.find((n) => n.id === edge.target);
      const product = node?.expand?.product;
      if (!product) return null;

      return {
        productId: product.id,
        productName: product.name,
        quantity: (node.quantity || 0) * mealCount,
        unit: node.unit || "",
      };
    })
    .filter((output): output is NonNullable<typeof output> => output !== null);
}

/**
 * Add or merge a step into the steps map
 * Mutates the steps map
 */
export function addOrMergeStep(
  steps: Map<string, AggregatedFlowStep>,
  stepId: string,
  stepName: string,
  stepType: StepType,
  recipeName: string,
  mealCount: number,
  inputs: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }[],
  outputs: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }[]
): void {
  const existing = steps.get(stepId);

  if (existing) {
    // Merge with existing
    if (!existing.stepNames.includes(stepName)) {
      existing.stepNames.push(stepName);
    }
    addStepSource(existing.recipeSources, recipeName, stepName, mealCount);

    // Merge inputs
    inputs.forEach((input) => {
      const existingInput = existing.inputs.find(
        (i) => i.productId === input.productId
      );
      if (existingInput) {
        existingInput.quantity += input.quantity;
      } else {
        existing.inputs.push({ ...input });
      }
    });

    // Merge outputs
    outputs.forEach((output) => {
      const existingOutput = existing.outputs.find(
        (o) => o.productId === output.productId
      );
      if (existingOutput) {
        existingOutput.quantity += output.quantity;
      } else {
        existing.outputs.push({ ...output });
      }
    });
  } else {
    // Create new step
    steps.set(stepId, {
      stepId,
      stepNames: [stepName],
      stepType,
      recipeSources: [createStepSource(recipeName, stepName, mealCount)],
      inputs: inputs.map((i) => ({ ...i })),
      outputs: outputs.map((o) => ({ ...o })),
    });
  }
}

/**
 * Process all steps from a single recipe/meal combination
 * Mutates the steps map
 */
export function processRecipeSteps(
  recipeData: RecipeGraphData,
  plannedMeal: PlannedMealWithRecipe,
  steps: Map<string, AggregatedFlowStep>
): void {
  const recipeName = recipeData.recipe.name;
  const mealCount = plannedMeal.quantity || 1;

  recipeData.steps.forEach((step) => {
    if (!shouldIncludeInBatchPrep(step)) return;

    const inputs = extractStepInputs(step.id, recipeData, mealCount);
    const outputs = extractStepOutputs(step.id, recipeData, mealCount);

    const stepId = createStepSignature(
      inputs.map((i) => i.productId),
      outputs.map((o) => o.productId)
    );

    addOrMergeStep(
      steps,
      stepId,
      step.name,
      step.step_type,
      recipeName,
      mealCount,
      inputs,
      outputs
    );
  });
}
