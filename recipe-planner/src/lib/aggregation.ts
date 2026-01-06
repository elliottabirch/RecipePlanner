import {
  ProductType,
  StorageLocation,
  StepType,
  Timing,
  type Product,
  type InventoryItemExpanded,
} from "./types";

// Re-export types from aggregation module
export type {
  AggregatedProduct,
  AggregatedStep,
  StoredItem,
  PullListItem,
  PullListMeal,
  MealContainer,
  AggregatedFlowProduct,
  AggregatedFlowStep,
  ProductFlowGraphData,
  RecipeGraphData,
  PlannedMealWithRecipe,
} from "./aggregation/types.js";

// Import builder functions
import { processRecipeProducts } from "./aggregation/builders/product-builder";
import { processRecipeSteps } from "./aggregation/builders/step-builder";
import {
  createProductToStepFlows,
  createStepToProductFlows,
  addUniqueProductToStepFlows,
  addUniqueStepToProductFlows,
} from "./aggregation/builders/flow-builder";

// Import utility functions
import {
  groupByStoreAndSection,
  hasOriginalPackaging,
} from "./aggregation/utils/filter-utils";
import { sortPullLists, sortPrepSteps } from "./aggregation/utils/sort-utils";
import { isJustInTimeStep } from "./aggregation/utils/step-utils";
import {
  determineStorageLocation,
  extractMealDestination,
} from "./aggregation/utils/product-utils";

// Import types we need for function signatures
import type {
  AggregatedProduct,
  AggregatedStep,
  StoredItem,
  PullListItem,
  PullListMeal,
  MealContainer,
  AggregatedFlowProduct,
  AggregatedFlowStep,
  ProductFlowGraphData,
  RecipeGraphData,
  PlannedMealWithRecipe,
} from "./aggregation/types.js";

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Groups shopping list by store, then by section.
 * Pantry items appear in BOTH their store/section groups AND the separate pantry list.
 */
export function groupShoppingList(items: AggregatedProduct[]): {
  byStore: Map<string, Map<string, AggregatedProduct[]>>;
  pantryItems: AggregatedProduct[];
} {
  return {
    byStore: groupByStoreAndSection(items),
    pantryItems: items.filter((item) => item.isPantry),
  };
}

/**
 * Builds pull lists for just-in-time meals.
 *
 * Logic:
 * 1. Find planned meals that have a specific day (not week-spanning)
 * 2. For each meal's recipe, check if it has JIT assembly steps
 * 3. For JIT steps, list inputs that need to be pulled from storage
 */
export function buildPullLists(
  plannedMeals: PlannedMealWithRecipe[],
  recipeDataMap: Map<string, RecipeGraphData>
): PullListMeal[] {
  const lists: PullListMeal[] = [];

  // Only process meals with specific days
  const daySpecificMeals = plannedMeals.filter((meal) => meal.day);

  daySpecificMeals.forEach((meal) => {
    const data = recipeDataMap.get(meal.recipe);
    if (!data) return;

    const recipeName = data.recipe.name;

    // Find JIT assembly steps using utility
    const jitSteps = data.steps.filter(isJustInTimeStep);
    if (jitSteps.length === 0) return;

    const items: PullListItem[] = [];

    jitSteps.forEach((step) => {
      // Find inputs to this step
      const inputEdges = data.productToStepEdges.filter(
        (e) => e.target === step.id
      );

      inputEdges.forEach((e) => {
        const node = data.productNodes.find((n) => n.id === e.source);
        const product = node?.expand?.product;
        if (!product) return;

        // Determine storage location using utility
        const fromStorage = determineStorageLocation(product);

        items.push({
          productName: product.name,
          quantity: node?.quantity,
          unit: node?.unit,
          containerTypeName: product.expand?.container_type?.name,
          fromStorage,
        });
      });
    });

    if (items.length > 0) {
      lists.push({
        day: meal.day!,
        slot: meal.meal_slot,
        recipeName,
        items,
      });
    }
  });

  // Sort using utility
  return sortPullLists(lists);
}

/**
 * Builds aggregated product flow graph for the weekly plan.
 *
 * This is the SINGLE SOURCE OF TRUTH for all product and step aggregations.
 * Uses composable builder functions for clarity and maintainability.
 */
