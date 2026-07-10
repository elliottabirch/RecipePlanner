---
phase: 06-import-pipeline-recipe-lifecycle
plan: 05
subsystem: recipe-lifecycle
tags: [draft-filter, planning, ui-badge]
requires: ["06-01", "06-03"]
provides: [draft-invisibility-planning, draft-badge]
affects: [WeekWizard, WeeklyPlans, Recipes]
tech-stack:
  added: []
  patterns: [fail-open-draft-filter, mui-chip-badge]
key-files:
  created: []
  modified:
    - recipe-planner/src/components/WeekWizard.tsx
    - recipe-planner/src/pages/WeeklyPlans.tsx
    - recipe-planner/src/pages/Recipes.tsx
decisions:
  - "Both planning call sites pass the SAME shared buildDraftExcludingFilter() — no divergent inline strings, avoiding the fail-closed equals-published bug (T-06-05b)"
metrics:
  duration: ~5m
  completed: 2026-07-10
  tasks: 3
  files: 3
status: complete
---

# Phase 06 Plan 05: Draft Invisibility in Planning + Draft Badge Summary

Wired the fail-open draft-exclusion filter into exactly the two correctness-critical planning queries (WeekWizard rotation-pool load and WeeklyPlans Add-Meal picker) and added a grey Draft `<Chip>` to recipe cards, keeping drafts out of meal plans while visible + badged everywhere authoring happens.

## What Was Built

- **Task 1 — Draft filter at the two planning call sites** (commit `21652f8`)
  - `WeekWizard.tsx`: the rotation-pool `getAll<Recipe>` inside the `Promise.all` now passes `filter: buildDraftExcludingFilter()` alongside `sort: "name"` (D-04, highest-risk site).
  - `WeeklyPlans.tsx`: the Add-Meal picker `getAll<Recipe>` (line 153) gets the same filter.
  - Both import the shared `buildDraftExcludingFilter()` from `src/lib/lifecycle/draft-filter.ts` (Plan 03). The filter is fail-open (`status != "draft"`) so unset-status recipes stay plannable — never the fail-closed `status = "published"` form.
  - The four intentionally-unfiltered surfaces (Recipes list query, RecipeEditor, Products source_recipe, StepBackfill) were left untouched.

- **Task 2 — Draft chip badge** (commit `7b1660d`)
  - `Recipes.tsx`: a grey Draft `<Chip>` (`#757575`, white text, per UI-SPEC) renders on a card when `item.status === "draft"`, in the same `gap={1}` card-header flex row as the Batch chip. Draft and Batch chips coexist (orthogonal states).

## Verification

- `npx tsc --noEmit`: clean.
- Full suite (`vitest run`): 29 files, 238 tests passed.
- `grep`: both planning files import/apply `draft-filter`; Draft chip present in Recipes.tsx.

## Needs UI Verification (UAT)

The draft-hidden-in-planning behavior and the badge are jsdom-untestable UI. Auto-mode completed the plan with all automated checks green; the following live check remains (Task 3, human-verify checkpoint):

1. On Test DB, set one recipe's status to "draft" (via PB edit or the editor once Plan 06 ships); leave another published.
2. Open the Recipes list — confirm the draft recipe shows a grey "Draft" chip; the published one does not.
3. Open the WeekWizard (Fill Week) — confirm the draft recipe is NOT in any slot's pool.
4. Open a weekly plan's Add-Meal picker — confirm the draft recipe is NOT selectable.
5. Confirm the draft recipe IS still visible in the Recipes list and openable in the editor.

Resume signal: type "approved" if the draft is hidden from wizard + Add-Meal but visible + badged in the list, or describe the leak.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
- FOUND: recipe-planner/src/components/WeekWizard.tsx (filter applied)
- FOUND: recipe-planner/src/pages/WeeklyPlans.tsx (filter applied)
- FOUND: recipe-planner/src/pages/Recipes.tsx (Draft chip)
- FOUND commit: 21652f8 (Task 1)
- FOUND commit: 7b1660d (Task 2)
