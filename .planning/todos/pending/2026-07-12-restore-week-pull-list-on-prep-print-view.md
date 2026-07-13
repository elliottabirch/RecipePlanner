---
created: 2026-07-12
title: Restore the week pull list on the prep print view
area: ui
files:
  - recipe-planner/src/components/outputs/BatchPrepPrintView.tsx:40-70 (aggregateInputs)
  - recipe-planner/src/components/outputs/BatchPrepPrintView.tsx:135-205 (PAGE 1 "Batch Prep — Pull List")
  - recipe-planner/src/components/outputs/BatchPrepTab.tsx:37-48 (useReactToPrint)
  - recipe-planner/src/components/outputs/BatchPrepTab.tsx:153-156 (display:none print mount)
  - recipe-planner/src/lib/aggregation.ts:298 (buildBatchPrepListFromFlow)
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts:181 (determineStorageLocation)
  - recipe-planner/src/pages/Outputs.tsx:480 (batchPrepSteps useMemo)
  - recipe-planner/src/styles/printStyles.css
---

## Problem

The Outputs → Batch Prep **print view** used to open with a page-1 pull list: every
ingredient needed for the week, split by fridge / freezer / dry / pantry, with quantities
and tick boxes, so you could walk to the fridge and the pantry and pull everything in one
pass. That list now comes out empty/incomplete, and the print button "doesn't work like it
used to."

**The code was never deleted.** `BatchPrepPrintView.tsx` still renders a
`PAGE 1: Pull List` block (`Batch Prep — Pull List`, grouped by
`STORAGE_LOCATION_ORDER = [Fridge, Freezer, Dry, pantry]`). It is silently producing
nothing useful. Three independent causes, any of which alone would gut the list:

1. **The list is derived from prep steps, not from the week's ingredient demand.**
   `aggregateInputs(batchPrepSteps)` walks only the steps in `batchPrepSteps`, which comes
   from `buildBatchPrepListFromFlow` (`aggregation.ts:298`). That builder **drops steps
   whose outputs use "original packaging"** (`hasOriginalPackagingOutput`), and commit
   `36d0400` ("exclude just_in_time (day-of) steps from prep-day schedule") removed JIT
   steps from the prep schedule. So any ingredient consumed *only* by a day-of/JIT step or
   an original-packaging step is now invisible on the pull list. It stopped being a list of
   "all ingredients for the week" and became "ingredients touched by surviving batch-prep
   steps."

2. **Raw-only filter.** `aggregateInputs` hard-skips
   `if (input.productType !== ProductType.Raw) return;`. Anything modeled as `Stored` or as
   an intermediate product never reaches the list, even when it is a real thing you must
   physically pull out of the fridge.

3. **Print mount is `display: none`.** `BatchPrepTab.tsx:153` mounts
   `<BatchPrepPrintView ref={printRef} />` inside `<Box sx={{ display: "none" }}>`.
   `react-to-print` v3 clones the `contentRef` node; a `display:none` ancestor is a known
   cause of blank / mis-laid-out print output, and it means the `.print-page` /
   `.print-portrait` rules in `printStyles.css` never get real layout. Contrast with the
   `.print-container` + `@media print` approach used at `Outputs.tsx:834`.

Also note: no people-multiplier is applied. `aggregateInputs` sums raw `input.quantity`,
while `buildPullLists` (the *other*, unrelated pull list) correctly scales by
`meal.quantity * peopleMultiplier` via `scaleQuantity`. So printed quantities are wrong for
any plan where the multiplier is not 1.

## Naming collision — read before starting

There are **two different "pull lists"** in this codebase. Do not conflate them:

- `buildPullLists()` (`aggregation.ts:106`) → `PullListsTab` / `PullListPrintView`.
  Per-meal, **just-in-time assembly only** ("what do I take out to assemble Tuesday's
  dinner"). This one works. It is NOT what this todo is about.
- The **week pull list** on the Batch Prep print view — the subject of this todo. Give it a
  distinct name (e.g. `buildWeekPullList`) so the two stop being confused.

## Solution

Source the pull list from the flow graph instead of from the filtered `batchPrepSteps`
array — `productFlowGraph` is already the documented single source of truth, and
`buildShoppingListFromFlow` already reads from it.

Sketch:

- Add `buildWeekPullList(productFlowGraph, peopleMultiplier)` to `src/lib/aggregation.ts`.
  Aggregate **every** product input consumed anywhere in the week's graph (not just Raw,
  and not just batch-prep steps), dedupe by `productName|unit`, and sum quantities.
- Group by `determineStorageLocation(product)` (`product-utils.ts:181`) so fridge / freezer
  / dry / pantry fall out of the existing product model. Guard the grouping: today,
  anything whose location is not one of the four in `STORAGE_LOCATION_ORDER` is **silently
  dropped at render time** — send unknowns to a visible "Other" bucket instead of the void.
- Scale with `scaleQuantity(qty, multiplier, unit)` the way `buildPullLists` does, so
  each-dimension items ceil and continuous units stay fractional.
- Decide explicitly whether already-in-inventory items should be excluded or just marked —
  `checkInventoryStock` / `getReadyToEatInventory` already exist in `aggregation.ts`.
- Keep it a print view (user confirmed). Reuse the page-1 layout already in
  `BatchPrepPrintView`; fix the `display: none` mount so `react-to-print` gets real layout.

Add a unit test alongside `src/lib/aggregation/aggregation-multiplier.test.ts` covering:
JIT-only ingredient appears, original-packaging-step ingredient appears, non-Raw stored
ingredient appears, multiplier scaling, unknown storage location is not dropped.
