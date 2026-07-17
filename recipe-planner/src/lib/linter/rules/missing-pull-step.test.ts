/**
 * Tests for the missing-pull-step rule's sourceless-INVENTORY exemption
 * (260717-fva). Fixture convention mirrors `week-graph.test.ts` /
 * `collect-stored-inputs.test.ts` (inline maps, no live PB).
 */
import { describe, it, expect } from "vitest";
import {
  collectStoredInputConsumptions,
  lintMissingPullStep,
} from "./missing-pull-step";
import { runWeekLint } from "../index";
import { buildWeekGraph } from "../../scheduler/week-graph";
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

describe("lintMissingPullStep — sourceless INVENTORY exemption (260717-fva)", () => {
  it("does NOT flag a single, un-merged leaf pull whose sole input is a sourceless INVENTORY product", () => {
    // A single-recipe plan: one leaf pull step consuming an inventory product
    // produced by nothing in-plan, feeding a transient consumed downstream.
    const frozen = makeProduct({
      id: "frozen-peas",
      name: "Frozen peas",
      type: ProductType.Inventory,
    });
    const pulled = makeProduct({
      id: "peas-pulled",
      name: "Peas (pulled)",
      type: ProductType.Transient,
    });
    const frozenIn = makeProductNode(frozen, { id: "frozen-in" });
    const pulledNode = makeProductNode(pulled, { id: "pulled-node" });
    const pullStep = makeStep("pull-peas", {
      name: "Pull frozen peas",
      step_type: StepType.Assembly,
      active_minutes: 0,
      passive_minutes: 0,
      resource: "none",
    });
    const cookStep = makeStep("cook", { name: "cook", resource: "none" });

    const recipeData = makeRecipeData({
      steps: [pullStep, cookStep],
      productNodes: [frozenIn, pulledNode],
      productToStepEdges: [
        makeProductToStepEdge("p2s-pull", frozenIn.id, pullStep.id),
        makeProductToStepEdge("p2s-cook", pulledNode.id, cookStep.id),
      ],
      stepToProductEdges: [makeStepToProductEdge("s2p", pullStep.id, pulledNode.id)],
    });

    const mealData: MealKeyedRecipeData = new Map([["meal-a", recipeData]]);
    const weekGraph = buildWeekGraph(mealData);
    const includedIds = new Set(weekGraph.nodes.map((n) => n.id));
    const consumptions = collectStoredInputConsumptions(mealData, includedIds);

    // FAILS before the fix: currently flagged (no producer edge exists).
    const findings = lintMissingPullStep(weekGraph, consumptions);
    expect(findings.filter((f) => f.nodeId.endsWith("::pull-peas"))).toHaveLength(0);
  });

  it("STILL flags a sourceless STORED consumption — a genuinely missing this-week make-step (teeth)", () => {
    const stock = makeProduct({
      id: "chicken-stock",
      name: "Chicken Stock",
      type: ProductType.Stored,
    });
    const stockNode = makeProductNode(stock, { id: "stock-node" });
    const assembleStep = makeStep("assemble-soup", { name: "Assemble soup" });

    const recipeData = makeRecipeData({
      steps: [assembleStep],
      productNodes: [stockNode],
      productToStepEdges: [makeProductToStepEdge("e1", stockNode.id, assembleStep.id)],
    });

    const mealData: MealKeyedRecipeData = new Map([["meal-b", recipeData]]);
    const weekGraph = buildWeekGraph(mealData);
    const includedIds = new Set(weekGraph.nodes.map((n) => n.id));
    const consumptions = collectStoredInputConsumptions(mealData, includedIds);

    // Passes before AND after the fix — proves the rule keeps teeth for a
    // genuinely missing STORED input; not a RED test, but must be present.
    const findings = lintMissingPullStep(weekGraph, consumptions);
    expect(findings).toHaveLength(1);
    expect(findings[0].nodeId).toBe("meal-b::assemble-soup");
  });

  it("composition: the REAL buildWeekGraph over the three-garlic-pull plan yields exactly one merged-pull node AND zero garlic findings", () => {
    // Pins Task A + Task B together. Garlic is cleared by Task A's merge +
    // the includedIds gate (planning_findings #5) — NOT by Task B's
    // sourceless-inventory predicate, since the merged node is never emitted
    // as a consumption at all. A future regression in EITHER mechanism
    // surfaces here.
    const garlic = makeProduct({
      id: "garlic-frozen",
      name: "garlic cubes (frozen)",
      type: ProductType.Inventory,
    });
    const pulled = makeProduct({
      id: "garlic-pulled",
      name: "garlic cube (pulled)",
      type: ProductType.Transient,
    });

    const mealWithGarlicPull = (suffix: string, pullStepName: string) => {
      const garlicIn = makeProductNode(garlic, { id: `garlic-in-${suffix}` });
      const pulledNode = makeProductNode(pulled, { id: `pulled-${suffix}` });
      const pullStep = makeStep(`pull-${suffix}`, {
        name: pullStepName,
        step_type: StepType.Assembly,
        active_minutes: 0,
        passive_minutes: 0,
        resource: "none",
      });
      const cookStep = makeStep(`cook-${suffix}`, { name: "cook", resource: "none" });
      return makeRecipeData(
        {
          steps: [pullStep, cookStep],
          productNodes: [garlicIn, pulledNode],
          productToStepEdges: [
            makeProductToStepEdge(`p2s-pull-${suffix}`, garlicIn.id, pullStep.id),
            makeProductToStepEdge(`p2s-cook-${suffix}`, pulledNode.id, cookStep.id),
          ],
          stepToProductEdges: [
            makeStepToProductEdge(`s2p-${suffix}`, pullStep.id, pulledNode.id),
          ],
        },
        `recipe-${suffix}`,
        `Recipe ${suffix}`
      );
    };

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", mealWithGarlicPull("a", "Pull garlic cubes")],
      ["meal-b", mealWithGarlicPull("b", "Pull out garlic cubes")],
      ["meal-c", mealWithGarlicPull("c", "Pull frozen garlic cube")],
    ]);

    const weekGraph = buildWeekGraph(mealData);
    expect(
      weekGraph.nodes.filter((n) => n.id.startsWith("merged-pull::"))
    ).toHaveLength(1);

    const includedIds = new Set(weekGraph.nodes.map((n) => n.id));
    const consumptions = collectStoredInputConsumptions(mealData, includedIds);
    const findings = runWeekLint(weekGraph, consumptions);
    const garlicFindings = findings.filter((f) =>
      f.message.toLowerCase().includes("garlic")
    );
    expect(garlicFindings).toHaveLength(0);
  });
});
