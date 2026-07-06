import { ProductType, StorageLocation, type Product } from "../../types";
import {
  canConvert,
  convert,
  getDimension,
  chooseDisplayUnit,
  type Unit,
} from "../../units";

// ============================================================================
// Product Processing Utilities
// ============================================================================

/**
 * Interface for meal source tracking
 */
export interface MealSource {
  recipeName: string;
  quantity: number;
  count: number;
  unit: string;
}

/**
 * Result of attempting to merge two quantities of the same product line.
 */
export interface QuantityMergeResult {
  quantity: number;
  unit: string;
}

/**
 * Attempt to merge an incoming quantity into an existing line's quantity.
 *
 * Returns `null` when the two units are in different dimensions (the caller
 * must split into a separate line rather than merge). Otherwise returns the
 * new cumulative quantity/unit chosen per D-10 (`canonicalUnit` when set,
 * else the deterministic largest-unit->=1 fallback) so the result is
 * independent of merge order — unit conversion is linear, so the cumulative
 * total is the same physical quantity no matter which order the additions
 * arrive in.
 */
export function mergeQuantities(
  existingQty: number,
  existingUnit: string,
  addQty: number,
  addUnit: string,
  canonicalUnit?: Unit
): QuantityMergeResult | null {
  const existing = existingUnit as Unit;
  const incoming = addUnit as Unit;
  if (!canConvert(existing, incoming)) return null;

  const convertedAdd = convert(addQty, incoming, existing);
  const cumulative = existingQty + (convertedAdd ?? 0);
  const dimension = getDimension(existing);
  const display = chooseDisplayUnit(
    dimension,
    canonicalUnit ?? null,
    cumulative,
    existing
  );
  return { quantity: display.quantity, unit: display.unit };
}

/**
 * Calculate total quantity for a product across all meals
 */
export function calculateProductQuantity(
  quantity: number,
  mealCount: number
): number {
  return quantity * mealCount;
}

/**
 * Create a unique key for a product in the flow graph
 * Stored products get unique keys per instance, others aggregate by ID
 */
export function createProductKey(
  productId: string,
  productType: ProductType,
  mealDestination?: string,
  plannedMealId?: string,
  instanceIndex?: number
): string {
  if (productType === ProductType.Stored && mealDestination && plannedMealId) {
    return `${productId}-${mealDestination}-${plannedMealId}-${
      instanceIndex || 0
    }`;
  }
  return productId;
}

/**
 * Check if a product should be instanced (creates individual entries) or aggregated
 */
export function shouldCreateInstances(productType: ProductType): boolean {
  return productType === ProductType.Stored;
}

/**
 * Extract meal destination from annotated product name
 * e.g., "Chicken (Monday Dinner) #1" → { cleanName: "Chicken", destination: "Monday Dinner" }
 */
export function extractMealDestination(productName: string): {
  cleanName: string;
  destination?: string;
} {
  const match = productName.match(/\(([^)]+)\)\s*#?\d*$/);
  if (match) {
    return {
      cleanName: productName.replace(/\s*\([^)]+\)\s*#?\d*$/, ""),
      destination: match[1],
    };
  }
  return { cleanName: productName };
}

/**
 * Create a meal source entry for tracking
 */
export function createMealSource(
  recipeName: string,
  quantity: number,
  mealCount: number,
  unit: string
): MealSource {
  return {
    recipeName,
    quantity,
    count: mealCount,
    unit,
  };
}

/**
 * Add or update a meal source in the sources array
 * Mutates the sources array
 *
 * Uses the same convert-or-split discipline as the line-level merge: two
 * entries for the same recipe are only combined when their units share a
 * dimension (converting into the running entry's display unit); a
 * cross-dimension collision should never occur here in practice (the caller
 * only merges meal sources after the top-level line merge already confirmed
 * the dimensions match), but if it ever does, entries are kept distinct
 * rather than silently summed.
 */
export function addMealSource(
  sources: MealSource[],
  recipeName: string,
  quantity: number,
  mealCount: number,
  unit: string,
  canonicalUnit?: Unit
): void {
  const existing = sources.find((s) => s.recipeName === recipeName);
  if (existing) {
    const merged = mergeQuantities(
      existing.quantity,
      existing.unit,
      quantity,
      unit,
      canonicalUnit
    );
    if (merged) {
      existing.quantity = merged.quantity;
      existing.unit = merged.unit;
      existing.count += mealCount;
    } else {
      sources.push(createMealSource(recipeName, quantity, mealCount, unit));
    }
  } else {
    sources.push(createMealSource(recipeName, quantity, mealCount, unit));
  }
}

/**
 * Determine storage location for a product based on its type and properties
 */
export function determineStorageLocation(
  product: Product
): StorageLocation | "pantry" {
  if (product.type === ProductType.Stored) {
    return product.storage_location || StorageLocation.Fridge;
  } else if (product.type === ProductType.Raw && product.pantry) {
    return "pantry";
  } else if (product.type === ProductType.Raw) {
    return StorageLocation.Fridge; // Fresh raw ingredients assumed in fridge
  }
  return StorageLocation.Fridge; // Default
}
