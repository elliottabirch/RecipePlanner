# Phase 3: Product Registry Seeding (USDA)

> Source of authority: `plans/workflow-redesign.md` — Topic 2 ("Units & product hygiene") and roadmap entry 3 ("Registry seeding"). This doc elaborates that decision. Genuinely new choices beyond the decision record are marked **Proposed (not yet decided)**.

---

## 1. Purpose & Problem Statement

**Which frustration this solves.** Root cause #1 from the diagnosis — "no unit discipline in the data layer" — has a second half beyond the aggregation bug: the product registry is thin, inconsistent, and grown by hand one recipe at a time. Every new recipe forces the author to either find an existing product by guessing its exact spelling or hand-create a new one with store/section/type set from scratch. This is the seedbed for the near-duplicates the decision record calls out (`Olive oil` / `olive oil`, `parsley` / `parsley (raw)`).

**Concrete failure today.**

- The registry currently holds **291 products** in prod (`GET /api/collections/products/records` → `totalItems: 291`), all authored by hand. There is no canonical baseline of common raw ingredients, so two recipes that both use black beans can easily create two differently-spelled products.
- **Product search is substring-only and unforgiving.** The registry page filters with a raw `.includes()` (`recipe-planner/src/pages/registries/Products.tsx:91-98`), and product pickers in the graph editor use a default MUI `Autocomplete` over the full product array (`recipe-planner/src/pages/RecipeEditor.tsx:903-904`, `:1138-1139`) — also plain substring matching. Typing "garbanzo" never surfaces "chickpeas"; typing "tomato paste" out of order ("paste tomato") matches nothing. The duplicate-detection in `ProductForm` is the same naive `includes`/`includes` pair (`recipe-planner/src/components/ProductForm.tsx:236-250`), so it only catches substring overlaps, not typos or synonyms.
- **New-product creation is heavyweight.** Adding a raw ingredient means opening the full `ProductForm`, choosing a type, and manually picking store + section every time (`ProductForm.tsx:326-388`). There is no starting point and no defaults, so store/section are frequently left blank — which the Phase 1 / Topic-4 linter now flags as "raw product missing store/section."

**What this phase delivers.** A one-shot seed of ~800 concept-level raw ingredients from USDA FoodData Central Foundation Foods (plain names, sensible store/section defaults, FDC IDs retained for later nutrition work), plus a fast fuzzy/token search that makes the seeded registry actually usable, plus an on-demand "search USDA" escape hatch in the quick-create dialog for the long tail. Misses at authoring time and mid-shop become rare, and when they happen the fix is one tap instead of a full form.

---

## 2. Feature Descriptions

**Seeded registry.** After this phase, the products registry ships pre-populated with a broad base of everyday raw ingredients — "black beans", "chickpeas", "olive oil", "flat-leaf parsley" — under plain, human names rather than USDA's verbose descriptions ("Beans, black, mature seeds, raw"). Each seeded item lands as a **raw** product with a best-guess **section** (produce / dairy / meat / …) and a default **store**, ready to correct in one edit the first time it is actually used. Seeded items carry a hidden **FDC ID** so nutrition data can be attached later without re-matching.

