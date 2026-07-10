---
phase: 06-import-pipeline-recipe-lifecycle
plan: 01
subsystem: database
tags: [pocketbase, schema-migration, typescript, recipe_notes, draft-status]

requires:
  - phase: 05-prep-day-engine
    provides: recipe_steps metadata fields (active/passive minutes, prep vocab) that the import contract carries
provides:
  - "recipes.status (select draft|published) on prod + test, all 57 existing rows backfilled to published"
  - "recipe_notes collection (recipe/text/status/source_surface/draft_revision/created/updated) on both instances"
  - "recipes.revision_of + recipe_product_nodes.source_node nullable relations (evolution write-back linkage)"
  - "Recipe.status/revision_of, RecipeProductNode.source_node, RecipeNote/RecipeNoteExpanded types; collections.recipeNotes"
  - "idempotent apply-phase6-schema.mjs migration script"
affects: [draft-filter, publish-gate, import-page, note-capture, evolution-writeback, suggest-recipes]

tech-stack:
  added: []
  patterns:
    - "additive-nullable PocketBase migration mirroring apply-phase5-schema.mjs (test-first 8091 -> prod 8090, drop-guarded merge, repo-root pb_schema.json re-export gated to test run)"
    - "backfill-in-same-script: after adding a select field, immediately set every existing row so an un-set value ('') cannot vanish under a fail-open filter"

key-files:
  created:
    - recipe-planner/scripts/apply-phase6-schema.mjs
  modified:
    - recipe-planner/src/lib/types.ts
    - recipe-planner/src/lib/api.ts
    - pb_schema.json

key-decisions:
  - "Open Q1 resolved: new type fields all optional so existing rows + all existing code compile unchanged"
  - "Open Q2 resolved (option A): node correspondence is a schema relation recipe_product_nodes.source_node, not an off-schema map"
  - "Backfill runs in the same migration script (Pitfall 1) — 57/57 recipes set to published on both instances"

patterns-established:
  - "Phase-6 schema migrations are idempotent, existence-checking, and test-rehearsed before the blocking-human prod run"

requirements-completed: [IMP-01, IMP-05, IMP-06]

coverage:
  - id: D1
    description: "recipes.status select (draft|published) exists on both PB instances; all 57 existing recipes backfilled to published"
    requirement: "IMP-01"
    verification:
      - kind: integration
        ref: "PB_URL=:8091 & :8090 node scripts/apply-phase6-schema.mjs — 57/57 backfilled, verified read-back"
        status: pass
    human_judgment: false
  - id: D2
    description: "recipe_notes collection + revision_of/source_node linkage relations exist on both instances"
    requirement: "IMP-05"
    verification:
      - kind: integration
        ref: "prod recipe_notes reachable (0 rows); pb_schema.json contains recipe_notes/status/revision_of/source_node"
        status: pass
    human_judgment: false
  - id: D3
    description: "TypeScript type surface (Recipe.status/revision_of, RecipeProductNode.source_node, RecipeNote/RecipeNoteExpanded, collections.recipeNotes) compiles against live schema"
    requirement: "IMP-06"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc --noEmit — exit 0"
        status: pass
    human_judgment: false

duration: ~8min
completed: 2026-07-10
status: complete
---

# Phase 6 Plan 01: Schema Foundation Summary

**Draft/published `status` (backfilled 57/57), `recipe_notes` collection, and `revision_of`/`source_node` evolution-linkage relations landed on both PocketBase instances via an idempotent test-first migration, with the matching additive TypeScript surface.**

## Performance

- **Duration:** ~8 min (executor) + prod checkpoint
- **Tasks:** 3 (2 auto + 1 blocking-human checkpoint)
- **Files modified:** 4

## Accomplishments
- `recipes.status` select (draft|published) added and **backfilled to `published` on all 57 recipes** on TEST (:8091) and PROD (:8090) — nothing vanishes from planning (D-03, IMP-01)
- `recipe_notes` collection created on both instances (D-09, IMP-05)
- `recipes.revision_of` + `recipe_product_nodes.source_node` nullable relations added for id-stable evolution write-back (D-10, IMP-06)
- Additive TypeScript types + `collections.recipeNotes`; `tsc --noEmit` clean
- Idempotent `apply-phase6-schema.mjs` (second run proven all no-ops)

## Task Commits

1. **Task 1: Recipe.status/revision_of + RecipeNote type + api.ts registration** — `be62afd` (feat)
2. **Task 2: apply-phase6-schema.mjs + TEST (8091) migration** — `6732222` (feat)
3. **Task 3: PROD (8090) migration** — checkpoint approved by user; migration run by orchestrator, verified (57/57 published, recipe_notes reachable). No code change (script re-run).

## Files Created/Modified
- `recipe-planner/scripts/apply-phase6-schema.mjs` — idempotent additive-nullable migration
- `recipe-planner/src/lib/types.ts` — Recipe/RecipeProductNode/RecipeNote type additions
- `recipe-planner/src/lib/api.ts` — `collections.recipeNotes` entry
- `pb_schema.json` — refreshed mirror (test-authoritative)

## Decisions Made
- All new type fields optional → existing rows + code compile unchanged.
- Node correspondence via schema relation `source_node` (Open Q2 option A).
- Backfill in the same script to avoid empty-status fail-open gaps (Pitfall 1).

## Deviations from Plan
None — plan executed exactly as written. The prod (:8090) checkpoint was explicitly approved by the user before the orchestrator ran the migration.

## Issues Encountered
None. TEST rehearsal was idempotent; PROD run added 2 fields (4 preserved), backfilled 57/57, created recipe_notes, added source_node — all verified.

## Next Phase Readiness
- Schema + types are live on both instances → Wave 2 (`buildRecipeGraph` spine, draft filter) and all Wave 3 UI can now read `status`, `recipe_notes`, and the linkage relations.

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-10*
