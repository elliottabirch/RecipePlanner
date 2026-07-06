# Milestone Overview: Workflow Redesign

> Handoff index for `/gsd-new-milestone`. Authoritative decision record:
> [`plans/workflow-redesign.md`](../../plans/workflow-redesign.md). Every phase doc below
> elaborates that record; where a doc goes beyond it, choices are marked
> **Proposed (not yet decided)**. This overview consolidates the six phase docs — it does
> not add scope.

## Milestone framing

The RecipePlanner workflow has four root-cause defects: (1) no unit discipline in the data
layer (free-text units, unit-blind aggregation summing mismatched quantities, no unique
product names), (2) steps carry no metadata (no durations, instructions, or prep vocabulary,
so prep-day sequencing and assembly clarity are unsolvable), (3) the weekly plan has no
memory (no dates, templates, staples, or persisted checkbox state), and (4) the import
pipeline is self-inflicted overhead (a bespoke script-and-migrate ritual duplicating the
existing in-app recipe editor). This milestone fixes all four across six phases: it first
makes the data layer trustworthy (Phase 1), then turns the tablet into a durable
store-and-prep device (Phase 2), seeds a real product registry (Phase 3), gives the plan a
memory (Phase 4), makes prep day an optimized interactive cook mode (Phase 5), and finally
retires the import scripts while adding recipe inspiration and an evolution loop (Phase 6).
Phase 1 gates the correctness of everything after it; phases 2–6 each deliver standalone
value.

## Per-phase summaries

1. **[Phase 1 — Data Hygiene](phase-1-data-hygiene.md).** Fixes the confirmed unit-blind
   aggregation bug (convert-or-split by dimension), introduces a unit enum + canonical
   unit + within-dimension conversion module (`src/lib/units.ts`), splits the overloaded
   `recipe_product_nodes.unit` (which doubled as container-type name) back into a real
   measurement unit, runs a one-shot product dedup + case-insensitive unique name index,
   normalizes existing node units to enum tokens, ships linter v1 (4 data-hygiene rules),
   and reconciles `decisions.md` with the actual signature-based step-aggregation behavior.
   Pure data/logic — no infra dependency. **Blocks or hardens every later phase.**

2. **[Phase 2 — Shopping State & Live Substitution](phase-2-shopping-state.md).** Persists
   per-plan list state (new `shopping_state` collection) so checkboxes survive refresh/device
   switch, adds numeric "have N" with remaining-to-buy, a mid-shop swap flow that picks
   recipes at swap time and records a per-meal quantity/unit (extends `meal_variant_overrides`),
   a "make it at home" action, a minimal phone-friendly quick-create dialog, and a tablet
   touch pass — all over optimistic-update connectivity on the tailnet. **Infra prereq:** NAS
   PocketBase on tailnet + `db-config.ts` hostname switch.

3. **[Phase 3 — Product Registry Seeding](phase-3-registry-seeding.md).** One-shot seed of
   ~800 concept-level raw ingredients from USDA FoodData Central Foundation Foods (plain
   names, category→section defaults, FDC IDs retained, nutrition-ready nullable fields),
   fuzzy/token client-side product search wired into every product-search surface, and a
   "Search USDA" mode in the Phase-2 quick-create dialog. **Hard dep on Phase 1** (unique
   name index + canonical-unit fields); two features soft-depend on Phase 2 surfaces.

4. **[Phase 4 — Weekly Planning Memory](phase-4-week-memory.md).** Adds a start date and a
   people-multiplier to `weekly_plans`, a tag-based slot template (`week_templates` +
   `template_slots`), and a guided-fill wizard that leads with a staples slot and orders each
   pool least-recently-planned-first. People-multiplier stacks on per-meal quantity through
   the three aggregation derivation sites (pull lists excluded by design). Self-contained;
   soft-depends on Phase 1's aggregation fix so scaled quantities are trustworthy.

