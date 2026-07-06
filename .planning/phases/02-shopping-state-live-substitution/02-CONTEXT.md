# Phase 2: Shopping State & Live Substitution - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the Outputs tabs into a durable, tablet-usable shopping companion: per-plan
persisted list state, numeric have-N with remaining-to-buy, mid-shop product swap,
"make it at home," and phone-friendly quick-create — all re-deriving through the
existing flow-graph pipeline (`buildProductFlowGraph` → `buildShoppingListFromFlow`
etc. + `applyVariantOverrides`). Requirements SHOP-01…SHOP-07.

Not this phase: offline-first sync, any shopping print path, per-person portioning
(Phase 4), registry seeding / USDA search (Phase 3).
</domain>

<decisions>
## Implementation Decisions

### Persisted list state (SHOP-01)
- **D-01: Persist ALL SIX Outputs tabs**, not just the ID-stable ones. This
  deliberately takes the harder branch of the phase doc's item 6a: instead of
  scoping persistence to shopping/pantry/batch-prep and leaving stored/containers/
  pull in-memory, we **rework the three positional key helpers**
  (`getStoredCheckboxKey`, `getPullListCheckboxKey`, `getContainerCheckboxKey` in
  `src/constants/outputs.ts:332-355`) to emit **content-derived stable keys** —
  composites of stable entity IDs (e.g. `planned_meal` + product/node/location
  identity), **never array index** — *before* persisting those tabs.
  - **Why this matters:** this phase's own make-it action (`handleAddRecipeToPlan`)
    mutates plan order, which reorders the index-keyed lists. Persisting an
    index-based key would silently re-attach a checked state to a *different*
    physical item (a correctness bug, not a benign reset). Stable keys remove that
    hazard and are the precondition for persisting these three tabs.
  - **Planner note / open design:** pull-list and container lines have no natural
    single-entity identity. The planner must derive a deterministic composite key
    from the underlying stable IDs. If a genuinely stable key cannot be derived for
    a given tab, fall back to leaving *that* tab in-memory rather than persisting a
    positional key — but the intent is full six-tab coverage.
- **D-02:** Shopping/pantry/batch-prep keys are already stable
  (`getShoppingCheckboxKey(item.lineId)` keys off Phase 1's stable `lineId` =
  productId or productId|dimension). No rework needed for those three.
- **D-03:** Replace the in-memory `checkedItems` Set (`Outputs.tsx:113`) and
  `toggleChecked` (`Outputs.tsx:592-602`) with a `useShoppingState(weeklyPlanId)`
  hook backed by a net-new `shopping_state` collection, optimistic local update +
  background upsert + retry + `pendingCount`/`isSyncing` flag. State scoped per
  weekly plan.

### Resolution model & buy-list behavior (SHOP-02, SHOP-04)
- **D-04:** `shopping_state.resolution` enum = **`buy` | `make` | `skip`** (three
  states). `skip` = explicitly not buying and not making — beyond the decision
  record's literal `buy`/`make`, kept as a real user state.
- **D-05:** A **resolved** line (resolution `make` or `skip`, or `have ≥ needed`)
  stays **visible on-screen, shown dimmed/struck** — still there, easy to un-resolve
  at a glance. It is **not** hidden from the on-screen list.
- **D-06:** The shopping-list **export** (`filteredShoppingListForExport`,
  `Outputs.tsx:336-366`) **excludes** all resolved lines (make / skip /
  have-complete). Split rule: **screen = full picture with state, export =
  actionable buy list only.** This resolves the phase doc item 7 open question
  (export excludes make-it AND have-N-complete — plus `skip`).

### Mid-shop swap (SHOP-03, SHOP-05)
- **D-07:** The per-meal quantity/unit field in the swap dialog **pre-fills the
  original node's quantity/unit**; the user adjusts only if the substitute differs.
  This makes the inherit-when-null behavior (phase doc item 10b, `applyVariantOverrides`)
  the default at BOTH the persistence layer and the UI.
