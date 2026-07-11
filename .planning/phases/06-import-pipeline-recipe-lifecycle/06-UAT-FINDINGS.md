# Phase 6 — UAT Findings (live tablet walkthrough, 2026-07-10)

Running record of the hands-on UAT against the deployed app (prod, :3000 / PB :8090).

## Verified ✅
- **06-07 Import** — paste JSON → parse-OK → inline resolve of unmatched raw → land draft → redirect into RecipeEditor. Malformed JSON surfaced cleanly, wrote nothing (never-block invariant).
- **06-06 Publish gate** — blocked with a findings dialog on lint violations; published cleanly once resolved.
- **06-05 (list side)** — grey Draft chip on a draft; chip gone once published.
- **06-04 Editor round-trip** — step-duration + node-quantity edits + a new step + new edge all persisted through save + reload (no drops/dupes). Confirms the refactored `handleSave → buildRecipeGraph` id-remap.
- **06-08 (2 of 3 surfaces)** — recipe-card note (`recipe_card`) and calendar note (`calendar`) both landed as `pending` rows in `recipe_notes`. Cook-mode surface blocked (finding #1).
- **06-09 Wizard revision flag** — with a pending draft revision seeded (via evolve DRAIN), the published salad showed the "Revised — review?" flag in the Greens/Salads pool; the draft revision was NOT a separate pool option (confirms the draft-excluded-from-planning half of 06-05); the flag navigated into the draft for review.
- **06-10 Evolution loop (end-to-end)** — DRAIN turned the 2 pending notes into a linked draft revision (`revision_of` set, graph cloned with `source_node` correspondence). Write-back (Op 2) applied the reviewed change (olive oil 4→5) **onto the original recipe id** — recipe id unchanged, olive-oil node id unchanged, 8 nodes updated in place, 0 created/dangling, draft deleted, notes → `applied`, and exactly ONE published salad remains (no duplicate). D-10 id-stability holds.

## Fixed during UAT (committed + deployed)
- **Import forced store/section on made products** (`40d11f0`) — resolver reused QuickCreate for every unmatched line, demanding store/section for the recipe's own output. Added `classifyImportNodes`; made products (stored/transient) auto-create with no store/section; only raw leaf inputs go through QuickCreate.
- **Publish gate over-blocked stored outputs** (`5cd8ed6`) — `missing-store-section` flagged every recipe's stored output (all 58 existing stored products have no store — they're made, not bought). Rule now exempts `stored` like it already did `transient`.
- **Data:** aligned the "lemon, preserved" fixture product `canonical_unit` `oz → each` (cross-dimension vs the `each` node).

## Open findings / TODO
1. **[bug] Cook-mode note fails on merged-prep nodes (06-08).** `NowNextCard` passes `recipeId={instance.step.recipe}`, but week-wide merged-prep StepInstances carry a synthetic `step` with empty `recipe` → `addNote("")` fails, and `AddNoteButton.handleSave` swallows the error (console-only). Fix: derive recipe id from `plannedMealId → planned_meals.recipe`; disable/hide the note button on merged nodes (`mergedMembers` present — ambiguous across recipes); surface save errors to the user instead of swallowing.
2. **[enhancement] Note icon on all meal chips.** The one-tap note is currently only on day-assigned meal chips. It should also appear on the person/"Micah" meals section chips and the week-spanning chips above the calendar — every recipe chip should offer the note affordance.
3. **[bug] Publish button on a revision draft creates a duplicate (06-06 × evolution loop).** `handlePublish` flips `status→published` on any draft, ignoring `revision_of`. Publishing a revision draft mints a SECOND published recipe with a new id, orphaning `planned_meals`/overrides — the exact thing D-10's in-place branch avoids. Fix: on a draft with `revision_of` set, the RecipeEditor should route to the evolve-recipes write-back (approve → write onto the original id) instead of normal publish — hide/relabel the Publish button as "Approve revision", or block plain publish when `revision_of` is set.
4. **[gap] `recipe_steps` has no `source_node` column** — only `recipe_product_nodes` got the write-back correspondence field (06-01). So a revision's cloned steps can't map back to originals, and a full-graph write-back churns step ids (harmless when no `cook_progress` references them, but breaks step-level correspondence in general). Either add `source_node` to `recipe_steps`, or the write-back must match steps by identity. (Current single-field revisions that don't touch steps are unaffected — write-back leaves steps in place.)

## Remaining UAT
- **06-08** cook-mode surface (blocked by finding #1).
- **06-09** wizard revision flag (also confirms draft-excluded-from-planning half of 06-05).
