---
created: 2026-07-12
title: "[RESOLVED 2026-07-16] Garlic cube over-pull — destroyed clove/cube data, fixed by sweep; ratio model deferred"
area: database
files:
  - recipe-planner/src/lib/units.ts:87-105 (UNIT_ALIASES — clove and cube both -> each)
  - recipe-planner/src/lib/units.ts:126-136 (convert — count-to-count is identity or null)
  - recipe-planner/src/lib/units.ts:20-56 (Dimension / Unit / UNIT_DIMENSIONS)
  - recipe-planner/scripts/audit-node-quantities.js (the read-only prod audit + gated --apply that fixed this; renamed from audit-garlic-node-quantities.js and parameterized when thyme turned out to be a second instance — run as `--match garlic --evidence 'clove|cube'`)
  - recipe-planner/scripts/dedup-output/garlic-node-quantities.json (260716-rpp Task 1 worksheet — human-confirmed corrections land here)
---

## Resolved — 2026-07-16 (quick 260716-rpp Task 4)

The DATA over-pull is fixed in prod. A human-confirmed sweep corrected the four
mis-authored `garlic cubes (frozen)` nodes, each of which stored a clove count on
a product measured in cubes:

| Node | Recipe | Was | Now |
|---|---|---|---|
| `zoch88349g713g8` | Creamy Tomato Soup | 2 | 1 |
| `towm23or3877720` | Honey-Garlic Roasted Broccolini | 3 | 1 |
| `g996j1m2bbn13nm` | Indian Vegetarian (batch) | 2 | 1 |
| `k2nn479wa423rrj` | Mushroom Bourguignon (Simple) | 3 | 1 |

Verified end-to-end: `buildProductFlowGraph` on week `71ukhycp2v4s0fw` now yields
`garlic cubes (frozen) total=3 each, sources=3` (was 8), and the merged pull step
reads `Pull garlic cubes (+ 1 variants) — IN: garlic cubes (frozen) 3 each`. The
three nodes already reading 1 (`bok choy`, `marry me chickpea`, `White Bean and
Tomato Stew`) were left untouched, as were the `garlic cube (pulled)` transients
(qty 0 is the transient convention, not an error — 60 of 129 transient nodes are 0).

Pre-apply PB backup: `pre-garlic-quantities-2026-07-17t03-54-40-188z.zip`.
Rollback worksheet: `recipe-planner/scripts/dedup-output/garlic-node-quantities.rollback.json`.
Only `quantity` was written — never `unit`, no deletes.

**The clove↔cube RATIO MODEL was deliberately NOT built and remains deferred to
`single-purchase-unit-shopping-lines`.** It is not needed for correctness: every
garlic node now stores a raw count in its own product's unit, so the 1:1 merge is
right. Build the model only when the purchase-unit work needs it — and per the
warning below, do not bolt a garlic special case onto `units.ts` in the meantime.

## Retracted (2026-07-16)

A 2026-07-16 orchestrator probe ran the REAL aggregation code against live prod
and the live week plan `71ukhycp2v4s0fw` ("week of 7/13"). The headline symptom
below is CORRECT and is kept — retract only the root-cause attribution:

- **This is destroyed DATA, not a units.ts modeling gap firing today.** The
  Phase 01-08 `normalize-node-units.js` sweep mapped `clove -> each` (and
  `cube -> each`) while **preserving the stored quantity** — so a node
  originally authored "3 cloves" now reads `quantity=3` on a product measured
  in cubes, and the app faithfully (and wrongly) pulls 3 cubes. Every garlic
  node already uses `each` consistently; the `clove`/`cube` distinction that
  would have driven a live 1:1 mis-merge is gone from the DB. See the sibling
  `alias-units-break-cross-recipe-aggregation` todo for the (different,
  latent, `""`-driven) split bug — the two do NOT compound today, because
  there is no live clove+cube collision to compound.
- **The raw evidence is gone.** Nothing in `recipe_product_nodes.unit` records
  whether a `3 each` node meant 3 cloves or 3 cubes anymore. Recipe step text
  (e.g. "Pull 3 garlic cubes from the freezer") is the only surviving evidence
  of authoring intent, and it is NOT reliable per-node (some steps describe
  the pull generically). This is why the fix is a human-confirmed worksheet,
  not an automated ÷3 — D-08: never guess.
