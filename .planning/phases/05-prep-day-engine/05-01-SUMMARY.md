---
phase: 05-prep-day-engine
plan: 01
subsystem: database
tags: [pocketbase, typescript, schema-migration, scheduler]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: additive-nullable schema migration precedent (add-product-nutrition-fields.js), gitignored .env.local superuser-cred pattern, consolidated pb_schema.json at repo root
  - phase: 02-shopping-state-live-substitution
    provides: shopping_state collection as the (weekly_plan, key)-unique-indexed new-collection template
provides:
  - 7 new nullable recipe_steps fields (active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots) live on both PocketBase instances
  - cook_progress collection (D-03), unique-indexed on (weekly_plan, step_instance)
  - scheduler_config collection (D-04, singleton) seeded with active-boosted default weights (D-06)
  - RecipeStep/CookProgress/SchedulerConfig TypeScript types
  - collections.cookProgress / collections.schedulerConfig registered in api.ts
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11, 05-12, scheduler, cook-mode, recipe-editor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent PocketBase schema-migration script targeting one instance per invocation via PB_URL env override (test :8091 rehearsal, prod :8090 default), matching add-product-nutrition-fields.js precedent"
    - "pb.collections.create()/update() driven schema application (vs. Phase 2's manual-admin-UI shopping_state precedent) — proven safe via existence-checks + before/after field-preservation assertions"

key-files:
  created:
    - recipe-planner/scripts/apply-phase5-schema.mjs
  modified:
    - pb_schema.json
    - recipe-planner/src/lib/types.ts
    - recipe-planner/src/lib/api.ts

key-decisions:
  - "pb_schema.json canonical mirror lives at repo root, not recipe-planner/pb_schema.json — plan's files_modified path was stale; corrected in place, no duplicate file created"
  - "rack_slots 'default 1' (D-05) enforced at the application layer (RecipeEditor/backfill), not a PocketBase schema-level default — this PB version's field schema has no `default` property"
  - "Script targets one instance per invocation via PB_URL env override rather than looping both internally, matching the established add-product-nutrition-fields.js/seed-week-template.js convention"

requirements-completed: [PREP-01, PREP-03, PREP-04, PREP-05]

coverage:
  - id: D1
    description: "recipe_steps carries all 7 new nullable fields on both PB instances; existing 185 steps validate unchanged"
    requirement: PREP-01
    verification:
      - kind: integration
        ref: "apply-phase5-schema.mjs run against :8091 and :8090 (verified live), plus a live round-trip write/read/revert on :8091 confirming all 7 fields persist and read back correctly"
        status: pass
    human_judgment: false
  - id: D2
    description: "cook_progress and scheduler_config collections exist on both PB instances"
    requirement: PREP-03
    verification:
      - kind: integration
        ref: "apply-phase5-schema.mjs collection-creation calls, confirmed via node -e schema assertion against pb_schema.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly one scheduler_config record exists with weights.active strictly greater than every other weight"
    requirement: PREP-05
    verification:
      - kind: integration
        ref: "curl GET :8091/api/collections/scheduler_config/records — totalItems=1, weights={active:8,chopping:3,grouping:3,elapsed:4,resource_pressure:3}"
        status: pass
    human_judgment: false
  - id: D4
    description: "RecipeStep/CookProgress/SchedulerConfig types compile and match the live schema field names"
    requirement: PREP-04
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean, no errors)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Script is idempotent — re-running produces a no-op on both instances"
    verification:
      - kind: integration
        ref: "apply-phase5-schema.mjs run twice against :8091 and twice against :8090; second run of each prints 'already present/exists — no-op' for every field/collection/record"
        status: pass
    human_judgment: false
  - id: D6
    description: "No lead_time_minutes field exists anywhere (D-02 cut)"
    verification:
      - kind: unit
        ref: "grep -c lead_time_minutes pb_schema.json — 0 matches"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-09
status: complete
---

# Phase 5 Plan 01: Prep-Day Engine Schema Foundation Summary

