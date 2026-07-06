import { describe, expect, it } from "vitest";
import {
  ProductType,
  StorageLocation,
  StepType,
  Timing,
  type Product,
  type RecipeStep,
  type ProductToStepEdge,
} from "../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  PlannedMealWithRecipe,
} from "./types.js";
import {
  buildProductFlowGraph,
  buildStoredItemsListFromFlow,
  buildPullLists,
  buildMealContainersList,
} from "../aggregation";

// ============================================================================
// Regression tests for D-01: content-derived, index-free `lineId` on
// StoredItem, PullListItem, and MealContainer.containers[]. See
// 02-RESEARCH.md Architecture Patterns Pattern 1 and 02-01-PLAN.md Task 1.
// ============================================================================

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

function makeRecipeData(
  productNodes: ExpandedProductNode[],
  recipeName = "Test Recipe",
  overrides: Partial<RecipeGraphData> = {}
): RecipeGraphData {
  return {
    recipe: {
      id: "recipe-1",
      created: "",
      updated: "",
      collectionId: "recipes",
      collectionName: "recipes",
      name: recipeName,
    },
    productNodes,
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
    ...overrides,
  };
}

function makePlannedMeal(
  id: string,
  overrides: Partial<PlannedMealWithRecipe> = {}
): PlannedMealWithRecipe {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "planned_meals",
    collectionName: "planned_meals",
    weekly_plan: "plan-1",
    recipe: "recipe-1",
    meal_slot: "dinner",
    quantity: 1,
    ...overrides,
  };
}

function makeStep(id: string, overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Assemble",
    step_type: StepType.Assembly,
    timing: Timing.JustInTime,
    ...overrides,
  };
}

function makeEdge(
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

// A bare array-index token — the exact defect these tests guard against
// (e.g. a lineId that is just "0", "1", or ends with "-<digit>" where the
// digit is a render-time array position rather than a content-derived id).
const ARRAY_INDEX_ONLY = /^\d+$/;

describe("lineId derivation — stored items (StoredItem.lineId)", () => {
  it("assigns lineId equal to the flowGraph.products Map key, not an array index", () => {
    const product = makeProduct({ id: "chicken", name: "Chicken" });
    const meal1 = makePlannedMeal("meal-1");
    const meal2 = makePlannedMeal("meal-2");
    const node1 = makeProductNode(product, {
      id: "node-1",
      meal_destination: "Monday Dinner",
    });
    const node2 = makeProductNode(product, {
      id: "node-2",
      meal_destination: "Tuesday Dinner",
    });
    const recipeData = new Map<string, RecipeGraphData>([
      ["meal-1", makeRecipeData([node1])],
      ["meal-2", makeRecipeData([node2])],
    ]);

    const flowGraph = buildProductFlowGraph([meal1, meal2], recipeData);
    const storedItems = buildStoredItemsListFromFlow(flowGraph);

    expect(storedItems).toHaveLength(2);
    for (const item of storedItems) {
      expect(item.lineId).not.toMatch(ARRAY_INDEX_ONLY);
      expect(flowGraph.products.has(item.lineId)).toBe(true);
      expect(flowGraph.products.get(item.lineId)!.lineId).toBe(item.lineId);
    }
    expect(storedItems.map((i) => i.lineId).sort()).toEqual(
      ["chicken-Monday Dinner-meal-1-0", "chicken-Tuesday Dinner-meal-2-0"].sort()
    );
  });

  it("is deterministic across two builds of identical input", () => {
    const product = makeProduct({ id: "chicken", name: "Chicken" });
    const meal = makePlannedMeal("meal-1");
    const node = makeProductNode(product, { meal_destination: "Monday Dinner" });
    const recipeData = new Map<string, RecipeGraphData>([
      ["meal-1", makeRecipeData([node])],
    ]);

    const flowGraph1 = buildProductFlowGraph([meal], recipeData);
    const flowGraph2 = buildProductFlowGraph([meal], recipeData);
    const items1 = buildStoredItemsListFromFlow(flowGraph1);
    const items2 = buildStoredItemsListFromFlow(flowGraph2);

    expect(items1[0].lineId).toBe(items2[0].lineId);
  });
});

describe("lineId derivation — pull list items (PullListItem.lineId)", () => {
  it("composes lineId from meal.id-step.id-node.id, collision-proof across two JIT steps feeding the same node", () => {
    const product = makeProduct({
      id: "sauce",
      name: "Sauce",
      type: ProductType.Stored,
      storage_location: StorageLocation.Fridge,
    });
    const node = makeProductNode(product, { id: "node-sauce" });
    const step1 = makeStep("step-a");
    const step2 = makeStep("step-b");
    const edge1 = makeEdge("edge-1", node.id, step1.id);
    const edge2 = makeEdge("edge-2", node.id, step2.id);

    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [step1, step2],
      productToStepEdges: [edge1, edge2],
    });

    const meal = makePlannedMeal("meal-1", { day: "mon" });
    const recipeDataMap = new Map<string, RecipeGraphData>([
      ["meal-1", recipeData],
    ]);

    const pullLists = buildPullLists([meal], recipeDataMap);

    expect(pullLists).toHaveLength(1);
    const items = pullLists[0].items;
    expect(items).toHaveLength(2);

    const lineIds = items.map((i) => i.lineId);
    for (const lineId of lineIds) {
      expect(lineId).not.toMatch(ARRAY_INDEX_ONLY);
    }
    // Collision-proof: same node feeding two different JIT steps of one meal
    // must not produce the same lineId.
    expect(new Set(lineIds).size).toBe(2);
    expect(lineIds.sort()).toEqual(
      ["meal-1-step-a-node-sauce", "meal-1-step-b-node-sauce"].sort()
    );
  });

  it("is deterministic across two builds of identical input", () => {
    const product = makeProduct({
      id: "sauce",
      name: "Sauce",
      type: ProductType.Stored,
      storage_location: StorageLocation.Fridge,
    });
    const node = makeProductNode(product, { id: "node-sauce" });
    const step = makeStep("step-a");
    const edge = makeEdge("edge-1", node.id, step.id);
    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [step],
      productToStepEdges: [edge],
    });
    const meal = makePlannedMeal("meal-1", { day: "mon" });
    const recipeDataMap = new Map<string, RecipeGraphData>([
      ["meal-1", recipeData],
    ]);

    const pullLists1 = buildPullLists([meal], recipeDataMap);
    const pullLists2 = buildPullLists([meal], recipeDataMap);

    expect(pullLists1[0].items[0].lineId).toBe(pullLists2[0].items[0].lineId);
  });
});

