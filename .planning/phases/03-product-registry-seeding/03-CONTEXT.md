# Phase 3: Product Registry Seeding - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the product registry real-world breadth and make it searchable everywhere, so authoring and quick-create rarely require typing an ingredient from scratch. Concretely:

- **Seed** the `products` registry with a broad base of plain-named, concept-level raw ingredients, each landing as a `raw` product with a best-guess section + default store and a retained USDA `fdc_id` for later nutrition work (REG-01).
- **Fuzzy/token search** on every product-search surface — registry page, recipe-editor product pickers, ProductForm duplicate-check, Phase-2 quick-create + swap search — tolerant of typos and reordered words (REG-02).
- **"Search USDA" mode** in quick-create: on-demand lookup of the long tail, pre-filling name / section / `fdc_id` (REG-03).
- **Nutrition-ready schema** — nullable macro fields + `fdc_id`, no nutrition UI this phase (REG-04).

**Explicitly OUT of this phase:** the single-purchase-unit / density (gram-weight) model. It was evaluated this discussion and **deferred to a dedicated follow-on phase** (see `<deferred>`). Phase 3's only obligation to it is to preserve the hooks (retain `fdc_id`, keep `canonical_unit`/`dimension` nullable).

</domain>

<decisions>
## Implementation Decisions

> Four gray areas were researched (advisor mode, `standard` calibration). A cross-cutting finding reframed the phase: **"~800 USDA Foundation Foods" is not real** — Foundation Foods holds only ~160–350 items total (FNDDS 2021–2023 docs cite 162–163 with current data), yielding likely **<150 net-new products** after a raw-purchasable filter and case-insensitive dedup against the existing 291. The ~800 figure only exists in **SR Legacy** (7,793 items). This drove the seed-source and Search-USDA decisions below.

### Seed source & breadth — D-01 (PIVOT from phase doc)
- **D-01:** Seed source pivots from the phase doc's "rename verbose USDA Foundation Foods descriptions" plan to an **external plain-name ingredient catalog** (research Option 4). Rationale: Foundation Foods is both too small for breadth and too verbose to name cleanly; an external culinary/household ingredient catalog already carries concept-level plain names. Import plain names from the external catalog; consult USDA only to retain `fdc_id` + (optionally) inline macros.
- **D-02:** The seed **retains `fdc_id` via a name→FDC match** so both the later nutrition backfill and the deferred density phase have their join key. Products with no confident FDC match seed with `fdc_id` = null — a valid state.
- **D-03:** Case-insensitive dedup against the existing 291 products stays **mandatory** (Phase-1 unique index on `products.name` is the backstop). The name-resolver is **conservative**: skip-with-review on a near-match, never auto-merge. On an exact match, **backfill** the matched product's `fdc_id`/`usda_*` fields if empty (required — it populates the re-run join key).
- **D-04:** `canonical_unit`/`dimension` are keyword-mapped where a small map classifies them, left **null** (linter-flagged, corrected at first use) otherwise — **no per-item unit curation at seed time**. `frozen` and `international` sections have **no USDA/category equivalent** and will not auto-populate under any option — they stay first-use-corrected.

### Fuzzy / token search — D-05
- **D-05:** Client-side fuzzy/token search module (`searchProducts(query, products)`) built once and wired into all four surfaces (registry list, recipe-editor pickers, ProductForm dup-check, Phase-2 quick-create + swap search). Library choice (`fuse.js` vs `match-sorter`) is **Claude's discretion** — pin one, use it everywhere. Behavior bar: "paste tomato" ranks "tomato paste" first; "garbonzo" matches "garbanzo".

### "Search USDA" data path — D-06 (Hybrid)
- **D-06:** **Hybrid (research Option C).** Phase 3 ships the **bundled trimmed SR-Legacy index** (`{name, foodCategory, fdc_id}`, ~150–250KB gzipped, fully offline, indexed with the same fuse.js module) as the **primary** Search-USDA source — chosen over the external catalog *for this surface* because SR Legacy carries a **native `fdc_id`** for pre-fill. The **live FDC API fallback is DEFERRED** — build it only if the bundled index shows a real miss rate in use. Note the decoupling: because the seed (D-01) no longer uses SR Legacy, this bundle is a **standalone asset**, not the "near-free" byproduct the research assumed under an SR-Legacy seed.
- Products created via Search-USDA get `usda_data_type = "sr_legacy"`, `fdc_id`, and a category-derived section.

