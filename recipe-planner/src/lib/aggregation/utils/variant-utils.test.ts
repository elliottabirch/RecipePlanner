import { describe, expect, it } from "vitest";
import { ProductType, StepType, type Product } from "../../types";
import type { ExpandedProductNode, RecipeGraphData } from "../types";
import { applyVariantOverrides, type VariantOverride } from "./variant-utils";

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

function makeNode(overrides: Partial<ExpandedProductNode> = {}): ExpandedProductNode {
  return {
    id: "node-1",
    created: "",
    updated: "",
    collectionId: "recipe_product_nodes",
    collectionName: "recipe_product_nodes",
    recipe: "recipe-1",
    product: "olive-oil",
    quantity: 3,
    unit: "cup",
    ...overrides,
  };
}

function makeRecipeData(node: ExpandedProductNode): RecipeGraphData {
  return {
    recipe: {
      id: "recipe-1",
      created: "",
      updated: "",
      collectionId: "recipes",
      collectionName: "recipes",
      name: "White Bean Stew",
    } as RecipeGraphData["recipe"],
    productNodes: [node],
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
  };
}

describe("applyVariantOverrides — substitute quantity/unit threading (SHOP-03, D-07/D-09)", () => {
  it("a full override {quantity, unit} changes the replacement node's quantity/unit", () => {
    const originalNode = makeNode({ quantity: 3, unit: "cup" });
    const recipeData = makeRecipeData(originalNode);
    const replacementProduct = makeProduct({ id: "canola-oil", name: "Canola Oil" });
    const override: VariantOverride = {
      originalNodeId: originalNode.id,
      replacementProduct,
      quantity: 2,
      unit: "cup",
    };

    const result = applyVariantOverrides(recipeData, [override]);
    const replacementNode = result.productNodes.find((n) => n.id === originalNode.id);

    expect(replacementNode).toBeDefined();
    expect(replacementNode!.quantity).toBe(2);
    expect(replacementNode!.unit).toBe("cup");
    expect(replacementNode!.product).toBe("canola-oil");
  });

  it("a null-quantity/null-unit override inherits the original node's quantity/unit unchanged", () => {
    const originalNode = makeNode({ quantity: 3, unit: "cup" });
    const recipeData = makeRecipeData(originalNode);
    const replacementProduct = makeProduct({ id: "canola-oil", name: "Canola Oil" });
    const override: VariantOverride = {
      originalNodeId: originalNode.id,
      replacementProduct,
      quantity: null,
      unit: null,
    };

    const result = applyVariantOverrides(recipeData, [override]);
    const replacementNode = result.productNodes.find((n) => n.id === originalNode.id);

    expect(replacementNode).toBeDefined();
    expect(replacementNode!.quantity).toBe(3);
    expect(replacementNode!.unit).toBe("cup");
  });

  it("an omitted quantity/unit override (no fields set at all) inherits the original node's values", () => {
    const originalNode = makeNode({ quantity: 3, unit: "cup" });
    const recipeData = makeRecipeData(originalNode);
    const replacementProduct = makeProduct({ id: "canola-oil", name: "Canola Oil" });
    const override: VariantOverride = {
      originalNodeId: originalNode.id,
      replacementProduct,
    };

    const result = applyVariantOverrides(recipeData, [override]);
    const replacementNode = result.productNodes.find((n) => n.id === originalNode.id);

    expect(replacementNode).toBeDefined();
    expect(replacementNode!.quantity).toBe(3);
    expect(replacementNode!.unit).toBe("cup");
  });

  it("a partial override {quantity: 2, unit: null} sets quantity but inherits the original unit", () => {
    const originalNode = makeNode({ quantity: 3, unit: "cup" });
    const recipeData = makeRecipeData(originalNode);
    const replacementProduct = makeProduct({ id: "canola-oil", name: "Canola Oil" });
    const override: VariantOverride = {
      originalNodeId: originalNode.id,
      replacementProduct,
      quantity: 2,
      unit: null,
    };

    const result = applyVariantOverrides(recipeData, [override]);
    const replacementNode = result.productNodes.find((n) => n.id === originalNode.id);

    expect(replacementNode).toBeDefined();
    expect(replacementNode!.quantity).toBe(2);
    expect(replacementNode!.unit).toBe("cup");
  });

  it("preserves other node fields and the replacement product relation via spread", () => {
    const originalNode = makeNode({
      quantity: 3,
      unit: "cup",
      meal_destination: "freezer",
    });
    const recipeData = makeRecipeData(originalNode);
    const replacementProduct = makeProduct({ id: "canola-oil", name: "Canola Oil" });
    const override: VariantOverride = {
      originalNodeId: originalNode.id,
      replacementProduct,
      quantity: 2,
      unit: "cup",
    };

    const result = applyVariantOverrides(recipeData, [override]);
    const replacementNode = result.productNodes.find((n) => n.id === originalNode.id);

    expect(replacementNode).toBeDefined();
    expect(replacementNode!.meal_destination).toBe("freezer");
    expect(replacementNode!.expand?.product?.id).toBe("canola-oil");
    expect(replacementNode!.expand?.product?.name).toBe("Canola Oil");
  });
});

