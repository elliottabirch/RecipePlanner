---
phase: 06-import-pipeline-recipe-lifecycle
plan: 10
subsystem: api
tags: [recipe-evolution, write-back, pocketbase, vitest, skill, node-id-preservation]

# Dependency graph
requires:
  - phase: 06-01
    provides: "recipe_notes collection, recipes.revision_of, recipe_product_nodes.source_node, RecipeNote type"
  - phase: 06-04
    provides: "buildRecipeGraph / planGraphWrites spine + NormalizedGraph contract (remapSeed update-in-place)"
provides:
  - "Pure planWriteBack(reviewedGraph, originalNodeIds) → { remapSeed, dangling } (D-10 write-back integrity)"
  - "write-back.test.ts — id-preservation / created-fresh / dangling coverage"
  - "evolve-recipes manual skill — pending-note drain → draft revision + approval write-back onto the original recipe id"
affects: [suggest-recipes, week-wizard-review-flag, recipe-evolution-loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Write-back remap: reviewed-node ref is the KEY, original node id is the VALUE → buildRecipeGraph updates the original in place (planned_meals + overrides survive)"
    - "Pure-planner + thin-executor split reused: planWriteBack (pure) feeds buildRecipeGraph.remapSeed (PB executor)"
    - "Manual chat-first agent skill mirroring recipe-import (run inside recipe-planner/, async main() + .catch, superuser auth from .env.local)"

key-files:
  created:
    - recipe-planner/src/lib/import/write-back.ts
    - recipe-planner/src/lib/import/write-back.test.ts
    - .claude/skills/evolve-recipes/SKILL.md
  modified: []

key-decisions:
  - "planWriteBack keys remapSeed by the reviewed node's ref (never a recipe id); recipe id passed separately to buildRecipeGraph as recipeId — recipe record never re-minted"
  - "dangling preserves originalNodeIds input order for deterministic cleanup + tests"
  - "A reviewed node whose source_node is stale/foreign (not among originalNodeIds) is created fresh, not force-mapped"

patterns-established:
  - "D-10 in-place branch: draft exists purely for review; approval update-in-place onto the original recipe id keeps hard relations valid with no migration"
  - "Node-correspondence via source_node is the single link that keeps override integrity across a revision (Pitfall 2)"

requirements-completed: [IMP-06]

coverage:
  - id: D1
    description: "Pure planWriteBack seeds remapSeed[ref]=source_node for unchanged nodes (update in place), omits new nodes (created fresh), and flags removed originals as dangling — recipe id never remapped"
    requirement: "IMP-06"
    verification:
      - kind: unit
        ref: "src/lib/import/write-back.test.ts#planWriteBack (9 tests: id-preservation, new-node, dangling, recipe-id-safety, purity)"
        status: pass
    human_judgment: false
  - id: D2
    description: "evolve-recipes manual skill documents the drain (pending notes → draft revision with revision_of + per-node source_node) and approval write-back (planWriteBack + buildRecipeGraph onto the original recipe id, dangling cleanup)"
    requirement: "IMP-06"
    verification:
      - kind: manual_procedural
        ref: ".claude/skills/evolve-recipes/SKILL.md (grep planWriteBack|revision_of|source_node|recipeId = 15 hits)"
        status: pass
    human_judgment: true
    rationale: "The skill is a runbook a human agent executes against live prod data; correctness of the two-operation flow (drain + approval write-back) is only fully exercised by a real note→revision→write-back run, which is out of scope for this plan's automated verification."

# Metrics
duration: 12min
completed: 2026-07-11
status: complete
---

# Phase 6 Plan 10: Evolution Write-Back Integrity Core Summary

**Pure, unit-tested `planWriteBack` that preserves the recipe id and unchanged node ids on revision write-back (planned weeks + overrides survive), plus a manual `evolve-recipes` skill draining pending notes into reviewable draft revisions.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-11T00:10:00Z
- **Completed:** 2026-07-11T00:22:27Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- Pure `planWriteBack(reviewedGraph, originalNodeIds): { remapSeed, dangling }` — the D-10 integrity core (Pitfall 2), seeding `remapSeed[ref]=source_node` so unchanged nodes update the original id in place, omitting new nodes (created fresh), and flagging genuinely-removed originals as `dangling`. Recipe id is never part of the remap.
- `write-back.test.ts` (9 tests) proving id-preservation, created-fresh, dangling detection, recipe-id safety, and input purity.
- `evolve-recipes/SKILL.md` — manual, chat-first skill documenting both operations: DRAIN (pending `recipe_notes` → draft revision with `revision_of` + per-node `source_node`, links `draft_revision`) and APPROVE/WRITE-BACK (`planWriteBack` → `buildRecipeGraph({recipeId: R, remapSeed})` onto the original recipe id, dangling cleanup, note→applied).
- `npx tsc --noEmit` clean; full suite green (247 tests, up from ~194).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing test for planWriteBack** - `9eba379` (test)
2. **Task 1 (GREEN): pure planWriteBack remap planner** - `d4beecd` (feat)
3. **Task 2: evolve-recipes manual skill** - `ece8213` (feat)

_Task 1 was `tdd="true"` → test → feat commits._

## Files Created/Modified
- `recipe-planner/src/lib/import/write-back.ts` - Pure `planWriteBack` remap planner (no PocketBase)
- `recipe-planner/src/lib/import/write-back.test.ts` - 9-test coverage of the id-preservation / dangling contract
- `.claude/skills/evolve-recipes/SKILL.md` - Manual note-drain + approval write-back runbook

## Decisions Made
- `planWriteBack` keys `remapSeed` strictly by the reviewed node's `ref`; the recipe id is passed separately to `buildRecipeGraph` as `recipeId` (which injects `RECIPE_REMAP_KEY`) — the recipe record is never re-minted.
- `dangling` preserves `originalNodeIds` input order for a deterministic cleanup loop and stable tests.
- A reviewed node whose `source_node` is stale/foreign (not in `originalNodeIds`) is created fresh rather than force-mapped — matches the "still present on the original" behavior spec.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. (The evolve-recipes skill uses the existing `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` creds from the gitignored `.env.local`, same as existing scripts.)

## Next Phase Readiness
- IMP-06 is completable now: the write-back integrity core is tested and the manual evolution skill documents the full note→revision→write-back loop.
- 06-11 (`/suggest-recipes`) is the remaining Phase 6 plan; it reuses the same `buildRecipeGraph` landing path and the recipe-import skill conventions this plan mirrors.
- Deferred residual (per D-10): `meal_variant_overrides` re-point on `dangling` node removal remains a targeted cleanup, not a general migration — the skill reports removed nodes so an affected override can be re-pointed by hand.

## Self-Check: PASSED

All 3 created files present on disk; all 3 task commits (9eba379, d4beecd, ece8213) in git history.

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-11*
