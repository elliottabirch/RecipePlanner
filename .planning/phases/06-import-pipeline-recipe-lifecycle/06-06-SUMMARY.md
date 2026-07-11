---
phase: 06-import-pipeline-recipe-lifecycle
plan: 06
subsystem: ui
tags: [react, mui, linter, publish-gate, recipe-lifecycle]

# Dependency graph
requires:
  - phase: 06-01
    provides: Recipe.status ("draft" | "published") field
  - phase: 06-03
    provides: runRecipeLint(recipeId) publish-gate rule engine
  - phase: 06-04
    provides: buildRecipeGraph write spine used by RecipeEditor save path
  - phase: 06-05
    provides: draft-status filter so a published recipe re-enters the planning pool
provides:
  - Draft-only Publish button in RecipeEditor action bar
  - handlePublish that gates status writes on runRecipeLint
  - Lint-findings dialog (mirrors Products.tsx pattern)
affects: [week-wizard, add-meal-picker, recipe-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publish gate: run lint before a status-promoting write; return before write on any finding"
    - "Findings dialog reuses the Products.tsx MUI Alert-per-finding pattern"

key-files:
  created: []
  modified:
    - recipe-planner/src/pages/RecipeEditor.tsx

key-decisions:
  - "Captured the previously-discarded recipe state (line 133) so the Publish button can condition on status === draft and hide after publish"
  - "handlePublish returns before any status write when findings exist (T-06-06a) — status only written on empty findings"
  - "Publish button gated to render only for draft recipes (T-06-06b)"

patterns-established:
  - "Publish gate: runRecipeLint(id) → findings dialog OR status flip, never both"

requirements-completed: [IMP-07]

coverage:
  - id: D1
    description: "Draft-only Publish button in RecipeEditor that runs runRecipeLint and flips status to published only on a clean pass"
    requirement: "IMP-07"
    verification:
      - kind: other
        ref: "cd recipe-planner && npx tsc --noEmit (clean)"
        status: pass
      - kind: unit
        ref: "npm test — 29 files / 238 tests pass (includes recipe-lint suite)"
        status: pass
    human_judgment: true
    rationale: "The button/dialog live UI flow (block on findings, succeed clean, button hides, recipe re-enters planning pool) is jsdom-untestable; a live pass/fail check is required per plan Task 2."

# Metrics
duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 6 Plan 6: Publish Gate in RecipeEditor Summary

**Draft-only Publish button that runs runRecipeLint(id), opens a findings dialog and never writes status on failure, and flips status to published only on a clean pass — closing the draft→plannable lifecycle loop.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-10T23:58:07Z
- **Completed:** 2026-07-11T00:04:00Z
- **Tasks:** 1 auto (Task 2 is a human-verify checkpoint — recorded as UAT below)
- **Files modified:** 1

## Accomplishments
- Added a `Publish` button to the RecipeEditor action bar, rendered only when `recipe?.status === "draft"` (green `color="success"` accent per UI-SPEC).
- Added `handlePublish`: calls `runRecipeLint(id)`; on any findings it opens the lint dialog and RETURNS before any status write; on empty findings it `update(recipes, id, { status: "published" })` and refreshes local recipe state so the button hides.
- Added a lint-findings `<Dialog>` mirroring Products.tsx:522-561 — title "Fix N issue(s) before publishing", one `<Alert severity={finding.severity}>` per finding rendering `<strong>{rule}</strong>: {message}`, and a Close action.
- Import remains unblocked — publishing is the single hard gate (first-class invariant preserved).

## Task Commits

1. **Task 1: Publish button + lint-findings dialog in RecipeEditor** - `f0860d2` (feat)

## Files Created/Modified
- `recipe-planner/src/pages/RecipeEditor.tsx` - Added publish-gate state (`findings`, `lintDialogOpen`, `publishing`), captured the previously-discarded `recipe` state, `handlePublish` handler, draft-only Publish button, and the lint-findings dialog. Added `update` + `runRecipeLint` + `LintFinding` imports.

## Decisions Made
- **Captured recipe state:** line 133 was `const [, setRecipe]` — the value was discarded. Changed to `const [recipe, setRecipe]` so the button can condition on `recipe?.status === "draft"` and hide immediately after a successful publish (via an optimistic `setRecipe` merge, avoiding a refetch). This is the minimal change needed to satisfy the draft-only render (D-06).
- **Save button untouched:** `handleSave` and the Save button were left exactly as-is per plan direction.

## Deviations from Plan
None - plan executed exactly as written. (Plan line refs to the action bar named ~940-947; the Save button was actually at ~864-871, but the placement instruction — "next to Save" — was followed unchanged.)

## Issues Encountered
None.

## Needs UI Verification (UAT)

Task 2 is a `checkpoint:human-verify` (gate="blocking"). Under auto-mode the automated verification was run (tsc clean, 238/238 tests pass) and the plan was completed; the live UI check below still needs a human pass:

1. Run the app; open a DRAFT recipe with a lint-violating step (e.g. a step missing durations/prep_action).
2. Click **Publish** — confirm the "Fix N issue(s) before publishing" dialog lists the findings and the recipe stays a draft (Draft chip remains in the list); status is unchanged.
3. Fix the violation, Save, click **Publish** again — confirm it succeeds silently, the Publish button disappears, and the recipe now appears in the WeekWizard pool / Add-Meal picker (re-entered planning).
4. Confirm a published (non-draft) recipe shows **no** Publish button.

**Resume signal:** Type "approved" if publish blocks on findings and succeeds on a clean pass, or describe the failure.

## Next Phase Readiness
- The draft→published lifecycle loop is closed: a draft becomes plannable only after passing the linter.
- Ready for the remaining Phase 6 plans (06-07 onward).

## Self-Check: PASSED
- FOUND: recipe-planner/src/pages/RecipeEditor.tsx
- FOUND commit: f0860d2

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-11*