export function buildProductFlowGraph(
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): ProductFlowGraphData {
  const products = new Map<string, AggregatedFlowProduct>();
  const steps = new Map<string, AggregatedFlowStep>();
  const productToStepFlows: { productId: string; stepId: string }[] = [];
  const stepToProductFlows: { stepId: string; productId: string }[] = [];

  // Process each planned meal
  plannedMeals.forEach((meal) => {
    const data = recipeData.get(meal.recipe);
    if (!data) return;

    const mealCount = meal.quantity || 1;

    // 1. Aggregate all products
    processRecipeProducts(data, meal, products);

    // 2. Aggregate all steps
    processRecipeSteps(data, meal, steps);

    // 3. Build flow connections for all steps
    steps.forEach((step) => {
      const productToStepFlowsForStep = createProductToStepFlows(
        step,
        meal,
        data,
        mealCount
      );
      const stepToProductFlowsForStep = createStepToProductFlows(
        step,
        meal,
        data,
        mealCount
      );

      addUniqueProductToStepFlows(
        productToStepFlows,
        productToStepFlowsForStep
      );
      addUniqueStepToProductFlows(
        stepToProductFlows,
        stepToProductFlowsForStep
      );
    });
  });

  return {
    products,
    steps,
    productToStepFlows,
    stepToProductFlows,
  };
}

/**
 * Build shopping list from the product flow graph
 * Only includes raw products (ingredients to buy)
 */
export function buildShoppingListFromFlow(
  flowGraph: ProductFlowGraphData
): AggregatedProduct[] {
  const shoppingItems: AggregatedProduct[] = [];

  flowGraph.products.forEach((product) => {
    if (product.productType === ProductType.Raw) {
      shoppingItems.push({
        productId: product.productId,
        productName: product.productName,
        productType: product.productType,
        isPantry: product.isPantry || false,
        trackQuantity: product.trackQuantity,
        totalQuantity: product.totalQuantity,
        unit: product.unit,
        storeName: product.storeName,
        sectionName: product.sectionName,
        sources: product.mealSources.map((s) => ({
          recipeName: s.recipeName,
          quantity: s.quantity,
          unit: product.unit,
        })),
      });
    }
  });

  return shoppingItems;
}

/**
 * Build batch prep list from the product flow graph
 * Includes all prep and batch assembly steps
 * Excludes steps where outputs have container type "original packaging"
 * Sorted by type, output type, and input names
 */
export function buildBatchPrepListFromFlow(
  flowGraph: ProductFlowGraphData,
  recipeData: Map<string, RecipeGraphData>
): AggregatedStep[] {
  const prepSteps: AggregatedStep[] = [];

  // Helper to check if any output has "original packaging" container type
  const hasOriginalPackagingOutput = (step: AggregatedFlowStep): boolean => {
    return step.outputs.some((output) =>
      hasOriginalPackaging(output.productId, recipeData)
    );
  };

  flowGraph.steps.forEach((step) => {
    // Skip steps with "original packaging" outputs
    if (hasOriginalPackagingOutput(step)) return;

    // Use the first step name as the primary name
    const primaryStepName = step.stepNames[0];

    prepSteps.push({
      stepId: step.stepId,
      name:
        step.stepNames.length > 1
          ? `${primaryStepName} (+ ${step.stepNames.length - 1} variants)`
          : primaryStepName,
      stepType: step.stepType,
      timing: step.stepType === StepType.Assembly ? Timing.Batch : undefined,
      recipeName: step.recipeSources
        .map((s) => `${s.count}x ${s.recipeName}`)
        .join(", "),
      inputs: step.inputs.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unit: i.unit,
      })),
      outputs: step.outputs.map((o) => ({
        productName: o.productName,
        quantity: o.quantity,
        unit: o.unit,
      })),
    });
  });

  // Sort using utility function
  return sortPrepSteps(prepSteps, flowGraph);
}

/**
 * Build stored items list from the product flow graph
 * Only includes stored products (outputs that go to fridge/freezer)
 */
