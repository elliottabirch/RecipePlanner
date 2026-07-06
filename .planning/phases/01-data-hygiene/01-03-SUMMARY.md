---
phase: 01-data-hygiene
plan: 03
subsystem: aggregation
tags: [units, aggregation, react, typescript, vitest]

requires:
  - phase: 01-data-hygiene (plan 01)
    provides: units.ts (canConvert/convert/getDimension/chooseDisplayUnit/promoteUnit), canonical_unit/dimension on Product
provides:
  - "product-builder.ts and step-builder.ts merge quantities via convert-or-split instead of blind += (DATA-01)"
  - "AggregatedFlowProduct/AggregatedProduct carry a stable lineId (productId, or productId|dimension when split)"
  - "ShoppingListTab.tsx keys shopping-list rows on lineId; per-source shopping breakdown quantities converted into the merged line's display unit"
affects: ["01-04 (node-unit normalization consumes the same units.ts helpers)", "Phase 2 (persisted shopping checkboxes key on lineId)"]

tech-stack:
  added: []
  patterns:
    - "Convert-or-split merge: resolveMergeTargetKey checks canConvert(existing.unit, incoming.unit); same dimension merges via mergeQuantities (D-10 display-unit selection), different dimension routes to a `${baseKey}|${dimension}` split key"
    - "mergeQuantities() shared helper in product-utils.ts, reused by both product-builder.ts (line totals + mealSources) and step-builder.ts (input/output quantities)"
    - "lineId = productId for the common single-line case, productId|dimension for a split line — carried end-to-end from the builder map key to the shopping-list UI key"

key-files:
  created:
    - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
    - recipe-planner/src/lib/aggregation/builders/step-builder.test.ts
  modified:
    - recipe-planner/src/lib/aggregation/builders/product-builder.ts
    - recipe-planner/src/lib/aggregation/builders/step-builder.ts
    - recipe-planner/src/lib/aggregation/utils/product-utils.ts
    - recipe-planner/src/lib/aggregation/types.ts
    - recipe-planner/src/lib/aggregation.ts
    - recipe-planner/src/components/outputs/ShoppingListTab.tsx

key-decisions:
  - "Display-unit re-derivation (chooseDisplayUnit/promoteUnit) only runs when an actual merge happens (2+ nodes reach the same line), not on a line's first/only insertion — keeps single-ingredient shopping lines showing their as-entered unit unchanged, scoping the D-10 formatting change to the merge bug this plan fixes"
  - "First-arrival dimension claims the bare productId key; any other dimension for the same product gets a stable `productId|dimension` key derived purely from the dimension name, so any number of distinct dimensions can coexist without needing to search for prior split entries"
  - "mealSources now carries each source's original unit so per-recipe shopping breakdowns can be converted into the line's display unit at read time (aggregation.ts), instead of mislabeling raw pre-conversion quantities with the final merged unit"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "product-builder.ts merges same-dimension quantities via convert-or-split (D-10 display unit) and splits cross-dimension quantities into a distinct, stable lineId — the white-bean-stew anchor (0.25 cup + 2 tbsp) merges to one correct line"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/lib/aggregation/builders/product-builder.test.ts (6 tests: anchor merge, order-independence, canonical_unit path, cross-dimension split, lineId invariants, per-source unit tracking)"
        status: pass
      - kind: other
        ref: "npx tsc -b --noEmit (clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "step-builder.ts applies the identical convert-or-split rule to step input/output merges"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "src/lib/aggregation/builders/step-builder.test.ts (4 tests: convertible-merge and cross-dimension-separate for inputs and outputs)"
        status: pass
      - kind: other
        ref: "npx tsc -b --noEmit (clean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "lineId threaded through buildShoppingListFromFlow and ShoppingListTab.tsx; shopping rows key on lineId (pantry rows stay on productId); per-source breakdown quantities converted into the line's display unit"
    requirement: DATA-01
    verification:
      - kind: other
        ref: "grep item.lineId src/components/outputs/ShoppingListTab.tsx; npx tsc -b --noEmit; npx vitest run (40/40 pass)"
        status: pass
    human_judgment: true
    rationale: "The visual/UX correctness of split shopping-list rows (no duplicate-key warning, checkbox toggling the right line, breakdown summing to the total on-screen) is a rendering behavior no unit test exercises directly — the app has no component-test harness yet (jsdom/@testing-library/react were left uninstalled per 01-RESEARCH.md's recommendation). Typecheck and the aggregation-layer unit tests confirm the data feeding the UI is correct; a real render was not captured."

duration: 24min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 3: Convert-or-Split Aggregation Fix (DATA-01) Summary

**Fixed the unit-blind `totalQuantity += totalQuantity` bug in product-builder.ts/step-builder.ts with a convert-or-split merge (via a shared `mergeQuantities` helper and D-10 display-unit selection), and threaded a stable `lineId` from the builders through to ShoppingListTab.tsx so split lines never collide.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-07-06T00:11Z (approx.)
- **Completed:** 2026-07-06T00:35Z (approx.)
- **Tasks:** 3
- **Files modified:** 6 (2 created, 6 modified — see key-files, one file overlaps categories)

