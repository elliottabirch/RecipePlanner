---
phase: 02-shopping-state-live-substitution
plan: 06
subsystem: state
tags: [react-hooks, pocketbase, optimistic-ui, sync-queue, mui]

# Dependency graph
requires:
  - phase: 02-shopping-state-live-substitution (02-04)
    provides: createSyncQueue coalescing retry/backoff primitive (src/lib/sync-queue.ts)
  - phase: 02-shopping-state-live-substitution (02-05)
    provides: shopping_state PocketBase collection + ShoppingState interface + collections.shoppingState
provides:
  - useShoppingState(weeklyPlanId) optimistic persistence hook
  - SyncIndicator three-state sync status component
affects: [02-07 (Outputs.tsx wiring), 02-08, 02-09, 02-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optimistic local Map update synchronous with the setState call, background write enqueued onto a per-hook createSyncQueue instance"
    - "Query-then-branch PocketBase upsert (getAll-by-filter then create/update) instead of create-then-catch-400"
    - "Coalesced sync-queue payloads always carry the full writable-field set (not a bare patch) so collapsing two rapid enqueues for one key never drops an earlier field's change"

key-files:
  created:
    - recipe-planner/src/hooks/useShoppingState.ts
    - recipe-planner/src/components/outputs/SyncIndicator.tsx
  modified:
    - recipe-planner/src/components/outputs/index.ts

key-decisions:
  - "Enqueue the full merged {checked, have_quantity, resolution} triple on every write, not just the changed field — sync-queue.ts coalesces by replacing the pending payload for a key, so a partial-patch design would silently drop an earlier field's optimistic change if two setters fire before the first flush completes"
  - "SyncIndicator exported from components/outputs/index.ts alongside sibling tab components, matching the existing barrel-export convention, even though only Task 2 required the component file itself"

patterns-established:
  - "useShoppingState is the app's first optimistic-update hook (useRecipeQueue.ts remains the naive await+refetch style); future per-plan persisted state should follow this hook's local-Map + sync-queue shape rather than the refetch pattern"

requirements-completed: [SHOP-01, SHOP-07]

coverage:
  - id: D1
    description: "useShoppingState(weeklyPlanId) loads shopping_state rows into a Map keyed by line_key and exposes setChecked/setHaveQuantity/setResolution with synchronous optimistic local update"
    requirement: "SHOP-01"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b (type-level shape verification; no live-PocketBase test harness exists in this repo per 02-VALIDATION)"
        status: pass
    human_judgment: true
    rationale: "Live round-trip persistence (checkbox state surviving refresh/device switch) requires a manual UAT pass against a running PocketBase instance — no PB mocking/integration test infra exists in this repo (02-RESEARCH Validation Architecture); deferred to the 02-10 UAT checkpoint."
  - id: D2
    description: "Writes route through createSyncQueue using query-then-branch upsert (not create-then-catch-400); isSyncing/pendingCount/failed reflect in-flight and retry-exhausted writes"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Network-drop retry/backoff behavior and recovery-on-reconnect require simulating a real connectivity failure against a live PocketBase instance — manual-only per 02-VALIDATION; deferred to the 02-10 UAT checkpoint."
  - id: D3
    description: "SyncIndicator renders Synced / Saving…(n) / Can't reach server — retrying per pendingCount/failed, using UI-SPEC copy and colors (warning not error; action-grey not accent)"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Visual/copy correctness (exact colors, spacing, 32px height) is a presentational judgment call best confirmed visually once mounted in Outputs.tsx by 02-07 — no component-test infra (jsdom/RTL) exists in this repo per 02-RESEARCH Validation Architecture."

duration: 5min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 06: Shopping State Hook & Sync Indicator Summary

**Optimistic `useShoppingState` persistence hook (local Map + sync-queue-backed query-then-branch upsert) plus a three-state `SyncIndicator` component, both type-checking clean and ready for 02-07 to wire into Outputs.tsx.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-06T21:41:25Z (immediately following 02-05)
- **Completed:** 2026-07-06T21:46:02Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `useShoppingState(weeklyPlanId)` loads all `shopping_state` rows for a plan into a `Map<line_key, ShoppingStateEntry>`, exposing `setChecked`/`setHaveQuantity`/`setResolution` that update local state synchronously before backgrounding the write.
- Background writes are enqueued onto a `createSyncQueue` instance (02-04) whose `process` callback performs the query-then-branch upsert (existing `recordId` → `update`; else filter-query → update-or-create, caching the resolved id back into the Map) — no create-then-catch-400.
- `SyncIndicator` renders the three UI-SPEC surface-6 states (Synced / Saving…(n) / Can't reach server — retrying) with the exact copy, `warning.main` (not `error.main`) for retry-exhausted, and grey `color="action"` (not accent) for Synced.

## Task Commits

Each task was committed atomically:

1. **Task 1: useShoppingState hook — optimistic load + queued upsert** - `86b7d33` (feat)
2. **Task 2: SyncIndicator component** - `082abfa` (feat)

_Note: Task 2's commit also includes the `components/outputs/index.ts` barrel-export addition (Rule 2 — consistency with sibling components, not a scope change)._

## Files Created/Modified
- `recipe-planner/src/hooks/useShoppingState.ts` - Optimistic per-plan `shopping_state` persistence hook backed by 02-04's `createSyncQueue`
- `recipe-planner/src/components/outputs/SyncIndicator.tsx` - Presentational three-state sync status component
- `recipe-planner/src/components/outputs/index.ts` - Added `SyncIndicator` barrel export alongside existing tab component exports

## Decisions Made
- Enqueue the full merged writable-field triple (`checked`, `have_quantity`, `resolution`) on every `applyOptimistic` call rather than the bare patch. `sync-queue.ts`'s coalescing replaces (not merges) a key's pending payload, so a partial-patch design would let a second rapid setter call (e.g. `setChecked` immediately followed by `setHaveQuantity` on the same line) silently overwrite the first field's optimistic value before it ever reaches PocketBase.
- Exported `SyncIndicator` from `components/outputs/index.ts` to match the existing barrel-export convention used by every other tab/component in that directory, since 02-07 will need to import it for Outputs.tsx wiring.

## Deviations from Plan

None - plan executed exactly as written. The `index.ts` export addition is a minor consistency completion (matching the existing barrel-export pattern for every other component in the directory), not a functional deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `useShoppingState` and `SyncIndicator` are ready for 02-07 to wire into `Outputs.tsx`, replacing the in-memory `checkedItems` Set and mounting the indicator in the header.
- Live persistence (SHOP-01 refresh/device-switch round-trip) and retry/reconnect behavior (SHOP-07) remain manual-UAT-only per 02-VALIDATION — deferred to the 02-10 UAT checkpoint, consistent with 02-RESEARCH's Validation Architecture (no PocketBase mocking/integration harness exists in this repo).
- Full test suite (90 tests, 9 files) passes; `npx tsc -b` clean.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*
