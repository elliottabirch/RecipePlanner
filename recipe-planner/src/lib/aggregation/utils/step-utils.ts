import { StepType, Timing, type RecipeStep } from "../../types";

// ============================================================================
// Step Processing Utilities
// ============================================================================

/**
 * Interface for step source tracking
 */
export interface StepSource {
  recipeName: string;
  stepName: string;
  count: number;
}

/**
 * Create a signature for a step based on its inputs and outputs
 * Steps with identical signatures can be aggregated
 */
export function createStepSignature(
  inputProductIds: string[],
  outputProductIds: string[]
): string {
  const sortedInputs = [...inputProductIds].sort().join(",");
  const sortedOutputs = [...outputProductIds].sort().join(",");
  return `${sortedInputs}=>${sortedOutputs}`;
}

/**
 * Check if a step should be included in batch prep
 * Includes prep steps and batch assembly steps
 */
export function shouldIncludeInBatchPrep(step: RecipeStep): boolean {
  return (
    step.step_type === StepType.Prep ||
    (step.step_type === StepType.Assembly && step.timing === Timing.Batch)
  );
}

/**
 * Check if a step is just-in-time assembly
 */
export function isJustInTimeStep(step: RecipeStep): boolean {
  return (
    step.step_type === StepType.Assembly && step.timing === Timing.JustInTime
  );
}

/**
 * Create a step source entry for tracking
 */
export function createStepSource(
  recipeName: string,
  stepName: string,
  mealCount: number
): StepSource {
  return {
    recipeName,
    stepName,
    count: mealCount,
  };
}

/**
 * Add or update a step source in the sources array
 * Mutates the sources array
 */
export function addStepSource(
  sources: StepSource[],
  recipeName: string,
  stepName: string,
  mealCount: number
): void {
  const existing = sources.find(
    (s) => s.recipeName === recipeName && s.stepName === stepName
  );
  if (existing) {
    existing.count += mealCount;
  } else {
    sources.push(createStepSource(recipeName, stepName, mealCount));
  }
}
