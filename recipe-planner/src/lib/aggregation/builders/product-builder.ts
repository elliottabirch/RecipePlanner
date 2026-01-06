import type { Product } from "../../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  PlannedMealWithRecipe,
  AggregatedFlowProduct,
} from "../types.js";
import {
  calculateProductQuantity,
  createProductKey,
  shouldCreateInstances,
  createMealSource,
  addMealSource,
} from "../utils/product-utils";

// ============================================================================
// Product Aggregation Builder Functions
// ============================================================================

/**
 * Build a single aggregated product entry
 * Returns the key, product data, and number of instances to create
 */
export function buildAggregatedProduct(
  node: ExpandedProductNode,
  product: Product,
  recipeName: string,
  mealCount: number,
  plannedMealId: string
): {
  key: string;
  product: AggregatedFlowProduct;
  instances: number;
} {
  const quantity = node.quantity || 0;
  const totalQuantity = calculateProductQuantity(quantity, mealCount);

  const baseProduct: AggregatedFlowProduct = {
    productId: product.id,
    productName: product.name,
    productType: product.type,
    totalQuantity,
    unit: node.unit || "",
    mealSources: [createMealSource(recipeName, totalQuantity, mealCount)],
    isPantry: product.pantry,
    trackQuantity: product.track_quantity,
    storeName: node.expand?.product?.expand?.store?.name,
    sectionName: node.expand?.product?.expand?.section?.name,
    storageLocation: product.storage_location,
  };

  // Determine how many instances to create
  if (shouldCreateInstances(product.type)) {
    const instances = (node.quantity || 1) * mealCount;
    return {
      key: createProductKey(
        product.id,
        product.type,
        node.meal_destination,
        plannedMealId,
        0
      ),
      product: baseProduct,
      instances,
    };
  }

  return {
    key: product.id,
    product: baseProduct,
    instances: 1,
  };
}

/**
 * Add or merge a product into the products map
 * Mutates the products map
 */
export function addOrMergeProduct(
  products: Map<string, AggregatedFlowProduct>,
  key: string,
  newProduct: AggregatedFlowProduct,
  instances: number,
  plannedMealId: string,
  mealDestination?: string
): void {
  if (instances === 1) {
    // Aggregate mode - merge with existing
    const existing = products.get(key);
    if (existing) {
      existing.totalQuantity += newProduct.totalQuantity;
      addMealSource(
        existing.mealSources,
        newProduct.mealSources[0].recipeName,
        newProduct.mealSources[0].quantity,
        newProduct.mealSources[0].count
      );
    } else {
      products.set(key, newProduct);
    }
  } else {
    // Instance mode - create separate entries
    for (let i = 0; i < instances; i++) {
      const instanceKey = createProductKey(
        newProduct.productId,
        newProduct.productType,
        mealDestination,
        plannedMealId,
        i
      );
      const instanceName = mealDestination
        ? `${newProduct.productName} (${mealDestination}) #${i + 1}`
        : `${newProduct.productName} #${i + 1}`;

      products.set(instanceKey, {
        ...newProduct,
        productId: instanceKey,
        productName: instanceName,
        totalQuantity: 1, // Each instance is 1 container
        mealSources: [{ ...newProduct.mealSources[0], quantity: 1, count: 1 }],
      });
    }
  }
}

/**
 * Process all products from a single recipe/meal combination
 * Mutates the products map
 */
export function processRecipeProducts(
  recipeData: RecipeGraphData,
  plannedMeal: PlannedMealWithRecipe,
  products: Map<string, AggregatedFlowProduct>
): void {
  const recipeName = recipeData.recipe.name;
  const mealCount = plannedMeal.quantity || 1;

  recipeData.productNodes.forEach((node) => {
    const product = node.expand?.product;
    if (!product) return;

    const {
      key,
      product: aggregatedProduct,
      instances,
    } = buildAggregatedProduct(
      node,
      product,
      recipeName,
      mealCount,
      plannedMeal.id
    );

    addOrMergeProduct(
      products,
      key,
      aggregatedProduct,
      instances,
      plannedMeal.id,
      node.meal_destination
    );
  });
}
