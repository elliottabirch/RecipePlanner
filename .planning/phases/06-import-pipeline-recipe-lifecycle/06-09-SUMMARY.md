---
phase: 06-import-pipeline-recipe-lifecycle
plan: 09
subsystem: ui
tags: [react, mui, week-wizard, recipe-lifecycle, evolution-loop, react-router]

# Dependency graph
requires:
  - phase: 06-import-pipeline-recipe-lifecycle (Plan 01)
    provides: recipes.revision_of relation field + draft/published status
  - phase: 06-import-pipeline-recipe-lifecycle (Plan 05)
    provides: draft-excluding filter on the wizard's main recipes load
provides:
  - "Wizard 'Revised — review?' flag on pool recipes that have a pending draft revision"
  - "Up-front draft-revision fetch indexed client-side by revision_of"
affects: [evolution-loop, recipe-editor, week-wizard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side index of pending draft revisions (revision_of -> draftId) built from one extra getAll"
    - "Notice-only navigation flag (stopPropagation so it never toggles the underlying pick)"

key-files:
  created: []
  modified:
    - recipe-planner/src/components/WeekWizard.tsx

key-decisions:
  - "Draft revisions fetched via a separate getAll (filter revision_of != \"\" && status=\"draft\") because Plan 05's draft-excluding filter removes them from the main recipes load"
  - "Flag is a low-emphasis MUI warning outlined Chip (not accent green) so it signals attention without competing with the primary CTA (D-11, UI-SPEC)"
  - "Flag NAVIGATES only — onClick calls navigate('/recipes/<draftId>') with stopPropagation; it never adds the draft to the plan (drafts stay excluded from the pool by Plan 05)"
  - "When multiple drafts revise one recipe, last write wins in the map — the flag is a notice, not a merge"

patterns-established:
  - "Evolution-loop review surface: pending draft revisions surfaced at plan time, opt-in review, no auto-apply"

requirements-completed: [IMP-06]

coverage:
  - id: D1
    description: "Wizard fetches pending draft revisions once, indexes by revision_of, and renders a low-emphasis 'Revised — review?' flag on pool recipes with a pending draft revision; tapping opens the draft in RecipeEditor"
    requirement: "IMP-06"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + npm test (238 passed)"
        status: pass
      - kind: manual_procedural
        ref: "UAT: seed a draft revision, open Fill Week, confirm flag shows/navigates and absent when no draft"
        status: unknown
    human_judgment: true
    rationale: "The flag's visual treatment and live navigation are jsdom-untestable — needs a seeded draft revision and a human to confirm the chip renders low-emphasis and opens the draft"

# Metrics
duration: 2min
completed: 2026-07-11
status: complete
---

# Phase 06 Plan 09: Wizard Revision-Review Flag Summary

**The week wizard now surfaces the evolution loop's review prompt — a low-emphasis "Revised — review?" chip on any pool recipe with a pending draft revision, tapping which opens the draft in RecipeEditor without ever pushing it into the plan.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-07-11T00:13:50Z
- **Completed:** 2026-07-11T00:15:20Z
- **Tasks:** 1 auto task (Task 2 is a UAT checkpoint — see below)
- **Files modified:** 1

## Accomplishments

- Added one up-front `getAll<Recipe>` with filter `revision_of != "" && status = "draft"` alongside the existing `Promise.all` data load in `WeekWizard.tsx`. Drafts are otherwise removed from the main recipes load by Plan 05's draft-excluding filter, so this is a dedicated query (06-RESEARCH.md-sanctioned, one extra getAll).
- Built a client-side `pendingRevisions` map (`revision_of` original recipe id → draft revision id) and stored it in component state.
- In the pool-recipe row render, wrapped each recipe `Chip` in a flex `Box` and, when the recipe has an entry in `pendingRevisions`, render a low-emphasis MUI `Chip` with `color="warning"`, `variant="outlined"`, label `"Revised — review?"`.
- The flag's `onClick` calls `e.stopPropagation()` then `navigate('/recipes/<draftId>')` — it navigates to the RecipeEditor review surface and never toggles the underlying pick. `useNavigate` is available because `WeekWizard` renders inside `WeeklyPlans`, which is within the router.
- The published recipe stays live in the pool; the flag is notice/navigation only (no auto-apply), and drafts remain excluded from the pool by Plan 05's filter.

## Deviations from Plan

None — plan executed exactly as written. The flag treatment (warning outlined chip, 0.75rem, height 28, adjacent to the recipe chip inside a shared flex Box) is Claude's discretion per CONTEXT §Claude's Discretion, kept subtle per UI-SPEC.

## Verification

- `cd recipe-planner && npx tsc --noEmit` — clean (no output).
- `npm test` — 29 files, **238 tests passed**.
- `grep -n "revision_of\|Revised\|pendingRevisions" src/components/WeekWizard.tsx` — confirms the fetch filter, the map build, and the flag render are present.

## Needs UI Verification (UAT)

Task 2 (`checkpoint:human-verify`, gate=blocking) — jsdom-untestable; requires a live seeded draft revision. Deferred per auto-mode. Steps for the human:

1. Create a draft recipe with `revision_of` set to a published pool recipe's id (via the evolution skill in Plan 10, or a quick PocketBase edit).
2. Open the WeekWizard (Fill Week) and locate that published recipe in a slot's pool.
3. Confirm a low-emphasis "Revised — review?" flag appears on that recipe's row and is NOT accent green.
4. Tap it — confirm it opens the linked draft in RecipeEditor.
5. Confirm a pool recipe with NO pending draft revision shows no flag.

Resume signal: type "approved" if the flag shows only for recipes with a pending draft revision and opens the draft, or describe the issue.

## Self-Check: PASSED

- FOUND: recipe-planner/src/components/WeekWizard.tsx
- FOUND: commit 4c0d57a
</content>
</invoke>
