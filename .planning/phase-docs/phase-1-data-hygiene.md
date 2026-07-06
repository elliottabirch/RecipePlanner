# Phase 1: Data Hygiene

> Source of authority: `plans/workflow-redesign.md` (roadmap item 1 and Topic 2). This
> document elaborates that decision record for a planner who has not read the discussion.
> Where it goes beyond the record, choices are marked **Proposed (not yet decided)**.
> All file/collection/field references below were verified against the live code on
> 2026-07-05. Note: `pb_schema_updated.json` is **stale** — it omits the
> `meal_variant_overrides` collection that the app uses — so collection/relation lists here
> are enumerated against the code and live DB, and §4.4 includes a schema re-export task.

---

## 1. Purpose & Problem Statement

The data layer has no unit discipline. Quantities are free-text, one field is overloaded
to mean two different things, product names have near-duplicates with no uniqueness
constraint, and the written spec disagrees with the code. Every downstream output
(shopping list, batch prep, containers) inherits these defects. This phase makes the data
layer trustworthy so the later phases (shopping state, registry seeding, week memory,
scheduler) build on solid ground.

Concrete failures today, with evidence:

- **Unit-blind quantity summing (confirmed bug).**
  `src/lib/aggregation/builders/product-builder.ts:69` keys the aggregation map by
  `product.id` alone, and `:91` does `existing.totalQuantity += newProduct.totalQuantity`
  with no unit comparison. `unit` is carried along untouched from the first node seen
  (`:44`). The same pattern repeats for step inputs
  (`src/lib/aggregation/builders/step-builder.ts:132-136`) and outputs (`:144-147`).
  Real data: the white-bean-stew recipe has olive-oil nodes of `0.25 cup` and `2 tbsp`;
  the shopping list renders "olive oil — 2.25 cup" at
  `src/components/outputs/ShoppingListTab.tsx:182-183`
  (`${item.totalQuantity} ${item.unit}`). The number is arithmetic nonsense.

- **`unit` field is overloaded (confirmed bug).**
  `recipe_product_nodes.unit` (a free-text field, per `pb_schema_updated.json`) means a
  *measurement unit* for raw/transient products, but is deliberately stuffed with the
  *container-type name* for stored products. See `src/pages/RecipeEditor.tsx:397-400` and
  `:485-488`:
  `unit: selectedProduct.type === "stored" ? containerTypeName : productUnit`. The
  aggregation layer then reads it back as a container name at
  `src/lib/aggregation.ts:334` and `:388` (`containerTypeName: product.unit // unit is
  now the container type`). One field cannot be standardized into a unit enum while it is
  also holding container names — the overload must be removed first.

- **No unique constraint on `products.name`.**
  `pb_schema_updated.json` shows the `products` collection has **no indexes at all**.
  Near-duplicates exist in prod (the decision record cites Olive oil / olive oil,
  parsley / parsley (raw)); `scripts/find-duplicates.js` already exists to surface them
  but nothing prevents re-introduction.

- **Spec/code divergence on step aggregation.**
  `decisions.md:41-44`, `:87`, and `:16-18` all state step aggregation is "exact string
  match" on the step name. The code does **not** do that: `createStepSignature`
  (`src/lib/aggregation/utils/step-utils.ts:20-27`) keys steps by a sorted
  input-product-ID + output-product-ID signature, and `processRecipeSteps`
  (`step-builder.ts:181-184`) builds the merge key from that signature, ignoring the step
  name entirely (names are collected into `stepNames[]` for display only). The decision
  record rules the signature behavior is correct and kept; the docs must be reconciled to
  it.

None of these are new features — they are correctness fixes plus the minimum schema/enum
scaffolding (`Topic 2`) that unblocks Phases 2–5.

---

## 2. Feature Descriptions

Day-to-day, after this phase:

- **Shopping and prep quantities stop lying.** When two recipes call for the same product
  in the *same* dimension (0.25 cup + 2 tbsp olive oil), the list shows a single correct
  figure converted to one unit (e.g. "olive oil — 6 tbsp" or "0.375 cup", whichever is
  the product's canonical unit). When two recipes call for it in *incompatible*
  dimensions (5 potatoes vs 2 lb potatoes), they are **not** silently added; the list
  shows them as separate lines and the linter flags the recipe so the author can fix the
  authoring-time mismatch. No density/weight-to-volume math is attempted.

- **Units become a controlled vocabulary.** When authoring a product node, the unit is
  chosen from a fixed enum (tsp, tbsp, cup, fl oz, ml, l, qt, pint, gal, g, kg, oz, lb,
  each), not typed free-hand. Each product declares a **canonical unit** it aggregates
  into and, implied by that unit, a **dimension** (volume / mass / count).

- **Container type is its own thing.** For stored outputs, the container ("1 qt
  rectangular") is read from the product's existing `container_type` relation and the node
  keeps a real measurement unit (or none). The graph editor and every output that showed
  a container where a unit belonged now show the right thing in the right place.

- **One clean product list.** After a one-shot dedup pass, "Olive oil" and "olive oil"
  are a single record; a case-insensitive uniqueness rule prevents a second "olive oil"
  from ever being created.

- **A linter tells you what's wrong before it reaches the fridge.** An on-demand "Lint"
  report lists data-hygiene violations: cross-dimension unit mismatches, prep-words baked
  into raw product names ("parsley (raw)", "diced onion" as a *raw* product), and
  non-pantry raw products missing a store or section (the rule already documented in the
  recipe-import skill, now machine-checked). Findings link to the offending
  product/recipe.

- **The written design matches the code.** `decisions.md` describes step aggregation the
  way the app actually behaves (input/output signature), so future contributors and skills
  don't code against a fiction.

---

## 3. Data Model Changes

PocketBase schema in this repo is managed through the PB Admin UI and captured in
`pb_schema_updated.json` (the source of truth). There is **no `pb_migrations/` directory**
and `scripts/sync-to-test.js` copies *records*, not schema. Therefore each schema change
below must be (a) applied in the PB Admin UI on **both** prod (`:8090`) and test
(`:8091`), and (b) re-exported into `pb_schema_updated.json` in the same commit.

### 3.1 `products` — new fields (all NEW; none exist today)

| field | type | notes |
|---|---|---|
| `canonical_unit` | select (enum, nullable) | The unit this product aggregates into. Enum values listed in §4.2. Nullable during backfill; linter flags non-pantry products still missing it. |
| `dimension` | select: `volume` / `mass` / `count` (nullable) | Deterministically implied by `canonical_unit`; stored for query-ability and set automatically whenever `canonical_unit` is set. **Proposed:** store it rather than derive-only, to honor the record's literal "canonical unit + dimension per product" wording; the app treats `canonical_unit` as the single source of truth and writes `dimension` from the unit→dimension map so they cannot drift. |

Existing `products.container_type` (relation → `container_types`) is unchanged and becomes
the *only* home for container type once the `unit` overload is removed.

Migration: add fields nullable, backfill `canonical_unit`/`dimension` per product in the
dedup/backfill pass (§4.4). No destructive change to existing rows.

### 3.2 `products` — new index (NEW)

Case-insensitive unique index on `name`:

```sql
CREATE UNIQUE INDEX idx_products_name_ci ON products (name COLLATE NOCASE)
```

Must be added **after** dedup (§4.4) — the index creation will fail while duplicates
exist. Add via PB Admin UI "Indexes" on the `products` collection.

### 3.3 `recipe_product_nodes.unit` — semantics change (no schema type change)

Field stays a text column in PB, but its meaning is narrowed to **measurement unit only**.
The container-type name is no longer written here. Two options for enforcement, in
increasing strictness:

- Minimum (this phase): app-level validation against the unit enum on write, plus a linter
  rule; PB column stays free text so no risky select-migration on existing rows.
  **Existing rows are not left as-is:** a one-shot pass (§4.4) normalizes current
  free-text/container-name values to enum tokens via the `UNIT_ALIASES` map, so downstream
  aggregation and lint operate on clean data. Constraining *future* entry (§4.7) alone is
  insufficient — the existing corpus must be repaired too.
- **Proposed (not yet decided):** later convert the column to a PB `select` once all
  existing node values are confirmed to be members of the enum. Deferred because a stray
  non-enum value would break the schema import.

### 3.4 Container type on nodes — decision needed

Container type is currently a **product-level** attribute (`products.container_type`) and
this phase sources it from there. If a single stored product ever needs different
containers in different recipes, a per-node `container_type` relation on
`recipe_product_nodes` would be required. The current data does not demonstrate that need.
**Open question (§7)** — not built in this phase.

---

## 4. Implementation Plan

Ordered; each item is independently verifiable.

### 4.1 Reconcile `decisions.md` with actual step-aggregation behavior (docs only)

- **Modify** `decisions.md`: update the "Step Aggregation" section (`:41-44`), the
  "Aggregation → Matching keys" bullet (`:84-87`), and the prep-step "Aggregated across
  recipes by exact string match" line (`:16-18`) to describe the real behavior: steps
  merge across recipes when their **sorted input-product-ID + output-product-ID
  signature** matches (`step-utils.ts:20-27`); step *names* are collected for display only
  and do not affect merging.
- Verifiable: `decisions.md` no longer contains the phrase "exact string match" for steps;
  wording matches `createStepSignature`.

### 4.2 Introduce the unit enum + dimension/conversion module (new code)

- **Create** `src/lib/units.ts` (new): the unit enum, a `UNIT_DIMENSIONS` map
  (unit → `volume`|`mass`|`count`), a within-dimension conversion table, a `UNIT_ALIASES`
  map (common free-text spellings → canonical token, e.g. `cups`→`cup`, `Tbsp`→`tbsp`,
  `clove`→`each`) consumed by both the node-unit backfill (§4.4) and editor validation
  (§4.7), and helpers `getDimension(unit)`, `normalizeUnit(raw)`, `canConvert(a, b)`,
  `convert(qty, from, to)`. Conversion is **within dimension only**; `convert` across
  dimensions returns `null`/throws (callers treat that as "keep separate"). No density
  model.
  - Proposed enum (subset sufficient for current data; extend as needed):
    - volume: `tsp, tbsp, fl_oz, cup, pint, qt, gal, ml, l`
    - mass: `g, kg, oz, lb`
    - count: `each`
  - Conversion factors are exact within a dimension (e.g. 3 tsp = 1 tbsp, 16 tbsp = 1 cup,
    2 tbsp = 1 fl_oz, 1 lb = 16 oz, 1 kg = 1000 g). Cross-system factors (cup↔ml, oz↔g)
    included so volume and mass each reduce to one base unit. **Proposed:** exact
    conversion constants live in this file and are the single source; flag any the
    reviewer wants adjusted.
- **Modify** `src/lib/types.ts:42-56` (the `Product` interface): add `canonical_unit?:
  string` and `dimension?: "volume" | "mass" | "count"` mirroring the new PB fields
  (§3.1). Today the interface has neither (only `container_type?` at `:50`), so without
  this the aggregation fix (§4.3, which reads `product.canonical_unit`) and the linter
  (§4.6 rule 4) will not typecheck. Prefer typing `canonical_unit` to the `Unit` enum
  exported from `src/lib/units.ts` once that exists.
- Verifiable: unit tests for `convert` (round-trips within dimension; `null` across);
  `Product.canonical_unit`/`dimension` are referenceable without a TS error.

### 4.3 Fix unit-blind aggregation (the confirmed bug)

- **Modify** `src/lib/aggregation/builders/product-builder.ts`:
  - Change the merge so quantities are only combined when convertible. In
    `addOrMergeProduct` (`:79-124`) / the key from `buildAggregatedProduct` (`:68-72`),
    either (a) convert `newProduct.totalQuantity` into the existing entry's unit via
    `units.convert` before `+=` when same dimension, writing the canonical/first unit; or
    (b) when not convertible, store under a compound key `${product.id}|${dimension}` (one
    line per unit family, not per raw unit — all convertible units collapse into one) so
    incompatible dimensions become **separate** shopping lines. The decision record's
    "interim key: product+unit" is the fallback for unmapped units; within-dimension
    conversion is the primary path.
  - **Display-unit selection (deterministic):** when merging, convert into the product's
    `canonical_unit` if set. When `canonical_unit` is null, pick the deterministic
    tie-break unit for the dimension — the smallest base unit in that family (e.g. `tsp`
    for volume, `g` for mass) rather than "first node seen", so the merged line is stable
    across reloads regardless of node order.
- **Give split lines a distinct, stable line identity — the compound Map key is not enough.**
  `buildShoppingListFromFlow` (`aggregation.ts:231-250`) currently sets
  `productId: product.productId`, which is **identical** for two split lines of the same
  product. `ShoppingListTab` keys rows and checkbox state by `item.productId`
  (`ShoppingListTab.tsx:181` `getShoppingCheckboxKey`, `:191` `key={item.productId}`), so
  two split lines collide: React duplicate-key warning and one checkbox toggling both
  lines — and this same key is the Phase 2 persisted-checkbox identity. Therefore add a
  distinct line identity (e.g. a `lineId` = the `${product.id}|${dimension}` compound key)
  to `AggregatedFlowProduct`/`AggregatedProduct`, and thread it through
  `buildShoppingListFromFlow` and the `ShoppingListTab` `key=` / `getShoppingCheckboxKey`
  derivations. Single-line (non-split) products keep `lineId === productId` so Phase 2 keys
  are unaffected for the common case.
- **Per-source (per-recipe) unit display:** in `AggregatedProduct.sources[].unit`
  (`aggregation.ts:243-247`) and `AggregatedFlowProduct.mealSources`, show each source's
  quantity **converted into the merged line's display unit** (not its original node unit),
  so the breakdown sums visibly to the line total. Sources that fell into a different split
  line stay with that line.
- **Modify** `src/lib/aggregation/builders/step-builder.ts:128-149`: apply the same
  convert-or-split logic when merging step `inputs`/`outputs` by `productId`.
- **Modify** `src/lib/aggregation/utils/product-utils.ts` if a shared
  `mergeQuantities(existingQty, existingUnit, addQty, addUnit)` helper is cleaner than
  inlining in both builders (Proposed refactor).
- Verifiable: white-bean-stew olive oil renders one correct converted figure; a
  fabricated cross-dimension case renders two lines, not a summed one.

### 4.4 One-shot product dedup + backfill + unique index

- **Use** existing `scripts/find-duplicates.js` to produce the candidate merge list
  (exact case-insensitive dupes + similar-name/same-type pairs); review manually.
- **Create** `scripts/merge-products.js` (new): given a `{dupeId → survivorId}` map,
  repoint every product reference to the survivor, then delete the dupes. Collections that
  reference `products`: `recipe_product_nodes.product`, `inventory_items.product`,
  `products.store_bought_product`, and **`meal_variant_overrides.replacement_product`**
  (plus check `meal_variant_overrides.original_node`, which points at
  `recipe_product_nodes` and is unaffected by product merges but must be listed so it isn't
  overlooked). Script must update all product-referencing relations, then verify zero
  orphans before deleting.
  - **Do not derive this reference list from `pb_schema_updated.json` alone — it is STALE.**
    The export omits the entire `meal_variant_overrides` collection, which the live app
    actively uses (`src/lib/api.ts:66`, `src/lib/types.ts:191-204`, `Outputs.tsx:216-219`;
    its `replacement_product` is a relation → `products`). Enumerate product-referencing
    collections against the **live DB** (or the code) instead. A dedup that deletes a
    product still referenced as a `replacement_product` would orphan that override and the
    "zero orphaned relations" guarantee would silently miss it.
- **Re-export the schema** so `meal_variant_overrides` is captured: after confirming the
  live collection set, regenerate `pb_schema_updated.json` from the running PB instance so
  it stops being a stale source of truth. Do this before relying on it for the reference
  list or the index step.
- **Backfill** `canonical_unit` + `dimension` on each surviving product (extend the merge
  script or a sibling `scripts/backfill-units.js`): infer a sensible canonical unit from
  existing node usage / product type (count-like → `each`), leave ambiguous ones null for
  the linter to surface.
- **Normalize existing `recipe_product_nodes.unit` values to enum tokens** (one-shot;
  same or sibling script, e.g. `scripts/normalize-node-units.js`). Without this the
  aggregation fix (§4.3) and linter (§4.6) — which match existing node units against enum
  keys via `canConvert` — fail on real prod data, and acceptance #1/#2/#7 are not
  verifiable. Two classes of existing bad data must be repaired:
  - **Free-text spellings** (`cups`, `Tbsp`, `clove`, …) that don't match canonical enum
    tokens. Drive this from an **alias/normalization map** added to `src/lib/units.ts`
    (§4.2) — a `UNIT_ALIASES` map from common spellings to canonical tokens — so the same
    map serves both this backfill and the editor's future validation.
  - **Container-name strings left on stored-product nodes** by the current `unit` overload
    (`RecipeEditor.tsx:397-400`). §4.5 stops *writing* these but does not clean up existing
    rows; until cleared, `StoredItem.unit` (`aggregation.ts:331`) keeps rendering leftover
    container-name strings. Clear/repair these to an empty or real measurement unit on
    stored nodes.
  - Report any node unit that matches neither the enum nor an alias for manual resolution
    (do not guess).
- **Add** the case-insensitive unique index (§3.2) via PB Admin UI, on prod and test,
  after dedup succeeds; re-export `pb_schema_updated.json`.
- Verifiable: `find-duplicates.js` reports zero exact dupes; attempting to create "Olive
  Oil" when "olive oil" exists is rejected by PB.

### 4.5 Remove the `unit`-as-container-type overload

- **Modify** `src/pages/RecipeEditor.tsx:397-400` and `:485-488`: stop writing
  `containerTypeName` into node `unit` for stored products. Stored-product nodes carry a
  real measurement unit (or empty); container type is not duplicated onto the node.
- **Thread container type through the aggregated product** (the container name is NOT in
  scope where `aggregation.ts` needs it — see below). Two touchpoints:
  - **Modify** `src/lib/aggregation/types.ts:67-79`: add a `containerTypeName?: string`
    field to the `AggregatedFlowProduct` interface.
  - **Modify** `src/lib/aggregation/builders/product-builder.ts` (near `:38-50`, in
    `buildAggregatedProduct`): populate `containerTypeName` on `baseProduct` from
    `node.expand?.product?.expand?.container_type?.name` — the expand path that
    `ExpandedProductNode` (`aggregation/types.ts:27-37`) exposes and that this function
    already reads store/section from at `:47-48`. This is the *only* scope where the
    `node.expand.product.expand.container_type` path is reachable.
- **Modify** `src/lib/aggregation.ts:334` and `:388`: source `containerTypeName` from the
  new `product.containerTypeName` field instead of `product.unit`.
  **Why the change from the naive fix:** `buildStoredItemsListFromFlow` (`:315-340`) and
  `buildMealContainersList` (`:346-395`) iterate `flowGraph.products`, whose elements are
  `AggregatedFlowProduct` (`aggregation/types.ts:67-79`) — there is no `node` variable in
  that scope and, until the step above, no `container_type` expand either. So the container
  name must be carried on the aggregated product, not re-read from a node. Update the
  `productKey` at `:378` (currently interpolates `product.unit`) to interpolate
  `product.containerTypeName` accordingly.
- **Audit** the `StoredItem` / `MealContainer` consumers
  (`src/components/outputs/FridgeFreezerTab.tsx`, `MealContainersTab.tsx`,
  `PullListsTab.tsx`, print views) to confirm they read `containerTypeName`, not `unit`,
  for containers.
- Verifiable: a stored output shows its container from `container_type` and its unit from
  the node's real unit; grep for `unit is now the container type` returns nothing.

### 4.6 Recipe linter v1 (new code)

- **Create** `src/lib/linter/` (new): pure functions returning `LintFinding[]`
  (`{ severity, rule, message, recipeId?, productId?, nodeId? }`). Rules in v1 (the
  data-hygiene subset of the Topic-4 rule list; duration/pull-step rules are **v2 /
  Phase 5** and out of scope):
  1. **Cross-dimension mismatch** — a product aggregated across nodes whose units are not
     convertible to its `canonical_unit` (reuses `units.canConvert`).
  2. **Prep-words in raw product names** — a `raw` product whose name contains a controlled
     prep verb (sliced, diced, minced, chopped, grated, shredded, "(raw)", …). Aligns with
     the record's "preparation states are NOT products" rule.
  3. **Missing store/section** — a non-pantry `raw`/`inventory`/`stored` product with no
     `store`. The `section` half is only deterministic against a per-store policy, so
     encode one rather than leave "where the store convention expects one" undefined:
     maintain a small `SECTION_REQUIRED_STORES` set (Safeway per
     `.claude/skills/recipe-import/SKILL.md:82`) — a missing `section` is a finding **only**
     when the product's store is in that set. Online/specialty, Costco, and Trader Joes
     (`SKILL.md:83-84`) require store only. **Proposed (not yet decided):** if the
     `SECTION_REQUIRED_STORES` set is not wanted for v1, scope rule 3 to **store-only** and
     defer the section check; either way the rule must be fully determinate, not
     convention-dependent. Formalizes the policy in `SKILL.md:72-85`.
  4. **Missing canonical unit** — a non-pantry product with null `canonical_unit`
     (surfaces backfill gaps).
- **Surface:** an on-demand "Lint" report. **Proposed (not yet decided):** a button on the
  products registry page (`src/pages/registries/Products.tsx`) opening a findings panel,
  plus a headless `scripts/lint.js` for one-shot batch checking. Import-time linting is
  deferred to Phase 6 (the import page does not exist yet).
- Verifiable: linter flags a hand-made cross-dimension recipe, a "diced onion" raw product,
  and a store-less non-pantry product; passes a clean product.

### 4.7 Enum-constrain unit entry in the editor

- **Modify** the node unit input in `src/pages/RecipeEditor.tsx` (and any shared
  product-node form) from free text to a select bound to the `src/lib/units.ts` enum.
- Verifiable: cannot type "cups " or "tblsp"; only enum members are selectable.

---

## 5. Dependencies & Prerequisites

- **Blocks later phases.** This phase is roadmap item 1 and gates everything: Phase 2
  (shopping state / swaps) relies on correct aggregation and the container/unit split;
  Phase 3 (USDA registry seeding) relies on the unique name index and the unit enum;
  Phase 5 (scheduler) relies on the linter foundation and prep-vocabulary hygiene.
- **No dependency on the tailnet/`db-config.ts` work** (`nas-pocketbase-tailnet`) — that is
  a Phase 2 prerequisite, not this phase. Phase 1 is pure data/logic and can run against
  the current LAN IPs.
- **Internal ordering:** dedup (§4.4) must precede the unique index; the unit module
  (§4.2, including `UNIT_ALIASES`) must precede the aggregation fix (§4.3), the linter
  (§4.6), enum entry (§4.7), and the one-shot node-unit normalization (§4.4); the
  node-unit normalization should run before verifying the §4.3/§4.6 acceptance criteria
  against prod data (the fixes assume enum-clean node units). The container/unit split
  (§4.5) is independent and can land in parallel. §4.5's `containerTypeName` population
  already has data: the product-node fetch expands `product.container_type`
  (`Outputs.tsx:262-263`), so no new expand is required.
- **Schema application is manual** (no migrations dir): every field/index change goes into
  PB Admin on prod **and** test, then into `pb_schema_updated.json`. Do the dedup and
  backfill against **prod** (the live data); use test only to rehearse the schema edits.
- **Data cleanup is one-shot and human-reviewed** — the merge map is not auto-derived;
  a person confirms each proposed merge before `merge-products.js` runs.

---

## 6. Acceptance Criteria

1. White-bean-stew olive oil (0.25 cup + 2 tbsp) shows as a **single** shopping-list line
   with a correct converted quantity in one unit.
2. A recipe mixing convertible units of one product yields one aggregated line; a recipe
   mixing cross-dimension units yields **two** lines (no false sum) **and** a linter
   finding. The two split lines have **distinct, stable identities** — no React
   duplicate-key warning, and checking one line's checkbox does not toggle the other.
3. `grep -rn "unit is now the container type\|unit is the container type"
   recipe-planner/src` returns nothing; stored outputs display container from
   `container_type` and measurement unit from the node's real unit.
4. `products.canonical_unit` and `products.dimension` exist in `pb_schema_updated.json`;
   every non-pantry product either has them set or is flagged by the linter.
5. `scripts/find-duplicates.js` reports zero exact case-insensitive dupes; the unique
   index exists and PB rejects a case-variant duplicate name on create.
6. All product references — `recipe_product_nodes.product`, `inventory_items.product`,
   `products.store_bought_product`, and `meal_variant_overrides.replacement_product`
   (enumerated against the live DB, not the stale schema export) — point at surviving
   products; zero orphaned relations. `pb_schema_updated.json` has been re-exported and now
   includes the `meal_variant_overrides` collection.
7. The linter, run on-demand, reports: cross-dimension mismatches, prep-words in raw
   product names, and non-pantry products missing store/section; a known-clean product
   produces no findings.
8. `decisions.md` describes step aggregation as an input/output signature match; the
   phrase "exact string match" no longer appears for steps.
9. The node unit input in the recipe editor is an enum-bound select; free-text units can
   no longer be entered.
10. Existing `recipe_product_nodes.unit` values are enum-normalized: every non-empty node
    unit is a canonical enum token (or was surfaced for manual resolution), and no
    stored-product node still carries a container-name string in `unit` (so `StoredItem`
    renders no leftover container names as units).

---

## 7. Risks & Open Questions

- **Backfilling `canonical_unit` is judgment-laden.** Some products are genuinely
  ambiguous (garlic in cloves vs heads vs grams). Mitigation: leave ambiguous ones null and
  let the linter surface them for manual resolution rather than guessing wrong.
- **Conversion constants must be exact and reviewed.** A wrong factor silently corrupts
  every list. Mitigation: constants centralized in `units.ts` with round-trip unit tests;
  flagged for reviewer sign-off.
- **`recipe_product_nodes.unit` stays free-text this phase.** App validation + linter guard
  it, but a direct PB Admin edit could still write a non-enum value. Converting the column
  to a PB `select` (§3.3) is deferred until all values are confirmed enum members — a
  premature conversion would break `pb_schema_updated.json` import.
- **Manual schema application across two DBs** is error-prone with no migration tooling.
  Mitigation: rehearse on test first; commit the re-exported schema JSON alongside code.
- **Dedup merges are irreversible once dupes are deleted.** Mitigation: human review of the
  merge map, orphan-check before delete, and a full prod export/backup before running
  `merge-products.js`.
- **Deliberately deferred:** import-time linting (Phase 6), duration/pull-step linter rules
  (Phase 5 / linter v2), structured prep vocabulary as a controlled field on
  steps/transient nodes (Phase 5 — this phase only lints prep-words *out of raw product
  names*), and the USDA/`canonical_unit` seeding (Phase 3).
- **Open — per-node container type (§3.4):** keep container type product-level, or add a
  `recipe_product_nodes.container_type` relation for recipe-specific containers? No current
  data forces the latter; decide if/when a stored product needs different containers in
  different recipes.
- **Open — dimension storage (§3.1):** store `dimension` on the product (chosen here to
  match the record's wording) vs. derive it from `canonical_unit` at read time. Flagged as
  a redundancy the reviewer may collapse.
