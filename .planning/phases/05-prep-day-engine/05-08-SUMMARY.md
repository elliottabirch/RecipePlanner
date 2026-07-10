---
phase: 05-prep-day-engine
plan: 08
subsystem: ui
tags: [react, pocketbase, backfill, review-page, idempotency, tdd]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    provides: "05-01 RecipeStep metadata schema (active_minutes/passive_minutes/prep_action/resource/oven_temp_f/rack_slots/instant_pot) and 05-04's offline draft (step-backfill-draft.json, ~185 steps)"
provides:
  - "computeBackfillWriteSet(draftEntries, currentSteps, decisions) — pure, tested diff/apply core for idempotent, approval-only recipe_steps writes"
  - "isStepUnbackfilled step-level detector treating PocketBase's 0/\"\" un-set defaults as needing backfill (not just null)"
  - "StepBackfill.tsx review page + /step-backfill route: per-recipe-batch draft-vs-current diff, Accept/Edit/Reject per field, atomic batch write, All-caught-up empty state"
affects: [06-publish-lifecycle, prep-day-cook-mode]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure diff/apply core kept separate from the React page shell (Products.tsx Lint Findings Dialog list/approve shape reused for Accept/Edit/Reject)"]

key-files:
  created:
    - recipe-planner/src/lib/backfill/diff.ts
    - recipe-planner/src/lib/backfill/diff.test.ts
    - recipe-planner/src/pages/StepBackfill.tsx
  modified:
    - recipe-planner/src/App.tsx
    - recipe-planner/src/pages/RecipeEditor.tsx

key-decisions:
  - "Design-note resolution (user-approved at the checkpoint): every field defaults to Accept; Save is never blocked by pending decisions — Edit/Reject are explicit overrides a reviewer opts into, matching the UI-SPEC's low-friction review intent"
  - "isStepUnbackfilled treats PocketBase's un-set defaults (0 for number fields, \"\" for text/select) as still-needing-backfill, not just null — PB does not store nulls for un-set number/select fields, so a null-only check falsely reported every migrated step as complete"
  - "RecipeEditor's load path now hydrates all 7 Phase-5 metadata fields into step nodes (previously only label/stepType/timing loaded), fixing both a display gap (backfilled values invisible on reopen) and a silent-clobber bug (save previously wrote these fields as undefined)"

patterns-established:
  - "Step-level 'is this record still incomplete' detection lives beside the pure diff core (diff.ts), not duplicated in the page — both the write-set computation and the queue/empty-state UI call the same isStepUnbackfilled"

requirements-completed: [PREP-02]

coverage:
  - id: D1
    description: "computeBackfillWriteSet excludes a step whose current record already carries the drafted fields (idempotency), including PB's 0/\"\" un-set defaults counted as missing"
    requirement: "PREP-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/backfill/diff.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Editing a field before accept puts the edited value (not the draft value) in the write-set; a rejected field is omitted entirely"
    requirement: "PREP-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/backfill/diff.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "StepBackfill.tsx renders a per-recipe-batch draft-vs-current diff, Save Reviewed Batch writes atomically per batch (no partial write on failure), reviewing one batch against the deployed test/NAS app persists edited/accepted values, leaves the rejected field blank, and re-opening shows All caught up (idempotent) with no confirmation dialog on Reject"
    requirement: "PREP-02"
    verification:
      - kind: manual_procedural
        ref: "Human checkpoint (Task 3) — reviewed live against the deployed app; user response: 'approved — backfill seems good'"
        status: pass
    human_judgment: true
    rationale: "Requires an actual PocketBase-backed batch write, page reload, and visual confirmation of the diff/empty-state UI — not mechanically verifiable from unit tests alone."

duration: 20min
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 08: Backfill Review Page Summary

