---
created: 2026-07-12
title: Import/suggest skills must document how every authoring choice flows downstream
area: docs
files:
  - .claude/skills/recipe-import/SKILL.md
  - .claude/skills/suggest-recipes/SKILL.md
  - .claude/skills/evolve-recipes/SKILL.md
  - recipe-planner/src/lib/aggregation.ts (the consumers being documented)
  - recipe-planner/src/lib/scheduler/week-graph.ts:150-155
---

## Problem

Every recipe-data bug found on 2026-07-12 has the same root: **the authoring skills describe
what to write, but not what each choice DOES downstream.** An author (human or agent) picks a
`ProductType` or a `timing` value without knowing which lists that choice makes the item appear
in — or silently vanish from.

User, verbatim: *"this is a mandatory thing to understand, and cannot be understated."* They're
right. The bugs this caused today:

- **Mis-tagged `just_in_time`** on a braise → the whole cook vanished from cook mode; the user
  was stranded mid-dinner with no idea what to do.
- **Peanut sauce as a non-raw product with no producer** → no shopping line, no ingredients, no
  precedence edge. Unbuyable, unmakeable, invisible.
- **Alias units** (`cube`, `ea`) → silently fail cross-recipe aggregation.
- **Garlic cubes** → over/under-pulled because `clove`/`cube` collapse to `each`.

None of these were caught by the linter, the import validator, or review. They were all caught
by a human standing in a kitchen holding the wrong thing.

## Solution

Write a **single shared reference** — e.g. `.claude/skills/_shared/authoring-consequences.md` —
that all three recipe skills (`recipe-import`, `suggest-recipes`, `evolve-recipes`) link to and
are instructed to read before emitting a graph. Duplicating it three ways guarantees drift.

It must answer, for each authoring choice: **which surfaces does this appear in, and which does
it disappear from?** Everything below is verified against the code as of 2026-07-12.

### Product type → where it shows up

| `ProductType` | Shopping list | Fridge/Freezer + Containers | Notes |
|---|---|---|---|
| `raw` | ✅ **the only type ever shopped for** | — | `buildShoppingListFromFlow` filters `=== ProductType.Raw`. If it isn't `raw`, **you will never be told to buy it.** |
| `inventory` | ❌ never | — | Assumed stocked/made. Surfaces only via `checkInventoryStock` → OutOfStockSection. **Needs `source_recipe` (make it) or `store_bought_product` (buy it) — with neither, it is a dead end.** Exempt from the store/section lint rule. |
| `stored` | ❌ never | ✅ instanced per meal | Recipe outputs. Instance-mode in aggregation (`createProductKey` keys on `meal_destination` + `plannedMealId`). |
| `transient` | ❌ never | ❌ never | Graph-internal only (cut veg, intermediate mixes). **Invisible everywhere.** A `transient` that nothing produces is invisible to every guard in the app. |

### Step `timing` → where it shows up

| `timing` | Cook mode (prep day) | Batch prep list | Notes |
|---|---|---|---|
| unset | ✅ | ✅ | Correct for `prep` (knife) steps — the skill says leave it UNSET. |
| `batch` | ✅ | ✅ | **The default for a weekly meal's cook/assembly steps.** Roasting, simmering, make-ahead. |
| `just_in_time` | ❌ **excluded from the week graph entirely** (`week-graph.ts:151`) | ❌ | Only for work genuinely ruined by being made ahead: a fresh sear, baking fish, warming tortillas, dressing a salad, plating. **A JIT step's instructions are unreachable from every screen in the app** — its ingredients appear in `PullListsTab`, but the step itself never does. Tag a braise `just_in_time` and the cook is stranded. |

### Graph shape → consequences

- **A non-`raw` input that no step in the plan produces** → no precedence edge, so its consumer
  becomes a **graph source scheduled at t=0** (`week-graph.ts` leaves it as a source by design
  and delegates to the linter). It also gets no shopping line. This is how the soba peanut
  sauce became simultaneously un-buyable, un-makeable, and un-scheduled.
- **A `just_in_time` producer feeding a `batch` consumer** → the edge is **silently dropped**
  (`includedIds.has(from) && includedIds.has(to)`). The consumer schedules without its input.
  **Timing must be coherent along a dependency chain.**
- **A `prep` step with a single `raw` input and `resource: "none"`** → merged week-wide into one
  `merged-prep::<productId>` node carrying a **synthetic step with an empty `recipe`**. That's
  why merged cards have no note button and no single recipe to link.
- **An output whose `container_type` is "original packaging"** → the whole step is **dropped**
  from the batch-prep list (`hasOriginalPackagingOutput`).

### Units → consequences

- **Only the 15 canonical `Unit` values are safe.** Aliases (`cube`, `cubes`, `clove`, `cloves`,
  `ea`, `cups`, `can`, `bunch`, `whole`, `sprig`, …) are **not** in `UNIT_DIMENSIONS`, so
  `getDimension` returns `undefined`, `canConvert` returns false even against **itself**, and
  the product **silently splits into a second, invisible line** instead of aggregating. Emit
  canonical units. (See `alias-units-break-cross-recipe-aggregation` — the read path should also
  be normalizing, but authoring canonically is the cheap half.)
- **`clove` and `cube` both collapse to `each`**, so the system believes 1 clove = 1 cube. Until
  `garlic-cube-clove-unit-conversion` lands, garlic quantities need care.
- **A new non-pantry `raw` product with no `store`/`section` drops out of the shopping list.**
  Already called out in the import skill's gotchas — keep it in the shared doc too.

## Make it enforceable, not just documented

Documentation alone didn't prevent this — the `timing` convention **was already written down**
in `recipe-import/SKILL.md:415-426` and still got it wrong on import. So pair the reference with
teeth:

- Add a **pre-emit checklist** to both skills: for every product, name the list it will appear
  in; for every step, name the surface it will appear on. If the answer is "none," that's a bug
  in the graph, not a valid choice.
- Add **linter rules** for the silent classes: an `assembly` step with meaningful
  `passive_minutes` tagged `just_in_time`; a non-`raw` input with no producer; a non-canonical
  unit; an `inventory` product with neither `source_recipe` nor `store_bought_product`. The
  publish gate (`runRecipeLint`) already exists to carry them.
- Note that `timing` and `resource` are the **only two** fields the import validator
  soft-normalizes rather than hard-failing (`SKILL.md:312-313`) — precisely the two that went
  wrong. Consider making a bogus `timing` a hard failure.

## Related

Effectively the upstream parent of: `mis-tagged-just-in-time-timing-on-make-ahead-steps`,
`unproduced-non-raw-inputs-are-invisible`, `alias-units-break-cross-recipe-aggregation`,
`garlic-cube-clove-unit-conversion`, `day-of-steps-have-no-surface-cook-mode-ends-silently`.
Fixing this prevents the **class**; the others fix the instances.
