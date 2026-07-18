---
created: 2026-07-12
title: "[RESOLVED 2026-07-18] Show the full recipe text from the cook mode card"
area: ui
files:
  - recipe-planner/src/components/cook-mode/NowNextCard.tsx:118-133 (button slot — AddNoteButton lives here)
  - recipe-planner/src/components/cook-mode/NowNextCard.tsx:219-221 (step.instructions already rendered)
  - recipe-planner/src/lib/types.ts:73-84 (Recipe.notes — the field already exists)
  - recipe-planner/src/pages/RecipeEditor.tsx:315,681 (notes load/save)
  - recipe-planner/src/lib/import/validate-import.ts:372-373 (notes in the import contract)
  - recipe-planner/src/lib/import/build-recipe-graph.ts:108 (notes on write)
  - .claude/skills/recipe-import/SKILL.md
---

## Resolution (2026-07-18, `260718-cca`)

Surfaced + populated, both halves done.

- **Surface**: a 📖 "view recipe" button beside `AddNoteButton` on `NowNextCard` opens a
  dialog with the recipe's prose (`Recipe.notes`) plus this week's scaled ingredient list
  (always available from the graph — the empty-notes fallback). The merged-prep constraint
  called out below is handled the better way suggested here: the dialog **lists every
  contributing recipe** (one section each), rather than omitting the button. `recipeView`
  generalized to `recipeViews[]`.
- **Populate (data)**: `notes` was empty on 56/67 published recipes. Authored tight,
  glanceable prose (user's style: base steps, result-based, no technique timings) for the 31
  substantive recipes; trivial pull/store entries left to the ingredient-list fallback.
  Written to prod via `recipe-planner/apply-recipe-notes.mjs` (exact-name match, empty-only,
  dry-run-then-apply) from `recipe-notes-drafts.json`. Two (Creamy Tomato Soup, Shawarma
  Pitas) came from user-supplied source; the rest curated from each recipe's step graph.
- **Import path**: the `recipe-import` skill's `notes` contract now instructs carrying the
  full source prose going forward (not a one-line blurb).

Deployed + user-confirmed. `notes` reads live from prod — no deploy needed for the data.

## Problem

Cook mode shows you a step at a time. There's no way to read the **whole recipe** — the
prose version, as originally written — from the card you're working. You want a button on
the cook-mode card that opens the fully typed-out / explanatory recipe so it can be read in
one place.

Two sources, per the request:
- **Imported recipes:** pull in the source recipe's description/instructions at import time.
- **Self-created recipes:** we need to author a distilled description, since one doesn't
  exist.

## What already exists (more than you'd think)

- **`Recipe.notes?: string` is already there** (`types.ts:75`). It's already loaded and saved
  by `RecipeEditor` (`:315`, `:681`), already part of the import contract
  (`validate-import.ts:372-373`), and already written by `build-recipe-graph.ts:108`. So the
  storage field for "the recipe, in prose" **exists and is plumbed end-to-end** — it's just
  not populated consistently and never surfaced in cook mode.
- **Step-level `instructions` already render on the card** (`NowNextCard.tsx:219-221`). This
  feature is the *recipe*-level companion to that.
- **The card already knows its recipe id and already has the button slot.**
  `NowNextCard.tsx:127-133` renders `<AddNoteButton recipeId={instance.step.recipe} …/>` in
  a flex row next to the readiness chip. A "view recipe" button drops in beside it and copies
  the same pattern.

So this is mostly a **content + surfacing** job, not a schema job. Decide whether `notes` is
the right home or whether a distinct `description` field is warranted (`notes` may already
carry unrelated content on existing recipes — check before overloading it).

## The constraint that will bite you

The code at `NowNextCard.tsx:125-127` already documents it:

> Week-wide merged-prep nodes carry a synthetic step with an **empty `recipe`** (spans
> multiple recipes — a note has no single target), so omit the note affordance there.

A "view recipe" button hits **the identical problem**: on a merged cut card ("chop all the
onions for the week"), there is no single recipe to show. Options: omit the button there (as
`AddNoteButton` does), or — better, since the card already carries `MergedCutGroup` /
`recipeCount` — offer a **list** of the contributing recipes to open.

## Solution

1. **Populate the text.**
   - *Import path:* extend the `recipe-import` skill's emitted contract to carry the source
     recipe's prose description into `notes` (the field is already accepted by
     `validate-import.ts`). Nothing in the write path needs to change.
   - *Self-created:* author distilled descriptions for the existing recipes. Worth a one-off
     pass — an agent can draft each from the recipe's own step graph (steps, ingredients,
     quantities are all there) for human review, rather than hand-writing ~30 of them.
2. **Surface it.** Add a button beside `AddNoteButton` on `NowNextCard` that opens a dialog
   or drawer with the full recipe text. Reuse the existing dialog patterns in `Outputs.tsx`.
   Handle the empty-recipe merged-prep case explicitly.
3. Consider showing the recipe's ingredient list alongside the prose — the graph already has
   quantities and units, so "read it all in one place" can mean prose **plus** the scaled
   ingredient list for this week's multiplier.

## Related

`container-convergence-indicator-on-cook-card` — the sibling request from the same capture,
and the same card. Both are about giving the cook-mode card enough context to understand a
step's place in the whole dish. Worth designing the card's information architecture once,
covering both, rather than bolting on two independent buttons.