### Nutrition storage shape — D-07 (Inline)
- **D-07:** **Inline nullable columns (research Option A):** `nutrient_basis_g`, `kcal`, `protein_g`, `fat_g`, `carb_g` on `products` (per-100g basis). Matches the only known future consumer (`/suggest-recipes` macro floor) exactly; a `product_nutrients` linked table is **not** built now. `fdc_id` retention makes a future inline→linked step purely **additive** (inline fields become a denormalized macro cache). Only `fdc_id` must be populated at seed time; macros backfill later via FDC nutrient ids 1008/1003/1004/1005.

### Open Questions for Research
1. **Which external plain-name catalog?** Candidates: Open Food Facts food/ingredient taxonomy, an `ingredient-parser`-style canonical list, or similar. Criteria: concept-level household names, license OK for self-hosted use, household-staple breadth, mappable to the 8 existing sections, joinable to USDA `fdc_id`.
2. **Name→FDC(`fdc_id`) join strategy + expected coverage**, and the no-match path (`fdc_id` null, product still valid).
3. **Category→section + default-store mapping** now that names come from the external catalog — the phase doc's USDA `foodCategory`→section table may not apply; derive from the catalog's categories or a keyword map.
4. **Bundled SR-Legacy Search-USDA asset:** confirm the trim (`name`+`category`+`fdc_id`), gzipped size, and fuse.js in-memory feasibility on the tablet (~7.8k rows).
5. **Fuzzy lib pick** (`fuse.js` vs `match-sorter`) — pin one; validate the two behavior cases above.

### Claude's Discretion
- Fuzzy-search library choice; name→FDC join algorithm details; schema-migration mechanics (admin UI vs migration); exact external dataset (pending Open Question 1); dry-run/report mode on the seed script.

### Reviewed Todos
- **`single-purchase-unit-shopping-lines`** (matched, resolves_phase: 3) — reviewed and **decided, not folded**: deferred to its own follow-on phase (see `<deferred>`). Phase 3 preserves its hooks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone decision record
- `plans/workflow-redesign.md` — Topic 2 ("Units & product hygiene") + roadmap entry 3 ("Registry seeding"). Authoritative source for the milestone's registry decisions.

### Phase design (partially superseded)
- `.planning/phase-docs/phase-3-registry-seeding.md` — full elaborated phase design. **NOTE:** its §4.2 "rename USDA Foundation Foods descriptions" seed approach is **superseded by D-01** (external plain-name catalog). Its schema-migration (§4.1), dedup/name-resolver (§4.3), fuzzy-search module + wiring (§4.4–4.5), and Search-USDA (§4.6) sections remain valid guidance.
- `.planning/phase-docs/00-overview.md` — milestone overview.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §Registry Seeding — REG-01..04. **NOTE:** REG-01's "~800 USDA Foundation Foods" wording is now inaccurate — seed source pivoted to an external catalog + USDA link; breadth from Foundation Foods alone is <150 net-new.
- `.planning/ROADMAP.md` §Phase 3 — goal + success criteria.

### Schema & codebase
- `pb_schema.json` — canonical PocketBase schema (22 collections). Verify `products` (`pbc_7402169584`) changes against it; mirror new fields in.
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md`, `STACK.md` — codebase maps.

### Deferred-model todo
- `.planning/todos/pending/single-purchase-unit-shopping-lines.md` — the density/purchase-unit model, now deferred to a dedicated follow-on phase (this discussion's decision).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/find-duplicates.js:14-29` — case-insensitive `name.toLowerCase()` grouping; the **only** reusable dedup prior art. The seed name-resolver is written **fresh** (the `find-*.js` scripts are ad-hoc diagnostics with hardcoded substring searches, not reusable matchers).
- `scripts/find-*.js` — supply the PocketBase-client boilerplate convention only (ESM `import PocketBase`, direct client against prod `http://192.168.50.95:8090`, test `:8091`).
- `src/lib/units.ts` (Phase 1) — unit enum + within-dimension conversion + unit→dimension map. Authoritative for `canonical_unit`/`dimension` semantics on seeded items.
- Phase-2 quick-create dialog + `ShopSwapDialog` product search — the surfaces "Search USDA" (D-06) and the swap-search fuzzy wiring (D-05) extend. **Soft-dependent on Phase 2 having shipped** (it has).

