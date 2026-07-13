---
created: 2026-07-12
title: Show on the cook card which ingredients end up in the same container
area: ui
files:
  - recipe-planner/src/components/cook-mode/NowNextCard.tsx:13-40 (ScaledIngredient / MergedCutRow / MergedCutGroup)
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts:106-118 (extractMealDestination — NOT a container identity)
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts:79-92 (createProductKey)
  - recipe-planner/src/lib/scheduler/week-graph.ts (the step DAG the card is already built from)
  - recipe-planner/src/lib/types.ts:95-108 (RecipeProductNode — meal_destination)
  - recipe-planner/src/lib/aggregation.ts:386 (buildMealContainersList)
---

## Problem

Working a cook-mode card, you can't tell whether the ingredient you're prepping is going to
be **combined with other ingredients into a shared container** at the end of the recipe.

Concretely: in the Soba Noodles & Shrimp recipe, the **soba noodles, cucumber, and green
onion all end up in one container** — and nothing on the card said so. You want an indicator
(or some added information on the card) that tells you "this gets combined with X and Y."

## The good news: no schema change needed

My first instinct was that this needs a new "container instance" model. It doesn't — and it's
worth being precise about why, because two nearby fields *look* like they'd do the job and
won't:

- **`Product.container_type`** is the *kind of vessel* (deli cup, mason jar), not a specific
  physical container. Two products with the same `container_type` are not thereby in the
  same container.
- **`meal_destination`** is not a container either. It's a **free-text meal label parsed out
  of the product name with a regex** — `extractMealDestination` (`product-utils.ts:106-118`)
  turns `"Chicken (Monday Dinner) #1"` into `{ cleanName: "Chicken", destination: "Monday
  Dinner" }`. It answers "which meal is this for," not "which jar does it go in."

Don't group on either of those. **The real signal is already in the recipe graph: convergence.**
Ingredients that share a container are exactly the ingredients that **flow into the same
downstream assembly step**, whose output is the single stored product that carries the
container. The edges to walk already exist (`product_to_step_edges`, `step_to_product_edges`,
and the same DAG `week-graph.ts` builds and the scheduler already traverses):

```
this card's step
  → step_to_product_edges  → its output product
  → product_to_step_edges  → the downstream assembly step A
  → A's other inputs        = the co-ingredients you'll be combining with
  → A's output product      = the shared container (container_type lives here)
```

So the indicator is a **downstream-convergence query**, not a new data model. That also makes
it self-maintaining: it stays correct as recipes change, with nothing extra to author.

## Solution

- Add a derivation (pure, unit-testable, alongside `readiness.ts` — same shape: consumes the
  graph + a step id, returns a plain result) that answers: *for this step, what other
  ingredients converge with it, and into what container?*
- Surface it on `NowNextCard`. The card already has structures for showing multiple rows
  (`MergedCutRow` / `MergedCutGroup`, `:13-40`), so this fits the existing layout rather than
  needing new furniture. Something like: **"Combines with: cucumber, green onion → 1 large
  deli container"**.
- Decide how far downstream to look. Direct convergence (one assembly step away) covers the
  soba case. Multi-hop — where two ingredients meet only after several intermediate steps —
  is the harder call; probably show the *final* shared container, since that's the question
  the cook is actually asking. Confirm against a recipe with a deeper graph before locking it.
- Watch out for the merged-prep synthetic steps (`NowNextCard.tsx:125-127`): a week-wide
  "chop all the onions" node spans multiple recipes and has an empty `recipe`, so its
  convergence set is per-recipe, not single-valued. It should probably show the destination
  *per recipe* rather than one merged list.

## Related

- `full-recipe-text-on-cook-mode-card` — the primary request from the same capture, same
  card. Both are about giving the card enough context to see a step's place in the whole
  dish; design the card's information architecture once, covering both.
- `buildMealContainersList` (`aggregation.ts:386`) already groups stored products into
  containers per recipe for the Meal Containers tab. It groups by a `productKey` composite,
  not by graph convergence — check whether it and this new derivation agree, since a
  disagreement means one of them is lying about what shares a container.
