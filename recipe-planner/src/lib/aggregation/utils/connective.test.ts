/**
 * Tests for connective-recipe detection (todo:
 * connective-recipe-batch-then-consume). Fixture convention mirrors
 * week-graph.test.ts (inline maps, no live PocketBase).
 */
import { describe, it, expect } from "vitest";
import {
  collectProducedProductIds,
  isSpuriousInPlanPull,
  collectSpuriousPullStepIds,
} from "./connective";
import {
  ProductType,
  StepType,
  Timing,
  type Product,
  type RecipeStep,
  type ProductToStepEdge,
  type StepToProductEdge,
} from "../../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
  MealKeyedRecipeData,
} from "../types";

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

function makeNode(
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

function s2p(id: string, source: string, target: string): StepToProductEdge {
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

/** The canonical meatballs scenario: producer meal makes `meatballs frozen`
 * (inventory), consumer meal pulls it (0-time) into `meatballs stored`. */
function meatballsPlan(): MealKeyedRecipeData {
  const frozen = makeProduct({ id: "mb-frozen", name: "meatballs frozen", type: ProductType.Inventory });
  const stored = makeProduct({ id: "mb-stored", name: "meatballs stored", type: ProductType.Stored });

  const producer = makeRecipeData({
    recipe: { id: "r-make", created: "", updated: "", collectionId: "recipes", collectionName: "recipes", name: "Spinach meatballs batch" },
    steps: [makeStep("create", { name: "Create meatballs", step_type: StepType.Prep, active_minutes: 20 })],
    productNodes: [makeNode(frozen, { id: "frozen-out" })],
    stepToProductEdges: [s2p("s1", "create", "frozen-out")],
  });

  const pull = makeStep("pull", { name: "pull out meatballs", step_type: StepType.Assembly, active_minutes: 0, passive_minutes: 0 });
  const consumer = makeRecipeData({
    recipe: { id: "r-use", created: "", updated: "", collectionId: "recipes", collectionName: "recipes", name: "Meatballs" },
    steps: [pull],
    productNodes: [makeNode(frozen, { id: "frozen-in" }), makeNode(stored, { id: "stored-out" })],
    productToStepEdges: [p2s("p1", "frozen-in", "pull")],
    stepToProductEdges: [s2p("s2", "pull", "stored-out")],
  });

  return new Map([
    ["meal-make", producer],
    ["meal-use", consumer],
  ]);
}

describe("collectProducedProductIds", () => {
  it("collects every product id output by a step across the plan", () => {
    const produced = collectProducedProductIds(meatballsPlan());
    expect(produced.has("mb-frozen")).toBe(true); // produced by "Create meatballs"
    expect(produced.has("mb-stored")).toBe(true); // produced by the pull step
  });
});

describe("isSpuriousInPlanPull", () => {
  it("flags a 0-time single-inventory-input assembly step whose input is made in-plan", () => {
    const plan = meatballsPlan();
    const consumer = plan.get("meal-use")!;
    const pull = consumer.steps[0];
    const produced = collectProducedProductIds(plan);
    expect(isSpuriousInPlanPull(pull, consumer, produced)).toBe(true);
  });

  it("does NOT flag the pull when the inventory item is NOT produced in-plan", () => {
    const plan = meatballsPlan();
    const consumer = plan.get("meal-use")!;
    const pull = consumer.steps[0];
    // Empty produced-set = nothing made this week -> real pull-from-freezer.
    expect(isSpuriousInPlanPull(pull, consumer, new Set())).toBe(false);
  });

  it("does NOT flag a step with a nonzero active time", () => {
    const consumer = makeRecipeData({
      steps: [makeStep("cook", { active_minutes: 10, passive_minutes: 0 })],
      productNodes: [makeNode(makeProduct({ id: "mb-frozen", type: ProductType.Inventory }), { id: "in" })],
      productToStepEdges: [p2s("p1", "in", "cook")],
    });
    expect(isSpuriousInPlanPull(consumer.steps[0], consumer, new Set(["mb-frozen"]))).toBe(false);
  });

  it("does NOT flag a step with multiple inputs (a real assembly, not a pull connector)", () => {
    const consumer = makeRecipeData({
      steps: [makeStep("assemble")],
      productNodes: [
        makeNode(makeProduct({ id: "mb-frozen", type: ProductType.Inventory }), { id: "in-a" }),
        makeNode(makeProduct({ id: "sauce", type: ProductType.Stored }), { id: "in-b" }),
      ],
      productToStepEdges: [p2s("p1", "in-a", "assemble"), p2s("p2", "in-b", "assemble")],
    });
    expect(isSpuriousInPlanPull(consumer.steps[0], consumer, new Set(["mb-frozen"]))).toBe(false);
  });

  it("does NOT flag a step whose single input is a raw ingredient (not inventory)", () => {
    const consumer = makeRecipeData({
      steps: [makeStep("prep")],
      productNodes: [makeNode(makeProduct({ id: "onion", type: ProductType.Raw }), { id: "in" })],
      productToStepEdges: [p2s("p1", "in", "prep")],
    });
    expect(isSpuriousInPlanPull(consumer.steps[0], consumer, new Set(["onion"]))).toBe(false);
  });
});

describe("collectSpuriousPullStepIds", () => {
  it("returns exactly the spurious pull step id for the meatballs plan", () => {
    const plan = meatballsPlan();
    const produced = collectProducedProductIds(plan);
    expect(collectSpuriousPullStepIds(plan, produced)).toEqual(new Set(["pull"]));
  });
});