**Fuzzy / token typeahead search.** Everywhere a user searches products — the registry list, the recipe-editor product picker, the ProductForm duplicate check, and the Phase-2 quick-create dialog — search becomes token-and-fuzz aware. Words can be typed in any order ("paste tomato" finds "tomato paste"), minor typos still match ("garbonzo" → "garbanzo"), and results are ranked by relevance rather than list position. This runs entirely client-side over the full product set (~1,100 items after seeding — well within an in-memory index's comfort zone).

**"Search USDA" mode in quick-create.** The minimal quick-create dialog introduced in Phase 2 (name + store/section + unit) gains a second tab / toggle: **"Search USDA"**. Instead of typing a bare name, the user searches the broader USDA catalog (SR Legacy, the larger legacy dataset) on demand; picking a result pre-fills the new product's name, category-derived section, and FDC ID, so an unusual ingredient encountered mid-shop or mid-authoring can be created correctly in a couple of taps rather than typed blind. When USDA has no match, the dialog falls back to plain name-only creation.

**Nutrition, designed but dark.** No nutrition UI ships in this phase. The schema simply stops throwing the data away: FDC IDs are stored on every seeded (and USDA-quick-created) product, and nullable nutrition fields exist so a later phase can backfill macros without touching product identity.

---

## 3. Data Model Changes

All changes are to the existing **`products`** collection (`pbc_7402169584`). No existing product fields are removed or renamed; every new field is nullable so the 291 existing hand-authored products remain valid without migration.

### New fields on `products`

| Field | Type | Notes |
|---|---|---|
| `fdc_id` | number (nullable, `onlyInt`) | USDA FoodData Central ID. Null for hand-authored products with no USDA match. **Proposed:** non-unique index for lookup/dedup during future nutrition backfill. |
| `usda_data_type` | text (nullable) | Provenance tag: `foundation_food` for seeded items, `sr_legacy` for USDA-quick-created items, empty for hand-authored. Lets us re-run or audit the seed. |
| `usda_category` | text (nullable) | Raw USDA `foodCategory` description as-imported (e.g. "Vegetables and Vegetable Products"). Kept so the category→section mapping can be re-derived or corrected later without re-fetching USDA. |

### Nutrition-ready fields (nullable, no UI this phase)

**Proposed (not yet decided) — the decision record explicitly leaves "nullable enrichment fields **or** a linked table" open.** Recommendation: start with a small set of inline nullable numeric fields for the macros that matter to the `/suggest-recipes` protein/macro floor (Topic 5), and defer a full per-nutrient `product_nutrients` table until a nutrition feature is actually built.

| Field | Type | Notes |
|---|---|---|
| `nutrient_basis_g` | number (nullable) | Basis mass the macros below are expressed per (USDA is per 100 g). |
| `kcal` | number (nullable) | Energy per basis. |
| `protein_g` | number (nullable) | Protein per basis. |
| `fat_g` | number (nullable) | Fat per basis. |
| `carb_g` | number (nullable) | Carbohydrate per basis. |

Left un-populated at seed time is acceptable; the decision is "design for it, build later." Only `fdc_id` must be populated during seeding so the backfill has a join key.

### Interaction with Phase 1 fields

Phase 1 adds the unit enum + canonical unit + dimension to products (and splits container-type out of the overloaded `unit`). It makes `canonical_unit` a **nullable** select and its `dimension` derived from it; Phase 1's own backfill assigns these per-product for the existing 291 (and its linter flags any non-pantry product still missing `canonical_unit`). Seeding cannot precede the Phase-1 schema, so those fields exist on the collection before this phase runs. See Dependencies.

**Deriving `canonical_unit` + `dimension` for seeded items.** USDA Foundation Foods data is nutrient-per-100 g and carries **no** household purchase/recipe unit and no count/volume/mass notion — so unlike `name` (rule + override list) and `section`/`store` (category→section table), there is no source column to read a canonical unit from. Phase 3 assigns these the same way it assigns section/store: a **best-guess category/keyword default, corrected inline at first use** (the decision-record principle). Items the mapping cannot classify are seeded with `canonical_unit`/`dimension` left **null** — a valid state under Phase 1's nullable field, surfaced by the Phase-1 linter and filled the first time the product is actually used. This keeps "assign a canonical unit to ~800 items" from becoming per-item judgment work at seed time. The mapping table lives in `build-usda-seed.js` (§4.2).

### Migration notes for existing data

- The 291 existing products get `fdc_id`/nutrition fields as **null** — no backfill required in this phase.
- **Dedup against existing products is mandatory before seeding.** Phase 1 adds a case-insensitive unique index on `products.name`. Seeding ~800 names into a registry that already has 291 hand-authored ones **will collide** (e.g. an existing "olive oil" vs a seeded "Olive oil"). The seed script must resolve each incoming name against existing products first (reuse/skip on match, insert only on genuine miss) or the unique index rejects the insert. This name-resolution helper must be **written fresh** — the existing `find-*.js` scripts are ad-hoc diagnostics (hardcoded substring searches over a fixed ingredient list), not reusable matchers; the closest prior art is the case-insensitive `name.toLowerCase()` grouping in `find-duplicates.js:14-29`. This dedup is called out explicitly as a prerequisite, not an afterthought.

---

## 4. Implementation Plan

Ordered; each item independently verifiable.

### 4.1 Schema migration — add fields to `products`
- Add `fdc_id`, `usda_data_type`, `usda_category`, and the five nullable nutrition fields to `products` (`pbc_7402169584`) via the PocketBase admin UI or a migration, and mirror them into `pb_schema_updated.json`.
- **Modify** `recipe-planner/src/lib/types.ts` — extend the `Product` interface (currently ends at `store_bought_product?`, `types.ts:42-56`) with the new optional fields.
- Verify: `Product` type compiles; new fields visible in PocketBase admin; existing products still load in `Products.tsx`.

### 4.2 Acquire & transform the USDA Foundation Foods dataset (offline data-prep step)
- Download the USDA FoodData Central **Foundation Foods** bulk export (JSON) from the FDC download page. This is a one-time offline artifact, not a runtime dependency.
- **Create** `recipe-planner/scripts/data/usda-foundation.json` (or a checked-in derived subset) — the raw source.
- **Create** `recipe-planner/scripts/build-usda-seed.js` — transform pass that:
  - filters to **raw, purchasable** items (drop cooked/prepared/derived entries that are not a shopping-list ingredient);
  - **renames** each USDA description to a plain name (rule-based: drop trailing state qualifiers like ", raw", ", mature seeds"; reorder "Beans, black" → "black beans"; hand-curated overrides for the messy ones);
  - maps USDA `foodCategory` → one of the 8 existing **sections** (`produce`, `dairy`, `baking supplies`, `meat`, `bakery`, `prepared meals`, `frozen`, `international`) and a default **store** (best guess — see mapping table below);
  - assigns a best-guess **`canonical_unit` + `dimension`** from a hand-curated category/keyword→unit map (see below), leaving both **null** for anything the map can't classify — a valid Phase-1 state, flagged by the linter and corrected at first use;
  - emits `usda-seed.json`: an array of `{ name, fdc_id, usda_data_type, usda_category, section_name, store_name, canonical_unit, dimension }`.
- **Proposed** category/keyword→(`canonical_unit`, `dimension`) defaults — mirrors the section handling; unmatched → both null (linter-flagged, corrected at first use):
  | USDA category / keyword (examples) | canonical_unit | dimension |
  |---|---|---|
  | Fats and Oils (olive oil, …) | tbsp | volume |
  | Spices and Herbs | tsp | mass* |
  | Legumes, Cereal Grains, most Vegetables/Fruits | g / lb | mass |
  | whole-count produce (egg, lemon, onion) — keyword override list | each | count |
  | (anything the map can't classify) | null | null |

  \*Dimension is authoritative from `canonical_unit` via Phase 1's unit→dimension map; the table's dimension column is indicative. Reserve a keyword override list for the count-vs-mass irregulars (eggs, lemons, whole onions) exactly as the rename step budgets overrides for messy names.
- **Proposed** category→section defaults (corrected inline at first use, per the decision record):
  | USDA foodCategory (examples) | section | default store |
  |---|---|---|
  | Vegetables / Fruits | produce | safeway |
  | Dairy and Egg Products | dairy | safeway |
  | Beef / Poultry / Pork / Finfish | meat | costco |
  | Legumes, Cereal Grains, Spices, Fats & Oils | baking supplies | safeway |
  | Baked Products | bakery | safeway |
  | (frozen-only items) | frozen | safeway |
- Verify (behavior, not count): spot-check 20 entries for plain-readable names and correct section/store; confirm a mix of dimensions appears (an oil → volume, a whole-count item → count, a legume → mass). The total count is *not* asserted here — the raw-purchasable Foundation Foods set may land well below the ~800 order-of-magnitude estimate (see §7), so a hard count check would fail an honest run.

### 4.3 Seed script — insert into prod with dedup
- **Create** `recipe-planner/scripts/seed-usda.js`. The existing `scripts/find-duplicates.js` / `scripts/find-product-matches.js` supply only the **PocketBase-client boilerplate convention** (ESM `import PocketBase`, direct client against prod `http://192.168.50.95:8090`) — they contain no reusable name matcher, so the resolver is written fresh here.
- Write a **case-insensitive name-resolution helper** (normalized `name.toLowerCase().trim()` exact match, following the grouping shape in `find-duplicates.js:14-29`; conservative fuzzy — skip-with-review on any near match rather than auto-merging). For each seed entry: resolve against existing products first; on match, **backfill** the matched product's `fdc_id`/`usda_category`/`usda_data_type` if empty (this is **required**, not optional — it populates the join key re-runs depend on); on genuine miss, create a `raw` product with section/store relations resolved by name, `fdc_id`, `usda_data_type = "foundation_food"`, and the best-guess canonical unit + dimension (null when unclassified — see §4.2).
- Idempotent re-run safe: the key is the **normalized name** (primary), with `fdc_id` as secondary confirmation. `fdc_id` alone is insufficient because every pre-existing product starts with null `fdc_id` (the field is new this phase); the mandatory backfill above populates it on first run. The Phase-1 case-insensitive unique index on `products.name` is the ultimate duplicate backstop.
- Verify: run against **test** DB first (`:8091`); product count rises by the number of genuine misses; no unique-index violations; no near-duplicate created against the existing 291.

### 4.4 Client-side fuzzy/token search module
- Add a fuzzy-search dependency. **Proposed:** `fuse.js` (small, zero-dep, weighted token search) — no such library is currently in `package.json`. Alternative considered: `match-sorter`. Either is acceptable; pick one and pin it.
- **Create** `recipe-planner/src/lib/search/product-search.ts` — a small wrapper that builds an index over `Product[]` (keyed on `name`, ready to extend to synonyms) and exposes `searchProducts(query, products): Product[]` returning relevance-ranked results, with an empty-query passthrough.
- Verify: unit-level check that "paste tomato" ranks "tomato paste" first and "garbonzo" matches "garbanzo".

### 4.5 Wire fuzzy search into the product-search surfaces
- **Modify** `recipe-planner/src/pages/registries/Products.tsx` — replace the `filteredItems` `.includes()` block (`:91-98`) with `searchProducts`.
- **Modify** `recipe-planner/src/pages/RecipeEditor.tsx` — give the product `Autocomplete`s (`:903-904`, `:1138-1139`) a `filterOptions` backed by `searchProducts`.
- **Modify** `recipe-planner/src/components/ProductForm.tsx` — replace the naive duplicate-detection `filter` (`:236-250`) with `searchProducts`, so the "similar products found" warning catches typos and reorderings, not just substrings.
- **Modify** the Phase-2 **swap flow's replacement-product search** (`ShopSwapDialog`'s "fast search over existing products", Phase 2 §2/§11 — the surface that *feeds* quick-create on a miss, not the quick-create create form itself) to use the same module, so store-time product lookup is fuzzy too. **This sub-item alone depends on Phase 2 having shipped that search surface** (see Dependencies); the three wirings above do not.
- Verify: typing a reordered/misspelled query in each of the three Phase-3-independent surfaces surfaces the intended product; the swap-search wiring is verified once Phase 2's swap dialog exists.

### 4.6 "Search USDA" mode in quick-create
- **Modify** the Phase-2 quick-create dialog to add a "Search USDA" tab/toggle.
- **Create** `recipe-planner/src/lib/usda/usda-lookup.ts` — the on-demand SR Legacy lookup. **Proposed data-path decision (not yet decided):**
  - **Option A (bundled):** ship a trimmed SR Legacy name+category+fdc_id index as a static JSON asset; lookup is offline, fast, works on the store hotspot with no external calls. Larger bundle.
  - **Option B (live API):** call the FDC public API (`api.nal.usda.gov/fdc/v1/foods/search`) with an API key at query time. Smaller bundle, but adds an external dependency and a network round-trip that must survive the flaky-hotspot shopping context (Topic 1).
  - Recommendation: **Option A** — it aligns with the tablet-first, hotspot-tolerant shopping model and needs no secret. Flagged for the planner to confirm.
- On selection, pre-fill name (plain-renamed), section (from category mapping), store default, and `fdc_id` (`usda_data_type = "sr_legacy"`) into the quick-create form; user confirms/adjusts and saves.
- Verify: searching an SR-Legacy-only ingredient in the dialog returns candidates and creating one persists a product with `fdc_id` and `usda_data_type = "sr_legacy"`.

---

## 5. Dependencies & Prerequisites

**Blocks (must complete before this phase runs):**

- **Phase 1 — Data hygiene (hard prerequisite).** Two reasons:
  1. Seeded products must carry the Phase-1 **canonical unit + dimension** fields and the split-out container-type / unit-enum shape. Seeding into the pre-Phase-1 schema would create products missing exactly the fields Phase 1 introduces.
  2. Phase 1 installs the **case-insensitive unique index on `products.name`** and runs the one-shot dedup of the existing 291. Seeding ~800 names into a registry that still contains un-deduped near-dupes, or without that index in place, defeats the hygiene goal and risks either index-violation errors or a fresh crop of duplicates. Seed *after* dedup + index exist, and have the seed script itself dedup against survivors.

- **Phase 2 — Shopping state (soft prerequisite for two features).** Both the "Search USDA" mode (4.6) and the swap-search fuzzy wiring (4.5's fourth sub-item) touch surfaces Phase 2 builds — the quick-create dialog and the `ShopSwapDialog` product search (Topic 1, "minimal, phone-friendly quick-create dialog: name + store/section + unit"; Phase 2 §11). If Phase 2 has not shipped those, both have nothing to extend. Everything else is Phase-2-independent and can ship first: the seed (4.1–4.3), the search module (4.4), and the three registry/editor/ProductForm wirings in 4.5.

**Infra / data:**

- USDA FDC bulk Foundation Foods export must be downloaded once (offline). For Option B of 4.6 only, an FDC API key would be required.
- No tailnet dependency for the seed (script runs against prod from a dev machine). The "Search USDA" *live-API* variant (4.6 Option B) would inherit Topic-1's flaky-connectivity concern; the bundled variant (Option A) sidesteps it.

**Depended-on-by:**

- Topic 5's `/suggest-recipes` skill wants the FDC IDs and the (later-backfilled) macro fields for its "protein/macro floor per serving" constraint — this phase lays that groundwork but does not build it.

---

## 6. Acceptance Criteria

1. The `products` collection has nullable `fdc_id`, `usda_data_type`, `usda_category`, and the five nutrition fields; the 291 pre-existing products still load and edit without error; `Product` in `types.ts` reflects the new fields.
2. Running `seed-usda.js` against the **test** DB inserts the genuine-miss Foundation Foods as `raw` products with a non-null `fdc_id`, a resolved `section`, and a default `store` — and creates **zero** case-insensitive duplicate names against existing products (no unique-index violations). Each seeded product carries a best-guess `canonical_unit` + `dimension` where the §4.2 map classifies it, and **null** (linter-flagged, corrected at first use) where it cannot — consistent with Phase 1's nullable `canonical_unit`.
3. Seeded product names are plain and human ("black beans", not "Beans, black, mature seeds, raw") — verified on a 20-item spot check.
4. In the registry page, recipe-editor product picker, and ProductForm duplicate check, a reordered query ("paste tomato") surfaces "tomato paste" and a single-typo query ("garbonzo") surfaces "garbanzo". (The same behavior in Phase 2's swap-product search is verified once that surface exists — see 4.5.)
5. The quick-create dialog offers a "Search USDA" mode that returns candidates for an ingredient absent from the seeded set and, on selection, creates a product carrying its `fdc_id` and `usda_data_type = "sr_legacy"`.
6. Re-running `seed-usda.js` is idempotent — no new duplicates on a second run. This holds because the resolver keys on normalized name (with the mandatory first-run `fdc_id` backfill giving re-runs a populated secondary join key), backstopped by the Phase-1 case-insensitive unique index on `products.name`.

---

## 7. Risks & Open Questions

- **Nutrition storage shape — deferred by the decision record.** Inline nullable macro fields (this doc's recommendation) vs a linked `product_nutrients` table. Marked Proposed; the planner should confirm before the migration (4.1) is written, since it changes the schema. Low regret either way because no UI consumes it yet.
- **"Search USDA" data path (bundled SR Legacy vs live FDC API) — Proposed.** Recommendation is bundled (Option A) for hotspot tolerance; needs confirmation. If live API is chosen, an API-key secret and network-failure handling enter scope.
- **Category→section mapping accuracy.** USDA's `foodCategory` taxonomy does not map cleanly onto the 8 household sections; defaults will be wrong for a meaningful minority (spices under "baking supplies", etc.). Mitigated by the decision-record principle "corrected inline at first use" — defaults are a starting point, not ground truth. Risk is user annoyance, not data corruption.
- **Canonical-unit/dimension defaults for seeded items — Proposed.** USDA data carries no purchase unit, so §4.2 assigns `canonical_unit`/`dimension` from a hand-curated category/keyword map and leaves the rest **null** (linter-flagged, corrected at first use). This deliberately avoids per-item judgment on ~800 rows at seed time and stays within Phase 1's nullable-field model, but means a meaningful minority of seeded items ship without a canonical unit until first used. The count-vs-mass irregulars (eggs, lemons, whole onions) are the main override burden — confirm the keyword override list covers the common ones. Whether canonical-unit assignment for *new* seeds belongs to Phase 3 (here) or Phase 1's backfill is settled here as Phase 3's job, since Phase 1's backfill only touches the existing 291.
- **Rename quality.** Rule-based USDA-description → plain-name transformation will produce awkward names for irregular entries; budget for a hand-curated override list in `build-usda-seed.js` rather than assuming the rules are perfect.
- **Actual Foundation Foods count.** The decision record estimates ~800 concept items; the live FDC Foundation Foods set may differ from that figure after the raw-purchasable filter. Treat ~800 as an order-of-magnitude target, not a hard count — the acceptance criteria are phrased on behavior, not exact totals.
- **Fuzzy-search library choice (fuse.js vs match-sorter) — Proposed.** Minor; either satisfies the criteria. Pin one to avoid divergent behavior across the four surfaces.
- **Seed timing vs Phase-1 dedup.** If Phase 1's dedup pass leaves any un-merged near-dupes, the seed's own dedup must be conservative (prefer skip-on-any-fuzzy-match with review) to avoid compounding the problem. Consider a dry-run mode on `seed-usda.js` that reports proposed inserts/matches before writing.
