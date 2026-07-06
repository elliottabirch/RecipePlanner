---
phase: 01-data-hygiene
plan: 07
subsystem: database
tags: [pocketbase, schema, migration-rehearsal, dedup, units, backfill]

# Dependency graph
requires:
  - phase: 01-data-hygiene (01-02)
    provides: find-duplicates.js + merge-products.js dedup pipeline
  - phase: 01-data-hygiene (01-05)
    provides: normalize-node-units.js + backfill-units.js scripts
  - phase: 01-data-hygiene (01-06)
    provides: container-type overload removal (aggregation reads containerTypeName)
provides:
  - products.canonical_unit (select, nullable, 14 units.ts enum values) and products.dimension (select, nullable, volume/mass/count) live on BOTH prod :8090 and test :8091
  - pb_schema.json / pb_schema_updated.json re-exported (22 collections, includes meal_variant_overrides + recipe_queue)
  - Completed, human-signed-off D-06 rehearsal of the full migration flow (sync -> dedup -> merge -> normalize -> backfill -> lint) against TEST
  - sync-to-test.js deferred-relations fix (forward/self-referencing product relations)
  - merge-products.js backup-name fix (PocketBase ^[a-z0-9_-]+\.zip$ format)
affects: [01-08 prod run, shopping-list aggregation, linter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deferred relation patch pass in sync-to-test.js for forward/self-referencing fields"
    - "PB backup names must be lowercase + .zip suffix (^[a-z0-9_-]+\\.zip$)"

key-files:
  created: []
  modified:
    - pb_schema.json
    - pb_schema_updated.json
    - recipe-planner/scripts/sync-to-test.js
    - recipe-planner/scripts/merge-products.js
    - recipe-planner/.gitignore

key-decisions:
  - "Prod has zero real same-type dupes; merge machinery was rehearsed via self-cleaning synthetic case-variant fixtures on TEST (Plan 08's merge step is likely a no-op on real data)"
  - "NEW Plan 08 entry condition: user requires ALL unit gaps resolved before the prod run — a human-confirmed unit-resolutions worksheet (recipe-planner/scripts/dedup-output/unit-resolutions.json) covering the 29 unresolved node units and all ambiguous/null canonical_unit products must be applied during the supervised prod run, not left to the linter"
  - "PB superuser credentials live in gitignored recipe-planner/.env.local, sourced at run time and never printed or committed"

patterns-established:
  - "D-06 rehearsal discipline: every mutation command explicitly sets PB_URL=:8091; prod receives read-only traffic"

requirements-completed: [DATA-04, DATA-05]

coverage:
  - id: D1
    description: "products.canonical_unit + dimension select fields live on both prod :8090 and test :8091, re-exported into pb_schema.json/pb_schema_updated.json (22 collections)"
    requirement: DATA-04
    verification:
      - kind: other
        ref: "curl records?filter=canonical_unit='' returns 200 on both :8090 and :8091; grep -c canonical_unit/dimension pb_schema_updated.json = 1 each; select values byte-match units.ts enum"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full migration flow (sync -> find-duplicates -> merge -> normalize -> backfill -> lint) rehearsed end-to-end against a fresh TEST copy of prod with clean, human-reviewed outputs"
    requirement: DATA-05
    verification:
      - kind: manual_procedural
        ref: "PB_URL=http://192.168.50.95:8091 script sequence per 01-07-PLAN.md Task 2; merge printed backup + zero-orphan + 2/2 delete; normalize/backfill idempotent on re-run"
        status: pass
    human_judgment: true
    rationale: "D-06 rehearsal sign-off gates the irreversible Plan 08 prod run; user signed off at the blocking checkpoint ('rehearsal clean') with the added condition that all unit gaps be human-resolved before prod"

# Metrics
duration: ~65min active (2 human-action gates across sessions)
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 07: Schema Fields + Migration Rehearsal Summary

**canonical_unit/dimension fields live on both PB instances, and the full irreversible migration flow rehearsed clean end-to-end on TEST — catching two prod-run-aborting bugs and proving prod has zero real same-type dupes**

## Performance

- **Duration:** ~65 min active execution (spanning two human-action gates: PB Admin schema edits, superuser credentials)
- **Started:** 2026-07-06T08:00:00Z (continuation after Task 1 human-action checkpoint)
- **Completed:** 2026-07-06T17:09:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `products.canonical_unit` (select, nullable, 14 values exactly matching the units.ts enum) and `products.dimension` (select, nullable: volume/mass/count) verified live and filterable on BOTH prod :8090 and test :8091; schema re-export committed (22 collections, now including `meal_variant_overrides` and `recipe_queue`)
- Complete D-06 rehearsal against TEST (:8091): fresh sync (1,684 records) → find-duplicates → merge (backup, pre-flight, 2/2 repointed, zero orphans, 2/2 deleted) → normalize (154 alias-normalized, 56 stored-node container strings cleared, 29 unresolved) → backfill (155 canonical_units inferred, 136 left null per D-08) → lint (239 findings; 123 missing-canonical-unit surface as findings, not silent gaps)
- Two real bugs caught by the rehearsal — both would have aborted or corrupted Plan 08's prod run — fixed and committed
- Human sign-off received: "rehearsal clean — proceed to prod", with one added entry condition for Plan 08 (see Next Phase Readiness)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema fields + re-export** - `92f243a` (feat)
2. **Task 2: sync-to-test deferred-relations fix** - `1b9f585` (fix, deviation)
3. **Task 2: merge-products backup-name fix** - `312ea58` (fix, deviation)
4. **Task 2: gitignore .env.local** - `a2b75f0` (chore, auth-gate handling)

## Files Created/Modified

- `pb_schema.json` / `pb_schema_updated.json` - re-exported with the two new products fields; both files identical, 22 collections
- `recipe-planner/scripts/sync-to-test.js` - deferred-relations patch pass (Phase 3) for `products.source_recipe` and `products.store_bought_product`
- `recipe-planner/scripts/merge-products.js` - backup basename now lowercase with `.zip` suffix per PB's `^[a-z0-9_-]+\.zip$` requirement
- `recipe-planner/.gitignore` - added `.env.local` (PB superuser credentials, never committed)

## Rehearsal Results (all against TEST :8091; prod read-only throughout)

| Step | Result |
|------|--------|
| 1. sync-to-test | 1,684 records copied, 5/5 deferred relation patches applied |
| 2. find-duplicates | **0 real same-type dupes in prod data**; 2 intentional cross-type pairs correctly quarantined out of the skeleton; 2 synthetic fixtures created to exercise the merge |
| 3. merge-products | backup `pre-merge-products-2026-07-06t16-47-54-853z.zip` created; pre-flight passed; 2/2 references repointed; zero orphans confirmed; 2/2 dupes deleted (test restored to prod-equivalent state) |
| 4. normalize-node-units --apply | 445 nodes: 154 alias-normalized, 56 stored-node container strings cleared, 29 unresolved (expected junk + raw/inventory container strings per Plan 05's D-01 scope decision); idempotent on re-run |
| 5. backfill-units --apply | 291 products: 155 canonical_unit/dimension inferred, 121 left null (no node units), 15 left null (multi-dimension ambiguous, never guessed per D-08); idempotent on re-run |
| 6. lint (tsx) | 239 findings: missing-canonical-unit 123, missing-store-section 96, cross-dimension 15, prep-words 5 |

Reports on disk (gitignored `recipe-planner/scripts/dedup-output/`): `dedup-report.md`, `dedup-decisions.json`, `normalize-node-units-unresolved.md`, `backfill-units-review.md`.

## Decisions Made

- **Synthetic merge fixtures:** prod has no real same-type dupes, so two self-cleaning case-variant dupes (`TOMATO CHERRY`, `ONION (YELLOW)`) were created on TEST with real node references repointed at them; the merge deleted them and restored the references — full machinery exercised with zero residue. Plan 08's merge step is likely a no-op on real data.
- **Credential handling:** superuser creds live in gitignored `recipe-planner/.env.local`, sourced per-command; values never printed, echoed, or committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sync-to-test.js failed on forward/self-referencing product relations**
- **Found during:** Task 2 (rehearsal step 1)
- **Issue:** single-pass top-down copy rejected 5 products whose `source_recipe` (→ recipes, copied later) or `store_bought_product` (self-reference) pointed at not-yet-created records; sync aborted
- **Fix:** strip those fields at create time and patch them in a deferred Phase 3 pass after all collections copy
- **Files modified:** recipe-planner/scripts/sync-to-test.js
- **Verification:** re-run completed — 1,684 records, 5/5 deferred patches applied
- **Committed in:** 1b9f585

**2. [Rule 1 - Bug] merge-products.js backup name rejected by PocketBase**
- **Found during:** Task 2 (rehearsal step 3)
- **Issue:** `pb.backups.create()` returned `validation_match_invalid` — backup names must match `^[a-z0-9_-]+\.zip$`; the raw ISO timestamp contained uppercase T/Z and lacked `.zip`. This would have aborted Plan 08's prod run at the backup step (safely, before any mutation, but still a hard failure).
- **Fix:** lowercase the timestamp and append `.zip`
- **Files modified:** recipe-planner/scripts/merge-products.js
- **Verification:** re-run created the backup and the merge completed end-to-end
- **Committed in:** 312ea58

**3. [Rule 3 - Blocking] No real same-type dupes to rehearse the merge with**
- **Found during:** Task 2 (rehearsal step 2)
- **Issue:** the plan assumed real same-type dupes would exist to confirm; find-duplicates produced an empty skeleton, making the merge acceptance criteria (backup/zero-orphan/delete output) unsatisfiable on real data
- **Fix:** created 2 synthetic case-variant dupes on TEST only, each with one real reference repointed at it; confirmed them in the decisions JSON; the merge itself cleaned them up
- **Files modified:** none (test-instance data only, self-cleaning)
- **Verification:** post-merge, references point back at the original products and the synthetics are deleted
- **Committed in:** n/a (no repo changes)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** Deviations 1-2 are exactly the class of failure the D-06 rehearsal exists to catch before the irreversible prod run. No scope creep.

## Authentication Gates

1. **Task 1 (pre-planned human-action):** PB Admin schema fields added by the user on both instances; executor verified live via API and committed the re-export.
2. **Task 2 step 3 (dynamic gate):** `merge-products.js` requires `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` for `pb.backups.create()`; execution paused, user provided credentials via gitignored `recipe-planner/.env.local`, merge retried successfully.

## Issues Encountered

- **T-07-DRIFT caught live:** at resume, the fields existed on prod but NOT on test (the plan's exact schema-drift threat). Executor verification caught it before any commit; user re-imported the prod schema export into test via PB Admin, after which both instances verified identical.
- `scripts/lint.js` must be run via `tsx` (extensionless TS imports fail under plain `node`) — known from Plan 04, not a new issue.

## User Setup Required

Completed during this plan (no outstanding setup): PB Admin schema fields added on both instances; superuser credentials placed in gitignored `recipe-planner/.env.local` (needed again for Plan 08's prod run).

## Next Phase Readiness

- Schema fields live on both DBs; full migration flow proven end-to-end on test; both rehearsal-caught bugs fixed. Plan 08 (supervised prod run) is unblocked EXCEPT for the new entry condition below.
- **NEW Plan 08 entry condition (user sign-off condition):** ALL unit gaps must be resolved by human review before the prod run — every unresolved node unit (29) and every ambiguous/null canonical_unit product must be defined in a human-confirmed unit-resolutions worksheet at `recipe-planner/scripts/dedup-output/unit-resolutions.json` (being prepared by the orchestrator) and applied as part of the supervised prod run. Nothing is to be left to the linter.
- Finding for Plan 08: prod has zero real same-type dupes — the merge step will likely be a no-op; the run's substance is normalize + backfill + the unit-resolutions worksheet.

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- All 5 claimed files exist on disk
- All 4 task commits present in git log (92f243a, 1b9f585, 312ea58, a2b75f0)
- Acceptance re-run: pb_schema_updated.json contains canonical_unit + dimension; filter on canonical_unit returns 200 on both :8090 and :8091