describe("applyVariantOverrides — raw-ingredient swap keeps downstream prep edges (SHOP-03 gap)", () => {
  // A raw ingredient node (sweet potato) feeds a prep step (dice), which
  // outputs a diced node. Swapping the raw ingredient must KEEP the
  // product->step edge so the prep step re-derives with the new product as
  // its input — it must NOT sever the swapped node from the step it feeds.
  function makeRawFeedsPrepData(): RecipeGraphData {
    const rawNode: ExpandedProductNode = {
      id: "sp-node",
      created: "",
      updated: "",
      collectionId: "recipe_product_nodes",
      collectionName: "recipe_product_nodes",
      recipe: "recipe-1",
      product: "sweet-potato",
      quantity: 2,
      unit: "each",
      expand: {
        product: makeProduct({ id: "sweet-potato", name: "sweet potato" }),
      },
    };
    const dicedNode: ExpandedProductNode = {
      id: "diced-node",
      created: "",
      updated: "",
      collectionId: "recipe_product_nodes",
      collectionName: "recipe_product_nodes",
      recipe: "recipe-1",
      product: "diced-sweet-potato",
      quantity: 2,
      unit: "each",
      expand: {
        product: makeProduct({
          id: "diced-sweet-potato",
          name: "diced sweet potato",
        }),
      },
    };
    return {
      recipe: {
        id: "recipe-1",
        created: "",
        updated: "",
        collectionId: "recipes",
        collectionName: "recipes",
        name: "Roasted Sweet Potato",
      } as RecipeGraphData["recipe"],
      productNodes: [rawNode, dicedNode],
      steps: [
        {
          id: "dice-step",
          created: "",
          updated: "",
          collectionId: "recipe_steps",
          collectionName: "recipe_steps",
          recipe: "recipe-1",
          name: "dice sweet potato (large dice)",
          step_type: StepType.Prep,
        },
      ],
      productToStepEdges: [
        {
          id: "e1",
          created: "",
          updated: "",
          collectionId: "product_to_step_edges",
          collectionName: "product_to_step_edges",
          recipe: "recipe-1",
          source: "sp-node",
          target: "dice-step",
        },
      ],
      stepToProductEdges: [
        {
          id: "e2",
          created: "",
          updated: "",
          collectionId: "step_to_product_edges",
          collectionName: "step_to_product_edges",
          recipe: "recipe-1",
          source: "dice-step",
          target: "diced-node",
        },
      ],
    };
  }

  it("keeps the product->step edge so the swapped ingredient still feeds the prep step", () => {
    const recipeData = makeRawFeedsPrepData();
    const override: VariantOverride = {
      originalNodeId: "sp-node",
      replacementProduct: makeProduct({ id: "potato", name: "potato (russet)" }),
    };

    const result = applyVariantOverrides(recipeData, [override]);

    // The dice step must survive and still receive the swapped node as input.
    expect(result.steps.some((s) => s.id === "dice-step")).toBe(true);
    const inputEdge = result.productToStepEdges.find(
      (e) => e.source === "sp-node" && e.target === "dice-step"
    );
    expect(inputEdge).toBeDefined();

    // And that node now resolves to the replacement product, so the step's
    // derived input re-derives to potato rather than sweet potato.
    const swappedNode = result.productNodes.find((n) => n.id === "sp-node");
    expect(swappedNode?.expand?.product?.name).toBe("potato (russet)");
  });
});
