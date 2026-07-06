---
phase: 02-shopping-state-live-substitution
plan: 07
subsystem: ui
tags: [react, mui, pocketbase, hooks, useMemo, shopping-state]

# Dependency graph
requires:
  - phase: 02-shopping-state-live-substitution (02-01)
    provides: stable lineId keys threaded through all six output tabs
  - phase: 02-shopping-state-live-substitution (02-02)
    provides: VariantOverride.quantity/unit + inherit-when-null in applyVariantOverrides
  - phase: 02-shopping-state-live-substitution (02-03)
    provides: shopping-overlay.ts (overlayShoppingItem/filterForExport) + shopping-mapping.ts
  - phase: 02-shopping-state-live-substitution (02-06)
    provides: useShoppingState hook + SyncIndicator component
provides:
  - Outputs.tsx wired to useShoppingState as the sole source of truth for checked/have-N/resolution state, replacing the in-memory checkedItems Set
  - Override map builder forwards quantity/unit off MealVariantOverride, completing the three swap re-derivation touchpoints with 02-02
  - Derive-then-overlay useMemo (overlaidShoppingList/groupedShoppingList) joining the flow-graph shopping list with persisted state
  - Export filter (filteredShoppingListForExport) now excludes resolved (make/skip/have-complete) lines via filterForExport, on top of the prior pantry-only exclusion
  - SyncIndicator mounted in the Outputs header
