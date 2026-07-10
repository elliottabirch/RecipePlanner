# Phase 6: Import Pipeline & Recipe Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 6-Import Pipeline & Recipe Lifecycle
**Areas discussed:** JSON contract + product matching, Import page flow + review, /suggest-recipes interaction, Evolution loop revision model

**Method:** Advisor mode (calibration tier: standard; technical owner — no reframing). Four parallel codebase-research agents grounded each area in actual `recipe-planner/` code before options were presented. Most WHAT decisions were pre-locked by `plans/workflow-redesign.md` §Topic 5; discussion covered only the open HOW.

---

## Unmatched products at import

| Option | Description | Selected |
|--------|-------------|----------|
| Inline resolve, then land | Auto-match high-confidence lines silently; surface unmatched/low-confidence for inline resolve (pick-existing / QuickCreate / Search-USDA) before the draft lands. Guarantees store/section/unit. | ✓ |
| Auto-create bare + flag | Land immediately, auto-create bare product records for unmatched ingredients, flag in a post-import summary to clean up later. | |

**User's choice:** Inline resolve, then land.
**Notes:** Avoids reintroducing the near-duplicate + shopping-list-dropout bugs. Resolution is part of import, not the publish gate — "importing never blocks" invariant preserved.

---

## /suggest-recipes output shape

| Option | Description | Selected |
|--------|-------------|----------|
| Propose in chat, land accepted | Skill prints 3-5 candidate summaries in chat; user picks; only accepted candidates built as drafts direct to prod. | ✓ |
| Land all as drafts | Skill builds all 3-5 directly as draft recipes; user reviews/culls in-app. | |

**User's choice:** Propose in chat, land accepted.
**Notes:** Cheaper, no junk drafts, mirrors the recipe-import skill's confirm-before-write ergonomics.

---

## Evolution loop revision model

| Option | Description | Selected |
|--------|-------------|----------|
| In-place branch | Clone graph into a draft for review; on approval, write reviewed graph back onto the ORIGINAL recipe id. Keeps planned_meals + overrides valid; no re-point migration. | ✓ |
| Full-copy + swap | Clone into a new recipe record (linked via 'revises'); approval flips new→published, old→archived + runs a re-point/override-remap migration. | |

**User's choice:** In-place branch.
**Notes:** `planned_meals.recipe → recipes.id` and `meal_variant_overrides.original_node → recipe_product_nodes.id` are hard relations; keeping the recipe id stable avoids a migration and keeps mid-week dinners from changing under the household.

---

## Claude's Discretion

- Fuse-score threshold for confident-match vs surface-for-resolve (~0.15 starting point).
- Whether to add the optional post-import summary screen.
- `recipe_notes.source_surface` enum values + wizard review-flag UI treatment.

## Deferred Ideas

- Automatic (hook/cron) agent passes — after the manual loop proves out.
- Hard nutrition/macro filtering for /suggest-recipes — blocked on `products.protein_g` backfill from `fdc_id`.
- Read-only graph preview renderer distinct from RecipeEditor.
- `meal_variant_overrides` remap on node removal (residual dangling-override cleanup).
