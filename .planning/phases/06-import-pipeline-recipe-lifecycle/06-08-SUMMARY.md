---
phase: 06-import-pipeline-recipe-lifecycle
plan: 08
subsystem: ui
tags: [react, mui, pocketbase, hooks, notes, cook-mode, calendar]

# Dependency graph
requires:
  - phase: 06-01
    provides: recipe_notes collection (collections.recipeNotes) + RecipeNote/RecipeNoteExpanded types
  - phase: 06-05
    provides: recipe lifecycle status field (draft/published) surfaced on the recipe card
provides:
  - useRecipeNotes hook (addNote/dismissNote/refresh) writing status=pending recipe_notes rows
  - Shared AddNoteButton component (>=44px IconButton + Popover TextField, no navigation)
  - One-tap Add-note affordance on three surfaces (recipe card, cook-mode Now/Next card, calendar cell) tagged with source_surface
affects: [06-10 evolution loop drains pending recipe_notes into draft revisions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared self-contained note-capture control reused across surfaces (single provenance + touch-target contract)"
    - "Hook mirrors useRecipeQueue shape (state + loading + useCallback refresh + create/update via lib/api wrappers)"

key-files:
  created:
    - recipe-planner/src/hooks/useRecipeNotes.ts
    - recipe-planner/src/components/AddNoteButton.tsx
  modified:
    - recipe-planner/src/pages/Recipes.tsx
    - recipe-planner/src/pages/WeeklyPlans.tsx
    - recipe-planner/src/components/cook-mode/NowNextCard.tsx

key-decisions:
  - "Extracted a shared AddNoteButton component instead of inlining the affordance three times — keeps source_surface tagging + >=44px touch target consistent across surfaces (thin surfaces, hook owns the write)"
  - "Cook-mode recipe id sourced from instance.step.recipe (RecipeStep.recipe relation) — no prop threading needed from the CookMode parent"
  - "Calendar recipe id sourced from meal.recipe (PlannedMeal.recipe relation) on the meal-grid cell"

patterns-established:
  - "AddNoteButton: tap >=44px IconButton -> Popover with compact multiline TextField + Save note -> useRecipeNotes().addNote(recipeId, text, source_surface); stopPropagation guards keep clickable parent cells (expand toggle, edit-variants) from firing"

requirements-completed: [IMP-05]

coverage:
  - id: D1
    description: "useRecipeNotes hook creates status=pending recipe_notes rows via lib/api wrappers, plus refresh + dismissNote"
    requirement: "IMP-05"
    verification:
      - kind: automated_ui
        ref: "cd recipe-planner && npx tsc --noEmit (clean) + grep addNote/status:pending in src/hooks/useRecipeNotes.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "One-tap Add-note button on recipe card / cook-mode Now-Next card / calendar cell, each tagged with the correct source_surface"
    requirement: "IMP-05"
    verification:
      - kind: unit
        ref: "npm test — 238 tests pass (29 files)"
        status: pass
      - kind: manual_procedural
        ref: "Live tablet UAT — tap Add note on all three surfaces, confirm three pending rows with correct source_surface + recipe relation"
        status: unknown
    human_judgment: true
    rationale: "jsdom cannot verify tablet touch-target ergonomics nor that PocketBase persists three correctly-tagged rows; requires live device verification (Task 3 checkpoint)"

metrics:
  duration: ~10m
  completed: 2026-07-11
status: complete
---

# Phase 06 Plan 08: One-Tap Recipe Notes Summary

One-liner: a `useRecipeNotes` hook (mirroring `useRecipeQueue`) plus a shared `AddNoteButton` that lands a `status="pending"` recipe_notes row — provenance-tagged by `source_surface` — from the recipe card, the cook-mode Now/Next card, and the calendar week cell, with no page navigation.

## Accomplishments

- **useRecipeNotes hook** (`src/hooks/useRecipeNotes.ts`): `notes: RecipeNoteExpanded[]` + `loading`, `refresh()` via `getAll(collections.recipeNotes, { expand: "recipe", sort: "-created" })`, `addNote(recipeId, text, source_surface)` creating a `status="pending"` row, and `dismissNote(id)` setting `status="dismissed"`. All writes go through the `lib/api` wrappers (`create`/`update`), never `pb.collection` directly.
- **Shared AddNoteButton** (`src/components/AddNoteButton.tsx`): `NoteAddIcon` `IconButton` with a Tooltip ("Add note"), `minWidth/minHeight: 44` touch target, opening a compact `Popover` with a multiline `TextField` + "Save note" (Ctrl/Cmd+Enter shortcut). Calls `addNote` and clears/closes on save — no navigation. `stopPropagation` guards keep parent cell click handlers (expand toggle, edit-variants) from firing.
- **Three surfaces wired** with the correct provenance enum:
  - Recipe card (`Recipes.tsx`, CardActions) → `source_surface="recipe_card"`, `recipeId = item.id`
  - Cook-mode Now/Next card (`NowNextCard.tsx`, header row beside the ReadinessChip) → `source_surface="cook_mode"`, `recipeId = instance.step.recipe`
  - Calendar/week cell (`WeeklyPlans.tsx`, meal-grid cell) → `source_surface="calendar"`, `recipeId = meal.recipe`

## Deviations from Plan

**1. [Rule 3 - Blocking/structure] Extracted a shared `AddNoteButton` component**
- **Found during:** Task 2
- **Issue:** The plan lists only the 4 files, but implementing the same >=44px Popover-based note affordance inline three times would duplicate the source_surface + touch-target contract and risk drift between surfaces.
- **Fix:** Created `src/components/AddNoteButton.tsx` as a single thin, self-contained control (the hook still owns the write, per the plan's "keep additions thin"). The three surfaces each render `<AddNoteButton recipeId=... sourceSurface=... />`.
- **Files modified:** added `recipe-planner/src/components/AddNoteButton.tsx`
- **Commit:** 3624336

## Needs UI Verification (UAT)

Task 3 is a `checkpoint:human-verify` (jsdom-untestable). Auto-mode: all automated verification passed; the live tablet steps below remain for a human:

1. Run the app. On the Recipes list, tap **Add note** on a card, type a note, **Save note** — confirm no navigation and the popover closes.
2. In cook mode, tap **Add note** on a Now/Next card and save a note.
3. On a weekly plan calendar cell, tap **Add note** on a planned meal and save a note.
4. Query `recipe_notes` (PB admin or a quick script): confirm three `status="pending"` rows exist with `source_surface = recipe_card / cook_mode / calendar` respectively and the correct `recipe` relation.

Resume signal: type "approved" if all three surfaces write correctly-tagged pending notes, or describe the issue.

## Verification Results

- `cd recipe-planner && npx tsc --noEmit` — clean (0 errors).
- `npm test` — 238 tests pass across 29 files.
- `npm run build` — production build succeeds (pre-existing chunk-size warning only, unrelated).
- All three surfaces reference `AddNoteButton` + a `source_surface` value (grep-confirmed).

## Self-Check: PASSED
- FOUND: recipe-planner/src/hooks/useRecipeNotes.ts
- FOUND: recipe-planner/src/components/AddNoteButton.tsx
- FOUND commit 6fe36ff (useRecipeNotes hook)
- FOUND commit 3624336 (three-surface Add-note buttons)
