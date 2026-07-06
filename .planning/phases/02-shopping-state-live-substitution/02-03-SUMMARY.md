---
phase: 02-shopping-state-live-substitution
plan: 03
subsystem: shopping-list
tags: [vitest, tdd, pure-functions, aggregation, unit]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: "AggregatedProduct.lineId stable identity (shopping checkbox key)"
provides:
  - "shopping-overlay.ts — OverlaidShoppingItem, overlayShoppingItem(), filterForExport()"
  - "shopping-mapping.ts — SwapTarget, getMealNodeTargetsForProduct()"
affects: [02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, React-free/PocketBase-free modules under src/lib/ for logic that must be unit-testable in Vitest's node environment"
    - "Local minimal structural type to avoid hard-depending on a sibling Wave-1 plan's collection type (ShoppingStateEntry, pending 02-05's ShoppingState)"

key-files:
  created:
    - recipe-planner/src/lib/shopping-overlay.ts
    - recipe-planner/src/lib/shopping-overlay.test.ts
    - recipe-planner/src/lib/shopping-mapping.ts
    - recipe-planner/src/lib/shopping-mapping.test.ts
  modified: []

key-decisions:
  - "ShoppingStateEntry defined locally in shopping-overlay.ts (not imported from 02-05's types.ts) since 02-05 is a sibling Wave-1 plan not guaranteed to land first"
  - "getMealNodeTargetsForProduct fans out one target per matching recipe_product_node — a product used twice in one meal yields two targets for that meal, matching 02-RESEARCH's per-meal fan-out recommendation"

patterns-established:
  - "Derive-then-overlay pure join: overlayShoppingItem(item, stateMap) computes remaining/resolution/isResolved without touching React or PocketBase"
  - "Shopping-line to per-meal-node re-derivation: iterate plannedMeals x meal-keyed recipeData to recover identifiers the aggregation output discards"

requirements-completed: [SHOP-02, SHOP-03, SHOP-04]

coverage:
  - id: D1
    description: "overlayShoppingItem computes remaining = max(0, totalQuantity - have) and marks isResolved when remaining <= 0 or resolution is make/skip (SHOP-02, SHOP-04)"
    requirement: "SHOP-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/shopping-overlay.test.ts#overlayShoppingItem"
        status: pass
    human_judgment: false
  - id: D2
    description: "filterForExport excludes all resolved lines (make/skip/have-complete) per D-06"
    requirement: "SHOP-04"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/shopping-overlay.test.ts#filterForExport"
        status: pass
    human_judgment: false
  - id: D3
    description: "getMealNodeTargetsForProduct resolves a product to distinct {plannedMealId, nodeId} swap targets, including two same-recipe planned meals yielding distinct plannedMealId targets sharing nodeId (phase doc item 9)"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/shopping-mapping.test.ts#getMealNodeTargetsForProduct"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 3: Shopping Overlay & Mapping Modules Summary

**Two pure, dependency-free modules — `shopping-overlay.ts` (have-N remaining/resolution/export filtering per D-04/D-05/D-06) and `shopping-mapping.ts` (shopping-line → per-meal-node swap targets) — both TDD'd green under Vitest's existing `node` environment.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06T20:53:15Z
- **Completed:** 2026-07-06T20:58:45Z
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `shopping-overlay.ts`: `overlayShoppingItem()` computes `remaining = max(0, totalQuantity - have)`, defaults resolution to `buy`, and marks `isResolved` when resolution is `make`/`skip` OR remaining `<= 0`. `filterForExport()` excludes every resolved line (D-06).
- `shopping-mapping.ts`: `getMealNodeTargetsForProduct()` re-derives the meal/node back-link the aggregation output discards, resolving a product ID to one `SwapTarget` per matching `recipe_product_node`, keyed by `plannedMealId` — proven to produce two distinct targets (sharing `nodeId`) for two planned meals of the same recipe (phase doc item 9's exact acceptance case).
- Both modules verified React-free and PocketBase-free (no such imports); both pass `tsc -b` clean and the full existing test suite (84 tests, 8 files) alongside the 17 new tests.

## Task Commits

Each task followed the RED → GREEN TDD cycle:

1. **Task 1: shopping-overlay.ts** - `46e9e1c` (test: failing test), `2536514` (feat: implementation)
2. **Task 2: shopping-mapping.ts** - `d7a1da8` (test: failing test), `9794d53` (feat: implementation)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/shopping-overlay.ts` - `OverlaidShoppingItem`, `overlayShoppingItem()`, `filterForExport()`; local `ShoppingStateEntry` structural type
- `recipe-planner/src/lib/shopping-overlay.test.ts` - 12 tests: remaining math, isResolved per resolution cause, export exclusion
- `recipe-planner/src/lib/shopping-mapping.ts` - `SwapTarget`, `getMealNodeTargetsForProduct()`
- `recipe-planner/src/lib/shopping-mapping.test.ts` - 5 tests: no-match empty array, single match, same-recipe two-meal distinct targets, per-meal multi-node fan-out, missing recipeData entry skip

## Decisions Made
- `ShoppingStateEntry` is defined locally inside `shopping-overlay.ts` as a minimal structural type (`{ have_quantity: number | null; resolution: "buy"|"make"|"skip" }`) rather than imported from `../lib/types`, since the PocketBase `ShoppingState` collection type lands in 02-05, a sibling Wave-1 plan not guaranteed to execute before this one. The structural shape is compatible with whatever 02-05 defines, so no rework is expected once 02-05 lands.
- `getMealNodeTargetsForProduct` fans a per-meal quantity/unit input out to every matching node within that meal (per 02-RESEARCH Open Question 1's recommended default) — confirmed via the "multi-node in one meal" test case producing one target per node.

## Deviations from Plan

None - plan executed exactly as written. Followed the plan's explicit TDD RED→GREEN sequencing (task action bundled test+implementation instructions; executed as separate failing-test commit then implementation commit per the tdd="true" protocol).

## Issues Encountered
- Initial test-file draft used `MealSlot.Dinner`/`Day.Monday` as if they were enums; the actual codebase defines `MealSlot`/`Day` as string-literal union types (`"dinner"`, `"mon"`, etc.), not enums. Caught immediately when writing the test (before any commit) by checking `src/lib/types.ts`; corrected to plain string literals. No impact on shipped code — the implementation module itself was unaffected.

## User Setup Required

None - no external service configuration required. Both modules are pure client-side logic with no new dependencies.

## Next Phase Readiness
- `overlayShoppingItem`/`filterForExport` are ready for 02-07 (Outputs.tsx overlay wiring) to consume once `useShoppingState` (02-06) produces a `Map<string, ShoppingStateEntry>`-compatible state map.
- `getMealNodeTargetsForProduct` is ready for 02-08 (swap dialog) to consume directly against the already-loaded `plannedMeals`/`recipeData` in `Outputs.tsx`.
- Both modules are pure and fully unit-tested; no blockers for downstream plans in this phase.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 4 created files verified present on disk; all 4 task commits (46e9e1c, 2536514, d7a1da8, 9794d53) verified present in git log.
