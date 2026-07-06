# Phase 2: Shopping State & Live Substitution

> Derived from the authoritative decision record `plans/workflow-redesign.md` (Topic 1, roadmap item 2). Every collection/field/file below either exists in the current codebase (cited) or is explicitly marked **NEW**. Choices that go beyond the decision record are marked **Proposed (not yet decided)**.

---

## 1. Purpose & Problem Statement

This phase makes the shopping and prep-day list surfaces (`Outputs.tsx`) durable and store-usable, and lets substitutions happen *at the store* instead of only during planning.

Concrete failures today:

- **Checkbox state is in-memory only.** `Outputs.tsx:113` holds `const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())`. Every list tab (shopping, batch prep, fridge/freezer, containers, pull lists) shares this one Set via `toggleChecked` (`Outputs.tsx:592-602`). Nothing is written to PocketBase, so a refresh, a tab switch that unmounts, or picking the tablet back up mid-shop wipes all progress. The decision record calls this out directly ("Shopping checkbox state is in-memory only … resets on refresh/tab switch").
- **No partial-have.** A line is binary checked/unchecked (`ShoppingListTab.tsx:180-200`). "I already have 2 of the 5 potatoes" cannot be expressed, so the list can't show remaining-to-buy.
- **Substitution is a planning-time-only, pre-seeded-product operation.** The only swap path is `VariantEditorDialog.tsx`, opened from `WeeklyPlans.tsx` (`handleEditVariants` → `handleSaveVariants` at `WeeklyPlans.tsx:476-499`). It requires the replacement product to already exist (`replacementProducts` filter, `VariantEditorDialog.tsx:140-149`), operates per recipe-output node, and captures **no quantity/unit** for the replacement (the `meal_variant_overrides` record has only `planned_meal`, `original_node`, `replacement_product` — see `types.ts:191-195`). You cannot start from a shopping-list line and say "swap this across the two meals that use it," and you cannot do it from the store.
- **"Make it at home" is only half-wired.** `products.source_recipe` and `products.store_bought_product` relations exist (`types.ts:54-55`, schema `pbc_7402169584`), and `OutOfStockSection` + `Outputs.handleAddRecipeToPlan` (`Outputs.tsx:562-576`) already add a batch-prep recipe to the plan for *inventory* out-of-stock items. But an ordinary shopping-list line has no "I'll make this instead of buying it" action.
- **Shopping is tethered to home.** `db-config.ts:15-18` points at LAN IPs (`192.168.50.95:8090/:8091`), unreachable from the store. The decision record resolves this with the tailnet model (todo `nas-pocketbase-tailnet`), not offline-first sync.

Solving these turns the tablet into the live shopping+prep device the household already wants to use, and lets the flow-graph substitution machinery (which already re-derives every output — `Outputs.tsx:288-307`, `applyVariantOverrides`) be driven from where the problem is actually noticed: the store shelf.

---

## 2. Feature Descriptions

**Persisted list state per weekly plan.** Every checkable line on the Outputs tabs remembers its state in PocketBase, scoped to the selected weekly plan. Check off "olive oil," switch tabs, refresh, or pick up a different device on the tailnet — the checks are still there. State is per-plan, so last week's checks don't bleed into this week.

**Numeric "have N" with remaining-to-buy.** Each shopping line gains a small quantity control ("have 2 of 5"). The line then displays the remaining amount to buy and auto-completes (visually checked/dimmed) when have ≥ needed. Lines with no quantity (pantry check-style items) keep the simple checkbox behavior.

**Mid-shop swap flow.** From any shopping-list line, a "Swap" action opens a dialog that:
1. lists which of *this week's* planned meals actually use that product (derived from the flow graph / product nodes),
2. lets the user check the meals to apply the substitute to,
3. prompts an explicit **quantity + unit per checked meal** for the substitute,
4. picks the replacement product (fast search over existing products; **quick-create** if missing — see below),
5. on save, writes/extends `meal_variant_overrides` for the matching output node in each chosen meal.

