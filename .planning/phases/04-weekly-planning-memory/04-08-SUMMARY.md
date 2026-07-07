---
phase: 04-weekly-planning-memory
plan: 08
subsystem: weekly-plans-ui
tags: [react, typescript, mui, dates, vitest]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "04-02 added WeeklyPlan.start_date/people_multiplier fields on both PocketBase instances and mirrored types.ts"
provides:
  - "src/lib/planning/dates.ts exporting getUpcomingMonday, formatWeekOf — reusable by the wizard (04-09)"
  - "New Plan dialog collects + persists start_date and people_multiplier"
  - "Plan list and header display the formatted week date"
affects: [04-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure date helpers with no external date library — native <input type=\"date\"> + one-line Monday math (04-RESEARCH A2)"
    - "PocketBase date-string normalization (space vs T separator) centralized in formatWeekOf, not repeated at call sites"

key-files:
  created:
    - recipe-planner/src/lib/planning/dates.ts
    - recipe-planner/src/lib/planning/dates.test.ts
  modified:
    - recipe-planner/src/pages/WeeklyPlans.tsx

key-decisions:
  - "people_multiplier <= 0 is clamped to 0.1 (not silently reset to 1) at save time — mirrors the PocketBase field's own Min 0.1 constraint (Security V5 / T-04-08a), applied as a final defense-in-depth guard independent of the inputProps min hint"
  - "formatWeekOf renders the date in UTC to avoid a local-timezone off-by-one-day shift on a date-only value stored at UTC midnight"

requirements-completed: [WEEK-02]  # WEEK-01's "existing plans backfilled" clause is 04-05's scope (still RED); this plan only closes the new-plan/edit-plan/display half of WEEK-01, so REQUIREMENTS.md's WEEK-01 checkbox is intentionally left unchecked until 04-05 lands the backfill

coverage:
  - id: D1
    description: "getUpcomingMonday(from?) returns the ISO YYYY-MM-DD of the next Monday on/after `from` (or today), including the from-is-already-Monday case"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/planning/dates.test.ts#getUpcomingMonday — Monday/Wednesday/Sunday cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "formatWeekOf tolerates both space- and T-separated PocketBase date strings, and returns \"\" for null/undefined/empty/malformed input"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/planning/dates.test.ts#formatWeekOf — separator + guard cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "New Plan dialog collects start_date (default upcoming Monday) and people_multiplier (default 1, step 0.5, min 0.1) and persists both on create/update"
    verification:
      - kind: build
        ref: "npm run build (tsc + vite build) passes with the dialog fields and payload wired"
      - kind: manual
        ref: "04-08 Task 3 checkpoint how-to-verify — deferred to user, see Deviations/Checkpoint Deferred below"
        status: pending
    human_judgment: true
  - id: D4
    description: "people_multiplier <= 0 is rejected/clamped client-side before persisting (Security V5)"
    verification:
      - kind: code-review
        ref: "handleSavePlan clamps rawMultiplier <= 0 (or non-finite) to MIN_PEOPLE_MULTIPLIER (0.1) before building the create/update payload"
        status: pass
      - kind: manual
        ref: "04-08 Task 3 checkpoint how-to-verify — deferred to user"
        status: pending
    human_judgment: true
  - id: D5
    description: "Plan list secondary line and plan header show the formatted 'Week of {Mon D, YYYY}' date when start_date is set"
    verification:
      - kind: build
        ref: "npm run build passes; formatWeekOf(plan.start_date) wired into ListItemText secondary and a new Typography line under the plan header"
      - kind: manual
        ref: "04-08 Task 3 checkpoint how-to-verify — deferred to user"
        status: pending
    human_judgment: true

# Metrics
duration: 12min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 8: New Plan Dialog Date + Multiplier Controls Summary

**Native Monday date-picker + people-multiplier field added to the New Plan dialog with client-side clamping, backed by a new pure `dates.ts` helper; plan list and header now show the derived "Week of ..." text.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 automated + 1 checkpoint (auto-approved per AUTO_MODE, live UAT deferred)
- **Files modified:** 3

## Accomplishments
- `src/lib/planning/dates.ts` — `getUpcomingMonday(from?)` (pure Monday-math one-liner, no date library) and `formatWeekOf(startDate)` (normalizes PocketBase's space/T date separator, guards empty/malformed input, renders "Week of Jul 6, 2026" style text in UTC to avoid a timezone day-shift).
- `src/lib/planning/dates.test.ts` — 7 unit tests covering both functions (Monday/mid-week/Sunday inputs; space-separated, T-separated, null/undefined/empty, and malformed date strings). All pass.
- `WeeklyPlans.tsx` New/Edit Plan dialog gains a `TextField type="date"` ("Week starting (Monday)", defaulting to `getUpcomingMonday()`) and a `TextField type="number"` ("People multiplier", default 1, `step 0.5 min 0.1`, UI-SPEC helper text). Both are seeded from the plan being edited (or defaults for a new plan) in `handleOpenPlanDialog`, and persisted via the create/update payload in `handleSavePlan`.
- `handleSavePlan` clamps `people_multiplier <= 0` (or non-finite input) to `MIN_PEOPLE_MULTIPLIER = 0.1` before the payload is built — defense in depth alongside the PocketBase field's own Min 0.1 constraint (T-04-08a).
- Plan list `ListItemText` now renders `formatWeekOf(plan.start_date)` as its secondary line (omitted entirely when unset, via `|| undefined`). The plan header gains a `Typography variant="body2" color="text.secondary"` line beneath the plan name showing the same formatted date, conditionally rendered only when non-empty.
- The "Fill Week" wizard-launch button was intentionally **not** added — reserved for 04-09 per the plan's explicit scope note, avoiding a merge conflict in the same file.

## Task Commits

1. **Task 1: dates helper (upcoming Monday + format)** - `58192ce` (feat)
2. **Task 2: New Plan dialog fields + list/header date display** - `6379ce8` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/planning/dates.ts` - New pure module: `getUpcomingMonday`, `formatWeekOf`
- `recipe-planner/src/lib/planning/dates.test.ts` - New unit tests (7 cases, all passing)
- `recipe-planner/src/pages/WeeklyPlans.tsx` - Dialog state/fields, `handleOpenPlanDialog`/`handleSavePlan` wiring, list/header date display

## Decisions Made
- Clamp (not silently reset-to-1) `people_multiplier <= 0` to `0.1` — keeps the persisted value inside the field's valid range without discarding a near-zero user intent entirely, and matches the PocketBase-side Min 0.1 constraint exactly.
- `formatWeekOf` uses `timeZone: "UTC"` in `toLocaleDateString` — the stored `start_date` is a date-only value serialized at UTC midnight; formatting in local time in a negative-UTC-offset timezone would otherwise display the previous calendar day.
- Reused MUI 7's `slotProps={{ inputLabel: { shrink: true } }}` idiom (already established elsewhere in this codebase, `QuickCreateProductDialog.tsx`) rather than the deprecated `InputLabelProps` for the date field's always-shrunk label.

## Deviations from Plan

None - plan executed exactly as written.

## Checkpoint Deferred (Task 3 — human-verify)

Task 3 is a `checkpoint:human-verify` gate. Per this run's AUTO_MODE directive, it was **auto-approved** for the purpose of completing the plan and advancing state — implementation is complete, `npm run build` passes, and the full automated test suite shows zero regressions. **Live visual/interaction UAT (exercising the actual New Plan dialog in the browser, confirming the default Monday date, multiplier persistence + guard, formatted date in list/header, and existing backfilled plans) is deferred to the user** and was not performed by this executor. If issues surface during that manual pass, they should be filed as a follow-up fix against this plan's files.

## Issues Encountered

`npm run test` (full suite) shows 133 passed / 1 pre-existing failure: `scripts/backfill-plan-dates.test.js` cannot find `./backfill-plan-dates.js` — this is the known Wave-0 RED scaffold owned by plan 04-05, explicitly called out as expected/out-of-scope in this plan's notes. No new regressions introduced by this plan's changes.

## User Setup Required

None - no external service configuration required. Live UAT of the New Plan dialog (see Checkpoint Deferred above) is recommended before relying on this feature in the store/kitchen workflow.

## Next Phase Readiness
- `dates.ts` (`getUpcomingMonday`, `formatWeekOf`) is ready for `WeekWizard.tsx` (04-09) to reuse directly.
- The New Plan dialog and plan list/header now carry `start_date`/`people_multiplier` end-to-end for the manual-plan path; 04-09's wizard will write `planned_meals` against plans that already have these fields populated.
- No blockers for downstream plans; the backfill scaffold RED state remains 04-05's to resolve.
- `REQUIREMENTS.md`'s WEEK-01 checkbox is intentionally left unchecked by this plan: WEEK-01 reads "Weekly plans have a start date (existing plans backfilled)" and this plan only delivers the collection/display half (new + edited plans); the "existing plans backfilled" half is 04-05's scope and hasn't run yet. WEEK-02 was already checked off in 04-03.

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: recipe-planner/src/lib/planning/dates.ts
- FOUND: recipe-planner/src/lib/planning/dates.test.ts
- FOUND: recipe-planner/src/pages/WeeklyPlans.tsx
- FOUND: 58192ce (Task 1 commit)
- FOUND: 6379ce8 (Task 2 commit)
- FOUND: .planning/phases/04-weekly-planning-memory/04-08-SUMMARY.md