## Accomplishments
- `product-builder.ts`'s blind `existing.totalQuantity += newProduct.totalQuantity` replaced with `resolveMergeTargetKey` + `mergeQuantities`: same-dimension quantities convert into the D-10 display unit and combine; cross-dimension quantities route to a stable `${productId}|${dimension}` split key instead of producing a false sum
- `step-builder.ts`'s input and output merge sites (previously identical blind `+=`) now use the same convert-or-split rule, keeping cross-dimension step quantities as separate array entries
- `AggregatedFlowProduct`/`AggregatedProduct` carry a new `lineId: string` (== `productId` for the common case, `${productId}|${dimension}` when split) and `canonicalUnit?: Unit`, threaded end-to-end to `ShoppingListTab.tsx`, which now keys shopping-list rows (checkbox key + React `key`) on `lineId` instead of `productId`
- Per-recipe shopping-list source breakdowns (`sources[].quantity`/`.unit`) are now converted into the merged line's display unit at `buildShoppingListFromFlow` time, so the breakdown visibly sums to the line total instead of mislabeling pre-conversion raw quantities with the final unit

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert-or-split in product-builder + lineId on types** - `a63da81` (feat)
2. **Task 2: Convert-or-split in step-builder (inputs + outputs)** - `b3c918d` (feat)
3. **Task 3: Thread lineId through shopping list + per-source converted display** - `5a51545` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/aggregation/builders/product-builder.ts` - `resolveMergeTargetKey` (dimension-suffixed split routing) + `mergeQuantities`-based merge for line totals and mealSources; sets `lineId`/`canonicalUnit` on every entry
- `recipe-planner/src/lib/aggregation/builders/product-builder.test.ts` - White-bean anchor merge, order-independence, canonical_unit display path, cross-dimension split, lineId invariants, per-source unit tracking (6 tests)
- `recipe-planner/src/lib/aggregation/builders/step-builder.ts` - Convert-or-split for `addOrMergeStep`'s input and output merge sites, reusing `mergeQuantities`
- `recipe-planner/src/lib/aggregation/builders/step-builder.test.ts` - Convertible-merge and cross-dimension-separate coverage for both inputs and outputs (4 tests)
- `recipe-planner/src/lib/aggregation/utils/product-utils.ts` - New `mergeQuantities()` shared helper (D-10 display-unit selection via `chooseDisplayUnit`); `MealSource`/`createMealSource`/`addMealSource` now carry each source's original `unit`
- `recipe-planner/src/lib/aggregation/types.ts` - Added `lineId: string` and `canonicalUnit?: Unit` to `AggregatedFlowProduct`; added `lineId: string` to `AggregatedProduct`; `mealSources` entries now include `unit: string`
- `recipe-planner/src/lib/aggregation.ts` - `buildShoppingListFromFlow` carries `product.lineId` onto each `AggregatedProduct` and converts each `mealSources[]` entry into the line's display unit
- `recipe-planner/src/components/outputs/ShoppingListTab.tsx` - Shopping-list row checkbox key + React `key` now use `item.lineId`; manual (store-bought) items get a matching synthetic `lineId`; pantry rows unchanged (still keyed on `productId`)

## Decisions Made
- Display-unit re-derivation only fires on an actual merge (2+ nodes reaching the same line), not on first/only insertion — avoids silently reformatting every already-correct single-ingredient shopping line as a side effect of this bug fix (scope discipline; single-line display formatting was never part of DATA-01's bug report)
- First-arrival dimension claims the bare `productId` line; a later, different-dimension node for the same product gets `${productId}|${dimension}` — the key is a pure function of the dimension name, so a third or fourth distinct dimension for the same product converges correctly without needing to search existing split entries
- `mealSources` now stores each source's original unit (previously untracked) so the per-recipe shopping breakdown can be converted correctly instead of relabeling raw quantities with the wrong unit — a latent instance of the same DATA-01 defect class that the plan's Task 3 truth criterion ("breakdown visibly sums to the line total") required fixing
- Only `canConvert`/`getDimension` (not `convert`) are imported directly into `product-builder.ts`/`step-builder.ts`; the actual quantity math lives in the shared `mergeQuantities` helper — importing `convert` unused would fail the project's `noUnusedLocals`/`verbatimModuleSyntax` typecheck

## Deviations from Plan

None - plan executed as written; the items above are implementation-detail decisions within the plan's declared "Claude's Discretion" scope (CONTEXT.md: `mergeQuantities` helper vs inlining; D-10 fallback formatting details), not Rule 1-4 auto-fixes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `npx tsc -b --noEmit` clean and full `npx vitest run` green (40/40 tests across 3 files) at the end of this plan
- `lineId` is now the stable identity Phase 2's persisted-checkbox feature should key on — confirmed `lineId === productId` for the common (non-split) case, so no existing checkbox state needs migration
- No visual/UX verification was captured for the split-line rendering in `ShoppingListTab.tsx` (no component-test harness exists yet — see coverage D3 rationale); worth a quick manual smoke check when Phase 2 wires up persisted checkboxes against real split-line data
- Node-unit normalization (DATA-05, next plan) still needs to run before real `recipe_product_nodes.unit` values are guaranteed to be clean enum tokens; this plan's convert-or-split logic assumes normalized unit strings (casts `unit: string` to `Unit` at the merge boundary) and will surface a `TypeError`-free but semantically-null `canConvert` result for un-normalized/garbage unit strings until that normalization lands

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/src/lib/aggregation/builders/product-builder.ts
- FOUND: recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
- FOUND: recipe-planner/src/lib/aggregation/builders/step-builder.ts
- FOUND: recipe-planner/src/lib/aggregation/builders/step-builder.test.ts
- FOUND: recipe-planner/src/lib/aggregation/utils/product-utils.ts
- FOUND: recipe-planner/src/lib/aggregation/types.ts
- FOUND: recipe-planner/src/lib/aggregation.ts
- FOUND: recipe-planner/src/components/outputs/ShoppingListTab.tsx
- FOUND: commit a63da81
- FOUND: commit b3c918d
- FOUND: commit 5a51545
