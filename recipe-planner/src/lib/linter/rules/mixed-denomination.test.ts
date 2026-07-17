import { describe, it, expect } from "vitest";
import { lintMixedDenomination, MIN_SUBUNIT_COUNT } from "./mixed-denomination";
import type { ProductExpanded } from "../index";
import { ProductType } from "../../types";

function product(
  name: string,
  type: ProductType,
  nodes: { unit?: string; quantity?: number }[]
): ProductExpanded {
  return { id: name, name, type, nodes } as unknown as ProductExpanded;
}

const eaches = (...qs: number[]) => qs.map((quantity) => ({ unit: "each", quantity }));

describe("linter — mixed-denomination", () => {
  it("flags a raw product mixing a fractional quantity with a sub-unit count (the live thyme case)", () => {
    // thyme (fresh) as it stands in prod 2026-07-16: 0.5 and 1 read as
    // packages/bunches, 3 and 8 read as sprigs — all inside one `each`.
    const findings = lintMixedDenomination([
      product("thyme (fresh)", ProductType.Raw, eaches(0.5, 1, 3, 8)),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("mixed-denomination");
    expect(findings[0].productId).toBe("thyme (fresh)");
    // A heuristic must not block a publish — see the rule header.
    expect(findings[0].severity).toBe("warning");
    // The message has to carry the evidence, or a human can't dismiss it.
    expect(findings[0].message).toContain("0.5");
    expect(findings[0].message).toContain("8");
  });

  it("does NOT flag a fractional quantity alone — half a red onion is ordinary", () => {
    // Fractional-only flagged 9 real prod nodes (red onion, cucumber, lettuce,
    // basil...). All legitimate. This is why the rule needs the conjunction.
    expect(
      lintMixedDenomination([
        product("onion (red)", ProductType.Raw, eaches(0.5, 0.5, 1, 2)),
      ])
    ).toEqual([]);
  });

  it("does NOT flag a high count alone — 8 eggs is ordinary", () => {
    expect(
      lintMixedDenomination([
        product("egg", ProductType.Raw, eaches(1, 1, 6, 6, 8)),
      ])
    ).toEqual([]);
  });

  it("does NOT flag prod's real 0.25-to-2 produce spreads (why the threshold is 3, not 2)", () => {
    // cucumber and onion (yellow) verbatim from prod. At MIN_SUBUNIT_COUNT=2
    // both would flag; both are correct data.
    expect(
      lintMixedDenomination([
        product("cucumber", ProductType.Raw, eaches(0.25, 1, 1, 1, 1, 2, 2)),
        product("onion (yellow)", ProductType.Raw, eaches(0.25, 1, 1, 1, 1, 1, 2)),
      ])
    ).toEqual([]);
    expect(MIN_SUBUNIT_COUNT).toBe(3);
  });

  it("does NOT flag a non-raw product — a batch producer's big output count is not this bug", () => {
    // `chicken breast cooked stored` PRODUCES 8 and is consumed at 1 and 2;
    // `indian food with vegetable` PRODUCES 5, consumed at 1. Legitimate, and
    // indistinguishable from mixing without step edges. Given a fractional
    // node they would otherwise trip the rule — the Raw guard is what stops it.
    for (const type of [
      ProductType.Inventory,
      ProductType.Stored,
      ProductType.Transient,
    ]) {
      expect(
        lintMixedDenomination([product("batched thing", type, eaches(0.5, 8))])
      ).toEqual([]);
    }
  });

  it("resolves aliases before judging, so `sprig`/`cube` are seen as the count unit they became", () => {
    // The bug enters through normalizeUnit; the rule must see the same units
    // aggregation does. `sprig` -> each (commit 1e3dfd1) is exactly the vector.
    const findings = lintMixedDenomination([
      product("thyme (fresh)", ProductType.Raw, [
        { unit: "each", quantity: 0.5 },
        { unit: "sprigs", quantity: 8 },
      ]),
    ]);
    expect(findings).toHaveLength(1);
  });

  it("KNOWN LIMITATION: does NOT catch the garlic variant — integer-only spreads leave no trace", () => {
    // `garlic cubes (frozen)` as it stood pre-fix: 1,1,1,2,2,3,3 — the 3s meant
    // "3 cloves", the 1s meant "1 cube", and nothing in the numbers says which.
    // Documented so nobody assumes this rule covers the case that motivated it.
    // Garlic was only detectable from recipe prose ("Pull 3 garlic cubes"),
    // which this rule's input doesn't carry. Do not "fix" this by lowering
    // MIN_SUBUNIT_COUNT or dropping the fractional requirement — that trades a
    // silent miss for a flood of false positives (see the two tests above).
    const garlicQuantities = [1, 1, 1, 2, 2, 3, 3];
    expect(
      lintMixedDenomination([
        product("garlic cubes (frozen)", ProductType.Raw, eaches(...garlicQuantities)),
      ])
    ).toEqual([]);
  });

  it("ignores non-count dimensions — a fractional cup is just a measurement", () => {
    expect(
      lintMixedDenomination([
        product("olive oil", ProductType.Raw, [
          { unit: "cup", quantity: 0.5 },
          { unit: "cup", quantity: 4 },
        ]),
      ])
    ).toEqual([]);
  });

  it("ignores unresolvable units and zero/absent quantities rather than guessing (D-08)", () => {
    expect(
      lintMixedDenomination([
        product("mystery", ProductType.Raw, [
          { unit: "serving", quantity: 0.5 },
          { unit: "serving", quantity: 8 },
        ]),
        product("empty-unit", ProductType.Raw, [
          { unit: "", quantity: 0.5 },
          { unit: "each", quantity: 8 },
        ]),
        product("zero-qty", ProductType.Raw, [
          { unit: "each", quantity: 0 },
          { unit: "each", quantity: 8 },
        ]),
        product("no-nodes", ProductType.Raw, []),
      ])
    ).toEqual([]);
  });
});
