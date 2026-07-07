---
phase: 03-product-registry-seeding
plan: 02
subsystem: search
tags: [fuse.js, fuzzy-search, mui-autocomplete, react, typescript]

# Dependency graph
requires:
  - phase: 01-data-hygiene
    provides: Product type / units.ts canonical_unit/dimension fields the search module passes through untouched
provides:
  - Single reusable searchProducts(query, products) fuzzy/token search module (fuse.js-backed)
  - Fuzzy wiring at all 5 existing product-search surfaces (registry list, 2x RecipeEditor Autocomplete, ProductForm dup-check, ShopSwapDialog Autocomplete)
affects: [03-registry-seeding remaining plans, quick-create/Search-USDA plan (reuses same searchProducts + fuse.js config)]

# Tech tracking
tech-stack:
  added: ["fuse.js@7.4.2"]
  patterns:
    - "Single fuse.js-backed searchProducts<T extends Product>(query, products) module reused across every search surface instead of per-site substring filters"
    - "Sorted-token synthetic key (_sortedTokens) composed on top of fuse.js's multi-key search for word-order-independent matching"
    - "MUI Autocomplete filterOptions + onInputChange-tracked local state to drive dynamic noOptionsText copy"

key-files:
  created:
    - recipe-planner/src/lib/search/product-search.ts
    - recipe-planner/src/lib/search/product-search.test.ts
  modified:
    - recipe-planner/package.json
    - recipe-planner/package-lock.json
    - recipe-planner/src/pages/registries/Products.tsx
    - recipe-planner/src/pages/RecipeEditor.tsx
    - recipe-planner/src/components/ProductForm.tsx
    - recipe-planner/src/components/outputs/ShopSwapDialog.tsx

key-decisions:
  - "searchProducts is generic (<T extends Product>) and preserves original object identity via an internal __original reference, rather than returning the fuse.js-augmented object with a leaked _sortedTokens field — keeps every call site's existing type (e.g. ProductExpanded) intact with no downstream leakage"
  - "RecipeEditor's two product-picker Autocompletes and ShopSwapDialog's replacement Autocomplete track the current free-text input via a new onInputChange-driven state variable, since MUI's noOptionsText prop is a static ReactNode, not a function of inputValue"

patterns-established:
  - "Reuse the single searchProducts module for every future product-search surface (Search-USDA quick-create tab plan should follow the same fuse.js config shape via a sibling usda-lookup.ts, per 03-RESEARCH.md)"

requirements-completed: [REG-02]

coverage:
  - id: D1
    description: "searchProducts() ranks 'tomato paste' first for the reordered query 'paste tomato' (word-order independence)"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/search/product-search.test.ts#ranks 'tomato paste' first for the reordered query 'paste tomato' (word-order independence)"
        status: pass
    human_judgment: false
  - id: D2
    description: "searchProducts() matches 'garbanzo' for the typo query 'garbonzo' (per-term typo tolerance)"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/search/product-search.test.ts#matches 'garbanzo' for the typo query 'garbonzo' (per-term typo tolerance)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Empty/whitespace-only query passes the full products array through unchanged"
    requirement: "REG-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/search/product-search.test.ts#returns the full products array unchanged for an empty query"
        status: pass
      - kind: unit
        ref: "recipe-planner/src/lib/search/product-search.test.ts#returns the full products array unchanged for a whitespace-only query"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 5 product-search call sites (registry list, RecipeEditor x2, ProductForm dup-check, ShopSwapDialog) route through the single searchProducts module — visual reordering + dynamic no-results copy, no visual/behavioral regression"
    requirement: "REG-02"
    verification:
      - kind: other
        ref: "grep -rl 'lib/search/product-search' across the 4 component files == 4; npx tsc -b --noEmit clean"
        status: pass
    human_judgment: true
    rationale: "Wiring is grep/typecheck-verified and full unit + full vitest suite (95/95) stays green, but the actual reordered-result UX and empty-state copy across 5 live UI surfaces (registry table, 2 RecipeEditor dialogs, ProductForm warning, ShopSwapDialog picker) has no automated_ui/e2e coverage in this repo's test setup — a human should spot-check at least one surface in the running app before sign-off."

