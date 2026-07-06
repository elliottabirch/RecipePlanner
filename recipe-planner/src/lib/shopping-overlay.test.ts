import { describe, it, expect } from "vitest";
import {
  overlayShoppingItem,
  filterForExport,
  type ShoppingStateEntry,
  type OverlaidShoppingItem,
} from "./shopping-overlay";
import type { AggregatedProduct } from "./aggregation";
import { getShoppingCheckboxKey } from "../constants/outputs";
import { ProductType } from "./types";

function makeItem(overrides: Partial<AggregatedProduct> = {}): AggregatedProduct {
  return {
    productId: "prod-1",
    productName: "Olive Oil",
    productType: ProductType.Raw,
    isPantry: false,
    totalQuantity: 3,
    unit: "cup",
    lineId: "prod-1",
    sources: [],
    ...overrides,
  };
}

describe("overlayShoppingItem", () => {
  it("returns haveQuantity null, remaining null, resolution 'buy', isResolved false when no state entry exists", () => {
    const item = makeItem();
    const state = new Map<string, ShoppingStateEntry>();

    const result = overlayShoppingItem(item, state);

    expect(result.haveQuantity).toBeNull();
    expect(result.remaining).toBeNull();
    expect(result.resolution).toBe("buy");
    expect(result.isResolved).toBe(false);
  });

  it("computes remaining = max(0, totalQuantity - have) when have_quantity is set", () => {
    const item = makeItem({ totalQuantity: 3 });
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: 1, resolution: "buy" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.haveQuantity).toBe(1);
    expect(result.remaining).toBe(2);
    expect(result.isResolved).toBe(false);
  });

  it("clamps remaining to 0 (never negative) when have exceeds needed", () => {
    const item = makeItem({ totalQuantity: 2 });
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: 5, resolution: "buy" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.remaining).toBe(0);
  });

  it("marks isResolved true when remaining <= 0 (have-complete)", () => {
    const item = makeItem({ totalQuantity: 2 });
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: 2, resolution: "buy" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.remaining).toBe(0);
    expect(result.isResolved).toBe(true);
  });

  it("marks isResolved true when resolution is 'make', independent of remaining", () => {
    const item = makeItem({ totalQuantity: 3 });
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: null, resolution: "make" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.resolution).toBe("make");
    expect(result.remaining).toBeNull();
    expect(result.isResolved).toBe(true);
  });

  it("marks isResolved true when resolution is 'skip'", () => {
    const item = makeItem();
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: null, resolution: "skip" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.resolution).toBe("skip");
    expect(result.isResolved).toBe(true);
  });

  it("keeps isResolved false for resolution 'buy' with remaining > 0", () => {
    const item = makeItem({ totalQuantity: 5 });
    const state = new Map<string, ShoppingStateEntry>([
      [getShoppingCheckboxKey(item.lineId), { have_quantity: 1, resolution: "buy" }],
    ]);

    const result = overlayShoppingItem(item, state);

    expect(result.remaining).toBe(4);
    expect(result.isResolved).toBe(false);
  });
});

describe("filterForExport", () => {
  function overlaid(overrides: Partial<OverlaidShoppingItem>): OverlaidShoppingItem {
    return {
      ...makeItem(),
      haveQuantity: null,
      remaining: null,
      resolution: "buy",
      isResolved: false,
      ...overrides,
    };
  }

  it("excludes make-resolved lines from the export (D-06)", () => {
    const items = [overlaid({ productId: "a", resolution: "make", isResolved: true })];
    expect(filterForExport(items)).toEqual([]);
  });

  it("excludes skip-resolved lines from the export (D-06)", () => {
    const items = [overlaid({ productId: "b", resolution: "skip", isResolved: true })];
    expect(filterForExport(items)).toEqual([]);
  });

  it("excludes have-complete lines from the export (D-06)", () => {
    const items = [
      overlaid({ productId: "c", resolution: "buy", remaining: 0, isResolved: true }),
    ];
    expect(filterForExport(items)).toEqual([]);
  });

  it("keeps buy-with-remaining lines in the export", () => {
    const buyLine = overlaid({
      productId: "d",
      resolution: "buy",
      remaining: 2,
      isResolved: false,
    });
    expect(filterForExport([buyLine])).toEqual([buyLine]);
  });

  it("filters a mixed list down to only unresolved lines", () => {
    const keep = overlaid({ productId: "keep", isResolved: false });
    const drop1 = overlaid({ productId: "drop1", resolution: "make", isResolved: true });
    const drop2 = overlaid({ productId: "drop2", resolution: "skip", isResolved: true });
    const result = filterForExport([keep, drop1, drop2]);
    expect(result).toEqual([keep]);
  });
});
