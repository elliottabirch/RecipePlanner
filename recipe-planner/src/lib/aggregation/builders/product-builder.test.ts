import { describe, expect, it } from "vitest";
import { ProductType, type Product } from "../../types";
import type { ExpandedProductNode } from "../types.js";
import type { Unit } from "../../units";
import { convert } from "../../units";
import {
  buildAggregatedProduct,
  addOrMergeProduct,
} from "./product-builder";

// ============================================================================
// Fixtures
// ============================================================================

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "olive-oil",
    created: "",
    updated: "",
    collectionId: "products",
    collectionName: "products",
    name: "Olive Oil",
    type: ProductType.Raw,
    ...overrides,
  };
}

function makeNode(
  quantity: number,
  unit: Unit,
  overrides: Partial<ExpandedProductNode> = {}
): ExpandedProductNode {
  return {
    id: `node-${unit}-${quantity}`,
    created: "",
    updated: "",
    collectionId: "recipe_product_nodes",
    collectionName: "recipe_product_nodes",
    recipe: "recipe-1",
    product: "olive-oil",
    quantity,
    unit,
    ...overrides,
  };
}

/**
 * Drive the two builder functions the way processRecipeProducts does, for
 * a single product appearing as N nodes within the same recipe/meal.
 */
function mergeNodesForProduct(
  product: Product,
  nodes: ExpandedProductNode[],
  recipeName = "White Bean Stew",
  mealCount = 1,
  plannedMealId = "meal-1"
) {
  const products = new Map();
  nodes.forEach((node) => {
    const { key, product: aggregatedProduct, instances } =
      buildAggregatedProduct(node, product, recipeName, mealCount, plannedMealId);
    addOrMergeProduct(
      products,
      key,
      aggregatedProduct,
      instances,
      plannedMealId,
      node.meal_destination
    );
  });
  return products;
}

describe("product-builder — convert-or-split merge (DATA-01)", () => {
  it("white-bean anchor: merges 0.25 cup + 2 tbsp olive oil into one line, lineId === productId", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    expect(products.size).toBe(1);
    const line = products.get("olive-oil")!;
    expect(line.lineId).toBe("olive-oil");
    expect(line.productId).toBe("olive-oil");

    // Magnitude check (unit-independent): the merged total must equal
    // 6 tbsp worth of olive oil, whichever display unit was chosen.
    const totalInTbsp = convert(
      line.totalQuantity,
      line.unit as Unit,
      "tbsp"
    );
    expect(totalInTbsp).not.toBeNull();
    expect(totalInTbsp as number).toBeCloseTo(6, 5);
  });

  it("merges within-dimension regardless of node order (order-independent total)", () => {
    const product = makeProduct();
    const forward = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);
    const reversed = mergeNodesForProduct(product, [
      makeNode(2, "tbsp"),
      makeNode(0.25, "cup"),
    ]);

    const forwardTotalTbsp = convert(
      forward.get("olive-oil")!.totalQuantity,
      forward.get("olive-oil")!.unit as Unit,
      "tbsp"
    );
    const reversedTotalTbsp = convert(
      reversed.get("olive-oil")!.totalQuantity,
      reversed.get("olive-oil")!.unit as Unit,
      "tbsp"
    );

    expect(forwardTotalTbsp).toBeCloseTo(reversedTotalTbsp as number, 5);
  });

  it("converts into canonical_unit when set on the product (D-10 primary path)", () => {
    const product = makeProduct({ canonical_unit: "cup" as Unit });
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    const line = products.get("olive-oil")!;
    expect(line.unit).toBe("cup");
    expect(line.totalQuantity).toBeCloseTo(0.375, 5);
  });

  it("cross-dimension: cup + lb split into two distinct, lineId-keyed lines with no summed total", () => {
    const product = makeProduct({ id: "mystery-product" });
    const products = mergeNodesForProduct(product, [
      makeNode(1, "cup", { product: "mystery-product" }),
      makeNode(1, "lb", { product: "mystery-product" }),
    ]);

    expect(products.size).toBe(2);

    const volumeLine = products.get("mystery-product")!;
    const massLine = products.get("mystery-product|mass")!;

    expect(volumeLine.lineId).toBe("mystery-product");
    expect(massLine.lineId).toBe("mystery-product|mass");
    expect(volumeLine.lineId).not.toBe(massLine.lineId);

    // Neither line is a false cross-dimension sum: each keeps its own
    // dimension's single-node quantity untouched.
    expect(volumeLine.unit).toBe("cup");
    expect(volumeLine.totalQuantity).toBeCloseTo(1, 5);
    expect(massLine.unit).toBe("lb");
    expect(massLine.totalQuantity).toBeCloseTo(1, 5);
  });

  it("single-line (non-split) products keep lineId === productId exactly", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [makeNode(3, "tsp")]);

    expect(products.size).toBe(1);
    const line = products.get("olive-oil")!;
    expect(line.lineId).toBe(line.productId);
    expect(line.lineId).toBe("olive-oil");
  });

  it("per-source (mealSources) quantities are tracked with their own original unit", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    const line = products.get("olive-oil")!;
    // Same recipe, two nodes -> meal sources merge into one entry (unit-safe).
    expect(line.mealSources).toHaveLength(1);
    expect(line.mealSources[0].recipeName).toBe("White Bean Stew");
    const sourceInTbsp = convert(
      line.mealSources[0].quantity,
      line.mealSources[0].unit as Unit,
      "tbsp"
    );
    expect(sourceInTbsp).not.toBeNull();
    expect(sourceInTbsp as number).toBeCloseTo(6, 5);
  });
});
