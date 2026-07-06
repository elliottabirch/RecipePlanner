---
phase: 01-data-hygiene
plan: 08
subsystem: database
tags: [pocketbase, migration, dedup, units, unique-index, prod]

# Dependency graph
requires:
  - phase: 01-data-hygiene (01-05)
    provides: normalize-node-units.js + backfill-units.js scripts
  - phase: 01-data-hygiene (01-07)
    provides: D-06 rehearsal sign-off, schema fields on both instances, unit-resolutions worksheet entry condition
provides:
  - Cleaned PROD data — 0 same-type dupes, all 445 recipe_product_nodes.unit values enum tokens or empty, ALL 291 products have canonical_unit + dimension, zero orphaned relations, pre-run backup
  - idx_products_name_type_ci — UNIQUE INDEX on products (name COLLATE NOCASE, type) live on BOTH prod :8090 and test :8091 (D-12)
  - Single canonical schema export pb_schema.json (22 collections incl. meal_variant_overrides and the new index); pb_schema_updated.json DELETED (user-directed consolidation)
  - recipe-planner/scripts/apply-unit-resolutions.js — worksheet applier (dry-run default, pre-flight enum/dimension validation)
  - Durable audit artifacts in phase dir — 01-08-dedup-decisions.json (empty, confirmed), 01-08-dedup-report.md, 01-08-unit-resolutions.json (165 confirmed rows)
