---
phase: 01-data-hygiene
plan: 05
subsystem: data
tags: [pocketbase, node-scripts, units, docs]

# Dependency graph
requires:
  - phase: 01-data-hygiene (Plan 01)
    provides: units.ts (Unit/Dimension vocabulary, normalizeUnit, UNIT_ALIASES, getDimension)
provides:
  - "recipe-planner/scripts/normalize-node-units.js — one-shot node.unit alias normalization + stored-node container-string clearing + unresolved report"
  - "recipe-planner/scripts/backfill-units.js — canonical_unit/dimension inference with ambiguous-left-null review report"
  - "decisions.md reconciled to signature-based step aggregation, updated ingredient-handling wording, and D-02 container revisit trigger note"
affects: ["01-06", "01-07", "01-08"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scripts import units.ts directly via Node 24 native TS stripping (`import { normalizeUnit } from \"../src/lib/units.ts\"`) — no transpile step needed, matches scripts/lint.js precedent"
    - "Dry-run-by-default / --apply-to-write pattern for all mutating one-shot scripts, PB_URL-targetable for D-06 test rehearsal"
    - "Never-guess reporting: unresolvable/ambiguous values are written to scripts/dedup-output/*.md (gitignored) rather than silently dropped or guessed"

key-files:
  created:
    - recipe-planner/scripts/normalize-node-units.js
    - recipe-planner/scripts/backfill-units.js
  modified:
    - decisions.md

key-decisions:
  - "Container-type-string clearing in normalize-node-units.js is scoped exactly to stored-type product nodes per the plan/D-01; container strings found on raw/inventory-type nodes are reported as unresolved rather than silently cleared, since the plan's D-01/D-03 container-overload scope was defined for stored products only"
  - "backfill-units.js picks the most-frequent normalized unit (deterministic tie-break: count desc, then alphabetical) as canonical_unit when a product's node history maps to exactly one dimension; ambiguous (multi-dimension) or empty histories are left null, never guessed"
  - "backfill-units.js is idempotent — skips any product that already has canonical_unit set, so re-running after a partial apply never clobbers existing values"

patterns-established:
  - "Manual-review reports for one-shot data scripts live in scripts/dedup-output/ (already gitignored) alongside find-duplicates.js's existing report convention"

requirements-completed: [DATA-05, DATA-07]

coverage:
  - id: D1
    description: "decisions.md reconciled: step aggregation described as input/output-signature match, not exact-name match; stale ingredient-handling line updated; D-02 container revisit trigger recorded"
    requirement: "DATA-07"
    verification:
      - kind: other
        ref: "grep -in \"exact string match\" decisions.md | grep -iv \"product name\" (empty) && grep -qi signature decisions.md && grep -qi container decisions.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalize-node-units.js: alias-normalizes node units, clears container-type strings off stored nodes, reports unresolved values, dry-run-safe"
    requirement: "DATA-05"
    verification:
      - kind: other
        ref: "node --check scripts/normalize-node-units.js; dry-run run against test PB (443 nodes: 153 aliased, 56 container-cleared, 29 unresolved)"
        status: pass
    human_judgment: false
  - id: D3
    description: "backfill-units.js: infers canonical_unit/dimension per product from node-unit history, leaves ambiguous/no-data products null"
    requirement: "DATA-05"
    verification:
      - kind: other
        ref: "node --check scripts/backfill-units.js; dry-run run against test PB (290 products: 154 inferred, 121 no-data, 15 ambiguous)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 5: Node-Unit Normalization + Canonical Backfill Scripts Summary

**Built (not yet run against prod) normalize-node-units.js and backfill-units.js — dry-run-safe scripts that clean the messy live 445-record node-unit corpus and infer per-product canonical units, plus reconciled decisions.md to the code's real signature-based step aggregation.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-06T07:35:01Z
- **Tasks:** 3
- **Files modified:** 3 (1 doc edit, 2 new scripts)

## Accomplishments

- `decisions.md` no longer describes step aggregation as exact-name matching anywhere (including a previously-unlisted "Step Node" data-model bullet found during verification) — all locations now describe the real `createStepSignature` input/output-ID-signature behavior
- `decisions.md`'s stale "no conversion layer needed" line replaced with an accurate description of the `units.ts` within-dimension conversion layer
- D-02's per-node container-type revisit trigger recorded as an explicit, deliberate-deferral note in `decisions.md`
- `normalize-node-units.js` normalizes alias/spelling-variant node units via `units.ts`'s `normalizeUnit`, clears container-type strings off `stored`-type nodes without aliasing them to a measurement unit, and reports every genuinely unresolvable value instead of guessing
- `backfill-units.js` infers `canonical_unit` (and derives `dimension` from it, never independently) per product from that product's normalized node-unit history, leaving ambiguous or data-free products null for the linter to surface

## Task Commits

1. **Task 1: Reconcile decisions.md with signature-based step aggregation + D-02 note** - `add4882` (docs)
2. **Task 2: Create normalize-node-units.js (alias map + container clearing + unresolved report)** - `3ce3f98` (feat)
3. **Task 3: Create backfill-units.js (canonical_unit + dimension inference)** - `ccb4f4f` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `decisions.md` - Step Model/Step Aggregation/Aggregation sections and the Step Node data-model bullet now describe input/output-ID-signature merging; Ingredient Handling describes the new conversion layer; new "Container Type Granularity (Revisit Trigger)" subsection records D-02
- `recipe-planner/scripts/normalize-node-units.js` - One-shot `recipe_product_nodes.unit` cleanup: alias normalization via `units.ts`, stored-node container-string clearing, unresolved-value report to `scripts/dedup-output/normalize-node-units-unresolved.md`; `--dry-run` default, `--apply` to write, `PB_URL`-targetable
- `recipe-planner/scripts/backfill-units.js` - One-shot `products.canonical_unit`/`dimension` inference from node-unit history; ambiguous/no-data review report to `scripts/dedup-output/backfill-units-review.md`; same dry-run/apply/PB_URL conventions

## Decisions Made

- **Container-clearing scope stays exactly `stored`-type nodes, per plan/D-01.** Live-data verification (dry-run against test PB) showed most container-type strings actually sit on `raw`/`inventory`-type nodes, not `stored` — but D-01 explicitly scoped the container-type-as-unit overload fix to `stored` products this phase, and the plan's acceptance criteria say the same. Rather than silently widening scope to `raw`/`inventory` (an undiscussed architectural expansion), those cases are routed into the unresolved-values report for human review at Plan 08's supervised run. This is a deliberate scope-preserving choice, not an oversight — flagged here for visibility since it means the unresolved list is larger (29 entries) than a first read of the phase doc might suggest.
- **canonical_unit selection heuristic:** most-frequently-used normalized unit within the product's single inferred dimension, tie-broken alphabetically for determinism. Not specified exactly by the plan text beyond "pick a sensible canonical unit" — this is the natural "matches how the product is actually used" choice and stays fully deterministic regardless of node fetch order.
- **Idempotent backfill:** `backfill-units.js` skips any product whose `canonical_unit` is already set, so it can be safely re-run (e.g. after a partial `--apply` failure) without clobbering prior results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed an additional stale "exact string match" reference in decisions.md not called out in the plan's read_first list**
- **Found during:** Task 1 verification loop
- **Issue:** The plan's acceptance criteria require `grep -in "exact string match" decisions.md` to return no line describing step aggregation. After editing the three explicitly-listed locations, a fourth stale reference remained in the "Step Node" data-model bullet (`**Name** (key for aggregation; exact string match)`), which the read_first list didn't enumerate but which the grep-based acceptance criterion would still catch.
- **Fix:** Updated the bullet to describe the Step Node name as a display-only label, with aggregation keyed by the input/output product-ID signature.
- **Files modified:** decisions.md
- **Verification:** `grep -in "exact string match" decisions.md | grep -iv "product name"` now returns nothing (verified before commit).
- **Committed in:** add4882 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix necessary to satisfy the plan's own stated acceptance criteria)
**Impact on plan:** No scope creep — this closes a gap the plan's acceptance grep would have caught anyway; fixing it during Task 1 kept the verification loop passing on the first check rather than requiring a second pass.

## Issues Encountered

None. Both scripts were sanity-checked via `--dry-run` against the live test PocketBase instance (`192.168.50.95:8091`, reachable and unaffected by dry-run) to confirm they run cleanly against real data shapes without errors, in addition to the plan's required `node --check` static verification. No prod data was touched — both scripts default to dry-run and require an explicit `--apply` flag, per D-08/D-06.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `normalize-node-units.js` and `backfill-units.js` exist, pass `node --check`, and have been dry-run-verified against live test data — ready for Plan 08's supervised prod run (after backup + merge-products.js).
- `decisions.md` is now accurate to the shipped `createStepSignature` behavior; no code changes were needed for DATA-07, only documentation.
- Note for Plan 08: the normalize script's unresolved report will list ~29 items on current data, including container-type strings on `raw`/`inventory`-type nodes (not just the genuine junk values `by`/`chile`/`medium`/`large`/`28oz cans`) — these need manual review since they were out of this plan's `stored`-only scope for automatic clearing.

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/normalize-node-units.js
- FOUND: recipe-planner/scripts/backfill-units.js
- FOUND: decisions.md
- FOUND: .planning/phases/01-data-hygiene/01-05-SUMMARY.md
- FOUND commit: add4882 (Task 1)
- FOUND commit: 3ce3f98 (Task 2)
- FOUND commit: ccb4f4f (Task 3)
- FOUND commit: abc4dca (SUMMARY)
- All plan-level `<verification>` commands re-run and passing: `node --check` on both scripts, `decisions.md` grep checks
