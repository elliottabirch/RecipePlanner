---
phase: 04-weekly-planning-memory
plan: 01
subsystem: testing
tags: [vitest, tdd-scaffolding, aggregation, units, pocketbase-scripts]

# Dependency graph
requires:
  - phase: 03-product-registry-seeding
    provides: established vitest pure-resolver test pattern (scripts/seed-usda.test.js)
provides:
  - Four RED Nyquist test scaffolds locking Phase 4's observable contracts before implementation
  - src/lib/planning/history.test.ts (AC#6 LRU tie-break + WEEK-03 poolForSlot)
  - src/lib/aggregation/aggregation-multiplier.test.ts (D-03 pull-list fix + peopleMultiplier threading)
  - src/lib/units.test.ts scaleQuantity block (D-04 discrete/continuous rounding)
  - scripts/backfill-plan-dates.test.js (WEEK-01 backfill resolver)
affects: [04-03, 04-04, 04-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED-for-the-right-reason verification: every new spec confirmed to fail on missing-module/missing-export/unimplemented-behavior, never a syntax error, via an actual npm run test invocation before committing"

key-files:
  created:
    - recipe-planner/src/lib/planning/history.test.ts
    - recipe-planner/src/lib/aggregation/aggregation-multiplier.test.ts
    - recipe-planner/scripts/backfill-plan-dates.test.js
  modified:
    - recipe-planner/src/lib/units.test.ts

key-decisions:
  - "poolForSlot/TemplateSlot fixtures use inline object literals cast with `as any` rather than importing a TemplateSlot type — that type doesn't exist in types.ts yet (deferred to 04-02's schema work), matching 04-RESEARCH's own Code Example convention of `as any` casts for not-yet-typed fixtures"
  - "resolvePlanDate designed as (plan, index, baseMonday) — a pure function; the descending-by-created/id-asc-tie-break SORT is exercised inline in the test itself (not a second exported symbol), since the plan's own main() owns that live-order derivation, keeping the module's public surface to the single resolvePlanDate name the task specifies"
  - "aggregation-multiplier.test.ts duplicates aggregation-lineid.test.ts's fixture helpers (makeProduct/makeProductNode/makeRecipeData/makePlannedMeal/makeStep/makeEdge) rather than importing them — the source file exports nothing, matching this project's convention of self-contained test files with no shared fixture module"

requirements-completed: [WEEK-01, WEEK-02, WEEK-03, WEEK-04]

coverage:
  - id: D1
    description: "history.test.ts collected by vitest, RED only on the missing ./history module import (not a syntax error); covers AC#6 LRU tie-break (never-planned first, ascending last-planned date, name-asc/id-asc ties, deterministic across reversed input) and WEEK-03 poolForSlot match-any tag intersection"
    requirement: "WEEK-04"
    verification:
      - kind: unit
        ref: "npm run test -- src/lib/planning/history.test.ts (confirmed: Cannot find module './history' — RED for the right reason)"
        status: fail
    human_judgment: true
    rationale: "This is a Wave 0 RED scaffold — the deliverable is 'correctly failing for the right reason', not passing test assertions. Genuine pass/fail proof only exists once 04-04 implements ./history.ts and flips this file GREEN."
  - id: D2
    description: "aggregation-multiplier.test.ts collected by vitest; asserts the D-03 pull-list regression fix (quantity:2 meal doubles output, independent of multiplier), 1.5x/compounding peopleMultiplier scaling, and AC#8 no-regression at multiplier=1"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "npm run test -- src/lib/aggregation/aggregation-multiplier.test.ts (confirmed: 4 of 5 assertions RED on unimplemented peopleMultiplier/D-03 fix; the multiplier=1 no-regression case passes both before and after, by design)"
        status: fail
    human_judgment: true
    rationale: "Wave 0 RED scaffold — proven correct-for-the-right-reason via a manual test run, but genuine GREEN proof is deferred to 04-03's implementation."
  - id: D3
    description: "units.test.ts scaleQuantity block collected by vitest, RED only on the not-yet-exported scaleQuantity symbol; asserts exact-continuous (mass/volume, fractional) vs ceil-discrete (each-dimension, literal 'discrete' forceDiscrete arg, container float-drift) rounding"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "npm run test -- src/lib/units.test.ts (confirmed: 6 new tests RED with 'scaleQuantity is not a function'; all 32 pre-existing units.test.ts tests stayed GREEN)"
        status: fail
    human_judgment: true
    rationale: "Wave 0 RED scaffold — genuine GREEN proof deferred to 04-03's scaleQuantity implementation."
  - id: D4
    description: "backfill-plan-dates.test.js collected by vitest, RED only on the missing ./backfill-plan-dates.js import; covers the 'Week of ...' regex parse path (rounds back to that week's Monday) and the descending-Mondays-by-created fallback with id-asc tie-break"
    requirement: "WEEK-01"
    verification:
      - kind: unit
        ref: "npm run test -- scripts/backfill-plan-dates.test.js (confirmed: Cannot find module './backfill-plan-dates.js' — RED for the right reason)"
        status: fail
    human_judgment: true
    rationale: "Wave 0 RED scaffold — genuine GREEN proof deferred to 04-05's resolver implementation."

patterns-established:
  - "Wave 0 RED-scaffold verification discipline: before committing, run the actual npm run test invocation for each new/extended spec and read the failure to confirm it's an unimplemented-symbol/import error, not a parse/type error — captured in this plan's task-level commits"

# Metrics
duration: 9min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 1: Wave 0 Nyquist Test Scaffolds Summary

**Four RED test specs (history.ts LRU service, buildPullLists/buildProductFlowGraph peopleMultiplier threading, units.ts scaleQuantity, backfill-plan-dates.js resolver) locking Phase 4's AC#6/AC#7/AC#8/D-03/D-04/WEEK-01 contracts before any implementation code exists.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-07T18:49:07Z (Phase 04 execution start, per STATE.md)
- **Completed:** 2026-07-07T18:58:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 extended)

## Accomplishments
- `src/lib/planning/history.test.ts` — new file, 8 test cases covering AC#6 LRU tie-break (never-planned-first, ascending last-planned date, name-asc/id-asc deterministic ties across reversed input) and WEEK-03 `poolForSlot` match-any tag intersection
- `src/lib/aggregation/aggregation-multiplier.test.ts` — new file, 5 test cases covering the D-03 pull-list regression fix (existing `quantity:2` meals silently unscaled today), `peopleMultiplier` scaling (1.5x, compounding ×3) on `buildPullLists`, and AC#8 no-regression + doubling on `buildProductFlowGraph`
- `src/lib/units.test.ts` extended with a `scaleQuantity` describe block — 6 new test cases covering exact-continuous (mass/volume, fractional) vs ceil-discrete (`each`, literal `"discrete"` forceDiscrete arg, container float-drift) rounding, D-04
- `scripts/backfill-plan-dates.test.js` — new file, 5 test cases covering the "Week of ..." regex parse path (rounds back to that week's Monday, not forward) and the descending-Mondays-by-created fallback with id-asc tie-break, WEEK-01
- Every spec verified via an actual `npm run test` invocation before committing: all four fail for the correct reason (missing module / missing export / assertion on unimplemented behavior), zero syntax errors; the pre-existing 110 tests across 11 files stayed GREEN throughout

## Task Commits

Each task was committed atomically:

1. **Task 1: LRU + pool-resolution spec (RED)** - `e257cb3` (test)
2. **Task 2: Multiplier scaling + D-03 pull-list + D-04 rounding specs (RED)** - `a59d9c2` (test)
3. **Task 3: Backfill date resolver spec (RED)** - `dad1443` (test)

## Files Created/Modified
- `recipe-planner/src/lib/planning/history.test.ts` - AC#6 LRU/tie-break + WEEK-03 poolForSlot specs, imports from not-yet-existing `./history`
- `recipe-planner/src/lib/aggregation/aggregation-multiplier.test.ts` - D-03 pull-list fix + peopleMultiplier threading specs against the existing (unmodified) `buildPullLists`/`buildProductFlowGraph`
- `recipe-planner/src/lib/units.test.ts` - added `scaleQuantity` describe block (6 tests), existing 32 tests untouched
- `recipe-planner/scripts/backfill-plan-dates.test.js` - WEEK-01 `resolvePlanDate` pure-resolver spec, mirrors `scripts/seed-usda.test.js`'s no-live-DB convention

## Decisions Made
- `poolForSlot`/slot fixtures use inline `{ pool_tags: [...] }` objects cast `as any` rather than importing a `TemplateSlot` type from `types.ts` — that type doesn't exist yet (04-02's schema work); matches 04-RESEARCH.md's own Code Example convention of `as any` casts for fields the current schema doesn't type yet
- `resolvePlanDate(plan, index, baseMonday)` is the only exported symbol from the not-yet-written `backfill-plan-dates.js`; the descending-by-created/id-asc-tie-break sort itself is exercised inline in the test (a plain `.sort()` call), not a second exported function — keeps the module's public surface to exactly the name Task 3 specifies, leaving the live-order derivation to the script's `main()`
- `aggregation-multiplier.test.ts` duplicates `aggregation-lineid.test.ts`'s fixture helper functions (`makeProduct`/`makeProductNode`/`makeRecipeData`/`makePlannedMeal`/`makeStep`/`makeEdge`) rather than importing them, since that file doesn't export them — this matches the project's existing convention of self-contained test files (no shared fixtures module exists for `src/lib/aggregation/`)

## Deviations from Plan

None - plan executed exactly as written. All four specs authored strictly as test files; zero production code (`history.ts`, `scaleQuantity` export, `backfill-plan-dates.js`, `peopleMultiplier` params) was added, per the plan's explicit "Do NOT implement" instructions for each task.

## Issues Encountered

None. One design ambiguity worth noting for the downstream implementation plans: `04-RESEARCH.md` Assumption A1 flags that PocketBase `date` fields may serialize with a space separator (`"2026-07-06 00:00:00.000Z"`) rather than `T` — this plan's `history.test.ts` fixtures use bare `"2026-06-01"` ISO date strings (matching the RESEARCH Code Example) since `computeLastPlannedDates`/`orderPoolByLRU` only need lexicographic ordering, which is separator-agnostic; `backfill-plan-dates.test.js` fixtures use the space-separated `created` format from A1 directly since that field only feeds a comparison, not a display. Neither format assumption is load-bearing for these RED specs, but 04-04/04-05 should re-verify against a live record per A1's own recommendation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four Wave 0 gaps in `04-VALIDATION.md` are now closed with authored, correctly-RED specs; 04-VALIDATION.md's `wave_0_complete: false` frontmatter flag should be flipped by the next planning step
- 04-03 (peopleMultiplier threading + D-03 fix + scaleQuantity), 04-04 (history.ts LRU service), and 04-05 (backfill-plan-dates.js resolver) each have a concrete, unit-testable `<verify>` target to flip RED→GREEN against
- No blockers. `04-VALIDATION.md`'s "Wave 0 Requirements" checkboxes are all satisfiable by this plan's output; downstream plans should NOT need to touch these four test files except to add assertions if their own implementation surfaces edge cases these specs didn't anticipate

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 4 created/modified files verified present on disk; all 3 task commit hashes (e257cb3, a59d9c2, dad1443) verified present in git log.
