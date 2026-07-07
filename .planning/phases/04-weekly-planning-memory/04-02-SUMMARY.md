---
phase: 04-weekly-planning-memory
plan: 02
subsystem: database
tags: [pocketbase, schema, typescript, weekly-planning, templates]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: pb_schema.json as the canonical schema mirror convention; gitignored recipe-planner/.env.local PB_SUPERUSER_* creds pattern established for scripted PocketBase access
provides:
  - weekly_plans.start_date (date, nullable) and weekly_plans.people_multiplier (number, default 1, min 0.1) live on both PocketBase instances
  - week_templates collection (name text required) live on both instances
  - template_slots collection (template relation required, label, count, meal_slot select REQUIRED, day select optional, pool_tags multi-relation→tags, sort_order, prefill_from_last_week) live on both instances
  - planned_meals.template_slot optional relation → template_slots, live on both instances
  - TypeScript types (WeekTemplate, TemplateSlot) and api.ts collections map entries (weekTemplates, templateSlots) matching the live schema
  - sync-to-test.js COLLECTIONS_TOP_DOWN ordering that satisfies template→slot and slot→planned_meals.template_slot dependencies
affects: [04-03, 04-04, 04-05, 04-06, 04-07, 04-08, 04-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live schema read-back verification script: parse gitignored .env.local internally within a node script placed temporarily inside recipe-planner/scripts/ (for ESM module resolution against node_modules), never expose credential values to the calling agent's transcript, delete the script after use."

key-files:
  created: []
  modified:
    - pb_schema.json
    - recipe-planner/src/lib/types.ts
    - recipe-planner/src/lib/api.ts
    - recipe-planner/scripts/sync-to-test.js

key-decisions:
  - "Live read-back verification used a temporary, self-cleaning node script (scripts/_tmp-verify-schema.mjs) that parses .env.local internally rather than exposing PB_SUPERUSER_* values to the agent shell — keeps the established gitignored-creds boundary intact while still proving the schema live on both hosts."

patterns-established:
  - "Schema verification scripts that need PB_SUPERUSER_* creds must be placed inside recipe-planner/scripts/ at run time (for pocketbase package resolution) and deleted immediately after use, never left as tracked or untracked artifacts."

requirements-completed: []  # Schema-only plan; WEEK-01/02/03 complete when their features ship in 04-05..04-09, not here.

coverage:
  - id: D1
    description: "weekly_plans.start_date (nullable date) and people_multiplier (number, default 1, min 0.1) live on both prod (:8090) and test (:8091) PocketBase instances"
    requirement: "WEEK-01"
    verification:
      - kind: other
        ref: "live schema read-back via scripts/_tmp-verify-schema.mjs (temporary, deleted after run) — zero issues on both instances"
        status: pass
    human_judgment: false
  - id: D2
    description: "week_templates and template_slots collections live on both instances, with template_slots.meal_slot marked REQUIRED matching planned_meals.meal_slot"
    requirement: "WEEK-02"
    verification:
      - kind: other
        ref: "live schema read-back via scripts/_tmp-verify-schema.mjs — meal_slot.required confirmed true on both instances"
        status: pass
    human_judgment: false
  - id: D3
    description: "planned_meals.template_slot optional relation → template_slots live on both instances"
    requirement: "WEEK-03"
    verification:
      - kind: other
        ref: "live schema read-back via scripts/_tmp-verify-schema.mjs — template_slot field present, required=false on both instances"
        status: pass
    human_judgment: false
  - id: D4
    description: "pb_schema.json mirrors every new field/collection; api.ts collections map gains weekTemplates + templateSlots; types.ts gains WeekTemplate + TemplateSlot interfaces"
    verification:
      - kind: other
        ref: "grep -c weekTemplates|templateSlots src/lib/api.ts == 2; grep -c WeekTemplate|TemplateSlot|people_multiplier|start_date src/lib/types.ts == 4"
        status: pass
    human_judgment: false
  - id: D5
    description: "sync-to-test.js COLLECTIONS_TOP_DOWN lists week_templates then template_slots before weekly_plans/planned_meals"
    verification:
      - kind: other
        ref: "node -e ordering check (indexOf week_templates < template_slots < weekly_plans) exits 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "npm run build (tsc) passes with the new types; pre-existing Wave-0 RED test scaffolds from 04-01 are unaffected"
    verification:
      - kind: other
        ref: "npm run build — 8 pre-existing errors confined to aggregation-multiplier.test.ts, history.test.ts, units.test.ts (04-01 scaffolds pending 04-03/04-04/04-08); zero errors in types.ts, api.ts, or sync-to-test.js"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-07
status: complete
---

# Phase 04 Plan 02: Weekly Planning Schema Foundation Summary

**Live PocketBase schema for weekly_plans.start_date/people_multiplier, week_templates, template_slots, and planned_meals.template_slot on both prod/test, mirrored into pb_schema.json/types.ts/api.ts/sync-to-test.js**

## Performance

- **Duration:** ~20 min active work (split across two sessions by the Task 1 human-action checkpoint: ~3 min pre-checkpoint mirror work, ~17 min post-checkpoint live verification + build gate)
- **Started:** 2026-07-07T19:07:07Z
- **Completed:** 2026-07-07T19:24:03Z
- **Tasks:** 2 (1 checkpoint:human-action, 1 auto)
- **Files modified:** 4

## Accomplishments
- Human confirmed manual creation of all Phase 4 schema fields/collections on both PocketBase instances (prod :8090, test :8091)
- Live read-back verification against both instances confirmed 100% match with the field spec — zero divergences on names, types, required flags, or the meal_slot enum
- `pb_schema.json` mirrors the two weekly_plans fields, week_templates, template_slots, and planned_meals.template_slot
- `types.ts` gained `WeekTemplate` and `TemplateSlot` interfaces plus the extended `WeeklyPlan`/`PlannedMeal` fields
- `api.ts` collections map gained `weekTemplates`/`templateSlots`
- `sync-to-test.js` insertion order satisfies both the template→slot and slot→planned_meals.template_slot dependency chains
- `npm run build` (tsc) passes for all code touched by this plan

## Task Commits

Both tasks were committed in the prior session before this checkpoint resume:

1. **Task 1: Human creates Phase 4 schema in both PocketBase instances** - checkpoint:human-action, no code commit (manual admin-UI work); paused state recorded in `2f3ceb1`
2. **Task 2: Verify live schema, mirror pb_schema.json, extend types + api + sync order** - `5f144a0` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `pb_schema.json` - Added weekly_plans.start_date/people_multiplier fields, week_templates collection, template_slots collection, planned_meals.template_slot field
- `recipe-planner/src/lib/types.ts` - Extended `WeeklyPlan` (start_date, people_multiplier), `PlannedMeal` (template_slot); added `WeekTemplate`, `TemplateSlot` interfaces
- `recipe-planner/src/lib/api.ts` - Added `weekTemplates: "week_templates"` and `templateSlots: "template_slots"` to the collections map
- `recipe-planner/scripts/sync-to-test.js` - Inserted `week_templates` then `template_slots` into `COLLECTIONS_TOP_DOWN` immediately after `step_to_product_edges` and before `weekly_plans`

## Decisions Made
- Live read-back verification used a self-cleaning temporary script (`recipe-planner/scripts/_tmp-verify-schema.mjs`) rather than a permanent script, because it exists solely to prove this one-time schema-creation gate and has no reuse value once the schema is live. It was deleted immediately after the verification run; `git status` confirms the working tree has no trace of it.
- The script parses `.env.local` internally (inside the node process) rather than sourcing it in the calling shell, preserving the established boundary that superuser credential values never appear in agent-visible command output.

## Deviations from Plan

None - plan executed exactly as written. The live PocketBase instances (LAN IPs 192.168.50.95:8090/8091) were reachable from this environment, so the read-back verification in Task 2 ran directly against both instances rather than being deferred.

## Issues Encountered
None. The verification script's `pocketbase` import required the script to be temporarily co-located inside `recipe-planner/scripts/` for Node ESM resolution against `node_modules` (the scratchpad directory has no access to the project's installed packages) — resolved by copying the script in, running it, and deleting it immediately after, with a follow-up `git status` confirming zero residue.

## User Setup Required

None for this continuation — the manual PocketBase admin-UI schema creation (the actual user setup for this plan) was completed and confirmed in the prior session before this resume.

## Next Phase Readiness
- Schema foundation is live and verified on both prod and test PocketBase instances; all downstream Phase 4 plans (multiplier plumbing 04-03, LRU history 04-04, backfill 04-05, wizard 04-06/04-07, seed 04-08/04-09) can now build against `WeekTemplate`, `TemplateSlot`, `WeeklyPlan.start_date`/`people_multiplier`, and `PlannedMeal.template_slot` with confidence the live schema matches the TypeScript types.
- No blockers. `start_date` remains nullable by design until 04-05's backfill tightens it to required.
- The 8 pre-existing tsc errors in `aggregation-multiplier.test.ts`, `history.test.ts`, and `units.test.ts` are intentional Wave-0 RED scaffolds from 04-01, expected to turn GREEN across 04-03/04-04/04-08 — not a regression introduced here.

## Self-Check: PASSED

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-07*