**Additive-nullable PocketBase schema (7 recipe_steps fields + cook_progress + scheduler_config) applied idempotently to both prod/test instances, seeded with active-boosted default GA weights, and mirrored into TypeScript types + the collections map**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-09T23:42:18Z
- **Completed:** 2026-07-10T00:07:00Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Wrote an idempotent Node ESM migration script (`apply-phase5-schema.mjs`) that authenticates as PocketBase superuser (creds sourced from gitignored `.env.local` at runtime, never printed) and additively extends `recipe_steps` with 7 nullable fields, creates `cook_progress` (unique-indexed on `weekly_plan`+`step_instance`), creates `scheduler_config` (singleton), and seeds exactly one default-weights record
- Applied the script to both the test (`:8091`) and prod (`:8090`) PocketBase instances, running each twice to prove no-op idempotency before and after the real prod write (satisfies the threat model's T-05-01a mitigation)
- Re-exported the live test-instance schema to the canonical `pb_schema.json` mirror (repo root — corrected from the plan's stale `recipe-planner/pb_schema.json` path)
- Extended `RecipeStep` with the 7 new optional fields and added `CookProgress`/`SchedulerConfig` interfaces to `types.ts`, both citing their originating decision IDs
- Registered `collections.cookProgress` / `collections.schedulerConfig` in `api.ts`'s collections map
- Live round-trip verified: wrote all 7 new fields to a real `recipe_steps` record on `:8091`, confirmed exact read-back, then reverted to null so downstream backfill (05-02) sees a clean slate

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply additive-nullable schema to both PocketBase instances** - `cfb592c` (feat)
2. **Task 2: Extend RecipeStep and add CookProgress + SchedulerConfig types** - `f26eb79` (feat)
3. **Task 3: Register cook_progress + scheduler_config in the collections map** - `6412e17` (feat)

## Files Created/Modified
- `recipe-planner/scripts/apply-phase5-schema.mjs` - Idempotent schema-migration script (recipe_steps fields + 2 new collections + singleton seed), targets one PB instance per invocation via `PB_URL` env override
- `pb_schema.json` - Re-exported live schema mirror (repo root) — now 27 collections, includes the 7 new `recipe_steps` fields and the two new collections
- `recipe-planner/src/lib/types.ts` - `RecipeStep` extended with 7 optional fields; new `CookProgress`/`SchedulerConfig` interfaces
- `recipe-planner/src/lib/api.ts` - `collections.cookProgress`/`collections.schedulerConfig` added

## Decisions Made
- **pb_schema.json's real location is the repo root**, not `recipe-planner/pb_schema.json` as the plan's frontmatter stated — verified via `find`, confirmed as the Phase-1-Plan-08 consolidation target. Fixed in place (Rule 3 — blocking issue) rather than creating a stray duplicate file inside `recipe-planner/`.
- **`rack_slots`'s "default 1"** is not expressible as a PocketBase schema-level default in this PB version (zero `"default"` keys anywhere in the existing schema mirror) — documented in the script as an application-layer concern for the RecipeEditor/backfill plans (05-02/05-03) to enforce at write time.
- **Script scopes to one instance per invocation** (via `PB_URL` env override, defaulting to prod) rather than looping both internally, matching every prior schema-migration script in this codebase (`add-product-nutrition-fields.js`, `seed-week-template.js`) — kept the new script consistent with established convention rather than introducing a new dual-target shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected pb_schema.json's actual path**
- **Found during:** Task 1 (writing the schema-migration script's re-export step)
- **Issue:** The plan's frontmatter/task text referenced `recipe-planner/pb_schema.json`, but the file that actually exists (and is referenced by every other phase's precedent) lives at the repo root (`/home/ellio/code/RecipePlanner/pb_schema.json`)
- **Fix:** Pointed the script's `SCHEMA_MIRROR_PATH` at the real root-level file; did not create a second file inside `recipe-planner/`
- **Files modified:** `recipe-planner/scripts/apply-phase5-schema.mjs` (path resolution only), `pb_schema.json` (re-exported in place)
- **Verification:** `find . -iname pb_schema*.json` confirms a single file; re-export wrote 27 collections to it; verify command's `require('./pb_schema.json')` (relative to `recipe-planner/`) would NOT resolve — see Issues Encountered below for how the plan's literal verify command was adapted
- **Committed in:** `cfb592c` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking path correction)
**Impact on plan:** Necessary correctness fix — the plan's literal path did not exist in the repo. No scope creep; every other Task 1 deliverable (script behavior, field list, collections, singleton weights) matches the plan exactly.

## Issues Encountered
- The plan's `<verify><automated>` command runs `node -e "const s=require('./pb_schema.json'); ..."` from inside `recipe-planner/`, which would fail to resolve since the real file is one directory up. Ran the equivalent assertion directly against the correct absolute path instead (`require('/home/ellio/code/RecipePlanner/pb_schema.json')`) — same logic, same pass result (`schema ok`), just pointed at the file that actually exists.
- No PocketBase-integration test harness exists in this repo (confirmed via 05-RESEARCH.md's Validation Architecture section), so the "manual/UAT: edit a step in the editor... confirm the 7 fields round-trip" verification step doesn't yet have a RecipeEditor UI to exercise (that UI lands in a later plan, 05-03 per 05-PATTERNS.md). Substituted a direct live-API round-trip write/read/revert against `:8091` to prove the schema-level round-trip now; the RecipeEditor UI itself will get its own verification when 05-03 lands.

## User Setup Required

None - no external service configuration required. `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` were already present in the existing gitignored `recipe-planner/.env.local`, consistent with prior phases' precedent.

## Next Phase Readiness
- Schema foundation is live on both instances; 05-02 (offline AI backfill of the 185 existing steps) can now write real `active_minutes`/`passive_minutes`/`instructions`/`prep_action`/`resource`/`oven_temp_f`/`rack_slots` values
- `RecipeStep`/`CookProgress`/`SchedulerConfig` types and `collections.cookProgress`/`collections.schedulerConfig` are available for every downstream plan (scheduler, cook mode, weights panel, linter v2, RecipeEditor authoring fields)
- No blockers. The one open follow-up (RecipeEditor UI round-trip via the actual Edit Step dialog) is scoped to 05-03, not a gap in this plan's own deliverables.

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-09*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 3 task commit hashes (`cfb592c`, `f26eb79`, `6412e17`) confirmed in git log.