Because all Outputs lists are derived from the flow graph (`buildProductFlowGraph` → `buildShoppingListFromFlow`/`buildBatchPrepListFromFlow`/etc. in `Outputs.tsx:318-382`, with overrides folded in at load via `applyVariantOverrides`), the swap automatically re-derives the shopping list, prep steps, pull lists, and containers. No separate propagation step.

**"Make it" action on a line.** A shopping line can be resolved as "make it": the line is marked not-to-buy (excluded from the buy list). If the underlying product has a `source_recipe`, the dialog offers to add that recipe to the current week so its prep steps flow into the batch-prep list — reusing the existing `handleAddRecipeToPlan` path (`Outputs.tsx:562-576`). This resolves the standing "raw state is in the house" todo.

**Minimal phone-friendly quick-create dialog.** When a swap needs a product that doesn't exist yet, a ruthlessly minimal dialog creates it: **name + store/section + unit** only (per the decision record). No graph, no type wizardry. It returns the new product straight into the swap so the shopper isn't blocked.

**Tablet-first touch pass on Outputs.** Larger tap targets, comfortable spacing, and controls (have-N steppers, swap/make-it buttons) sized for touch on the Outputs tabs. The primary device is the tablet at the store and on the prep counter.

**Print for batch prep only.** The existing print stylesheet (`styles/printStyles.css`, `BatchPrepPrintView.tsx`) is retained and scoped to batch prep. Shopping goes fully digital (no shopping print path added). This is mostly a scoping/cleanup decision, not new machinery.

**Connectivity behavior.** With the NAS on the tailnet and `db-config.ts` on tailnet hostnames, the tablet reaches PocketBase from the store over a phone hotspot. The UI uses **optimistic updates**: a tap flips the checkbox / sets have-N immediately, the write happens in the background, failures retry, and a small **pending-sync indicator** shows when writes are in flight or queued. No offline-first sync engine (explicitly rejected in the exploration notes, 2026-07-05).

---

## 3. Data Model Changes

> **Schema-file caveat (important):** `pb_schema_updated.json` is **stale** — it does not contain the `meal_variant_overrides` or `recipe_queue` collections, yet both exist live (confirmed: `GET /api/collections/meal_variant_overrides/records` returns 200 on both prod :8090 and test :8091). `api.ts:66-67` and `types.ts:191-205` treat them as real. Before Phase 2 schema work, **re-export the true schema** so the source-of-truth file matches reality; otherwise a schema sync (`scripts/sync-to-test.js`) risks dropping live collections.

### 3.1 NEW collection: `shopping_state` (per-plan line state)

Persists the currently-in-memory `checkedItems` Set plus have-N and resolution. One row per (weekly_plan, line_key).

| field | type | notes |
|---|---|---|
| `weekly_plan` | relation → `weekly_plans` (`pbc_6291058473`), required, cascadeDelete | scopes state per plan |
| `line_key` | text, required | the checkbox key produced by `constants/outputs.ts` helpers (`CHECKBOX_KEY_PREFIXES`, `outputs.ts:267-274`). Actual prefixes are `getShoppingCheckboxKey` → `shop-<productId>`, `getPantryCheckboxKey` → `pantry-<productId>`, `getBatchPrepCheckboxKey` → `batch-<stepId>`, `getStoredCheckboxKey` → `stored-<location>-<index>`, `getPullListCheckboxKey` → `pull-<day>-<meal>-<index>`, `getContainerCheckboxKey` → `container-<index>`. Reusing these keys means one collection covers *all* Outputs tabs, not just shopping. **Not all keys are content-stable — see the correctness caveat below.** |
| `checked` | bool | replaces membership in the in-memory Set |
| `have_quantity` | number, nullable | numeric "have N"; null = simple checkbox semantics |
| `resolution` | select, nullable | **Proposed** enum: `buy` (default/none), `make`, `skip`. Encodes the make-it / not-to-buy state. |

Indexes: unique on (`weekly_plan`, `line_key`) so upserts are idempotent.

