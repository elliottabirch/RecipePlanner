---
phase: 02-shopping-state-live-substitution
plan: 09
subsystem: ui
tags: [react, mui, shopping-list, have-n, resolution]

# Dependency graph
requires:
  - phase: 02-shopping-state-live-substitution (02-07)
    provides: overlaidShoppingList/groupedShoppingList carrying haveQuantity/remaining/resolution/isResolved; setHaveQuantity/setResolution available on useShoppingState
  - phase: 02-shopping-state-live-substitution (02-08)
    provides: onSwap/onMakeIt/canMakeIt props threaded into ShoppingListTabProps, ShopSwapDialog + confirm-first make-it handler in Outputs.tsx
provides:
  - ShoppingListTab have-N stepper (Remove/value/Add), remaining-to-buy caption, and auto-complete dimming for each non-pantry line
  - Dimmed/struck resolved-line treatment (opacity 0.55 + line-through) with a neutral outlined resolution chip ("Making"/"Skipped"/"Have enough") that un-resolves on tap
  - Per-line Swap and (when eligible) Make-it icon buttons, 48x48 tap targets with explicit aria-labels, delegating to Outputs' onSwap/onMakeIt/canMakeIt props
  - Outputs.tsx now destructures setHaveQuantity from useShoppingState and threads it + setResolution into ShoppingListTab as onSetHaveQuantity/onSetResolution
