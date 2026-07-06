---
phase: 01-data-hygiene
plan: 02
subsystem: data-hygiene-tooling
tags: [pocketbase, dedup, scripts, node]

requires:
  - phase: 01-data-hygiene (plan 01)
    provides: vitest harness + units.ts foundation (sequential context; no direct code dependency)
provides:
  - "Extended find-duplicates.js emitting a Markdown context report + JSON decisions skeleton, with cross-type collisions quarantined"
  - "merge-products.js: destructive one-shot merge with backup, pre-flight ID validation, repoint, and zero-orphan safety net"
affects: [01-08 (supervised prod dedup run consumes both scripts)]

tech-stack:
  added: []
  patterns:
    - "Destructive-script safety net: authenticate -> pre-flight validate -> backup -> repoint -> zero-orphan verify -> delete, each step gating the next"
    - "Generated review artifacts (JSON decisions + companion MD report) as the human-in-the-loop review format for one-shot data migrations"

key-files:
  created:
    - recipe-planner/scripts/merge-products.js
  modified:
    - recipe-planner/scripts/find-duplicates.js
    - recipe-planner/.gitignore

key-decisions:
  - "D-05 review format implemented as a JSON decisions skeleton ({dupeId, survivorId, confirmed, name, cluster}) plus a companion Markdown context report, both written to scripts/dedup-output/ (gitignored, regenerated per run)"
  - "Cross-type same-name collisions (transient/stored pairs) are computed and reported in a separate MD section but never enter the JSON decisions array or the merge-candidate set (D-12, Pitfall #1)"
  - "merge-products.js hardcodes the four D-07 reference collections/fields as a const rather than deriving them from pb_schema_updated.json, which is confirmed stale (omits meal_variant_overrides)"
  - "PB_URL env var (default prod) lets both scripts be pointed at the test instance for the D-06 rehearsal without code changes"

requirements-completed: [DATA-04]

coverage:
  - id: D1
    description: "find-duplicates.js emits a Markdown context report and a JSON decisions skeleton ({dupeId, survivorId, confirmed}) with type-aware cross-type collision flagging"
    requirement: DATA-04
    verification:
      - kind: other
        ref: "node --check scripts/find-duplicates.js && grep writeFileSync/confirmed/type (Task 1 acceptance criteria, all passed)"
        status: pass
    human_judgment: true
    rationale: "Static checks confirm the script parses and contains the required structural markers, but correctness of reference counts and cross-type quarantine behavior against real duplicate data can only be confirmed by an actual run against prod, which is scoped to Plan 08."
  - id: D2
    description: "merge-products.js reads only the JSON decisions file, backs up prod, pre-flight-validates every ID, repoints all four product-referencing relations, verifies zero orphans, then deletes"
    requirement: DATA-04
    verification:
      - kind: other
        ref: "node --check scripts/merge-products.js && grep backups.create/meal_variant_overrides/authWithPassword (Task 2 acceptance criteria, all passed)"
        status: pass
    human_judgment: true
    rationale: "This is a destructive script that is deliberately not auto-run in this plan; the true correctness of its merge behavior is exercised in the supervised Plan 08 test-instance rehearsal before any prod run, not here."

duration: 15min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 2: Dedup Tooling (find-duplicates.js + merge-products.js) Summary

**Extended find-duplicates.js to emit reviewable JSON+MD dedup artifacts with type-aware cross-type quarantine, and built merge-products.js as a fully safety-netted one-shot destructive merge script — neither script mutates prod in this plan.**

## Performance

- **Duration:** 15 min
- **Completed:** 2026-07-06T07:00:59Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `find-duplicates.js` now writes `scripts/dedup-output/dedup-report.md` and `scripts/dedup-output/dedup-decisions.json`, computing live per-collection reference counts across all four D-07 collections for every merge-candidate cluster
- Cross-type same-name collisions (the known `onion (red) sliced` and `cucumber sliced` transient/stored pairs) are detected, reported in a clearly-labelled separate MD section, and excluded from the JSON decisions skeleton entirely
- `merge-products.js` created from scratch: superuser auth, pre-flight ID + type-match validation, `pb.backups.create()` gate, repoint across the four D-07 collections, zero-orphan re-query, then delete — each step throws and aborts before the next if it fails

## Task Commits

1. **Task 1: Extend find-duplicates.js to emit JSON + MD with type-aware flagging** - `29a45e3` (feat)
2. **Task 2: Create merge-products.js (backup, pre-flight validation, repoint, orphan-check, delete)** - `8cb71a9` (feat)

## Files Created/Modified
- `recipe-planner/scripts/find-duplicates.js` - Extended to write MD + JSON review artifacts, with type-aware cross-type collision quarantine and live D-07 reference counting
- `recipe-planner/scripts/merge-products.js` - New: reads confirmed JSON decisions, authenticates as superuser, validates, backs up, repoints, verifies zero orphans, deletes
- `recipe-planner/.gitignore` - Added `scripts/dedup-output/` (generated review artifacts, regenerated per run)

## Decisions Made
- Output location: `recipe-planner/scripts/dedup-output/{dedup-report.md,dedup-decisions.json}` — kept alongside the scripts that produce/consume them, gitignored since they're regenerated per run and contain a point-in-time snapshot of live data
- JSON skeleton emits one entry per non-survivor member of each same-type cluster (not one per cluster), each carrying the full `cluster` ID list for context — keeps `merge-products.js`'s consumption model simple (filter by `confirmed && survivorId`) while giving the human reviewer full cluster visibility in each entry
- `merge-products.js` re-fetches products live during pre-flight (not trusting the JSON's `name` field) so a stale decisions file can't sneak a since-deleted or since-renamed ID past validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` env vars are consumed at run time by `merge-products.js` but are not needed until the Plan 08 supervised run.

## Next Phase Readiness
- Both scripts are built and pass static verification (`node --check`, structural grep checks); neither has been run against live prod data in this plan by design
- Plan 08 (supervised prod run) will: run `find-duplicates.js` against prod, have the human edit/confirm `dedup-decisions.json`, rehearse `merge-products.js` against test (`PB_URL=http://192.168.50.95:8091`) after a fresh `sync-to-test.js` copy, then run it against prod for real
- No blockers for subsequent Phase 1 plans (unit normalization, aggregation fix, linter) — this plan's deliverables are self-contained tooling with no other plan depending on their runtime output yet

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/find-duplicates.js
- FOUND: recipe-planner/scripts/merge-products.js
- FOUND: commit 29a45e3
- FOUND: commit 8cb71a9