describe("lineId derivation — meal containers (MealContainer.containers[].lineId)", () => {
  it("surfaces the builder's existing productKey composite, not an array index", () => {
    const product = makeProduct({
      id: "stew",
      name: "Stew",
      type: ProductType.Stored,
      storage_location: StorageLocation.Fridge,
    });
    const node = makeProductNode(product, {
      id: "node-stew",
      meal_destination: "Monday Dinner",
    });
    const recipeData = makeRecipeData([node], "Stew Recipe");
    const meal = makePlannedMeal("meal-1");

    const flowGraph = buildProductFlowGraph(
      [meal],
      new Map([["meal-1", recipeData]])
    );
    const mealContainers = buildMealContainersList(flowGraph);

    expect(mealContainers).toHaveLength(1);
    expect(mealContainers[0].containers).toHaveLength(1);
    const container = mealContainers[0].containers[0];

    expect(container.lineId).not.toMatch(ARRAY_INDEX_ONLY);
    expect(container.lineId).toBe("Stew Recipe::Stew::fridge::none");
  });

  it("is deterministic across two builds of identical input", () => {
    const product = makeProduct({
      id: "stew",
      name: "Stew",
      type: ProductType.Stored,
      storage_location: StorageLocation.Fridge,
    });
    const node = makeProductNode(product, {
      id: "node-stew",
      meal_destination: "Monday Dinner",
    });
    const recipeData = makeRecipeData([node], "Stew Recipe");
    const meal = makePlannedMeal("meal-1");
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const flowGraph1 = buildProductFlowGraph([meal], recipeDataMap);
    const flowGraph2 = buildProductFlowGraph([meal], recipeDataMap);
    const containers1 = buildMealContainersList(flowGraph1);
    const containers2 = buildMealContainersList(flowGraph2);

    expect(containers1[0].containers[0].lineId).toBe(
      containers2[0].containers[0].lineId
    );
  });
});
