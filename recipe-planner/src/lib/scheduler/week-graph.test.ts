/**
 * Wave-0 RED tests for the week-graph builder (PREP-03). These encode the
 * acceptance contract `buildWeekGraph` must satisfy once implemented (see
 * 05-RESEARCH.md Pattern 1, Pitfall 3, Assumption A4; 05-VALIDATION.md
 * Wave 0 Requirements). `week-graph.ts` does not exist yet — this suite is
 * EXPECTED to fail on import until a later wave implements it.
 *
 * Fixture convention mirrors
 * recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts (inline
 * Map<string, RecipeGraphData>, no live PocketBase).
 */
import { describe, it, expect } from "vitest";
import { buildWeekGraph } from "./week-graph";
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
  MealKeyedRecipeData,
} from "../aggregation/types";
import type { WeekGraph } from "./types";

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
    ...overrides,
  };
}

function makeStepToProductEdge(
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

function makeRecipeData(
  overrides: Partial<RecipeGraphData> = {},
  recipeId = "recipe-1",
  recipeName = "Recipe"
): RecipeGraphData {
  return {
    recipe: {
      id: recipeId,
      created: "",
      updated: "",
      collectionId: "recipes",
      collectionName: "recipes",
      name: recipeName,
    },
    productNodes: [],
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
    ...overrides,
  };
}

describe("buildWeekGraph — timing filter", () => {
  it("excludes just_in_time (day-of) steps and any edge touching them, keeps batch + blank", () => {
    const stock = makeProduct({ id: "stock", name: "Stock", type: ProductType.Inventory });
    const stockNode = makeProductNode(stock, { id: "stock-node" });
    // A batch cook step (kept) whose stored output feeds a just_in_time
    // assembly step (dropped) in the same meal.
    const cookStep = makeStep("cook", { name: "cook", timing: Timing.Batch });
    const plateStep = makeStep("plate", { name: "plate it", timing: Timing.JustInTime });
    const blankStep = makeStep("blank", { name: "blank timing", timing: undefined });

    const mealData: MealKeyedRecipeData = new Map([
      [
        "meal-a",
        makeRecipeData(
          {
            steps: [cookStep, plateStep, blankStep],
            productNodes: [stockNode],
            stepToProductEdges: [makeStepToProductEdge("s2p", cookStep.id, stockNode.id)],
            productToStepEdges: [makeProductToStepEdge("p2s", stockNode.id, plateStep.id)],
          },
          "recipe-a",
          "Recipe A"
        ),
      ],
    ]);

    const graph = buildWeekGraph(mealData);
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("meal-a::cook");
    expect(ids).toContain("meal-a::blank"); // blank timing kept
    expect(ids).not.toContain("meal-a::plate"); // just_in_time dropped
    // The cook -> plate edge must not survive to a dropped node.
    expect(graph.edges.some((e) => e.to === "meal-a::plate")).toBe(false);
  });
});

describe("buildWeekGraph — week-wide prep merge", () => {
  it("collapses same-raw-ingredient prep across meals into one node (summed active) and fans its downstream edges out", () => {
    const onion = makeProduct({ id: "onion", name: "Onion", type: ProductType.Raw });
    const diced = makeProduct({ id: "onion-diced", name: "Onion diced", type: ProductType.Transient });

    const mealWithOnionPrep = (mealSuffix: string, active: number, action: string) => {
      const onionIn = makeProductNode(onion, { id: `onion-in-${mealSuffix}` });
      const dicedNode = makeProductNode(diced, { id: `diced-${mealSuffix}` });
      const diceStep = makeStep(`dice-${mealSuffix}`, {
        name: "dice onion",
        step_type: StepType.Prep,
        active_minutes: active,
        resource: "none",
        prep_action: action,
      });
      const cookStep = makeStep(`cook-${mealSuffix}`, { name: "cook", resource: "none" });
      return makeRecipeData(
        {
          steps: [diceStep, cookStep],
          productNodes: [onionIn, dicedNode],
          productToStepEdges: [
            makeProductToStepEdge(`p2s-dice-${mealSuffix}`, onionIn.id, diceStep.id),
            makeProductToStepEdge(`p2s-cook-${mealSuffix}`, dicedNode.id, cookStep.id),
          ],
          stepToProductEdges: [
            makeStepToProductEdge(`s2p-${mealSuffix}`, diceStep.id, dicedNode.id),
          ],
        },
        `recipe-${mealSuffix}`,
        `Recipe ${mealSuffix}`
      );
    };

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", mealWithOnionPrep("a", 5, "diced")],
      ["meal-b", mealWithOnionPrep("b", 7, "sliced")],
    ]);

    const graph: WeekGraph = buildWeekGraph(mealData);

    const merged = graph.nodes.find((n) => n.id === "merged-prep::onion");
    expect(merged).toBeDefined();
    // Summed active time from both meals' prep.
    expect(merged!.step.active_minutes).toBe(12);
    expect(merged!.mergedMembers).toHaveLength(2);
    // The original per-meal prep nodes are gone, replaced by the merged node.
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).not.toContain("meal-a::dice-a");
    expect(ids).not.toContain("meal-b::dice-b");
    // Precedence preserved: each meal's cook step still waits on the prep, now
    // fanned out from the single merged node.
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: "merged-prep::onion", to: "meal-a::cook-a" },
        { from: "merged-prep::onion", to: "meal-b::cook-b" },
      ])
    );
  });

  it("leaves a raw ingredient used by only one prep step untouched (nothing to aggregate)", () => {
    const garlic = makeProduct({ id: "garlic", name: "Garlic", type: ProductType.Raw });
    const garlicIn = makeProductNode(garlic, { id: "garlic-in" });
    const minceStep = makeStep("mince", {
      name: "mince garlic",
      step_type: StepType.Prep,
      active_minutes: 2,
      resource: "none",
      prep_action: "minced",
    });
    const mealData: MealKeyedRecipeData = new Map([
      [
        "meal-a",
        makeRecipeData(
          {
            steps: [minceStep],
            productNodes: [garlicIn],
            productToStepEdges: [makeProductToStepEdge("p", garlicIn.id, minceStep.id)],
          },
          "recipe-a",
          "Recipe A"
        ),
      ],
    ]);

    const graph = buildWeekGraph(mealData);
    expect(graph.nodes.map((n) => n.id)).toContain("meal-a::mince");
    expect(graph.nodes.some((n) => n.id.startsWith("merged-prep::"))).toBe(false);
  });
});

