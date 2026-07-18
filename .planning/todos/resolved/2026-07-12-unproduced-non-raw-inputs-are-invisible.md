---
created: 2026-07-12
title: "[RESOLVED 2026-07-18] Consumed-but-never-produced non-raw inputs are invisible (soba peanut sauce)"
area: general
files:
  - recipe-planner/src/lib/scheduler/week-graph.ts:20-28 (header — "left as a graph SOURCE (no edge)")
  - recipe-planner/src/lib/scheduler/week-graph.ts:180-215 (section 3 — cross-recipe edges, stored/inventory only)
  - recipe-planner/src/lib/aggregation.ts:247-250 (buildShoppingListFromFlow — ProductType.Raw ONLY)
  - recipe-planner/src/lib/aggregation.ts:500-557 (checkInventoryStock — ProductType.Inventory ONLY)
  - recipe-planner/src/lib/linter/rules/missing-pull-step.ts:1-13 (the guard that exists)
  - recipe-planner/src/pages/CookMode.tsx:560 (runWeekLint — on-demand, cook mode only)
  - recipe-planner/src/pages/Outputs.tsx:504,894-900 (OutOfStockSection banner)
  - recipe-planner/src/lib/types.ts:57-59 (Product.source_recipe / store_bought_product)
---

## Resolved — 2026-07-18 (260718-uni), user-confirmed

**Ground truth (probed 2026-07-18):** the culprit is `asian peanut dressing`
(id `98x86ue3ffa12zu`), type **`transient`**, with **neither `source_recipe`
nor `store_bought_product`** — the worst case. "Peanut Soba Salad with Shrimp"
consumes it with no producing step. A library-wide probe found **exactly one**
such sourceless-transient consume edge and **zero false positives**: intra-recipe
production yields a week-graph edge for ANY product type (`week-graph.ts` section
2), and transients never cross recipes, so extending detection to transient is
safe.

All four surfaces the user requested were built on one shared detection layer:

