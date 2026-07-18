/**
 * Tests for collectStoredInputConsumptions — the deriver that feeds
 * runWeekLint/lintMissingPullStep its `consumedStoredInputs` list from the same
 * MealKeyedRecipeData the week-graph is built from (PREP-06 on-demand wiring).
 * Fixture convention mirrors week-graph.test.ts (inline maps, no live PB).
 */
import { describe, it, expect } from "vitest";
import { collectStoredInputConsumptions } from "./missing-pull-step";
import {
  ProductType,
  StepType,
  Timing,
  type Product,
  type ProductToStepEdge,
} from "../../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  MealKeyedRecipeData,
} from "../../aggregation/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    created: "",
    updated: "",
    collectionId: "products",
    collectionName: "products",
    name: "Product",
    type: ProductType.Stored,
    ...overrides,
  };
}

function makeProductNode(
  product: Product,
  overrides: Partial<ExpandedProductNode> = {}
): ExpandedProductNode {
  return {
    id: "node-1",
    created: "",
    updated: "",
    collectionId: "recipe_product_nodes",
    collectionName: "recipe_product_nodes",
    recipe: "recipe-1",
    product: product.id,
    quantity: 1,
    unit: "each",
    expand: { product },
    ...overrides,
  };
}

function makeProductToStepEdge(
  id: string,
  source: string,
  target: string
): ProductToStepEdge {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "product_to_step_edges",
    collectionName: "product_to_step_edges",
    recipe: "recipe-1",
    source,
    target,
  };
}

function makeRecipeData(overrides: Partial<RecipeGraphData> = {}): RecipeGraphData {
  return {
    recipe: {
      id: "recipe-1",
      created: "",
      updated: "",
      collectionId: "recipes",
      collectionName: "recipes",
      name: "Recipe",
    },
    productNodes: [],
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
    ...overrides,
  };
}

describe("collectStoredInputConsumptions", () => {
  it("lists each stored/inventory input consumed by an included step, and ignores raw inputs", () => {
    const stock = makeProduct({ id: "stock", name: "Stock", type: ProductType.Stored });
    const inventory = makeProduct({ id: "frozen", name: "Frozen peas", type: ProductType.Inventory });
    const raw = makeProduct({ id: "onion", name: "Onion", type: ProductType.Raw });

    const stockNode = makeProductNode(stock, { id: "stock-node" });
    const invNode = makeProductNode(inventory, { id: "inv-node" });
    const rawNode = makeProductNode(raw, { id: "raw-node" });

    const mealData: MealKeyedRecipeData = new Map([
      [
        "meal-a",
        makeRecipeData({
          productNodes: [stockNode, invNode, rawNode],
          productToStepEdges: [
            makeProductToStepEdge("e1", stockNode.id, "assemble"),
            makeProductToStepEdge("e2", invNode.id, "assemble"),
            makeProductToStepEdge("e3", rawNode.id, "assemble"),
          ],
        }),
      ],
    ]);

    const result = collectStoredInputConsumptions(
      mealData,
      new Set(["meal-a::assemble"])
    );

    expect(result).toEqual(
      expect.arrayContaining([
        {
          consumerId: "meal-a::assemble",
          productId: "stock",
          productName: "Stock",
          productType: ProductType.Stored,
          producedInPlan: false,
        },
        {
          consumerId: "meal-a::assemble",
          productId: "frozen",
          productName: "Frozen peas",
          productType: ProductType.Inventory,
          producedInPlan: false,
        },
      ])
    );
    // The raw onion input is NOT a stored input — never listed.
    expect(result.some((c) => c.productId === "onion")).toBe(false);
    expect(result).toHaveLength(2);
  });

  it("excludes a consumer that isn't in the week-graph's included node set (e.g. a just_in_time step)", () => {
    const stock = makeProduct({ id: "stock", name: "Stock", type: ProductType.Stored });
    const stockNode = makeProductNode(stock, { id: "stock-node" });

    const mealData: MealKeyedRecipeData = new Map([
      [
        "meal-a",
        makeRecipeData({
          steps: [
            {
              id: "plate",
              created: "",
              updated: "",
              collectionId: "recipe_steps",
              collectionName: "recipe_steps",
              recipe: "recipe-1",
              name: "plate it",
              step_type: StepType.Assembly,
              timing: Timing.JustInTime,
            },
          ],
          productNodes: [stockNode],
          productToStepEdges: [makeProductToStepEdge("e1", stockNode.id, "plate")],
        }),
      ],
    ]);

    // The just_in_time "plate" step was excluded from the graph, so its id is
    // absent from the included set — its stored input must not be flagged.
    const result = collectStoredInputConsumptions(mealData, new Set());
    expect(result).toHaveLength(0);
  });

  it("dedupes repeat consumptions of the same stored product by the same consumer", () => {
    const stock = makeProduct({ id: "stock", name: "Stock", type: ProductType.Stored });
    const nodeA = makeProductNode(stock, { id: "stock-node-a" });
    const nodeB = makeProductNode(stock, { id: "stock-node-b" });

    const mealData: MealKeyedRecipeData = new Map([
      [
        "meal-a",
        makeRecipeData({
          productNodes: [nodeA, nodeB],
          productToStepEdges: [
            makeProductToStepEdge("e1", nodeA.id, "assemble"),
            makeProductToStepEdge("e2", nodeB.id, "assemble"),
          ],
        }),
      ],
    ]);

    const result = collectStoredInputConsumptions(
      mealData,
      new Set(["meal-a::assemble"])
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      consumerId: "meal-a::assemble",
      productId: "stock",
      productName: "Stock",
      productType: ProductType.Stored,
      producedInPlan: false,
    });
  });
});
