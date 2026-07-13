---
created: 2026-07-12
title: Alias units break cross-recipe aggregation (garlic cubes under-counted)
area: general
files:
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts:36-37 (nodeUnit — raw DB string, never normalized)
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts:88-101 (resolveMergeTargetKey — the split)
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts:43-64 (mergeQuantities — bails on !canConvert)
  - recipe-planner/src/lib/units.ts:38-53 (UNIT_DIMENSIONS — 15 canonical keys only)
  - recipe-planner/src/lib/units.ts:87-105 (UNIT_ALIASES — 17 aliases, none in UNIT_DIMENSIONS)
  - recipe-planner/src/lib/units.ts:111-122 (canConvert — unknown unit is never convertible)
  - recipe-planner/src/lib/units.ts:148-153 (normalizeUnit — exists, but unused in the read path)
  - recipe-planner/scripts/normalize-node-units.js
---

## Problem

This week's plan used garlic cubes in **both** the tomato soup and the honey garlic
broccolini, but the app only told us to pull **1 garlic cube**. The two recipes' quantities
never got summed.

**Root cause: the aggregation read path never normalizes a node's unit, so an alias unit
fails to convert against itself and gets split into a second, invisible line.**

### The chain

`buildAggregatedProduct` (`product-builder.ts:36-37`) takes the unit **straight off the DB
row**:

```ts
const quantity = node.quantity || 0;
const nodeUnit = node.unit || "";          // <-- raw string; no normalizeUnit()
```

`normalizeUnit` **exists** (`units.ts:148`) and correctly maps `cube → each`. But grep says it
is called in exactly two places — the linter's `cross-dimension` rule and `Import.tsx:221`.
**It is never called anywhere in the aggregation read path.** So `nodeUnit` stays `"cube"`.

`UNIT_DIMENSIONS` (`units.ts:38-53`) has only the **15 canonical** keys (`tsp … each`).
`"cube"` is an *alias*, not a canonical `Unit`, so:

```ts
getDimension("cube")  // undefined
```

and `canConvert` (`units.ts:111-122`) explicitly refuses unknown units:

```ts
if (da === undefined || db === undefined) return false;
```

So **`canConvert("cube", "cube") === false`** — a unit is not convertible with *itself*.

Now `resolveMergeTargetKey` (`product-builder.ts:88-101`):

```ts
const base = products.get(baseKey);
if (!base) return baseKey;
if (canConvert(base.unit, newProduct.unit)) return baseKey;   // false!
const dimension = getDimension(newProduct.unit);              // undefined
return `${baseKey}|${dimension}`;                             // "garlicId|undefined"
```

- **Tomato soup** arrives first → claims key `garlicId`, quantity 1.
- **Honey garlic broccolini** arrives → `canConvert("cube","cube")` is false → routed to
  `garlicId|undefined`, a **separate line**.

Two lines instead of one summed line. The pull list shows the first, so you pull 1 cube and
walk away short. The literal string `"undefined"` baked into the split key is the tell that
this path was never meant to be reached.

### It is not just garlic

**Every** alias in `UNIT_ALIASES` (`units.ts:87-105`) has this defect — `ea`, `cups`, `tbl`,
`cu`, `quart`, `clove(s)`, `can`, `bu`, `bunch`, `whole`, `cube(s)`, `slices`, `pitas`,
`sprig(s)`. Any recipe node authored with one of these **fails to aggregate with any other
node of the same product**, silently, across the whole app — shopping list, pull lists,
batch prep. Garlic is just where it got noticed. Note `ea` is in that list, so even the
most common shorthand is affected.

### Bonus defect on the same line

`scaleQuantity(quantity, mealCount, nodeUnit as Unit)` (`product-builder.ts:38`) decides
whether to ceil via `getDimension(unit) === "count"`. For `"cube"` that's `undefined`, so
**`isDiscrete` is false and the ceil is skipped** — losing the deliberate "never under-buy an
indivisible item" guarantee (`units.ts:205-211`). Alias-unit counts can come out fractional.

## Solution

**Normalize at the aggregation boundary.** In `buildAggregatedProduct`:

```ts
const nodeUnit = normalizeUnit(node.unit ?? "") ?? node.unit ?? "";
```

That single change makes `"cube"` → `"each"`, so the two garlic lines share a dimension,
merge into one key, and sum. It also restores the discrete ceil.

Defense in depth, since the read path shouldn't be the only guard:
- **Normalize on write** too (`RecipeEditor` save + the import contract), so canonical units
  are what actually land in `recipe_product_nodes`.
- **Sweep the existing rows** — `scripts/normalize-node-units.js` already exists for exactly
  this; check what it covers and re-run it.
- **Make the failure loud.** A merge key containing `"undefined"` is never legitimate — assert
  or log in `resolveMergeTargetKey` rather than silently minting a split line. This bug was
  invisible precisely because the split is silent.

Regression test in `product-builder.test.ts`: two planned meals, same product, both with unit
`"cube"` → assert **one** line whose quantity is the sum, not two lines.

## ⚠️ Interaction with `garlic-cube-clove-unit-conversion` — read before fixing

These are **different bugs on the same product**, and fixing this one **without** the other
makes garlic quantities wrong in a new way.

That todo's finding: `clove` and `cube` **both** alias to `each`, and `convert()` is an
identity for count units — so the system believes **1 clove = 1 cube**, when really
**3 cloves = 1 cube**.

So once units are normalized here, the tomato soup's cloves and the broccolini's cubes *will*
finally merge — but they'll merge at a **1:1 ratio**, summing cloves and cubes as if they were
the same thing. Under-counting becomes mis-counting. **Land the clove↔cube ratio (or at
minimum the recipe-node data fix) together with this**, and add the combined case to the test:
soup in cloves + broccolini in cubes → one line, correct cube count.
