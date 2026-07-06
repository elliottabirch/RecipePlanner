import { describe, expect, it } from "vitest";
import { ProductType, type Product } from "../../types";
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
