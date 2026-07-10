---
phase: 06-import-pipeline-recipe-lifecycle
plan: 02
subsystem: import
tags: [import, json-contract, fuzzy-search, fuse.js, validation, pure-module]

# Dependency graph
requires:
  - phase: 06-01
    provides: Phase-6 schema + Recipe.status/revision_of + RecipeNote types the import contract targets
provides:
  - validateImportJson never-throw JSON contract normalizer (D-01/D-02)
  - NormalizedGraph / NormalizedProductNode / NormalizedStep / ImportError types
  - scoreProduct scored fuzzy matcher exposing the numeric fuse score (D-02 gate)
affects: [06-04, 06-07, 06-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-written total (never-throw) normalizer over ajv — failures surface as an ImportError list, never propagate"
    - "Scored search sibling that keeps the fuse score searchProducts discards, reusing the shared FUSE_OPTIONS"

key-files:
  created:
    - recipe-planner/src/lib/import/validate-import.ts
    - recipe-planner/src/lib/import/validate-import.test.ts
  modified:
    - recipe-planner/src/lib/search/product-search.ts
    - recipe-planner/src/lib/search/product-search.test.ts

key-decisions:
  - "Import-side NormalizedGraph carries the D-01 {name + hints} product shape (name/unit/matchProductId?/...) rather than the resolved-productId shape buildRecipeGraph consumes — product resolution is a later import-page step (Plan 07)"
  - "prep_action has no canonical enum in types.ts (free string), so it passes through as a non-empty string; only resource/timing/recipe_type validate against fixed enum sets"
  - "ajv deliberately not adopted (transitive @6.12.6); its throw-on-invalid model fights the never-block invariant"

patterns-established:
  - "Total validators: return a discriminated {ok:true|false} result for every input, parse inside try/catch, never throw"
  - "Enum normalization mirrors loadRecipe's `|| undefined`: unknown value -> undefined + warning, never a hard reject"

requirements-completed: [IMP-02]

coverage:
  - id: D1
    description: "validateImportJson never-throw JSON contract normalizer: malformed JSON, missing name/unit, missing/invalid step_type, dangling edge ref all return {ok:false, errors}; unknown resource/timing normalize to undefined + warning; valid input round-trips to a NormalizedGraph"
    requirement: "IMP-02"
    verification:
      - kind: unit
        ref: "src/lib/import/validate-import.test.ts#validateImportJson — never-throw contract normalizer"
        status: pass
    human_judgment: false
  - id: D2
    description: "scoreProduct scored fuzzy matcher exposes the numeric fuse score (lower = better) best-first, reuses FUSE_OPTIONS for word-order/typo parity, returns [] for empty query; searchProducts unchanged"
    requirement: "IMP-02"
    verification:
      - kind: unit
        ref: "src/lib/search/product-search.test.ts#scoreProduct — scored fuzzy matcher (D-02 gate)"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min
completed: 2026-07-10
status: complete
---

# Phase 06 Plan 02: Import Primitives Summary

**A total (never-throw) `validateImportJson` normalizer that surfaces every contract failure as an error/warning list, plus a `scoreProduct` fuzzy matcher that keeps the fuse score `searchProducts` discards — the two pure primitives the import page (Plan 07) and /suggest skill (Plan 11) wire into.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-10T23:31:59Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `validateImportJson(raw: string | unknown)` — a provably total normalizer: parses strings inside try/catch, validates + normalizes structure only, and returns `{ok:true, graph, warnings}` or `{ok:false, errors}` for every possible input (verified across 11 pathological inputs, never throws).
- Full failure-mode coverage surfaced as a list, never a throw/block: malformed JSON, product line missing name/unit, step missing/invalid step_type, dangling edge ref (named in the message), plus enum-normalize-to-warning for unknown resource/timing/recipe_type.
- `NormalizedGraph` / `NormalizedProductNode` / `NormalizedStep` / `ImportError` types exported, preserving/assigning the `product-*`/`step-*` ref convention so Plan 04's id-remap ports unchanged.
- `scoreProduct` added to `product-search.ts`, keeping the numeric fuse score for the D-02 confidence gate while reusing the shared `FUSE_OPTIONS` (word-order + typo parity with app search); `searchProducts` untouched.

## Task Commits

Each task followed TDD (test → feat):

1. **Task 1: validateImportJson never-throw normalizer** - `23604a9` (test), `2da8f48` (feat)
2. **Task 2: scoreProduct scored fuzzy matcher** - `152ba68` (test), `27a0ce2` (feat)

**Plan metadata:** _(this commit)_

## Files Created/Modified
- `recipe-planner/src/lib/import/validate-import.ts` - Total JSON contract normalizer + NormalizedGraph/ImportError types (D-01/D-02)
- `recipe-planner/src/lib/import/validate-import.test.ts` - 12 tests: malformed JSON, missing fields, dangling refs, enum warnings, valid round-trip, string/object parity, ref auto-assignment
- `recipe-planner/src/lib/search/product-search.ts` - Added `scoreProduct` (kept the discarded fuse score); `searchProducts` unchanged
- `recipe-planner/src/lib/search/product-search.test.ts` - Added 6 `scoreProduct` tests alongside existing `searchProducts` tests

## Decisions Made
- The import-side `NormalizedGraph` intentionally carries the D-01 `{name + hints}` product shape (name/unit/matchProductId?/productType?/pantry?/fdcId?/store?/section?), NOT the resolved-`productId` shape that `buildRecipeGraph` (Plan 04) consumes. Product resolution via `scoreProduct` is a distinct import-page step (Plan 07); keeping the contract at "name + hints" is what lets a JSON emitter need no DB access (D-01 rationale).
- `prep_action` is a free `string` in `types.ts` (no canonical enum anywhere in the codebase), so it passes through as a non-empty string rather than validating against a fixed set. Only `resource` (9-value enum), `timing` (batch/just_in_time), and `recipe_type` (meal/batch_prep) validate against fixed sets and warn-normalize on unknown values.
- Duplicate refs are treated as an error (not silently deduped) since edge resolution depends on unambiguous refs.

## Deviations from Plan
None - plan executed exactly as written. `product-search.test.ts` already existed (the plan anticipated this: "create the file if it does not yet exist"), so the `scoreProduct` cases were appended alongside the existing `searchProducts` tests reusing the shared fixture.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Both are pure `src/lib` modules with no runtime dependency added.

## Next Phase Readiness
- `validateImportJson` output `NormalizedGraph` is the exact input contract Plan 04's `buildRecipeGraph` extraction consumes — the ref convention and edge `{from,to}` shape are aligned.
- `scoreProduct` gives Plan 07's product-resolution step and Plan 11's /suggest overlap metric a numeric score to threshold on (D-02 suggested gate ≈0.15, tune during wiring).
- No blockers.

## Self-Check: PASSED

All created/modified files exist on disk; all four task commits (23604a9, 2da8f48, 152ba68, 27a0ce2) present in git history. Full suite green (212 tests), `npx tsc --noEmit` clean.

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-10*
