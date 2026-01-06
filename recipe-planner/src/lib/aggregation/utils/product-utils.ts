import { ProductType, StorageLocation, type Product } from "../../types";

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
  mealCount: number
): MealSource {
  return {
    recipeName,
    quantity,
    count: mealCount,
  };
}

/**
 * Add or update a meal source in the sources array
 * Mutates the sources array
 */
export function addMealSource(
  sources: MealSource[],
  recipeName: string,
  quantity: number,
  mealCount: number
): void {
  const existing = sources.find((s) => s.recipeName === recipeName);
  if (existing) {
    existing.count += mealCount;
    existing.quantity += quantity;
  } else {
    sources.push(createMealSource(recipeName, quantity, mealCount));
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
