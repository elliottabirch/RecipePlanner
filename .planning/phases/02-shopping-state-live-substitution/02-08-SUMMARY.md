---
phase: 02-shopping-state-live-substitution
plan: 08
subsystem: ui
tags: [react, mui, pocketbase, shopping-list, product-substitution]

# Dependency graph
requires:
  - phase: 02-shopping-state-live-substitution
    provides: getMealNodeTargetsForProduct/SwapTarget (02-03), VariantOverride.quantity/unit + applyVariantOverrides inherit-when-null (02-02), shoppingState collection + useShoppingState.setResolution (02-05/02-06), Outputs.tsx wired to the hook + overlay/export filter (02-07)
provides:
  - QuickCreateProductDialog (name + store/section + unit-as-enum, returns Product)
  - ShopSwapDialog (per-meal checklist, pre-filled qty/unit, replacement Autocomplete, inline quick-create)
  - Outputs.tsx swap-save handler (scoped delete+recreate meal_variant_overrides incl. quantity/unit) + refreshCounter bump
  - Outputs.tsx confirm-first make-it handler gated on product.source_recipe
  - onSwap/onMakeIt/canMakeIt props threaded into ShoppingListTab's prop interface
affects: [02-09 (ShoppingListTab have-N + swap/make-it buttons), 02-10 (manual UAT)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped delete+recreate for meal_variant_overrides: filter by (planned_meal, original_node ∈ touched nodeIds) rather than WeeklyPlans' whole-meal delete, so a single-product store-time swap never clobbers an unrelated planning-time override in the same meal"
    - "Nested dialog returns a created entity into the parent's local session state (QuickCreateProductDialog → ShopSwapDialog's extraProducts), never touching the parent page's own catalog state"
    - "Forward-declaring optional callback props on a not-yet-consuming component (ShoppingListTabProps.onSwap/onMakeIt/canMakeIt) so a dependent plan's call site compiles ahead of the consuming plan's rendering work"

key-files:
  created:
    - recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx
    - recipe-planner/src/components/outputs/ShopSwapDialog.tsx
  modified:
    - recipe-planner/src/pages/Outputs.tsx
    - recipe-planner/src/components/outputs/ShoppingListTab.tsx
    - recipe-planner/src/components/outputs/index.ts

key-decisions:
  - "Swap-save scopes its delete+recreate to only the recipe_product_node IDs a given swap touches (not every override for the whole meal) — a deliberate refinement of WeeklyPlans.handleSaveVariants' whole-meal delete, needed because ShopSwapDialog edits one product at a time and a meal-wide delete would silently destroy an unrelated planning-time swap in the same meal"
  - "onSwap/onMakeIt callbacks receive the full AggregatedProduct item (not just productId) so 02-09 and this plan's make-it handler have both productId (product/source_recipe lookup) and lineId (shopping_state key) without a second lookup"
  - "QuickCreateProductDialog defaults new products to ProductType.Raw (purchasable ingredient) since the UI-SPEC's four fields (name/store/section/unit) don't include a type selector"
  - "Products loaded once on Outputs mount (not on refreshCounter) with source_recipe expanded; a quick-created product is threaded into ShopSwapDialog's own session-local extraProducts state instead of triggering a full products refetch"

requirements-completed: [SHOP-03, SHOP-04, SHOP-05]

coverage:
  - id: D1
    description: "QuickCreateProductDialog collects name + store/section + unit-as-enum, gates the Create CTA on name+unit, and returns the created product via onCreated"
    requirement: SHOP-05
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Dialog interaction/failure-copy/nested-modal behavior has no component-test harness in this repo (no jsdom/RTL) — manual-only per 02-VALIDATION; tsc only proves the types compile."
  - id: D2
    description: "ShopSwapDialog lists this week's meals via getMealNodeTargetsForProduct, pre-fills per-meal quantity/unit from the node (D-07), gates Save Swap on >=1 checked meal + a replacement, and returns SwapSaveEntry[] to the parent"
    requirement: SHOP-03
    verification:
      - kind: unit
        ref: "src/lib/shopping-mapping.test.ts"
        status: pass
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "The mapping helper's own logic is unit-tested (02-03), but the dialog's checklist rendering, quick-create hand-off, and empty-state require manual UAT (02-10) per 02-VALIDATION — no component-test harness exists in this repo."
  - id: D3
    description: "Outputs.tsx swap-save handler writes/extends meal_variant_overrides (with quantity/unit) scoped to the touched node(s) per checked meal, then bumps refreshCounter so all six outputs re-derive"
    requirement: SHOP-03
    verification:
      - kind: unit
        ref: "src/lib/aggregation/utils/variant-utils.test.ts"
        status: pass
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "The inherit-when-null threading through applyVariantOverrides is unit-tested (02-02); the live write-then-re-derive round trip against PocketBase is manual-only per 02-VALIDATION (no live-PB test harness in this repo)."
  - id: D4
    description: "Make-it is available only when product.source_recipe is set, confirms first via a dedicated Dialog, then calls handleAddRecipeToPlan + setResolution('make')"
    requirement: SHOP-04
    verification:
      - kind: unit
        ref: "cd recipe-planner && npx tsc -b"
        status: pass
    human_judgment: true
    rationale: "Confirm-dialog UX and the D-10 gating are manual-only per 02-VALIDATION; canMakeIt's boolean logic is trivial and covered indirectly by the tsc build, but the actual click-through flow needs human UAT (02-10)."

# Metrics
duration: ~35min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 08: Mid-shop swap dialog + confirm-first make-it Summary

**ShopSwapDialog (meal checklist + pre-filled qty/unit + inline QuickCreateProductDialog) and Outputs.tsx's scoped delete+recreate swap-save and confirm-first make-it handlers, wired to a `ShoppingListTabProps` prop surface ready for 02-09's buttons**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `QuickCreateProductDialog` — minimal name/store/section/unit-as-enum product creation, returning the created product straight into a picker without leaving the flow (D-08/D-12)
- `ShopSwapDialog` — per-meal checklist built from `getMealNodeTargetsForProduct` (02-03), pre-filled quantity/unit (D-07), replacement Autocomplete reusing `VariantEditorDialog`'s exact filter/sort shape, and inline quick-create hand-off
- Outputs.tsx swap-save handler: scoped delete+recreate of `meal_variant_overrides` (including `quantity`/`unit`) per checked meal, then a `refreshCounter` bump that re-derives all six outputs for free
- Outputs.tsx confirm-first make-it handler: gated on `product.source_recipe` (D-10), confirms via a dedicated `Dialog` before calling the existing `handleAddRecipeToPlan` + `setResolution('make')` — never wired directly like `OutOfStockSection` (Pitfall 4)
- `onSwap`/`onMakeIt`/`canMakeIt` threaded down to `ShoppingListTab` as props, with the prop interface extended so 02-09's rendering work has a compiling call site to build against

## Task Commits

Each task was committed atomically:

1. **Task 1: QuickCreateProductDialog** - `f35a743` (feat)
2. **Task 2: ShopSwapDialog** - `4b85d7c` (feat)
3. **Task 3: Outputs swap-save + confirm-first make-it handlers** - `6806763` (feat)

_No TDD tasks in this plan (manual-only verification per 02-VALIDATION for SHOP-03/04/05 UI flows)._

## Files Created/Modified
- `recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx` - Nested minimal product-creation dialog (Task 1)
- `recipe-planner/src/components/outputs/ShopSwapDialog.tsx` - Mid-shop swap dialog (Task 2)
- `recipe-planner/src/components/outputs/index.ts` - Barrel exports for both new dialogs + `SwapSaveEntry` type
- `recipe-planner/src/pages/Outputs.tsx` - Products load, swap-save handler, make-it confirm handler, dialogs mounted, props passed to `ShoppingListTab` (Task 3)
- `recipe-planner/src/components/outputs/ShoppingListTab.tsx` - `ShoppingListTabProps` extended with `onSwap`/`onMakeIt`/`canMakeIt` (interface-only; rendering deferred to 02-09)

## Decisions Made
- Swap-save's delete+recreate is scoped to the specific `recipe_product_node` IDs a swap touches, not the whole meal — WeeklyPlans' `handleSaveVariants` deletes every override for a meal because `VariantEditorDialog` is a full-meal editor that already knows about every existing override; `ShopSwapDialog` edits one product at a time, so a whole-meal delete would silently destroy an unrelated planning-time swap co-existing in the same meal. This is a deliberate refinement, not a divergence from the "shared write path" intent — both writers still delete-then-create against the same collection/shape, just with a tighter delete filter for the store-time caller.
- `onSwap`/`onMakeIt` pass the full `AggregatedProduct` item rather than a bare `productId`, since the make-it handler needs both `productId` (product/source_recipe lookup) and `lineId` (the `shopping_state` key for `setResolution`) — passing the whole item avoids a second lookup or prop.
- `QuickCreateProductDialog` defaults created products to `ProductType.Raw` since the UI-SPEC's four fields (name/store/section/unit) intentionally omit a type selector; `raw` is the standard purchasable-ingredient type already used throughout the app's replacement-product filtering.
- Products are loaded once on `Outputs` mount (with `source_recipe` expanded for D-10 gating), independent of `refreshCounter`; a quick-created product is threaded into `ShopSwapDialog`'s own session-local `extraProducts` state (so it appears immediately in that swap's Autocomplete) rather than triggering a full products refetch on every quick-create.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug avoidance] Scoped the swap-save delete+recreate to touched node IDs, not the whole meal**
- **Found during:** Task 3 (Outputs swap-save handler)
- **Issue:** The plan's action text describes mirroring `WeeklyPlans.handleSaveVariants`'s "delete existing overrides for that meal, then recreate" shape literally. Copied verbatim, a single-product swap would delete ALL `meal_variant_overrides` for the touched meal — including any unrelated product's override already set via the planning-time `VariantEditorDialog` — because `ShopSwapDialog` (unlike `VariantEditorDialog`) only knows about one product's targets, not the meal's full override set.
- **Fix:** The delete filter additionally requires `entry.nodeIds.includes(o.original_node)`, so only the override(s) for the node(s) this specific swap addresses are replaced. Both writers still share the same delete-then-create-per-node shape and collection.
- **Files modified:** `recipe-planner/src/pages/Outputs.tsx`
- **Verification:** `cd recipe-planner && npx tsc -b` passes; reasoning verified by code review against `WeeklyPlans.tsx:476-499`.
- **Committed in:** `6806763` (Task 3 commit)