duration: 15min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 2: Fuzzy Product Search Summary

**Single fuse.js-backed `searchProducts()` module (sorted-token key for word-order independence) wired into all 5 existing product-search surfaces, replacing five divergent naive-substring implementations.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified) + package.json/package-lock.json

## Accomplishments
- Added `fuse.js@7.4.2` (pinned, pre-cleared in 03-RESEARCH.md's Package Legitimacy Audit) and built `searchProducts(query, products)` — a single reusable fuzzy/token search module weighting `name` (0.6) and a synthetic alpha-sorted-token key (0.4), `threshold: 0.35`, `ignoreLocation: true`
- Test-first (TDD): wrote `product-search.test.ts` covering word-order independence ("paste tomato" → "tomato paste" first), typo tolerance ("garbonzo" → "garbanzo"), and empty/whitespace passthrough; confirmed RED (module didn't exist) before implementing to GREEN
- Wired the same module into all 5 call sites: `Products.tsx` registry list filter, both `RecipeEditor.tsx` product-picker Autocompletes (Add Product Node + Edit Product Node), `ProductForm.tsx` duplicate-check, and `ShopSwapDialog.tsx` replacement-product Autocomplete
- Added dynamic `noOptionsText` ("No products match \"{query}\"") to the three MUI `Autocomplete` sites via a new `onInputChange`-tracked local state variable per dialog, since MUI's `noOptionsText` prop cannot itself read `inputValue`

## Task Commits

Each task was committed atomically:

1. **Task 1: fuse.js dependency + searchProducts module (test-first)** - `c818f05` (feat)
2. **Task 2: Wire searchProducts into all 5 call sites** - `f4d2db7` (feat)

**Plan metadata:** (this commit, docs)

_Note: Task 1 is a single `feat` commit rather than separate test→feat commits — the task-level TDD flow (RED confirmed via `npx vitest run`, then implemented to GREEN) was carried out before the single commit per the plan's task boundary; both the test and implementation landed together since the plan defined them as one task's artifact set._

## Files Created/Modified
- `recipe-planner/src/lib/search/product-search.ts` - `searchProducts<T extends Product>(query, products): T[]` fuse.js wrapper; generic + identity-preserving (no leaked `_sortedTokens` field on returned objects)
- `recipe-planner/src/lib/search/product-search.test.ts` - REG-02 behavior tests (4 cases, all passing)
- `recipe-planner/package.json` / `package-lock.json` - added `fuse.js` 7.4.2 (exact pin)
- `recipe-planner/src/pages/registries/Products.tsx` - `filteredItems` now routes through `searchProducts`
- `recipe-planner/src/pages/RecipeEditor.tsx` - both product-picker `Autocomplete`s get `filterOptions` + dynamic `noOptionsText`; added `productSearchInput` state shared by the two dialogs (only one open at a time)
- `recipe-planner/src/components/ProductForm.tsx` - `potentialDuplicates` routes through `searchProducts`, `editingProductId` exclusion and `hasExactMatch`/Alert copy unchanged
- `recipe-planner/src/components/outputs/ShopSwapDialog.tsx` - replacement-product `Autocomplete` gets `filterOptions` + dynamic `noOptionsText` via new `replacementSearchInput` state; `groupBy`/`renderOption` unchanged

## Decisions Made
- `searchProducts` made generic (`<T extends Product>`) and returns the exact original object reference (via an internal `__original` map, stripped before returning) rather than the fuse.js-indexed object carrying a leaked `_sortedTokens` field — keeps `ProductExpanded` and other call-site-specific extensions intact with zero downstream shape drift. This is a direct-correctness improvement over the research doc's literal snippet (which would have returned an augmented object), applied under deviation Rule 1 (bug prevention: a leaked internal field flowing into consuming components/UI is a latent correctness hazard).
- Since MUI's `Autocomplete.noOptionsText` prop is a static `ReactNode` and cannot itself read the live `inputValue`, added a small `onInputChange`-tracked state variable at each of the 3 `Autocomplete` sites (2 in RecipeEditor sharing one variable since only one of its two dialogs is open at a time, 1 in ShopSwapDialog) to drive the plan's specified dynamic `"No products match \"{query}\""` copy. This is additive plumbing required to satisfy the plan's own acceptance criteria and the UI-SPEC's copy contract — not a scope expansion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug prevention] searchProducts returns original object references instead of fuse.js-augmented objects**
- **Found during:** Task 1 (implementing `product-search.ts`)
- **Issue:** The research doc's literal Pattern 1 snippet spreads `_sortedTokens` onto each product and returns `fuse.search(query).map(r => r.item)` directly — so every ranked result would carry a stray internal `_sortedTokens` string field not present on unranked results (e.g. the empty-query passthrough), a latent type/shape inconsistency that could leak into any component that spreads or serializes a search result.
- **Fix:** Made `searchProducts` generic over `T extends Product`, and returns `result.item.__original` (the untouched input object) rather than the augmented indexed copy.
- **Files modified:** `recipe-planner/src/lib/search/product-search.ts`
- **Verification:** `product-search.test.ts` passes; `npx tsc -b --noEmit` clean across all 4 wired components (confirms the generic signature is compatible with `ProductExpanded[]`, `Product[]`, etc.)
- **Committed in:** `c818f05` (Task 1 commit)

**2. [Rule 2 - Missing critical functionality] Added inputValue-tracking state for dynamic noOptionsText**
- **Found during:** Task 2 (wiring RecipeEditor and ShopSwapDialog Autocompletes)
- **Issue:** The plan/UI-SPEC specify a dynamic `noOptionsText` string interpolating the current query (`No products match "{inputValue}"`), but MUI's `Autocomplete.noOptionsText` prop type is a static `ReactNode` — it has no built-in way to read the live input text.
- **Fix:** Added `onInputChange` handlers writing to small new state variables (`productSearchInput` in RecipeEditor, shared across its two dialogs; `replacementSearchInput` in ShopSwapDialog) and interpolated them into `noOptionsText`.
- **Files modified:** `recipe-planner/src/pages/RecipeEditor.tsx`, `recipe-planner/src/components/outputs/ShopSwapDialog.tsx`
- **Verification:** `npx tsc -b --noEmit` clean; manual code review confirms only one of RecipeEditor's two dialogs is ever open at a time, so sharing one tracker variable is safe.
- **Committed in:** `f4d2db7` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug-prevention, 1 missing-critical-functionality)
**Impact on plan:** Both changes were necessary to meet the plan's own acceptance criteria (identity-preserving search results; dynamic no-results copy per 03-UI-SPEC.md). No scope creep — no new files beyond the plan's `files_modified` list, no architectural changes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `searchProducts` is the single reusable fuzzy-search primitive; the remaining Phase 3 plans (Search-USDA quick-create mode, per 03-RESEARCH.md's `usda-lookup.ts` sibling module) can reuse the identical `fuse.js` config shape without re-deriving it.
- Full `npm test` suite (95/95) and `npx tsc -b --noEmit` both clean after this plan; no regressions to existing units/aggregation/linter/sync-queue tests.
- **Human spot-check recommended** (see coverage D4): the reordered-result UX and empty-state copy across the 5 live UI surfaces has automated typecheck/unit coverage but no automated_ui/e2e coverage in this repo — verify at least one surface (e.g. registry search, or a RecipeEditor Autocomplete) in the running app renders the expected reordering/no-results copy before closing out the phase.

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*