### Established Patterns (all substring-only today → swap to `searchProducts`)
- `src/pages/registries/Products.tsx:91-98` — raw `.includes()` filter.
- `src/pages/RecipeEditor.tsx:903-904`, `:1138-1139` — default MUI `Autocomplete` (plain substring).
- `src/components/ProductForm.tsx:236-250` — naive `includes`/`includes` duplicate-detection; new fuzzy dup-check catches typos/reorderings.

### Integration Points
- `products` collection `pbc_7402169584`; every new field nullable (291 hand-authored products stay valid, no migration).
- `src/lib/types.ts:42-56` — extend the `Product` interface with new optional fields (`fdc_id`, `usda_data_type`, `usda_category`, `nutrient_basis_g`, `kcal`, `protein_g`, `fat_g`, `carb_g`).
- `sections` / `stores` are existing PocketBase relations resolved by name during seeding.
- New files anticipated: `scripts/build-usda-seed.js`, `scripts/seed-usda.js`, `scripts/data/*` (external catalog + trimmed SR-Legacy asset), `src/lib/search/product-search.ts`, `src/lib/usda/usda-lookup.ts`.

</code_context>

<specifics>
## Specific Ideas

- Search behavior the user has in mind: "garbonzo" → "garbanzo", "paste tomato" → "tomato paste" (typo + word-reorder tolerance, relevance-ranked).
- Plain human names, not USDA verbose ("black beans", not "Beans, black, mature seeds, raw").
- The low-clutter store tablet is the driving value behind the (now deferred) single-purchase-unit want — keep that value in mind when the follow-on phase is scoped.

</specifics>

<deferred>
## Deferred Ideas

### Density / purchase-unit single-line model → dedicated follow-on phase
Evaluated in depth this discussion and **deferred** (not dropped). The goal — one shopping line per ingredient in its purchase unit (butter→lb, oil→oz), collapsing cross-dimension quantities — requires a per-product gram-weight bridge. Research finding: **Foundation Foods lacks household portions** ("100-unit measures only" per USDA); the "1 tbsp = X g" data lives in **SR Legacy / FNDDS**, so the bridge needs a separate portion ingest + a curated density fallback + a grams-pivot aggregation rewrite — and it **reverses the locked "no density model" decision**. Too much to fold onto Phase 3's already-scoped seed on unverified coverage.

**Plan to pick it up:** a focused phase *after* Phase 3 that (1) spikes FDC/curated portion coverage against the real top-N ingredients, (2) adds `products.purchase_unit` + a `product_portions` bridge table, (3) rewrites aggregation to grams-pivot with convert-or-split as the permanent fallback tier. **Prerequisite already secured by Phase 3:** retained `fdc_id` + nullable `canonical_unit`/`dimension`. When picked up, formally reverse "no density model / cross-dimension out of scope" in PROJECT.md + REQUIREMENTS.md and add the phase/requirement via `/gsd-phase`.

### Reviewed Todos (not folded)
- `single-purchase-unit-shopping-lines` — see above; decided → own phase.
- `swap-aware-prep-naming` — belongs to Phase 5 (prep-step metadata rework).
- `nas-pocketbase-tailnet` — infra prereq for Phase 2/6 store use; not Phase 3. (Seed scripts run against prod from a dev machine over LAN — no tailnet dependency.)
- `deploy-pb-superuser-env` — deploy/infra. Not Phase 3 scope, but note: seed/schema scripts need PB superuser creds locally (gitignored `.env.local`), same as Phase 1's merge scripts.

</deferred>

---

*Phase: 3-Product Registry Seeding*
*Context gathered: 2026-07-06*
