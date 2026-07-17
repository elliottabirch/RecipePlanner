import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductType, type Product } from "../../types";
import type { ExpandedProductNode } from "../types.js";
import type { Unit } from "../../units";
import { convert } from "../../units";
import type { AggregatedFlowProduct } from "../types.js";
import {
  buildAggregatedProduct,
  addOrMergeProduct,
} from "./product-builder";

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

function makeNode(
  quantity: number,
  unit: string,
  overrides: Partial<ExpandedProductNode> = {}
): ExpandedProductNode {
  return {
    id: `node-${unit}-${quantity}`,
    created: "",
    updated: "",
    collectionId: "recipe_product_nodes",
    collectionName: "recipe_product_nodes",
    recipe: "recipe-1",
    product: "olive-oil",
    quantity,
    unit,
    ...overrides,
  };
}

/**
 * Drive the two builder functions the way processRecipeProducts does, for
 * a single product appearing as N nodes within the same recipe/meal.
 */
function mergeNodesForProduct(
  product: Product,
  nodes: ExpandedProductNode[],
  recipeName = "White Bean Stew",
  mealCount = 1,
  plannedMealId = "meal-1"
) {
  const products = new Map();
  nodes.forEach((node) => {
    const { key, product: aggregatedProduct, instances } =
      buildAggregatedProduct(node, product, recipeName, mealCount, plannedMealId);
    addOrMergeProduct(
      products,
      key,
      aggregatedProduct,
      instances,
      plannedMealId,
      node.meal_destination
    );
  });
  return products;
}

/**
 * Drive the two builder functions across MULTIPLE meals sharing ONE
 * products Map — `mergeNodesForProduct` is single-meal (fixed recipeName +
 * plannedMealId) and cannot express a cross-recipe merge. Each entry
 * supplies its own recipeName + plannedMealId, mirroring how
 * `processRecipeProducts` is invoked once per planned meal in the real
 * aggregation flow.
 */
function mergeNodesAcrossMeals(
  product: Product,
  entries: {
    node: ExpandedProductNode;
    recipeName: string;
    plannedMealId: string;
    mealCount?: number;
  }[]
): Map<string, AggregatedFlowProduct> {
  const products = new Map<string, AggregatedFlowProduct>();
  entries.forEach(({ node, recipeName, plannedMealId, mealCount = 1 }) => {
    const {
      key,
      product: aggregatedProduct,
      instances,
    } = buildAggregatedProduct(node, product, recipeName, mealCount, plannedMealId);
    addOrMergeProduct(
      products,
      key,
      aggregatedProduct,
      instances,
      plannedMealId,
      node.meal_destination
    );
  });
  return products;
}

