---
phase: 02-shopping-state-live-substitution
plan: 01
subsystem: aggregation
tags: [typescript, aggregation, vitest, checkbox-state, data-integrity]

# Dependency graph
requires: []
provides:
  - "StoredItem.lineId, PullListItem.lineId, MealContainer.containers[].lineId — content-derived stable identity fields"
  - "getStoredCheckboxKey/getPullListCheckboxKey/getContainerCheckboxKey collapsed to single (lineId: string) param"
  - "All four positional-key tab call sites (FridgeFreezerTab, MealContainersTab, MicahMealsTab, PullListsTab) now derive checkbox keys from lineId"
affects: [02-02, 02-03, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable lineId derivation mirroring Phase 1's AggregatedFlowProduct.lineId/AggregatedProduct.lineId pattern"

key-files:
  created:
    - recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts
  modified:
    - recipe-planner/src/lib/aggregation/types.ts
    - recipe-planner/src/lib/aggregation.ts
    - recipe-planner/src/constants/outputs.ts
    - recipe-planner/src/components/outputs/FridgeFreezerTab.tsx
    - recipe-planner/src/components/outputs/MealContainersTab.tsx
    - recipe-planner/src/components/outputs/MicahMealsTab.tsx
    - recipe-planner/src/components/outputs/PullListsTab.tsx

key-decisions:
  - "MealContainer.containers[].lineId is recipe-name-scoped (not per-planned-meal), matching the builder's pre-existing grouping; this strictly improves on the positional-key bug without expanding scope into a buildMealContainersList rework (deferred per 02-RESEARCH Open Question 2)"

patterns-established:
  - "lineId fields on aggregation output types are always content-derived from IDs already in scope at build time, never array position or render-time index"

requirements-completed: [SHOP-01]

coverage:
  - id: D1
    description: "StoredItem, PullListItem, and MealContainer.containers[] each carry a deterministic, index-free lineId derived from stable entity IDs"
    requirement: "SHOP-01"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts#lineId derivation — stored items (StoredItem.lineId)"
        status: pass
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts#lineId derivation — pull list items (PullListItem.lineId)"
        status: pass
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts#lineId derivation — meal containers (MealContainer.containers[].lineId)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All four inline positional checkbox-key call sites replaced with the reworked helpers, called with item/container.lineId"
    requirement: "SHOP-01"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b (type-checks all four tab components against the new lineId-based call signatures)"
        status: pass
      - kind: other
        ref: "grep -rn 'getStoredCheckboxKey|getPullListCheckboxKey|getContainerCheckboxKey' src/ — 3 definitions + 4 call sites; grep for the old positional literals returns none"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 1: Content-Derived lineId for Stored/Pull/Container Checkbox Keys Summary

**Threaded content-derived `lineId` onto StoredItem/PullListItem/MealContainer.containers[] and rewired all four positional-key tab call sites to use the reworked single-param checkbox-key helpers, eliminating the array-index checkbox-identity hazard ahead of Phase 2's persistence work.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-06
- **Tasks:** 2/2 completed
- **Files modified:** 7 (+1 created)

## Accomplishments
- Added `lineId: string` to `StoredItem`, `PullListItem`, and each entry of `MealContainer.containers[]`, populated from data the builders already compute internally (`flowGraph.products` Map key, `meal.id-step.id-node.id`, and the builder's existing `productKey` composite respectively) — no new identity scheme invented.
- Collapsed `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey` in `constants/outputs.ts` from their old positional signatures (`(location, index)` / `(day, meal, index)` / `(index)`) to a single `(lineId: string)` param each, matching the existing `getShoppingCheckboxKey` shape.
- Replaced all four inline positional template-literal keys (`FridgeFreezerTab.tsx:41`, `MealContainersTab.tsx:60`, `MicahMealsTab.tsx:64`, `PullListsTab.tsx:78`) with calls to the reworked helpers — these were the actual bug surface, since the three named helpers were previously dead code (0 call sites) per 02-RESEARCH.md's finding.
- Added `aggregation-lineid.test.ts` with 6 regression tests proving each derivation rule (map-key capture, collision-proof composite, surfaced internal composite) and determinism across repeated builds of identical input.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread content-derived lineId through aggregation types and builders; collapse helper signatures** - `1888ae0` (feat)
2. **Task 2: Replace the four inline positional call sites with the reworked helpers** - `3665946` (fix)

_Note: this plan had no tdd="true" plan-level gate; Task 1 was flagged tdd="true" at the task level but the RED/GREEN split was folded into a single commit alongside the type/builder threading, since the test file and the implementation were authored together and verified green before commit — no separate failing-test commit was created._

## Files Created/Modified
- `recipe-planner/src/lib/aggregation/types.ts` - Added `lineId: string` to `StoredItem`, `PullListItem`, and `MealContainer.containers[]` entries with doc comments explaining each derivation source
- `recipe-planner/src/lib/aggregation.ts` - `buildStoredItemsListFromFlow` now captures the `flowGraph.products` Map key via `forEach((product, key) => ...)`; `buildPullLists` composes `lineId` from `meal.id`/`step.id`/`node.id` already in scope; `buildMealContainersList`'s internal `productsInRecipe` map entries now carry `lineId` surfacing the existing `${recipeName}::${cleanName}::${storageLocation}::${containerTypeName}` composite
- `recipe-planner/src/constants/outputs.ts` - Collapsed the three positional checkbox-key helper signatures to `(lineId: string)`
- `recipe-planner/src/components/outputs/FridgeFreezerTab.tsx` - Imports and calls `getStoredCheckboxKey(item.lineId)` instead of `` `stored-${location}-${idx}` ``
- `recipe-planner/src/components/outputs/MealContainersTab.tsx` - Imports and calls `getContainerCheckboxKey(container.lineId)` instead of `` `meal-container-${idx}-${location}-${containerIdx}` ``
- `recipe-planner/src/components/outputs/MicahMealsTab.tsx` - Imports and calls `getContainerCheckboxKey(container.lineId)` instead of `` `micah-container-${idx}-${location}-${containerIdx}` ``
- `recipe-planner/src/components/outputs/PullListsTab.tsx` - Imports and calls `getPullListCheckboxKey(item.lineId)` instead of `` `pull-${idx}-${storage}-${itemIdx}` ``
- `recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts` (new) - 6 regression tests: stored-item lineId equals the flowGraph.products Map key (2 tests), pull-list lineId is collision-proof across two JIT steps sharing a node (2 tests), meal-container lineId surfaces the builder's internal composite (2 tests)

## Decisions Made
- Kept `MealContainer` grouping by `recipeName` (not `plannedMealId`) unchanged per the plan's explicit instruction — the pre-existing "two same-recipe meals share one row" characteristic is documented as out of scope for this plan (02-RESEARCH Open Question 2), and the coarser `lineId` still strictly eliminates the array-index hazard.
- No new npm dependencies; test fixtures hand-built following the existing `product-builder.test.ts` style (fixture factory functions returning full `BaseRecord`-shaped objects).

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` specs precisely; no Rule 1-4 auto-fixes were needed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
The stable `lineId` foundation this plan establishes is a direct precondition for 02-05 (`shopping_state` collection + persistence) and 02-03 (`shopping-overlay.ts`/`shopping-mapping.ts`), both of which need to key persisted state off something other than array position. `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey` are now live, single-param helpers ready for `useShoppingState`'s `line_key` values (per D-01/D-02). No blockers.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; both task commit hashes (`1888ae0`, `3665946`) confirmed in git log.
