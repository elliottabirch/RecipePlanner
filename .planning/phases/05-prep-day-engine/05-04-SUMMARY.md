---
phase: 05-prep-day-engine
plan: 04
subsystem: data
tags: [pocketbase, offline-backfill, recipe-import-pattern, prep-day-engine]

requires:
  - phase: 05-prep-day-engine (05-01)
    provides: recipe_steps 7-field additive schema (active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots)
provides:
  - Read-only export script for every recipe_steps row grouped by recipe, with input/output product context
  - Complete offline metadata draft for all 185 existing steps, keyed by recipe_steps.id
affects: [05-08 (StepBackfill review page consumes this draft)]

tech-stack:
  added: []
  patterns:
    - "Offline draft-then-review pattern (recipe-import skill precedent): drafter reasons over exported graph context and writes a reviewable JSON artifact; no runtime LLM client added to src/"

key-files:
  created:
    - recipe-planner/scripts/export-steps-for-backfill.mjs
    - recipe-planner/src/data/step-backfill-draft.json
  modified: []

key-decisions:
  - "export-steps-for-backfill.mjs authenticates as PB superuser (creds from .env.local, never printed) purely to guarantee full read visibility, then issues only getFullList() calls -- zero create/update/remove"
  - "Intermediate step-export.json written to scripts/data/ (already gitignored via scripts/data/* pattern), not committed -- regenerable by re-running the export script"
  - "prep_action assigned only to genuine knife-cut prep steps (dice/slice/mince/chop/grate/shred family); non-cutting prep-typed steps (cook, toast, juice, zest-as-not-grate, sweat, thaw) left null since none of the controlled 6-verb vocabulary fits -- zest mapped to grated as the closest fit"
  - "resource inferred per step from name + graph context: oven for roast/bake/warm-in-oven language, stovetop for saute/simmer/boil/pan-cook language, blender for the one immersion/stand-blender step, none for pure knife-prep/assemble/store/pull steps; no instant_pot usage found in any of the 185 step names"
  - "active_minutes/passive_minutes follow the active-then-passive ordering (A2): knife prep and store/pull steps are active-only; cooking steps split hands-on time (active) from unattended simmer/roast/bake time (passive), using any explicit time/temp already present in the step name (e.g. '425°F for 20 min', 'simmer covered 45 min')"

requirements-completed: [PREP-02]

coverage:
  - id: D1
    description: "Read-only export script pulls all recipe_steps grouped by recipe with input/output product context, authenticating via .env.local creds without printing them"
    requirement: "PREP-02"
    verification:
      - kind: unit
        ref: "cd recipe-planner && node scripts/export-steps-for-backfill.mjs --dry-count (manual invocation, output grep-verified)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Complete, vocabulary-valid offline metadata draft exists for all 185 existing recipe steps, keyed by recipe_steps.id"
    requirement: "PREP-02"
    verification:
      - kind: unit
        ref: "cd recipe-planner && node -e \"...\" validation script from 05-04-PLAN.md Task 2 (checks count>=100, resource/prep_action enum membership, oven_temp_f presence)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 04: Offline AI-Assisted Backfill Draft Summary