describe("product-builder — convert-or-split merge (DATA-01)", () => {
  it("white-bean anchor: merges 0.25 cup + 2 tbsp olive oil into one line, lineId === productId", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    expect(products.size).toBe(1);
    const line = products.get("olive-oil")!;
    expect(line.lineId).toBe("olive-oil");
    expect(line.productId).toBe("olive-oil");

    // Magnitude check (unit-independent): the merged total must equal
    // 6 tbsp worth of olive oil, whichever display unit was chosen.
    const totalInTbsp = convert(
      line.totalQuantity,
      line.unit as Unit,
      "tbsp"
    );
    expect(totalInTbsp).not.toBeNull();
    expect(totalInTbsp as number).toBeCloseTo(6, 5);
  });

  it("merges within-dimension regardless of node order (order-independent total)", () => {
    const product = makeProduct();
    const forward = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);
    const reversed = mergeNodesForProduct(product, [
      makeNode(2, "tbsp"),
      makeNode(0.25, "cup"),
    ]);

    const forwardTotalTbsp = convert(
      forward.get("olive-oil")!.totalQuantity,
      forward.get("olive-oil")!.unit as Unit,
      "tbsp"
    );
    const reversedTotalTbsp = convert(
      reversed.get("olive-oil")!.totalQuantity,
      reversed.get("olive-oil")!.unit as Unit,
      "tbsp"
    );

    expect(forwardTotalTbsp).toBeCloseTo(reversedTotalTbsp as number, 5);
  });

  it("converts into canonical_unit when set on the product (D-10 primary path)", () => {
    const product = makeProduct({ canonical_unit: "cup" as Unit });
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    const line = products.get("olive-oil")!;
    expect(line.unit).toBe("cup");
    expect(line.totalQuantity).toBeCloseTo(0.375, 5);
  });

  it("cross-dimension: cup + lb split into two distinct, lineId-keyed lines with no summed total", () => {
    const product = makeProduct({ id: "mystery-product" });
    const products = mergeNodesForProduct(product, [
      makeNode(1, "cup", { product: "mystery-product" }),
      makeNode(1, "lb", { product: "mystery-product" }),
    ]);

    expect(products.size).toBe(2);

    const volumeLine = products.get("mystery-product")!;
    const massLine = products.get("mystery-product|mass")!;

    expect(volumeLine.lineId).toBe("mystery-product");
    expect(massLine.lineId).toBe("mystery-product|mass");
    expect(volumeLine.lineId).not.toBe(massLine.lineId);

    // Neither line is a false cross-dimension sum: each keeps its own
    // dimension's single-node quantity untouched.
    expect(volumeLine.unit).toBe("cup");
    expect(volumeLine.totalQuantity).toBeCloseTo(1, 5);
    expect(massLine.unit).toBe("lb");
    expect(massLine.totalQuantity).toBeCloseTo(1, 5);
  });

  it("single-line (non-split) products keep lineId === productId exactly", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [makeNode(3, "tsp")]);

    expect(products.size).toBe(1);
    const line = products.get("olive-oil")!;
    expect(line.lineId).toBe(line.productId);
    expect(line.lineId).toBe("olive-oil");
  });

  it("per-source (mealSources) quantities are tracked with their own original unit", () => {
    const product = makeProduct();
    const products = mergeNodesForProduct(product, [
      makeNode(0.25, "cup"),
      makeNode(2, "tbsp"),
    ]);

    const line = products.get("olive-oil")!;
    // Same recipe, two nodes -> meal sources merge into one entry (unit-safe).
    expect(line.mealSources).toHaveLength(1);
    expect(line.mealSources[0].recipeName).toBe("White Bean Stew");
    const sourceInTbsp = convert(
      line.mealSources[0].quantity,
      line.mealSources[0].unit as Unit,
      "tbsp"
    );
    expect(sourceInTbsp).not.toBeNull();
    expect(sourceInTbsp as number).toBeCloseTo(6, 5);
  });
});

// ============================================================================
// 260716-rpp Task 2 — alias unit normalization at the read boundary.
//
// Framed honestly per planning_findings #1: ZERO alias units exist in prod
// today (the Phase 01-08 sweep already flattened them). These tests pin
// LATENT-bug prevention — nothing here changes visible behavior on current
// data, but they prove the read-boundary normalize (product-builder.ts:37)
// correctly merges/ceils an alias unit exactly like its canonical form, and
// that a non-empty unresolvable unit warns instead of silently splitting.
// ============================================================================

