import type { Day, MealSlot } from "../../types";
import type {
  PullListMeal,
  AggregatedStep,
  ProductFlowGraphData,
} from "../types.js";
import { DAY_ORDER, SLOT_ORDER } from "./constants";

// ============================================================================
// Sorting Utilities
// ============================================================================

/**
 * Compare two days for sorting
 */
export function compareDays(a: Day, b: Day): number {
  return DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b);
}

/**
 * Compare two meal slots for sorting
 */
export function compareSlots(a: MealSlot, b: MealSlot): number {
  return SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b);
}

/**
 * Sort pull lists by day and slot
 */
export function sortPullLists(lists: PullListMeal[]): PullListMeal[] {
  return [...lists].sort((a, b) => {
    const dayDiff = compareDays(a.day, b.day);
    if (dayDiff !== 0) return dayDiff;
    return compareSlots(a.slot, b.slot);
  });
}

/**
 * Check if a step has stored product outputs
 */
export function stepHasStoredOutput(
  stepId: string,
  flowGraph: ProductFlowGraphData
): boolean {
  const step = flowGraph.steps.get(stepId);
  if (!step) return false;

  return step.outputs.some((output) => {
    const product = flowGraph.products.get(output.productId);
    return product?.productType === "stored";
  });
}

/**
 * Sort prep steps by type, output type, and input name
 * 1. Prep steps before assembly steps
 * 2. Non-stored outputs before stored outputs
 * 3. Alphabetically by first input name
 */
export function sortPrepSteps(
  steps: AggregatedStep[],
  flowGraph: ProductFlowGraphData
): AggregatedStep[] {
  return [...steps].sort((a, b) => {
    // Primary: step type (prep before assembly)
    if (a.stepType !== b.stepType) {
      return a.stepType === "prep" ? -1 : 1;
    }

    // Secondary: output product type (non-stored before stored)
    const aHasStored = stepHasStoredOutput(a.stepId, flowGraph);
    const bHasStored = stepHasStoredOutput(b.stepId, flowGraph);
    if (aHasStored !== bHasStored) {
      return aHasStored ? 1 : -1;
    }

    // Tertiary: first input name (alphabetically)
    const aFirstInput = a.inputs[0]?.productName || "";
    const bFirstInput = b.inputs[0]?.productName || "";
    return aFirstInput.localeCompare(bFirstInput);
  });
}
