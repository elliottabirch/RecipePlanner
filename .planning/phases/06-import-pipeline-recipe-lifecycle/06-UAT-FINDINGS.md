# Phase 6 — UAT Findings (live tablet walkthrough, 2026-07-10)

Running record of the hands-on UAT against the deployed app (prod, :3000 / PB :8090).

## Verified ✅
- **06-07 Import** — paste JSON → parse-OK → inline resolve of unmatched raw → land draft → redirect into RecipeEditor. Malformed JSON surfaced cleanly, wrote nothing (never-block invariant).
- **06-06 Publish gate** — blocked with a findings dialog on lint violations; published cleanly once resolved.
- **06-05 (list side)** — grey Draft chip on a draft; chip gone once published.
- **06-04 Editor round-trip** — step-duration + node-quantity edits + a new step + new edge all persisted through save + reload (no drops/dupes). Confirms the refactored `handleSave → buildRecipeGraph` id-remap.
- **06-08 (2 of 3 surfaces)** — recipe-card note (`recipe_card`) and calendar note (`calendar`) both landed as `pending` rows in `recipe_notes`.

## Fixed during UAT (committed + deployed)
- **Import forced store/section on made products** (`40d11f0`) — resolver reused QuickCreate for every unmatched line, demanding store/section for the recipe's own output. Added `classifyImportNodes`; made products (stored/transient) auto-create with no store/section; only raw leaf inputs go through QuickCreate.
- **Publish gate over-blocked stored outputs** (`5cd8ed6`) — `missing-store-section` flagged every recipe's stored output (all 58 existing stored products have no store — they're made, not bought). Rule now exempts `stored` like it already did `transient`.
- **Data:** aligned the "lemon, preserved" fixture product `canonical_unit` `oz → each` (cross-dimension vs the `each` node).

## Open findings / TODO
1. **[bug] Cook-mode note fails on merged-prep nodes (06-08).** `NowNextCard` passes `recipeId={instance.step.recipe}`, but week-wide merged-prep StepInstances carry a synthetic `step` with empty `recipe` → `addNote("")` fails, and `AddNoteButton.handleSave` swallows the error (console-only). Fix: derive recipe id from `plannedMealId → planned_meals.recipe`; disable/hide the note button on merged nodes (`mergedMembers` present — ambiguous across recipes); surface save errors to the user instead of swallowing.
2. **[enhancement] Note icon on all meal chips.** The one-tap note is currently only on day-assigned meal chips. It should also appear on the person/"Micah" meals section chips and the week-spanning chips above the calendar — every recipe chip should offer the note affordance.

## Remaining UAT
- **06-08** cook-mode surface (blocked by finding #1).
- **06-09** wizard revision flag (also confirms draft-excluded-from-planning half of 06-05).
