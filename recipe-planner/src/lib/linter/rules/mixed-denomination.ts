/**
 * Mixed-denomination rule. Flags a raw product whose count-dimension nodes
 * mix TWO physical denominations inside the single `each` unit — the same
 * CLASS of defect as the 2026-07-16 garlic over-pull (quick 260716-rpp),
 * though not the same signature.
 *
 * READ FIRST — this rule would NOT have caught garlic, and that is not a
 * bug in it. Garlic's nodes were `1,1,1,2,2,3,3` on an `inventory` product:
 * every quantity an integer, and the wrong ones (3 = "3 cloves") were
 * indistinguishable from the right ones (3 could equally be 3 cubes). No
 * spread-based signal can separate those, because the evidence — the raw
 * `clove` string — was already gone. Garlic was only ever detectable from
 * recipe PROSE ("Pull 3 garlic cubes" next to a node reading 3), which this
 * rule's product-scoped input does not carry. See the resolved
 * `2026-07-12-garlic-cube-clove-unit-conversion.md` todo. What this rule
 * catches is the thyme variant, where one denomination is fractional and so
 * leaves a trace in the numbers themselves. A prose-based detector is the
 * natural companion and is not built.
 *
 * Why this shape. `UNIT_ALIASES` collapses several sub-units into `each`
 * (`clove`, `cube`, `sprig`, `slices`, `pitas`, `can`, `bunch`, `bu`,
 * `whole`). That resolves a *split* — an unknown unit would otherwise fail
 * `canConvert` against itself and mint its own line — but it silently
 * creates a *mis-merge*: once `3 cloves` and `1 cube` are both `each`, they
 * sum 1:1 as if a clove were a cube. Two real instances shipped this way:
 * `clove -> each` (the Phase 01-08 sweep, garlic) and `sprig -> each`
 * (commit 1e3dfd1, thyme). Nothing catches the next one, because the raw
 * string is gone from the DB the moment it normalizes.
 *
 * The signal. A product is suspicious when its count-unit nodes carry BOTH:
 *   - a FRACTIONAL quantity — you only write 0.5 of something you can
 *     divide, which means the unit denominates a package/bunch, not an
 *     indivisible item; and
 *   - a count >= MIN_SUBUNIT_COUNT — which means someone was counting small
 *     sub-units (8 sprigs, 3 cloves), not packages.
 * Both at once is contradictory: if you buy thyme by the package and use
 * half a package, you never need 8 packages for one recipe.
 *
 * Neither half works alone, which is why the rule needs both. A fractional
 * quantity by itself is ordinary (`0.5` red onion is half an onion, and
 * flagging it produced 9 false positives against prod). A high count by
 * itself is ordinary too (8 eggs). Verified against prod 2026-07-16: this
 * conjunction flags exactly one product (`thyme (fresh)`: 0.5, 1, 3, 8) and
 * nothing else. Dropping the threshold to 2 pulls in `cucumber` (0.25 … 2)
 * and `onion (yellow)` (0.25 … 2), which are both fine.
 *
 * It is a HEURISTIC, hence `warning`, not `error`. A genuine 8-onion batch
 * recipe would trip it against an existing `0.25` onion node. The message
 * therefore states the evidence so a human can dismiss it in one read.
 *
 * Scoped to Raw deliberately. Raw products are purchased, so every node
 * consumes and is denominated in the purchase unit. Non-raw products are
 * produced by a batch step, and a producer legitimately carries a much
 * larger count than its consumers (`chicken breast cooked stored` PRODUCES
 * 8, consumes 1 and 2; `indian food with vegetable` PRODUCES 5, consumes 1)
 * — indistinguishable from this bug without the step edges, which this
 * rule's input does not carry.
 *
 * Only meaningful with registry-wide nodes, because the two denominations
 * usually live in different recipes (thyme's 0.5 is in `vegetable stock`,
 * its 8 in `Creamy Tomato Soup`). Products.tsx's Lint button supplies that;
 * the recipe-scoped publish gate passes one recipe's nodes and will simply
 * find nothing — the same pre-existing under-scoping `cross-dimension` has.
 */
import { normalizeUnit, getDimension } from "../../units";
import { ProductType } from "../../types";
import type { LintFinding, ProductExpanded } from "../index";

/**
 * Counts at or above this are read as sub-unit counting rather than
 * package counting. 3 is the lowest value that flags thyme's real mixing
 * without flagging prod's legitimate `0.25 … 2` produce nodes.
 */
export const MIN_SUBUNIT_COUNT = 3;

export function lintMixedDenomination(
  products: ProductExpanded[]
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const product of products) {
    // See header: a producer's large output count is indistinguishable from
    // sub-unit counting without step edges, which we don't have here.
    if (product.type !== ProductType.Raw) continue;

    const counts: number[] = [];
    for (const node of product.nodes ?? []) {
      if (!node.unit) continue;
      const unit = normalizeUnit(node.unit);
      // Only the count dimension can suffer this — a fractional `cup` is
      // just a measurement, and cup/tbsp/lb all convert exactly.
      if (!unit || getDimension(unit) !== "count") continue;
      const quantity = node.quantity ?? 0;
      if (quantity > 0) counts.push(quantity);
    }

    const fractional = counts.filter((q) => !Number.isInteger(q));
    const subUnitCounts = counts.filter((q) => q >= MIN_SUBUNIT_COUNT);
    if (fractional.length === 0 || subUnitCounts.length === 0) continue;

    findings.push({
      severity: "warning",
      rule: "mixed-denomination",
      message:
        `${product.name}: count-unit nodes mix two denominations — ` +
        `${Math.min(...fractional)} (fractional, so the unit denominates a divisible ` +
        `package/bunch) alongside ${Math.max(...subUnitCounts)} (a sub-unit count, ` +
        `e.g. sprigs or cloves). These merge 1:1 and will over- or under-buy. ` +
        `Decide what one "each" of this product is, then re-express every node in it.`,
      productId: product.id,
    });
  }

  return findings;
}