affects: [02-08, 02-09, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Set<string> view adapter derived via useMemo from a hook's Map<string, Entry>, preserving an unchanged Set-based prop surface for consumers that predate the hook"
    - "Type assertion (`as { byStore: Map<...OverlaidShoppingItem...> }`) to carry a superset-typed useMemo pipeline through a sibling function (groupShoppingList) typed for the narrower base interface, avoiding an aggregation.ts signature change out of this plan's scope"

key-files:
  created: []
  modified:
    - recipe-planner/src/pages/Outputs.tsx

key-decisions:
  - "Did not destructure setHaveQuantity/setResolution from useShoppingState in this plan (noUnusedLocals is enabled repo-wide) — left them available on the hook for 02-08/02-09 to pull in directly rather than threading unused bindings through Outputs.tsx now"
  - "Overlaid the entire shopping list (including pantry items) through overlayShoppingItem, but kept the pre-existing pantry-checked exclusion branch in filteredShoppingListForExport unchanged — pantry items use a separate getPantryCheckboxKey namespace from getShoppingCheckboxKey, so their resolution/have-N overlay is always the 'buy'/unresolved default and doesn't interfere with the existing pantry-checkbox behavior"
  - "Used a type assertion after groupShoppingList(overlaidShoppingList) rather than widening aggregation.ts's groupShoppingList signature to a generic — keeps this plan's file scope to Outputs.tsx only, per files_modified"

requirements-completed: [SHOP-01, SHOP-03, SHOP-06]

coverage:
  - id: D1
    description: "Outputs.tsx replaces the in-memory checkedItems Set + toggleChecked with useShoppingState(selectedPlanId); a Set<string> view adapter feeds all six tabs' checkedItems/onToggleChecked props unchanged"
    requirement: "SHOP-01"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Live six-tab persistence across refresh/device switch requires a manual UAT pass against a running PocketBase instance (02-10 UAT checkpoint) — no PB mocking/integration test infra exists in this repo per 02-RESEARCH Validation Architecture."
  - id: D2
    description: "Override map builder forwards quantity/unit off the raw MealVariantOverride record into each VariantOverride (D-09 item 10c), completing the three re-derivation touchpoints with 02-02's inherit-when-null applyVariantOverrides branch"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "npx vitest run src/lib/aggregation/utils/variant-utils.test.ts"
        status: pass
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: false
  - id: D3
    description: "Derive-then-overlay memo (overlaidShoppingList -> groupedShoppingList) joins the flow-graph shopping list with useShoppingState's Map via overlayShoppingItem; filteredShoppingListForExport additionally applies filterForExport so make/skip/have-complete lines are excluded from export while remaining visible on-screen (D-05/D-06)"
    requirement: "SHOP-01"
    verification:
      - kind: unit
        ref: "npx vitest run src/lib/shopping-overlay.test.ts"
        status: pass
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "The dimmed/struck on-screen visual treatment for resolved lines (D-05) is a presentational judgment call best confirmed visually once ShoppingListTab consumes the overlaid fields in 02-09 and exercised in the 02-10 UAT checkpoint."
  - id: D4
    description: "SyncIndicator mounted in the Outputs header, right-aligned next to the Weekly Plan Select, fed by useShoppingState's pendingCount/failed"
    requirement: "SHOP-06"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Visual placement/spacing correctness is a presentational judgment call; no jsdom/RTL component-test infra exists in this repo per 02-RESEARCH Validation Architecture — deferred to 02-10 UAT."

duration: 6min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 07: Integration Hub — Outputs.tsx Wired to Live Shopping State Summary

**Outputs.tsx now drives all six tabs' checked state from `useShoppingState`, threads swap quantity/unit through the override map builder, joins the shopping list with persisted have-N/resolution state via a derive-then-overlay memo, and mounts SyncIndicator in the header — with no change to any tab's prop surface.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-06T21:48:00Z (immediately following 02-06)
- **Completed:** 2026-07-06T21:54:03Z
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments
- Replaced the in-memory `checkedItems` Set + `toggleChecked` with `useShoppingState(selectedPlanId)`; a memoized `Set<string>` view adapter derived from the hook's `Map` feeds every one of the six tabs' `checkedItems`/`onToggleChecked` props unchanged.
- Override map builder (`Outputs.tsx`'s `overridesByMeal` construction) now forwards `quantity`/`unit` off the raw `MealVariantOverride` record into each `VariantOverride`, completing the three swap re-derivation touchpoints established across 02-02 (`applyVariantOverrides` inherit-when-null) and this plan.
- Added a `overlaidShoppingList` → `groupedShoppingList` `useMemo` link joining the flow-graph-derived shopping list with the hook's persisted state via `overlayShoppingItem` (02-03), so the visible shopping list now carries `haveQuantity`/`remaining`/`resolution`/`isResolved` per line.
- Generalized `filteredShoppingListForExport` to apply `filterForExport` (excluding make/skip/have-complete lines) in addition to the pre-existing pantry-checked exclusion — export now mirrors the actionable buy list (D-06) while the on-screen list keeps resolved lines visible (D-05).
- Mounted `SyncIndicator` in the Outputs header, right-aligned next to the Weekly Plan selector, fed by `pendingCount`/`failed` from the hook.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace checkedItems Set with useShoppingState + Set-view adapter** - `f7db8ce` (feat)
2. **Task 2: Thread quantity/unit through the override map builder; integrate overlay + export filter** - `c85f8ff` (feat)

## Files Created/Modified
- `recipe-planner/src/pages/Outputs.tsx` - Hook wiring (useShoppingState + Set-view adapter), override-map quantity/unit threading, derive-then-overlay memo, generalized export filter, SyncIndicator mount

## Decisions Made
- Did not destructure `setHaveQuantity`/`setResolution` from `useShoppingState` in this plan — `noUnusedLocals` is enabled repo-wide and neither is called from this plan's scope; both remain available on the hook for 02-08 (swap/make-it handlers) and 02-09 (ShoppingListTab have-N wiring) to pull in directly when they need them.
- Overlaid the entire shopping list (pantry items included) through `overlayShoppingItem`, but left the existing pantry-checked exclusion branch in `filteredShoppingListForExport` untouched — pantry items are keyed via `getPantryCheckboxKey(productId)`, a different namespace than `getShoppingCheckboxKey(lineId)`, so their overlay resolution stays at the `buy`/unresolved default and doesn't change pantry behavior.
- Used a type assertion (`as { byStore: Map<string, Map<string, OverlaidShoppingItem[]>>; ... }`) on `groupShoppingList(overlaidShoppingList)`'s return rather than widening `aggregation.ts`'s `groupShoppingList` signature to a generic — this plan's `files_modified` scopes to `Outputs.tsx` only, and the cast is a truthful reflection of the runtime shape (`OverlaidShoppingItem` is a strict superset of `AggregatedProduct`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc -b` was clean on the first attempt for both tasks; the full Vitest suite (90 tests, 9 files) passed unchanged throughout.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `Outputs.tsx` now exposes `useShoppingState`'s full return in scope (`shoppingState`, `setChecked`, `pendingCount`, `failed` destructured; `setHaveQuantity`/`setResolution` available but not yet destructured) for 02-08's swap dialog / make-it handlers and 02-09's `ShoppingListTab` have-N stepper wiring to consume directly.
- `groupedShoppingList`'s items are now `OverlaidShoppingItem` at runtime (carrying `haveQuantity`/`remaining`/`resolution`/`isResolved`), ready for 02-09 to update `ShoppingListTab`'s prop type and render the have-N stepper / dimmed-resolved-row treatment (UI-SPEC surfaces 1-2) without any further `Outputs.tsx` plumbing changes.
- Live six-tab persistence (SHOP-01 refresh/device-switch round-trip), the visual dimmed/struck treatment (D-05), and SyncIndicator's visual placement remain manual-UAT-only per 02-RESEARCH Validation Architecture — deferred to the 02-10 UAT checkpoint.
- Full test suite (90 tests, 9 files) passes; `npx tsc -b` clean.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/src/pages/Outputs.tsx
- FOUND: f7db8ce
- FOUND: c85f8ff