**2. [Rule 3 - Blocking] Extended `ShoppingListTabProps` with `onSwap`/`onMakeIt`/`canMakeIt`**
- **Found during:** Task 3 (Outputs — passing props to ShoppingListTab)
- **Issue:** The plan's Task 3 acceptance criteria requires "`onSwap`/`onMakeIt` props are passed to ShoppingListTab", but `ShoppingListTab.tsx` is 02-09's declared file, not this plan's. Passing undeclared JSX props to a typed component is a TypeScript excess-property error — `cd recipe-planner && npx tsc -b` would fail without the interface accepting them.
- **Fix:** Added the three props (`onSwap?`, `onMakeIt?`, `canMakeIt?`) to `ShoppingListTabProps` as optional, undocumented-beyond-type declarations — no rendering logic added, matching 02-09's explicit "this task only renders the buttons and delegates to the props" framing. 02-09 will implement the actual button rendering against this already-compiling interface.
- **Files modified:** `recipe-planner/src/components/outputs/ShoppingListTab.tsx`
- **Verification:** `cd recipe-planner && npx tsc -b` passes.
- **Committed in:** `6806763` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug avoidance, 1 blocking-build fix)
**Impact on plan:** Both changes are minimal, additive, and required for correctness/compilation. No scope creep — 02-09 still owns all `ShoppingListTab` rendering logic.

## Issues Encountered
None beyond the two deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 02-09 can now implement the have-N stepper, resolved-line treatment, and the Swap/Make-it icon buttons against `ShoppingListTab`'s already-extended prop interface (`onSwap`/`onMakeIt`/`canMakeIt`), calling them with the `AggregatedProduct` item per line.
- `ShopSwapDialog`, `QuickCreateProductDialog`, and Outputs' swap-save/make-it handlers are functionally complete and type-checked; full manual UAT (swap re-derivation across tabs, quick-create mid-swap, make-it confirm) is deferred to 02-10 per 02-VALIDATION (no live-PocketBase/component-test harness in this repo).
- No blockers for 02-09.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created/modified files and all three task commit hashes (`f35a743`, `4b85d7c`, `6806763`) verified present on disk / in git log.
