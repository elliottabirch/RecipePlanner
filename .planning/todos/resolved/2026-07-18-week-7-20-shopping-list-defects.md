---
created: 2026-07-19T01:08:31.311Z
title: Week 7/20 shopping-list defects — split chickpea/potato, leaked transient shallot, missing spaghetti
area: general
files:
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts (product identity + merge/split — where the chickpea/potato dupes and unit split live)
  - recipe-planner/src/lib/aggregation/ (shopping-list / shopping-line assembly — transient filtering, recipe inclusion)
related_todos:
  - 2026-07-12-alias-units-break-cross-recipe-aggregation.md ("" / |undefined split mechanics)
  - single-purchase-unit-shopping-lines.md (one line per ingredient in purchase unit)
---

## RESOLVED 2026-07-19

Probed live prod + ran the real aggregation (`tsx` importing `buildProductFlowGraph`/
`buildShoppingListFromFlow`) against plan `vq1ytjtx4cgf4c2` ("7/20"). All four
reproduced. **Root cause: data classification, not code — the aggregation is correct**
(shopping list = `ProductType.Raw` only; merge by `product.id`, split by unit dimension).

Fixes applied to prod via `recipe-planner/fix-720-shopping.mjs` (rollback snapshot at
`recipe-planner/scripts/dedup-output/fix-720-rollback.json`):
1. **Shallot** — `shallot small dice` (product `p777x10p70vbk11`) was a step output
   (`shallot → [small dice] → shallot small dice`) mistyped `raw`; flipped to `transient`
   (every sibling step-output already was). Shopping list now shows only `shallot 1 each`.
2. **Potato** — merged `yukon gold potato` (`85o6…`, deleted) into `potato (russet)`
   (`d873…`), renamed survivor `potato`. One line `potato 4 each` (sweet potato stays
   separate). NOTE: transient children still named `potato (russet) large dice`/`boiled`
   + registry still has `russet potato`/`red potato`/`fingerling` (not in 7/20) — left alone.
3. **Chickpea** — global unify: repointed all 3 `chickpeas cooked` (`56jnx…`, deleted)
   nodes to `chick pea` (`0q18…`, renamed `chickpeas`), converting cup→can (1 can =
   1.5 cup): Mediterranean 3cup→2, tumeric soup 2cup→1, Harissa Cod 2cup→1. One line
   `chickpeas 4 each` on 7/20. Touched tumeric soup + Harissa Cod (not in this week).
4. **Spaghetti** — NO CHANGE (correct). Its 4 buyables are `type=inventory` with in-stock
   `inventory_items`; inventory-type is excluded from the raw shopping list by design and
   surfaces via `checkInventoryStock` → out-of-stock restock section when unchecked in the
   Inventory page. User confirmed leave-as-is.

Verified post-fix with the real aggregation: chickpeas 1 line (4 each), potato 1 line
(4 each), shallot 1 line, spaghetti 0 (as intended).

## Problem

Four defects observed live on the **week of 7/20** shopping list (reported together
2026-07-18). All four are on the same generated list, which is itself a signal —
capture together, but they likely have 2–4 distinct root causes.

**IMPORTANT before acting:** per project memory (`backlog-drifts-from-prod`), ALWAYS
probe the live prod DB + run the REAL aggregation code against the actual week-7/20
plan before diagnosing. Prod data has been hand-edited via RecipeEditor without
commits, so the repo state may not match. Confirm each symptom reproduces against the
live plan first.

### 1. Chickpeas split into two products
The week-7/20 list shows **two different chickpea items** instead of one. Should be
consolidated into a single chickpea product with **one canonical unit**. Likely a
product-identity duplication (two distinct product records / node keys) and/or a
unit-driven split (`|undefined` / `""` split — see related alias-units todo). Determine
which: two product records, or one product splitting on unit.

### 2. Potatoes split into two products
Same class as #1: the list shows **`yukon gold`** and **`potato`** as two separate
items. Consolidate into one potato product. This one smells like a product-identity /
naming duplicate (a specific "yukon gold" product vs a generic "potato"), not a unit
split — verify.

### 3. `small dice shallot` leaks onto the shopping list
A `small dice shallot` line appears on the shopping list even though it should be
**transient** (a prep-derived intermediate, not a raw item to buy). Transient/prep
products must be filtered out of the shopping list. Find why this one is classified as
purchasable — mis-tagged node, or a transient-filter gap on diced-shallot.

### 4. No spaghetti ingredients appear on the shopping list
**None** of the ingredients for the spaghetti recipe show up on the week-7/20 shopping
list. The whole recipe's raw ingredients are missing. Possible causes to check: recipe
not actually included in the week plan, all its products mis-tagged transient/day-of,
or an aggregation path dropping the recipe. (Cross-check against
`meat-spaghetti-is-all-prep-day` memory — that recipe is all prep-day with no day-of
step; make sure the "missing" isn't a mis-read of prep-day handling.)

## Solution

TBD — needs a scoped debug/plan session. Suggested order:
1. Probe prod + run real aggregation on the week-7/20 plan; reproduce each of the four.
2. For #1/#2: dump the product nodes → decide product-identity merge vs unit-canonicalization.
3. For #3: trace the transient/purchasable classification for `small dice shallot`.
4. For #4: confirm spaghetti is in the plan and trace where its products drop out.

Consider `/gsd-debug` for #3 and #4 (behavioral bugs) and a data/plan pass for #1/#2
(may overlap the deferred merge-semantics work in the alias-units todo).
