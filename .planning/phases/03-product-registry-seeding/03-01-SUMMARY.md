---
phase: 03-product-registry-seeding
plan: 01
subsystem: database
tags: [pocketbase, schema-migration, typescript, usda, nutrition]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: canonical pb_schema.json export convention, superuser script auth pattern
provides:
  - 8 nullable nutrition/USDA fields on the products collection (both test :8091 and prod :8090)
  - Idempotent, re-runnable schema-migration script for future field additions
  - Product TypeScript interface extended to mirror the new schema fields
affects: [03-04-seed-insert, 03-06-search-usda-create-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent PocketBase schema migration: fetch existing fields via collections.getOne, append only missing-by-name fields, update with merged array"
    - "Test-then-prod rehearsal order for live schema mutations against the single-household PocketBase"

key-files:
  created:
    - recipe-planner/scripts/add-product-nutrition-fields.js
  modified:
    - pb_schema.json
    - recipe-planner/src/lib/types.ts

key-decisions:
  - "Density/purchase-unit fields (canonical_unit, dimension) untouched — already nullable, deferred scope preserved"
  - "usda_data_type modeled as a single-select with foundation_food/sr_legacy values plus empty-string default in the TS union"

patterns-established:
  - "Nutrition-ready schema is additive-only and nullable; no nutrition UI ships until a later phase (NUTR-01, deferred)"

requirements-completed: [REG-04]

coverage:
  - id: D1
    description: "8 nullable nutrition/USDA fields (fdc_id, usda_data_type, usda_category, nutrient_basis_g, kcal, protein_g, fat_g, carb_g) added to the products collection on both test (:8091) and prod (:8090), none required"
    requirement: "REG-04"
    verification:
      - kind: manual_procedural
        ref: "Human verified both PocketBase Admin UIs (:8090/_/ and :8091/_/) — Collections → products — confirmed all 8 fields present and unmarked as required"
        status: pass
    human_judgment: true
    rationale: "Live schema state on two PocketBase instances can only be confirmed by inspecting the running Admin UI; no automated test asserts server-side field configuration beyond the local pb_schema.json export"
  - id: D2
    description: "All 291 existing products still load in the registry page unchanged after the field additions, no console errors"
    requirement: "REG-04"
    verification:
      - kind: manual_procedural
        ref: "Human started recipe-planner dev server, opened the Products registry page against prod, confirmed all existing products load with no console errors"
        status: pass
    human_judgment: true
    rationale: "Visual/runtime confirmation of registry rendering and console cleanliness requires a human observing the live app"
  - id: D3
    description: "Product TypeScript interface mirrors the 8 new schema fields as optional, npx tsc -b reports no new type errors"
    requirement: "REG-04"
    verification:
      - kind: other
        ref: "npx tsc -b --noEmit (run during Task 2) — typecheck clean"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 1: Nutrition-Ready Products Schema Summary

**Added 8 nullable nutrition/USDA fields (fdc_id, usda_data_type, usda_category, nutrient_basis_g, kcal, protein_g, fat_g, carb_g) to the products collection on both PocketBase instances via an idempotent script, re-exported pb_schema.json, and mirrored the fields into the Product TypeScript interface**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-06T23:50:00Z
- **Completed:** 2026-07-07T06:50:00Z (checkpoint approval received after pause)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- Idempotent superuser schema-migration script (`add-product-nutrition-fields.js`) added, rehearsed against test (:8091), then applied to prod (:8090)
- All 8 nullable nutrition/USDA fields confirmed present and non-required on both PocketBase instances via Admin UI
- `pb_schema.json` re-exported from prod, capturing the new fields with zero existing fields dropped
- `Product` TypeScript interface extended with the 8 matching optional fields; `npx tsc -b` clean
- Existing 291 products verified intact — registry page loads cleanly with no console errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Idempotent schema-migration script + apply test-then-prod + re-export pb_schema.json** - `92c082e` (feat)
2. **Task 2: Extend Product TypeScript interface** - `8d8c60d` (feat)
3. **Task 3: Verify schema fields on both instances + registry loads** - human-verify checkpoint, **approved** (no commit — verification-only task)

**Plan metadata:** (this commit) `docs(03-01): complete plan`

## Files Created/Modified
- `recipe-planner/scripts/add-product-nutrition-fields.js` - Idempotent, append-only superuser script adding the 8 nullable fields to the products collection; safe to re-run (no-op on second execution)
- `pb_schema.json` - Re-exported from live prod after the field additions; products collection (`pbc_7402169584`) now carries the 8 new fields alongside all pre-existing fields
- `recipe-planner/src/lib/types.ts` - `Product` interface extended with `fdc_id?`, `usda_data_type?`, `usda_category?`, `nutrient_basis_g?`, `kcal?`, `protein_g?`, `fat_g?`, `carb_g?`

## Decisions Made
- Density/purchase-unit hooks (`canonical_unit`, `dimension`) left untouched — already nullable per Phase 1, deferred scope confirmed unchanged by this plan
- `usda_data_type` modeled as `"foundation_food" | "sr_legacy" | ""` in TypeScript to match the PocketBase single-select field's empty-default behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The plan paused at the Task 3 human-verify checkpoint as designed; the user confirmed all 8 fields exist and are non-required on both PocketBase instances (test :8091, prod :8090), and that the Products registry page loads all 291 existing products with no console errors. No schema mutation was re-run — the checkpoint approval is a verification-only signal.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The nutrition-ready schema prerequisite for Plan 04 (seed insert, which populates `fdc_id` at minimum) and Plan 06 (Search-USDA create path) is now in place on both PocketBase instances.
- No nutrition UI ships as part of this plan (NUTR-01 remains deferred per PROJECT.md).

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*

## Self-Check: PASSED
- FOUND: .planning/phases/03-product-registry-seeding/03-01-SUMMARY.md
- FOUND: 92c082e
- FOUND: 8d8c60d
