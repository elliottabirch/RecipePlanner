import type { ProductType, StorageLocation, MealSlot } from "../../types";
import type {
  AggregatedProduct,
  PlannedMealWithRecipe,
  RecipeGraphData,
  ExpandedProductNode,
} from "../types";
import { STORAGE_LOCATIONS } from "./constants";

// ============================================================================
// Filtering & Grouping Utilities
// ============================================================================

/**
 * Filter products by type
 */
export function filterProductsByType<T extends { productType: ProductType }>(
  products: T[],
  type: ProductType
): T[] {
  return products.filter((p) => p.productType === type);
}

/**
 * Group items by storage location
 */
export function groupByStorageLocation<
  T extends { storageLocation: StorageLocation }
>(items: T[]): Map<StorageLocation, T[]> {
  const groups = new Map<StorageLocation, T[]>();

  STORAGE_LOCATIONS.forEach((location) => {
    const filtered = items.filter((item) => item.storageLocation === location);
    if (filtered.length > 0) {
      groups.set(location, filtered);
    }
  });

  return groups;
}

/**
 * Group items by store and section
 */
export function groupByStoreAndSection(
  items: AggregatedProduct[]
): Map<string, Map<string, AggregatedProduct[]>> {
  const byStore = new Map<string, Map<string, AggregatedProduct[]>>();

  items.forEach((item) => {
    const storeName = item.storeName || "Other";
    const sectionName = item.sectionName || "Other";

    if (!byStore.has(storeName)) {
      byStore.set(storeName, new Map());
    }
    const storeMap = byStore.get(storeName)!;

    if (!storeMap.has(sectionName)) {
      storeMap.set(sectionName, []);
    }
    storeMap.get(sectionName)!.push(item);
  });

  return byStore;
}

/**
 * Check if a recipe has a specific tag
 */
export function recipeHasTag(
  recipeId: string,
  tagId: string,
  recipeTags: Map<string, string[]>
): boolean {
  const tags = recipeTags.get(recipeId) || [];
  return tags.includes(tagId);
}

/**
 * Filter recipes by tag
 */
export function filterRecipesByTag(
  recipeIds: string[],
  tagId: string,
  recipeTags: Map<string, string[]>
): string[] {
  return recipeIds.filter((id) => recipeHasTag(id, tagId, recipeTags));
}

/**
 * Check if a product has original packaging container
 */
export function hasOriginalPackaging(
  productId: string,
  recipeData: Map<string, RecipeGraphData>
): boolean {
  for (const [, data] of recipeData) {
    const node = data.productNodes.find(
      (n: ExpandedProductNode) => n.expand?.product?.id === productId
    );
    if (node) {
      const containerName =
        node.expand?.product?.expand?.container_type?.name?.toLowerCase();
      return (
        containerName === "original packaging" ||
        containerName === "original-packaging"
      );
    }
  }
  return false;
}

/**
 * Check if a recipe is perishable (has raw ingredients)
 */
export function isRecipePerishable(data: RecipeGraphData): boolean {
  return data.productNodes.some(
    (node: ExpandedProductNode) => node.expand?.product?.type === "raw"
  );
}

/**
 * Filter meals by slot and day
 */
export function filterMeals(
  meals: PlannedMealWithRecipe[],
  options: {
    slot?: MealSlot;
    hasDay?: boolean;
    excludeSlot?: MealSlot;
  }
): PlannedMealWithRecipe[] {
  return meals.filter((meal) => {
    if (options.slot && meal.meal_slot !== options.slot) return false;
    if (options.excludeSlot && meal.meal_slot === options.excludeSlot)
      return false;
    if (options.hasDay !== undefined) {
      const hasDay = meal.day !== undefined && meal.day !== null;
      if (options.hasDay !== hasDay) return false;
    }
    return true;
  });
}

/**
 * Filter recipes by type
 */
export function filterRecipesByType(
  meals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>,
  recipeType: "meal" | "batch_prep"
): PlannedMealWithRecipe[] {
  return meals.filter((meal) => {
    const data = recipeData.get(meal.recipe);
    return data?.recipe.recipe_type === recipeType;
  });
}

/**
 * Exclude recipes by type
 */
export function excludeRecipeType(
  meals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>,
  recipeType: "meal" | "batch_prep"
): PlannedMealWithRecipe[] {
  return meals.filter((meal) => {
    const data = recipeData.get(meal.recipe);
    return data?.recipe.recipe_type !== recipeType;
  });
}