**Positional-key correctness caveat (must resolve before persisting these tabs).** `getShoppingCheckboxKey`/`getPantryCheckboxKey`/`getBatchPrepCheckboxKey` derive from a stable product or step ID, so they are safe to persist. But `getStoredCheckboxKey(location, index)`, `getPullListCheckboxKey(day, meal, index)`, and `getContainerCheckboxKey(index)` (`constants/outputs.ts:332-355`) key by **array position**, not item identity. Persisting a positional key binds the checked state to a *slot*, not a *thing*. This phase's own make-it action (Implementation item 12) calls `handleAddRecipeToPlan` (`Outputs.tsx:562-576`), which `create`s a new `planned_meal` and bumps `refreshCounter` — re-deriving the stored/container/pull lists and shifting every downstream index. A row persisted at position N then renders a *different* physical item as checked. This is silent mis-attachment (a correctness defect), not the benign "reset" described in Risk 1. **Decision required (see Implementation item 6a):** either (a) exclude the three index-keyed tabs (stored, containers, pull) from persistence in this phase and persist only the ID-stable tabs (shopping, pantry, batch prep), or (b) replace the positional keys with content-derived stable keys (product-/step-id based) *before* persisting them. Do not persist index-based keys while this phase also mutates list order.

**Migration:** none for existing rows (net-new collection). Existing in-memory behavior is replaced by reading/writing this collection.

**Naming is Proposed** (`shopping_state` vs `plan_line_state` vs `list_state`) — since it covers all list tabs, a plan-line-state name may read truer; deferred to implementation.

### 3.2 CHANGED collection: `meal_variant_overrides` (add quantity/unit)

Live shape today (`types.ts:191-195`): `planned_meal`, `original_node`, `replacement_product`. The swap flow requires an explicit per-recipe quantity, which has no home today.

Add:
| field | type | notes |
|---|---|---|
| `quantity` | number, nullable | the "prompt quantity per recipe" value for the substitute |
| `unit` | text (enum later), nullable | unit for the substitute quantity. **Dependency:** unit standardization / canonical-unit enum is **Phase 1/3** scope; Phase 2 stores free-text unit here and tightens to the enum when Phase 1 lands. |

**Storing these fields is not sufficient — the value must be threaded through re-derivation, which today it is not.** The headline feature (a per-meal substitute quantity/unit that changes the shopping/prep lists) has *three* code touchpoints that currently drop the quantity, and none of them appear in the implementation plan unless explicitly added (see Implementation item 10, sub-items 10a–10c):

1. `VariantOverride` (`variant-utils.ts:13-16`) has only `originalNodeId` + `replacementProduct` — no quantity/unit field.
2. `applyVariantOverrides` (`variant-utils.ts:220-243`) deliberately **preserves the original node's quantity/unit** (comment at :228-229 "for now, preserve original") and swaps only the product relation.
3. The override→`VariantOverride` map builder in `Outputs.tsx:225-237` forwards only `originalNodeId` + `replacementProduct`, discarding any persisted quantity/unit off the `MealVariantOverride` record.

So a plan that persists the quantity but omits items 10a–10c would build the swap UI, write the value, and observe **zero effect** on any output list — silently failing Acceptance Criterion #4. The inherit-when-null behavior is therefore a required implementation item (10b), not just prose.

**Migration:**
- **Pre-migration check (required, item 3a):** query live prod (`:8090`) and test (`:8091`) for existing `meal_variant_overrides` rows before adding fields (`GET /api/collections/meal_variant_overrides/records?perPage=1`). The "nothing regresses" argument below assumes the row count; confirm it rather than asserting it.
- Existing override rows get null quantity/unit. `applyVariantOverrides` must treat null quantity/unit as "inherit the original node's quantity/unit" (item 10b). With that behavior in place the migration is safe **regardless** of how many rows exist, so the safety no longer hinges on the zero-rows assumption.

### 3.3 No change needed for make-it plumbing