- Verified suspects (2026-07-16 probe, all on `garlic cubes (frozen)`
  `h0g9xux0yrg84xg`, all unit `each`): `towm23or3877720` Honey-Garlic
  Broccolini qty=3, `k2nn479wa423rrj` Mushroom Bourguignon qty=3,
  `zoch88349g713g8` Creamy Tomato Soup qty=2, `g996j1m2bbn13nm` Indian
  Vegetarian (batch) qty=2. `k63xfg3t4lwsj83` / `nm35xoo159213k4` /
  `6fd5bu3s4vn5o42` read 1 and are likely already correct.

## Problem

The app tells us to pull **3 garlic cubes** for Honey Garlic Broccolini. It
should be roughly **1 cube** — the recipe was authored "3 cloves" and the
Phase-01 sweep flattened the unit to `each` while keeping the `3`. We're
over-pulling by up to 3x on multiple garlic recipes (confirmed live on the
week of 7/13: the plan pulled 8 garlic cubes where the corrected total is 3 —
1 each from Broccolini, Creamy Tomato Soup, and Mushroom Bourguignon).

`clove` and `cube` both alias to `each` (`units.ts:87-105`), and `convert()`
(`units.ts:126-136`) is deliberately an identity for count units:

```ts
if (dim === "count") return from === to ? qty : null;
```

with the comment *"each has no sub-units — count-to-count only 'converts'
when both sides are the same unit."* This is a real modeling gap — the unit
system has no way to express that one count unit is worth N of another — but
it is **not what is firing live today**. Today's live bug is simpler and more
destructive: the quantity is just wrong, stored directly on an `each`-unit
node.

There is also **no product-level conversion field** on `Product` (no
`grams_per_each`, `purchase_unit`, pack-size, or density). So the ratio can't
be attached to the garlic-cubes product either, even if the raw clove count
still existed.

## Solution

Two layers, unchanged from the original todo, but re-scoped by what's actually
live vs. deferred:

**1. Data fix — done, via `scripts/audit-node-quantities.js`
under 260716-rpp.** Read-only audit of every garlic node (recipe, current
qty/unit, and clove/cube prose evidence recovered from recipe steps) →
human-confirmed worksheet (`scripts/dedup-output/garlic-node-quantities.json`,
seeded with no auto-guessed correction) → gated `--apply` behind a PB backup +
rollback worksheet. This resolves via 260716-rpp Task 4, not this todo file
directly — once the prod write lands and reads back clean, this todo can move
to resolved.

**2. Model fix — kept, but explicitly deferred to
`single-purchase-unit-shopping-lines`, and NOT currently load-bearing for
correctness.** Every garlic node uses `each` consistently today, so the only
live error is wrong quantities (layer 1 above fixes that). The ratio model
would only become load-bearing again if a NEW recipe is authored in raw clove
counts against the same each-denominated product — which the recipe-authoring
skills should discourage in the meantime. Options, unchanged:

- Make `clove` a **first-class count unit** (not an alias of `each`) and add a
  count-to-count conversion table so `convert(3, "clove", "cube") === 1`. This
  means relaxing the "count-to-count only converts when identical" rule in
  `convert()` — that rule is currently load-bearing (see the sibling
  `alias-units-break-cross-recipe-aggregation` todo, which also needs a
  deliberate relaxation of the same guard for its own deferred fix) and its
  comment should be updated deliberately, not quietly.
- Or attach a **pack/portion ratio to the product** (garlic cubes: `1 cube =
  3 cloves`) and convert at the aggregation boundary. This generalizes past
  garlic — cans, bunches, and sprigs all currently collapse to `each` and lose
  their real size (see the `D-13` comments right in `UNIT_ALIASES`: *"loses
  can-size distinction by design"*, *"bunch abbreviation, no dedicated count
  unit"*).

**Related, and probably the same piece of work:** the pending
`single-purchase-unit-shopping-lines` todo already wants one shopping line per
ingredient expressed in its *purchase unit*, and is noted as reversing the
earlier "no density model" decision. A product-level unit/pack model would
serve both. Consider planning them together rather than bolting a garlic
special case onto `units.ts`.

Add unit tests in `src/lib/units.test.ts` covering clove→cube, cube→clove, and
the each-vs-clove ambiguity, plus an aggregation test asserting Honey Garlic
Broccolini pulls the corrected count — if and when layer 2 is built.

**This todo resolves in 260716-rpp Task 4** (the human-gated prod
`--apply`), not here — Task 3 only corrects the diagnosis text. After the
Task 4 write lands and reads back clean, move this file to resolved, noting
the ratio model (layer 2) was deliberately NOT built and remains deferred to
`single-purchase-unit-shopping-lines`.
