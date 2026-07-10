---
phase: 05-prep-day-engine
plan: 02
subsystem: testing
tags: [prando, vitest, genetic-algorithm, scheduler, linter, determinism, wave-0-red]

# Dependency graph
requires:
  - phase: 05-01
    provides: "recipe_steps 7-field resource model, CookProgress/SchedulerConfig types, PocketBase schema additions"
provides:
  - "prando ^6.0.1 dependency for seeded, engine-independent GA determinism (D-01a.1)"
  - "scheduler/types.ts shared type vocabulary: StepInstance, WeekGraphEdge, WeekGraph, Schedule, ResourceTimeline"
  - "5 Wave-0 red test files encoding the full PREP-03/04/05/06 acceptance contract for later waves to turn green"
affects: [05-03, 05-04, 05-07]

# Tech tracking
tech-stack:
  added: ["prando ^6.0.1"]
  patterns:
    - "Per-instance StepInstance nodes (id = `${plannedMealId}::${step.id}`) — never signature-merged (Pitfall 3)"
    - "Wave-0 red-test-first acceptance contract: test files import not-yet-existing implementation modules so failure is a module-resolution error, not a logic bug"

key-files:
  created:
    - recipe-planner/src/lib/scheduler/types.ts
    - recipe-planner/src/lib/scheduler/week-graph.test.ts
    - recipe-planner/src/lib/scheduler/resources.test.ts
    - recipe-planner/src/lib/scheduler/genetic.test.ts
    - recipe-planner/src/lib/scheduler/retime.test.ts
  modified:
    - recipe-planner/package.json
    - recipe-planner/package-lock.json
    - recipe-planner/src/lib/linter/linter.test.ts

key-decisions:
  - "isFeasibleAt/resources.test.ts contract uses RecipeStep's actual field names (active_minutes, passive_minutes, resource, oven_temp_f, rack_slots) directly, matching Pattern 4's decode usage, rather than RESEARCH Pattern 2's simplified snippet field names (active/passive/ovenTempF/rackSlots) — avoids an unnecessary translation layer between StepInstance.step and the feasibility check."
  - "missing-pull-step's rule signature takes (weekGraph: WeekGraph, consumedStoredInputs: StoredInputConsumption[]) — the WeekGraph's existing edges (producer->consumer) are reused as-is per D-07, and a small consumedStoredInputs list supplies the product-type info (stored/inventory vs raw) that WeekGraphEdge alone can't distinguish, since not every precedence edge implies a required pull step."
  - "runWeekLint is a separate aggregator entry point from the per-recipe runLint (per Pattern Map's explicit call-out that missing-pull-step's input shape diverges from the Phase-1 per-product/step precedent)."

patterns-established:
  - "Wave-0 RED test files reference the exact function/type names the implementation wave must export (scheduleWeek, computeActiveSessionSpan, isFeasibleAt, buildWeekGraph, retimeSchedule, lintMissingDurations, lintMissingPrepAction, lintMissingPullStep, runWeekLint) — these names are now the locked contract for Plans 03/04/07."

requirements-completed: []  # This Wave-0 plan lays the RED test contract only — PREP-03/04/06 are
  # NOT functionally complete (scheduler/cook-mode/linter-v2 implementations don't exist yet;
  # all 5 test files fail on module-not-found by design). Do NOT mark these requirements complete
  # from this plan — see the prior revert of this exact mistake for 05-01 (commit 4585789).
  # They will be marked complete by whichever later plan (03/04/07) actually implements and
  # greens each corresponding module.

coverage:
  - id: D1
    description: "prando ^6.0.1 installed and importable; scheduler/types.ts exports StepInstance, WeekGraphEdge, WeekGraph, Schedule, ResourceTimeline, and re-exports SchedulerConfig"
    requirement: "PREP-03"
    verification:
      - kind: unit
        ref: "node -e \"require('prando')\" && npx tsc -b (clean except later-wave module errors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "5 Wave-0 red test files (week-graph, resources, genetic, retime, extended linter.test.ts) exist and fail red because the implementation modules don't exist yet — the intended Nyquist acceptance contract for PREP-03/04/05/06"
    requirement: "PREP-03"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx vitest run src/lib/scheduler src/lib/linter/linter.test.ts (5 files fail on module-not-found, as designed)"
        status: pass
    human_judgment: false

