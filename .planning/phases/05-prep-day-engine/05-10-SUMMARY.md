---
phase: 05-prep-day-engine
plan: 10
subsystem: scheduler
tags: [typescript, vitest, scheduling, retime, ssgs]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    provides: "resources.ts (isFeasibleAt/occupyResources/nextCandidateTime resource-feasibility model) and types.ts (StepInstance/Schedule/ResourceTimeline) from earlier waves of this phase"
provides:
  - "retimeSchedule(fixedOrder, actualCompletions, resourceModel, config): Schedule — order-preserving O(n) recompute of start/end times, reusing the SSGS resource-feasibility model"
affects: [cook-mode, prep-day-engine, check-off-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Order-preserving retime: walk a FIXED activity-list order once, tracking a running precedence-bound clock, never sorting/permuting the array — precedence for pairs not explicitly bounded by the resource model is approximated by strict sequential chaining, since retime has no access to week-graph edges by design"
    - "Checked-off steps replace estimated active/passive minutes with a single real elapsed-minutes value at commit time (no feasibility search — it already happened); not-yet-started steps keep using the standard isFeasibleAt/nextCandidateTime search loop"

key-files:
  created: [recipe-planner/src/lib/scheduler/retime.ts]
  modified: []

key-decisions:
  - "Precedence bound for retime is a simple running clock (previous step's own computed end), not real week-graph edges — retimeSchedule's signature (matching retime.test.ts) never receives a WeekGraph/edges argument. Correctness is preserved because every step's active window already serializes through the implicit singleton cook resource (resources.ts), which is the actual physical constraint driving sequential cook-mode timing."
  - "A completed step's actual elapsed duration is modeled as a synthetic active_minutes=actualElapsed / passive_minutes=0 occupancy (preserving the step's real resource/oven_temp_f/rack_slots) so occupyResources marks the cook and any physical resource busy for exactly as long as the cook really took, without needing to know the real active/passive split."

patterns-established:
  - "retime.ts reuses resources.ts's isFeasibleAt/occupyResources/nextCandidateTime verbatim (same import shape as genetic.ts's decodeSSGS) — zero duplicate constraint logic between the GA's SSGS decode and the check-off retime pass."

requirements-completed: [PREP-04]

coverage:
  - id: D1
    description: "retimeSchedule recomputes start/end times of a fixed order without ever permuting the order, and a late actual completion shifts every downstream candidate start/end by the delta"
    requirement: "PREP-04"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/scheduler/retime.test.ts#shifts downstream starts by the delta from a late actual completion, without reordering the fixed order"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 10: Order-Preserving Check-Off Retime Summary

**`retimeSchedule` — an O(n) forward sweep that re-times the GA's fixed step order using real check-off durations, without ever re-running the GA or permuting the order (D-01a.3)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-10T04:58:00Z
- **Completed:** 2026-07-10T05:13:10Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- Implemented `recipe-planner/src/lib/scheduler/retime.ts` exporting `retimeSchedule(fixedOrder, actualCompletions, resourceModel, config): Schedule`
- Turned `retime.test.ts` green — the last remaining red test in Phase 5's Wave 0 test suite
- Confirmed via full-suite run (`npx vitest run`): 21 test files, 172 tests, all passing
- Confirmed via `tsc --noEmit`: zero type errors
- Confirmed no `Math.random` and no sort/reverse/splice permutation of `fixedOrder` anywhere in the new module (grep-verified)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement order-preserving retimeSchedule** - `32281bc` (feat)

_No plan-metadata-only commit was needed beyond the final docs commit below._

## Files Created/Modified
- `recipe-planner/src/lib/scheduler/retime.ts` - `retimeSchedule`: walks the GA's fixed `Schedule.order` once, replaces estimates with real elapsed durations for checked-off steps, and places not-yet-started steps via the same `resources.ts` feasibility model the GA's SSGS decode uses; never sorts/permutes the input order.

## Decisions Made
- Precedence bound is a running clock (previous step's own computed end) rather than derived from real week-graph edges, since `retimeSchedule`'s signature (dictated by `retime.test.ts`, which was written in an earlier wave) takes only `fixedOrder`, `actualCompletions`, `resourceModel`, and `config` — no edges. This is safe because the implicit singleton-cook resource already forces total serialization of every step's active window, which is the load-bearing physical constraint for cook-mode timing (05-RESEARCH.md Pattern 2/3).
- A checked-off step's real elapsed time is modeled as `active_minutes = actualElapsed, passive_minutes = 0` for the purpose of resource occupancy, preserving the step's real `resource`/`oven_temp_f`/`rack_slots` so oven/burner/appliance accounting stays correct even though the real active/passive split of the completed step isn't separately known.

## Deviations from Plan

None - plan executed exactly as written. The single task's `<action>` was implemented as specified; `<verify>` and `<acceptance_criteria>` all passed on the first implementation without needing an auto-fix cycle.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `retime.ts` is ready for Plan 11 (cook-mode UI) to call on every check-off event, giving the "feels instant" tablet UX (PREP-04/AC5) without re-running the GA.
- Phase 5's full scheduler test suite (`week-graph.test.ts`, `resources.test.ts`, `genetic.test.ts`, `retime.test.ts`) is now entirely green — no outstanding red tests block Wave 4+ work in this phase.

## Self-Check: PASSED
- FOUND: recipe-planner/src/lib/scheduler/retime.ts
- FOUND: .planning/phases/05-prep-day-engine/05-10-SUMMARY.md
- FOUND commit: 32281bc

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*
