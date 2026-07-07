import { describe, it, expect, vi } from "vitest";
import { resolveSeedRow, buildNearMatchFn } from "./seed-usda.js";

// Pure-function resolver tests — no live PocketBase DB, per 03-04-PLAN.md
// Task 2: "no live DB". `existingRawByName`/`existingAllByName` fixtures are
// plain in-memory Maps standing in for what main() would build from a
// getFullList() snapshot.

function rawFixture(overrides = {}) {
  return {
    id: "raw_1",
    name: "chicken stock",
    type: "raw",
    fdc_id: null,
    usda_data_type: "",
    usda_category: null,
    ...overrides,
  };
}

function seedRowFixture(overrides = {}) {
  return {
    name: "chicken stock",
    storeId: "store_1",
    sectionId: "section_1",
    fdc_id: 12345,
    usda_data_type: "foundation_food",
    usda_category: "Soups, Sauces, and Gravies",
    canonical_unit: null,
    dimension: null,
    ...overrides,
  };
}

describe("resolveSeedRow", () => {
  it("BACKFILL: exact case-insensitive match with an empty fdc_id backfills usda_* fields", () => {
    const existing = rawFixture({ id: "raw_1", name: "Chicken Stock", fdc_id: null });
    const existingRawByName = new Map([["chicken stock", existing]]);
    const row = seedRowFixture();
    const nearMatchFn = vi.fn(() => []);

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn);

    expect(result.action).toBe("BACKFILL");
    expect(result.existing.id).toBe("raw_1");
    expect(result.patch).toEqual({
      fdc_id: 12345,
      usda_data_type: "foundation_food",
      usda_category: "Soups, Sauces, and Gravies",
    });
    // Exact match resolved — no fuzzy near-match lookup needed.
    expect(nearMatchFn).not.toHaveBeenCalled();
  });

  it("SKIP: exact match that already has an fdc_id is a no-op (never auto-merges further)", () => {
    const existing = rawFixture({ id: "raw_2", name: "onion", fdc_id: 999 });
    const existingRawByName = new Map([["onion", existing]]);
    const row = seedRowFixture({ name: "onion", fdc_id: 111 });
    const nearMatchFn = vi.fn(() => []);

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn);

    expect(result.action).toBe("SKIP");
    expect(result.existing.id).toBe("raw_2");
    expect(result.patch).toBeUndefined();
  });

  it("SKIP_REVIEW: a conservative fuzzy near-match is never auto-inserted or auto-merged", () => {
    const existingRawByName = new Map(); // no exact match
    const nearMatch = { product: rawFixture({ id: "raw_3", name: "garbanzo beans" }), score: 0.12 };
    const nearMatchFn = vi.fn(() => [nearMatch]);
    const row = seedRowFixture({ name: "garbonzo beans" });

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn);

    expect(result.action).toBe("SKIP_REVIEW");
    expect(result.action).not.toBe("INSERT");
    expect(result.action).not.toBe("MERGE");
    expect(result.nearMatches).toHaveLength(1);
    expect(result.nearMatches[0].product.name).toBe("garbanzo beans");
  });

  it("INSERT: a genuine miss (no exact, no near-match) inserts a new raw product", () => {
    const existingRawByName = new Map();
    const nearMatchFn = vi.fn(() => []);
    const row = seedRowFixture({
      name: "dragon fruit",
      storeId: "store_9",
      sectionId: "section_9",
      fdc_id: null,
      usda_data_type: null,
      usda_category: null,
      canonical_unit: "each",
      dimension: "count",
    });

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn);

    expect(result.action).toBe("INSERT");
    expect(result.payload).toMatchObject({
      name: "dragon fruit",
      type: "raw",
      store: "store_9",
      section: "section_9",
      canonical_unit: "each",
      dimension: "count",
    });
  });

  it("cross-type name collision does NOT block the raw insert — it is flagged for review only", () => {
    const existingRawByName = new Map(); // no raw "chicken stock" yet
    const existingAllByName = new Map([
      ["chicken stock", [rawFixture({ id: "stored_1", name: "chicken stock", type: "stored", fdc_id: null })]],
    ]);
    const nearMatchFn = vi.fn(() => []);
    const row = seedRowFixture();

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn, existingAllByName);

    // The raw insert still proceeds — cross-type is a soft flag, not a hard block.
    expect(result.action).toBe("INSERT");
    expect(result.crossTypeCollision).toBeDefined();
    expect(result.crossTypeCollision).toHaveLength(1);
    expect(result.crossTypeCollision[0].type).toBe("stored");
  });

  it("does not flag a cross-type collision when no other-type product shares the name", () => {
    const existingRawByName = new Map();
    const existingAllByName = new Map(); // nothing shares this name at all
    const nearMatchFn = vi.fn(() => []);
    const row = seedRowFixture({ name: "dragon fruit" });

    const result = resolveSeedRow(row, existingRawByName, nearMatchFn, existingAllByName);

    expect(result.action).toBe("INSERT");
    expect(result.crossTypeCollision).toBeUndefined();
  });
});

describe("buildNearMatchFn (tight ~0.2 hard-dedup threshold)", () => {
  it("flags a real near-typo as a near-match under the tight threshold", () => {
    const existingRaw = [rawFixture({ id: "raw_4", name: "garbanzo beans" })];
    const nearMatchFn = buildNearMatchFn(existingRaw);

    const matches = nearMatchFn({ name: "garbonzo beans" });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.name).toBe("garbanzo beans");
    expect(matches[0].score).toBeLessThan(0.2);
  });

  it("does not flag an unrelated name as a near-match", () => {
    const existingRaw = [rawFixture({ id: "raw_5", name: "garbanzo beans" })];
    const nearMatchFn = buildNearMatchFn(existingRaw);

    const matches = nearMatchFn({ name: "watermelon" });

    expect(matches).toHaveLength(0);
  });
});
