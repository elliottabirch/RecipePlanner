---
phase: 05-prep-day-engine
plan: 07
subsystem: testing
tags: [linter, vitest, typescript, scheduler, week-graph]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    provides: "recipe_steps metadata fields (active_minutes/passive_minutes/prep_action) from Plan 01/02, and the WeekGraph/StepInstance types + week-graph builder from Plan 05"
provides:
  - "3 linter v2 rule modules: missing-durations, missing-prep-action, missing-pull-step"
  - "runStepLint(steps) per-step aggregator and runWeekLint(weekGraph, consumedStoredInputs) week-scoped entry point"
affects: [06-publish-lifecycle, prep-day-cook-mode]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Phase-1 pure-rule-function shape (filter/flatMap or for..of -> LintFinding[], no classes) extended to a week-scoped rule shape"]

key-files:
  created:
    - recipe-planner/src/lib/linter/rules/missing-durations.ts
    - recipe-planner/src/lib/linter/rules/missing-prep-action.ts
    - recipe-planner/src/lib/linter/rules/missing-pull-step.ts
  modified:
    - recipe-planner/src/lib/linter/index.ts

key-decisions:
  - "missing-pull-step accepts a WeekGraph + flat StoredInputConsumption[] rather than a single recipe's step array, per D-07 — deliberately excluded from runLint's per-recipe signature"
  - "runStepLint is a new sibling aggregator (not a runLint signature change) so the existing v1 runLint(products) contract and its tests stay untouched"

patterns-established:
  - "Week-scoped linter rules get a dedicated runWeekLint entry point distinct from the per-recipe/per-step runLint/runStepLint aggregators"

requirements-completed: [PREP-06]

coverage:
  - id: D1
    description: "lintMissingDurations flags a step with both active_minutes and passive_minutes null, and does not flag when either is populated"
    requirement: "PREP-06"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/linter/linter.test.ts#missing-durations rule"
        status: pass
    human_judgment: false
  - id: D2
    description: "lintMissingPrepAction flags a prep-type step with null prep_action and ignores assembly steps"
    requirement: "PREP-06"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/linter/linter.test.ts#missing-prep-action rule"
        status: pass
    human_judgment: false
  - id: D3
    description: "lintMissingPullStep (week-scoped, D-07) flags a stored/inventory input with no producing pull/thaw/make step anywhere in the planned week, and does not flag when another recipe in the week produces it; reachable via both lintMissingPullStep and runWeekLint"
    requirement: "PREP-06"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/linter/linter.test.ts#missing-pull-step rule (week-scoped, D-07)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 07: Linter v2 (3 new rules) Summary

**Three PREP-06 linter v2 rules added — two per-step (missing durations, missing prep_action) and one week-scoped rule that reuses the week-graph's cross-recipe producer edges to catch the chicken-stock-style missing-pull-step case (D-07) — turning the Plan 02 RED linter test suite fully green.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10T02:41:00Z (approx)
- **Completed:** 2026-07-10T02:58:11Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `lintMissingDurations` flags any step with both `active_minutes` and `passive_minutes` null (per-step scope)
- `lintMissingPrepAction` flags a `prep`-type step with null `prep_action`, ignoring assembly steps entirely
- `lintMissingPullStep` flags a stored/inventory input consumed by an assembly step with no producing pull/thaw/make step anywhere in the planned week (week-graph-scoped per D-07) — a producer in a different recipe suppresses the finding
- `linter/index.ts` gained a `runStepLint(steps)` per-step aggregator and a separate `runWeekLint(weekGraph, consumedStoredInputs)` entry point, keeping the week-scoped rule out of the existing per-recipe `runLint` signature
- Full `linter.test.ts` suite green: 22/22 tests passing (was red on the 3 new rule blocks prior to this plan)
- `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: missing-durations + missing-prep-action per-step rules** - `6d4ced1` (feat)
2. **Task 2: week-scoped missing-pull-step rule** - `42b9928` (feat)
3. **Task 3: Register the 3 rules in the linter aggregator** - `8ba3fb9` (feat)

_No TDD-flagged tasks in this plan (plan type: execute, tasks type="auto") — the RED tests it turns green were written in an earlier plan (05-02)._

## Files Created/Modified
- `recipe-planner/src/lib/linter/rules/missing-durations.ts` - per-step rule: both durations null -> error finding
- `recipe-planner/src/lib/linter/rules/missing-prep-action.ts` - per-step rule: prep step with null prep_action -> error finding
- `recipe-planner/src/lib/linter/rules/missing-pull-step.ts` - week-scoped rule: `StoredInputConsumption[]` + `WeekGraph` -> error finding when no producer edge lands on the consumer
- `recipe-planner/src/lib/linter/index.ts` - added `runStepLint` (per-step aggregator) and `runWeekLint` (week-scoped entry point); imports the 3 new rule modules

## Decisions Made
- Followed the plan's explicit divergence instruction: `missing-pull-step` takes `(weekGraph, consumedStoredInputs)` instead of a flat step array, and is aggregated via a standalone `runWeekLint`, not folded into `runLint`.
- `runStepLint` added as a new sibling function rather than changing `runLint`'s existing signature, so the v1 linter contract (and its existing 15 passing tests) is untouched.
- Producer-lookup implementation: a `Set` of `WeekGraphEdge.to` ids built once, then each `StoredInputConsumption` is flagged iff its `consumerId` is absent from that set — matches both test cases (no edges -> flagged; a cross-recipe edge landing on the consumer -> not flagged) exactly as specified by D-07.

## Deviations from Plan

None - plan executed exactly as written. All three rule modules and the aggregator wiring match the plan's `<action>` and `<acceptance_criteria>` blocks precisely; no missing dependencies, no architectural surprises (the `WeekGraph`/`StepInstance` types and `RecipeStep` metadata fields already existed from earlier Phase 5 plans).

## Issues Encountered
None. The plan's per-task verify commands (`vitest run ... -t "missing-durations"` etc.) could not pass in isolation after Task 1 alone, because `linter.test.ts` imports `missing-pull-step` and `runWeekLint` at module scope — the whole test file fails to load until all three tasks are complete. This is an expected consequence of the RED test file spanning all three rules in one file (written in Plan 02); verified by running the full `linter.test.ts` suite (22/22 pass) and `tsc --noEmit` (clean) after Task 3.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The on-demand linter v2 surface (this phase) is complete; publish-gate wiring of these same rules is explicitly out of scope here and belongs to Phase 6.
- `runWeekLint` expects callers to supply `consumedStoredInputs: StoredInputConsumption[]` themselves (deriving stored/inventory input consumptions from a planned week's product graph) — no such caller exists yet in this plan; wiring the on-demand linter UI (Products.tsx-style dialog) to invoke `runStepLint`/`runWeekLint` against real data is left to a later UI-facing plan/phase, consistent with this plan's scope (rule modules + aggregator only).
- No blockers for downstream phases; `scheduler/genetic.test.ts` and `scheduler/retime.test.ts` currently fail on `Cannot find module` (pre-existing, out of this plan's `files_modified` scope — those modules belong to other Phase 5 plans not yet executed in this sequence).

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*

## Self-Check: PASSED
All created/modified files verified present on disk; all 3 task commit hashes (6d4ced1, 42b9928, 8ba3fb9) verified present in git log.
