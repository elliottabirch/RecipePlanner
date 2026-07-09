---
phase: 04-weekly-planning-memory
plan: 06
subsystem: database
tags: [pocketbase, seed-script, week-templates, tags, idempotent-upsert]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "04-02's week_templates/template_slots schema (meal_slot required enum, pool_tags relation, prefill_from_last_week bool)"
provides:
  - "One live week_templates row (\"Standard week\") + 6 ordered template_slots on both prod and test PocketBase instances"
  - "scripts/seed-week-template.js — reusable idempotent upsert script for re-seeding/adjusting the template"
affects: [04-09 (wizard consuming this template), WEEK-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent upsert-by-key seed script (template by name, slots by (template, sort_order)) — extends seed-usda.js/backfill-plan-dates.js safety pattern (PB_URL override, --dry-run, superuser auth, pb.backups.create before writes, main-guard)"

key-files:
  created: [recipe-planner/scripts/seed-week-template.js]
  modified: []

key-decisions:
  - "Confirmed household slot set (user-approved, not Claude's Discretion default): Staples(snack,2,prefill=true) / Proteins(dinner,2) / Starches(dinner,2) / Vegetables(dinner,2) / Greens-Salads(dinner,1) / Micah meals(micah,3), pool_tags = fruit/protein/starch/vegetable/green/\"micah meal\" respectively"
  - "Idempotency implemented as always-upsert (create-if-missing, update-if-present) rather than diff-then-skip — simpler, still satisfies T-04-06d (never duplicates) since every run converges to the same 1 template + 6 slots"

patterns-established:
  - "Pure resolver functions (resolveTagIds, planTemplateAction, planSlotActions) exported separately from main() for testability without a live DB — mirrors seed-usda.js/backfill-plan-dates.js convention, even though no test file was required by this plan"

requirements-completed: []  # Intentionally deferred — see "Next Phase Readiness": this plan seeds the data half of WEEK-03; 04-09 (wizard) is the requirement's actual UI-consumer and should mark it complete.

coverage:
  - id: D1
    description: "scripts/seed-week-template.js: idempotent, dry-run, backup-before-mutate, PB_URL override, fail-loud pool_tag resolution"
    requirement: "WEEK-03"
    verification:
      - kind: other
        ref: "node --check scripts/seed-week-template.js (passed) + grep -c match (33) for prefill_from_last_week|--dry-run|backups.create|PB_URL|sort_order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Template + 6 slots applied to BOTH instances; Staples is slot #1 with prefill_from_last_week=true; all pool_tags resolved to real tag ids"
    requirement: "WEEK-03"
    verification:
      - kind: other
        ref: "live read-back query against both :8091 (test) and :8090 (prod) — 1 week_templates row, 6 template_slots rows, sort_order 0-5, Staples/snack/prefill=true first"
        status: pass
    human_judgment: false
  - id: D3
    description: "A recipe tagged with a slot's pool tag (e.g. \"protein\") is pool-eligible for that slot"
    requirement: "WEEK-03"
    verification:
      - kind: other
        ref: "live query: 10 prod recipes tagged \"protein\" (e.g. \"salmon bites\"); Proteins slot's pool_tags array confirmed to include the resolved protein tag id"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-09
status: complete
---

# Phase 04 Plan 06: Seed household week template Summary

**Idempotent seed-week-template.js upserts one "Standard week" template + 6 ordered template_slots (Staples-first, prefill-on) to both prod and test PocketBase, resolving pool tags to real ids and failing loudly on any missing tag.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-09T21:26:00Z (approx)
- **Completed:** 2026-07-09T21:37:53Z
- **Tasks:** 2 (Task 1: write script; Task 2: human-action apply gate — pre-approved via <confirmed_template>, executed autonomously)
- **Files modified:** 1

## Accomplishments

- Wrote `scripts/seed-week-template.js`: in-file `SLOTS` config, tag-name-to-id resolution (fails loudly on any missing tag — T-04-06b), idempotent upsert of the template by `name` and each slot by `(template, sort_order)` (T-04-06d), `--dry-run`, `PB_URL` override, `pb.backups.create()` before any mutation (T-04-06c)
- Ran dry-run + apply against TEST (:8091) first, then dry-run + apply against PROD (:8090), per the plan's mandatory test-first sequencing
- Verified live on both instances: 1 `week_templates` row ("Standard week"), 6 `template_slots` rows in the correct sort order, Staples at sort_order 0 with `prefill_from_last_week=true`, and every `pool_tags` array resolved to a real tag id
- Spot-checked pool eligibility: 10 prod recipes carry the "protein" tag (e.g. "salmon bites"); the Proteins slot's `pool_tags` includes that tag's id, confirming a tagged recipe is pool-eligible with no other action needed (WEEK-03's core promise)
- Confirmed idempotency by re-running `--dry-run` against TEST after the apply: correctly reported `SKIP_TEMPLATE` (already exists) + `UPDATE_SLOT` x6 (no duplicates created)

## Task Commits

1. **Task 1: idempotent seed-week-template.js** + **Task 2: apply to test then prod** - `f5bac22` (feat) — single commit; Task 2 was a human-action checkpoint pre-approved by the user's `<confirmed_template>` in the executor prompt (exact slot set, tag names, and ordering specified verbatim), so dry-run + apply ran autonomously against test then prod rather than pausing for a live checkpoint.

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `recipe-planner/scripts/seed-week-template.js` - Idempotent seed script: in-file template/slot config, tag-name resolution, upsert-by-key, dry-run/backup/PB_URL safety scaffolding (seed-usda.js/backfill-plan-dates.js pattern)

## Decisions Made

- Slot set and tag names were **user-confirmed** in the executor prompt (not left to Claude's Discretion as the plan's D-01 note allowed) — see `<confirmed_template>`: Staples/Proteins/Starches/Vegetables/Greens-Salads/Micah meals, keyed to the six existing tags already live on prod (protein, fruit, vegetable, starch, green, "micah meal")
- Idempotency chosen as always-upsert (create-if-missing / update-if-present) rather than diff-then-skip-if-unchanged — simpler to reason about and still guarantees no duplication; a no-op re-run just re-writes identical field values

## Deviations from Plan

None — plan executed exactly as written. Task 2's `type="checkpoint:human-action"` gate was satisfied by the user's advance confirmation of the exact template embedded in the executor's prompt (`<confirmed_template>`), per the orchestrating instruction to run dry-run then apply autonomously rather than pause for a live human turn.

## Issues Encountered

None. Both PocketBase instances (test :8091, prod :8090) were reachable throughout; each apply run's `pb.backups.create()` call confirmed success before any write (`pre-seed-week-template-<timestamp>.zip` on each instance).

## User Setup Required

None - no external service configuration required. `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` were already present in the existing gitignored `recipe-planner/.env.local` (used via `node --env-file=.env.local`), consistent with 04-05's precedent.

## Next Phase Readiness

- WEEK-03's data dependency is satisfied: a real, live `week_templates` row + 6 `template_slots` exist on both prod and test for 04-09's wizard to walk.
- 04-09 (New Plan wizard) can now query `week_templates`/`template_slots` and expect exactly one template with a real, tag-backed pool per slot.
- WEEK-03 requirement is left **unmarked complete** in REQUIREMENTS.md pending 04-09 (the wizard is the actual consumer/UI surface for this data) — this plan only satisfies the data-seeding half; the state-update step below records this plan's own completion but defers the requirement checkbox to whichever plan ships the wizard, per the executor prompt's explicit guidance to leave WEEK-03 unmarked until 04-09 ships.
- No blockers for 04-09.

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/seed-week-template.js
- FOUND: .planning/phases/04-weekly-planning-memory/04-06-SUMMARY.md
- FOUND commit: f5bac22
