---
created: 2026-07-12
title: Garlic cubes need a clove-to-cube conversion (3 cloves = 1 cube)
area: database
files:
  - recipe-planner/src/lib/units.ts:87-105 (UNIT_ALIASES — clove and cube both -> each)
  - recipe-planner/src/lib/units.ts:126-136 (convert — count-to-count is identity or null)
  - recipe-planner/src/lib/units.ts:20-56 (Dimension / Unit / UNIT_DIMENSIONS)
  - recipe-planner/src/lib/aggregation.ts (pull-list + shopping quantities consume convert/scaleQuantity)
---

## Problem

The app tells us to pull **3 garlic cubes** for Honey Garlic Broccolini. It should be **1
cube** — the recipe originally called for 3 cloves (or "3 ea"), and 3 cloves is 1 frozen
garlic cube. We're over-pulling by 3x on every garlic recipe.

**Root cause: `clove` and `cube` are the same unit.** In `units.ts:87-105`:

```ts
clove: "each",
cloves: "each",
...
cube: "each",
cubes: "each",
```

Both alias to `each`. And `convert()` (`units.ts:130-136`) is deliberately an identity for
count units:

```ts
if (dim === "count") return from === to ? qty : null;
```

with the comment *"each has no sub-units — count-to-count only 'converts' when both sides
are the same unit."* So `3 cloves` → `3 each` → renders as `3 cubes`. The 3:1 ratio has
nowhere to live. This is a **modeling gap, not an arithmetic bug** — the unit system has no
way to express that one count unit is worth N of another.

There is also **no product-level conversion field** on `Product` (no `grams_per_each`,
`purchase_unit`, pack-size, or density). So the ratio can't be attached to the garlic-cubes
product either.

## Solution

Two layers, and they're worth doing in this order:

**1. Data fix (unblocks the immediate over-pull.)** Correct the affected recipe nodes so the
quantity matches the unit actually stored on the node. If Honey Garlic Broccolini's node says
`3` + a unit that displays as "cube", it should be `1`. Audit the other garlic recipes — this
almost certainly isn't the only one, since the aliasing means *every* recipe authored in
cloves and later pointed at the garlic-cubes product inherited the same 3x error. Check
`scripts/normalize-node-units.js` and `scripts/apply-unit-resolutions.js` for the existing
pattern for this kind of sweep.

**2. Model fix (stops it recurring.)** Give the system a real way to express "1 cube =
3 cloves". Options:

- Make `clove` a **first-class count unit** (not an alias of `each`) and add a count-to-count
  conversion table so `convert(3, "clove", "cube") === 1`. This means relaxing the
  "count-to-count only converts when identical" rule in `convert()` — that rule is currently
  load-bearing and its comment should be updated deliberately, not quietly.
- Or attach a **pack/portion ratio to the product** (garlic cubes: `1 cube = 3 cloves`) and
  convert at the aggregation boundary. This generalizes past garlic — cans, bunches, and
  sprigs all currently collapse to `each` and lose their real size (see the `D-13` comments
  right in `UNIT_ALIASES`: *"loses can-size distinction by design"*, *"bunch abbreviation, no
  dedicated count unit"*).

**Related, and probably the same piece of work:** the pending
`single-purchase-unit-shopping-lines` todo already wants one shopping line per ingredient
expressed in its *purchase unit*, and is noted as reversing the earlier "no density model"
decision. A product-level unit/pack model would serve both. Consider planning them together
rather than bolting a garlic special case onto `units.ts`.

Add unit tests in `src/lib/units.test.ts` covering clove→cube, cube→clove, and the
each-vs-clove ambiguity, plus an aggregation test asserting Honey Garlic Broccolini pulls
1 cube.

## ⚠️ Land this together with `alias-units-break-cross-recipe-aggregation`

That todo found a *second*, independent garlic bug: the aggregation read path never calls
`normalizeUnit`, so a node with unit `"cube"` fails `canConvert` against itself and gets split
into a separate line — which is why a week using garlic in two recipes only asked for 1 cube.

The two interact, and order matters. Fixing the aggregation split **alone** makes the tomato
soup's cloves and the broccolini's cubes finally merge — but at the **1:1 ratio this todo
describes**, summing cloves and cubes as if they were the same unit. Under-counting would
become mis-counting. Ship the ratio fix (or at least the recipe-node data correction) in the
same pass.
