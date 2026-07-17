---
created: 2026-07-16
title: thyme (fresh) mixes sprigs and packages in the same `each` unit — same class as the garlic over-pull
area: database
severity: minor
source: 260716-rpp follow-up sweep for other instances of the garlic bug class
files:
  - recipe-planner/src/lib/units.ts:87-105 (UNIT_ALIASES — sprig/sprigs -> each, added 2026-07-11 in 1e3dfd1)
  - recipe-planner/scripts/audit-garlic-node-quantities.js (the human-confirmed-worksheet pattern to reuse)
---

## Problem

`thyme (fresh)` (`0817ac3dc7j9856`, raw, `canonical_unit=each`) has five consuming
nodes whose `each` means **two different physical things**:

| Recipe | Qty | Unit | Reads as |
|---|---|---|---|
| vegetable stock | 0.5 | each | half a **package/bunch** |
| butternut squash soup (batch) | 1 | each | one **package/bunch** (or 1 sprig?) |
| Mushroom Bourguignon (Simple) | 3 | each | 3 **sprigs** |
| Creamy Tomato Soup | 8 | each | 8 **sprigs** |
| White Bean and Tomato Stew | 1 | tbsp | volume — splits to its own line (separate issue) |

Every node **consumes** — there is no producer node to explain the spread (verified
against `step_to_product_edges` 2026-07-16). So unlike `chicken breast cooked
stored` (8 PRODUCES / 1-2 consume) and `indian food with vegetable` (5 PRODUCES /
1 consume), which are legitimate batch producer→consumer pairs, this spread has no
innocent explanation.

**This is the same class as the garlic over-pull** (see the resolved
`2026-07-12-garlic-cube-clove-unit-conversion.md`): a sub-unit alias collapsed into
`each` alongside a purchase-unit count, and the two merge **1:1**. A week planning
Creamy Tomato Soup + butternut squash soup aggregates to `9 each thyme` — summing
8 sprigs and 1 package as if they were the same thing.

**Direct evidence of how it happened.** Commit `1e3dfd1` (2026-07-11) says:

> Fresh-thyme nodes written as '3 sprig' resolved to null (unknown dimension) and
> split off their own shopping line. Alias sprig->each (matching existing 'sprigs')
> so future imports merge cleanly.

That alias made the Bourguignon node's `3 sprig` into `3 each` — merging it 1:1
with package-denominated nodes. The alias fixed a *split* and created a
*mis-merge*, exactly as the garlic sweep did with `clove -> each`.

## Solution

Needs a human decision first, then a small data fix — **the raw `sprig` string is
already gone from the DB**, so nothing can infer intent automatically (D-08).

1. **Decide what `each` means for `thyme (fresh)`.** Sprig or package/bunch? Sprig
   is the better fit for recipe authoring (recipes say "3 sprigs thyme"), but the
   0.5 node implies whoever wrote it meant a package. Whatever is chosen, all five
   nodes must be re-expressed in it.
2. **Correct the nodes** using the human-confirmed-worksheet pattern from
   `scripts/audit-garlic-node-quantities.js` (dry-run default, PB backup + rollback
   worksheet before any write, rows seed `confirmed:false`). This is small enough
   to fold into any nearby data pass.
3. **The general guard — PARTLY SHIPPED 2026-07-16.** Every sub-unit alias in
   `UNIT_ALIASES` that collapses into `each` carries this hazard — `clove`,
   `cube`, `sprig`, `slices`, `pitas`, `can`, `bunch`, `bu`, `whole`. The real fix
   is the product-level purchase/portion model deferred to
   `single-purchase-unit-shopping-lines`.

   Shipped in the meantime: the `mixed-denomination` lint rule
   (`src/lib/linter/rules/mixed-denomination.ts`), surfaced by the Products.tsx
   Lint button. It flags a raw count-dimension product carrying BOTH a fractional
   quantity and a count ≥3. Against live prod it returns exactly this thyme
   finding and nothing else.

   **Its known limitation is important: it would NOT have caught garlic.** Garlic's
   nodes were `1,1,1,2,2,3,3` — all integers, with the wrong 3s indistinguishable
   from correct 3s once the raw `clove` string was gone. Only recipe PROSE ("Pull
   3 garlic cubes" beside a node reading 3) exposed garlic, and the product-scoped
   linter input carries no step text. **A prose-based detector is the missing
   companion guard and is not built** — worth adding if a third instance of this
   class appears. See
   `2026-07-12-authoring-skills-need-downstream-consequences-reference.md`; this is
   another instance of the class it wants to prevent.

## Scope check (2026-07-16)

A full-DB scan for this signature found **thyme is the only remaining real
instance**:

- No node still matches the exact garlic pattern (prose stating "N <sub-unit>" while
  a node stores N as `each`).
- Bimodal `each` spreads on `carrot`, `egg`, and `green onion` are false positives
  (a recipe using 1 egg and another using 8 is normal — one denomination).
- `chicken breast cooked stored` / `indian food with vegetable` are producer→consumer.
- The wider "sub-unit vs purchase unit" issue (`bread sliced` 8, `sliced cheese` 8,
  `pita` 4, `tomato whole peeled (canned)` 2) is real but is **display/purchase-unit**,
  not a mis-merge — every node of those products uses one consistent denomination.
  That is `single-purchase-unit-shopping-lines`' territory.
