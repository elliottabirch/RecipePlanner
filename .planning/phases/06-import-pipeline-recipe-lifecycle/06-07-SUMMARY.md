---
phase: 06-import-pipeline-recipe-lifecycle
plan: 07
subsystem: ui
tags: [react, mui, import, recipe-graph, product-matching, fuse]

# Dependency graph
requires:
  - phase: 06-01
    provides: Recipe.status field (draft/published) landing status
  - phase: 06-02
    provides: validateImportJson normalizer + scoreProduct confidence gate
  - phase: 06-04
    provides: buildRecipeGraph shared write-spine
provides:
  - In-app /import page — paste D-01 recipe JSON, non-blocking validation, inline unmatched-product resolution, land draft in prod, redirect into RecipeEditor
  - /import route registration + nav entry (PostAdd icon, mini-rail tooltip)
affects: [06-08, 06-09, 06-10, 06-11, import-pipeline, recipe-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin page wiring: Import.tsx delegates all non-trivial logic to Plan 02/04 pure modules (validate, score, build)"
    - "Auto-match confidence gate: scoreProduct best-score <= 0.15 auto-resolves, else drop into inline match step"
    - "Reuse QuickCreateProductDialog for inline unmatched resolution (guarantees store/section/unit)"

key-files:
  created:
    - recipe-planner/src/pages/Import.tsx
  modified:
    - recipe-planner/src/App.tsx
    - recipe-planner/src/components/Layout.tsx

key-decisions:
  - "AUTO_MATCH_THRESHOLD = 0.15 for confident scoreProduct auto-match; near-misses fall to inline review (D-02)"
  - "Match step reuses QuickCreateProductDialog (quick-create + Search-USDA) plus an Autocomplete pick-existing filtered by searchProducts"
  - "Fully-resolved-on-first-pass lands immediately; unmatched lines gate behind an explicit Finish import button"

patterns-established:
  - "Import never hard-blocks: writes nothing until valid AND every line resolved (T-06-07a/b/c)"
  - "landDraft takes graph+matches as args (not state) so a zero-unmatched validate can land before React flushes setState"

requirements-completed: [IMP-02, IMP-03]

coverage:
  - id: D1
    description: "Import page validates pasted recipe JSON via validateImportJson (non-blocking) and surfaces problems as MUI Alerts without writing anything"
    requirement: "IMP-02"
    verification:
      - kind: unit
        ref: "src/lib/import/validate-import.test.ts (validateImportJson never-throw/never-block contract)"
        status: pass
      - kind: manual_procedural
        ref: "UAT step 5: malformed paste renders warnings, nothing saved, button stays enabled"
        status: unknown
    human_judgment: true
    rationale: "jsdom-untestable paste→resolve→land→redirect flow; live tablet verification of the full round-trip required"
  - id: D2
    description: "Unmatched/low-confidence product lines resolved inline (auto-match, pick-existing, or QuickCreateProductDialog) so every line carries store/section/unit before the draft lands"
    requirement: "IMP-02"
    verification:
      - kind: manual_procedural
        ref: "UAT step 3: unmatched ingredient triggers Match these products, resolved via QuickCreateProductDialog"
        status: unknown
    human_judgment: true
    rationale: "Inline dialog resolution + product picker is a live interaction not exercised by the node-env suite"
  - id: D3
    description: "On resolve the recipe lands directly in prod as a draft via buildRecipeGraph({status:draft}) and redirects into RecipeEditor"
    requirement: "IMP-03"
    verification:
      - kind: unit
        ref: "src/lib/import/build-recipe-graph.test.ts (planGraphWrites draft status + id-remap)"
        status: pass
      - kind: manual_procedural
        ref: "UAT step 4: Draft-badged recipe lands, redirect into RecipeEditor shows full graph"
        status: unknown
    human_judgment: true
    rationale: "Draft landing + navigation into the editor requires a live PocketBase write and router redirect"
  - id: D4
    description: "/import registered as a route and nav entry with a mini-rail tooltip"
    requirement: "IMP-02"
    verification:
      - kind: automated_ui
        ref: "grep path=\"import\" src/App.tsx + renderNav Import /import src/components/Layout.tsx; tsc --noEmit clean"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-10
status: complete
---

# Phase 6 Plan 07: In-App Import Page Summary

**A `/import` page that pastes D-01 recipe JSON, validates non-blockingly, resolves unmatched products inline via QuickCreateProductDialog, and lands a draft directly in prod through the shared buildRecipeGraph write-spine — retiring the test-DB migration ritual.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-10
- **Tasks:** 2 auto tasks executed + 1 human-verify checkpoint deferred to UAT
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- New `Import.tsx` page: paste → `validateImportJson` (non-blocking Alerts) → auto-match confident products via `scoreProduct` (threshold 0.15) → inline "Match these products" step for the rest → land draft via `buildRecipeGraph({status:"draft"})` → `navigate('/recipes/:id')` into RecipeEditor.
- Inline resolution reuses `QuickCreateProductDialog` (quick-create + Search-USDA tab, guarantees store/section/unit) alongside an Autocomplete pick-existing filtered by the shared `searchProducts` fuzzy search.
- `/import` registered as a route in `App.tsx` and a nav entry in `Layout.tsx` (PostAdd icon, mini-rail tooltip via the shared `renderNav` helper) plus the AppBar title mapping.
- Import never hard-blocks: nothing is written until the paste is valid AND every product line is resolved (threats T-06-07a/b/c mitigated).

## Task Commits

1. **Task 1: Import page — paste, validate, inline-resolve, land draft** - `1dfb733` (feat)
2. **Task 2: /import route + nav entry** - `24216f7` (feat)

**Plan metadata:** (docs: complete plan — this commit)

## Files Created/Modified
- `recipe-planner/src/pages/Import.tsx` - The import page: thin wiring over the Plan 02/04 pure modules; validation Alerts, confidence auto-match, inline match step, draft landing.
- `recipe-planner/src/App.tsx` - Added `<Route path="import" element={<ImportRecipe />} />`.
- `recipe-planner/src/components/Layout.tsx` - Added Import nav entry (PostAdd icon) + AppBar title mapping for `/import`.

## Decisions Made
- `AUTO_MATCH_THRESHOLD = 0.15` — `scoreProduct` returns lower=better (0=exact); confident matches auto-resolve, near-misses fall into the inline review step so the user never gets a silent mis-match (D-02).
- Match step offers both a pick-existing Autocomplete (reusing `searchProducts` as its filter, so ranking matches app search) and the `QuickCreateProductDialog` for quick-create/Search-USDA.
- Zero-unmatched paste lands immediately; any unmatched line gates behind an explicit **Finish import** button rendered only once all lines are resolved.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. Baseline tsc and full suite were green before and after; a duplicate `product-search` import statement was consolidated into one line before the Task 1 commit (no behavior change).

## Automated Verification (complete)
- `npx tsc --noEmit` — clean (EXIT 0).
- `npm test` — 29 files, **238 tests passed** (EXIT 0).
- `grep path="import" src/App.tsx` — route present (line 60).
- `grep "/import" src/components/Layout.tsx` — nav entry present (line 153) + title mapping (line 239).

## Needs UI Verification (UAT)
Task 3 is a `checkpoint:human-verify` (gate="blocking") — jsdom-untestable, deferred under auto-mode. Verify live on the tablet:

1. Run the app; navigate to `/import` via the nav (Import entry after Step Backfill; confirm the mini-rail tooltip when the drawer is collapsed).
2. Paste a fixture D-01 recipe JSON with at least one ingredient NOT in the registry.
3. Confirm the parse-OK success Alert shows ingredient/step/unmatched counts; the unmatched ingredient triggers the "Match these products" step; resolve it via QuickCreateProductDialog (store/section/unit set) or the pick-existing Autocomplete.
4. Click **Import recipe** (or **Finish import** after resolving) — confirm a DRAFT recipe lands (badged Draft in the list) and the app redirects into RecipeEditor showing the full graph (nodes, steps with Phase-5 fields, edges).
5. Paste malformed JSON — confirm warnings render, NOTHING is saved, and the button stays enabled for a re-attempt.

**Resume signal:** Type "approved" if the paste→resolve→land→redirect flow works and malformed input never writes, or describe the issue.

## Next Phase Readiness
- Import page is the in-app entry point for recipe creation; downstream plans (Publish gate 06-06, /suggest landing 06-11, evolution write-back 06-10) share the same `buildRecipeGraph` spine.
- No external service configuration required. No new packages.

## Self-Check: PASSED
- All created/modified files present on disk.
- Both task commits (1dfb733, 24216f7) present in git history.

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-10*