**Read-only step export script plus a complete, enum-valid offline metadata draft (durations, instructions, prep vocabulary, resource/oven inference) for all 185 existing recipe steps across 56 recipes, ready for Plan 08's in-app review.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-07-10T02:29:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Read-only, cred-safe export script (`export-steps-for-backfill.mjs`) that authenticates against prod (:8090) via `.env.local`, fetches every `recipe_steps` row plus its recipe name and product-node input/output context via the edge tables, and groups the result by recipe — confirmed live: 56 recipes, 185 steps, 0 already populated.
- Complete offline draft (`step-backfill-draft.json`), one entry per existing step, keyed by `recipe_steps.id`, covering all 7 metadata fields: `active_minutes`, `passive_minutes`, `instructions`, `prep_action` (prep steps only), `resource`, `oven_temp_f` (oven steps only), `rack_slots` (default 1).
- Every `resource` and `prep_action` value drafted strictly within the Plan-01 select enums (verified programmatically); every oven-resource entry carries an `oven_temp_f`; zero `lead_time_minutes` fields anywhere (D-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Export current steps grouped by recipe** - `02f3a73` (feat)
2. **Task 2: Draft metadata for all ~185 steps into step-backfill-draft.json** - `43e4021` (feat)

**Plan metadata:** committed as part of this summary/state update.

## Files Created/Modified
- `recipe-planner/scripts/export-steps-for-backfill.mjs` - Read-only export of every `recipe_steps` row grouped by recipe, with input/output product names from `product_to_step_edges`/`step_to_product_edges`, plus current metadata field values so already-populated steps are visible. Supports `--dry-count` for a fast count-only check.
- `recipe-planner/src/data/step-backfill-draft.json` - Offline metadata draft for all 185 steps, keyed by `recipe_steps.id`. Data only — not written to PocketBase by this plan.

## Decisions Made
- Authenticated the export script as PB superuser purely for guaranteed read visibility (matching the `apply-phase5-schema.mjs`/`merge-products.js` precedent), while keeping it strictly read-only (only `getFullList()` calls).
- Wrote the intermediate `scripts/data/step-export.json` export artifact to the already-gitignored `scripts/data/` directory rather than stdout, since it's large (185 steps with graph context) and useful to keep around for a re-run without re-fetching from prod; it is not committed.
- Assigned `prep_action` only where a step is a genuine knife-cut/prep action matching the controlled 6-verb vocabulary (`sliced`/`diced`/`minced`/`chopped`/`grated`/`shredded`); prep-typed steps that are actually cooking, thawing, juicing, or toasting (not a cut) were left `null` rather than forcing a mismatched vocabulary value. "Zest lemon" was mapped to `grated` as the closest available verb.
- Inferred `resource` per step from its name and the recipe graph's step_type/inputs/outputs: `oven` for roast/bake/warm-in-oven language (including the two costco-reheat and smoked-pork-shoulder low-and-slow cases), `stovetop` for saute/simmer/boil/pan-cook/toast-in-skillet language, `blender` for the one immersion/stand-blender step (Creamy Tomato Soup), and `none` for pure knife-prep, assemble, store, and pull/thaw steps. No step name indicated Instant Pot use, so `instant_pot` was never assigned.
- Active/passive minute estimates follow the A2 active-then-passive ordering: pure prep/store/pull steps are active-only; cooking steps split a short hands-on active window from the unattended simmer/roast/bake passive window, using any explicit time/temperature already present in the step's own name (e.g., "425°F for 20 min", "simmer covered 45 min") where available, and reasonable household-scale estimates otherwise.

## Deviations from Plan

None - plan executed exactly as written. Both artifacts (`export-steps-for-backfill.mjs`, `step-backfill-draft.json`) match the frontmatter's `files_modified` list exactly, and the verification commands specified in the plan (`--dry-count` grep check, the Task-2 Node validation script) both pass as written.

## Issues Encountered
None. The export script authenticated and ran cleanly against prod on the first attempt; the drafted JSON validated against the enum/oven-temp checks on the first run with no corrections needed (all 185 ids matched the export with zero missing/extra).

## User Setup Required

None - no external service configuration required. This plan only produces a reviewable data artifact; no PocketBase writes occurred.

## Next Phase Readiness
- Plan 08's StepBackfill review page has real, vocabulary-valid draft-vs-current data to render and approve in batches — the draft covers 100% of the 185 existing steps.
- Pitfall 4 (drafts are estimates, not measurements) applies as documented: every duration/resource value here should be treated as a reasonable starting point, editable in RecipeEditor and cook mode after approval, not a ground-truth timing measurement.
- No blockers for downstream Phase 5 plans (scheduler/GA work in 05-05..05-07 does not need this draft directly; only Plan 08's review page does).

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: recipe-planner/scripts/export-steps-for-backfill.mjs
- FOUND: recipe-planner/src/data/step-backfill-draft.json
- FOUND: commit 02f3a73
- FOUND: commit 43e4021
