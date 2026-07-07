import type { StepType, ProductType, StorageLocation } from "../../types";
import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
  AggregatedFlowStep,
  ExpandedProductNode,
} from "../types.js";
import { canConvert, scaleQuantity, type Unit } from "../../units";
import {
  createStepSignature,
  shouldIncludeInBatchPrep,
  createStepSource,
  addStepSource,
} from "../utils/step-utils";
import { determineStorageLocation, mergeQuantities } from "../utils/product-utils";

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
  productType: ProductType;
  storageLocation: StorageLocation | "pantry";
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
        productType: product.type,
        storageLocation: determineStorageLocation(product),
        quantity: scaleQuantity(node.quantity || 0, mealCount, node.unit as Unit),
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
        quantity: scaleQuantity(node.quantity || 0, mealCount, node.unit as Unit),
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
    productType: ProductType;
    storageLocation: StorageLocation | "pantry";
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

    // Merge inputs — convert-or-split (DATA-01): only combine an incoming
    // input into an existing entry for the same product when the units
    // share a dimension; otherwise keep it as a separate entry so a
    // cross-dimension mismatch never produces a false sum.
    inputs.forEach((input) => {
      const existingInput = existing.inputs.find(
        (i) =>
          i.productId === input.productId &&
          canConvert(i.unit as Unit, input.unit as Unit)
      );
      if (existingInput) {
        const merged = mergeQuantities(
          existingInput.quantity,
          existingInput.unit,
          input.quantity,
          input.unit
        );
        if (merged) {
          existingInput.quantity = merged.quantity;
          existingInput.unit = merged.unit;
        }
      } else {
        existing.inputs.push({ ...input });
      }
    });

    // Merge outputs — identical convert-or-split rule as inputs.
    outputs.forEach((output) => {
      const existingOutput = existing.outputs.find(
        (o) =>
          o.productId === output.productId &&
          canConvert(o.unit as Unit, output.unit as Unit)
      );
      if (existingOutput) {
        const merged = mergeQuantities(
          existingOutput.quantity,
          existingOutput.unit,
          output.quantity,
          output.unit
        );
        if (merged) {
          existingOutput.quantity = merged.quantity;
          existingOutput.unit = merged.unit;
        }
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
  steps: Map<string, AggregatedFlowStep>,
  peopleMultiplier: number = 1
): void {
  const recipeName = recipeData.recipe.name;
  const mealCount = (plannedMeal.quantity || 1) * peopleMultiplier;

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