`products.source_recipe` and `products.store_bought_product` (schema `pbc_7402169584`, `types.ts:54-55`) already exist and are already consumed by `OutOfStockSection`/`handleAddRecipeToPlan`. Make-it reuses them; the only new persistence is `shopping_state.resolution`.

### 3.4 Quick-create fields

Product quick-create writes `products.name` + `products.store` + `products.section` (all existing fields). A dedicated `unit` on `products` does **not** exist today (unit lives on `recipe_product_nodes.unit`); the canonical-unit-on-product field is **Phase 1/3**. For Phase 2 the quick-create "unit" is captured onto the swap override's `unit`, not onto the product — **flagged** so Phase 3 can reconcile.

---

## 4. Implementation Plan

Ordered; each item independently verifiable.

1. **Infra prereq — tailnet + hostname switch** (blocks store use, not the code).
   - Join NAS to tailnet; update `recipe-planner/src/lib/db-config.ts:15-18` to tailnet hostnames; verify CORS/serve allows the app origin. Per todo `nas-pocketbase-tailnet`. Verify: app loads and reads/writes PocketBase from a hotspot-only device.

2. **Re-export authoritative schema.** Regenerate `pb_schema_updated.json` from a live instance so it includes `meal_variant_overrides` + `recipe_queue` before adding collections. **This is the same one-shot re-export Phase 1 §4.4 performs (and Phase 6 item 1 repeats);** if Phase 1 has already run, verify the two collections are present rather than re-doing it — the phases share one re-export task, restated per phase because they can ship out of order. Verify: diff shows the two previously-missing collections now present.

3. **Create `shopping_state` collection + `meal_variant_overrides` field additions** (section 3). Add `collections.shoppingState` to `api.ts:51-68`; add `ShoppingState` interface + extend `MealVariantOverride`/`MealVariantOverrideExpanded` in `types.ts`. Verify: CRUD via `getAll`/`create`/`update` round-trips.
   - **3a. Pre-migration override-count check.** Before adding the quantity/unit fields, query prod (`:8090`) and test (`:8091`) for existing `meal_variant_overrides` rows (`GET /api/collections/meal_variant_overrides/records?perPage=1`, read `totalItems`). Record the count; it drives whether the inherit-when-null path (item 10b) needs backfill attention. Verify: count captured for both DBs.

4. **Persisted-state hook.** New `useShoppingState(weeklyPlanId)` hook (create `src/lib/hooks/useShoppingState.ts`) that loads all `shopping_state` rows for the plan into a map keyed by `line_key`, and exposes `setChecked`, `setHaveQuantity`, `setResolution` with **optimistic** local update + background upsert + retry + a `pendingCount`/`isSyncing` flag. Verify: toggling persists across refresh; killing the network shows pending indicator and recovers on reconnect.

5. **Wire Outputs to the hook.** Replace the in-memory `checkedItems` Set and `toggleChecked` in `Outputs.tsx:113,592-602` with the hook. All tabs already pass `checkedItems`/`onToggleChecked` down (`ShoppingListTab`, `BatchPrepTab`, `FridgeFreezerTab`, `MealContainersTab`, `MicahMealsTab`, `PullListsTab`), so the prop surface is unchanged. Verify: every tab's checks persist per plan.

6. **Have-N control + remaining-to-buy** in `ShoppingListTab.tsx`. Add a stepper per non-pantry line; compute remaining = `totalQuantity − have_quantity`; auto-complete line when remaining ≤ 0. Verify: "have 2 of 5" shows "3 to buy" and completes at 5.
   - **6a. Resolve the positional-key defect before persisting stored/container/pull tabs** (see §3.1 caveat). Pick one: (a) scope persistence to the ID-stable tabs (shopping/pantry/batch-prep) this phase and leave the three index-keyed tabs in-memory; or (b) replace `getStoredCheckboxKey`/`getPullListCheckboxKey`/`getContainerCheckboxKey` (`constants/outputs.ts:332-355`) with content-derived keys. Because item 12's make-it mutates plan order via `handleAddRecipeToPlan`, index-keyed persistence is a correctness bug, not a cosmetic one. Verify: after a make-it adds a planned meal, no previously-checked stored/container/pull line shows a *different* item as checked.