**Pure, tested `computeBackfillWriteSet` diff/apply core plus a `StepBackfill.tsx` review page that lets a human Accept/Edit/Reject the Plan-04 offline draft against live `recipe_steps` per recipe batch, writing only approved values atomically and idempotently — human-verified live on the deployed app, with two follow-up fixes (PB default-value detection, RecipeEditor load-path clobber) shipped after initial review.**

## Performance

- **Duration:** ~20 min (core implementation) + follow-up fix sessions
- **Completed:** 2026-07-10
- **Tasks:** 3 (2 code tasks + 1 human-verify checkpoint)
- **Files modified:** 5 (3 created, 2 modified across the plan + follow-ups)

## Accomplishments
- `computeBackfillWriteSet(draftEntries, currentSteps, decisions)` — pure function (no PocketBase/React imports), fully covered by `diff.test.ts`: idempotency (fully-populated step excluded), accept/reject field filtering, edited-value precedence over the drafted value
- `StepBackfill.tsx` review page: per-recipe-batch two-column draft-vs-current diff, changed fields bold-weighted, Accept (default)/Edit/Reject per field, "Save Reviewed Batch" disabled until every step in the batch is decided, atomic-per-batch write (rolls back on partial failure), "All caught up" empty state, no confirmation dialog on Reject, registered at `/step-backfill` with a drawer nav entry
- Follow-up fix (1315e49): `isStepUnbackfilled` added so PocketBase's un-set defaults (`0` for number fields, `""` for text/select — PB never stores `null` for these) are correctly treated as still-needing-backfill; without this the page falsely showed "All caught up" for every migrated step
- Follow-up fix (f2b1071): `RecipeEditor.tsx`'s load path now hydrates all 7 Phase-5 metadata fields into step nodes, fixing both a display gap (backfilled/authored values invisible on reopen) and a silent-clobber bug (saving the recipe previously wrote these fields as `undefined`, erasing DB values)
- Human checkpoint (Task 3) approved live against the deployed app: batch write persisted, rejected field stayed blank, idempotent re-open showed "All caught up", no confirmation dialog on Reject

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure computeBackfillWriteSet diff/apply core + test** — `ae36e17` (test, RED) → `1c389a3` (feat, GREEN)
2. **Task 2: StepBackfill review page + route** — `c34950d` (feat)
3. **Task 3: Human verify — batched backfill review + idempotency** — approved by user ("backfill seems good"); no additional commit (checkpoint is a verification gate, not a code change)

**Follow-up fixes (post-checkpoint, same plan scope):**
- `1315e49` (fix) — PocketBase default 0/"" step metadata now detected as needing backfill
- `f2b1071` (fix) — RecipeEditor load path hydrates all 7 metadata fields (fixes display + clobber-on-save)

_TDD task (Task 1) followed the RED → GREEN cycle: `ae36e17` failing test asserting all 4 behaviors, `1c389a3` minimal implementation making them pass. No REFACTOR commit was needed._

## Files Created/Modified
- `recipe-planner/src/lib/backfill/diff.ts` - `computeBackfillWriteSet` pure diff/apply core + `isStepUnbackfilled` step-level detector (added in follow-up fix)
- `recipe-planner/src/lib/backfill/diff.test.ts` - covers idempotency, accept/edit/reject filtering, and PB-default detection
- `recipe-planner/src/pages/StepBackfill.tsx` - review page: batch grouping, per-field Accept/Edit/Reject UI, atomic save, empty state
- `recipe-planner/src/App.tsx` - route registration for `/step-backfill` + drawer nav entry
- `recipe-planner/src/pages/RecipeEditor.tsx` - load path hydrates all 7 Phase-5 metadata fields into step nodes (follow-up fix, prevents clobber-on-save)

