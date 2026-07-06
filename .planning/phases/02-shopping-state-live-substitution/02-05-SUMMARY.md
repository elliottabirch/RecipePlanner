---
phase: 02-shopping-state-live-substitution
plan: 05
subsystem: database
tags: [pocketbase, typescript, shopping-state, meal-variant-override]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: "Unit enum + dimension model in src/lib/units.ts (canonical_unit/dimension on products)"
provides:
  - "shopping_state PocketBase collection (weekly_plan relation cascadeDelete, line_key, checked, have_quantity, resolution) on prod and test"
  - "meal_variant_overrides.quantity / meal_variant_overrides.unit fields on prod and test"
  - "collections.shoppingState string constant (recipe-planner/src/lib/api.ts)"
  - "ShoppingState TypeScript interface (recipe-planner/src/lib/types.ts)"
  - "MealVariantOverride.quantity / MealVariantOverride.unit typed fields"
affects: ["02-06 (useShoppingState hook)", "02-07/02-08 (swap dialog + Outputs.tsx override-map builder)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["BaseRecord-extends + separate *Expanded interface convention (followed, no ShoppingStateExpanded needed this phase)"]

key-files:
  created: []
  modified:
    - pb_schema.json
    - recipe-planner/src/lib/api.ts
    - recipe-planner/src/lib/types.ts

key-decisions:
  - "Collection named shopping_state (not plan_line_state) — matches what was actually created in the admin UI on both instances"
  - "ShoppingState.resolution typed as \"buy\" | \"make\" | \"skip\" | null (not the plan text's non-null union) — the PocketBase field is a nullable select, so the TS type should allow null to match reality"
  - "MealVariantOverride.unit typed as the Phase-1 Unit enum (imported from units.ts), not free text, per D-12"

requirements-completed: [SHOP-01, SHOP-03]

coverage:
  - id: D1
    description: "shopping_state collection + meal_variant_overrides quantity/unit fields exist on both prod and test PocketBase instances with unique index and matched API rules"
    requirement: "SHOP-01"
    verification:
      - kind: manual_procedural
        ref: "Human-verified checkpoint (Task 1) — CRUD round-trip confirmed on test instance"
        status: pass
    human_judgment: false
  - id: D2
    description: "collections.shoppingState + ShoppingState interface + extended MealVariantOverride in TypeScript"
    requirement: "SHOP-03"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 05: Shopping State Schema + TypeScript Surface Summary

**Net-new `shopping_state` PocketBase collection (cascade-deleted per weekly plan, unique on weekly_plan+line_key) plus `meal_variant_overrides.quantity`/`.unit` fields, created on both prod and test and bound into the TypeScript layer via `collections.shoppingState` and the `ShoppingState` interface.**

## Performance

- **Duration:** ~12 min (Task 2 + summary; Task 1 checkpoint pre-approved by human before this session)
- **Tasks:** 2 (1 checkpoint pre-approved, 1 auto)
- **Files modified:** 3 (pb_schema.json already committed at 15e7173; api.ts, types.ts this session)

## Accomplishments
- `shopping_state` collection live on both prod (`:8090`) and test (`:8091`) PocketBase instances: `weekly_plan` (relation → weekly_plans, cascadeDelete ON), `line_key` (text), `checked` (bool), `have_quantity` (number, nullable), `resolution` (select buy/make/skip, nullable), with a UNIQUE index on `(weekly_plan, line_key)` and API rules matched to existing collections (T-02-07 mitigated).
- `meal_variant_overrides` extended with nullable `quantity` (number) and `unit` (select bound to the 14-value unit enum) on both instances.
- `pb_schema.json` re-exported and committed (15e7173) reflecting both schema changes — verified this session, not re-edited.
- `collections.shoppingState = "shopping_state"` added to `recipe-planner/src/lib/api.ts`.
- `ShoppingState` interface added to `recipe-planner/src/lib/types.ts` (`weekly_plan`, `line_key`, `checked`, `have_quantity`, `resolution`).
- `MealVariantOverride` extended with `quantity?: number | null` and `unit?: Unit | null` (Unit imported from `units.ts` per D-12 — enum, not free text).
- `cd recipe-planner && npx tsc -b` passes clean.

## Pre-migration Override Counts (phase doc item 3a)

Recorded during the Task 1 checkpoint (already approved before this session):
- **Prod** (`:8090`): `meal_variant_overrides` `totalItems` = **0**
- **Test** (`:8091`): `meal_variant_overrides` `totalItems` = **0**

Both instances had zero existing override rows pre-migration, matching 02-RESEARCH's expectation. No backfill/migration concern for the new nullable `quantity`/`unit` fields — every future row is created fresh with the new schema.

## Task Commits

1. **Task 1: Create shopping_state collection + meal_variant_overrides fields (manual PocketBase, both instances)** — pre-approved checkpoint, no code commit from this session (schema captured in `15e7173` prior to this session, per the checkpoint's own instructions to re-export `pb_schema.json`).
2. **Task 2: Add collections.shoppingState + ShoppingState interface + extend MealVariantOverride** — `76b6adb` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `pb_schema.json` — shopping_state collection + meal_variant_overrides.quantity/.unit (committed prior to this session at 15e7173; verified present, not re-edited)
- `recipe-planner/src/lib/api.ts` — `collections.shoppingState: "shopping_state"`
- `recipe-planner/src/lib/types.ts` — `ShoppingState` interface; `MealVariantOverride.quantity`/`.unit`

## Decisions Made
- Collection name kept as `shopping_state` (the name actually created during the checkpoint), not `plan_line_state` — Claude's-discretion naming per 02-CONTEXT.md was resolved during the manual schema creation, this plan just matches reality.
- `ShoppingState.resolution` typed `"buy" | "make" | "skip" | null` rather than the plan task text's non-null union — the PocketBase field is a nullable select (confirmed in the checkpoint and `must_haves`), so the TS type includes `null` to avoid a false non-null guarantee. Minor correctness improvement over the literal task wording, not a scope change.
- No `ShoppingStateExpanded` interface added — no relation expansion is needed for this phase's UI (only `weekly_plan` is a relation, and no consumer built so far expands it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ShoppingState.resolution` typed to include `null`**
- **Found during:** Task 2
- **Issue:** The plan's task text specified `resolution: "buy" | "make" | "skip";` (non-nullable), but the collection's `resolution` field was created as a nullable select per the plan's own `must_haves` and checkpoint instructions. A non-nullable TS type would misrepresent records where `resolution` is unset (the common initial state for every shopping line).
- **Fix:** Typed `resolution` as `"buy" | "make" | "skip" | null`.
- **Files modified:** `recipe-planner/src/lib/types.ts`
- **Verification:** `npx tsc -b` passes; type now matches the actual nullable schema field.
- **Committed in:** `76b6adb` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug-correctness)
**Impact on plan:** Necessary for type accuracy against the actual (nullable) schema field. No scope creep.

## Issues Encountered
None.

## User Setup Required
None this session — the manual PocketBase schema creation (Task 1) was already completed and approved by the human before this session began, on both prod and test instances.

## Next Phase Readiness
- `collections.shoppingState`, the `ShoppingState` interface, and the extended `MealVariantOverride` are in place and type-check — this is the foundation 02-06 (the `useShoppingState` hook) depends on.
- Pre-migration override counts (0/0) confirm no backfill is needed before 02-06/02-07 land inherit-when-null logic against `quantity`/`unit`.
- No blockers for 02-06.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/src/lib/api.ts
- FOUND: recipe-planner/src/lib/types.ts
- FOUND: .planning/phases/02-shopping-state-live-substitution/02-05-SUMMARY.md
- FOUND: commit 76b6adb
- FOUND: commit 15e7173
