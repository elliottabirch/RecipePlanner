---
phase: 03-product-registry-seeding
plan: 04
subsystem: database
tags: [pocketbase, usda-fdc, product-registry, fuse.js, seed-data, vitest]

requires:
  - phase: 03-product-registry-seeding
    provides: "03-01 nutrition-ready product schema (fdc_id/usda_* fields); 03-03 locked hand-curated ~500-item catalog source decision"
provides:
  - "usda-seed.json: 508-row hand-curated raw-ingredient seed catalog with resolved store/section, fdc_id, usda_data_type/category"
  - "seed-usda.js: idempotent, conservative resolveSeedRow resolver (BACKFILL/SKIP/SKIP_REVIEW/INSERT) with --dry-run and --backup-only modes"
  - "Prod registry seeded: 432 net-new raw products inserted, 49 existing raw products backfilled with fdc_id/usda_data_type/usda_category"
affects: [nutrition-ui, shopping-list, product-search]

tech-stack:
  added: []
  patterns:
    - "seed-usda.js extends find-duplicates.js's PB-client + report conventions; hard-dedup scoped to type=\"raw\" only (composite (name COLLATE NOCASE, type) index), cross-type same-name collisions quarantined as review-only flags, never blocking"
    - "backup-before-mutate on the prod path via pb.backups.create(), mirroring Phase 1's merge-products.js precedent"

key-files:
  created:
    - recipe-planner/scripts/data/usda-seed.json
    - recipe-planner/scripts/seed-usda.js
    - recipe-planner/scripts/seed-usda.test.js
  modified: []

key-decisions:
  - "27 SKIP_REVIEW near-matches left untouched per explicit user policy (existing registry products are more specific than the seed's near-duplicate candidates) — no merge, no force-insert"
  - "4 cross-type raw inserts (parmesan cheese, ground beef, marinara sauce, salad dressing) proceeded as INSERT/SKIP_REVIEW per their own action, since the composite (name, type) index does not treat different-type same-name products as duplicates"

requirements-completed: [REG-01]

coverage:
  - id: D1
    description: "Prod registry gains 432 net-new plain-named raw products with resolved store/section/fdc_id, and 49 existing raw products backfilled with fdc_id/usda_data_type/usda_category, with zero duplicate-name violations against the existing raw set"
    requirement: "REG-01"
    verification:
      - kind: other
        ref: "post-insert prod query via PocketBase JS SDK: raw count 121 -> 553 (432 net-new), 0 duplicate raw names, 4/4 sampled backfilled products carry expected fdc_id"
        status: pass
    human_judgment: false
  - id: D2
    description: "seed-usda.js resolver behavior (BACKFILL/SKIP/SKIP_REVIEW/INSERT + cross-type quarantine) is unit-tested and matches its dry-run report exactly when applied for real"
    requirement: "REG-01"
    verification:
      - kind: unit
        ref: "recipe-planner/scripts/seed-usda.test.js (8 tests, vitest)"
        status: pass
      - kind: other
        ref: "prod apply run console output: INSERT 432, BACKFILL 49, SKIP 0, SKIP_REVIEW 27, Failed 0 — identical tallies to the pre-checkpoint dry-run report"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 4: USDA Product Registry Seeding Summary

**Prod product registry seeded with 432 net-new raw ingredients + 49 fdc_id backfills via an idempotent, conservative resolveSeedRow resolver — zero duplicate-index violations, 27 near-dupes correctly left untouched per user policy**

## Performance

- **Duration:** 21 min (00:15 - 00:36 local, spans the human-verify checkpoint pause for dry-run/test-rehearsal review)
- **Started:** 2026-07-07T07:15:23Z
- **Completed:** 2026-07-07T07:35:52Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 3 (usda-seed.json, seed-usda.js, seed-usda.test.js)

## Accomplishments

