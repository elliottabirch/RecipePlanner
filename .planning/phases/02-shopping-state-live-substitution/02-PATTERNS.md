# Phase 2: Shopping State & Live Substitution - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 16
**Analogs found:** 15 / 16

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/hooks/useShoppingState.ts` (NEW) | hook | CRUD + optimistic/event-driven | `src/hooks/useRecipeQueue.ts` | role-match (no optimistic prior art in repo) |
| `src/lib/sync-queue.ts` (NEW) | utility | event-driven (retry/backoff) | none — no queue/retry code exists anywhere in repo | no analog |
| `src/lib/shopping-overlay.ts` (NEW) | transform/utility | transform (pure join) | `src/pages/Outputs.tsx:336-366` (`filteredShoppingListForExport`) | role-match |
| `src/lib/api.ts` (MODIFY — add `shoppingState` collection) | config/service | CRUD | same file, `collections` object (`api.ts:51-68`) | exact |
| `src/lib/types.ts` (MODIFY — add `ShoppingState`(+Expanded), extend `MealVariantOverride`) | model | CRUD | `MealVariantOverride`/`MealVariantOverrideExpanded` (`types.ts:195-209`) | exact |
| `src/lib/aggregation/utils/variant-utils.ts` (MODIFY — extend `VariantOverride`, `applyVariantOverrides`) | transform/utility | transform | same file, existing `VariantOverride` (:13-16) and `applyVariantOverrides` (:174-276) | exact (self-analog) |
| `src/lib/aggregation/types.ts` (MODIFY — add `lineId` to `StoredItem`/`PullListItem`/`MealContainer.containers[]`) | model | transform | `AggregatedFlowProduct.lineId`/`AggregatedProduct.lineId` (`types.ts:84`, `:146-148`) | exact (Phase 1 pattern to mirror) |
| `src/lib/aggregation.ts` (MODIFY — thread `lineId` through `buildStoredItemsListFromFlow`/`buildPullLists`/`buildMealContainersList`) | transform/service | transform | same file's existing shopping-list builder that already surfaces `lineId` | exact |
| `src/constants/outputs.ts` (MODIFY — collapse 3 helper signatures to `(lineId: string)`) | utility/config | transform | `getShoppingCheckboxKey`/`getPantryCheckboxKey`/`getBatchPrepCheckboxKey` (:311-327, same file) | exact |
| `src/components/outputs/FridgeFreezerTab.tsx` (MODIFY — swap inline key for `getStoredCheckboxKey(item.lineId)`) | component | request-response (render) | `CheckableListItem` usage in same file (:59-69) | exact (self) |
| `src/components/outputs/MealContainersTab.tsx` (MODIFY — swap inline key) | component | request-response | `FridgeFreezerTab.tsx` (same checkbox-key defect pattern) | role-match |
| `src/components/outputs/MicahMealsTab.tsx` (MODIFY — swap inline key, shares `MealContainer[]` type) | component | request-response | `MealContainersTab.tsx` | exact (near-duplicate component) |
| `src/components/outputs/PullListsTab.tsx` (MODIFY — swap inline key) | component | request-response | `FridgeFreezerTab.tsx` checkbox pattern | role-match |
| `src/components/outputs/ShopSwapDialog.tsx` (NEW) | component (dialog) | request-response + CRUD | `src/components/VariantEditorDialog.tsx` | role-match (planning-time analog for store-time swap) |
| `src/components/outputs/QuickCreateProductDialog.tsx` (NEW) | component (dialog) | CRUD | `src/components/VariantEditorDialog.tsx` (Autocomplete + dialog shell) + products CRUD via `api.ts` | role-match |
| `src/components/outputs/SyncIndicator.tsx` (NEW) | component | request-response (derived UI from hook state) | no existing status-indicator component in repo | no analog (small, spec-driven) |
| `src/pages/Outputs.tsx` (MODIFY — replace `checkedItems`/`toggleChecked`, override map builder, `handleAddRecipeToPlan` wiring, export filter) | controller/page | CRUD + transform | same file (self-modification); `handleSaveVariants` in `src/pages/WeeklyPlans.tsx:476-499` for the swap save path | exact (self) + role-match (WeeklyPlans for CRUD write pattern) |

## Pattern Assignments

### `src/hooks/useShoppingState.ts` (hook, CRUD + optimistic)

**Analog:** `src/hooks/useRecipeQueue.ts` (only existing data-fetching hook in the repo)

**Imports pattern** (`useRecipeQueue.ts:1-3`):
```typescript
import { useState, useEffect, useCallback } from "react";
import { getAll, create, remove, collections } from "../lib/api";
import type { RecipeQueueItemExpanded } from "../lib/types";
```
New hook should additionally import `update` from `../lib/api` and `useRef` from `react` for the in-flight tracking set (no existing hook needs `useRef`, but this is a natural, idiomatic extension of the same style).

**Core CRUD/load pattern** (`useRecipeQueue.ts:9-26`):
```typescript
const refreshQueue = useCallback(async () => {
  try {
    setLoading(true);
    const items = await getAll<RecipeQueueItemExpanded>(
      collections.recipeQueue,
      { expand: "recipe", sort: "sort_order" }
    );
    setQueueItems(items);
  } catch (err) {
    console.error("Failed to load recipe queue:", err);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  refreshQueue();
}, [refreshQueue]);
```
Mirror this shape for the initial per-plan load: `getAll<ShoppingState>(collections.shoppingState, { filter: \`weekly_plan="${weeklyPlanId}"\` })`, keyed into a `Map<string, StateEntry>` by `line_key` (see RESEARCH.md's `useShoppingState` skeleton for the full optimistic/retry extension — that skeleton is the concrete target shape; `useRecipeQueue.ts` is the *style* source: `useCallback`-wrapped async ops, try/catch/finally with `console.error`, no external state library).

**Error handling pattern:** Every async operation in `useRecipeQueue.ts` is wrapped in a bare try/catch/finally with `console.error(...)` — no thrown errors surface to the UI as toasts; `Outputs.tsx` handles user-facing errors via its own local `error` state instead (see `Outputs.tsx:308-312`: `catch { setError(ERROR_MESSAGES.failedToLoadPlanData); }`). Follow the same split: hook logs, page-level `error` state / snackbar surfaces user-facing failures. `SyncIndicator.tsx` should reflect `pendingCount`/`isSyncing`, not error text.

**Mutation pattern** (`useRecipeQueue.ts:35-48`, `create` + refetch):
```typescript
const addToQueue = useCallback(
  async (recipeId: string) => {
    if (isInQueue(recipeId)) return;
    await create(collections.recipeQueue, { recipe: recipeId, sort_order: maxOrder + 1 });
    await refreshQueue();
  },
  [isInQueue, queueItems, refreshQueue]
);
```
**Key divergence required:** `useRecipeQueue` does a naive `await create()` + full `refreshQueue()` — it is NOT optimistic. `useShoppingState` must diverge from this by applying the state change to local `Map` state *synchronously* before the async write (see RESEARCH.md Code Examples `applyOptimistic`/`syncLine` for the concrete divergence — query-then-branch upsert via `getFirstListItem`-equivalent `getAll` + filter, not create-then-catch-400, per Pitfall 5).

---

### `src/lib/sync-queue.ts` (utility, retry/backoff — no analog)

No existing retry/backoff/queue code exists anywhere in this repo (`grep -rn "backoff\|retry\|setTimeout.*attempt" src/` returns nothing prior to this phase). Build as a small, dependency-free, React-free module per RESEARCH.md's Don't-Hand-Roll guidance ("a small, phase-scoped `sync-queue.ts` module tailored to `shopping_state`'s shape" — not a generic offline queue). Structure it so `useShoppingState.ts` is the sole consumer, keeping it plain-function/testable under Vitest's existing `node` environment (`vitest.config.ts` — no jsdom).

---

### `src/lib/shopping-overlay.ts` (transform, derive-then-overlay — NEW)

**Analog:** `src/pages/Outputs.tsx:336-366` (`filteredShoppingListForExport`) — the only existing "overlay a checkbox-state Set onto a derived list" pattern in the codebase, currently pantry-only.

**Existing pattern to extend** (`Outputs.tsx:336-366`):
```typescript
const filteredShoppingListForExport = useMemo(() => {
  const filteredByStore = new Map<string, Map<string, typeof shoppingList>>();
  groupedShoppingList.byStore.forEach((sections, storeName) => {
    const filteredSections = new Map<string, typeof shoppingList>();
    sections.forEach((items, sectionName) => {
      const visibleItems = items.filter((item) => {
        if (item.isPantry) {
          const pantryKey = getPantryCheckboxKey(item.productId);
          return !checkedItems.has(pantryKey);
        }
        return true;
      });
      if (visibleItems.length > 0) filteredSections.set(sectionName, visibleItems);
    });
    if (filteredSections.size > 0) filteredByStore.set(storeName, filteredSections);
  });
  return filteredByStore;
}, [groupedShoppingList, checkedItems]);
```
New `shopping-overlay.ts` should extract this join into a pure, dependency-free function (see RESEARCH.md Pattern 2's `overlayShoppingItem`/`filterForExport` for the concrete target shape), generalizing beyond pantry-only to resolution (`buy`/`make`/`skip`) + have-N completion (D-04/D-05/D-06). Keep `Outputs.tsx`'s `useMemo` wrapper calling into this pure module rather than inlining the join logic in the page component (matches the existing separation where `aggregation.ts`/`variant-utils.ts` hold pure logic and `Outputs.tsx` only orchestrates `useMemo`/`useEffect`).

---

### `src/lib/api.ts` (config, add `shoppingState` collection)

**Analog:** same file, existing `collections` object.

**Pattern to copy** (`api.ts:51-68`):
```typescript
export const collections = {
  stores: "stores",
  sections: "sections",
  // ... existing entries ...
  mealVariantOverrides: "meal_variant_overrides",
  recipeQueue: "recipe_queue",
} as const;
```
Add `shoppingState: "shopping_state"` (or `planLineState: "plan_line_state"` per the naming discretion in CONTEXT.md) as one more line — no wrapper function needed; `getAll`/`create`/`update`/`remove` (already generic, `api.ts:5-48`) work unchanged against the new collection string.

---

### `src/lib/types.ts` (model, add `ShoppingState`, extend `MealVariantOverride`)

**Analog:** same file, `MealVariantOverride`/`MealVariantOverrideExpanded` (`types.ts:195-209`).

**Pattern to copy:**
```typescript
export interface MealVariantOverride extends BaseRecord {
  planned_meal: string; // relation ID
  original_node: string; // relation ID (recipe_product_node being replaced)
  replacement_product: string; // relation ID (product to use instead)
}

export interface MealVariantOverrideExpanded extends MealVariantOverride {
  expand?: {
    planned_meal?: PlannedMeal;
    original_node?: RecipeProductNode & { expand?: { product?: Product } };
    replacement_product?: Product;
  };
}
```
Extend `MealVariantOverride` with `quantity?: number | null; unit?: string | null;` (D-09/D-12 — `unit` should be the Phase-1 unit enum type from `src/lib/units.ts`, not `string`). Add a new `ShoppingState extends BaseRecord` interface with `weekly_plan: string; line_key: string; checked: boolean; have_quantity: number | null; resolution: "buy" | "make" | "skip";` plus a `ShoppingStateExpanded` if any relation expansion is needed (likely none — `weekly_plan` doesn't need expanding for this phase's UI). Follow the exact `BaseRecord`-extends + separate `*Expanded` interface convention already used throughout this file (also see `PlannedMealExpanded`, `types.ts:188-193`).

---

### `src/lib/aggregation/utils/variant-utils.ts` (transform, extend override pipeline)

**Analog:** same file (self) — `VariantOverride` interface (:13-16) and `applyVariantOverrides`'s replacement branch (:220-243).

**Current interface** (:13-16):
```typescript
export interface VariantOverride {
  originalNodeId: string; // recipe_product_node ID
  replacementProduct: Product; // full product object for the replacement
}
```
Extend to (per D-09, RESEARCH.md Pattern 3):
```typescript
export interface VariantOverride {
  originalNodeId: string;
  replacementProduct: Product;
  quantity?: number | null;
  unit?: string | null;
}
```

**Current replacement branch to modify** (:220-236):
```typescript
if (replacedNodeIds.has(node.id)) {
  const override = replacementMap.get(node.id)!;
  const replacementNode: ExpandedProductNode = {
    ...node,
    product: override.replacementProduct.id,
    // Clear quantity/unit since this is a pre-existing item (e.g., from freezer)
    // The user may want to customize this - for now, preserve original
    expand: {
      product: { ...override.replacementProduct, expand: undefined },
    },
  };
  newProductNodes.push(replacementNode);
}
```
Change to inherit-when-null (D-07/D-09) — replace the stale comment and add the two fields:
```typescript
const replacementNode: ExpandedProductNode = {
  ...node,
  product: override.replacementProduct.id,
  quantity: override.quantity ?? node.quantity,
  unit: override.unit ?? node.unit,
  expand: { product: { ...override.replacementProduct, expand: undefined } },
};
```
**Error handling:** existing `validateOverrides` (:41-66) pattern — collects `valid`/`invalid` overrides, silently drops invalid ones rather than throwing; no new error-handling convention needed here, just extend the data carried by the already-valid override objects.

---

### `src/lib/aggregation/types.ts` + `src/lib/aggregation.ts` (thread `lineId`)

**Analog:** `AggregatedFlowProduct.lineId` / `AggregatedProduct.lineId` (`aggregation/types.ts:84,146-148`) — Phase 1's already-established stable-key pattern for the shopping list, to be mirrored onto `StoredItem`, `PullListItem`, `MealContainer.containers[]`.

**Current shapes lacking `lineId`** (`aggregation/types.ts:181-224`):
```typescript
export interface StoredItem {
  productName: string;
  storageLocation: StorageLocation;
  containerTypeName?: string;
  mealDestination?: string;
  quantity?: number;
  unit?: string;
  recipeName: string;
}

export interface PullListItem {
  productName: string;
  quantity?: number;
  unit?: string;
  containerTypeName?: string;
  fromStorage: StorageLocation | "pantry";
}

export interface MealContainer {
  recipeName: string;
  containers: {
    productName: string;
    containerTypeName?: string;
    storageLocation: StorageLocation;
    quantity?: number;
    unit?: string;
  }[];
}
```
Add `lineId: string` to each (`StoredItem`, `PullListItem`, and each entry of `MealContainer.containers[]`), matching the existing `lineId: string` field already on `AggregatedFlowProduct`/`AggregatedProduct`. Populate per RESEARCH.md Architecture Patterns Pattern 1's concrete derivations:
- Stored items: capture the `flowGraph.products` Map key (already `createProductKey(...)`-derived, `aggregation/utils/product-utils.ts:80`) when iterating in `buildStoredItemsListFromFlow` (`aggregation.ts:329-354`) instead of discarding it.
- Pull list items: `lineId = \`${meal.id}-${step.id}-${node.id}\`` inside `buildPullLists` (`aggregation.ts:102-159`), using the `meal.id`/`node.id` already in scope.
- Meal containers: `lineId = \`${recipeName}::${cleanName}::${storageLocation}::${containerTypeName ?? "none"}\`` inside `buildMealContainersList` (`aggregation.ts:360-421`), surfacing the builder's existing internal `productKey` string (:392) rather than inventing a new scheme.

---

### `src/constants/outputs.ts` (checkbox key helpers)

**Analog:** same file's already-stable helpers (`getShoppingCheckboxKey`/`getPantryCheckboxKey`/`getBatchPrepCheckboxKey`, :311-327).

**Pattern to copy** (:318-320):
```typescript
export function getShoppingCheckboxKey(productId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.shoppingItem}${productId}`;
}
```
Collapse the three positional helpers (:332-355) to the same single-parameter shape:
```typescript
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
**Critical:** these three are currently dead code (zero call sites). The plan must both rewrite these signatures AND update the four inline call sites below — fixing only this file ships nothing.

---

### `src/components/outputs/FridgeFreezerTab.tsx` / `MealContainersTab.tsx` / `MicahMealsTab.tsx` / `PullListsTab.tsx` (positional-key call sites)

**Analog:** `FridgeFreezerTab.tsx` itself is the cleanest template for the other three (already imports and uses `CheckableListItem` correctly; only the key computation needs to change).

**Current defect pattern** (`FridgeFreezerTab.tsx:39-41`):
```typescript
<List dense>
  {items.map((item, idx) => {
    const key = `stored-${location}-${idx}`;
    ...
    return (
      <CheckableListItem
        key={key}
        itemKey={key}
        checked={checkedItems.has(key)}
        onToggle={onToggleChecked}
        ...
      />
    );
  })}
```
**Fix pattern:** replace `const key = \`stored-${location}-${idx}\`;` with `const key = getStoredCheckboxKey(item.lineId);` (after importing `getStoredCheckboxKey` from `../../constants/outputs`), once `StoredItem.lineId` exists. The prop surface (`checkedItems: Set<string>`, `onToggleChecked: (key: string) => void`) is unchanged — only the key computation changes, and the components stay structurally identical to today.

**Same fix, different inline formats** — verify all four before/after via `grep -rn "getStoredCheckboxKey\|getPullListCheckboxKey\|getContainerCheckboxKey" src/` (0 matches before except definitions; 4+ matches after):
- `PullListsTab.tsx:78` — `` `pull-${idx}-${storage}-${itemIdx}` `` → `getPullListCheckboxKey(item.lineId)` (note: PullListsTab uses raw `Checkbox`/`ListItem`/`ListItemIcon`/`ListItemText` inline, not `CheckableListItem` — `PullListsTab.tsx:80-89` — keep that structure, just swap the `key`/`checked`/`onChange` values).
- `MealContainersTab.tsx:60` — `` `meal-container-${idx}-${location}-${containerIdx}` `` → `getContainerCheckboxKey(container.lineId)`.
- `MicahMealsTab.tsx:64` — `` `micah-container-${idx}-${location}-${containerIdx}` `` (different prefix, same underlying `MealContainer[]` type/builder as `MealContainersTab`) → also `getContainerCheckboxKey(container.lineId)`.

---

### `src/components/outputs/ShopSwapDialog.tsx` (NEW dialog)

**Analog:** `src/components/VariantEditorDialog.tsx` (the only existing product-substitution dialog in the codebase).

**Imports pattern** (`VariantEditorDialog.tsx:1-29`):
```typescript
import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  List, ListItem, ListItemButton, ListItemText, ListItemIcon,
  Autocomplete, TextField, Chip, Paper, Divider,
} from "@mui/material";
import { Egg as ProductIcon, SwapHoriz as SwapIcon, Warning as WarningIcon } from "@mui/icons-material";
import type { Product, MealVariantOverride, RecipeProductNode } from "../lib/types";
import type { RecipeGraphData } from "../lib/aggregation";
import { previewOrphanedNodes } from "../lib/aggregation/utils/variant-utils";
import { ProductType } from "../lib/types";
```

**Autocomplete/product-search pattern to reuse verbatim** (`VariantEditorDialog.tsx:140-149,312-338`) — per RESEARCH.md's Don't-Hand-Roll guidance, do not build fuzzy search; copy this exact filter+Autocomplete shape:
```typescript
const replacementProducts = useMemo(() => {
  return products
    .filter((p) => p.type !== ProductType.Transient)
    .sort((a, b) => {
      if (a.type === ProductType.Inventory && b.type !== ProductType.Inventory) return -1;
      if (b.type === ProductType.Inventory && a.type !== ProductType.Inventory) return 1;
      return a.name.localeCompare(b.name);
    });
}, [products]);
// ...
<Autocomplete
  options={replacementProducts}
  value={selectedPendingOverride.replacementProduct}
  onChange={(_, newValue) => handleReplacementSelect(newValue)}
  getOptionLabel={(option) => option.name}
  groupBy={(option) => option.type}
  renderInput={(params) => <TextField {...params} label="Replacement Product" margin="dense" fullWidth />}
/>
```

**Pending-overrides local-state pattern** (`VariantEditorDialog.tsx:83-106,151-193`) — the `Map<string, PendingOverride>` populate-on-open / mutate-via-setState-copy idiom is the template for `ShopSwapDialog`'s per-meal quantity/unit + checked-meal state:
```typescript
const [pendingOverrides, setPendingOverrides] = useState<Map<string, PendingOverride>>(new Map());
useEffect(() => {
  if (open && existingOverrides.length > 0) {
    const initial = new Map<string, PendingOverride>();
    for (const override of existingOverrides) { /* populate */ }
    setPendingOverrides(initial);
  } else if (open) {
    setPendingOverrides(new Map());
  }
}, [open, existingOverrides]);
```
For `ShopSwapDialog`, seed this from `getMealNodeTargetsForProduct(productId, plannedMeals, recipeData)` (RESEARCH.md Code Examples — new helper, no existing equivalent; build and unit-test this BEFORE the dialog per phase doc item 9) rather than `existingOverrides`, and pre-fill quantity/unit per meal from each target's `quantity`/`unit` (D-07).

**Save/CRUD pattern to model the store-time write path on** — `src/pages/WeeklyPlans.tsx:476-499` (`handleSaveVariants`, delete+recreate per meal):
```typescript
const handleSaveVariants = async (
  mealId: string,
  overrides: { originalNodeId: string; replacementProductId: string }[]
) => {
  const existingForMeal = variantOverrides.filter((o) => o.planned_meal === mealId);
  await Promise.all(
    existingForMeal.map((o) => remove(collections.mealVariantOverrides, o.id))
  );
  await Promise.all(
    overrides.map((o) =>
      create(collections.mealVariantOverrides, {
        planned_meal: mealId,
        original_node: o.originalNodeId,
        replacement_product: o.replacementProductId,
      })
    )
  );
  await loadVariantOverrides();
};
```
The store-time swap's save handler in `Outputs.tsx` should follow this exact delete+recreate-per-meal shape (now also writing `quantity`/`unit` per D-09) and both writers (`WeeklyPlans.tsx`'s planning-time save and the new store-time swap) should stay on this one shared shape/collection to avoid divergence (CONTEXT.md explicit ask).

**Confirm-first pattern for make-it (D-10/D-11)** — no existing confirm-dialog component exists in the repo (`OutOfStockSection.tsx:145` wires directly to `handleAddRecipeToPlan` with **no** confirmation — this is the anti-pattern to avoid, not the analog to copy). Build a simple MUI `Dialog` with a text confirmation + Cancel/Confirm `DialogActions` (same `Dialog`/`DialogTitle`/`DialogContent`/`DialogActions` shell as `VariantEditorDialog.tsx:249-435`), wrapping the call to `handleAddRecipeToPlan` (`Outputs.tsx:563-576`) rather than reusing `OutOfStockSection`'s handler wiring verbatim.

---

### `src/components/outputs/QuickCreateProductDialog.tsx` (NEW dialog)

**Analog:** `VariantEditorDialog.tsx`'s Dialog shell + Autocomplete pattern (structure only — this dialog is much smaller: name + store/section + unit fields only, per D-08).

**CRUD pattern to use:** plain `create(collections.products, { name, store, section, canonical_unit })` via `src/lib/api.ts`'s generic `create<T>` (`api.ts:28-34`) — no bespoke product-creation helper exists elsewhere to copy beyond this generic wrapper. Per D-12, bind directly to `products.canonical_unit` using the Phase-1 unit enum from `src/lib/units.ts` (read that file before implementing field options), not free text.

**Return-into-picker pattern:** mirror `VariantEditorDialog`'s `onSave` prop-callback shape (`VariantEditorDialogProps.onSave`, :55-58) — `QuickCreateProductDialog` should accept an `onCreated: (product: Product) => void` prop that the parent (`ShopSwapDialog`) uses to immediately set the new product as `selectedPendingOverride.replacementProduct`, keeping the shopper in the swap flow per D-08.

---

### `src/components/outputs/SyncIndicator.tsx` (NEW, no analog)

No existing status/indicator component exists in this codebase to copy from. Build as a small, purely presentational MUI component (e.g. `CircularProgress` + `Badge`/`Chip` showing `pendingCount`), consuming `useShoppingState`'s `isSyncing`/`pendingCount` return values (RESEARCH.md hook skeleton). Mount in the `Outputs.tsx` header box (~line 614-654 per CONTEXT.md citation — verify exact lines when implementing, this file's line numbers may have shifted since RESEARCH.md was written).

---

### `src/pages/Outputs.tsx` (page/controller — multiple edits)

**Analog:** self — existing `checkedItems`/`toggleChecked` (:113,592-602) is the direct thing being replaced; existing override-map builder (:225-237) and `handleAddRecipeToPlan` (:562-576) are being extended/reused in place.

**Current state to replace** (:113, :592-602):
```typescript
const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
// ...
const toggleChecked = (key: string) => {
  setCheckedItems((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
};
```
Replace with `const { state, setChecked, setHaveQuantity, setResolution, isSyncing, pendingCount } = useShoppingState(selectedPlanId);` — all six tabs' `checkedItems`/`onToggleChecked` props (currently a `Set<string>` + toggle fn) need either an adapter that derives a `Set<string>` view from the hook's `Map` (cheapest, keeps every tab's prop signature identical — recommended) or updated prop types across all six tab components (larger, avoid unless the have-N/resolution features require it beyond the Shopping List tab specifically).

**Override-map builder to extend** (:225-237, current — forwards only two fields):
```typescript
if (override.expand?.replacement_product) {
  overridesByMeal.get(mealId)!.push({
    originalNodeId: override.original_node,
    replacementProduct: override.expand.replacement_product,
  });
}
```
Add the two new fields per D-09/Pattern 3:
```typescript
if (override.expand?.replacement_product) {
  overridesByMeal.get(mealId)!.push({
    originalNodeId: override.original_node,
    replacementProduct: override.expand.replacement_product,
    quantity: override.quantity ?? null,
    unit: override.unit ?? null,
  });
}
```

**Export filter to extend** (:336-366, current pantry-only filter) — generalize using the new `src/lib/shopping-overlay.ts` module (see above) so resolution (`make`/`skip`) and have-N-complete lines are also excluded from `filteredShoppingListForExport`, not just pantry-checked lines (D-06).

## Shared Patterns

### Generic CRUD wrapper
**Source:** `src/lib/api.ts:5-48` (`getAll`, `getOne`, `create`, `update`, `remove`)
**Apply to:** `useShoppingState.ts`, `ShopSwapDialog.tsx`'s save handler, `QuickCreateProductDialog.tsx`
```typescript
export async function create<T extends RecordModel>(
  collection: string,
  data: Partial<T>
): Promise<T> {
  const record = await pb.collection(collection).create<T>(data);
  return record;
}
```
This is the app's sole data-access layer — every new file's CRUD must go through these four generic functions plus the `collections` string map, never touch `pb` (the PocketBase client) directly.

### `*Expanded` interface convention
**Source:** `src/lib/types.ts` (`MealVariantOverrideExpanded`, `PlannedMealExpanded`, `RecipeQueueItemExpanded`)
**Apply to:** `ShoppingState`/`ShoppingStateExpanded` in `types.ts`
Every collection interface extends `BaseRecord`; if any relation needs expansion for a UI, a sibling `XExpanded extends X { expand?: {...} }` interface is added alongside it — never inline the expand shape into the base interface.

### `useMemo`-derived pipeline, no separate propagation step
**Source:** `src/pages/Outputs.tsx:318-332` (`productFlowGraph` → `shoppingList` → `groupedShoppingList`, all `useMemo`)
**Apply to:** `shopping-overlay.ts` integration point in `Outputs.tsx`
```typescript
const productFlowGraph = useMemo(
  () => buildProductFlowGraph(plannedMeals, recipeData),
  [plannedMeals, recipeData]
);
const shoppingList = useMemo(() => buildShoppingListFromFlow(productFlowGraph), [productFlowGraph]);
```
The overlay memo should be one more link in this same chain (`useMemo` keyed on `[groupedShoppingList, state]`), not a `useEffect`-driven side effect — this preserves the existing "swap propagates for free" architecture (bump `refreshCounter` → reload → re-derive) rather than introducing a second update path.

### Checkbox-key-prefix convention
**Source:** `src/constants/outputs.ts:267-274` (`CHECKBOX_KEY_PREFIXES`) + `:311-327` (stable-ID helpers)
**Apply to:** the three reworked positional helpers, and `useShoppingState`'s `line_key` values (which are exactly these prefixed keys)
```typescript
export const CHECKBOX_KEY_PREFIXES = {
  pantry: "pantry-", shoppingItem: "shop-", batchPrep: "batch-",
  stored: "stored-", pullList: "pull-", container: "container-",
} as const;
export function getShoppingCheckboxKey(productId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.shoppingItem}${productId}`;
}
```
`shopping_state.line_key` should store exactly the string these helpers return (e.g. `shop-<productId>`), so the hook's `Map<string, StateEntry>` can be keyed identically across all six tabs with one lookup convention.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/sync-queue.ts` | utility | event-driven (retry/backoff) | No retry/backoff/queue code exists anywhere in this repo today; build fresh per RESEARCH.md's Code Examples skeleton, kept dependency-free and unit-testable |
| `src/components/outputs/SyncIndicator.tsx` | component | request-response (status display) | No existing status/pending-indicator component in the codebase; small enough to build directly from the hook's `isSyncing`/`pendingCount` outputs without a template |

## Metadata

**Analog search scope:** `recipe-planner/src/{hooks,lib,components,pages}/**` (full read of `useRecipeQueue.ts`, `api.ts`, `types.ts`, `constants/outputs.ts`, `VariantEditorDialog.tsx`, `variant-utils.ts`, `CheckableListItem.tsx`, `aggregation/types.ts`, `WeeklyPlans.tsx` `handleSaveVariants`, `Outputs.tsx` lines 100-360 and 555-605, `FridgeFreezerTab.tsx`, `PullListsTab.tsx`)
**Files scanned:** 16 source files read directly this session, plus `grep` scans across `src/` for `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey`, `lineId`, `createProductKey`
**Pattern extraction date:** 2026-07-06