- **D-08:** Quick-create for a missing product lives **inline in the swap dialog**
  and returns the new product straight into the replacement picker — the shopper is
  never bounced out mid-swap. Quick-create fields: name + store/section + unit.
- **D-09:** Swap must thread substitute quantity/unit through re-derivation (phase
  doc items 10a–10c: extend `VariantOverride`, override replacement node qty/unit
  with inherit-when-null, forward qty/unit in the `Outputs.tsx:225-237` map builder).
  Storing the field without these edits produces zero visible effect — they are
  required, not optional.

### Make-it-at-home (SHOP-04)
- **D-10:** The make-it action is **gated on the product having a `source_recipe`**.
  On lines whose product has no linked recipe, the action is **unavailable
  (disabled/hidden)** — no silent not-to-buy for recipe-less products. ("Do not
  allow the switch if we don't have a recipe defined for it.")
- **D-11:** When make-it IS eligible, clicking it **confirms first** ("Add [recipe]
  to this week and make it instead of buying?") before adding the `planned_meal` via
  the existing `handleAddRecipeToPlan` (`Outputs.tsx:562-576`) and setting
  `resolution = make`. No surprise plan mutation.

### Unit handling — reconciled against completed Phase 1
- **D-12:** The phase doc (§3.2, §3.4) assumed Phase 1 had not landed and specced
  `meal_variant_overrides.unit` and quick-create unit as **free text**. **Phase 1 is
  complete**: `src/lib/units.ts` provides the unit enum + dimension, and Phase 1
  added `canonical_unit`/`dimension` fields to `products`. **Therefore use the unit
  enum now, not free text** — `meal_variant_overrides.unit` should carry an enum
  token, and quick-create should be able to set `products.canonical_unit` directly.
  Planner/researcher: confirm the product fields and enum shape, then bind to them
  rather than the phase doc's interim free-text plan.

### Connectivity (SHOP-07)
- **D-13:** Optimistic updates + background retry + a **pending-sync indicator**
  (`SyncIndicator.tsx` in the Outputs header). In-memory optimistic queue only —
  covers a transient hotspot drop without reload. Last-write-wins on concurrent
  device edits (single household, rare). Durable-across-reload queue is out of scope
  (see Deferred).

### Claude's Discretion
- Collection naming: `shopping_state` vs `plan_line_state` — it holds state for all
  tabs, so `plan_line_state` may read truer. Planner picks; not a user decision.
- Orphaned `shopping_state` rows (line no longer derived): leave inert this phase
  unless trivially cheap to GC.
- Optimistic retry specifics (backoff, max attempts): planner's call;
  last-write-wins default.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase & milestone decision records
- `.planning/phase-docs/phase-2-shopping-state.md` — **authoritative** phase decision
  record: data model (`shopping_state`, `meal_variant_overrides` changes), the
  15-item implementation plan, acceptance criteria, and the risks/open-questions this
  discussion resolved. MUST read before planning.
- `plans/workflow-redesign.md` — milestone authoritative decision record (Topic 1 =
  this phase). Source of the tailnet-not-offline-first and make-it decisions.
- `.planning/REQUIREMENTS.md` — SHOP-01…SHOP-07 acceptance criteria.
- `.planning/PROJECT.md` — milestone constraints, Out-of-Scope list.

### Schema
- `pb_schema.json` (repo root) — **canonical, single** schema export (Phase 1
  consolidated to this; `pb_schema_updated.json` was deleted). Verify
  `meal_variant_overrides` (currently `planned_meal`, `original_node`,
  `replacement_product` — confirmed live) and the net-new `shopping_state` against
  it. **Phase doc item 2's "re-export the stale schema" is already DONE — treat as
  verify-only, not a task.**

### Infra prerequisite
- `.planning/todos/pending/nas-pocketbase-tailnet.md` — NAS PocketBase joins tailnet
  + `db-config.ts` hostname switch. Blocks *store usability*, not local dev.

### Key code touchpoints (recipe-planner/)
- `src/pages/Outputs.tsx` — in-memory `checkedItems` (:113), `toggleChecked`
  (:592-602), override→`VariantOverride` map (:225-237), `handleAddRecipeToPlan`
  (:562-576), `filteredShoppingListForExport` (:336-366), derive pipeline (:318-382).
- `src/constants/outputs.ts` — checkbox key helpers (:318-355); the three positional
  helpers (:332-355) are the D-01 rework target.
- `src/components/outputs/ShoppingListTab.tsx` — have-N control + remaining-to-buy.
- `src/lib/variant-utils.ts` — `VariantOverride` (:13-16), `applyVariantOverrides`
  (:220-243, remove the "for now, preserve original" shortcut per D-09).
- `src/lib/db-config.ts` (:15-18) — LAN→tailnet hostname switch.
- `src/lib/api.ts`, `src/lib/types.ts` — add `shoppingState` collection + interfaces;
  extend `MealVariantOverride`.
- `src/lib/units.ts` (Phase 1) — unit enum + dimension for D-12.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Flow-graph derivation + `applyVariantOverrides` (`Outputs.tsx:288-382`) already
  re-derive every output (shopping/prep/pull/containers) from overrides — the swap
  gets propagation "for free," no separate propagation step.
- `meal_variant_overrides` CRUD pattern in `WeeklyPlans.tsx:476-499`
  (`handleSaveVariants` = delete+recreate per meal) is the model for the store-time
  swap save path; keep the two override writers (planning-time `VariantEditorDialog`,
  store-time swap) on a shared write path.
- `handleAddRecipeToPlan` (`Outputs.tsx:562-576`) + `products.source_recipe` /
  `store_bought_product` relations already exist — make-it reuses them; the only new
  persistence is `shopping_state.resolution`.
- Phase 1's stable `lineId` (productId | productId|dimension) is already the shopping
  checkbox key.

### Established Patterns
- All Outputs tabs already receive `checkedItems`/`onToggleChecked` props, so swapping
  the source (Set → hook) leaves the prop surface unchanged.
- Aggregation output carries **no** back-link to meals/nodes
  (`AggregatedProduct.sources` / `AggregatedFlowProduct.mealSources` hold only
  recipe-name strings). The shopping-line → per-meal-node mapping (phase doc item 9)
  must be re-derived from `plannedMeals` × meal-keyed `recipeData`, keyed by
  `planned_meal` (two meals of the same recipe share `original_node` but differ by
  `planned_meal`). Build+verify this BEFORE the swap dialog.

### Integration Points
- Net-new `shopping_state` collection + `useShoppingState` hook; wire into
  `Outputs.tsx` replacing the in-memory Set.
- Derive-then-overlay layer (phase doc item 7): a memo joining the flow-graph-derived
  lists with the hook's state map (keyed by `getShoppingCheckboxKey`) that applies
  have-N remaining, auto-complete, and resolution to the visible list and the export.

</code_context>

<specifics>
## Specific Ideas

- Store view vs export split is the guiding principle: **on-screen shows the full
  picture with state (resolved lines dimmed/struck); the export is a clean actionable
  buy list.** (D-05 / D-06)
- Lowest-friction-at-the-store bias drove the swap defaults: pre-filled quantities and
  inline quick-create (D-07 / D-08).
- Make-it is intentionally strict: no recipe → no make-it action (D-10).

</specifics>

<deferred>
## Deferred Ideas

- **Durable-across-reload optimistic queue** (localStorage/IndexedDB persistence of
  pending writes) — edges toward the explicitly-rejected offline-first model. Out of
  scope this phase; separate decision if ever wanted.
- **Orphaned `shopping_state` row GC** — leave inert this phase; revisit if stale rows
  become a real problem.
- Registry-driven upgrades to quick-create + swap product search (fuzzy / "Search
  USDA") — Phase 3.
- Cook-mode progress persistence reusing this phase's persisted-checkbox mechanism —
  Phase 5 (soft dependency).

None of the above expanded this phase's scope; all noted for their own phases.

</deferred>

---

*Phase: 2-shopping-state-live-substitution*
*Context gathered: 2026-07-06*
