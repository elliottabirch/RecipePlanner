import { describe, expect, it } from "vitest";
import { searchProducts } from "./product-search";
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
