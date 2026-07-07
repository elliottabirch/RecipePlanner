---
phase: 04-weekly-planning-memory
plan: 03
subsystem: aggregation
tags: [typescript, vitest, aggregation, units, people-multiplier]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "04-01 Wave-0 RED test scaffolds (aggregation-multiplier.test.ts, units.test.ts scaleQuantity block); 04-02 weekly_plans.people_multiplier schema field"
provides:
  - "scaleQuantity(qty, factor, unitOrForceDiscrete) shared D-04 rounding helper in units.ts"
  - "peopleMultiplier threaded through buildProductFlowGraph, processRecipeProducts, processRecipeSteps"
  - "buildPullLists honors quantity x multiplier (D-03 fix), including a regression fix for existing quantity>1 meals"
  - "REQUIREMENTS.md and phase-doc reconciled to reflect pull lists now scaling with the multiplier"
affects: [04-07 (Outputs.tsx threading of the live people_multiplier value into these call sites)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scaleQuantity(qty, factor, unitOrForceDiscrete): continuous mass/volume dimensions stay exact fractional; each-dimension and the literal 'discrete' marker Math.ceil — single shared helper instead of scattered Math.ceil calls"
    - "Single local mealCount derivation per aggregation builder file, multiplier threaded in via a new optional peopleMultiplier=1 parameter at each of the three true derivation sites (aggregation.ts, product-builder.ts, step-builder.ts) — flow-builder.ts remains a pure consumer of the already-multiplied mealCount, never re-applies the multiplier"

key-files:
  created: []
  modified:
    - recipe-planner/src/lib/units.ts
    - recipe-planner/src/lib/aggregation.ts
    - recipe-planner/src/lib/aggregation/builders/product-builder.ts
    - recipe-planner/src/lib/aggregation/builders/step-builder.ts
    - recipe-planner/src/lib/aggregation/builders/flow-builder.ts
    - .planning/REQUIREMENTS.md
    - .planning/phase-docs/phase-4-week-memory.md

key-decisions:
  - "scaleQuantity's third argument accepts either a Unit or the literal 'discrete' marker, matching 04-RESEARCH Pattern 3 exactly — reused getDimension as the classifier rather than adding new classification logic"
  - "D-03 buildPullLists fix bundles a feature (multiplier support) with a latent correctness fix (existing quantity>1 meals were previously unscaled) — covered by a dedicated regression test separate from the multiplier=1 no-op case, per 04-RESEARCH Pitfall 5"
  - "calculateProductQuantity left unchanged/unused in product-utils.ts rather than deleted — its one call site in product-builder.ts now calls scaleQuantity directly; out of this plan's stated file-touch scope to remove it"

patterns-established:
  - "Any new fractional-quantity scaling logic in the aggregation layer must go through scaleQuantity(), never a bare Math.ceil/qty*factor, to keep the discrete/continuous rounding rule centralized"

requirements-completed: [WEEK-02]

coverage:
  - id: D1
    description: "scaleQuantity helper: continuous mass/volume exact, each-dimension/discrete marker ceils"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/units.test.ts#units.ts — scaleQuantity (D-04 discrete/continuous rounding)"
        status: pass
    human_judgment: false
  - id: D2
    description: "peopleMultiplier threads to buildProductFlowGraph/processRecipeProducts/processRecipeSteps; multiplier=1 reproduces byte-identical continuous output (AC#8); each-dimension products ceil on a fractional multiplier"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/aggregation-multiplier.test.ts#buildProductFlowGraph — WEEK-02/AC#8 peopleMultiplier threading"
        status: pass
      - kind: unit
        ref: "npm run test -- src/lib/aggregation (27/27 passing, includes product-builder.test.ts, step-builder.test.ts, aggregation-lineid.test.ts no-regression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildPullLists D-03 fix: scales by quantity x peopleMultiplier, including the quantity>1 doubling regression and x1.5/x3 compounding cases"
    requirement: "WEEK-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/aggregation-multiplier.test.ts#buildPullLists — D-03 quantity x peopleMultiplier scaling"
        status: pass
    human_judgment: false
  - id: D4
    description: "REQUIREMENTS.md and phase-doc reconciled: PULL-F1 folded into WEEK-02, AC#7/§4 item 5/§7 Open Question no longer exclude pull lists"
    verification:
      - kind: other
        ref: "grep -n PULL-F1 .planning/REQUIREMENTS.md (no match); grep -n 'deliberate exclusion' .planning/phase-docs/phase-4-week-memory.md (no match outside reconciled prose)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 03: People-multiplier scaling math + D-03 pull-list fix Summary

**Added a shared scaleQuantity(qty, factor, unit|"discrete") rounding helper (exact for mass/volume, ceil for discrete counts), threaded a peopleMultiplier parameter into all three true mealCount derivation sites in the aggregation layer, and fixed buildPullLists to honor quantity × multiplier — flipping the Wave-0 RED specs GREEN with zero regressions in the pre-existing 120-test suite.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-07T19:28:26Z (prior session end)
- **Completed:** 2026-07-07T19:34:09Z
- **Tasks:** 3 completed
- **Files modified:** 7 (5 source, 2 docs)

## Accomplishments
- `scaleQuantity()` exported from `units.ts`: continuous mass/volume dimensions stay exact fractional; `each`-dimension counts and the literal `"discrete"` marker deliberately `Math.ceil` — replaces reliance on incidental float-loop truncation (the documented `2.0000000002` drift risk)
- `peopleMultiplier: number = 1` threaded into `buildProductFlowGraph`, `processRecipeProducts`, and `processRecipeSteps` — each file's single local `mealCount` derivation now multiplies it in; `flow-builder.ts` stays a pure consumer (applies only the ceil via `scaleQuantity('discrete')`, never re-references the multiplier — no double-count)
- `buildPullLists` fixed per D-03: now scales `node.quantity × (meal.quantity || 1) × peopleMultiplier` via `scaleQuantity`, fixing a latent bug where `quantity > 1` meals were previously emitted completely unscaled
- `REQUIREMENTS.md` and `phase-docs/phase-4-week-memory.md` reconciled: `PULL-F1` folded into `WEEK-02`, AC#7/item 5/Open-Question pull-list exclusions reversed to reflect D-03

## Task Commits

Each task was committed atomically:

1. **Task 1: scaleQuantity helper (D-04)** - `eab8863` (feat)
2. **Task 2: Thread peopleMultiplier + apply scaleQuantity at the enumerated sites** - `c23eac4` (feat)
3. **Task 3: buildPullLists D-03 fix + doc reconciliation** - `461919f` (feat)

_All three tasks were `tdd="true"` against pre-existing Wave-0 RED scaffolds (`aggregation-multiplier.test.ts`, the `units.test.ts` scaleQuantity block) — no separate RED commit was needed since the failing specs were already authored and committed in 04-01; each task's commit is the GREEN flip._

## Files Created/Modified
- `recipe-planner/src/lib/units.ts` - adds and exports `scaleQuantity()`
- `recipe-planner/src/lib/aggregation.ts` - `buildProductFlowGraph`/`buildPullLists` gain `peopleMultiplier` param; `buildPullLists` item push now uses `scaleQuantity`
- `recipe-planner/src/lib/aggregation/builders/product-builder.ts` - `processRecipeProducts` gains `peopleMultiplier`; `buildAggregatedProduct` uses `scaleQuantity` for both product totals and instance counts
- `recipe-planner/src/lib/aggregation/builders/step-builder.ts` - `processRecipeSteps` gains `peopleMultiplier`; `extractStepInputs`/`extractStepOutputs` use `scaleQuantity`
- `recipe-planner/src/lib/aggregation/builders/flow-builder.ts` - both instance-count sites use `scaleQuantity('discrete')`; no `peopleMultiplier` reference (double-count hazard avoided)
- `.planning/REQUIREMENTS.md` - `WEEK-02` text updated, `PULL-F1` removed from Deferred/Future
- `.planning/phase-docs/phase-4-week-memory.md` - item 5, AC#7, and the Risks/Open-Questions pull-list note all reversed to reflect D-03

## Decisions Made
- `calculateProductQuantity` in `product-utils.ts` left in place, unused, rather than deleted — its sole call site in `product-builder.ts` now calls `scaleQuantity` directly; removing the now-dead export was out of this plan's stated file-touch scope
- Regression test for the D-03 pull-list quantity-doubling bug is a dedicated case (not folded into the multiplier=1 no-op assertion), matching 04-RESEARCH Pitfall 5's explicit warning that the two effects must not be conflated

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep counts, test file passes, `npm run build`/`npm run test` scoped to this plan's files) were met without needing an unplanned fix.

## Issues Encountered
None. `npm run build`'s remaining TypeScript errors (`src/lib/planning/history.test.ts`, `scripts/backfill-plan-dates.test.js`) are pre-existing Wave-0 scaffolding gaps owned by 04-04/04-05 — confirmed identical before and after this plan's changes via `git stash`/`git stash pop` comparison, not introduced by this work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- WEEK-02's trustworthy-scaling core is complete: `scaleQuantity` centralizes the D-04 rounding rule, the multiplier reaches all three derivation sites plus `buildPullLists`, and multiplier=1 reproduces byte-identical continuous output.
- All new parameters default to `1`, so `Outputs.tsx`'s existing 2-arg call sites (`buildProductFlowGraph(plannedMeals, recipeData)`, `buildPullLists(plannedMeals, recipeData)`) keep compiling and behaving identically. 04-07 is expected to thread the live `selectedPlan.people_multiplier` value into both call sites and add the missing `useMemo` dependency (04-RESEARCH Pitfall 3) — not yet done, by design.
- No blockers for downstream plans (04-04/04-05 own the still-RED `history.test.ts`/`backfill-plan-dates.test.js` scaffolds independently of this plan's scope).

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 7 modified/created source and doc files confirmed present on disk; all 3 task commits (`eab8863`, `c23eac4`, `461919f`) confirmed in `git log`.