7. **Derive-then-overlay layer** — the join between the flow-graph-derived lists and persisted `shopping_state`. The shopping/prep lists are derived *purely* from the flow graph (`buildShoppingListFromFlow` etc., `Outputs.tsx:325-382`); `shopping_state` is pure persistence with no back-reference. Three features (have-N remaining, auto-complete, make-it removal) require the *rendered and exported* buy list to be filtered/annotated by `shopping_state` at render time. Today the only such overlay is the pantry filter, and the export path `filteredShoppingListForExport` (`Outputs.tsx:336-366`) filters **pantry only**. Define, as its own item: where the join lives (a memo over `groupedShoppingList` × the hook's state map, keyed by `getShoppingCheckboxKey`), how `resolution='make'` / `have ≥ needed` / `checked` modify the visible list, and — explicitly — whether the **export** path also excludes make-it and have-N-complete lines (proposed: yes, export mirrors the visible buy list). This decides whether item 12's "drops off buy list" means *hidden* or *shown-as-resolved*. Verify: a make-it'd line and a have-N-complete line are absent from both the on-screen buy list and the export.

8. **Pending-sync indicator** component (create `src/components/outputs/SyncIndicator.tsx`) fed by the hook's `isSyncing`/`pendingCount`; mount in the Outputs header (`Outputs.tsx` header box ~614-654). Verify: indicator reflects in-flight/queued writes.

9. **Shopping-line → per-meal node mapping** (build and verify this *before* the swap dialog — the dialog depends on it). Helper to go from an aggregated shopping line (`AggregatedProduct.productId`, `aggregation/types.ts:118-129`) back to the per-meal `recipe_product_node`s of that product, yielding `{ planned_meal, original_node }` pairs (what `meal_variant_overrides` needs). **Data-source correction:** the aggregation output carries *no* link back to meals or nodes — `AggregatedProduct.sources` (`aggregation/types.ts:128`) and `AggregatedFlowProduct.mealSources` (`aggregation/types.ts:73`) hold only `{ recipeName, quantity, count/unit }`, i.e. recipe-**name** strings, no `planned_meal` IDs and no `recipe_product_node` IDs. So this cannot come "from the flow graph." It must be re-derived by iterating `plannedMeals` and, for each, scanning its meal-keyed `recipeData` product nodes for ones whose product matches `productId`. Two meals sharing a recipe resolve to the **same** `original_node` ID but distinct `planned_meal` IDs — the mapping (and the dialog) must key by `planned_meal`, since the `recipeName` string alone cannot distinguish them. Also note the aggregator collapses many nodes into one line and creates synthetic instance IDs (`product-builder.ts:101-124`); the mapping must resolve to real node IDs. Verify: a product used by two planned meals (even of the same recipe) yields two distinct `{planned_meal, original_node}` targets.

10. **Thread substitute quantity/unit through re-derivation** (§3.2). Storing the value is inert without these three edits — do them as one verifiable unit:
    - **10a.** Extend the `VariantOverride` interface (`variant-utils.ts:13-16`) with optional `quantity?: number | null` and `unit?: string | null`.
    - **10b.** Modify the node-replacement branch of `applyVariantOverrides` (`variant-utils.ts:220-243`) to override the replacement node's `quantity`/`unit` when the override provides them, and **fall back to the original node's** when null/undefined (the inherit-when-null behavior the migration in §3.2 relies on). Remove the "for now, preserve original" shortcut (:228-229).
    - **10c.** Update the override→`VariantOverride` map builder in `Outputs.tsx:225-237` to read `quantity`/`unit` off the `MealVariantOverride` record and pass them into the `VariantOverride`.
    - Verify: an override row with `quantity=2, unit='cup'` changes the aggregated line's quantity for that meal; a row with null quantity leaves the original node's quantity unchanged.

11. **Mid-shop swap dialog** (create `src/components/outputs/ShopSwapDialog.tsx`, or refactor-share with `VariantEditorDialog.tsx`). Opened from a shopping line. Uses the item-9 mapping to list this week's planned meals that use the product (keyed by `planned_meal`); check-list of meals; per-checked-meal quantity+unit inputs; replacement product search; save → delete+recreate `meal_variant_overrides` per meal (mirroring `handleSaveVariants`, `WeeklyPlans.tsx:476-499`, now including quantity/unit) → bump `refreshCounter` (`Outputs.tsx:105,316`) to re-derive. Verify: swapping from a line updates shopping/prep/pull/containers for exactly the chosen meals, at the entered quantities.

12. **Make-it action** on a shopping line. UI control sets `shopping_state.resolution = 'make'` (the overlay layer, item 7, excludes the line from buy list + export); if the product has `source_recipe`, offer "add to this week" via existing `handleAddRecipeToPlan` (`Outputs.tsx:562-576`). Verify: line drops off buy list and export; if source_recipe present and confirmed, its steps appear in batch prep.

13. **Quick-create dialog** (create `src/components/outputs/QuickCreateProductDialog.tsx`): name + store/section (+ unit captured for the override). Returns the created `Product` into the swap dialog. Verify: creating a product mid-swap immediately selectable as the replacement.

14. **Tablet touch pass** on Outputs tabs: enlarge tap targets, spacing, stepper/swap/make-it controls. Verify: comfortably operable on the tablet at typical viewport.

15. **Print scoping.** Confirm `printStyles.css` targets only batch prep (`#batch-prep-list`); ensure no shopping print affordance is added. Verify: print preview from batch prep is clean; shopping has no print path.

---

## 5. Dependencies & Prerequisites

- **Phase 1 (Data hygiene) — soft dependency.** The unit-blind summing bug (`product-builder.ts:87-100`) is Phase 1's fix; have-N "remaining-to-buy" math is only meaningful once a line's `totalQuantity` is a single coherent unit. Phase 2 can ship on top of interim product+unit keying, but the canonical-unit enum for `meal_variant_overrides.unit` and quick-create unit comes from Phase 1/3. **Flag:** if Phase 2 ships before Phase 1, remaining-to-buy can still be wrong for mixed-unit lines.
- **Infra: NAS on tailnet + `db-config.ts` hostname switch** (todo `nas-pocketbase-tailnet`). Blocks *store usability*, not local dev. The optimistic-update/retry/pending-indicator design assumes this connectivity model.
- **Schema re-export** (item 2) blocks safe schema changes (stale `pb_schema_updated.json`).
- **Existing machinery reused (not blockers):** flow-graph derivation + `applyVariantOverrides` (`Outputs.tsx:288-382`), `meal_variant_overrides` CRUD (`WeeklyPlans.tsx:476-504`), `products.source_recipe`/`store_bought_product`, `handleAddRecipeToPlan`, checkbox-key helpers (`constants/outputs.ts:311-355`).
- **Blocks later phases:** none hard. Registry seeding (Phase 3) makes quick-create rarer and upgrades its unit handling, and extends this phase's quick-create dialog + `ShopSwapDialog` product search (Phase 3 §4.5–4.6). **Phase 5 (prep-day engine) has a *soft* dependency on this phase:** its cook-mode progress persistence is recommended to reuse the `shopping_state` persisted-checkbox mechanism built here (Phase 5 §3.3) rather than build a second persistence model; if this phase's shape isn't final, Phase 5 falls back to its own `cook_progress` collection.

---

## 6. Acceptance Criteria

1. Checking/unchecking any line on any Outputs tab persists to PocketBase and survives refresh, tab-unmount, and device switch, scoped to the selected weekly plan.
2. A second plan's checks are independent of the first.
3. A shopping line accepts a numeric "have N," displays remaining-to-buy, and auto-completes when have ≥ needed.
4. From a shopping line, the swap dialog lists exactly the current week's meals that use that product, applies to only the checked ones, records a per-meal quantity+unit, and after save the shopping/prep/pull/container lists re-derive to reflect the substitute for those meals only.
5. A swap can use a product created in the quick-create dialog (name + store/section + unit) without leaving the flow.
6. "Make it" on a line removes it from **both** the on-screen buy list and the export (per the item-7 overlay decision) and, when the product has a `source_recipe`, can add that recipe to the week so its steps appear in batch prep.
7. On a **transient** connectivity drop (network lost, page *not* reloaded), taps still update the UI immediately from the in-memory optimistic queue, a pending-sync indicator appears, and on reconnect the queued writes land with no lost state. *(Bound: the optimistic queue lives in memory only; a page reload or app kill before reconnect is out of scope for this AC — see Risk "optimistic retry semantics." Verifier tests a hotspot drop-and-restore without reloading.)*
8. Batch prep still prints cleanly; shopping has no print affordance.
9. Outputs controls are comfortably touch-operable on the tablet.

---

## 7. Risks & Open Questions

- **Line-key stability & positional-key correctness.** Two distinct problems here. (a) *ID-derived keys* (`shop-`, `pantry-`, `batch-`) can shift when instance-mode products synthesize keys (`product-builder.ts:101-124`) or a recipe graph changes, causing persisted state to *reset* — benign for single-user. (b) *Index-derived keys* (`stored-<location>-<index>`, `pull-<day>-<meal>-<index>`, `container-<index>`, `constants/outputs.ts:332-355`) are a **correctness** hazard, not a reset: persisted state binds to a list *position*, and this phase's own make-it (item 12 → `handleAddRecipeToPlan`) reorders those lists, so a check at position N renders a *different* item as checked. **Resolved in scope by item 6a** (exclude index-keyed tabs from persistence, or make keys content-derived) — do not persist positional keys while list order can mutate. **Open:** garbage-collect orphaned `shopping_state` rows, or leave them inert?
- **Shopping-line → node mapping** (item 9, sequenced *before* the swap dialog) is the trickiest piece. The aggregation output has **no** back-link to meals/nodes (`AggregatedProduct.sources`/`AggregatedFlowProduct.mealSources` carry only recipe-name strings), so the mapping is re-derived from `plannedMeals` × meal-keyed `recipeData`, not "from the flow graph." Care needed where the aggregator is many-nodes-to-one-line (a product consumed by multiple steps in one recipe) and where two planned meals share a recipe (same `original_node`, distinct `planned_meal` — the dialog must distinguish by `planned_meal`).
- **`resolution` enum** (`buy`/`make`/`skip`) is **Proposed** — the decision record names only "make it / not-to-buy." Values beyond that (e.g. an explicit `skip`) are a modeling convenience, confirm during planning.
- **Collection name** `shopping_state` is **Proposed**; it actually holds state for all list tabs, so a `plan_line_state` name may be truer.
- **`meal_variant_overrides.unit` as free text** is an interim; it should become the Phase-1 canonical-unit enum. Two writers of overrides now exist (planning-time `VariantEditorDialog` and store-time swap) — keep their write path shared to avoid divergence.
- **Stale schema file** risks a sync dropping `meal_variant_overrides`/`recipe_queue`; item 2 must run first.
- **Optimistic retry semantics** (backoff, max attempts, conflict handling on concurrent device edits) are unspecified; single-user makes conflicts rare but two tablets in one household is conceivable. **Deferred** to implementation; last-write-wins is the assumed default. **Scope bound (ties to AC #7):** the optimistic queue is in-memory only — it covers transient drops without a reload. Surviving a page reload / app kill would require persisting the queue (localStorage/IndexedDB); that is **explicitly out of scope** here (it edges toward the rejected offline-first model). If durable-across-reload queuing is later wanted, it is a separate decision.
- **Deferred out of scope:** offline-first sync (explicitly rejected), any shopping-list print path, per-person portioning (Phase 4 people-multiplier).
