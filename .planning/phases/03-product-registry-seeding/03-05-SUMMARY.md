---
phase: 03-product-registry-seeding
plan: 05
subsystem: search
tags: [fuse.js, usda, sr-legacy, fdc, offline-index, vitest]

# Dependency graph
requires:
  - phase: 03-product-registry-seeding (plan 02)
    provides: searchProducts fuzzy-search module (fuse.js) — same config/approach reused here
  - phase: 03-product-registry-seeding (plan 03)
    provides: staged SR-Legacy bulk CSV under scripts/data/ (build-usda-seed.js's category->section keyword rules, reused verbatim)
provides:
  - "recipe-planner/scripts/build-usda-search-index.js — offline transform: SR-Legacy bulk CSV -> trimmed {name, foodCategory, fdc_id} bundled asset"
  - "recipe-planner/src/assets/usda-sr-legacy.json — bundled Search-USDA index (7,793 rows, 117KB gzipped)"
  - "recipe-planner/src/lib/usda/usda-lookup.ts — searchUsda(query) fuse.js wrapper over the bundled index"
  - "recipe-planner/src/lib/usda/category-section-map.ts — sectionIdForCategory(foodCategory) -> section name or undefined"
affects: [03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bundled offline lookup module mirrors product-search.ts's fuse.js config (keys, threshold 0.35, ignoreLocation) rather than a second matching engine"
    - "category-section-map.ts returns a section NAME, not a live PocketBase record id — id resolution against the live sections collection is the caller's (Plan 06's) job, since ids differ between prod/test instances"

key-files:
  created:
    - recipe-planner/scripts/build-usda-search-index.js
    - recipe-planner/src/assets/usda-sr-legacy.json
    - recipe-planner/src/lib/usda/usda-lookup.ts
    - recipe-planner/src/lib/usda/usda-lookup.test.ts
    - recipe-planner/src/lib/usda/category-section-map.ts
  modified: []

key-decisions:
  - "Bundled asset came in at 117KB gzipped (7,793 rows) — under the D-06 150-250KB target, since duplicate (name, fdc_id) rows and blank names were dropped during the trim."
  - "category-section-map.ts's SECTION_KEYWORD_RULES are a direct reuse (not a reimplementation) of build-usda-seed.js's Plan-03 category->section rules — one mapping table, ported to TS for the client-side module."
  - "usda-lookup.test.ts mocks the bundled JSON asset with a small deterministic fixture (vi.mock) rather than asserting against the real ~7.8k-row index, per the plan's fast/deterministic test guidance."

patterns-established:
  - "Offline SR-Legacy CSV parsing (parseCsvLine, food.csv + food_category.csv join) is duplicated (not shared) between build-usda-seed.js and build-usda-search-index.js — both are one-time offline scripts with no other shared-module dependency, so duplication was accepted over introducing a shared scripts/lib module for two callers."

requirements-completed: [REG-03]

coverage:
  - id: D1
    description: "Bundled trimmed SR-Legacy Search-USDA index (name/foodCategory/fdc_id) built from the same bulk file as the seed join, shipped as a static bundled asset"
    requirement: "REG-03"
    verification:
      - kind: other
        ref: "node -e index-shape verify command (all rows carry name/fdc_id/foodCategory, 7793 rows) — 03-05-PLAN.md Task 1 <verify>"
        status: pass
    human_judgment: false
  - id: D2
    description: "searchUsda(query) fuzzy-searches the bundled index and returns fdc_id-bearing candidates; empty/whitespace returns []"
    requirement: "REG-03"
    verification:
      - kind: unit
        ref: "src/lib/usda/usda-lookup.test.ts#searchUsda — REG-03 bundled Search-USDA index lookup"
        status: pass
    human_judgment: false
  - id: D3
    description: "sectionIdForCategory derives a section name from an SR-Legacy foodCategory for Search-USDA prefill, undefined for unmapped categories"
    requirement: "REG-03"
    verification:
      - kind: unit
        ref: "src/lib/usda/usda-lookup.test.ts#sectionIdForCategory — category→section map for prefill"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 5: Bundled Offline Search-USDA Index + Lookup Module Summary

**Trimmed the same SR-Legacy bulk CSV Plan 03 already staged down to a 117KB-gzipped `{name, foodCategory, fdc_id}` bundled asset (7,793 rows), plus a `searchUsda()` fuse.js wrapper and a `sectionIdForCategory()` prefill map — fully offline, no live FDC API, ready for Plan 06's Search-USDA tab.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-07T00:00:00-07:00 (approx, from first commit timestamp)
- **Completed:** 2026-07-07T00:02:43-07:00
- **Tasks:** 2 (Task 1 auto, Task 2 auto/tdd)
- **Files modified:** 5 created, 0 modified

## Accomplishments
- `build-usda-search-index.js` reads the SR-Legacy `food.csv` + `food_category.csv` staged under `scripts/data/` by Plan 03 (no re-download) and emits a trimmed, deduplicated `{name, foodCategory, fdc_id}` array — 7,793 rows, 117KB gzipped (under the 150-250KB D-06 target).
- `usda-lookup.ts` exports `searchUsda(query: string): UsdaEntry[]`, a fuse.js wrapper over the bundled index using the exact same config (`keys: ["name"]`, `threshold: 0.35`, `ignoreLocation: true`) as `product-search.ts` — one matching engine, not a second. Empty/whitespace queries return `[]`.
- `category-section-map.ts` exports `sectionIdForCategory(foodCategory): string | undefined`, reusing `build-usda-seed.js`'s Plan-03 keyword rules to map SR-Legacy categories to one of the 8 section names (`frozen`/`international` intentionally unmapped per D-04).
- Test-first (TDD): `usda-lookup.test.ts` written and confirmed RED (module-not-found) before implementation, then GREEN after `usda-lookup.ts`/`category-section-map.ts` landed — 6/6 assertions pass.
- Full suite (`npm test`) stays green at 101/101 tests; `tsc -b` compiles cleanly (confirmed the bundled JSON's static import type-checks under the project's `moduleResolution: "bundler"` config, no tsconfig change needed).

## Task Commits

Each task was committed atomically:

1. **Task 1: build-usda-search-index.js → bundled usda-sr-legacy.json asset** - `8397922` (feat)
2. **Task 2: usda-lookup.ts (searchUsda) + category→section map + test** - `10fc7a2` (test, RED) then `6ec5459` (feat, GREEN)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `recipe-planner/scripts/build-usda-search-index.js` - offline transform: SR-Legacy bulk CSV -> trimmed bundled asset (no PocketBase client, no live FDC API)
- `recipe-planner/src/assets/usda-sr-legacy.json` - bundled Search-USDA index, 7,793 rows, 117KB gzipped
- `recipe-planner/src/lib/usda/usda-lookup.ts` - `searchUsda(query)`, fuse.js wrapper mirroring `product-search.ts`'s config
- `recipe-planner/src/lib/usda/usda-lookup.test.ts` - RED-then-GREEN test file covering the three plan behaviors, mocks the bundled JSON with a small deterministic fixture
- `recipe-planner/src/lib/usda/category-section-map.ts` - `sectionIdForCategory(foodCategory)`, reuses Plan 03's category->section keyword rules

## Decisions Made
- Kept `parseCsvLine`/CSV-join logic duplicated (not extracted to a shared module) between `build-usda-seed.js` and `build-usda-search-index.js` — both are one-time offline scripts with no other shared dependency; introducing a `scripts/lib/` module for exactly two callers wasn't justified.
- `category-section-map.ts` returns a section **name** string, not a live PocketBase relation id, per the plan's own guidance — id resolution is deferred to Plan 06, which has live access to the `sections` collection on whichever PocketBase instance (prod/test) it's talking to.
- Bundled asset size (117KB gzipped) came in under the 150-250KB target after dropping duplicate `(name, fdc_id)` rows and blank-name rows during the trim — no further size-reduction work needed.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>`/`<verify>` specs; no auto-fixes, no architectural questions, no auth gates.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. This plan is fully offline (no PocketBase writes, no live API calls, no new dependencies — `fuse.js` was already installed in Plan 02).

## Next Phase Readiness

Plan 06 (Search-USDA quick-create tab, REG-03) can proceed directly: `searchUsda()` and `sectionIdForCategory()` are both ready to import, tested, and matching the exact API sketch `03-PATTERNS.md` specified. Plan 06 will need to: (1) lazy-load the bundled asset only when the "Search USDA" tab opens (per the threat model's T-03-10 mitigation, not yet wired since that's this plan's consumer's job, not this plan's), and (2) resolve `sectionIdForCategory`'s returned section name against the live `sections` collection to get the actual relation id for prefill. No blockers.

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/build-usda-search-index.js
- FOUND: recipe-planner/src/assets/usda-sr-legacy.json
- FOUND: recipe-planner/src/lib/usda/usda-lookup.ts
- FOUND: recipe-planner/src/lib/usda/usda-lookup.test.ts
- FOUND: recipe-planner/src/lib/usda/category-section-map.ts
- FOUND: commit 8397922 (Task 1)
- FOUND: commit 10fc7a2 (Task 2 RED)
- FOUND: commit 6ec5459 (Task 2 GREEN)