describe("product-builder — alias unit normalization (260716-rpp Task 2, latent-bug prevention)", () => {
  it('alias merge: two meals both using "cube" merge into one summed line, no split key', () => {
    const product = makeProduct({ id: "garlic-cubes-alias" });
    const products = mergeNodesAcrossMeals(product, [
      {
        node: makeNode(2, "cube", { product: "garlic-cubes-alias" }),
        recipeName: "Recipe A",
        plannedMealId: "meal-a",
      },
      {
        node: makeNode(3, "cube", { product: "garlic-cubes-alias" }),
        recipeName: "Recipe B",
        plannedMealId: "meal-b",
      },
    ]);

    expect(products.size).toBe(1);
    const line = products.get("garlic-cubes-alias")!;
    expect(line.lineId).toBe("garlic-cubes-alias");
    // No dimension-suffixed split key exists anywhere in the map.
    expect([...products.keys()].some((k) => k.includes("|"))).toBe(false);
    expect(line.totalQuantity).toBe(5);
    expect(line.mealSources).toHaveLength(2);
  });

  it('alias discrete ceil: "cube" takes the never-under-buy ceil, same as "each"', () => {
    const product = makeProduct({ id: "garlic-cubes-ceil" });
    const products = mergeNodesAcrossMeals(product, [
      {
        node: makeNode(1, "cube", { product: "garlic-cubes-ceil" }),
        recipeName: "Recipe A",
        plannedMealId: "meal-a",
        mealCount: 2.5,
      },
    ]);

    const line = products.get("garlic-cubes-ceil")!;
    expect(line.totalQuantity).toBe(3);
  });

  it('combined "cloves" + "cube" merge 1:1 into one 4-each line (correct once every node stores a raw count in the product\'s own unit; the 3-cloves-to-1-cube RATIO is deliberately NOT modeled here — deferred to single-purchase-unit-shopping-lines. A future reader must not "fix" this into a 2-each expectation without building that model)', () => {
    const product = makeProduct({ id: "garlic-mixed-alias" });
    const products = mergeNodesAcrossMeals(product, [
      {
        node: makeNode(3, "cloves", { product: "garlic-mixed-alias" }),
        recipeName: "Recipe A",
        plannedMealId: "meal-a",
      },
      {
        node: makeNode(1, "cube", { product: "garlic-mixed-alias" }),
        recipeName: "Recipe B",
        plannedMealId: "meal-b",
      },
    ]);

    expect(products.size).toBe(1);
    const line = products.get("garlic-mixed-alias")!;
    expect(line.unit).toBe("each");
    expect(line.totalQuantity).toBe(4);
  });

  // --------------------------------------------------------------------------
  // PIN the DEFERRED `|undefined` split bug — planning_findings #6.
  //
  // These two tests assert CURRENT (known-wrong) behavior, in BOTH orderings.
  // The naive "absorb a dimensionless zero into the base line" fix is
  // order-dependent (only fires when "" arrives second — d1), and its
  // order-independent form would silently DISCARD the real quantity via the
  // null-merge guard at product-builder.ts:131 (proven by d2: the incoming 8
  // "each" must not be lost when "" already claimed the bare key). See
  // planning_findings #6 for the full analysis of why this is deferred rather
  // than fixed in this plan.
  //
  // When the merge-semantics phase lands, these tests are EXPECTED TO FAIL —
  // rewrite them to the new contract at that time; do not treat a failure here
  // as a regression to revert.
  // --------------------------------------------------------------------------
  describe('PIN: deferred "" (dimensionless) split bug, both orderings', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('d1 — base-first: real 8 each, then dimensionless 0 "" — duplicate line survives, base holds 8, no warn ("" stays quiet)', () => {
      const product = makeProduct({ id: "garlic-pulled-d1" });
      const products = mergeNodesAcrossMeals(product, [
        {
          node: makeNode(8, "each", { product: "garlic-pulled-d1" }),
          recipeName: "Recipe A",
          plannedMealId: "meal-a",
        },
        {
          node: makeNode(0, "", { product: "garlic-pulled-d1" }),
          recipeName: "Recipe B",
          plannedMealId: "meal-b",
        },
      ]);

      expect(products.size).toBe(2);
      const baseLine = products.get("garlic-pulled-d1")!;
      const splitLine = products.get(`garlic-pulled-d1|undefined`)!;
      expect(baseLine).toBeDefined();
      expect(splitLine).toBeDefined();
      expect(baseLine.totalQuantity).toBe(8);
      expect(splitLine.totalQuantity).toBe(0);
      // "" is the deliberate D-01 sentinel (planning_findings #8) — must stay
      // quiet even though it is the thing driving this split.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("d2 — sentinel-first: dimensionless 0 \"\" claims the bare key, then real 8 each is exiled to the split key (NOT dropped) — proves order-dependence", () => {
      const product = makeProduct({ id: "garlic-pulled-d2" });
      const products = mergeNodesAcrossMeals(product, [
        {
          node: makeNode(0, "", { product: "garlic-pulled-d2" }),
          recipeName: "Recipe A",
          plannedMealId: "meal-a",
        },
        {
          node: makeNode(8, "each", { product: "garlic-pulled-d2" }),
          recipeName: "Recipe B",
          plannedMealId: "meal-b",
        },
      ]);

      expect(products.size).toBe(2);
      const bareLine = products.get("garlic-pulled-d2")!;
      const splitLine = products.get("garlic-pulled-d2|count")!;
      expect(bareLine).toBeDefined();
      expect(bareLine.unit).toBe("");
      expect(bareLine.totalQuantity).toBe(0);
      // The real 8 must survive on the split key — this is the proof that
      // an order-independent "absorb" fix must not let it be dropped by the
      // null-merge guard at product-builder.ts:131.
      expect(splitLine).toBeDefined();
      expect(splitLine.unit).toBe("each");
      expect(splitLine.totalQuantity).toBe(8);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