## Decisions Made
- **Resolved design decision (user-approved at the checkpoint):** every field in the review UI defaults to Accept; "Save Reviewed Batch" is never blocked by pending per-field decisions — Edit and Reject are explicit reviewer overrides. This matches the UI-SPEC's low-friction batch-review intent and was confirmed acceptable during the human-verify checkpoint.
- `isStepUnbackfilled` (follow-up 1315e49) treats PocketBase's un-set defaults as incomplete rather than only checking for `null`, since PB stores un-set number fields as `0` and un-set text/select fields as `""` — a null-only check silently broke the entire idempotency/queue detection for every migrated step.
- `RecipeEditor.tsx` (follow-up f2b1071) now loads all 7 Phase-5 metadata fields into step nodes on open; empty-string values map to `undefined` so select-field fallback defaults still apply correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PocketBase 0/"" defaults not detected as needing backfill**
- **Found during:** post-checkpoint verification (page showed "All caught up" for every step with nothing actually reviewed)
- **Issue:** `recipe_steps` un-set number fields are stored as `0` and un-set text/select fields as `""` by PocketBase, not `null`. The original diff core's null-only completeness check treated every migrated step as already fully populated.
- **Fix:** Added `isStepUnbackfilled(step)` — a step needs backfill until it carries any real (non-default) metadata value. Used by both `computeBackfillWriteSet` and the review page's batch/empty-state logic.
- **Files modified:** `recipe-planner/src/lib/backfill/diff.ts`, `recipe-planner/src/lib/backfill/diff.test.ts`, `recipe-planner/src/pages/StepBackfill.tsx`
- **Verification:** Verified live against the deployed app (values from prior "all caught up" state now correctly queued for review); expanded `diff.test.ts` coverage for PB-default detection.
- **Committed in:** `1315e49`

**2. [Rule 1 - Bug] RecipeEditor load path dropped step-metadata fields, risking silent clobber on save**
- **Found during:** post-checkpoint verification (backfilled values didn't show when reopening a recipe in the editor)
- **Issue:** `RecipeEditor.tsx`'s load path built step nodes with only `label`/`stepType`/timing — none of the 7 Phase-5 metadata fields (`active_minutes`, `passive_minutes`, `prep_action`, `resource`, `oven_temp_f`, `rack_slots`, `instant_pot`) reached `node.data`. This meant (a) backfilled/authored values appeared empty on reopen, and (b) saving the recipe wrote these fields as `undefined`, silently erasing values just written by the backfill page.
- **Fix:** Load all 7 fields from the step record on open, mapping empty strings to `undefined` for select-field fallbacks.
- **Files modified:** `recipe-planner/src/pages/RecipeEditor.tsx`
- **Verification:** Verified live — backfilled values now show in the editor after a Step Backfill save, and re-saving the recipe no longer clobbers them.
- **Committed in:** `f2b1071`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - correctness bugs discovered during live verification of this plan's own feature)
**Impact on plan:** Both fixes were necessary for the backfill feature to actually function against real PocketBase data and to not be immediately undone by the existing recipe editor. No scope creep — both fixes are directly load-bearing for PREP-02's idempotency and non-destructive-write guarantees.

## Issues Encountered
- Initial live verification against the deployed test/NAS app revealed the two bugs above (PB default-value detection, editor clobber path) that were invisible to the unit-test-level idempotency checks, since those tests used explicit `null` fixtures rather than PocketBase's actual on-disk representation of un-set fields. Both fixed and re-verified before final checkpoint approval.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PREP-02's human review gate is now live and human-approved: drafts from Plan 04 can be safely reviewed and applied without risking silent overwrite of already-reviewed or user-authored data.
- The `swap-aware-prep-naming` todo (STATE.md Blockers/Concerns) remains open and unaffected by this plan — prep-step titles still don't reflect ingredient swaps; unrelated to the backfill review flow.
- No blockers for downstream Phase 5 plans (05-09 onward) or Phase 6.

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*

## Self-Check: PASSED
All files verified present on disk (diff.ts, diff.test.ts, StepBackfill.tsx, App.tsx, RecipeEditor.tsx); all commit hashes (ae36e17, 1c389a3, c34950d, 1315e49, f2b1071) verified present in git log.