1. **Detection (solution #1).** `collectStoredInputConsumptions` now also collects
   `transient` inputs; `lintMissingPullStep` flags a sourceless transient (Inventory
   stays exempt, Stored + Transient flagged) and the finding carries `productId`.
2. **Cook-mode readiness (solution #3).** A step consuming an unmade input now
   reads a red **"blocked: nothing makes X"** chip (new `ReadinessChip` "blocked"
   state) instead of "ready" — no longer "precisely backwards." `CookMode`
   computes a `blockedInfoById` map from the same week lint, continuously.
3. **Outputs plan-time surface + make-or-buy (solutions #1 surface + #2).** New
   `UnmadeInputsSection` on the shopping list (parallel to `OutOfStockSection`),
   fed by a `runWeekLint` memo in Outputs and enriched from the consuming meal's
   product node (source_recipe / store_bought_product expands). Renders **Make it**
   (source_recipe) / **Buy it** (store_bought) buttons reusing the existing
   `handleAddRecipeToPlan` / `handleAddToShoppingList` handlers, or — when neither
   is set — a red "fix this recipe" finding (the todo's "that itself is the finding").
4. **Publish gate.** New RECIPE-scoped `unmade-transient` rule threaded into
   `composeRecipeFindings`/`runRecipeLint` (optional 3rd `graph` arg, back-compat
   preserved): blocks publishing a recipe that consumes a transient it never makes
   and has no make/buy escape hatch.

Verified the rule fires against real prod data on the soba recipe. 356/356 tests
green (10 new). Commit dd80e37, deployed + user-confirmed.

**The remaining fix is DATA, not code:** give `asian peanut dressing` a
`source_recipe` or `store_bought_product`, or add a make-step to the soba recipe —
which the new surfaces now prompt for. Related inverse case still open:
`connective-recipe-batch-then-consume`.

## Problem

Two symptoms in the Soba Salad week, and they are **one bug**:

1. Cook mode suggested **combining the soba salad before the peanut sauce had been made**.
2. The shopping list had **no peanut sauce, and no ingredients for one**. There was no way to
   know whether to buy it or make it.

### Root cause

The soba recipe consumes a **peanut sauce product node that no step in the plan produces**,
and that node is **not `raw`**. That combination falls straight through every guard:

- **Scheduling.** `week-graph.ts` builds precedence edges producer → consumer. With no
  producing step anywhere in the week, the peanut sauce input yields **no edge**, so the
  combine step has no predecessor and becomes a **graph SOURCE** — schedulable at t=0. This
  is explicit, intended behavior; the file header says so (`:20-28`):

  > If no producer exists anywhere in the planned week, the input is left as a graph SOURCE
  > (no edge) — surfacing that gap is the missing-pull-step linter's job (Plan 07), not a
  > builder error.

  The builder is *correct* and deliberately delegates. The problem is what it delegates to.

- **Shopping.** `buildShoppingListFromFlow` (`aggregation.ts:247`) includes **only**
  `ProductType.Raw`. A peanut sauce modeled as `transient` / `stored` / `inventory` is
  excluded by design — and because no step produces it, its *ingredients* aren't in the graph
  either. So there is nothing to buy **and** nothing to make. It's a dead end.

- **The guards don't cover it.**
  - `missing-pull-step` is the intended safety net — but it only fires for **stored/inventory**
    inputs, and it only runs **on demand, inside cook mode** (`CookMode.tsx:560`, behind the
    linter dialog). It never runs at plan time or shop time. You plan, you shop, you start
    cooking, and only if you happen to open the linter do you learn the sauce doesn't exist.
  - `checkInventoryStock` → `OutOfStockSection` (`aggregation.ts:500`, `Outputs.tsx:894`) does
    warn, with a real make-vs-buy answer — but it **only inspects `ProductType.Inventory`**.

  So a `transient` or `stored` peanut sauce with no producer is invisible to **every** guard:
  no shopping line, no precedence edge, no lint finding, no stock warning.

### First step when picking this up

**Check what `type` the peanut sauce product actually is**, and whether any step produces it.
That single fact decides the blast radius:

- **`inventory`** → `checkInventoryStock` *should* have raised an out-of-stock warning (it
  pushes one for every inventory node, defaulting `inStock: false` when there's no
  `inventory_items` row). If it didn't fire, or fired somewhere the user never looked, the bug
  is that the warning is a **passive banner on the Outputs page** rather than something that
  blocks or annotates the shopping list.
- **`transient` / `stored`** → nothing catches it at all, and this is a genuine hole in the
  model.

## The user's actual question is the design question

*"I'm not sure if I should have bought it, or made it."*

The schema already answers this — `Product.source_recipe` ("the batch prep that produces
this") and `Product.store_bought_product` ("store-bought alternative"), `types.ts:57-59`. And
`checkInventoryStock` already reads **both** and carries them on its warning. The information
exists; it just never reaches the shopping list, which is where the question gets asked.

## Solution

1. **Close the graph hole.** An input that is consumed but never produced, and is not `raw`,
   should be a **hard finding at plan time** — not an on-demand cook-mode lint. Extend
   `missing-pull-step` (or add a sibling rule) to cover `transient`/`stored`, and run the week
   lint when the plan is built and before the shopping list is exported, not just from the
   cook-mode dialog.
2. **Make it actionable in the shopping list.** For each unproduced non-raw input, surface a
   line that says which it is: **make it** (link `source_recipe` — and consider auto-adding
   that recipe's raw ingredients to the shopping list) or **buy it** (link
   `store_bought_product`, which already carries store + section). If *neither* relation is
   set, that itself is the finding — the product is unmakeable and unbuyable, and the recipe
   should not be publishable in that state (`runRecipeLint` already gates publish in
   `RecipeEditor`).
3. **Don't let the scheduler silently proceed.** A combine step whose input has no producer
   shouldn't just become a t=0 source. At minimum cook mode should mark it — `deriveReadiness`
   already has the "waiting on upstream producers" vocabulary, and an input with **no producer
   at all** is a strictly worse case than "producer not yet checked off." It currently reads as
   `ready`, which is precisely backwards.

Regression test: a planned week whose recipe consumes a non-raw product that nothing produces →
assert (a) a lint finding is raised, (b) the consuming step is not scheduled as a graph source,
(c) the shopping list surfaces a make-or-buy line.

## Related

- `connective-recipe-batch-then-consume` — the inverse case (a producer that *does* exist
  in-plan, whose pull connector gets elided). Same producer/consumer machinery; worth reading
  together, since both are about how in-plan production is detected.
- `full-recipe-text-on-cook-mode-card` — a cook reading the whole recipe up front would have
  caught the missing sauce. Different fix, same underlying complaint: the card doesn't show
  enough of the dish.