5. **[Phase 5 — Prep-Day Engine](phase-5-prep-day-engine.md).** Adds step metadata
   (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`) to `recipe_steps`,
   an AI-assisted offline backfill for the 185 existing steps, a seeded deterministic
   genetic-algorithm scheduler over the merged week-graph with a resource model (oven/burners/
   singleton appliances), an interactive tablet cook mode with readiness states and
   recompute-on-check-off, a weights panel, and linter v2 (3 rules, on-demand). **Hard dep on
   Phase 1**; the *conditional* day-before-prep horizon needs Phase 4's start date; cook-mode
   progress persistence reuses Phase 2's mechanism (soft).

6. **[Phase 6 — Import Pipeline & Recipe Lifecycle](phase-6-import-inspiration.md).** Adds a
   draft/published lifecycle to `recipes`, an in-app JSON import page (shared graph-write path
   with the editor) that lands recipes directly in prod as drafts — eliminating the test→prod
   migration ritual — a rewritten `recipe-import` skill that emits JSON instead of scripts, a
   `/suggest-recipes` skill, and a recipe-evolution loop (`recipe_notes` → agent-applied draft
   revisions surfaced in the Phase-4 wizard). **Owns the publish gate** that wires in Phase 5's
   linter. Depends on Phase 4 (wizard + dated plans) and Phase 5 (step schema is a hard input
   to the import JSON contract).

## Dependency graph

```
Phase 1 (Data Hygiene) ── no deps; gates/hardens all others
   ├── hard ──> Phase 3 (Registry Seeding)
   ├── hard ──> Phase 5 (Prep-Day Engine)
   ├── soft ──> Phase 2 (Shopping State)        [aggregation correctness]
   └── soft ──> Phase 4 (Week Memory)           [scaled-quantity trust]

Phase 2 (Shopping State) ── infra: tailnet + db-config
   ├── extended by ──> Phase 3 (quick-create + ShopSwapDialog search)
   └── soft substrate for ──> Phase 5 (cook-mode progress persistence)

Phase 3 (Registry Seeding)
   ├── soft dep ──> Phase 2 (two features touch its surfaces)
   └── feeds ──> Phase 6 (nutrition-ready fields for /suggest-recipes macro floor)

Phase 4 (Week Memory)
   ├── feeds (conditional) ──> Phase 5 (start_date anchors day-before horizon)
   └── feeds ──> Phase 6 (wizard hosts evolution prompt; dated plans feed /suggest-recipes)

Phase 5 (Prep-Day Engine)
   └── hard input ──> Phase 6 (recipe_steps metadata is required in the import JSON contract;
                                cook mode is one note-capture surface)

Phase 6 (Import & Lifecycle) ── infra: tailnet (phone capture). Terminal phase.
```

**Linear-safe order:** 1 → 2 → 3 → 4 → 5 → 6 (the roadmap order).

**Parallelizable:**
- After **Phase 1**, Phases **2** and **4** are independent of each other and can run in
  parallel. **Phase 3** can also start after Phase 1, but two of its features (Search-USDA
  mode, swap-search fuzzy wiring) need Phase 2 surfaces — everything else in Phase 3 is
  Phase-2-independent.
- **Phase 5** needs Phase 1 (hard) and, for its *conditional* lead-time feature only,
  Phase 4's start date. Its core scheduler/cook mode/linter can be built once Phase 1 lands.
- **Phase 6** is effectively terminal: its evolution/wizard track needs Phase 4, and its
  import JSON contract needs Phase 5's step schema. Its import track (items 1–7) can ship
  before Phase 1/4/5 in principle, but step-metadata fields must be backfilled once Phase 5
  lands.

**Cross-cutting infra prereq:** NAS PocketBase on the tailnet + `db-config.ts` hostname
switch (todo `nas-pocketbase-tailnet`) is required for store/phone use in **Phase 2** and
**Phase 6**; neither blocks local development.

**Shared one-shot task:** re-exporting `pb_schema_updated.json` (stale — missing
`meal_variant_overrides` and `recipe_queue`) is called out in Phases 1, 2, and 6. It is a
single re-export; whichever phase runs first does it, the others verify. Phase 1 §4.4 is the
primary owner.

## Consolidated PocketBase collection & field changes

### New collections

| Collection | Phase | Fields (summary) | Status |
|---|---|---|---|
| `shopping_state` | 2 | `weekly_plan` (rel→weekly_plans), `line_key` (text), `checked` (bool), `have_quantity` (num, nullable), `resolution` (select buy/make/skip); unique (`weekly_plan`,`line_key`) | Collection Proposed; `resolution` values Proposed. Name may become `plan_line_state`. |
| `week_templates` | 4 | `name` (text) | Proposed (persistence shape) |
| `template_slots` | 4 | `template` (rel→week_templates), `label` (text), `count` (num), `meal_slot` (select, **required**), `day` (select, optional), `pool_tags` (rel→tags, multi), `sort_order` (num), `prefill_from_last_week` (bool) | Proposed |
| `scheduler_config` | 5 | `seed`, `weights{}`, `burner_count`, `oven_rack_slots`, `appliances[]` (or a single JSON record; or localStorage) | Proposed |
| `cook_progress` | 5 | keyed by `weekly_plan` + scheduled-step identity — **or reuse Phase 2's `shopping_state`** | Proposed (recommend reusing Phase 2) |
| `recipe_notes` | 6 | `recipe` (rel, req, cascade), `text` (text, req), `surface` (select calendar/cook_mode/recipe_card), `status` (select pending/applied/dismissed, default pending), `applied_revision` (rel→recipes, nullable), explicit `created` (autodate) | Confirmed (evolution loop). Distinct from existing `recipe_queue`. |

### Changed collections / new fields on existing collections

| Collection.field | Phase | Type | Notes |
|---|---|---|---|
| `products.canonical_unit` | 1 | select (enum, nullable) | Unit a product aggregates into; enum in `src/lib/units.ts`. |
| `products.dimension` | 1 | select volume/mass/count (nullable) | Derived from `canonical_unit`; stored (Proposed redundancy). |
| `products` unique index on `name` | 1 | `COLLATE NOCASE` unique | Added after dedup. |
| `products.fdc_id` | 3 | number (nullable, int) | USDA FDC ID; non-unique index Proposed. |
| `products.usda_data_type` | 3 | text (nullable) | `foundation_food` / `sr_legacy` / empty. |
| `products.usda_category` | 3 | text (nullable) | Raw USDA `foodCategory`. |
| `products.{nutrient_basis_g,kcal,protein_g,fat_g,carb_g}` | 3 | number (nullable) | Nutrition-ready, no UI. Inline-vs-`product_nutrients`-table is Proposed. |
| `recipe_product_nodes.unit` | 1 | text (semantics narrowed) | Now measurement-unit-only; existing values normalized to enum tokens; PB→`select` conversion deferred. |
| `meal_variant_overrides.quantity` | 2 | number (nullable) | Per-recipe substitute quantity. |
| `meal_variant_overrides.unit` | 2 | text (enum later) | Tightens to Phase-1 canonical-unit enum when it lands. |
| `weekly_plans.start_date` | 4 | date | Backfilled nullable→required. |
| `weekly_plans.people_multiplier` | 4 | number (default 1) | Stacks on `planned_meals.quantity`. |
| `planned_meals.template_slot` | 4 | rel→template_slots (nullable) | Proposed, optional (staples-prefill precision). |
| `recipe_steps.active_minutes` | 5 | number (nullable) | Hands-on minutes. |
| `recipe_steps.passive_minutes` | 5 | number (nullable) | Unattended minutes. |
| `recipe_steps.instructions` | 5 | text | Ratios / technique detail. |
| `recipe_steps.prep_action` | 5 | select (controlled vocab) | Sourced from Phase 1's linter prep-verb list. |
| `recipe_steps.{resource,oven_temp_f,rack_slots,lead_time_minutes}` | 5 | select/number | Proposed resource + lead-time fields; `lead_time_minutes` conditional (day-before horizon). |
| `recipes.status` | 6 | select draft/published (+`archived` Proposed) | Backfill existing → published. |
| `recipes.revision_of` | 6 | rel→recipes (nullable) | Links an agent-produced draft revision to its original. |

### Application-level contract (not a DB collection)

- **Recipe import JSON contract** (Phase 6 §3.4, `schema_version: 1`): the shape the import
  page and both skills (`recipe-import`, `/suggest-recipes`) agree on. Carries the Phase-5
  `recipe_steps` metadata fields, which become required at import once Phase 5 has shipped.

## Consolidated open questions

**Phase 1 — Data Hygiene**
- Per-node container type: keep product-level, or add `recipe_product_nodes.container_type`
  for recipe-specific containers? (No current data forces it.)
- Store `dimension` on the product vs derive from `canonical_unit` at read time (flagged
  redundancy).
- Convert `recipe_product_nodes.unit` to a PB `select` once all values are enum members
  (deferred — a stray value would break schema import).
- `SECTION_REQUIRED_STORES` linter rule vs store-only section check for v1.

**Phase 2 — Shopping State**
- `shopping_state` collection name (`shopping_state` vs `plan_line_state`).
- `resolution` enum values beyond `make`/`buy` (e.g. `skip`).
- Index-keyed tabs (stored/containers/pull): exclude from persistence this phase, or replace
  positional keys with content-derived keys before persisting (item 6a — correctness, not
  cosmetic).
- Optimistic-retry semantics (backoff, max attempts, concurrent-device conflict);
  last-write-wins assumed. Durable-across-reload queue is explicitly out of scope.
- Garbage-collect orphaned `shopping_state` rows, or leave inert?

**Phase 3 — Registry Seeding**
- Nutrition storage shape: inline nullable fields (recommended) vs `product_nutrients` table.
- "Search USDA" data path: bundled SR-Legacy JSON (recommended, hotspot-tolerant) vs live
  FDC API (needs key + network handling).
- Category→section mapping accuracy (defaults wrong for a minority; corrected at first use).
- Canonical-unit/dimension defaults for seeds (map + null-when-unclassifiable).
- Fuzzy-search library: `fuse.js` vs `match-sorter`.

**Phase 4 — Week Memory**
- `pool_tags` match-any vs match-all (only matters for multi-tag pools).
- Include `planned_meals.template_slot` (recommended) vs fall back to tag membership.
- `start_date` backfill quality for pre-existing plans (self-heals over time).
- Single-template assumption (collection vs settings row).
- **Open:** should pull-list quantities scale with per-meal quantity + the people-multiplier?
  Requires a preceding `buildPullLists` fix; excluded this phase.

**Phase 5 — Prep-Day Engine**
- **Day-before prep horizon (open seed):** single scalar `lead_time_minutes` vs an absolute
  "must-finish-before-prep" horizon; does cook mode need a distinct "tonight, for tomorrow"
  card? `lead_time_minutes` + AC8 are conditional/deferred pending this + Phase 4 dates.
- `scheduler_config` location: collection vs localStorage.
- Cook-progress persistence: reuse Phase 2's mechanism (recommended) vs own `cook_progress`.
- `resource` enum exact values; resource-tag inference quality from the backfill.
- Runtime in-app LLM call for backfill (kept open, would break the "no new infra" claim).

**Phase 6 — Import & Lifecycle**
- Post-approval fate of the original recipe: `archived` status (recommended) vs hard delete.
- Revision as a full recipe copy: on approval, repoint existing `planned_meals`
  original→revision, or future-only (recommended)?
- Note→graph-edit ambiguity: leave un-appliable notes `pending` with an explanation.
- Default `status` for manually created recipes (`draft` vs `published`).
- Macro floor without nutrition data: agent-estimated interim until FDC fields populated.
- Should import run structural (Phase-5 linter) validation before publish? (Recommend gating
  publish, not import.)
