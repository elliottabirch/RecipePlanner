# Phase 2: Shopping State & Live Substitution - Research

**Researched:** 2026-07-06
**Domain:** React 19 SPA state persistence + PocketBase schema/CRUD + flow-graph re-derivation (existing app architecture)
**Confidence:** HIGH (codebase-verified) / MEDIUM (external UI/sync pattern research)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Persisted list state (SHOP-01)**
- **D-01: Persist ALL SIX Outputs tabs**, reworking the three positional key helpers (`getStoredCheckboxKey`, `getPullListCheckboxKey`, `getContainerCheckboxKey` in `src/constants/outputs.ts:332-355`) to emit content-derived stable keys — composites of stable entity IDs, never array index — before persisting those tabs. If a genuinely stable key cannot be derived for a given tab, fall back to leaving that tab in-memory rather than persisting a positional key.
- **D-02:** Shopping/pantry/batch-prep keys are already stable (`getShoppingCheckboxKey(item.lineId)` keys off Phase 1's stable `lineId`). No rework needed for those three.
- **D-03:** Replace the in-memory `checkedItems` Set (`Outputs.tsx:113`) and `toggleChecked` (`Outputs.tsx:592-602`) with a `useShoppingState(weeklyPlanId)` hook backed by a net-new `shopping_state` collection, optimistic local update + background upsert + retry + `pendingCount`/`isSyncing` flag. State scoped per weekly plan.

**Resolution model & buy-list behavior (SHOP-02, SHOP-04)**
- **D-04:** `shopping_state.resolution` enum = `buy` | `make` | `skip` (three states).
- **D-05:** A resolved line (resolution `make` or `skip`, or `have ≥ needed`) stays visible on-screen, shown dimmed/struck. Not hidden from the on-screen list.
- **D-06:** The shopping-list export (`filteredShoppingListForExport`, `Outputs.tsx:336-366`) excludes all resolved lines (make / skip / have-complete). Screen = full picture with state, export = actionable buy list only.

**Mid-shop swap (SHOP-03, SHOP-05)**
- **D-07:** The per-meal quantity/unit field in the swap dialog pre-fills the original node's quantity/unit; user adjusts only if the substitute differs. Inherit-when-null is the default at BOTH persistence and UI layers.
- **D-08:** Quick-create for a missing product lives inline in the swap dialog and returns the new product straight into the replacement picker. Fields: name + store/section + unit.
- **D-09:** Swap must thread substitute quantity/unit through re-derivation (extend `VariantOverride`, override replacement node qty/unit with inherit-when-null, forward qty/unit in the `Outputs.tsx:225-237` map builder). Storing the field without these edits produces zero visible effect.

**Make-it-at-home (SHOP-04)**
- **D-10:** Make-it is gated on the product having a `source_recipe`. No recipe → action unavailable (disabled/hidden).
- **D-11:** When eligible, clicking make-it confirms first ("Add [recipe] to this week and make it instead of buying?") before adding the `planned_meal` via `handleAddRecipeToPlan` and setting `resolution = make`.

**Unit handling — reconciled against completed Phase 1**
- **D-12:** Phase 1 is complete. `src/lib/units.ts` provides the unit enum + dimension; `products.canonical_unit`/`dimension` exist. Use the unit enum now, not free text — `meal_variant_overrides.unit` should carry an enum token, quick-create should be able to set `products.canonical_unit` directly.

**Connectivity (SHOP-07)**
- **D-13:** Optimistic updates + background retry + a pending-sync indicator (`SyncIndicator.tsx` in the Outputs header). In-memory optimistic queue only. Last-write-wins on concurrent device edits. Durable-across-reload queue is out of scope.

### Claude's Discretion
- Collection naming: `shopping_state` vs `plan_line_state` — planner picks; not a user decision.
- Orphaned `shopping_state` rows (line no longer derived): leave inert this phase unless trivially cheap to GC.
- Optimistic retry specifics (backoff, max attempts): planner's call; last-write-wins default.

### Deferred Ideas (OUT OF SCOPE)
- Durable-across-reload optimistic queue (localStorage/IndexedDB persistence of pending writes) — edges toward the explicitly-rejected offline-first model.
- Orphaned `shopping_state` row GC — leave inert this phase.
- Registry-driven upgrades to quick-create + swap product search (fuzzy / "Search USDA") — Phase 3.
- Cook-mode progress persistence reusing this phase's persisted-checkbox mechanism — Phase 5 (soft dependency).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHOP-01 | Shopping checkbox state persists per plan across refresh and device switch | `shopping_state` collection design (Data Model), `useShoppingState` hook pattern (Code Examples), stable-key derivation for all six tabs (Architecture Patterns Pattern 1) |
| SHOP-02 | User can record "have N" per line and see remaining-to-buy | `have_quantity` field + derive-then-overlay memo pattern (Architecture Patterns Pattern 2) |
| SHOP-03 | User can swap a product mid-shop — picking affected meals and entering per-meal quantity/unit — with all outputs re-derived | Shopping-line → node mapping helper (Code Examples), `VariantOverride`/`applyVariantOverrides` threading (Architecture Patterns Pattern 3) |
| SHOP-04 | User can resolve a line as "make it at home", with offer to add the source recipe to the week | `resolution` enum + confirm-first gating (Common Pitfalls #4), reuse of `handleAddRecipeToPlan` |
| SHOP-05 | User can quick-create a product from a phone-friendly minimal dialog | Quick-create field mapping to `products` table (Data Model), inline-dialog-returns-into-picker pattern |
| SHOP-06 | Outputs pages are tablet touch-friendly | MUI touch-target research (Common Pitfalls #6), `CheckableListItem` audit |
| SHOP-07 | Shopping UI works over the tailnet with optimistic updates, retry, and a pending-sync indicator | `useShoppingState` optimistic queue design (Code Examples), Environment Availability (tailnet todo status) |
</phase_requirements>

## Summary

This phase is almost entirely an **implementation-depth problem inside an already-well-factored codebase**, not a new-technology problem. Every architectural piece the phase needs — a single-source-of-truth flow graph (`buildProductFlowGraph`), an existing override mechanism (`meal_variant_overrides` + `applyVariantOverrides`), an existing make-it plumbing (`products.source_recipe`/`handleAddRecipeToPlan`) — already exists and re-derives correctly. The real work is (1) threading missing stable identifiers through interfaces that currently discard them, (2) adding a genuinely new "persist state and overlay it onto derived data" layer that doesn't exist yet, and (3) writing a first-of-its-kind optimistic-sync hook (no prior art in this codebase for retry/pending-queue semantics — `useRecipeQueue.ts` is the only existing hook, and it does a naive `await` + full refetch on every mutation, not optimistic).

The single most important research finding: **the positional-key defect is worse, and the fix is cheaper, than the CONTEXT.md citations imply.** `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey` in `constants/outputs.ts:332-355` are **dead code — never called anywhere in the app**. The real positional keys live inline in four different tab components (`FridgeFreezerTab.tsx:41`, `MealContainersTab.tsx:60`, `MicahMealsTab.tsx:64`, `PullListsTab.tsx:78`), each with a *different* ad-hoc format that doesn't match the unused helpers' signatures. The good news: for two of the three problem tabs, a genuinely stable, collision-free key is trivially available from data the builders already compute internally but never surface on the output objects — this is a "thread an existing value through one more hop," not a new design problem. The third (meal containers) has a data-level limitation (the builder already aggregates by recipe name, losing per-planned-meal identity) that a composite string key does not need to solve — it only needs to not be positional.

**Primary recommendation:** Do not add any new npm dependencies this phase. Build `useShoppingState` as a hand-rolled hook matching the existing `useRecipeQueue.ts` style (this app has no data-fetching/optimistic-update library anywhere), with retry/queue logic extracted into a plain, dependency-free module so it stays unit-testable under the current Vitest `node` environment (no jsdom/RTL needed yet). Thread `lineId` fields through `StoredItem`, `PullListItem`, and `MealContainer.containers[]` using values the builders already compute (`createProductKey(...)` result, `node.id`+`meal.id`, and the builder's own internal `productKey` string, respectively) rather than inventing new identity schemes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Checkbox/have-N/resolution persistence | Database / Storage (PocketBase `shopping_state`) | Browser/Client (optimistic cache) | Must survive refresh/device switch — client-only state cannot satisfy SHOP-01 |
| Derive-then-overlay (have-N remaining, auto-complete, resolution filtering) | Browser / Client | — | Pure read-time join of two already-loaded datasets (flow graph + state map); no new backend logic needed |
| Shopping-line → per-meal-node mapping | Browser / Client | — | Re-derived client-side from already-loaded `plannedMeals` × `recipeData`; no backend query can produce this (aggregation has no back-link) |
| Mid-shop swap persistence (`meal_variant_overrides`) | Database / Storage | Browser/Client (dialog + write) | Same collection/pattern as existing planning-time `VariantEditorDialog`; must survive as durable substitution record |
| Re-derivation after swap (`applyVariantOverrides` → flow graph → all 6 outputs) | Browser / Client | — | Entirely client-side pure-function pipeline already in place; swap is "write override, bump refreshCounter, let existing pipeline run" |
| Make-it action (`resolution='make'` + optional `handleAddRecipeToPlan`) | Browser / Client (trigger) | Database / Storage (`shopping_state.resolution`, `planned_meals` insert) | UI-gated business rule (must confirm first); writes are simple CRUD |
| Quick-create product | Database / Storage (`products` insert) | Browser / Client (minimal dialog) | New `products` row; no new backend validation beyond existing collection rules |
| Optimistic update + retry + pending-sync indicator | Browser / Client | Database / Storage (eventual write target) | Client-side queue/backoff logic; PocketBase has no server-side queue concept to lean on |
| Tablet touch sizing | Browser / Client | — | Pure CSS/MUI prop changes, no data-layer involvement |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | 19.2.0 (installed, verified via `package.json`) `[VERIFIED: npm registry]` | UI runtime | Already the app's framework; no version change needed |
| pocketbase (JS SDK) | 0.26.5 installed; 0.27.0 latest on npm `[VERIFIED: npm registry]` | All CRUD against `shopping_state`/`meal_variant_overrides` | Already the app's sole data-access layer (`src/lib/api.ts`); a minor bump is optional, not required for this phase's features |
| @mui/material / @mui/icons-material | 7.3.6 (installed) `[VERIFIED: npm registry]` | Dialogs, steppers, checkboxes, sync indicator | Already the app's component library across all Outputs tabs |
| vitest | 4.1.10 (installed) `[VERIFIED: npm registry]` | Unit tests for pure logic (key derivation, mapping helper, retry queue, `applyVariantOverrides` threading) | Already the app's test runner; `vitest.config.ts` runs a `node` environment only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | This phase should not add new runtime dependencies — see "Don't Hand-Roll" and Package Legitimacy Audit below for what was deliberately *not* added |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `useShoppingState` optimistic queue | React 19's built-in `useOptimistic` hook | `useOptimistic` gives component-local optimistic echo but does **not** provide retry/backoff or a `pendingCount` across multiple in-flight writes `[CITED: react.dev/reference/react/useOptimistic]` — the phase needs a small queue/retry primitive regardless, so `useOptimistic` would be a thin layer on top of code we still have to write. Skipped for now; revisit only if the hand-rolled hook grows unwieldy. |
| Hand-rolled `useShoppingState` | TanStack Query (`@tanstack/react-query`) mutations with `onMutate` optimistic updates | Would give retry/backoff/optimistic-cache for free, but introduces the app's *first* data-fetching library into a codebase where all ~15 other data consumers use the hand-rolled `getAll`/`create`/`update` wrapper directly. Adopting it for one hook only would fragment the data-access pattern. Not recommended for this phase; worth a dedicated future decision if the app's data needs grow. |
| Manual admin-UI schema changes (see below) | A PocketBase migration script (`pb migrate` / JS migrations) | Every prior phase doc (1, 3, 4, 5, 6) documents schema changes as manual admin-UI edits on both prod/test instances, with `pb_schema.json` re-exported afterward as a record, not a migration source. Introducing real PB migrations now would be a process change orthogonal to this phase's scope — flagged as a future improvement, not adopted here. |

**Installation:** No new packages required.

**Version verification:** `npm view pocketbase version` → `0.27.0` (installed: `0.26.5`, one minor behind, no breaking API change relevant to this phase's usage) `[VERIFIED: npm registry]`. `react`/`@mui/material`/`vitest` versions confirmed directly from the installed `package.json` (see above), not re-verified against registry since no upgrade is proposed.

## Package Legitimacy Audit

No new external packages are recommended for this phase (see Standard Stack / Alternatives Considered — `useOptimistic`, TanStack Query, and PB migration tooling were all considered and deliberately not adopted). No legitimacy check is required.

**Packages removed due to [SLOP] verdict:** none (no new packages proposed).
**Packages flagged as suspicious [SUS]:** none (no new packages proposed).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Outputs.tsx (React 19 SPA)                                          │
│                                                                       │
│  [selectedPlanId] ──┬──> getAll(plannedMeals, meal_variant_overrides)│
│                      │            │                                  │
│                      │            v                                  │
│                      │    applyVariantOverrides(baseRecipeData,      │
│                      │      mealOverrides incl. quantity/unit) ──┐   │
│                      │                                            │  │
│                      v                                            v  │
│              buildProductFlowGraph(plannedMeals, recipeData)         │
│                      │                                                │
│      ┌───────────────┼────────────────┬─────────────┬─────────────┐ │
│      v                v                v             v             v │
│  shopping-list   batch-prep       stored-items   pull-lists   containers
│  (buildShopping  (buildBatchPrep  (buildStored   (buildPull   (buildMeal
│   ListFromFlow)   ListFromFlow)    ItemsFromFlow)  Lists)      ContainersList)
│      │                │                │             │             │
│      └───────┬─────────┴────────────────┴──────┬──────┴─────────────┘
│               v                                  v                    │
│     [NEW] derive-then-overlay memo    (unchanged: batch-prep has     │
│     joins each of the 6 lists' items   no have-N/resolution concept) │
│     against useShoppingState(planId)                                 │
│     map (keyed by each tab's lineId)                                 │
│               │                                                      │
│               ├──> visible list (dimmed/struck for resolved lines)   │
│               └──> filteredShoppingListForExport (resolved excluded) │
│                                                                       │
│  [NEW] useShoppingState(weeklyPlanId) hook:                          │
│    local Map<line_key, ShoppingStateEntry> (optimistic)              │
│         │                                                             │
│         ├─ setChecked/setHaveQuantity/setResolution                  │
│         │      │                                                     │
│         │      v  (immediate, synchronous)                           │
│         │  setState (UI updates instantly)                           │
│         │      │                                                     │
│         │      v  (async, backgrounded)                              │
│         │  pending queue → PocketBase shopping_state                 │
│         │      (create-or-update by weekly_plan+line_key,            │
│         │       retry w/ backoff on failure)                         │
│         └──> pendingCount / isSyncing ──> SyncIndicator.tsx           │
│                                                                        │
│  [NEW] ShopSwapDialog (from a shopping line):                        │
│    1. getMealNodeTargetsForProduct(productId, plannedMeals,          │
│         recipeData) → {plannedMealId, nodeId, quantity, unit}[]      │
│    2. user checks meals + enters per-meal qty/unit (pre-filled)      │
│    3. user picks replacement product (search existing, or            │
│         [NEW] QuickCreateProductDialog inline → returns Product)     │
│    4. save: delete+recreate meal_variant_overrides per (meal, node)  │
│         pair, now including quantity/unit                            │
│    5. bump refreshCounter → entire pipeline above re-derives          │
└─────────────────────────────────────────────────────────────────────┘
                    │
                    v
         PocketBase (prod :8090 / test :8091, LAN today,
         tailnet hostname pending — see Environment Availability)
```

A reader can trace the primary "swap a product at the store" use case: tap swap on a shopping line → dialog queries the mapping helper (client-side, from already-loaded data) → user picks meals + quantities → save writes `meal_variant_overrides` rows → `refreshCounter` bump triggers the existing load-and-derive `useEffect` → `applyVariantOverrides` produces new meal-keyed recipe graphs → `buildProductFlowGraph` and all six list builders re-run → the overlay re-joins against unchanged `shopping_state` → the shopping list, prep list, pull lists, and containers all reflect the substitute, with no separate propagation step required.

### Recommended Project Structure
```
recipe-planner/src/
├── hooks/
│   ├── useRecipeQueue.ts        # existing — style model for the new hook
│   └── useShoppingState.ts      # NEW — optimistic state + retry queue
├── lib/
│   ├── sync-queue.ts            # NEW — pure retry/backoff primitive (no React), unit-testable
│   ├── shopping-overlay.ts      # NEW — derive-then-overlay join logic (pure functions), unit-testable
│   ├── aggregation/
│   │   ├── builders/
│   │   │   ├── product-builder.ts     # thread lineId onto StoredItem via existing createProductKey result
│   │   │   └── flow-builder.ts        # (no change needed)
│   │   ├── utils/
│   │   │   └── variant-utils.ts       # extend VariantOverride + applyVariantOverrides (D-09 items 10a/10b)
│   │   └── types.ts                    # add lineId to StoredItem/PullListItem/MealContainer.containers[]
│   ├── api.ts                    # add collections.shoppingState
│   └── types.ts                  # add ShoppingState(+Expanded), extend MealVariantOverride(+Expanded)
├── components/outputs/
│   ├── SyncIndicator.tsx         # NEW
│   ├── ShopSwapDialog.tsx        # NEW (or refactor-share with VariantEditorDialog.tsx)
│   ├── QuickCreateProductDialog.tsx  # NEW
│   ├── ShoppingListTab.tsx       # add have-N stepper, swap/make-it actions
│   ├── FridgeFreezerTab.tsx      # switch inline `stored-${location}-${idx}` key to getStoredCheckboxKey(item.lineId)
│   ├── MealContainersTab.tsx     # switch inline `meal-container-${idx}-...` key to getContainerCheckboxKey(container.lineId)
│   ├── MicahMealsTab.tsx         # same fix (shares MealContainer type/builder)
│   └── PullListsTab.tsx          # switch inline `pull-${idx}-${storage}-${itemIdx}` key to getPullListCheckboxKey(item.lineId)
└── pages/
    └── Outputs.tsx                # wire useShoppingState in place of checkedItems Set; overlay + export filtering
```

### Pattern 1: Content-derived stable keys for the three positional tabs

**What:** Replace array-index-based checkbox keys with keys built from real entity IDs the builders already compute internally, threaded onto the output interfaces as a `lineId` field — mirroring the pattern Phase 1 already established for the shopping list (`AggregatedFlowProduct.lineId` / `AggregatedProduct.lineId`).

**When to use:** For `StoredItem`, `PullListItem`, and `MealContainer.containers[]` — the three data shapes that currently reach their tab components with no stable identity field at all.

**Concrete derivation per tab, in order of how cheap the fix is:**

1. **Stored items (Fridge/Freezer tab) — cheapest fix.** `flowGraph.products` (a `Map<string, AggregatedFlowProduct>`) is *already keyed* by `createProductKey(productId, productType, mealDestination, plannedMealId, instanceIndex)` for stored products (`aggregation/utils/product-utils.ts:80-93`, called from `buildAggregatedProduct`/`addOrMergeProduct` in `aggregation/builders/product-builder.ts:64-70,150-156`). This key is already 100% content-derived (real product/meal IDs, an explicit instance index that's stable because it's assigned at build time from the node's own quantity, not from array position at render time). `buildStoredItemsListFromFlow` (`aggregation.ts:329-354`) currently does `flowGraph.products.forEach((product) => {...})`, discarding the map key. Fix: capture the key too — `flowGraph.products.forEach((product, key) => { storedItems.push({ ..., lineId: key }); })` — and add `lineId: string` to the `StoredItem` interface (`aggregation/types.ts:181-189`).

2. **Pull list items — second cheapest.** `buildPullLists` (`aggregation.ts:102-159`) already has, in scope, `node.id` (a real `recipe_product_node` ID, found via `data.productNodes.find(n => n.id === e.source)` at line 130) and `meal.id` (a real `planned_meal` ID, the outer loop variable at line 111). Fix: compose `lineId = \`${meal.id}-${step.id}-${node.id}\`` (include `step.id` too, since a single node could in principle feed two different JIT steps of the same meal — this makes the key collision-proof by construction rather than "collision-unlikely") and add `lineId: string` to `PullListItem` (`aggregation/types.ts:194-200`).

3. **Meal containers — the one genuine data-level limitation.** `buildMealContainersList` (`aggregation.ts:360-421`) groups by **`recipeName` (a string), not `planned_meal` ID** — two planned meals of the same recipe already collapse into one `MealContainer` entry with summed quantities (`existing.quantity += product.totalQuantity` at line 397) *before* this phase touches anything. There is no way to recover per-planned-meal-instance identity from this builder's current output without changing its grouping key from `recipeName` to `plannedMealId` (a larger change, out of scope for "fix the positional key" — flagged as an Open Question below). However, the builder **already computes** exactly the right composite string internally: `productKey = \`${cleanName}-${product.storageLocation}-${product.containerTypeName}\`` (line 392). This key is deterministic and array-index-free — it just needs to be surfaced. Fix: add `lineId: string` to each entry of `MealContainer.containers[]` (`aggregation/types.ts:215-224`), set to `` `${recipeName}::${cleanName}::${storageLocation}::${containerTypeName ?? "none"}` ``. This resolves the D-01 hazard (no array index, so `handleAddRecipeToPlan` reordering the planned-meals list cannot reattach a check to the wrong container) even though it does not resolve the pre-existing "two same-recipe meals share one row" aggregation characteristic — that's a separate, larger concern the CONTEXT.md fallback clause explicitly allows deferring ("if a genuinely stable key cannot be derived... leave that tab in-memory" — here a stable key *can* be derived, it's just coarser-grained than per-planned-meal; recommend persisting it, not falling back to in-memory, since it strictly improves on today's positional bug).

**Helper signature rework** (`constants/outputs.ts:332-355`): collapse each from `(location, index)` / `(day, meal, index)` / `(index)` down to a single `(lineId: string)` parameter, matching the existing stable-key helpers:
```typescript
// Source: existing pattern in constants/outputs.ts:318-320 (getShoppingCheckboxKey)
export function getStoredCheckboxKey(lineId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.stored}${lineId}`;
}
export function getPullListCheckboxKey(lineId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.pullList}${lineId}`;
}
export function getContainerCheckboxKey(lineId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.container}${lineId}`;
}
```

**Critical follow-up:** these three helpers are currently **dead code** (`grep -rn "getStoredCheckboxKey\|getPullListCheckboxKey\|getContainerCheckboxKey"` across `src/` returns only their own definitions). The actual positional keys live inline, in four different formats, in four different components:
- `FridgeFreezerTab.tsx:41` — `` `stored-${location}-${idx}` ``
- `MealContainersTab.tsx:60` — `` `meal-container-${idx}-${location}-${containerIdx}` ``
- `MicahMealsTab.tsx:64` — `` `micah-container-${idx}-${location}-${containerIdx}` `` (note: different prefix than `MealContainersTab`, even though both consume the same `MealContainer[]` type from the same builder)
- `PullListsTab.tsx:78` — `` `pull-${idx}-${storage}-${itemIdx}` `` (three index variables, not the helper's `day`/`meal`/`index` signature)

The plan must update **all four inline call sites**, not just the three helper function bodies. Reworking only the helpers and leaving the components' inline template literals in place would silently ship the positional-key bug unchanged.

### Pattern 2: Derive-then-overlay memo (have-N, resolution, export filtering)

**What:** A new pure-function join, computed once per render via `useMemo`, that combines each of the flow-graph-derived lists with the `useShoppingState` hook's state map, keyed by that tab's stable `lineId`/checkbox key.

**When to use:** Anywhere have-N remaining-to-buy, auto-complete, or resolution-based dimming/exclusion needs to show up — i.e., primarily the Shopping List tab and the export path, per D-05/D-06.

**Example:**
```typescript
// New file: src/lib/shopping-overlay.ts
import type { AggregatedProduct } from "./aggregation";
import { getShoppingCheckboxKey } from "../constants/outputs";
import type { ShoppingStateEntry } from "./types";

export interface OverlaidShoppingItem extends AggregatedProduct {
  haveQuantity: number | null;
  remaining: number | null;
  resolution: "buy" | "make" | "skip";
  isResolved: boolean; // resolution !== 'buy' OR have >= needed
}

export function overlayShoppingItem(
  item: AggregatedProduct,
  state: Map<string, ShoppingStateEntry>
): OverlaidShoppingItem {
  const key = getShoppingCheckboxKey(item.lineId);
  const entry = state.get(key);
  const haveQuantity = entry?.have_quantity ?? null;
  const remaining =
    haveQuantity != null ? Math.max(0, item.totalQuantity - haveQuantity) : null;
  const resolution = entry?.resolution ?? "buy";
  const isResolved =
    resolution !== "buy" || (remaining !== null && remaining <= 0);
  return { ...item, haveQuantity, remaining, resolution, isResolved };
}

// Export filter: exclude resolved lines entirely (D-06)
export function filterForExport(
  items: OverlaidShoppingItem[]
): OverlaidShoppingItem[] {
  return items.filter((i) => !i.isResolved);
}
```
This keeps the overlay logic in a plain, dependency-free module — testable under Vitest's existing `node` environment without touching `vitest.config.ts` (see Validation Architecture).

### Pattern 3: Threading substitute quantity/unit through `applyVariantOverrides`

**What:** Extend the existing override pipeline (already re-derives every output for free) to carry a quantity/unit override, defaulting to the original node's value when absent.

**When to use:** Required for SHOP-03's acceptance criterion #4 — without this, the swap dialog would visibly "work" (write a record) but produce zero change in any derived list.

**Example (concrete diff shape):**
```typescript
// Source: src/lib/aggregation/utils/variant-utils.ts (actual path — note this
// differs from CONTEXT.md's citation of `src/lib/variant-utils.ts`, which does
// not exist; the real file lives under aggregation/utils/)

// 1. Extend the override shape (currently lines 13-16):
export interface VariantOverride {
  originalNodeId: string;
  replacementProduct: Product;
  quantity?: number | null;   // NEW
  unit?: string | null;       // NEW
}

// 2. In applyVariantOverrides' replacement branch (currently lines 220-236),
//    replace the "for now, preserve original" shortcut:
const replacementNode: ExpandedProductNode = {
  ...node,
  product: override.replacementProduct.id,
  quantity: override.quantity ?? node.quantity,   // inherit-when-null (D-07/D-09)
  unit: override.unit ?? node.unit,               // inherit-when-null
  expand: {
    product: { ...override.replacementProduct, expand: undefined },
  },
};

// 3. In Outputs.tsx's override map builder (currently lines 225-237), forward
//    the new fields from the raw MealVariantOverrideExpanded record:
if (override.expand?.replacement_product) {
  overridesByMeal.get(mealId)!.push({
    originalNodeId: override.original_node,
    replacementProduct: override.expand.replacement_product,
    quantity: override.quantity ?? null,   // NEW — off the raw record, not the expand
    unit: override.unit ?? null,           // NEW
  });
}
```

### Anti-Patterns to Avoid
- **Reworking only the three named helper functions and stopping there:** as documented in Pattern 1, the actual positional-key bug lives in four inline template literals across four components that don't even call the helpers today. Fixing the helpers alone changes nothing observable.
- **Reusing `OutOfStockSection`'s `onAddRecipeToPlan` handler directly for the make-it action:** the existing handler (`OutOfStockSection.tsx:145`, wired to `Outputs.tsx:562-576`) adds the recipe to the plan **immediately on click, with no confirmation**. D-11 requires confirm-first for the new shopping-line make-it action. Wrap the call in a confirmation dialog rather than pointing the make-it button straight at the existing prop.
- **Building an upsert around parsing PocketBase 400 error responses:** community pattern research suggests this is fragile `[ASSUMED]` (see Assumptions Log). Since `shopping_state`'s key (`weekly_plan` + `line_key`) is fully deterministic client-side, prefer query-then-branch (`getFirstListItem` by filter, then `create` or `update`) over try/catch-on-create.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unit conversion for have-N remaining-to-buy math | A second unit-conversion routine inside `ShoppingListTab` | `src/lib/units.ts`'s existing `convert`/`chooseDisplayUnit` (Phase 1) | Already the single source of truth for within-dimension conversion; a shopping line's `totalQuantity` is already in its display unit — have-N should be entered/compared in that same unit, not re-derived |
| Propagating a swap to prep/pull/container lists | A bespoke "re-run this one list" function per tab | The existing `buildProductFlowGraph` → per-tab builder pipeline, triggered by `refreshCounter` bump | This is explicitly the phase's biggest reuse win — the whole point of the flow-graph architecture is that swaps propagate automatically; writing a separate propagation path would duplicate and risk diverging from it |
| Optimistic-update queue semantics | A generic reusable "offline queue" abstraction | A small, phase-scoped `sync-queue.ts` module tailored to `shopping_state`'s shape | The phase explicitly rejects durable/offline-first queuing (Deferred Ideas) — building a general-purpose abstraction for a deliberately narrow, in-memory-only requirement is over-engineering for this phase's actual scope |
| Fuzzy/typeahead product search in the swap dialog and quick-create | A search index or fuzzy-matching library | Existing simple `Autocomplete` + array filter, matching `VariantEditorDialog.tsx`'s current `replacementProducts` pattern (lines 140-149) | Fuzzy search is explicitly Phase 3 scope (registry seeding); this phase's registry is small enough that exact/substring `Autocomplete` filtering (already proven in `VariantEditorDialog`) is sufficient |

**Key insight:** Nearly every "hard part" of this phase already has a working implementation elsewhere in the codebase (flow-graph derivation, override CRUD, make-it plumbing, Autocomplete-based product search). The risk in this phase is not reinventing those — it's under-threading the identifiers (`lineId`, node/meal IDs, quantity/unit) that those existing mechanisms need to actually connect to the new UI surfaces.

## Common Pitfalls

### Pitfall 1: Fixing the helper functions but not the inline call sites
**What goes wrong:** The plan reworks `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey` per D-01, ships it, and the positional-key bug persists because those functions are dead code.
**Why it happens:** CONTEXT.md's citation (`constants/outputs.ts:332-355`) is accurate but incomplete — it doesn't surface that the real bug lives in four separate inline template literals.
**How to avoid:** Verify with `grep -rn "getStoredCheckboxKey\|getPullListCheckboxKey\|getContainerCheckboxKey" src/` before and after the change — it should show 0 matches before (only definitions) and 4+ matches after (definitions + the four tab components importing and calling them).
**Warning signs:** A code review that only diffs `constants/outputs.ts` and treats the tabs as unchanged.

### Pitfall 2: Storing swap quantity/unit without wiring the three re-derivation touchpoints
**What goes wrong:** The swap dialog saves a `meal_variant_overrides` row with `quantity`/`unit` populated; the UI shows no error; but the shopping list, prep list, and containers show the *original* quantity, not the substitute's.
**Why it happens:** `applyVariantOverrides` (today) deliberately preserves the original node's quantity/unit and swaps only the product relation (the "for now, preserve original" comment). Storing the field is necessary but not sufficient.
**How to avoid:** Treat Pattern 3's three edits (VariantOverride interface, applyVariantOverrides branch, Outputs.tsx map builder) as one atomic unit of work with a single verification: create an override with `quantity=2, unit='cup'` and confirm the aggregated shopping-list line for that meal changes to 2 cup; confirm a null-quantity override leaves the original node's quantity unchanged.
**Warning signs:** Acceptance criterion #4 tests only that a record was written to PocketBase, not that a derived list changed.

### Pitfall 3: Silently sharing a checkbox between two planned meals of the same recipe (meal containers)
**What goes wrong:** Two "Chili" planned meals this week get exactly one `MealContainer` row (aggregator groups by recipe name), so a single persisted checkbox toggles for both instances at once. If not documented, this looks like a Phase 2 regression during UAT.
**Why it happens:** `buildMealContainersList` already discarded per-planned-meal identity before Phase 2 touches anything (see Architecture Patterns Pattern 1, item 3). This is pre-existing behavior, not something Phase 2 introduces.
**How to avoid:** Document this as a known, pre-existing characteristic (not a regression) in the plan's verification notes; don't scope a `plannedMealId`-based rework of `buildMealContainersList` into this phase unless the user explicitly wants two-same-recipe-meals distinguished (that's a larger change — flagged as an Open Question below).
**Warning signs:** A UAT tester plans the same recipe twice in one week and reports "checking off one Chili container checked off the other."

### Pitfall 4: Make-it silently mutating the plan without confirmation
**What goes wrong:** The make-it button is wired directly to `handleAddRecipeToPlan` (matching the existing `OutOfStockSection` pattern), so clicking it immediately adds a recipe to the week with no confirmation — violating D-11.
**Why it happens:** The existing, working prior art (`OutOfStockSection.tsx:145`) does exactly this with no confirm step, and it's the most obvious code to copy.
**How to avoid:** Wrap the shopping-line make-it action in an explicit confirm dialog ("Add [recipe] to this week and make it instead of buying?") before calling `handleAddRecipeToPlan`; do not reuse the out-of-stock button's handler wiring verbatim.
**Warning signs:** A make-it click that adds a `planned_meal` record with no intervening dialog in the UI trace.

### Pitfall 5: Race condition on first-write between two devices (or a double-tap) hitting the same `(weekly_plan, line_key)` unique pair
**What goes wrong:** Two nearly-simultaneous writes for a line that has no `shopping_state` row yet both attempt `create()`; PocketBase's unique index (once added — see Data Model) rejects the second with a 400, and if the hook doesn't handle that, the second device's edit is silently lost instead of becoming an `update()`.
**Why it happens:** `create()`-first is the naive first implementation; PocketBase has no native upsert.
**How to avoid:** Prefer query-then-branch (`getFirstListItem` by `weekly_plan="X" && line_key="Y"` filter, then `create` if absent / `update` if present) over try-create-then-catch-400, per the Code Examples hook design. This is simpler to reason about and avoids depending on PocketBase's error response shape `[ASSUMED — see Assumptions Log]`.
**Warning signs:** Intermittent "my have-N reset" reports specifically when two people/devices are shopping at once (matches D-13's acknowledged last-write-wins tradeoff, but should degrade to last-write-wins, not silent failure).

### Pitfall 6: MUI `size="small"` checkboxes don't meet touch-target minimums
**What goes wrong:** SHOP-06's tablet touch pass is implemented by just eyeballing spacing, and the existing `CheckableListItem.tsx:27` `Checkbox` `size="small"` (used across shopping/batch-prep) and the inline `size="small"` checkboxes in `MealContainersTab`/`MicahMealsTab`/`PullListsTab` remain under Material Design's 48×48dp minimum touch target `[CITED: m2.material.io/develop/web/supporting/touch-target]`.
**Why it happens:** `size="small"` shrinks the touch target along with the visual glyph; Material's own guidance is to keep the touch target large via padding while the *visual* indicator can stay smaller.
**How to avoid:** Increase the tap target via `sx` padding/`minHeight` on the enclosing `ListItem`/`ListItemIcon` (or switch to `size="medium"` with appropriate spacing) rather than only changing font sizes or margins elsewhere on the page.
**Warning signs:** A tablet-testing pass that "looks" bigger (larger fonts, more padding around text) but the actual checkbox hit area is unchanged.

## Code Examples

### `useShoppingState` hook skeleton (optimistic + retry + pending indicator)
```typescript
// Source: pattern extends this app's existing src/hooks/useRecipeQueue.ts style;
// retry/backoff design informed by general React 19 optimistic-UI guidance
// [CITED: react.dev/reference/react/useOptimistic] adapted to a hand-rolled
// hook since useOptimistic alone has no retry/pendingCount primitive.
import { useState, useEffect, useCallback, useRef } from "react";
import { getAll, create, update, collections } from "../lib/api";
import type { ShoppingState } from "../lib/types";

interface StateEntry {
  recordId: string | null; // null until first sync completes
  checked: boolean;
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip";
}

export function useShoppingState(weeklyPlanId: string) {
  const [state, setState] = useState<Map<string, StateEntry>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!weeklyPlanId) return;
    getAll<ShoppingState>(collections.shoppingState, {
      filter: `weekly_plan="${weeklyPlanId}"`,
    }).then((rows) => {
      const map = new Map<string, StateEntry>();
      for (const row of rows) {
        map.set(row.line_key, {
          recordId: row.id,
          checked: row.checked ?? false,
          have_quantity: row.have_quantity ?? null,
          resolution: row.resolution ?? "buy",
        });
      }
      setState(map);
    });
  }, [weeklyPlanId]);

  const syncLine = useCallback(
    async (lineKey: string, patch: Partial<StateEntry>, attempt = 0) => {
      if (inFlight.current.has(lineKey)) return; // coalesce; latest setState wins locally
      inFlight.current.add(lineKey);
      setPendingCount((c) => c + 1);
      try {
        const current = state.get(lineKey);
        if (current?.recordId) {
          await update(collections.shoppingState, current.recordId, patch);
        } else {
          // query-then-branch upsert (see Pitfall 5) instead of create-then-catch-400
          const existing = await getAll<ShoppingState>(collections.shoppingState, {
            filter: `weekly_plan="${weeklyPlanId}" && line_key="${lineKey}"`,
          });
          if (existing[0]) {
            await update(collections.shoppingState, existing[0].id, patch);
            setState((s) => new Map(s).set(lineKey, { ...s.get(lineKey)!, recordId: existing[0].id }));
          } else {
            const created = await create<ShoppingState>(collections.shoppingState, {
              weekly_plan: weeklyPlanId,
              line_key: lineKey,
              checked: false,
              ...patch,
            });
            setState((s) => new Map(s).set(lineKey, { ...s.get(lineKey)!, recordId: created.id }));
          }
        }
      } catch (err) {
        if (attempt < 3) {
          setTimeout(() => syncLine(lineKey, patch, attempt + 1), 1000 * 2 ** attempt);
          return; // don't decrement pendingCount — still in flight
        }
        console.error(`shopping_state sync failed for ${lineKey} after retries`, err);
      } finally {
        inFlight.current.delete(lineKey);
        setPendingCount((c) => Math.max(0, c - 1));
      }
    },
    [state, weeklyPlanId]
  );

  const applyOptimistic = useCallback(
    (lineKey: string, patch: Partial<StateEntry>) => {
      setState((prev) => {
        const next = new Map(prev);
        const existing = next.get(lineKey) ?? {
          recordId: null,
          checked: false,
          have_quantity: null,
          resolution: "buy" as const,
        };
        next.set(lineKey, { ...existing, ...patch });
        return next;
      });
      syncLine(lineKey, patch);
    },
    [syncLine]
  );

  return {
    state,
    isSyncing: pendingCount > 0,
    pendingCount,
    setChecked: (lineKey: string, checked: boolean) => applyOptimistic(lineKey, { checked }),
    setHaveQuantity: (lineKey: string, qty: number | null) =>
      applyOptimistic(lineKey, { have_quantity: qty }),
    setResolution: (lineKey: string, resolution: StateEntry["resolution"]) =>
      applyOptimistic(lineKey, { resolution }),
  };
}
```
**Note:** the retry/backoff logic above (the `setTimeout`-based exponential backoff, capped at 3 attempts) is a reasonable default per D-13's "planner's call" discretion, but is not derived from any documented PocketBase-specific guidance — flag as `[ASSUMED]` and confirm the attempt count/backoff shape during planning rather than treating it as locked.

### Shopping-line → per-meal-node mapping (build before the swap dialog, per phase doc item 9)
```typescript
// New helper — no existing equivalent. Confirms CONTEXT.md's claim: aggregation
// output (AggregatedProduct.sources / AggregatedFlowProduct.mealSources) carries
// only { recipeName, quantity, unit } strings, never planned_meal or node IDs
// (verified: aggregation/types.ts:88-93,151).
import type { PlannedMealWithRecipe, RecipeGraphData } from "../lib/aggregation";

export interface SwapTarget {
  plannedMealId: string;
  recipeName: string;
  nodeId: string;       // recipe_product_node ID — what meal_variant_overrides.original_node needs
  quantity?: number;
  unit?: string;
}

export function getMealNodeTargetsForProduct(
  productId: string,
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData> // keyed by plannedMeal.id — see Outputs.tsx:307
): SwapTarget[] {
  const targets: SwapTarget[] = [];
  for (const meal of plannedMeals) {
    const data = recipeData.get(meal.id);
    if (!data) continue;
    for (const node of data.productNodes) {
      if (node.expand?.product?.id === productId) {
        targets.push({
          plannedMealId: meal.id,
          recipeName: data.recipe.name,
          nodeId: node.id,
          quantity: node.quantity,
          unit: node.unit,
        });
      }
    }
  }
  return targets;
}
```
**Design note:** a single planned meal can yield **more than one** target for the same product (e.g., olive oil used in two separate steps of one recipe) — each is a distinct `recipe_product_node`. Since D-07's UI is "per-meal quantity/unit" (not per-node), the recommended fan-out is: one qty/unit input per **checked meal** in the dialog, applied to **every** node target belonging to that meal (creating N `meal_variant_overrides` rows per meal where N = the count of matching nodes). This is flagged as an Open Question below for explicit planner confirmation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Binary in-memory `checkedItems: Set<string>`, reset on refresh | Per-plan persisted `shopping_state` collection with optimistic hook | This phase | Enables SHOP-01/07; changes the prop surface owner from local `useState` to a shared hook, but the six tabs' `checkedItems`/`onToggleChecked` props stay structurally the same |
| Positional checkbox keys (`stored-${location}-${idx}` etc.) | Content-derived `lineId` composites | This phase | Prevents the "make-it reorders the list, checkbox now marks a different item" correctness bug that would otherwise ship alongside D-01's persistence |
| `meal_variant_overrides` = `{planned_meal, original_node, replacement_product}` only, free-text unit assumption (phase doc, pre-Phase-1) | Adds `quantity`/`unit` (unit as the Phase-1 enum, not free text) | This phase, reconciled against completed Phase 1 (D-12) | Swap dialog can now express "2 cup instead of 3 cup" per meal; Phase 1's `units.ts` enum is the source of truth, not a new free-text convention |
| Swap only possible planning-time, pre-existing product required (`VariantEditorDialog`) | Swap possible mid-shop, with inline quick-create | This phase | Store-time and planning-time overrides should share one write path (per CONTEXT.md) to avoid divergence between the two dialogs |

**Deprecated/outdated:** The phase doc's assumption that `meal_variant_overrides.unit` should be free text (§3.2) is superseded by Phase 1's completed unit enum (D-12) — do not implement free-text unit storage.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PocketBase upsert should use query-then-branch (`getFirstListItem` then `create`/`update`) rather than try-create-then-catch-400 | Common Pitfalls #5, Code Examples | Low — both approaches are functionally viable; if the team prefers the try/catch approach for fewer round-trips, that's a valid alternative, just slightly more fragile to PocketBase error-shape changes across SDK versions |
| A2 | Exponential backoff capped at 3 attempts (1s/2s/4s) is a reasonable retry default | Code Examples (`useShoppingState`) | Low-Medium — CONTEXT.md explicitly defers this to planner discretion; if the real-world tailnet/hotspot connection has longer transient drops, 3 attempts (~7s total) may give up too early — confirm against actual store-network conditions once tailnet infra lands |
| A3 | Fanning out one per-meal quantity/unit value to all matching `recipe_product_node`s within that meal (when a product appears via multiple nodes in one recipe) is the correct interpretation of D-07 | Code Examples (`getMealNodeTargetsForProduct`), Open Questions | Medium — if the user actually wants per-node (not per-meal) quantity granularity in this edge case, the dialog UI and save logic both need an extra nesting level |
| A4 | Persisting a coarser-than-per-planned-meal `lineId` for meal containers (recipe-name-keyed, not plan-instance-keyed) is acceptable rather than reworking `buildMealContainersList`'s grouping | Architecture Patterns Pattern 1, item 3; Common Pitfalls #3 | Low-Medium — acceptable per D-01's fallback clause and matches pre-existing aggregation behavior, but if the household regularly plans the same recipe twice in one week and wants independent checkboxes per instance, this needs a larger `buildMealContainersList` rework (out of scope per this research) |
| A5 | No new npm dependency is needed for the optimistic-retry hook (hand-rolled preferred over `useOptimistic`/TanStack Query) | Standard Stack, Alternatives Considered | Low — a reasonable, consistency-preserving choice given zero existing data-fetching library in the app, but a legitimate alternative if the team wants to standardize on TanStack Query going forward |

**All claims above originate from training knowledge about general React/PocketBase patterns, not from official PocketBase documentation on upsert/retry (PocketBase's docs do not prescribe a canonical client-side retry/optimistic pattern) — confirm A1/A2 during planning discussion if precise retry semantics matter to the user.**

## Open Questions

1. **Does D-07's "per-meal quantity/unit" mean per-node when a meal has multiple recipe_product_nodes for the same product?**
   - What we know: `meal_variant_overrides.original_node` is a required singular relation — one row per node, not per (meal, product) pair. A recipe can reference the same product via more than one node (e.g., two separate uses in different steps).
   - What's unclear: whether the swap dialog should expose one quantity/unit field per checked *meal* (simpler UI, fans out to N nodes) or one per checked *node* (more precise, more UI complexity for a probably-rare case).
   - Recommendation: default to per-meal (simpler, matches D-07's literal wording), fanning the same value to all matching nodes in that meal; confirm with the user only if UAT surfaces a real recipe where this matters.

2. **Should `buildMealContainersList` be reworked to group by `planned_meal` ID instead of `recipeName` string, so two same-recipe meals in one week get independent container checkboxes?**
   - What we know: today's aggregator already merges them (pre-existing, not a Phase 2 regression); Phase 2's `lineId` fix (Pattern 1, item 3) does not change this.
   - What's unclear: whether the household actually double-plans the same recipe often enough for this to matter in practice.
   - Recommendation: leave out of this phase's scope (larger builder rework, affects `MealContainersTab` and `MicahMealsTab` display grouping too, not just checkbox keys); revisit only if UAT flags it as a real friction point.

3. **Should `shopping_state` records be included in `scripts/sync-to-test.js`'s `COLLECTIONS_TOP_DOWN` copy list?**
   - What we know: the script currently already omits `meal_variant_overrides` and `recipe_queue` (a pre-existing gap noted in the phase doc, unrelated to this phase). `shopping_state` is per-device shopping-session state, arguably not meaningful to blanket-copy from prod into test.
   - What's unclear: whether test-instance UAT for this phase needs pre-populated `shopping_state` rows to exercise persistence, or should start clean.
   - Recommendation: exclude `shopping_state` from the sync-to-test copy list (it's session state, not planning content); if the team wants to fix the pre-existing `meal_variant_overrides`/`recipe_queue` omission in the same pass (phase doc suggests this), treat it as a separate, explicitly-called-out task rather than folding it silently into this phase's scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PocketBase prod (`192.168.50.95:8090`) | All persistence (SHOP-01..05) | ✓ (reachable from this dev environment right now) | Health check OK; `meal_variant_overrides` currently has **0 rows** (verified live, 2026-07-06) | — |
| PocketBase test (`192.168.50.95:8091`) | Dev/test workflow | ✓ (reachable) | Health check OK; `meal_variant_overrides` currently has **0 rows** (verified live, 2026-07-06) | — |
| `shopping_state` collection | SHOP-01/02/04 | ✗ (confirmed 404 on both prod and test right now) | — | Must be created via PocketBase admin UI on both instances before any hook code can be tested end-to-end (see Data Model / package "Standard Stack" alternative on migrations) |
| Tailnet hostnames for `db-config.ts` | SHOP-07 (store usability) | ✗ (todo `nas-pocketbase-tailnet` still pending; `db-config.ts:15-18` still points at LAN IPs `192.168.50.95:8090/:8091`) | — | Blocks *store* usability only, not local development — the optimistic-update/retry code can be built and tested against the LAN addresses today; swapping to tailnet hostnames is a config-only change gated by the separate infra todo |
| Node.js | Dev tooling | ✓ | v24.14.0 | — |
| npm | Dev tooling | ✓ | 11.9.0 | — |
| Vitest | Unit tests | ✓ | 4.1.10, `node` environment only (no jsdom/RTL) | Pure-logic modules (`sync-queue.ts`, `shopping-overlay.ts`, mapping helper, `variant-utils`) are testable as-is; hook/component-level tests would require adding `@testing-library/react` + jsdom — not recommended this phase (see Validation Architecture) |

**Missing dependencies with no fallback:**
- `shopping_state` PocketBase collection must exist (via manual admin-UI creation, per the established pattern — see Architecture Patterns / Data Model) before any hook integration testing can proceed on either instance.

**Missing dependencies with fallback:**
- Tailnet hostname switch — local dev and testing can proceed against LAN IPs; only real store usability is blocked, and that's tracked by the separate `nas-pocketbase-tailnet` todo, not this phase's code.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 |
| Config file | `recipe-planner/vitest.config.ts` (currently `node` environment only, explicitly documented as "add jsdom+RTL in a later phase if/when component-level tests are needed" — this phase does not need to be that "later phase" if logic stays extracted into pure modules, see below) |
| Quick run command | `npx vitest run src/lib/aggregation/utils/variant-utils.test.ts` (or targeted new test files) |
| Full suite command | `npm test` (runs `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHOP-01 | Checkbox state round-trips per plan | integration (against live test PocketBase) + manual UAT for refresh/device-switch | `npx vitest run src/lib/sync-queue.test.ts` (queue logic only, no live DB) | ❌ Wave 0 — new file; live round-trip is manual-only (no PB mocking infra exists in this repo) |
| SHOP-02 | Have-N remaining-to-buy calculation | unit | `npx vitest run src/lib/shopping-overlay.test.ts` | ❌ Wave 0 — new file |
| SHOP-03 | Shopping-line → node mapping; quantity/unit threading through `applyVariantOverrides` | unit | `npx vitest run src/lib/aggregation/utils/variant-utils.test.ts` | ❌ Wave 0 — **no test file exists today** for `variant-utils.ts` at all (confirmed: no `variant-utils.test.ts` in the repo); this is the highest-value new test given D-09's "storing without threading = silent no-op" failure mode |
| SHOP-04 | Make-it excludes line from buy list + export; confirm-first gating | unit (exclusion logic) + manual UAT (confirm dialog, `handleAddRecipeToPlan` wiring) | `npx vitest run src/lib/shopping-overlay.test.ts` | ❌ Wave 0 |
| SHOP-05 | Quick-create returns product into picker | manual-only (dialog + PB write, no component-test infra) | — | — (justified: no jsdom/RTL in this repo; adding it for one dialog's flow is a larger infra decision than this phase should make silently) |
| SHOP-06 | Touch target sizing | manual-only (visual/tablet check) | — | — (justified: sizing/accessibility is not meaningfully unit-testable without visual regression tooling this repo doesn't have) |
| SHOP-07 | Optimistic update, retry, pending-sync indicator | unit (retry/backoff logic in isolation) + manual UAT (actual network drop simulation) | `npx vitest run src/lib/sync-queue.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched-test-file>`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual UAT required for SHOP-05/06 and the live-persistence half of SHOP-01/07 (no live-PocketBase test harness exists in this repo today — building one is a larger infra investment not justified by this phase alone).

### Wave 0 Gaps
- [ ] `src/lib/aggregation/utils/variant-utils.test.ts` — covers SHOP-03 (quantity/unit inherit-when-null threading); highest priority given this is the exact place D-09 warns storing-without-threading silently no-ops
- [ ] `src/lib/sync-queue.test.ts` — covers SHOP-01/07 retry/backoff logic in isolation (no live PocketBase dependency)
- [ ] `src/lib/shopping-overlay.test.ts` — covers SHOP-02/04 derive-then-overlay math and export filtering
- [ ] Mapping helper test (can co-locate in a new `src/lib/shopping-mapping.test.ts` or alongside wherever `getMealNodeTargetsForProduct` lands) — covers SHOP-03's "two meals sharing a recipe resolve to distinct targets" requirement from phase doc item 9's acceptance criterion
- [ ] No framework install needed — Vitest's existing `node` environment covers all of the above since the recommended design keeps sync/overlay/mapping logic in plain, React-free modules

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | App uses PocketBase superuser auth only for admin scripts (already established in Phase 1); the shopping UI itself has no new auth surface — out of scope per PROJECT.md ("Multi-user auth / realtime sync" explicitly out of scope) |
| V3 Session Management | No | Single-household, trusted-network app; no new session concept introduced |
| V4 Access Control | No | No new roles/permissions; PocketBase collection rules for `shopping_state`/`meal_variant_overrides` should mirror existing collections' rules (open on trusted LAN/tailnet, not internet-exposed) |
| V5 Input Validation | Yes | `have_quantity` (number) and `resolution` (select enum) should be validated client-side before write (non-negative number; enum membership) — PocketBase's own field-type validation (select/number) provides a server-side backstop, but the client should not rely on it silently rejecting bad input with a generic error |
| V6 Cryptography | No | No new secrets/crypto surface this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated write to `shopping_state`/`meal_variant_overrides` if PocketBase collection rules are left fully open once reachable via tailnet (a slightly larger attack surface than pure-LAN) | Tampering | Set collection API rules consistent with the rest of the app's existing collections (verify during the manual admin-UI creation step what rule level other collections use, and match it — do not leave `shopping_state ` more permissive than existing collections by default) |
| Race/last-write-wins on concurrent device edits silently overwriting a shopper's have-N entry | Tampering (data integrity, not security in the adversarial sense) | Explicitly accepted per D-13 ("single household, rare... last-write-wins"); not a security gap, but should be documented as a known behavior in the plan so it isn't mistaken for a bug later |

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (this session): `Outputs.tsx`, `constants/outputs.ts`, `aggregation/utils/variant-utils.ts`, `aggregation/types.ts`, `aggregation.ts`, `aggregation/builders/flow-builder.ts`, `aggregation/builders/product-builder.ts`, `aggregation/utils/product-utils.ts`, `lib/types.ts`, `lib/units.ts`, `lib/api.ts`, `lib/db-config.ts`, `components/outputs/*.tsx`, `components/VariantEditorDialog.tsx`, `hooks/useRecipeQueue.ts`, `WeeklyPlans.tsx` (`handleSaveVariants`), `scripts/sync-to-test.js`, `vitest.config.ts`, `pb_schema.json`, `package.json`
- Live PocketBase instances (this session): `GET /api/health`, `GET /api/collections/meal_variant_overrides/records?perPage=1` (0 rows both prod/test), `GET /api/collections/shopping_state/records` (404 both — confirms not-yet-created)
- `npm view pocketbase version` — confirmed 0.27.0 latest, 0.26.5 installed

### Secondary (MEDIUM confidence)
- [useOptimistic – React](https://react.dev/reference/react/useOptimistic) — official docs, confirms no built-in retry/rollback semantics
- [Touch Target — Material Design](https://m2.material.io/develop/web/supporting/touch-target) — official Material guidance on 48×48dp minimum
- [Checkboxes – Material Design](https://m2.material.io/components/checkboxes) — visual-vs-touch-target sizing distinction

### Tertiary (LOW confidence)
- General web search on PocketBase upsert patterns (no single authoritative source found; PocketBase's own docs do not prescribe a canonical upsert/retry recipe) — treated as `[ASSUMED]`, logged in Assumptions Log A1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies proposed; all versions read directly from the installed `package.json`/registry
- Architecture: HIGH — every pattern cited traces to specific file/line numbers read this session, including the correction that CONTEXT.md's helper-function citation understates the actual bug surface
- Pitfalls: HIGH for codebase-derived pitfalls (1-4, 6, verified by direct reads); MEDIUM for Pitfall 5 (upsert race), since the underlying PocketBase behavior is `[ASSUMED]` rather than doc-verified

**Research date:** 2026-07-06
**Valid until:** 2026-08-05 (30 days — stable, in-repo architecture; re-verify live PocketBase row counts and `shopping_state` existence if planning is delayed past this window, since those are point-in-time facts)