describe("buildWeekGraph — cross-recipe edges", () => {
  it("meal A's stored output produces an edge into meal B's matching input consumer", () => {
    const stockProduct = makeProduct({ id: "chicken-stock", name: "Chicken Stock", type: ProductType.Stored });

    const stockStep = makeStep("make-stock", { name: "Make stock", step_type: StepType.Prep, timing: undefined });
    const stockOutputNode = makeProductNode(stockProduct, { id: "stock-output-node" });
    const mealA = makeRecipeData(
      {
        steps: [stockStep],
        productNodes: [stockOutputNode],
        stepToProductEdges: [makeStepToProductEdge("e1", stockStep.id, stockOutputNode.id)],
      },
      "recipe-stock",
      "Chicken Stock Recipe"
    );

    const assembleStep = makeStep("assemble-soup", { name: "Assemble soup" });
    const stockInputNode = makeProductNode(stockProduct, { id: "stock-input-node" });
    const mealB = makeRecipeData(
      {
        steps: [assembleStep],
        productNodes: [stockInputNode],
        productToStepEdges: [makeProductToStepEdge("e2", stockInputNode.id, assembleStep.id)],
      },
      "recipe-soup",
      "Soup"
    );

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", mealA],
      ["meal-b", mealB],
    ]);

    const graph: WeekGraph = buildWeekGraph(mealData);

    const producerId = "meal-a::make-stock";
    const consumerId = "meal-b::assemble-soup";
    expect(graph.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([producerId, consumerId])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([{ from: producerId, to: consumerId }])
    );
  });

  it("leaves the consumer as a source node (no incoming edge) when no producer exists for the input", () => {
    const stockProduct = makeProduct({ id: "chicken-stock", name: "Chicken Stock", type: ProductType.Stored });
    const assembleStep = makeStep("assemble-soup", { name: "Assemble soup" });
    const stockInputNode = makeProductNode(stockProduct, { id: "stock-input-node" });
    const mealB = makeRecipeData(
      {
        steps: [assembleStep],
        productNodes: [stockInputNode],
        productToStepEdges: [makeProductToStepEdge("e2", stockInputNode.id, assembleStep.id)],
      },
      "recipe-soup",
      "Soup"
    );

    const mealData: MealKeyedRecipeData = new Map([["meal-b", mealB]]);

    const graph: WeekGraph = buildWeekGraph(mealData);

    const consumerId = "meal-b::assemble-soup";
    expect(graph.nodes.map((n) => n.id)).toContain(consumerId);
    expect(graph.edges.filter((e) => e.to === consumerId)).toHaveLength(0);
  });

  it("fans in an edge from EVERY matching producer when multiple recipes produce the same stored product (AND-semantics, A4)", () => {
    const stockProduct = makeProduct({ id: "chicken-stock", name: "Chicken Stock", type: ProductType.Stored });

    const stockStep1 = makeStep("make-stock", { name: "Make stock", step_type: StepType.Prep, timing: undefined });
    const stockOutputNode1 = makeProductNode(stockProduct, { id: "stock-output-node-1" });
    const mealA1 = makeRecipeData(
      {
        steps: [stockStep1],
        productNodes: [stockOutputNode1],
        stepToProductEdges: [makeStepToProductEdge("e1", stockStep1.id, stockOutputNode1.id)],
      },
      "recipe-stock",
      "Chicken Stock Recipe"
    );

    const stockStep2 = makeStep("make-stock", { name: "Make stock", step_type: StepType.Prep, timing: undefined });
    const stockOutputNode2 = makeProductNode(stockProduct, { id: "stock-output-node-2" });
    const mealA2 = makeRecipeData(
      {
        steps: [stockStep2],
        productNodes: [stockOutputNode2],
        stepToProductEdges: [makeStepToProductEdge("e1", stockStep2.id, stockOutputNode2.id)],
      },
      "recipe-stock",
      "Chicken Stock Recipe"
    );

    const assembleStep = makeStep("assemble-soup", { name: "Assemble soup" });
    const stockInputNode = makeProductNode(stockProduct, { id: "stock-input-node" });
    const mealB = makeRecipeData(
      {
        steps: [assembleStep],
        productNodes: [stockInputNode],
        productToStepEdges: [makeProductToStepEdge("e2", stockInputNode.id, assembleStep.id)],
      },
      "recipe-soup",
      "Soup"
    );

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a1", mealA1],
      ["meal-a2", mealA2],
      ["meal-b", mealB],
    ]);

    const graph: WeekGraph = buildWeekGraph(mealData);

    const consumerId = "meal-b::assemble-soup";
    const incoming = graph.edges.filter((e) => e.to === consumerId);
    expect(incoming.map((e) => e.from).sort()).toEqual(
      ["meal-a1::make-stock", "meal-a2::make-stock"].sort()
    );
  });

  it("never merges two planned instances of the same recipe's step into one node (Pitfall 3)", () => {
    const step = makeStep("chop-onion", { name: "Chop onion", step_type: StepType.Prep });
    const recipeData = makeRecipeData({ steps: [step] }, "recipe-soup", "Soup");

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-b1", recipeData],
      ["meal-b2", recipeData],
    ]);

    const graph: WeekGraph = buildWeekGraph(mealData);

    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("meal-b1::chop-onion");
    expect(ids).toContain("meal-b2::chop-onion");
    expect(new Set(ids).size).toBe(ids.length);
    expect(graph.nodes).toHaveLength(2);
  });
});
