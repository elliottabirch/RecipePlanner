---
phase: 04-weekly-planning-memory
plan: 09
subsystem: ui
tags: [react, mui, accordion, pocketbase, wizard, rotation]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "poolForSlot + orderPoolByLRU (04-04), week_templates/template_slots schema + seed (04-06), start_date + people_multiplier plan header (04-08)"
provides:
  - "WeekWizard.tsx guided-fill accordion component"
  - "'Fill Week' launch button on the WeeklyPlans plan header"
  - "End-to-end consumer of the tag-based rotation pools (WEEK-03 becomes usable, not just stored)"
affects: [weekly-planning-memory, prep-day-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wizard picks write planned_meals via the exact same create()/remove() shape as the manual Add-Meal dialog, plus template_slot — keeps wizard-created and manual meals structurally identical"
    - "Non-optimistic pick writes: chip only shows picked after create() resolves; on failure the chip simply never toggles and an inline Alert renders (no retry queue)"
    - "Staples pre-fill executes real create() writes on wizard open (not just visual pre-toggle), so 'Confirm Staples' is purely an advance action, unifying the write path across all slots"

key-files:
  created:
    - recipe-planner/src/components/WeekWizard.tsx
  modified:
    - recipe-planner/src/pages/WeeklyPlans.tsx

key-decisions:
  - "Staples pre-fill writes planned_meals immediately on wizard open (guarded to only fire when the plan's staples slot has zero existing picks), rather than deferring the write to a Confirm-time batch — collapses two write paths into one and keeps 'Confirm Staples' a pure advance action, while still letting the user un-toggle/re-toggle any pre-filled chip before moving on"
  - "Staples slot is exempted from the auto-advance-on-count-reached effect (only advances via the explicit Confirm Staples tap) so a fully-pre-filled staples slot doesn't silently skip past user review"
  - "Off-pool Autocomplete write is guarded against double-adding a recipe already present in the slot's picks map (prevents an orphaned duplicate planned_meal for the same recipe+slot)"
  - "day is passed to create() as `slot.day ?? null` untyped (no `<PlannedMeal>` generic on the create() call), matching the existing untyped call-site convention in WeeklyPlans.tsx's handleSaveMeal — PlannedMeal.day is typed Day|undefined, not Day|null, so an explicit generic would reject the deliberate null write"

requirements-completed: [WEEK-03, WEEK-04]

coverage:
  - id: D1
    description: "WeekWizard.tsx renders a one-page accordion (not modal stepper) walking template_slots in sort_order, with active/collapsed visual states, N-of-count badges, and auto-advance"
    requirement: "WEEK-04"
    verification:
      - kind: unit
        ref: "npm run build (tsc) — compiles clean"
        status: pass
    human_judgment: true
    rationale: "Visual accordion states (active border, collapsed background, badge/checkmark rendering) require a rendered browser to confirm — no jsdom/component-test harness exists in this project (04-VALIDATION.md, 04-RESEARCH.md Validation Architecture)"
  - id: D2
    description: "Staples slot pre-fills from the previous plan's picks and 'Confirm Staples' advances without re-tapping each chip"
    requirement: "WEEK-04"
    verification: []
    human_judgment: true
    rationale: "Requires a live PocketBase dataset with a prior dated plan to observe the actual pre-fill; no automated harness for wizard UI exists"
  - id: D3
    description: "Non-staples slots order their pool least-recently-planned-first via orderPoolByLRU, tap-to-toggle picks write/delete planned_meals with correct meal_slot/day/template_slot, and a slot is never blocking (Skip/Next always available)"
    requirement: "WEEK-04"
    verification:
      - kind: unit
        ref: "npm run test — src/lib/planning/history.test.ts (orderPoolByLRU/poolForSlot/computeLastPlannedDates, pre-existing from 04-04, unchanged) all pass"
        status: pass
    human_judgment: true
    rationale: "LRU ordering logic itself is unit-tested (04-04); the wizard's live rendering/tap-toggle/write-and-revert flow needs a browser walkthrough against real data — no component-test harness exists this phase"
  - id: D4
    description: "'Fill Week' button on the WeeklyPlans plan header opens WeekWizard for the selected dated plan; manual Add-Meal flow is unaffected"
    requirement: "WEEK-03"
    verification:
      - kind: unit
        ref: "npm run build (tsc) — compiles clean; grep -c 'WeekWizard|Fill Week' src/pages/WeeklyPlans.tsx == 3"
        status: pass
    human_judgment: true
    rationale: "Button placement/enablement and post-close week-view refresh are visual/interactive confirmations, deferred to user UAT per AUTO_MODE checkpoint policy"

# Metrics
duration: 25min
completed: 2026-07-09
status: complete
---

# Phase 4 Plan 9: Guided-Fill Wizard Summary

**One-page MUI Accordion `WeekWizard.tsx` walking seeded `template_slots` in `sort_order`, staples pre-filled from the previous dated plan and written immediately, remaining pools ordered least-recently-planned-first via `orderPoolByLRU`, launched from a new "Fill Week" button beside Add Meal.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-09T21:20:00Z
- **Completed:** 2026-07-09T21:55:11Z
- **Tasks:** 2 auto tasks (+ 1 checkpoint:human-verify auto-approved per AUTO_MODE)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `WeekWizard.tsx`: one-page MUI Accordion (not a modal stepper) that loads the single seeded `week_templates` row + its `template_slots` (sorted by `sort_order`), all recipes, the `recipeTags` map, and an **unfiltered** all-plans/all-planned-meals dataset for LRU history — never plan-scoped, per the 04-RESEARCH.md anti-pattern warning.
- Staples slot (`prefill_from_last_week`) is always accordion #1, always pre-expanded on open. It resolves the previous dated plan (max `start_date` < the current plan's), resolves that plan's picks for the slot (exact `template_slot` match, else tag-membership fallback), sorts them deterministically (name asc), caps at `slot.count`, and **writes them immediately** via the same `create()` path as a manual tap — so the visible "pre-toggled" chips are already real `planned_meals`, and "Confirm Staples" is purely an advance action (never re-blocked on re-tapping). Guarded to skip pre-fill entirely if the plan's staples slot already has picks (reopening the wizard mid-session doesn't clobber prior choices).
- Other slots: pool = `poolForSlot(slot, recipes, recipeTagsMap)` ordered by `orderPoolByLRU(pool, lastPlanned)`; tap-to-toggle `Chip`s (filled = tag color / `SLOT_COLORS` fallback, outlined = unpicked) write/delete `planned_meals` directly and non-optimistically — a chip only shows "picked" after the write resolves, and a failed write leaves it unpicked with an inline `Alert` (`"That pick didn't save. Check your connection and try again."`) under that slot's chip row.
- Every write — staples pre-fill, chip toggle, and off-pool Autocomplete add — uses the identical payload shape: `{ weekly_plan, recipe, meal_slot: slot.meal_slot (never null), day: slot.day ?? null, quantity: 1, template_slot: slot.id }`, matching `handleSaveMeal`'s manual create() call exactly plus `template_slot` (AC#9 parity — wizard meals behave identically to manual ones, and day-specific slots yield non-empty pull lists).
- Accordion visual states per 04-UI-SPEC: active slot gets a 4px `primary.main` left border and white `AccordionSummary`; collapsed slots get a `#fafafa` summary, an outlined grey "N of {count} picked" `Chip`, and (only when full) a small accent `CheckCircle`. Non-staples slots auto-advance once their pick count reaches the slot's target; staples never auto-advances (explicit "Confirm Staples" only), so a fully-matching pre-fill doesn't silently skip past user review.
- A docked "+ Add other recipe" `Autocomplete` (reusing the Add-Meal Autocomplete idiom) sits at the bottom of every expanded slot, writing into that slot's `meal_slot`/`day`; guarded against double-adding a recipe already present in the slot's picks.
- "Skip this slot" (0 picks) / "Next slot" (partial picks) text button is always available — a slot is never blocking.
- Empty states implemented per copy contract: no `week_templates` row → "No week template yet." heading/body; a slot's pool has zero eligible recipes → "No recipes tagged for this slot yet." with the slot's tag name(s), Autocomplete still available.
- "Fill Week" button (`variant="contained"`, `AutoAwesome` icon) added to the `WeeklyPlans.tsx` plan header beside the existing "Add Meal" button, rendered only when a dated plan is selected. Opens `WeekWizard` for that plan; on close, `loadPlannedMeals()` re-runs so wizard-created meals appear in the week grid exactly like manual ones. Manual Add-Meal flow untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: WeekWizard.tsx — accordion, pools, staples pre-fill, writes** - `529526c` (feat)
2. **Task 2: "Fill Week" launch button in WeeklyPlans.tsx** - `0142ef9` (feat)
3. **Task 3: Human walks the full wizard flow** - checkpoint:human-verify, auto-approved per AUTO_MODE (see below)

**Plan metadata:** commit follows this SUMMARY.

## Files Created/Modified

- `recipe-planner/src/components/WeekWizard.tsx` - guided-fill accordion wizard (new)
- `recipe-planner/src/pages/WeeklyPlans.tsx` - "Fill Week" button, wizard mount/open state, close-triggered meal refresh

## Decisions Made

- Staples pre-fill executes real writes on wizard open rather than deferring to a "Confirm"-time batch, unifying every pick (staples pre-fill, manual toggle, off-pool add) onto one `addPick`/`removePick` write path with one error-handling implementation. See `key-decisions` in frontmatter for the full rationale and the guard against clobbering an in-progress session.
- Staples exempted from count-reached auto-advance so pre-filled slots still require an explicit "Confirm Staples" tap before moving on.
- Off-pool Autocomplete guarded against re-adding an already-picked recipe (would otherwise create an orphaned duplicate `planned_meal`).
- `create()` calls for `planned_meals` omit the explicit `<PlannedMeal>` generic (matching the existing `handleSaveMeal` untyped-call convention) because `PlannedMeal.day` is typed `Day | undefined`, not `Day | null`, and the wizard must send an explicit `null` for week-spanning slots.

## Deviations from Plan

None — plan executed as written. The staples "immediate pre-fill write" vs. "defer to Confirm-time batch" ambiguity in D-02's phrasing was resolved via the design decision documented above (both readings satisfy the locked decision text: "pre-toggle its picks... one prominent 'Confirm staples' action that advances without re-tapping each chip... individual chips stay toggleable to drop/add before confirming" — the chosen reading keeps the write path uniform and testable against the same error-handling code all other picks use).

## Issues Encountered

- Initial `create<PlannedMeal>(...)` calls failed `tsc` because `PlannedMeal.day` is typed `Day | undefined` (no `null` in the union) while the wizard must send `day: slot.day ?? null` for week-spanning slots. Fixed by dropping the explicit generic on those two `create()` call sites, matching the existing untyped convention already used by `WeeklyPlans.tsx`'s `handleSaveMeal`. Resolved before commit — not a deviation from the plan's design intent, purely a TypeScript call-site fix (Rule 3 — blocking issue).
- An unused `recipesById` memo (from an earlier draft that inlined recipe-name lookups differently) was removed along with the now-unused `useMemo` import before commit.

## User Setup Required

None - no external service configuration required.

## Human Verification Deferred (Checkpoint Auto-Approved)

Task 3 (`checkpoint:human-verify`) requires walking the live wizard against a running app + real PocketBase data: staples pre-fill against an actual previous dated plan, LRU pool ordering visually, tap-to-toggle, off-pool add, skippability, day-specific pull-list non-emptiness on Outputs (AC#9), and a simulated write-failure revert. Per this execution's AUTO_MODE directive, this checkpoint is **auto-approved for implementation completeness**; the live UAT walkthrough itself is deferred to the user, consistent with the same pattern used at the 04-07 Task 2 checkpoint. `npm run build` (tsc) passes and the full `npm run test` suite (138 tests, 16 files) passes with no regressions — both automated legs of the plan's `<verification>` are green. The interactive/visual legs remain open until the user exercises the running app.

## Next Phase Readiness

- WEEK-03 (tag-based week template) and WEEK-04 (guided-fill wizard) are both implementation-complete; this closes out Phase 4 (weekly-planning-memory) — all 9 plans done pending this checkpoint's live UAT.
- Phase 5 (prep-day engine) can proceed; it does not depend on wizard UI internals, only on `planned_meals` records existing with correct `meal_slot`/`day`/`quantity`, which the wizard now produces identically to manual entries.
- Open item carried to user UAT: confirm in the running app that (a) staples pre-fill actually surfaces last week's picks against real prod/test data, (b) a day-specific slot's pull list is non-empty on the Outputs page, and (c) a simulated write failure reverts the chip and shows the inline error correctly.

---
*Phase: 04-weekly-planning-memory*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: recipe-planner/src/components/WeekWizard.tsx
- FOUND: commit 529526c (Task 1)
- FOUND: commit 0142ef9 (Task 2)
