/**
 * buildProductFlowGraph / batch-prep behaviour for spurious in-plan pull
 * connectors (todo: connective-recipe-batch-then-consume). Proves the display
 * path (batch prep + product flow) drops the same steps cook mode elides.
 * Fixture style mirrors aggregation-multiplier.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  ProductType,
  StepType,
  Timing,
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
import { buildProductFlowGraph, buildBatchPrepListFromFlow } from "../aggregation";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    created: "",
    updated: "",
    collectionId: "products",
    collectionName: "products",
    name: "Product",
    type: ProductType.Inventory,
    ...overrides,
  };
}

function makeNode(product: Product, overrides: Partial<ExpandedProductNode> = {}): ExpandedProductNode {
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

function makeStep(id: string, overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Step",
    step_type: StepType.Assembly,
    timing: Timing.Batch,
    active_minutes: 0,
    passive_minutes: 0,
    ...overrides,
  };
}

function p2s(id: string, source: string, target: string): ProductToStepEdge {
  return { id, created: "", updated: "", collectionId: "product_to_step_edges", collectionName: "product_to_step_edges", recipe: "recipe-1", source, target };
}
function s2p(id: string, source: string, target: string): StepToProductEdge {
  return { id, created: "", updated: "", collectionId: "step_to_product_edges", collectionName: "step_to_product_edges", recipe: "recipe-1", source, target };
}

function recipeData(name: string, overrides: Partial<RecipeGraphData>): RecipeGraphData {
  return {
    recipe: { id: `r-${name}`, created: "", updated: "", collectionId: "recipes", collectionName: "recipes", name },
    productNodes: [],
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
    ...overrides,
  };
}

function meal(id: string): PlannedMealWithRecipe {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "planned_meals",
    collectionName: "planned_meals",
    weekly_plan: "plan-1",
    recipe: id,
    quantity: 1,
  } as PlannedMealWithRecipe;
}

describe("buildProductFlowGraph — spurious in-plan pull connectors", () => {
  it("drops the pull step from batch prep when the inventory item is made in-plan, keeps the producer step", () => {
    const frozen = makeProduct({ id: "mb-frozen", name: "meatballs frozen", type: ProductType.Inventory });
    const stored = makeProduct({ id: "mb-stored", name: "meatballs stored", type: ProductType.Stored });

    const producer = recipeData("Meatballs batch", {
      steps: [makeStep("create", { name: "Create meatballs", step_type: StepType.Prep, active_minutes: 20 })],
      productNodes: [makeNode(frozen, { id: "frozen-out" })],
      stepToProductEdges: [s2p("s1", "create", "frozen-out")],
    });
    const consumer = recipeData("Dish", {
      steps: [makeStep("pull", { name: "pull out meatballs", step_type: StepType.Assembly, active_minutes: 0, passive_minutes: 0 })],
      productNodes: [makeNode(frozen, { id: "frozen-in" }), makeNode(stored, { id: "stored-out" })],
      productToStepEdges: [p2s("p1", "frozen-in", "pull")],
      stepToProductEdges: [s2p("s2", "pull", "stored-out")],
    });

    const meals = [meal("meal-make"), meal("meal-use")];
    const dataMap = new Map<string, RecipeGraphData>([
      ["meal-make", producer],
      ["meal-use", consumer],
    ]);

    const flow = buildProductFlowGraph(meals, dataMap);
    const prep = buildBatchPrepListFromFlow(flow, dataMap);
    const names = prep.flatMap((s) => s.name);

    expect(names).toContain("Create meatballs");
    expect(names.some((n) => /pull out meatballs/i.test(n))).toBe(false);
  });

  it("keeps the pull step when the inventory item is NOT produced in-plan (a real pull from freezer)", () => {
    const frozen = makeProduct({ id: "mb-frozen", name: "meatballs frozen", type: ProductType.Inventory });
    const stored = makeProduct({ id: "mb-stored", name: "meatballs stored", type: ProductType.Stored });

    // Only the consumer is planned — nothing makes the meatballs this week.
    const consumer = recipeData("Dish", {
      steps: [makeStep("pull", { name: "pull out meatballs", step_type: StepType.Assembly, active_minutes: 0, passive_minutes: 0 })],
      productNodes: [makeNode(frozen, { id: "frozen-in" }), makeNode(stored, { id: "stored-out" })],
      productToStepEdges: [p2s("p1", "frozen-in", "pull")],
      stepToProductEdges: [s2p("s2", "pull", "stored-out")],
    });

    const meals = [meal("meal-use")];
    const dataMap = new Map<string, RecipeGraphData>([["meal-use", consumer]]);

    const flow = buildProductFlowGraph(meals, dataMap);
    const prep = buildBatchPrepListFromFlow(flow, dataMap);
    expect(prep.some((s) => /pull out meatballs/i.test(s.name))).toBe(true);
  });
});
