---
phase: 03-product-registry-seeding
plan: 03
subsystem: database
tags: [usda, fdc, fuse.js, seed-data, pocketbase, catalog-decision]

# Dependency graph
requires:
  - phase: 03-product-registry-seeding (plan 02)
    provides: searchProducts fuzzy-search module (fuse.js) reused by the fdc_id join
provides:
  - "build-usda-seed.js offline pipeline (name-normalize, fuzzy fdc_id join, section/store maps, keyword->canonical_unit map)"
  - "Staged USDA Foundation Foods + SR Legacy bulk data under scripts/data/ (gitignored, provenance recorded in README.md)"
  - "50-item real join-coverage comparison (scripts/seed-output/catalog-comparison.md) between OFF-filtered taxonomy and hand-curated list"
  - "LOCKED D-01/Open-Question-1 decision: hand-curated catalog source, ~500-item target, for Plan 04 to consume"
affects: [03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Offline seed-build pipeline pattern: name-normalize -> fuse.js containment+fuzzy join against USDA bulk data (Foundation Foods first, SR Legacy fallback, null on miss) -> category/keyword map to live section+store relation IDs"

key-files:
  created:
    - recipe-planner/scripts/build-usda-seed.js
    - recipe-planner/scripts/data/README.md
    - recipe-planner/scripts/seed-output/catalog-comparison.md
  modified:
    - recipe-planner/.gitignore

key-decisions:
  - "D-01 / Open Question 1 LOCKED: catalog source for the full seed build is a hand-curated (LLM-assisted) static list, NOT the Open Food Facts categories taxonomy."
  - "Target breadth for the full build (Plan 04): ~500 household-staple raw ingredients, authored directly into the 8 existing sections (produce, dairy, baking supplies, meat, bakery, prepared meals, frozen, international); frozen/international entries are hand-assigned since neither has a USDA/category equivalent (D-04)."
  - "Expected fdc_id join coverage for the full build: ~96%, based on the real 50-item hand-curated sample's 96.0% match rate via build-usda-seed.js's containment+fuse.js join (Foundation Foods first, SR Legacy fallback). Null fdc_id remains a valid per-item state (D-02) for the ~4% genuine misses."

patterns-established:
  - "Catalog-source decision checkpoints get resolved on real join-coverage evidence (a small real sample run through the actual join code) rather than a priori estimates — the OFF-filtered path's 14% match rate could not have been predicted from the taxonomy filter alone."

requirements-completed: [REG-01]

coverage:
  - id: D1
    description: "D-01/Open Question 1 catalog-source decision is locked (hand-curated, ~500-item target) and recorded for Plan 04 to consume"
    requirement: "REG-01"
    verification:
      - kind: manual_procedural
        ref: "User selected 'hand-curated' with ~500 target at the Task 2 checkpoint; decision recorded in this SUMMARY's key-decisions"
        status: pass
    human_judgment: true
    rationale: "This is a checkpoint:decision task — the human's selection at the gate IS the verification; there is no automated check for a catalog-source preference."

duration: 1min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 3: Seed-Build Pipeline + Catalog-Source Decision Summary

**Locked D-01/Open Question 1 to a hand-curated ~500-item household-staple catalog (96% real fdc_id join coverage vs. 14% for OFF-filtered) for Plan 04's full seed build.**

## Performance

- **Duration:** ~1 min (Task 2 checkpoint resolution only; Task 1 build previously completed in commit 309fd90)
- **Started:** 2026-07-07T06:23:09Z (session start, per STATE.md)
- **Completed:** 2026-07-07T06:42:18Z
- **Tasks:** 2 (Task 1 auto, Task 2 checkpoint:decision)
- **Files modified:** 0 new (decision recorded in this SUMMARY only)

## Accomplishments
- Task 1 (prior commit `309fd90`): stood up `build-usda-seed.js` (name-normalizer, fuse.js-backed fdc_id join, 8-section/4-store map, keyword->canonical_unit map), staged USDA Foundation Foods + SR Legacy bulk data under `scripts/data/`, and produced a real 50-item head-to-head catalog comparison.
- Task 2 (this continuation): the user reviewed `scripts/seed-output/catalog-comparison.md` and selected **hand-curated** as the catalog source, with a **~500-item** target for the full build.
- **Decision locked for Plan 04:**
  - **Catalog source:** hand-curated (LLM-assisted) static list of household-staple raw ingredients — not the Open Food Facts categories taxonomy.
  - **Target breadth:** ~500 items, authored directly into the 8 existing sections (produce, dairy, baking supplies, meat, bakery, prepared meals, frozen, international). Frozen/international sections are hand-assigned per D-04 (no USDA/category equivalent).
  - **Join expectation:** ~96% fdc_id coverage via `build-usda-seed.js`'s existing containment+fuse.js name->fdc_id join (Foundation Foods first, SR Legacy fallback); the remaining ~4% seed with `fdc_id = null`, a valid state per D-02.
  - **Rationale (from the 50-item spike):** hand-curated achieved 96.0% fdc_id match rate with zero name-quality noise and 100% section-mapping coverage by construction, vs. OFF-filtered's 14.0% match rate — the OFF taxonomy's English/leaf-node/no-brand filter still passes cultivar, regional, prep-state, and transport-method variant names that USDA does not catalog individually, and closing that gap would require a further popularity/genericness curation pass on top of the filtering already built in Task 1. Either choice was valid per D-02 (null fdc_id acceptable); the real numbers favored hand-curated for a single-user personal registry.

## Task Commits

Task 1 was committed in the prior session (verified present, not redone):

1. **Task 1: Seed-build pipeline scaffolding + USDA acquisition + 50-item catalog comparison** - `309fd90` (feat)
2. **Task 2: Lock the catalog-source decision (checkpoint:decision)** - resolved via user selection; no code changes, decision recorded in this SUMMARY.

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `recipe-planner/scripts/build-usda-seed.js` - offline seed-build pipeline: name-normalize, fuzzy fdc_id join, section/store maps, keyword->canonical_unit map (Task 1, commit 309fd90)
- `recipe-planner/scripts/data/README.md` - USDA bulk data provenance/license/filenames (Task 1, commit 309fd90)
- `recipe-planner/scripts/seed-output/catalog-comparison.md` - 50-item OFF-filtered vs. hand-curated join-coverage comparison, the decision artifact for Task 2 (Task 1, commit 309fd90)
- `recipe-planner/.gitignore` - excludes multi-MB USDA/OFF bulk data files (Task 1, commit 309fd90)

## Decisions Made
- **D-01 / Open Question 1 LOCKED:** hand-curated (LLM-assisted) static catalog, ~500-item target, for Plan 04's full seed build. See key-decisions in frontmatter for full rationale.

## Deviations from Plan

None - plan executed exactly as written. Task 2 was a checkpoint:decision gate; the user's selection (hand-curated, ~500 target) is recorded here per the plan's own instruction, with no code changes required at this gate.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. (Task 1's USDA bulk-download `user_setup` step was already completed prior to Task 1's commit.)

## Next Phase Readiness

Plan 04 (full seed build) can proceed directly: it should author ~500 hand-curated household-staple raw ingredient names across the 8 sections, run them through the existing `build-usda-seed.js` join/map pipeline (no pipeline changes needed — Task 1's scaffolding already supports this path), and expect ~96% fdc_id join coverage with the remaining ~4% seeding as `fdc_id = null` (D-02). No blockers.

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: .planning/phases/03-product-registry-seeding/03-03-SUMMARY.md
- FOUND: commit 309fd90 (Task 1)
- FOUND: recipe-planner/scripts/build-usda-seed.js
- FOUND: recipe-planner/scripts/seed-output/catalog-comparison.md
