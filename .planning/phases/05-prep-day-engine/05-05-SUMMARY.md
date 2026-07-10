---
phase: 05-prep-day-engine
plan: 05
subsystem: scheduler
tags: [typescript, dag, scheduler, week-graph, vitest]

requires:
  - phase: 05-prep-day-engine (Plan 02)
    provides: "week-graph.test.ts (RED), scheduler/types.ts (StepInstance/WeekGraph/WeekGraphEdge shapes)"
provides:
  - "buildWeekGraph(mealData) — per-instance DAG builder consumed by the GA scheduler (Plan 09) and the missing-pull-step linter (Plan 07)"
affects: [genetic.ts, missing-pull-step.ts]

tech-stack:
  added: []
  patterns:
    - "Per-instance step nodes keyed `${plannedMealId}::${step.id}` — never signature-merged"
    - "Cross-recipe edges matched by product id via RecipeProductNode.product (relation field), not by node id"

key-files:
  created:
    - recipe-planner/src/lib/scheduler/week-graph.ts
  modified: []

key-decisions:
  - "Intra-recipe precedence edges matched by product-node id (stepToProductEdges.target === productToStepEdges.source) within a single planned meal"
  - "Cross-recipe edges matched by product id (RecipeProductNode.product), scanning every OTHER planned meal's stepToProductEdges — restricted to consuming inputs whose expanded product.type is stored or inventory"
  - "Producer-absent inputs are left as graph sources (no edge) — surfacing that gap is the missing-pull-step linter's job (Plan 07), not this builder's"

requirements-completed: [PREP-03]

coverage:
  - id: D1
    description: "buildWeekGraph produces per-instance nodes, intra-recipe edges, and cross-recipe stored/inventory producer-consumer edges (fan-in AND-semantics), never routing through the signature-merge anti-pattern"
    requirement: "PREP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/scheduler/week-graph.test.ts (4 tests: cross-recipe edge, producer-absent source, fan-in AND, twice-planned = two instances)"
        status: pass
      - kind: other
        ref: "grep-based anti-pattern check: node -e check against createStepSignature|addOrMergeStep in week-graph.ts"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 05: Week-Graph Builder Summary

**`buildWeekGraph` turns `MealKeyedRecipeData` into a per-instance DAG with intra-recipe precedence edges and cross-recipe stored/inventory producer→consumer edges (AND-semantics fan-in), the exact DAG the GA scheduler (Plan 09) and missing-pull-step linter (Plan 07) consume.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-07-10T02:44:35Z
- **Tasks:** 1 completed
- **Files modified:** 1 created

## Accomplishments
- Implemented `buildWeekGraph(mealData: MealKeyedRecipeData): WeekGraph` in `recipe-planner/src/lib/scheduler/week-graph.ts`
- Per-instance `StepInstance` nodes keyed `${plannedMealId}::${step.id}` — two planned instances of the same recipe's step always yield two distinct nodes (verified by the "never merges" test)
- Intra-recipe precedence edges derived from `productToStepEdges`/`stepToProductEdges` node-id matching within a single planned meal
- Cross-recipe precedence edges: for every consuming input whose expanded product type is `stored`/`inventory`, fan in an edge from every producing output node (matched by product id) in every OTHER planned meal — AND-semantics per Assumption A4 (consumer waits on ALL matching producers)
- Producer-absent inputs are left as graph sources (no edge) — this is intentionally the missing-pull-step linter's concern (Plan 07), not a builder error
- Confirmed the module never references `createStepSignature`/`addOrMergeStep` (the documented signature-merge anti-pattern) via the plan's grep-based verification script

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement buildWeekGraph over MealKeyedRecipeData** - `4e87312` (feat)

_Note: single-task plan, no TDD gate (tests were pre-written RED in Plan 02)._

## Files Created/Modified
- `recipe-planner/src/lib/scheduler/week-graph.ts` - `buildWeekGraph` per-instance DAG builder; module-header JSDoc cites PREP-03 and the anti-pattern avoided

## Decisions Made
- Cross-recipe product matching uses `RecipeProductNode.product` (the relation-ID field, identical to `Product.id`) rather than digging through `expand.product.id` for the id comparison — only the type check (`stored`/`inventory`) needs the expanded product; this is a minor implementation choice within the plan's stated approach, not a deviation.

## Deviations from Plan

None - plan executed exactly as written. The one implementation nuance (matching cross-recipe products by the `RecipeProductNode.product` relation field rather than `expand.product.id`) is functionally identical and does not change the module's contract or the plan's `must_haves`.

## Issues Encountered

The plan's verification script does a blind text-match (`/createStepSignature|addOrMergeStep/`) against the whole file, including comments. My first draft's module-header comment named those two functions explicitly (to describe what to avoid) and tripped the check. Reworded the header to describe the anti-pattern without using the literal identifier strings — the check now passes and the module still cites `lib/aggregation/utils/step-utils.ts` by file path for anyone who wants to find the actual helpers.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`buildWeekGraph` is ready for Plan 07 (missing-pull-step linter, week-scoped per D-07) and Plan 09 (genetic.ts scheduler) to consume its `WeekGraph { nodes, edges }` output. No blockers.

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*

## Self-Check: PASSED