affects: [02-10 (manual UAT)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared renderLineActions() closure reused by both the have-N line and the pantry-style line, so Swap/Make-it appear on every shopping line without duplicating the eligibility/aria-label logic"
    - "Pantry-style lines keep the existing, unmodified CheckableListItem wrapped in a flex Box alongside the new action buttons — avoids touching CheckableListItem.tsx (out of this plan's file scope) while still satisfying 'each shopping line gets Swap/Make-it'"
    - "GroupedShoppingList/ManualShoppingItem retyped against OverlaidShoppingItem (not AggregatedProduct) so the file can read haveQuantity/remaining/resolution/isResolved directly; manually-added shopping items default to the same unresolved shape overlayShoppingItem produces for a missing shopping_state entry"

key-files:
  created: []
  modified:
    - recipe-planner/src/components/outputs/ShoppingListTab.tsx
    - recipe-planner/src/pages/Outputs.tsx

key-decisions:
  - "Non-pantry lines drop the prior manual checkbox entirely in favor of the have-N stepper — SHOP-02's completion signal is haveQuantity>=needed, not a manual tick; pantry-style lines (isPantry===true) are unchanged, per the plan's explicit 'keep pantry-style lines on the existing simple checkbox'"
  - "Have-N stepper steps by whole units and clamps to [0, totalQuantity] (T-02-17/must_haves 'no negative/over-max') — going over totalQuantity has no additional visible effect since remaining already floors at 0, so capping the displayed have value at total loses no information"
  - "'All set' / '{n} to buy' caption always renders in text.secondary, never MUI's success.main — the app's theme primary (#2e7d32) is byte-identical to MUI's default success.main, so success.main would silently reuse the 10%-budget accent color the UI-SPEC explicitly reserves for CTAs; text.secondary avoids that coincidence entirely"
  - "Swap/Make-it buttons render on every line in the byStore/section groups (pantry-style and non-pantry alike), matching Task 2's 'each shopping line' wording, but are NOT added to the separate bottom Pantry Check section — that section is a pantry-inventory verification list, not a buying/substitution surface"
  - "Un-resolve logic branches on cause: resolution!=='buy' clears back to 'buy' via onSetResolution; a have-complete resolution (resolution==='buy' && remaining<=0) clears via onSetHaveQuantity(key, null) instead, since there is no explicit resolution to reset"

requirements-completed: [SHOP-02, SHOP-04, SHOP-06]

coverage:
  - id: D1
    description: "Each non-pantry shopping line renders a have-N stepper (Remove/value/Add, 48x48 targets, 8px gaps) wired to setHaveQuantity, with a text.secondary '{n} to buy'/'All set' caption and auto-complete dim+strike when have>=needed"
    requirement: "SHOP-02"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Visual dimming/strike-through, stepper touch behavior, and the have-N round trip against a live weekly plan require a manual pass at the store-usability bar (02-10 UAT) — no jsdom/RTL component-test harness exists in this repo per 02-RESEARCH Validation Architecture."
  - id: D2
    description: "Resolved lines (resolution!=='buy' OR have>=needed) render the whole ListItem dimmed+struck with a neutral outlined chip ('Making'/'Skipped'/'Have enough') wrapped in a 48x48 tap target that un-resolves on tap and never disappears from the list (D-05)"
    requirement: "SHOP-02"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "The 'stays visible, easy to un-resolve at a glance' requirement (D-05) is a presentational/interaction judgment call, deferred to the 02-10 UAT checkpoint per 02-RESEARCH Validation Architecture."
  - id: D3
    description: "Every shopping line (pantry-style and non-pantry) gets a Swap icon button (48x48, aria-label 'Swap {productName}') delegating to onSwap; a Make-it icon button (48x48, aria-label 'Make it at home') renders only when canMakeIt(productId) is true, delegating to onMakeIt — hidden entirely (not disabled) when ineligible per D-10"
    requirement: "SHOP-04, SHOP-06"
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Button placement, the swap-dialog/make-it-confirm click-through, and touch-operability on an actual tablet are manual-only per 02-RESEARCH Validation Architecture, deferred to 02-10 UAT."

# Metrics
duration: 25min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 09: Shopping-line UI — have-N stepper, resolved treatment, swap/make-it buttons Summary

**ShoppingListTab now renders a have-N stepper with remaining-to-buy and auto-complete dimming, a dimmed/struck resolved-line treatment with an un-resolve chip, and per-line Swap/Make-it icon buttons — all 48x48 touch targets wired to Outputs' setHaveQuantity/setResolution/onSwap/onMakeIt/canMakeIt.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Have-N stepper (Remove IconButton / centered value / Add IconButton, each 48x48 with 8px gaps) on every non-pantry shopping line, clamped to `[0, totalQuantity]` and calling `onSetHaveQuantity`.
- Remaining-to-buy caption ("{n} to buy" / "All set", `text.secondary`, never the accent-coincident `success.main`) alongside the stepper.
- Whole-row dimmed+struck treatment (`opacity: 0.55` + line-through) for any resolved line (resolution `make`/`skip`, or have-complete), with a neutral outlined resolution chip ("Making"/"Skipped"/"Have enough") wrapped in a 48x48 tap target that un-resolves on tap — resolved lines stay visible in the DOM (D-05).
- Swap icon button (48x48, `aria-label="Swap {productName}"`) on every shopping line in the store/section groups; a Make-it icon button (48x48, `aria-label="Make it at home"`) renders only when the line's product is make-it eligible (`canMakeIt`), hidden entirely otherwise (D-10).
- `GroupedShoppingList`/`ManualShoppingItem` retyped against `OverlaidShoppingItem` so the tab can read `haveQuantity`/`remaining`/`resolution`/`isResolved` directly; manually-added shopping items overlay to the same unresolved defaults as a missing `shopping_state` row.
- Outputs.tsx now destructures `setHaveQuantity` (previously left undestructured pending this plan) and threads it plus `setResolution` into `ShoppingListTab` as `onSetHaveQuantity`/`onSetResolution`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Have-N stepper + remaining-to-buy + resolved-line treatment + resolution chip** - `f3303f5` (feat)
2. **Task 2: Per-line Swap and Make-it buttons wired to Outputs props** - `7ccd845` (feat)

## Files Created/Modified
- `recipe-planner/src/components/outputs/ShoppingListTab.tsx` - Have-N stepper, remaining caption, resolved dim/strike treatment + un-resolve chip, per-line Swap/Make-it buttons; `GroupedShoppingList`/manual-item shape retyped to `OverlaidShoppingItem`
- `recipe-planner/src/pages/Outputs.tsx` - Destructures `setHaveQuantity` from `useShoppingState`; passes `onSetHaveQuantity`/`onSetResolution` to `ShoppingListTab`

## Decisions Made
- Non-pantry lines drop the prior manual checkbox entirely in favor of the have-N stepper as the completion signal (SHOP-02); pantry-style lines are untouched, exactly per the plan's "keep pantry-style lines on the existing simple checkbox."
- Have-N stepper steps by whole units and clamps to `[0, totalQuantity]` — satisfies the threat model's "no negative/over-max" mitigation without losing information, since `remaining` already floors at 0 beyond that point.
- "All set"/"{n} to buy" always renders in `text.secondary`, not MUI's `success.main` — this app's theme `primary.main` (`#2e7d32`) is byte-identical to MUI's default `success.main`, so using `success.main` here would silently spend the UI-SPEC's 10%-accent budget; `text.secondary` sidesteps the coincidence entirely.
- Swap/Make-it buttons appear on every line within the byStore/section groups (pantry-style included, via a thin wrapper around the unmodified `CheckableListItem`) but are intentionally NOT added to the separate bottom "Pantry Check" section, since that section verifies pantry stock rather than buying/substituting a product.
- Un-resolve branches on cause: `resolution !== 'buy'` resets via `onSetResolution(key, 'buy')`; a have-complete resolution (`resolution === 'buy' && remaining <= 0`) clears via `onSetHaveQuantity(key, null)` instead, since there's no explicit resolution value to reset in that case.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Destructured `setHaveQuantity` and wired `onSetHaveQuantity`/`onSetResolution` through `Outputs.tsx`**
- **Found during:** Task 1
- **Issue:** This plan's `files_modified` declares only `ShoppingListTab.tsx`, but the have-N stepper and resolution-chip un-resolve action are functionally inert without a way to call `setHaveQuantity`/`setResolution` from inside the component — 02-07 deliberately left `setHaveQuantity` undestructured in `Outputs.tsx` for this plan to pull in, and neither `useShoppingState`'s setters nor a matching prop existed on `ShoppingListTab` before this change. Skipping this edit would mean the stepper renders but produces no persisted effect, failing the plan's `must_haves.key_links` ("stepper → setHaveQuantity; chip tap → setResolution('buy')/clear have").
- **Fix:** Added `setHaveQuantity` to `Outputs.tsx`'s `useShoppingState` destructuring, and added `onSetHaveQuantity`/`onSetResolution` props to `ShoppingListTab`'s call site (`onSetHaveQuantity={setHaveQuantity}` / `onSetResolution={setResolution}`), mirroring 02-08's own precedent of extending `ShoppingListTabProps` from within the "other" plan's file scope to keep a dependent plan's call site compiling and functional.
- **Files modified:** `recipe-planner/src/pages/Outputs.tsx`
- **Verification:** `cd recipe-planner && npx tsc -b` passes; `npx vitest run` (90 tests, 9 files) unchanged; `npx eslint` clean (one pre-existing, unrelated warning in `handleConfirmMakeIt`'s dependency array, untouched by this plan).
- **Committed in:** `f3303f5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — required for the stepper/chip to have any functional effect)
**Impact on plan:** Minimal, additive, and required for correctness. No scope creep — `ShoppingListTab.tsx` remains the only file with new rendering logic; the `Outputs.tsx` edit is pure prop-threading, exactly mirroring the pattern 02-08 already established in reverse.

## Issues Encountered
None. `npx tsc -b` was clean on the first attempt for both tasks; the full Vitest suite (90 tests, 9 files) passed unchanged throughout; `npx eslint` reported no new issues.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ShoppingListTab` now fully consumes the overlaid shopping-line fields (`haveQuantity`/`remaining`/`resolution`/`isResolved`) established in 02-07 and the `onSwap`/`onMakeIt`/`canMakeIt` props established in 02-08 — all three of this phase's shopper-facing UI surfaces (have-N, resolved treatment, swap/make-it) are now wired end-to-end and type-checked.
- Live manual verification of the full store-time flow (have-N round trip against a running weekly plan, resolved-line dim/un-resolve, swap dialog open, make-it confirm-then-dim) is deferred to the 02-10 UAT checkpoint per 02-RESEARCH Validation Architecture — no live-PocketBase/component-test harness exists in this repo.
- No blockers for 02-10.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/src/components/outputs/ShoppingListTab.tsx
- FOUND: recipe-planner/src/pages/Outputs.tsx
- FOUND: f3303f5
- FOUND: 7ccd845
