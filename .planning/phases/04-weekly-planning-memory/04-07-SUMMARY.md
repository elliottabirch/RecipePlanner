---
phase: 04-weekly-planning-memory
plan: 07
subsystem: ui
tags: [react, mui, useMemo, aggregation, weekly-planning]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory (04-02)
    provides: WeeklyPlan.people_multiplier field on the schema/type
  - phase: 04-weekly-planning-memory (04-03)
    provides: buildProductFlowGraph/buildPullLists peopleMultiplier parameter (pure scaling math)
provides:
  - Outputs.tsx derives selectedPlan/peopleMultiplier and threads it into both aggregation call sites
  - Live re-derivation on plan switch / multiplier change via corrected useMemo dependency arrays
  - "x{N} servings" multiplier badge next to the plan selector, rendered only when != 1
affects: [04-08 (New Plan dialog date+multiplier), verify-work UAT for WEEK-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "peopleMultiplier derived once (selectedPlan lookup + ?? 1 fallback) and threaded as an explicit useMemo dependency at every direct aggregation call site; downstream memos inherit correctness transitively via productFlowGraph (Pitfall 3)"

key-files:
  created: []
  modified:
    - recipe-planner/src/pages/Outputs.tsx

key-decisions: []

patterns-established: []

requirements-completed: [WEEK-02]

coverage:
  - id: D1
    description: "peopleMultiplier threaded from selected plan into buildProductFlowGraph and buildPullLists, with both useMemo dependency arrays updated so plan switches / multiplier edits re-derive outputs live"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "npm run build (tsc) - clean; npm test - 138/138 passing, no regressions"
        status: pass
      - kind: manual_procedural
        ref: "Task 2 checkpoint:human-verify - exercise running app with a x2 plan"
        status: unknown
    human_judgment: true
    rationale: "Live cross-tab re-derivation (shopping/prep/container/pull-list all updating together without reload) and visual badge toggling are runtime UI behaviors verifiable only by exercising the app; AUTO_MODE deferred this to the user rather than auto-approving a claim that was never actually driven end-to-end."
  - id: D2
    description: "x{N} servings Chip renders adjacent to the plan selector only when people_multiplier !== 1, using secondary.main/#ff6f00 per 04-UI-SPEC.md; no chip/space reserved at multiplier 1"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "npm run build (tsc) - clean; grep -c peopleMultiplier src/pages/Outputs.tsx == 7"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-09
status: complete
---

# Phase 4 Plan 07: Live people_multiplier threading on Outputs Summary

**Outputs.tsx now derives the selected plan's people_multiplier and threads it into buildProductFlowGraph and buildPullLists (both useMemo deps corrected), with a secondary-orange x{N} servings badge next to the plan selector shown only when scaled.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-09T21:41:57Z
- **Completed:** 2026-07-09T21:54:00Z
- **Tasks:** 1 of 2 (Task 2 is a checkpoint:human-verify; auto-approved per AUTO_MODE, UAT deferred to user)
- **Files modified:** 1

## Accomplishments
- `selectedPlan`/`peopleMultiplier` derived once via `useMemo` off `plans`/`selectedPlanId`, with `?? 1` fallback for plans predating the WEEK-01 field
- `peopleMultiplier` passed as the 3rd argument to both `buildProductFlowGraph` and `buildPullLists`, with both call sites' `useMemo` dependency arrays updated so switching plans or editing the multiplier re-derives shopping/prep/container/pull-list outputs live (Pitfall 3) — downstream memos (`shoppingList`, `overlaidShoppingList`, `groupedShoppingList`, `batchPrepSteps`, `storedItems`, `mealContainers`) inherit correctness transitively through `productFlowGraph` and needed no changes
- `Chip` imported from `@mui/material`; a `"×{value} servings"` badge (secondary.main background, white text, size small) renders next to `SyncIndicator`/before the plan `Select`, gated on `peopleMultiplier !== 1` so an unscaled week renders with no extra chip/space, matching 04-UI-SPEC.md exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread peopleMultiplier + useMemo deps + multiplier badge** - `1a2b51b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/pages/Outputs.tsx` - Added `Chip` import; `selectedPlan`/`peopleMultiplier` derivation; threaded `peopleMultiplier` into `buildProductFlowGraph`/`buildPullLists` call sites + their `useMemo` deps; added the multiplier badge next to the plan selector

## Decisions Made
None - followed plan as specified. Implementation matches 04-RESEARCH.md Pattern 4 and 04-UI-SPEC.md's Outputs multiplier badge spec verbatim.

## Deviations from Plan

None - plan executed exactly as written. `grep -c "peopleMultiplier" src/pages/Outputs.tsx` returns 7 (derivation x2, both call sites x2, both deps arrays x2, badge condition x1), exceeding the >= 3 acceptance floor.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Task 2: Human-Verify Checkpoint (Auto-Approved, UAT Deferred)

Per the orchestrator's AUTO_MODE directive, the `checkpoint:human-verify` gate (Task 2) is treated as auto-approved for the purpose of completing this plan's implementation — all code changes are finished, committed, and pass `npm run build` + the full test suite. However, the underlying claim this checkpoint exists to verify — that scaling is visibly correct end-to-end in the running app (a x2 plan scales shopping/prep/container/pull-list quantities live without reload, the badge toggles on the boundary, and switching between two differently-scaled plans re-derives immediately) — has **not** been exercised against a running instance in this session. This is recorded as deferred live UAT, not as a verified pass:

**How to verify (unchanged from plan):** Open Outputs for a plan, note quantities, set that plan's `people_multiplier` to 2 (via admin directly, since 04-08's New Plan dialog fields land in a separate plan), reopen Outputs and confirm: (1) shopping/batch-prep/container/pull-list quantities all scale x2 without a full reload; (2) the "×2 servings" badge appears; (3) resetting to 1 removes the badge and restores original quantities; (4) switching between two differently-scaled plans re-derives immediately.

## Next Phase Readiness
- WEEK-02 is now visible end-to-end at the code level (04-03's pure scaling math + this plan's threading + badge); live UAT against a running app with a real x2 plan is still owed to the user before WEEK-02 can be marked fully validated.
- 04-08 (New Plan dialog start_date + people_multiplier fields) is a prerequisite for creating a scaled plan through the UI rather than admin — already complete per STATE.md, so the manual verification path above is available.

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-09*
