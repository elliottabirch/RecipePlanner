import { describe, expect, it } from "vitest";
import { searchProducts, scoreProduct } from "./product-search";
import { ProductType, type Product } from "../types";

function makeProduct(id: string, name: string): Product {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "products",
    collectionName: "products",
    name,
    type: ProductType.Raw,
  };
}

const FIXTURE: Product[] = [
  makeProduct("1", "tomato paste"),
  makeProduct("2", "tomato sauce"),
  makeProduct("3", "garbanzo"),
  makeProduct("4", "black beans"),
  makeProduct("5", "olive oil"),
  makeProduct("6", "chicken stock"),
];

describe("searchProducts — REG-02 fuzzy/token search", () => {
  it("ranks 'tomato paste' first for the reordered query 'paste tomato' (word-order independence)", () => {
    const results = searchProducts("paste tomato", FIXTURE);
    expect(results[0].name).toBe("tomato paste");
  });

  it("matches 'garbanzo' for the typo query 'garbonzo' (per-term typo tolerance)", () => {
    const results = searchProducts("garbonzo", FIXTURE);
    expect(results.some((p) => p.name === "garbanzo")).toBe(true);
  });

  it("returns the full products array unchanged for an empty query", () => {
    const results = searchProducts("", FIXTURE);
    expect(results).toEqual(FIXTURE);
  });

  it("returns the full products array unchanged for a whitespace-only query", () => {
    const results = searchProducts("   ", FIXTURE);
    expect(results).toEqual(FIXTURE);
  });
});

describe("scoreProduct — scored fuzzy matcher (D-02 gate)", () => {
  it("returns entries sorted best-first with a numeric score", () => {
    const results = scoreProduct("garbanzo", FIXTURE);
    expect(results.length).toBeGreaterThan(0);
    expect(typeof results[0].score).toBe("number");
    expect(results[0].product.name).toBe("garbanzo");
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i - 1].score);
    }
  });

  it("scores an exact-name match at or near 0", () => {
    const results = scoreProduct("olive oil", FIXTURE);
    expect(results[0].product.name).toBe("olive oil");
    expect(results[0].score).toBeLessThan(0.1);
  });

  it("exposes the original Product reference (not the internal indexed copy)", () => {
    const results = scoreProduct("garbanzo", FIXTURE);
    expect(results[0].product).toBe(FIXTURE.find((p) => p.name === "garbanzo"));
    // no leaked _sortedTokens/__original indexing fields on the returned product
    expect("_sortedTokens" in results[0].product).toBe(false);
    expect("__original" in results[0].product).toBe(false);
  });

  it("reuses FUSE_OPTIONS: 'paste tomato' ranks 'tomato paste' first (word-order)", () => {
    const results = scoreProduct("paste tomato", FIXTURE);
    expect(results[0].product.name).toBe("tomato paste");
  });

  it("ranks the exact match above unrelated products (or omits them)", () => {
    const results = scoreProduct("garbanzo", FIXTURE);
    expect(results[0].product.name).toBe("garbanzo");
    const oil = results.find((r) => r.product.name === "olive oil");
    if (oil) expect(oil.score).toBeGreaterThan(results[0].score);
  });

  it("returns [] for an empty / whitespace query (no scoring on empty input)", () => {
    expect(scoreProduct("", FIXTURE)).toEqual([]);
    expect(scoreProduct("   ", FIXTURE)).toEqual([]);
  });
});