duration: ~8min (this session; continuation of a prior session that completed Task 1's file content but was blocked on commit signing)
completed: 2026-07-09
status: complete
---

# Phase 5 Plan 2: Scheduler Wave-0 Backbone Summary

**Installed `prando` for seeded GA determinism, defined the scheduler's shared type vocabulary, and authored 5 Wave-0 red test files encoding the full determinism/resource/week-graph/retime/linter-v2 acceptance contract for later waves.**

## Performance

- **Duration:** ~8 min (this continuation session)
- **Completed:** 2026-07-09
- **Tasks:** 3/3 completed
- **Files modified:** 8 (3 created new by Task 1, 4 created new by Task 2, 1 modified by Task 3 plus minor type-annotation touch-ups to 3 of Task 2's files)

## Accomplishments
- `prando ^6.0.1` installed and importable; verified via `node -e "require('prando')"`.
- `scheduler/types.ts` defines the full shared vocabulary (`StepInstance`, `WeekGraphEdge`, `WeekGraph`, `Schedule`, `ResourceTimeline`) with a module header citing D-03/D-04/D-05/D-06, and re-exports `SchedulerConfig` from `lib/types.ts` rather than redefining it.
- 4 new scheduler test files (`week-graph.test.ts`, `resources.test.ts`, `genetic.test.ts`, `retime.test.ts`) encode concrete, executable assertions for: cross-recipe producer/consumer edges + producer-absent source nodes + fan-in AND-semantics + never-merge-same-recipe-instances (Pitfall 3); the implicit single-cook active-only resource + oven temp-conflict rule (Pitfall 2) + rack_slots/burner_count/singleton-appliance capacities; GA determinism + no-precedence/resource-violation invariant + the D-06 active-session-span primary objective (Pitfall 1) + weight-vector sensitivity (PREP-05); and order-preserving check-off recompute (D-01a.3).
- `linter.test.ts` extended with 3 new rule-contract describe blocks: `missing-durations`, `missing-prep-action`, and the week-scoped `missing-pull-step` (D-07 cross-recipe reuse of week-graph producer→consumer edges), plus a new `runWeekLint` aggregator entry point contract.
- All 5 Wave-0 test files fail RED as intended — each fails on `Cannot find module`/`has no exported member` because the implementation modules (`week-graph.ts`, `resources.ts`, `genetic.ts`, `retime.ts`, `linter/rules/missing-durations.ts`, `linter/rules/missing-prep-action.ts`, `linter/rules/missing-pull-step.ts`, and `runWeekLint`) intentionally do not exist yet.
- Confirmed the rest of the test suite (15 other files, 124 tests) is unaffected — `npm test` still passes everything except the 5 intentional new red files.
- `npx tsc -b --force` reports only the expected "module not found"/"no exported member" errors for the not-yet-existing implementation surface — no incidental implicit-any or type-quality noise from the new test files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install prando and define scheduler/types.ts** - `42c9a1a` (feat)
2. **Task 2: Wave-0 red tests for week-graph, resources, genetic, retime** - `6b6ccd8` (test)
3. **Task 3: Wave-0 red tests for the 3 linter v2 rules** - `6d0f1e0` (test; also includes minor type-annotation fixes to Task 2's files, see Deviations)

_Note: this plan was executed across two sessions — a prior executor completed Task 1's file content but hit a commit-signing blocker; this session verified that staged content against the acceptance criteria, committed it unchanged, then executed Tasks 2-3 and this SUMMARY._

## Files Created/Modified
- `recipe-planner/package.json`, `recipe-planner/package-lock.json` - added `prando ^6.0.1`
- `recipe-planner/src/lib/scheduler/types.ts` - `StepInstance`, `WeekGraphEdge`, `WeekGraph`, `Schedule`, `ResourceTimeline`, re-exported `SchedulerConfig`
- `recipe-planner/src/lib/scheduler/week-graph.test.ts` - red tests for `buildWeekGraph` (cross-recipe edges, producer-absent, fan-in AND-semantics, never-merge)
- `recipe-planner/src/lib/scheduler/resources.test.ts` - red tests for `isFeasibleAt` (cook exclusivity, oven temp-conflict + rack_slots, burner_count, singleton appliances)
- `recipe-planner/src/lib/scheduler/genetic.test.ts` - red tests for `scheduleWeek`/`computeActiveSessionSpan` (determinism, no-violations, D-06 active-session-span, weight sensitivity)
- `recipe-planner/src/lib/scheduler/retime.test.ts` - red test for `retimeSchedule` (order-preserving recompute, D-01a.3)
- `recipe-planner/src/lib/linter/linter.test.ts` - extended with `missing-durations`, `missing-prep-action`, `missing-pull-step` (week-scoped) red cases

## Decisions Made
- `resources.test.ts`'s `isFeasibleAt` contract uses `RecipeStep`'s real field names (`active_minutes`, `passive_minutes`, `resource`, `oven_temp_f`, `rack_slots`) rather than RESEARCH Pattern 2's simplified snippet names — this matches how Pattern 4's SSGS decode actually reads `instance.step.active_minutes` directly, avoiding an unnecessary translation layer for the implementer.
- `missing-pull-step`'s signature is `(weekGraph: WeekGraph, consumedStoredInputs: StoredInputConsumption[])`. The `WeekGraph`'s existing precedence edges are reused as-is (D-07's "reuse the week-graph builder's cross-recipe producer→consumer edges"), and the small `consumedStoredInputs` list carries the product-type info a plain edge can't express (not every precedence edge implies a required stored/inventory pull step — raw-ingredient precedence edges exist too).
- `runWeekLint` is introduced as a distinct aggregator from the per-product `runLint`, per the Pattern Map's explicit note that `missing-pull-step`'s week-scoped input shape diverges from Phase 1's per-recipe precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Implicit-any noise from Wave-0 red test call sites**
- **Found during:** Task 3 (running `npx tsc -b --force` to confirm the red state is limited to the intended unresolved-module errors)
- **Issue:** Because `buildWeekGraph`/`scheduleWeek`/`retimeSchedule`/`lintMissingDurations`/etc. don't exist yet, TypeScript infers their return values as `any`; strict mode (`noImplicitAny`) then flagged every downstream `.map`/`.filter` callback parameter as implicitly-`any` (TS7006) — noise unrelated to the actual RED contract these tests are meant to encode.
- **Fix:** Added explicit local type annotations (`const graph: WeekGraph = buildWeekGraph(...)`, `const schedule: Schedule = ...`, etc.) in `week-graph.test.ts`, `genetic.test.ts`, and `retime.test.ts`, and an explicit `LintFinding` parameter type on every `.filter((f: LintFinding) => ...)` callback in `linter.test.ts` (applied file-wide for consistency, including the pre-existing Phase-1 blocks).
- **Files modified:** `recipe-planner/src/lib/scheduler/week-graph.test.ts`, `recipe-planner/src/lib/scheduler/genetic.test.ts`, `recipe-planner/src/lib/scheduler/retime.test.ts`, `recipe-planner/src/lib/linter/linter.test.ts`
- **Verification:** `npx tsc -b --force` now reports only the 8 expected "Cannot find module"/"has no exported member" errors (one per not-yet-existing implementation symbol), zero implicit-any noise.
- **Committed in:** `6d0f1e0` (bundled into the Task 3 commit since the fix touched files across both tasks)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type-quality cleanup, no scope creep)
**Impact on plan:** Purely a type-annotation tightening so the RED state is unambiguous (module-resolution failures only); no test assertions or contracts changed.

## Issues Encountered
A prior executor session completed Task 1's file writes but could not commit due to a commit-signing (`commit.gpgsign`) blocker in this environment. That blocker was resolved before this session started (`git config commit.gpgsign` confirmed `false`); this session verified the staged Task 1 content against the plan's acceptance criteria (prando in `package.json`, all 5 types exported, `npx tsc --noEmit`/`node -e "require('prando')"` both passing) before committing it unchanged.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
The Wave-0 acceptance contract is fully in place: Plan 03 (week-graph + resources), Plan 04 (genetic + retime), and Plan 07 (linter v2 rules) each have a concrete, failing test suite that names the exact functions/types they must implement and export. `05-VALIDATION.md`'s Wave 0 checklist items are now all authored (still marked pending/red by design — they turn green in the implementation waves, not this one). No blockers for the next plan.

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-09*

## Self-Check: PASSED

All 7 claimed files verified present on disk; all 3 task commit hashes (`42c9a1a`, `6b6ccd8`, `6d0f1e0`) verified present in git log.
