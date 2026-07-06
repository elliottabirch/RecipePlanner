import { describe, it, expect } from "vitest";
import { getMealNodeTargetsForProduct } from "./shopping-mapping";
import type {
  PlannedMealWithRecipe,
  RecipeGraphData,
  ExpandedProductNode,
} from "./aggregation/types";
import type { Recipe } from "./types";

function makeRecipe(id: string, name: string): Recipe {
  return {
    id,
    name,
    collectionId: "recipes",
    collectionName: "recipes",
    created: "",
    updated: "",
  } as Recipe;
}

function makePlannedMeal(id: string, recipeId: string): PlannedMealWithRecipe {
  return {
    id,
    recipe: recipeId,
    weekly_plan: "plan-1",
    day: "mon",
    meal_slot: "dinner",
    collectionId: "planned_meals",
    collectionName: "planned_meals",
    created: "",
    updated: "",
  };
}

function makeNode(
  id: string,
  productId: string,
  overrides: Partial<ExpandedProductNode> = {}
): ExpandedProductNode {
  return {
    id,
    recipe: "recipe-1",
    product: productId,
    quantity: 2,
    unit: "cup",
    collectionId: "recipe_product_nodes",
    collectionName: "recipe_product_nodes",
    created: "",
    updated: "",
    expand: { product: { id: productId } as never },
    ...overrides,
  } as ExpandedProductNode;
}

function makeGraphData(
  recipe: Recipe,
  productNodes: ExpandedProductNode[]
): RecipeGraphData {
  return {
    recipe,
    productNodes,
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
  };
}

describe("getMealNodeTargetsForProduct", () => {
  it("returns an empty array when the product is used in no planned meal", () => {
    const meal = makePlannedMeal("meal-1", "recipe-1");
    const recipeData = new Map<string, RecipeGraphData>([
      ["meal-1", makeGraphData(makeRecipe("recipe-1", "Chili"), [makeNode("node-1", "other-product")])],
    ]);

    const result = getMealNodeTargetsForProduct("olive-oil", [meal], recipeData);

    expect(result).toEqual([]);
  });

  it("returns one target for a single matching node in a single meal", () => {
    const meal = makePlannedMeal("meal-1", "recipe-1");
    const recipeData = new Map<string, RecipeGraphData>([
      [
        "meal-1",
        makeGraphData(makeRecipe("recipe-1", "Chili"), [
          makeNode("node-1", "olive-oil", { quantity: 2, unit: "cup" }),
        ]),
      ],
    ]);

    const result = getMealNodeTargetsForProduct("olive-oil", [meal], recipeData);

    expect(result).toEqual([
      {
        plannedMealId: "meal-1",
        recipeName: "Chili",
        nodeId: "node-1",
        quantity: 2,
        unit: "cup",
      },
    ]);
  });

  it("returns two distinct targets (same nodeId, different plannedMealId) for two planned meals of the SAME recipe (phase doc item 9)", () => {
    const mealA = makePlannedMeal("meal-A", "recipe-1");
    const mealB = makePlannedMeal("meal-B", "recipe-1");
    const recipe = makeRecipe("recipe-1", "Chili");
    // Two meals of the same recipe share original_node identity (same node id
    // "node-1" appears in both meal-keyed graphs) but must resolve to two
    // distinct swap targets keyed by planned_meal.
    const recipeData = new Map<string, RecipeGraphData>([
      ["meal-A", makeGraphData(recipe, [makeNode("node-1", "olive-oil")])],
      ["meal-B", makeGraphData(recipe, [makeNode("node-1", "olive-oil")])],
    ]);

    const result = getMealNodeTargetsForProduct("olive-oil", [mealA, mealB], recipeData);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plannedMealId: "meal-A", nodeId: "node-1" }),
        expect.objectContaining({ plannedMealId: "meal-B", nodeId: "node-1" }),
      ])
    );
    // Distinct planned meals, same underlying node id.
    const plannedMealIds = result.map((t) => t.plannedMealId);
    expect(new Set(plannedMealIds).size).toBe(2);
  });

  it("returns one target per node when a product is used via two nodes in ONE meal (fan-out)", () => {
    const meal = makePlannedMeal("meal-1", "recipe-1");
    const recipeData = new Map<string, RecipeGraphData>([
      [
        "meal-1",
        makeGraphData(makeRecipe("recipe-1", "Chili"), [
          makeNode("node-1", "olive-oil", { quantity: 1, unit: "tbsp" }),
          makeNode("node-2", "olive-oil", { quantity: 2, unit: "cup" }),
        ]),
      ],
    ]);

    const result = getMealNodeTargetsForProduct("olive-oil", [meal], recipeData);

    expect(result).toHaveLength(2);
    const nodeIds = result.map((t) => t.nodeId).sort();
    expect(nodeIds).toEqual(["node-1", "node-2"]);
    expect(result.every((t) => t.plannedMealId === "meal-1")).toBe(true);
  });

  it("skips planned meals with no matching recipeData entry", () => {
    const meal = makePlannedMeal("meal-1", "recipe-1");
    const recipeData = new Map<string, RecipeGraphData>(); // no entry for meal-1

    const result = getMealNodeTargetsForProduct("olive-oil", [meal], recipeData);

    expect(result).toEqual([]);
  });
});
