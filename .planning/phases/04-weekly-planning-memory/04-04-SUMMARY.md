---
phase: 04-weekly-planning-memory
plan: 04
subsystem: planning
tags: [typescript, vitest, lru, pure-functions, rotation]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "04-01 authored the Wave-0 RED history.test.ts contract; 04-02 confirmed/added WeeklyPlan.start_date, PlannedMeal, TemplateSlot types"
provides:
  - "src/lib/planning/history.ts exporting computeLastPlannedDates, orderPoolByLRU, poolForSlot"
  - "Deterministic LRU ordering (AC#6) ready for WeekWizard consumption"
  - "Tag-pool match-any resolution (WEEK-03) ready for WeekWizard consumption"
affects: [04-06, 04-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure planning-history module: no PocketBase I/O inside src/lib/planning/*, callers pass already-fetched arrays/maps"
    - "ISO start_date strings compared lexicographically (no Date parsing) for chronological ordering"

key-files:
  created: [recipe-planner/src/lib/planning/history.ts]
  modified: []

key-decisions:
  - "Followed 04-RESEARCH.md Pattern 5/6 reference implementations verbatim (function shapes match exactly what history.test.ts imports)"
  - "poolForSlot typed as generic <T extends {id: string}> over Pick<TemplateSlot, 'pool_tags'> rather than a hard TemplateSlot dependency, so it also accepts the test's inline {pool_tags: [...]} object literals without a cast mismatch"

patterns-established:
  - "Planning-history LRU service: computeLastPlannedDates -> Map<recipeId, isoDateString>, consumed by orderPoolByLRU for deterministic never-planned-first ordering"

requirements-completed: []  # WEEK-03/WEEK-04 intentionally NOT marked complete here — they close when the wizard/UI ships (04-06/04-09) per plan notes

coverage:
  - id: D1
    description: "computeLastPlannedDates maps each recipe id to the max start_date of any dated plan containing it, ignoring undated plans"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/planning/history.test.ts#computeLastPlannedDates + orderPoolByLRU — AC#6 LRU tie-break (WEEK-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "orderPoolByLRU sorts never-planned recipes first, then ascending last-planned date, tie-broken by name asc then id asc — deterministic and order-independent"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/planning/history.test.ts#ties on an equal last-planned date break by name asc then id asc, deterministic across a reversed input array"
        status: pass
      - kind: unit
        ref: "recipe-planner/src/lib/planning/history.test.ts#two never-planned recipes tie-break by name asc then id asc"
        status: pass
    human_judgment: false
  - id: D3
    description: "poolForSlot returns recipes whose recipe_tags intersect the slot's pool_tags (match-any) — WEEK-03 pool eligibility"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/planning/history.test.ts#poolForSlot — WEEK-03 tag-pool resolution (match-any)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 4: Planning-History LRU + Pool-Resolution Module Summary

**Pure `src/lib/planning/history.ts` implementing last-planned-date computation, deterministic never-planned-first LRU ordering with name/id tie-break, and match-any tag-pool resolution — flips the Wave-0 `history.test.ts` GREEN with zero regressions.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-07T19:35:37Z
- **Completed:** 2026-07-07T19:41:22Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `computeLastPlannedDates(plans, plannedMeals)` — builds a `planDateById` map from plans with a `start_date`, then for each planned meal records the max (lexicographically greatest) date per recipe, skipping meals whose plan is undated.
- `orderPoolByLRU(recipes, lastPlanned)` — copy-then-sort: never-planned recipes sort first, then ascending last-planned date; equal dates (including both-never-planned) fall through to a deterministic `name.localeCompare` then `id.localeCompare` tie-break. Verified order-independent via a reversed-input-array test case (AC#6).
- `poolForSlot(slot, recipes, recipeTags)` — filters recipes whose tag-id list intersects `Set(slot.pool_tags)` via `Array.some` (match-any), typed against `Pick<TemplateSlot, "pool_tags">` so it works with both the real `TemplateSlot` type and the test's inline literals.
- All three functions are side-effect free, never mutate their inputs, and import only types from `../types` — no PocketBase import anywhere in the module (verified via grep and by the tests running with zero DB access).

## Task Commits

1. **Task 1: Pure LRU + pool-resolution module** - `636f76e` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/planning/history.ts` - New pure module: `computeLastPlannedDates`, `orderPoolByLRU`, `poolForSlot`

## Decisions Made
- Implemented exactly per 04-RESEARCH.md Pattern 5 (LRU service) and Pattern 6 (pool resolution) reference code — no deviation from the researched shape was needed since it was already written to match `history.test.ts`'s exact import contract.
- `poolForSlot`'s slot parameter is typed `Pick<TemplateSlot, "pool_tags">` rather than the full `TemplateSlot`, keeping the function's real dependency surface narrow and letting the test's `{ pool_tags: [...] } as any` fixtures satisfy the type trivially.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npm run test -- src/lib/planning/history.test.ts` passed all 6 cases on first implementation; `npm run build` passed cleanly; the full suite (`npm run test`) shows 126 passed / 0 regressions, with the single pre-existing failure being `scripts/backfill-plan-dates.test.js` (module `./backfill-plan-dates.js` does not exist yet) — this is the known Wave-0 RED scaffold owned by plan 04-05, explicitly called out as out-of-scope in this plan's notes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `history.ts` is ready for `WeekWizard.tsx` (04-09) to consume for pool ordering and staples pre-fill, and for any earlier plan needing pool-tag resolution.
- WEEK-03/WEEK-04 requirements deliberately left unchecked in this SUMMARY's `requirements-completed` — they complete only when the wizard/UI actually ships the guided-fill experience (04-06/04-09), per this plan's own scope note.
- No blockers for downstream plans; `scripts/backfill-plan-dates.test.js` remains a known RED scaffold for 04-05 to pick up.

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: recipe-planner/src/lib/planning/history.ts
- FOUND: 636f76e (Task 1 commit)
- FOUND: .planning/phases/04-weekly-planning-memory/04-04-SUMMARY.md
