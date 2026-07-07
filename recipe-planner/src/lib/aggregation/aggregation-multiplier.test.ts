import { describe, expect, it } from "vitest";
import {
  ProductType,
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
import { buildProductFlowGraph, buildPullLists } from "../aggregation";

// ============================================================================
// Wave 0 RED scaffold (04-01-PLAN.md Task 2). `buildPullLists` and
// `buildProductFlowGraph` do not yet accept a `peopleMultiplier` 3rd
// argument, and `buildPullLists` does not yet scale by `meal.quantity` at
// all (D-03 bug) — most assertions below are expected to fail until 04-03
// (peopleMultiplier threading + D-03 fix) lands. See 04-RESEARCH.md
// Pattern 1 (threading), Pattern 2 (D-03 fix + regression requirement).
// Fixture helpers mirror aggregation-lineid.test.ts's shape/style (not
// imported — that file does not export them).
// ============================================================================

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    created: "",
    updated: "",
    collectionId: "products",
    collectionName: "products",
    name: "Product",
    type: ProductType.Raw,
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
    quantity: 100,
    unit: "g",
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

describe("buildPullLists — D-03 quantity x peopleMultiplier scaling", () => {
  it("REGRESSION: a quantity:2 meal with a JIT step doubles pull-list output (today's unscaled bug, independent of any multiplier)", () => {
    const product = makeProduct({ id: "sauce", name: "Sauce" });
    const node = makeProductNode(product, {
      id: "node-sauce",
      quantity: 100,
      unit: "g",
    });
    const step = makeStep("step-a");
    const edge = makeEdge("edge-1", node.id, step.id);
    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [step],
      productToStepEdges: [edge],
    });
    const meal = makePlannedMeal("meal-1", { day: "mon" as any, quantity: 2 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const pullLists = buildPullLists([meal], recipeDataMap);

    // TODAY: buildPullLists ignores meal.quantity entirely and emits the
    // raw node.quantity (100) unscaled — this is the D-03 correctness bug,
    // independent of peopleMultiplier.
    // FIXED: node.quantity(100) * meal.quantity(2) * peopleMultiplier(1) = 200.
    expect(pullLists).toHaveLength(1);
    expect(pullLists[0].items[0].quantity).toBe(200);
  });

  it("a quantity:1 meal scaled by peopleMultiplier:1.5 scales the pull-list item exactly (continuous unit)", () => {
    const product = makeProduct({ id: "sauce", name: "Sauce" });
    const node = makeProductNode(product, {
      id: "node-sauce",
      quantity: 100,
      unit: "g",
    });
    const step = makeStep("step-a");
    const edge = makeEdge("edge-1", node.id, step.id);
    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [step],
      productToStepEdges: [edge],
    });
    const meal = makePlannedMeal("meal-1", { day: "mon" as any, quantity: 1 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const pullLists = buildPullLists([meal], recipeDataMap, 1.5);

    expect(pullLists[0].items[0].quantity).toBeCloseTo(150);
  });

  it("a quantity:2 meal scaled by peopleMultiplier:1.5 compounds to x3", () => {
    const product = makeProduct({ id: "sauce", name: "Sauce" });
    const node = makeProductNode(product, {
      id: "node-sauce",
      quantity: 100,
      unit: "g",
    });
    const step = makeStep("step-a");
    const edge = makeEdge("edge-1", node.id, step.id);
    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [step],
      productToStepEdges: [edge],
    });
    const meal = makePlannedMeal("meal-1", { day: "mon" as any, quantity: 2 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const pullLists = buildPullLists([meal], recipeDataMap, 1.5);

    expect(pullLists[0].items[0].quantity).toBeCloseTo(300);
  });
});

describe("buildProductFlowGraph — WEEK-02/AC#8 peopleMultiplier threading", () => {
  it("no-regression: peopleMultiplier=1 reproduces byte-identical output versus the current 2-arg call", () => {
    const product = makeProduct({ id: "flour", name: "Flour" });
    const node = makeProductNode(product, {
      id: "node-flour",
      quantity: 50,
      unit: "g",
    });
    const recipeData = makeRecipeData([node], "Bread");
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const withoutArg = buildProductFlowGraph([meal], recipeDataMap);
    const withMultiplierOne = buildProductFlowGraph(
      [meal],
      recipeDataMap,
      1 as any
    );

    expect(withMultiplierOne.products.get("flour")!.totalQuantity).toBe(
      withoutArg.products.get("flour")!.totalQuantity
    );
  });

  it("peopleMultiplier=2 doubles a continuous product total", () => {
    const product = makeProduct({ id: "flour", name: "Flour" });
    const node = makeProductNode(product, {
      id: "node-flour",
      quantity: 50,
      unit: "g",
    });
    const recipeData = makeRecipeData([node], "Bread");
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const baseline = buildProductFlowGraph([meal], recipeDataMap, 1 as any);
    const doubled = buildProductFlowGraph([meal], recipeDataMap, 2 as any);

    expect(doubled.products.get("flour")!.totalQuantity).toBeCloseTo(
      baseline.products.get("flour")!.totalQuantity * 2
    );
  });
});
