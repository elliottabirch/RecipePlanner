---
phase: 02-shopping-state-live-substitution
plan: 02
subsystem: aggregation
tags: [typescript, vitest, tdd, variant-override, units]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: "Unit enum + dimension model (src/lib/units.ts); stable lineId identity"
provides:
  - "VariantOverride.quantity / VariantOverride.unit optional fields (Unit enum, D-12)"
  - "applyVariantOverrides inherit-when-null replacement branch (D-07/D-09)"
  - "variant-utils.test.ts — first regression coverage for this module"
affects: [02-07-swap-dialog, 02-08-override-map-builder, shopping-state-live-substitution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inherit-when-null: `override.field ?? node.field` for optional substitute values, defaulting to the original node's value"

key-files:
  created:
    - recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts
  modified:
    - recipe-planner/src/lib/aggregation/utils/variant-utils.ts

key-decisions:
  - "VariantOverride.unit typed as the Phase-1 Unit enum (imported from lib/units.ts), not free text, per D-12 — no import cycle encountered"

patterns-established:
  - "Pattern 3 from 02-RESEARCH implemented verbatim: replacement node quantity/unit = override value ?? original node value"

requirements-completed: [SHOP-03]

coverage:
  - id: D1
    description: "A variant override carrying quantity=2, unit='cup' changes the derived replacement node's quantity/unit for that meal"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts#a full override {quantity, unit} changes the replacement node's quantity/unit"
        status: pass
    human_judgment: false
  - id: D2
    description: "A variant override with null (or omitted) quantity/unit inherits the original node's quantity/unit unchanged (inherit-when-null)"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts#a null-quantity/null-unit override inherits the original node's quantity/unit unchanged"
        status: pass
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts#an omitted quantity/unit override (no fields set at all) inherits the original node's values"
        status: pass
    human_judgment: false
  - id: D3
    description: "A partial override {quantity: 2, unit: null} sets quantity but inherits the original unit"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts#a partial override {quantity: 2, unit: null} sets quantity but inherits the original unit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only the product relation + quantity/unit change on the replacement node; other node fields (e.g. meal_destination) are preserved via spread"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts#preserves other node fields and the replacement product relation via spread"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 2: Variant Override Quantity/Unit Threading Summary

**Extended `VariantOverride` with optional `quantity`/`unit` (Unit enum) and replaced `applyVariantOverrides`' "for now, preserve original" shortcut with inherit-when-null substitution logic — the exact wiring 02-RESEARCH Pitfall 2 warns is required, not optional, for a mid-shop swap's quantity to actually show up in any derived list.**

## Performance

- **Duration:** 10 min
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `VariantOverride` interface now carries optional `quantity?: number | null` and `unit?: Unit | null` (imported from `src/lib/units.ts`, no free text per D-12)
- `applyVariantOverrides`' replacement-node construction now sets `quantity: override.quantity ?? node.quantity` and `unit: override.unit ?? node.unit` — inherit-when-null per D-07/D-09
- New `variant-utils.test.ts` (no test file previously existed for this module) covers full override, null override, omitted override, partial override, and field-preservation cases — 5/5 passing

## Task Commits

Each task was executed as a TDD RED → GREEN cycle:

1. **Task 1 (RED): add failing test for VariantOverride quantity/unit threading** - `930e009` (test)
2. **Task 1 (GREEN): thread substitute quantity/unit through applyVariantOverrides** - `0a8cbdc` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## TDD Gate Compliance

- RED gate: `930e009` (`test(02-02): add failing test for VariantOverride quantity/unit threading`) — 2 of 5 new tests failed as expected before the implementation change (confirmed via `npx vitest run` output showing "expected 3 to be 2" for both quantity-override cases).
- GREEN gate: `0a8cbdc` (`feat(02-02): thread substitute quantity/unit through applyVariantOverrides`) — all 5 tests pass after the fix.
- REFACTOR gate: not needed — no cleanup required after GREEN.

Gate sequence verified in git log: test commit precedes feat commit, both on `main`.

## Files Created/Modified
- `recipe-planner/src/lib/aggregation/utils/variant-utils.ts` - `VariantOverride.quantity`/`unit` fields added; `applyVariantOverrides` replacement branch now inherits-when-null instead of always preserving the original quantity/unit
- `recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts` - new file; 5 test cases covering the behavior spec

## Decisions Made
- `VariantOverride.unit` typed as the Phase-1 `Unit` enum (imported from `../../units`) rather than `string` or free text, per D-12 — confirmed no import cycle (units.ts has no dependency back into aggregation/utils).

## Deviations from Plan

None - plan executed exactly as written. The plan's `<action>` explicitly specified TDD execution (`tdd="true"` on the task), which was followed: test file written and confirmed failing (RED) before the implementation edit (GREEN), rather than writing both together.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The pure re-derivation half of SHOP-03 is now correct and tested. The two remaining pieces that produce a user-visible substitute swap — the swap dialog UI and the `Outputs.tsx:225-237` override-map builder that forwards `quantity`/`unit` off the raw `MealVariantOverrideExpanded` record — are explicitly out of scope for this plan (02-RESEARCH Pattern 3 step 3; deferred to 02-07/02-08) and remain the required next wiring step before SHOP-03 is end-to-end visible.
- No blockers for 02-03 onward.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/src/lib/aggregation/utils/variant-utils.test.ts
- FOUND: .planning/phases/02-shopping-state-live-substitution/02-02-SUMMARY.md
- FOUND commit: 930e009
- FOUND commit: 0a8cbdc