- Finalized `build-usda-seed.js` output: 508-row `usda-seed.json` seed catalog (hand-curated source locked in Plan 03), each row carrying plain name, `type: "raw"`, resolved store/section, `fdc_id` where matched, `usda_data_type`/`usda_category`
- Implemented `seed-usda.js`: a pure, unit-tested `resolveSeedRow` resolver distinguishing BACKFILL (exact match, empty fdc_id) / SKIP (exact match, already has fdc_id) / SKIP_REVIEW (conservative near-match, never auto-merged) / INSERT (genuine miss) — plus a separate cross-type collision quarantine that never blocks a raw insert
- Dry-run reviewed against prod, rehearsed on test `:8091`, prod backup taken (`pre-seed-usda-2026-07-07t07-18-11-276z.zip`), user approved
- Ran the real prod insert: **432 inserted, 49 backfilled, 0 failed** — tallies identical to the pre-checkpoint dry-run report
- Verified post-insert prod state: raw product count 121 → 553 (exactly +432), zero duplicate raw names, 4/4 spot-checked backfilled products carry their expected `fdc_id` with names unchanged, 20-item spot-check of new inserts shows plain names spread across produce/dairy/meat/bakery/frozen/prepared-meals sections and all 4 stores
- The 27 SKIP_REVIEW near-dupes (onion, garlic, tomato, potato, etc.) and the 4 cross-type collisions were left exactly as the dry-run predicted — no merges, no force-inserts

## Task Commits

Each task was committed atomically (Tasks 1-2 landed pre-checkpoint; this continuation performed only the prod write, which the plan does not treat as a separate commit — no new source files were modified):

1. **Task 1: Finalize build-usda-seed.js for the chosen catalog → full usda-seed.json + spot-check** - `e9da195` (feat)
2. **Task 2 (RED): Failing resolver test** - `d8e251d` (test)
2. **Task 2 (GREEN): seed-usda.js resolver** - `ac1f61c` (feat)
3. **Task 3: Dry-run review + test rehearsal + backed-up prod seed run** - checkpoint approved; prod insert executed this continuation (no code changes, no new commit — the mutation is a data-only PocketBase write, verified below)

**Plan metadata:** (this commit) `docs(03-04): complete USDA product registry seeding plan`

## Files Created/Modified

- `recipe-planner/scripts/data/usda-seed.json` - 508-row seed catalog (name/type/store/section/fdc_id/usda_data_type/usda_category)
- `recipe-planner/scripts/seed-usda.js` - idempotent resolver + dry-run/backup-only/apply modes
- `recipe-planner/scripts/seed-usda.test.js` - 8 unit tests covering BACKFILL/SKIP/SKIP_REVIEW/INSERT + cross-type quarantine
- (gitignored, not committed) `recipe-planner/scripts/seed-output/seed-report.md` + `.json` - dry-run/apply report artifact, regenerated on each run, mirrors Phase 1's `dedup-output/` precedent

## Decisions Made

- 27 SKIP_REVIEW near-matches (e.g. `onion` vs `onion (yellow)`/`onion (red)`/`green onion`) kept as-is per explicit user policy: existing registry products are more specific than the seed's generic near-duplicate candidates — no merge, no force-insert. This is the resolver's default conservative behavior; no code override was needed.
- The 4 cross-type same-name collisions (`parmesan cheese`, `ground beef`, `marinara sauce`, `salad dressing`) proceeded per their independently-computed action (3 INSERT, 1 SKIP_REVIEW) since the composite `(name, type)` unique index does not treat different-type same-name products as duplicates — confirmed no unique-index errors occurred.

## Deviations from Plan

None - plan executed exactly as written. The checkpoint's resume-signal ("approved") was honored verbatim: no SKIP_REVIEW entries were merged, no near-dupes were force-inserted.

## Issues Encountered

None. The real prod apply run's tallies (INSERT 432, BACKFILL 49, SKIP 0, SKIP_REVIEW 27, Failed 0) matched the pre-checkpoint dry-run report exactly, confirming no drift occurred on prod between the dry-run and the approved apply.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Prod product registry now carries 553 raw products (up from 121) with real-world breadth and retained USDA `fdc_id`/`usda_data_type`/`usda_category` for future nutrition-UI work (NUTR-01, deferred)
- Phase 3's remaining plan (03-06, if any) can build on the seeded registry
- No blockers introduced; the 27 SKIP_REVIEW entries remain available for manual review/merge later if the user changes their mind, but are not currently blocking anything

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/data/usda-seed.json
- FOUND: recipe-planner/scripts/seed-usda.js
- FOUND: recipe-planner/scripts/seed-usda.test.js
- FOUND: .planning/phases/03-product-registry-seeding/03-04-SUMMARY.md
- FOUND commits: e9da195, d8e251d, ac1f61c