export function buildStoredItemsListFromFlow(
  flowGraph: ProductFlowGraphData
): StoredItem[] {
  const storedItems: StoredItem[] = [];

  flowGraph.products.forEach((product) => {
    if (product.productType === ProductType.Stored) {
      // Extract meal destination using utility
      const { cleanName, destination } = extractMealDestination(
        product.productName
      );

      storedItems.push({
        productName: cleanName,
        storageLocation: product.storageLocation || StorageLocation.Fridge,
        mealDestination: destination,
        quantity: product.totalQuantity,
        unit: product.unit,
        recipeName: product.mealSources.map((s) => s.recipeName).join(", "),
        containerTypeName: product.unit, // unit is now the container type
      });
    }
  });

  return storedItems;
}

/**
 * Build meal containers list - groups stored items by parent recipe
 * This helps users quickly find which containers belong to which recipes/meals
 */
export function buildMealContainersList(
  flowGraph: ProductFlowGraphData
): MealContainer[] {
  // Track unique product types within each recipe to aggregate properly
  const recipeProductMap = new Map<
    string,
    Map<
      string,
      {
        productName: string;
        containerTypeName?: string;
        storageLocation: StorageLocation;
        quantity: number;
      }
    >
  >();

  flowGraph.products.forEach((product) => {
    if (product.productType === ProductType.Stored) {
      // Group by recipe name (parent recipe)
      product.mealSources.forEach((source) => {
        const recipeName = source.recipeName;
        const cleanName = product.productName.replace(
          /\s*\([^)]+\)\s*#\d+/,
          ""
        );

        if (!recipeProductMap.has(recipeName)) {
          recipeProductMap.set(recipeName, new Map());
        }

        const productsInRecipe = recipeProductMap.get(recipeName)!;
        const productKey = `${cleanName}-${product.storageLocation}-${product.unit}`;

        if (productsInRecipe.has(productKey)) {
          // Aggregate quantity for same product
          const existing = productsInRecipe.get(productKey)!;
          existing.quantity += product.totalQuantity;
        } else {
          // Add new product
          productsInRecipe.set(productKey, {
            productName: cleanName,
            containerTypeName: product.unit, // unit is the container type
            storageLocation: product.storageLocation || StorageLocation.Fridge,
            quantity: product.totalQuantity,
          });
        }
      });
    }
  });

  // Convert map to array format
  const result: MealContainer[] = [];
  recipeProductMap.forEach((productsMap, recipeName) => {
    result.push({
      recipeName,
      containers: Array.from(productsMap.values()),
    });
  });

  return result.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

/**
 * Get ready-to-eat inventory items grouped by meal slot
 */
export function getReadyToEatInventory(
  inventoryItems: InventoryItemExpanded[]
): { meals: Product[]; snacks: Product[] } {
  const meals: Product[] = [];
  const snacks: Product[] = [];

  inventoryItems.forEach((item) => {
    const product = item.expand?.product;
    if (!product || !item.in_stock || !product.ready_to_eat) {
      return;
    }

    if (product.meal_slot === "meal") {
      meals.push(product);
    } else if (product.meal_slot === "snack") {
      snacks.push(product);
    }
  });

  return { meals, snacks };
}

/**
 * Check stock status for inventory products used in recipes
 */
export function checkInventoryStock(
  recipeDataMap: Map<string, RecipeGraphData>,
  inventoryItems: InventoryItemExpanded[]
): {
  recipeId: string;
  recipeName: string;
  productName: string;
  inStock: boolean;
}[] {
  const warnings: {
    recipeId: string;
    recipeName: string;
    productName: string;
    inStock: boolean;
  }[] = [];

  // Create a map of product IDs to stock status
  const stockMap = new Map<string, boolean>();
  inventoryItems.forEach((item) => {
    if (item.expand?.product) {
      stockMap.set(item.product, item.in_stock);
    }
  });

  recipeDataMap.forEach((data) => {
    data.productNodes.forEach((node) => {
      const product = node.expand?.product;
      if (product?.type === ProductType.Inventory) {
        const inStock = stockMap.get(product.id) ?? false;
        warnings.push({
          recipeId: data.recipe.id,
          recipeName: data.recipe.name,
          productName: product.name,
          inStock,
        });
      }
    });
  });

  return warnings;
}

/**
 * Determine if a recipe is perishable (has raw product inputs)
 * Re-exported from utilities for backwards compatibility
 */
export { isRecipePerishable } from "./aggregation/utils/filter-utils";
