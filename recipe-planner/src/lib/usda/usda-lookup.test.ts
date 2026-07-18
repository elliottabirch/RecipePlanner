import { describe, expect, it, vi } from "vitest";

// Small deterministic fixture (per 03-05-PLAN.md's instruction to keep this
// test fast and deterministic, rather than depending on the ~7.8k-row real
// bundled asset's exact contents/ordering). Mocks the bundled JSON import so
// usda-lookup.ts's static import resolves to this fixture instead of the
// real ~7.8k-row asset.
const FIXTURE = [
  { name: "Cheese, cheddar", foodCategory: "Dairy and Egg Products", fdc_id: 111 },
  { name: "Cheese, cottage", foodCategory: "Dairy and Egg Products", fdc_id: 112 },
  { name: "Tomatoes, red, ripe, raw", foodCategory: "Vegetables and Vegetable Products", fdc_id: 222 },
  { name: "Beef, ground, raw", foodCategory: "Beef Products", fdc_id: 333 },
];

vi.mock("../../assets/usda-sr-legacy.json", () => ({ default: FIXTURE }));

const { searchUsda } = await import("./usda-lookup");
const { plainNameFromUsda } = await import("./plain-name");
const { sectionIdForCategory } = await import("./category-section-map");

describe("searchUsda — REG-03 bundled Search-USDA index lookup", () => {
  it("returns fdc_id-bearing candidates for a real query, ranked so a 'cheddar cheese' entry appears near the top", () => {
    const results = searchUsda("cheddar");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain("cheddar");
    expect(typeof results[0].fdc_id).toBe("number");
  });

  it("returns [] for an empty query (does not dump the whole index)", () => {
    expect(searchUsda("")).toEqual([]);
  });

  it("returns [] for a whitespace-only query", () => {
    expect(searchUsda("   ")).toEqual([]);
  });
});

describe("plainNameFromUsda — plain editable name for Quick-Create prefill", () => {
  it("singularizes the head noun and drops the trailing preparation state", () => {
    // The canonical case from the usda-search-plain-rename todo.
    expect(plainNameFromUsda("Kumquats, raw")).toBe("kumquat");
  });

  it("keeps only the head segment for comma-inverted produce", () => {
    expect(plainNameFromUsda("Beans, snap, green, raw")).toBe("bean");
    expect(plainNameFromUsda("Tomatoes, red, ripe, raw")).toBe("tomato");
  });

  it("singularizes -oes/-ies head nouns correctly", () => {
    expect(plainNameFromUsda("Potatoes, baked, skin, without salt")).toBe(
      "potato"
    );
    expect(plainNameFromUsda("Berries, mixed, frozen")).toBe("berry");
  });

  it("preserves a multi-word head noun and lowercases it", () => {
    expect(plainNameFromUsda("Sweet potato, raw, unprepared")).toBe(
      "sweet potato"
    );
  });

  it("drops a parenthetical aside in the head segment", () => {
    expect(
      plainNameFromUsda("Pork, fresh, loin, sirloin (roasts), boneless")
    ).toBe("pork");
    expect(plainNameFromUsda("Oil (partially hydrogenated), soy")).toBe("oil");
  });

  it("leaves a comma-free plain description essentially as-is (lowercased)", () => {
    expect(plainNameFromUsda("Pretzels")).toBe("pretzel");
  });

  it("does not mangle a double-s word or a short head token", () => {
    expect(plainNameFromUsda("Watercress, raw")).toBe("watercress");
    expect(plainNameFromUsda("Egg, whole, raw, fresh")).toBe("egg");
  });
});

describe("sectionIdForCategory — category→section map for prefill", () => {
  it("maps a dairy category to the dairy section", () => {
    expect(sectionIdForCategory("Dairy and Egg Products")).toBe("dairy");
  });

  it("maps a vegetable category to the produce section", () => {
    expect(sectionIdForCategory("Vegetables and Vegetable Products")).toBe("produce");
  });

  it("returns undefined for an unmapped category", () => {
    expect(sectionIdForCategory("Some Unrecognized Category")).toBeUndefined();
  });
});
