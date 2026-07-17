import type { Product } from "../../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  PlannedMealWithRecipe,
  AggregatedFlowProduct,
} from "../types.js";
import {
  canConvert,
  getDimension,
  normalizeUnit,
  scaleQuantity,
  type Unit,
} from "../../units";
import {
  createProductKey,
  shouldCreateInstances,
  createMealSource,
  addMealSource,
  mergeQuantities,
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
  // D-08: resolve aliases (e.g. "cube" -> "each") so the merge key and the
  // discrete ceil below both see the canonical dimension. An unresolvable
  // non-empty unit falls back to the RAW string (never "" and never
  // silently discarded) — it stays honest, splits at the merge boundary,
  // and gets surfaced there by resolveMergeTargetKey's console.warn.
  const nodeUnit = normalizeUnit(node.unit ?? "") ?? node.unit ?? "";
  const totalQuantity = scaleQuantity(quantity, mealCount, nodeUnit as Unit);

  const baseProduct: AggregatedFlowProduct = {
    productId: product.id,
    productName: product.name,
    productType: product.type,
    totalQuantity,
    unit: nodeUnit,
    containerTypeName: node.expand?.product?.expand?.container_type?.name,
    lineId: product.id,
    canonicalUnit: product.canonical_unit,
    mealSources: [
      createMealSource(recipeName, totalQuantity, mealCount, nodeUnit),
    ],
    isPantry: product.pantry,
    trackQuantity: product.track_quantity,
    storeName: node.expand?.product?.expand?.store?.name,
    sectionName: node.expand?.product?.expand?.section?.name,
    storageLocation: product.storage_location,
  };

  // Determine how many instances to create
  if (shouldCreateInstances(product.type)) {
    const instances = scaleQuantity(node.quantity || 1, mealCount, "discrete");
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
 * Resolve which map key an incoming product should merge into.
 *
 * Convert-or-split (DATA-01): if `baseKey` doesn't exist yet, it's the
 * first line for this product and claims the bare key. If it exists and
 * shares a dimension with the incoming unit, merge into it. Otherwise the
 * incoming product is a different dimension entirely — route it to a
 * stable key suffixed by its dimension (`${baseKey}|${dimension}`), so any
 * number of same-dimension arrivals for that "other" dimension converge on
 * one split line rather than colliding with the base line's total.
 */
function resolveMergeTargetKey(
  products: Map<string, AggregatedFlowProduct>,
  baseKey: string,
  newProduct: AggregatedFlowProduct
): string {
  const base = products.get(baseKey);
  if (!base) return baseKey;
  if (canConvert(base.unit as Unit, newProduct.unit as Unit)) return baseKey;
  const dimension = getDimension(newProduct.unit as Unit);
  // Loud failure (D-08): a non-empty unresolvable unit is about to be
  // split to a key no surface renders. "" is the deliberate D-01
  // cleared-container sentinel (104 live nodes) and must stay quiet — see
  // planning_findings #8, a throw here would take down the shopping list.
  // This is NOT a fix for the |undefined split (deliberately deferred, see
  // planning_findings #6) — it only makes the existing split visible in
  // logs.
  if (dimension === undefined && newProduct.unit !== "") {
    console.warn(
      `[aggregation] product ${newProduct.productId} (${newProduct.productName}): unresolvable unit "${newProduct.unit}" is splitting into a separate line ("${baseKey}|${dimension}") instead of merging with the base line. This unit needs normalizing (D-08).`
    );
  }
  return `${baseKey}|${dimension}`;
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
    // Aggregate mode - convert-or-split merge with existing
    const targetKey = resolveMergeTargetKey(products, key, newProduct);
    const existing = products.get(targetKey);
    if (existing) {
      const merged = mergeQuantities(
        existing.totalQuantity,
        existing.unit,
        newProduct.totalQuantity,
        newProduct.unit,
        existing.canonicalUnit
      );
      // merged is guaranteed non-null here: resolveMergeTargetKey only
      // returns an existing key when the units share a dimension.
      if (merged) {
        existing.totalQuantity = merged.quantity;
        existing.unit = merged.unit;
      }
      addMealSource(
        existing.mealSources,
        newProduct.mealSources[0].recipeName,
        newProduct.mealSources[0].quantity,
        newProduct.mealSources[0].count,
        newProduct.mealSources[0].unit,
        existing.canonicalUnit
      );
    } else {
      products.set(targetKey, { ...newProduct, lineId: targetKey });
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
        lineId: instanceKey,
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
  products: Map<string, AggregatedFlowProduct>,
  peopleMultiplier: number = 1
): void {
  const recipeName = recipeData.recipe.name;
  const mealCount = (plannedMeal.quantity || 1) * peopleMultiplier;

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
