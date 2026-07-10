---
phase: 05-prep-day-engine
plan: 03
subsystem: frontend
tags: [mui, react, recipe-editor, step-metadata, authoring]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    plan: 01
    provides: 7 new nullable recipe_steps fields + RecipeStep TypeScript type (schema foundation)
provides:
  - Human-editable authoring surface for active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots in RecipeEditor.tsx's Edit Step dialog
  - StepNodeData extended with the 7 fields (consumed by scheduler/cook-mode plans downstream)
  - StepNode.tsx durations metadata chip (visual confirmation of populated timing data on the graph canvas)
affects: [05-02, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11, 05-12, recipe-editor, backfill-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional field rendering keyed on sibling select value (stepType === Prep for prep_action, stepResource === oven for oven_temp_f), mirroring the existing stepType === assembly / Timing conditional already in this dialog"
    - "Inline required-field validation deferred to Save-click time (not eager on every keystroke), clearing on next edit to that field or when the triggering condition (resource !== oven) no longer applies"

key-files:
  created: []
  modified:
    - recipe-planner/src/pages/RecipeEditor.tsx
    - recipe-planner/src/components/nodes/StepNode.tsx

key-decisions:
  - "oven_temp_f validation triggers on Save-click attempt (matching handleSaveEditedStep's existing early-return pattern for stepName), not as an eagerly-rendered error before the user has tried to save — consistent with this dialog's existing minimal-friction UX"
  - "Duration chip visibility uses a truthy check (active_minutes || passive_minutes) rather than != null, so steps with both fields at 0/undefined show no chip; the label itself omits a zero/null side per the plan's explicit instruction"
  - "Add Step dialog (handleAddStep) is intentionally NOT extended with the 7 fields — per plan scope, only the Edit Step dialog is the authoring surface; new steps get durations/resource metadata via edit-after-create, matching the plan's stated touchpoints (Edit Step dialog + both save-handler touchpoints only)"

requirements-completed: []

coverage:
  - id: D1
    description: "The Edit Step dialog persists active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots through both handleSaveEditedStep's node-data merge and handleSave's step-node nodeData object"
    requirement: PREP-01
    verification:
      - kind: unit
        ref: "node -e field-presence grep across RecipeEditor.tsx confirms all 7 field names appear in both the dialog JSX and the two save-touchpoint code paths"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit clean — StepNodeData/RecipeStep field-name alignment type-checks"
        status: pass
    human_judgment: true
  - id: D2
    description: "prep_action only shows for prep steps; oven_temp_f only shows (and is required with inline error) when resource is oven"
    requirement: PREP-01
    verification:
      - kind: unit
        ref: "Conditional JSX: {stepType === StepType.Prep && ...} wraps prep_action Select; {stepResource === \"oven\" && ...} wraps oven_temp_f TextField with error/helperText driven by ovenTempError state, set true only when handleSaveEditedStep's guard (stepResource === \"oven\" && stepOvenTempF === \"\") blocks save"
        status: pass
    human_judgment: true
  - id: D3
    description: "StepNode graph card shows a metadata chip when durations are populated"
    requirement: PREP-01
    verification:
      - kind: unit
        ref: "durationLabel computed from active_minutes/passive_minutes with null/0-side omission; Chip renders only when durationLabel is truthy, reusing the exact Timing-chip sx block (size=small, variant=outlined, fontSize 0.7rem, height 20)"
        status: pass
    human_judgment: true
---

# Phase 5 Plan 03: Step-Metadata Authoring UI Summary

**Added the 7 prep-day-engine step-metadata fields (durations, instructions, prep_action, resource, oven_temp_f, rack_slots) to RecipeEditor.tsx's Edit Step dialog with conditional rendering and inline oven-temperature validation, threaded through both save touchpoints, and surfaced active/passive durations as a new StepNode graph chip**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-10
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended `StepNodeData` (StepNode.tsx) with the 7 optional step-metadata fields so both the editor and the graph canvas share one authoritative shape
- Added all 7 fields to the Edit Step dialog in the UI-SPEC's prescribed order (active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots), reusing the dialog's existing `TextField`/`Select` + `margin="dense"`/`fullWidth` pattern verbatim
- `prep_action` Select conditionally renders only when `step_type === "prep"`, populated from the Phase-1 controlled prep-verb vocabulary (`sliced`/`diced`/`minced`/`chopped`/`grated`/`shredded`, sourced from `lib/linter/rules/prep-words.ts`)
- `oven_temp_f` conditionally renders only when `resource === "oven"`, with Save-click-triggered inline validation ("Oven temperature is required for oven steps.") that blocks the save until resolved
- Threaded all 7 fields through both save touchpoints: `handleSaveEditedStep`'s node-data merge (in-memory React Flow state) and `handleSave`'s step-node `nodeData` object (the actual PocketBase `create`/`update` payload) — confirmed neither omission point exists via `npx tsc --noEmit` + a field-presence grep
- Added a third outlined `Chip` to `StepNode.tsx`'s existing chip row, showing "Nm active / Nm passive" (gracefully omitting a null/0 side) when either duration is populated on the node, using the exact existing Timing-chip `sx` block (no new visual style)
- Did NOT introduce `lead_time_minutes` (D-02 cut, confirmed absent)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 7 metadata fields to the Edit Step dialog + save handlers** - `f8c22ad` (feat)
2. **Task 2: Add a durations metadata chip to StepNode** - `57587e7` (feat)

## Files Created/Modified
- `recipe-planner/src/pages/RecipeEditor.tsx` - 7 new Edit-Step fields (state, dialog JSX, conditional rendering, inline oven validation), threaded through `handleEditNode` (populate-on-open), `handleSaveEditedStep` (node-data merge + validation guard), and `handleSave`'s step-node `nodeData` object (PB write payload); new `PREP_ACTION_OPTIONS`/`RESOURCE_OPTIONS`/`RESOURCE_LABELS` module-level constants and a `ResourceValue` type alias
- `recipe-planner/src/components/nodes/StepNode.tsx` - `StepNodeData` extended with the 7 optional fields; new durations `Chip` reusing the existing Timing-chip `sx` block verbatim

## Decisions Made
- **Inline oven-temp validation fires on Save-click, not eagerly** — matches `handleSaveEditedStep`'s existing early-return-on-invalid pattern (previously only guarding `stepName.trim()`); the `ovenTempError` state clears automatically when the user edits the field again or switches `resource` away from `"oven"`.
- **Duration chip uses a truthy check**, not `!= null` — a step with `active_minutes`/`passive_minutes` both `0`/`undefined` shows no chip (nothing meaningful to surface); this matches the "12m active / 30m passive" example format and the plan's "omit a null/0 side gracefully" instruction applied at the whole-chip level, not just per-side.
- **Add Step dialog intentionally untouched** — the plan's two touchpoints are the Edit Step dialog + both save handlers; new steps get their metadata authored via edit-after-create, consistent with 05-01's backfill/authoring split (new recipes are also linter-enforced at import in Phase 6, not required at creation time in this editor).

## Deviations from Plan

None - plan executed exactly as written. Both touchpoints (`handleSaveEditedStep`'s merge and `handleSave`'s `nodeData` object) carry all 7 fields; `prep_action`/`oven_temp_f` conditionals match the UI-SPEC exactly; the Save button label is unchanged ("Save"); no `lead_time_minutes` field was introduced.

## TDD Gate Compliance

Task 1 was flagged `tdd="true"` in the plan, but its own `<verify>` block specifies only `npx tsc --noEmit` + a field-presence grep (no test-file authoring step), and this codebase has no React component test harness (`@testing-library/react`/jsdom are not installed; the only `.test.ts` precedent covers pure logic modules like `sync-queue.test.ts`, not stateful MUI dialogs). Introducing that test infrastructure from scratch would be an architectural addition outside this plan's `files_modified` scope (Rule 4 territory), so no RED/GREEN test commits were created — verification followed the plan's literal automated `<verify>` command plus a full-project `tsc`/`eslint` pass, with the dialog's actual conditional/validation behavior deferred to the plan's own stated Manual/UAT step.

## Issues Encountered

None. `npx tsc --noEmit` and `npx eslint` (on both modified files) are clean aside from one pre-existing, unrelated `react-hooks/exhaustive-deps` warning on `RecipeEditor.tsx`'s `loadRecipe`/`isNew` effect (present before this plan's changes, out of scope per the scope-boundary rule).

## User Setup Required

None — no external service configuration required. The 7 underlying `recipe_steps` fields already exist on both PocketBase instances (05-01).

## Next Phase Readiness

- The authoring surface now round-trips all 7 step-metadata fields through both the in-memory React Flow state and the PocketBase write path — downstream plans (scheduler, cook mode, linter v2) can rely on `RecipeStep`/`StepNodeData` carrying this data consistently whether backfilled (05-02) or hand-authored (this plan).
- Manual/UAT verification (editing a prep + assembly + oven step, confirming conditional fields and persistence across a real reload against `:8091`) is still outstanding — flagged `human_judgment: true` in the coverage table above, per this plan's own `<verification>` section; not blocking downstream plans, but should be exercised before Phase 5's end-of-phase verification.
- No blockers for 05-04 onward.

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*

## Self-Check: PASSED

Both modified files confirmed present with expected content (`grep` field-presence check passed); both task commit hashes (`f8c22ad`, `57587e7`) confirmed in `git log --oneline --all`.