affects: [02-shopping-state, 03-registry-seeding, linter, aggregation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single canonical schema export: pb_schema.json only — pb_schema_updated.json no longer exists; later phases verify against pb_schema.json"
    - "Human-confirmed worksheet apply: pre-flight validate enum tokens + canonical_unit/dimension consistency before any write; human decisions clobber inference"

key-files:
  created:
    - recipe-planner/scripts/apply-unit-resolutions.js
    - .planning/phases/01-data-hygiene/01-08-dedup-decisions.json
    - .planning/phases/01-data-hygiene/01-08-dedup-report.md
    - .planning/phases/01-data-hygiene/01-08-unit-resolutions.json
  modified:
    - pb_schema.json
    - RECIPE-IMPORT-GUIDE.md
    - recipe-planner/scripts/merge-products.js
    - recipe-planner/scripts/find-duplicates.js
    - .planning/PROJECT.md

key-decisions:
  - "Schema exports consolidated to a single canonical pb_schema.json; pb_schema_updated.json deleted (user-directed at the Task 3 checkpoint) — all Plan 08 acceptance greps against pb_schema_updated.json are satisfied by pb_schema.json instead"
  - "Backup taken explicitly via pb.backups.create before any mutation because merge-products.js exits before its own backup step when the decisions file is empty (no-op merge)"
  - "Cross-dimension lint findings rose 15 -> 20 post-migration: newly-set canonical units expose more authoring-time convertibility mismatches — working as designed, not a regression"

patterns-established:
  - "Worksheet apply pattern: JSON worksheet with confirmed:true rows is the only input; pre-flight validation aborts before any write on invalid enum token or drifted dimension"

requirements-completed: [DATA-04, DATA-05]

coverage:
  - id: D1
    description: "PROD deduped (no-op confirmed — zero same-type dupes), node units normalized (210 written), canonical units backfilled (155 inferred + 136 human-confirmed), zero orphans, pre-run backup"
    requirement: DATA-05
    verification:
      - kind: other
        ref: "find-duplicates.js vs prod: 'No same-type merge candidates found'; normalize dry-run post-apply: 0 unresolved/0 to write; backfill dry-run post-apply: 291/291 already set; live orphan scan across 4 D-07 collections: 0 orphans; backup verified in pb.backups list (1,933,496 bytes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 165 human-confirmed unit resolutions applied exactly (29 node units, 15 ambiguous + 121 null canonical units) — nothing left to the linter (01-07 sign-off entry condition)"
    requirement: DATA-05
    verification:
      - kind: other
        ref: "apply-unit-resolutions.js --apply output: 29/29 node rows + 136/136 product rows updated; 1:1 ID coverage pre-verified against live unresolved/null sets; post-run lint: missing-canonical-unit findings 123 -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "UNIQUE INDEX idx_products_name_type_ci on (name COLLATE NOCASE, type) live on both instances; rejects same-type case-variant duplicates, preserves cross-type same-name pairs (D-12)"
    requirement: DATA-04
    verification:
      - kind: other
        ref: "pb.collections.getOne('products').indexes on BOTH :8090 and :8091 returns the exact index definition; POST {name:'Olive Oil',type:'raw'} rejected with validation_not_unique; cucumber sliced transient/stored pair coexists (orchestrator-verified)"
        status: pass
    human_judgment: true
    rationale: "Index creation and duplicate-rejection test were manual PB Admin operations performed and attested by the human at the Task 3 blocking checkpoint; executor independently re-verified index presence on both instances via API"
  - id: D4
    description: "Schema export current: single canonical pb_schema.json includes the index and meal_variant_overrides; pb_schema_updated.json deleted"
    requirement: DATA-04
    verification:
      - kind: other
        ref: "grep -c idx_products_name_type_ci pb_schema.json = 1; grep -c meal_variant_overrides pb_schema.json = 1; 22 collections parsed; pb_schema_updated.json absent from tree (deletion committed in 186140f)"
        status: pass
    human_judgment: false

# Metrics
duration: ~22min active (2 human gates: merge-decisions confirmation, index human-action)
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 08: Supervised One-Shot PROD Migration Summary

**PROD migrated in one supervised shot — backup, no-op merge (zero real dupes), 210 node units normalized, all 291 products given canonical_unit/dimension (155 inferred + 136 human-confirmed), zero orphans, and the D-12 (name, type) unique index live on both instances with a consolidated single pb_schema.json export**

## Performance

- **Duration:** ~22 min active (Task 1 review gate + Task 3 human-action gate)
- **Started:** 2026-07-06T17:32:39Z (first prod find-duplicates run)
- **Completed:** 2026-07-06T17:54:59Z
- **Tasks:** 3 (1 decision checkpoint, 1 auto, 1 human-action checkpoint)
- **Files modified:** 9 (4 created, 5 modified, 1 deleted)

## Accomplishments

- **Prod backup before any mutation:** `pre-migration-plan08-2026-07-06t17-38-57-177z.zip` (1.93 MB) created via `pb.backups.create` and verified in the backup list — taken explicitly because the no-op merge path skips the script's own backup step (see Deviations)
- **Merge confirmed no-op on live prod:** find-duplicates regenerated against :8090 produced an empty decisions skeleton (0 same-type clusters); the human confirmed it at the Task 1 gate; the two intentional cross-type pairs (`cucumber sliced`, `onion (red) sliced`) were correctly quarantined and untouched
- **Normalize + backfill + worksheet applied against prod:** 210 node writes (154 alias-normalized, 56 stored-node container strings cleared), 155 canonical_units inferred, then all 165 confirmed worksheet rows applied (29/29 node units incl. `by`→`each`, 136/136 canonical_unit/dimension rows) after 1:1 ID coverage verification against live data
- **Converged end state, machine-verified:** normalize dry-run → 0 unresolved, 0 to write; backfill dry-run → 291/291 products already set; zero orphans across all four D-07 reference collections; lint findings 239 → 121 with **missing-canonical-unit 123 → 0** (the 01-07 sign-off entry condition, fully met)
- **D-12 unique index live on both instances:** `CREATE UNIQUE INDEX idx_products_name_type_ci ON products (name COLLATE NOCASE, type)` verified byte-identical on :8090 and :8091 via the collections API; same-type case-variant create rejected with `validation_not_unique`; cross-type same-name pair still coexists
- **Schema export consolidated:** single canonical `pb_schema.json` (22 collections, includes `meal_variant_overrides` and the new index); `pb_schema_updated.json` deleted per user direction

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge-decisions review** — no commit (review gate; empty decisions file confirmed by user, archived in Task 2's commit)
2. **Task 2: Prod migration (backup → merge → normalize → backfill → resolutions)** — `8054677` (feat)
3. **Task 3: Unique index + schema consolidation** — `186140f` (feat)

## Files Created/Modified

- `recipe-planner/scripts/apply-unit-resolutions.js` — applies the human-confirmed worksheet; dry-run default, pre-flight validates enum tokens and canonical_unit↔dimension consistency, aborts before any write on failure
- `.planning/phases/01-data-hygiene/01-08-dedup-decisions.json` — durable audit copy of the confirmed (empty) merge-decisions file
- `.planning/phases/01-data-hygiene/01-08-dedup-report.md` — durable audit copy of the prod dedup report (0 same-type clusters, 2 cross-type quarantined)
- `.planning/phases/01-data-hygiene/01-08-unit-resolutions.json` — durable audit copy of the 165-row confirmed worksheet (dedup-output/ is gitignored)
- `pb_schema.json` — fresh 22-collection prod export including `idx_products_name_type_ci` and `meal_variant_overrides`
- `pb_schema_updated.json` — DELETED (consolidation)
- `RECIPE-IMPORT-GUIDE.md`, `recipe-planner/scripts/{merge-products,find-duplicates}.js`, `.planning/PROJECT.md` — references updated to the single canonical export

## Prod Migration Log (all mutations explicitly PB_URL=http://192.168.50.95:8090)

| Step | Result |
|------|--------|
| 1. find-duplicates (read-only) | 0 same-type clusters → empty decisions skeleton; 2 cross-type pairs quarantined |
| 2. Task 1 gate | Human confirmed the empty decisions file ("confirm-subset") |
| 3. merge-products.js | "Loaded 0 entries, 0 confirmed — nothing to do" (no-op, no mutation) |
| 4. pb.backups.create (explicit) | `pre-migration-plan08-2026-07-06t17-38-57-177z.zip`, 1,933,496 bytes, verified in list |
| 5. normalize-node-units --apply | 445 nodes: 154 aliased, 56 container strings cleared, 210 written, 29 unresolved (exact rehearsal match) |
| 6. backfill-units --apply | 291 products: 155 inferred, 121 null (no data), 15 null (ambiguous) — exact rehearsal match |
| 7. apply-unit-resolutions --apply | pre-flight OK (165 rows valid); 29/29 node units + 136/136 canonical rows written |
| 8. Verification | find-duplicates: 0 same-type dupes; normalize dry-run: 0 unresolved; backfill dry-run: 291/291 set; orphan scan: 0 across 4 collections |
| 9. lint (tsx) | 121 findings: missing store/section 96, cross-dimension 20, prep-words 5, **missing-canonical-unit 0** (was 123) |

## Decisions Made

- **Schema-file consolidation (user-directed):** at the Task 3 checkpoint the user deleted `pb_schema_updated.json` and made `pb_schema.json` the single canonical export. **Phase verifier note:** every acceptance criterion written against `pb_schema_updated.json` (index grep, meal_variant_overrides grep) is satisfied by `pb_schema.json` instead — both greps return 1 there.
- **Worksheet order:** ran backfill before applying canonical worksheet rows (per plan notes) so live numbers stayed comparable to the rehearsal (155/121/15 identical); human rows then covered exactly the 136 nulls — backfill's idempotence guard (skip when set) means order cannot change the end state.
- **Lint cross-dimension 15 → 20:** setting canonical units on 136 previously-null products lets the cross-dimension rule fire where it previously had nothing to compare against (e.g. `onion (yellow)` = `each` with mass/volume node history). Authoring-time flags working as designed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Explicit prod backup for the no-op merge path**
- **Found during:** Task 2 (merge step)
- **Issue:** `merge-products.js` returns early ("nothing to do") when the decisions file has zero confirmed entries — BEFORE its `backupBeforeMerge()` step. With the confirmed-empty prod decisions file, the plan's backup-before-any-mutation guarantee (D-06.2, T-08-LOSS mitigation) would have been silently skipped while normalize/backfill/resolutions still mutated prod.
- **Fix:** took the snapshot explicitly via `pb.backups.create("pre-migration-plan08-…zip")` (PB-compliant lowercase+.zip name) and verified it appears in the backup list before running any mutation
- **Files modified:** none (one-off inline command; behavior documented here)
- **Verification:** backup present in `pb.backups.getFullList()`, 1,933,496 bytes
- **Committed in:** n/a (no repo change; noted in 8054677's message)

**2. [Rule 2 - Security/Convention] apply-unit-resolutions.js printed the superuser email**
- **Found during:** Task 2 (resolutions apply)
- **Issue:** the auth log line copied from merge-products.js echoed `PB_SUPERUSER_EMAIL`, violating the plan's never-print-credential-values entry condition
- **Fix:** log a fixed "Authenticated as superuser" message instead
- **Files modified:** recipe-planner/scripts/apply-unit-resolutions.js
- **Verification:** re-read of the script; no env values interpolated into any log line
- **Committed in:** 8054677

### User-Directed Deviations

**3. Schema-file consolidation (pb_schema_updated.json deleted)**
- **Found during:** Task 3 checkpoint resolution
- **Change:** plan's output spec named `pb_schema_updated.json`; user consolidated to a single `pb_schema.json` and deleted the duplicate. Deletion + fresh export committed together (186140f); living references updated (RECIPE-IMPORT-GUIDE.md, both dedup script comments, PROJECT.md); historical PLAN/RESEARCH files intentionally untouched.
- **Impact:** acceptance greps satisfied by pb_schema.json (both = 1); no functional change.

---

**Total deviations:** 2 auto-fixed (both Rule 2) + 1 user-directed
**Impact on plan:** Deviation 1 preserved the plan's central safety guarantee on the path the plan didn't anticipate (empty merge). No scope creep.

## Authentication Gates

- Superuser credentials sourced from gitignored `recipe-planner/.env.local` per 01-07 convention for: explicit backup, normalize/backfill/resolutions applies, and both-instance index verification. Values never printed or committed. No new gates — credentials were in place from Plan 07.

## Issues Encountered

None — the rehearsal-then-prod discipline worked: every prod step produced counts identical to the 01-07 rehearsal, and the only surprises (empty-merge backup skip, email in log line) were caught before/during the run and fixed.

## User Setup Required

None outstanding — index added on both instances and schema re-exported during this plan's Task 3 (human-action, completed).

## Next Phase Readiness

- Phase 1 (Data Hygiene) is complete: all 8 plans have summaries. DATA-04 and DATA-05 are done against live prod.
- Prod data layer is now unit-disciplined by construction: enum-only node units, full canonical_unit/dimension coverage, DB-enforced (name, type) uniqueness — Phase 2's persisted checkbox keys (`lineId`) and Phase 3's registry seeding build on this clean base.
- Remaining lint findings (96 missing store/section, 20 cross-dimension, 5 prep-words) are authoring-time data-quality flags for ongoing cleanup, not blockers.
- Note for later phases: the canonical schema export is `pb_schema.json` (single file); `pb_schema_updated.json` no longer exists.

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- All 4 created files + pb_schema.json exist on disk; pb_schema_updated.json confirmed deleted
- Both task commits present in git log (8054677, 186140f)
- Acceptance re-run: idx_products_name_type_ci grep = 1 and meal_variant_overrides grep = 1 in pb_schema.json; index verified live on both :8090 and :8091 via collections API; zero orphans; 0 same-type dupes; 291/291 products with canonical_unit
