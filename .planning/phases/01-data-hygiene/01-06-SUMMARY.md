---
phase: 01-data-hygiene
plan: 06
subsystem: data
tags: [aggregation, typescript, react, mui, units, data-hygiene]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: "Unit enum + canonical units (01-01), convert-or-split aggregation merge (01-03)"
provides:
  - "AggregatedFlowProduct.containerTypeName sourced from products.container_type"
  - "RecipeEditor node-unit input constrained to the Unit enum; unit field is measurement-only"
affects: [02-shopping-state, 05-prep-day-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "containerTypeName threaded via node.expand.product.expand.container_type.name — same expand path already used for store/section"
    - "Enum-bound MUI Select (FormControl + InputLabel + Select + MenuItem) for unit entry, sourced directly from units.ts UNIT_DIMENSIONS keys"

key-files:
  created: []
  modified:
    - recipe-planner/src/lib/aggregation/types.ts
    - recipe-planner/src/lib/aggregation/builders/product-builder.ts
    - recipe-planner/src/lib/aggregation.ts
    - recipe-planner/src/pages/RecipeEditor.tsx

key-decisions:
  - "FridgeFreezerTab/MealContainersTab/PullListsTab required no changes — audit confirmed they already read containerTypeName, not unit, for container display"
  - "Stored-product dedup key in buildMealContainersList switched from product.unit to product.containerTypeName in lockstep with the read-site change, per the plan's T-06-DEDUP mitigation"
  - "Unit input Select stays hidden for stored products (unchanged visibility condition) since containers aren't measured in units; write sites now unconditionally write productUnit regardless of type"

patterns-established:
  - "Enum-bound Select for constrained free-text fields: derive options directly from the domain module's canonical Record/type rather than a duplicated local list"

requirements-completed: [DATA-03]

coverage:
  - id: D1
    description: "containerTypeName threaded through aggregation read path (types, product-builder, aggregation.ts container reads + dedup key)"
    requirement: "DATA-03"
    verification:
      - kind: unit
        ref: "npx vitest run (54 tests, product-builder.test.ts unaffected/still green)"
        status: pass
      - kind: other
        ref: "grep -rn 'is now the container type|is the container type' recipe-planner/src (no matches)"
        status: pass
      - kind: other
        ref: "npx tsc -b --noEmit (clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "RecipeEditor stops writing container-type into node unit; unit input converted to enum-bound Select"
    requirement: "DATA-03"
    verification:
      - kind: other
        ref: "grep -n 'productUnit' recipe-planner/src/pages/RecipeEditor.tsx (both write sites unconditional); grep -qi 'Select'"
        status: pass
      - kind: other
        ref: "npx tsc -b --noEmit (clean)"
        status: pass
    human_judgment: true
    rationale: "Visual/UX confirmation that the Select renders correctly and free-text entry is genuinely blocked in the running app is best verified by a human in the browser; static checks (tsc, grep) confirm the code-level contract but not the rendered UX."

# Metrics
duration: 14min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 6: Remove unit-as-container-type overload Summary

**Threaded `containerTypeName` from `products.container_type` through the aggregated product and stopped the RecipeEditor from ever writing a container name into `recipe_product_nodes.unit`, replacing its free-text unit input with an enum-bound Select.**

## Performance

- **Duration:** 14 min
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `AggregatedFlowProduct` now carries `containerTypeName?: string`, populated in `buildAggregatedProduct` from `node.expand?.product?.expand?.container_type?.name` — the same expand path already used for store/section, no new query needed
- `aggregation.ts` container-name reads in `buildStoredItemsListFromFlow` and `buildMealContainersList`, plus the stored-product dedup key, now source from `containerTypeName` instead of `product.unit`; the stale "unit is now/is the container type" comments are gone
- `RecipeEditor.tsx` write sites (add-product and edit-product handlers) always write `productUnit || undefined` into node `unit`, regardless of product type — stored products no longer overload `unit` with the container name
- The node unit input (both add and edit dialogs) is now an enum-bound MUI `<Select>` sourced from `units.ts`'s `UNIT_DIMENSIONS` keys; free-text unit entry is no longer possible

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread containerTypeName through aggregation (read path)** - `76a34f2` (feat)
2. **Task 2: RecipeEditor — stop writing container into unit + enum unit Select** - `bd3a5fe` (feat)

**Plan metadata:** (pending — committed as part of this close-out)

## Files Created/Modified
- `recipe-planner/src/lib/aggregation/types.ts` - Added `containerTypeName?: string` to `AggregatedFlowProduct`
- `recipe-planner/src/lib/aggregation/builders/product-builder.ts` - Populates `containerTypeName` from the container_type expand path in `buildAggregatedProduct`
- `recipe-planner/src/lib/aggregation.ts` - Container reads (stored items, meal containers) and the dedup key now source from `containerTypeName`; removed stale inline comments
- `recipe-planner/src/pages/RecipeEditor.tsx` - Write-split so node `unit` is always measurement-only; unit input converted to enum-bound `<Select>`

## Decisions Made
- No changes needed to `FridgeFreezerTab.tsx`, `MealContainersTab.tsx`, or `PullListsTab.tsx` — audit confirmed all three already render container name from `containerTypeName` (PullListsTab even reads it directly from `product.expand?.container_type?.name` in `buildPullLists`, bypassing the aggregated-flow-product path entirely)
- Kept the existing visibility rule that hides the unit input entirely for `selectedProduct.type === "stored"` in both dialogs — containers aren't measured in units, so there's nothing for that Select to constrain for stored products; the write-site fix means stored nodes now simply get `unit: undefined` rather than a container name

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `unit` field means measurement-only everywhere in the codebase; container type is sourced exclusively from `products.container_type`
- Existing stored-product nodes whose `unit` still contains a legacy container string from before this fix are out of scope here — Plan 05's `normalize-node-units.js` / Plan 08 human review track that cleanup separately
- Ready for Plan 07/08 or next phase work; no blockers introduced

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED
- FOUND: recipe-planner/src/lib/aggregation/types.ts
- FOUND: recipe-planner/src/lib/aggregation/builders/product-builder.ts
- FOUND: recipe-planner/src/lib/aggregation.ts
- FOUND: recipe-planner/src/pages/RecipeEditor.tsx
- FOUND: commit 76a34f2
- FOUND: commit bd3a5fe
