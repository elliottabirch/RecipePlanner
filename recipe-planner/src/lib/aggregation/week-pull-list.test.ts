import { describe, expect, it } from "vitest";
import {
  ProductType,
  StepType,
  Timing,
  StorageLocation,
  type Product,
  type RecipeStep,
  type ProductToStepEdge,
  type StepToProductEdge,
} from "../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  PlannedMealWithRecipe,
} from "./types.js";
import { buildProductFlowGraph, buildWeekPullList } from "../aggregation";

// ============================================================================
// buildWeekPullList — the week pull list on the Batch Prep print view. Sources
// from the flow graph's product map (not the batch-prep step array), so JIT-
// only and original-packaging ingredients are no longer dropped, and non-raw
// prior stock is included. Fixture helpers mirror aggregation-multiplier.test.ts.
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

function makeConsumeEdge(
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

function makeProduceEdge(
  id: string,
  source: string,
  target: string
): StepToProductEdge {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "step_to_product_edges",
    collectionName: "step_to_product_edges",
    recipe: "recipe-1",
    source,
    target,
  };
}

describe("buildWeekPullList", () => {
  it("includes a raw ingredient consumed only by a JIT step (the case the old step-array walk dropped)", () => {
    // JIT assembly steps are excluded from the batch-prep step map, so
    // aggregateInputs(batchPrepSteps) never saw this raw ingredient. Sourcing
    // from flowGraph.products fixes it.
    const raw = makeProduct({ id: "cilantro", name: "Cilantro", type: ProductType.Raw });
    const node = makeProductNode(raw, { id: "node-cilantro", quantity: 30, unit: "g" });
    const jitStep = makeStep("jit-assemble", { timing: Timing.JustInTime });
    const recipeData = makeRecipeData([node], "Tacos", {
      steps: [jitStep],
      productToStepEdges: [makeConsumeEdge("e1", node.id, jitStep.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const graph = buildProductFlowGraph([meal], new Map([["meal-1", recipeData]]));

    const pullList = buildWeekPullList(graph);

    const cilantro = pullList.find((i) => i.productName === "Cilantro");
    expect(cilantro).toBeDefined();
    expect(cilantro!.totalQuantity).toBe(30);
  });

  it("includes a non-raw stored ingredient that nothing in the plan produces (prior stock to pull)", () => {
    const stored = makeProduct({
      id: "kimchi",
      name: "Kimchi",
      type: ProductType.Stored,
      storage_location: StorageLocation.Fridge,
    });
    const node = makeProductNode(stored, { id: "node-kimchi", quantity: 1, unit: "cup" });
    const step = makeStep("assemble");
    const recipeData = makeRecipeData([node], "Bowl", {
      steps: [step],
      productToStepEdges: [makeConsumeEdge("e1", node.id, step.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const graph = buildProductFlowGraph([meal], new Map([["meal-1", recipeData]]));

    const pullList = buildWeekPullList(graph);

    const kimchi = pullList.find((i) => i.productName === "Kimchi");
    expect(kimchi).toBeDefined();
    expect(kimchi!.storageLocation).toBe(StorageLocation.Fridge);
  });

  it("excludes a product produced by an in-plan step (you make it, you don't pull it)", () => {
    // Raw onion → [Dice] → diced onion (stored). The diced onion is produced
    // in-plan, so it must not appear on the pull list; the raw onion must.
    const onion = makeProduct({ id: "onion", name: "Onion", type: ProductType.Raw });
    const diced = makeProduct({ id: "diced", name: "Diced Onion", type: ProductType.Stored });
    const onionNode = makeProductNode(onion, { id: "node-onion", quantity: 200, unit: "g" });
    const dicedNode = makeProductNode(diced, { id: "node-diced", quantity: 1, unit: "cup" });
    const prep = makeStep("dice", { step_type: StepType.Prep, timing: Timing.Batch });
    const recipeData = makeRecipeData([onionNode, dicedNode], "Prep", {
      steps: [prep],
      productToStepEdges: [makeConsumeEdge("e1", onionNode.id, prep.id)],
      stepToProductEdges: [makeProduceEdge("e2", prep.id, dicedNode.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const graph = buildProductFlowGraph([meal], new Map([["meal-1", recipeData]]));

    const pullList = buildWeekPullList(graph);
    const names = pullList.map((i) => i.productName);

    expect(names).toContain("Onion");
    expect(names).not.toContain("Diced Onion");
  });

  it("excludes transient intermediates even when unproduced (not a pull-list line)", () => {
    const transient = makeProduct({
      id: "dressing",
      name: "Peanut Dressing",
      type: ProductType.Transient,
    });
    const node = makeProductNode(transient, { id: "node-dressing", quantity: 0.5, unit: "cup" });
    const step = makeStep("assemble");
    const recipeData = makeRecipeData([node], "Salad", {
      steps: [step],
      productToStepEdges: [makeConsumeEdge("e1", node.id, step.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const graph = buildProductFlowGraph([meal], new Map([["meal-1", recipeData]]));

    const pullList = buildWeekPullList(graph);

    expect(pullList.find((i) => i.productName === "Peanut Dressing")).toBeUndefined();
  });

  it("buckets a raw pantry ingredient under 'pantry'", () => {
    const pantryRaw = makeProduct({
      id: "salt",
      name: "Salt",
      type: ProductType.Raw,
      pantry: true,
    });
    const node = makeProductNode(pantryRaw, { id: "node-salt", quantity: 5, unit: "g" });
    const step = makeStep("assemble");
    const recipeData = makeRecipeData([node], "Anything", {
      steps: [step],
      productToStepEdges: [makeConsumeEdge("e1", node.id, step.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const graph = buildProductFlowGraph([meal], new Map([["meal-1", recipeData]]));

    const pullList = buildWeekPullList(graph);

    expect(pullList.find((i) => i.productName === "Salt")!.storageLocation).toBe("pantry");
  });

  it("scales a raw ingredient's total by peopleMultiplier", () => {
    const raw = makeProduct({ id: "rice", name: "Rice", type: ProductType.Raw });
    const node = makeProductNode(raw, { id: "node-rice", quantity: 100, unit: "g" });
    const step = makeStep("assemble");
    const recipeData = makeRecipeData([node], "Dinner", {
      steps: [step],
      productToStepEdges: [makeConsumeEdge("e1", node.id, step.id)],
    });
    const meal = makePlannedMeal("meal-1", { quantity: 1 });
    const recipeDataMap = new Map([["meal-1", recipeData]]);

    const base = buildWeekPullList(buildProductFlowGraph([meal], recipeDataMap, 1));
    const doubled = buildWeekPullList(buildProductFlowGraph([meal], recipeDataMap, 2));

    expect(doubled.find((i) => i.productName === "Rice")!.totalQuantity).toBeCloseTo(
      base.find((i) => i.productName === "Rice")!.totalQuantity * 2
    );
  });
});
