# Phase 3: Product Registry Seeding - Research

**Researched:** 2026-07-07
**Domain:** Data seeding (external ingredient catalog + USDA FDC join), client-side fuzzy search, PocketBase schema evolution
**Confidence:** MEDIUM (schema mechanics, fuzzy library, USDA bulk-data facts are HIGH; the external catalog choice and expected join coverage are reasoned recommendations, not empirically measured — flagged accordingly)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (PIVOT):** Seed source pivots from the phase doc's "rename verbose USDA Foundation Foods descriptions" plan to an **external plain-name ingredient catalog**. Rationale: Foundation Foods is both too small for breadth (~160-350 items total) and too verbose to name cleanly; an external culinary/household ingredient catalog already carries concept-level plain names. Import plain names from the external catalog; consult USDA only to retain `fdc_id` + (optionally) inline macros.
- **D-02:** The seed **retains `fdc_id` via a name→FDC match** so both the later nutrition backfill and the deferred density phase have their join key. Products with no confident FDC match seed with `fdc_id` = null — a valid state.
- **D-03:** Case-insensitive dedup against the existing 291 products stays **mandatory** (Phase-1 unique index on `products.name` is the backstop). The name-resolver is **conservative**: skip-with-review on a near-match, never auto-merge. On an exact match, **backfill** the matched product's `fdc_id`/`usda_*` fields if empty (required — it populates the re-run join key).
- **D-04:** `canonical_unit`/`dimension` are keyword-mapped where a small map classifies them, left **null** (linter-flagged, corrected at first use) otherwise — **no per-item unit curation at seed time**. `frozen` and `international` sections have **no USDA/category equivalent** and will not auto-populate under any option — they stay first-use-corrected.
- **D-05:** Client-side fuzzy/token search module (`searchProducts(query, products)`) built once and wired into all four surfaces (registry list, recipe-editor pickers, ProductForm dup-check, Phase-2 quick-create + swap search). Library choice (`fuse.js` vs `match-sorter`) is **Claude's discretion** — pin one, use it everywhere. Behavior bar: "paste tomato" ranks "tomato paste" first; "garbonzo" matches "garbanzo".
- **D-06 (Hybrid):** Phase 3 ships the **bundled trimmed SR-Legacy index** (`{name, foodCategory, fdc_id}`, ~150-250KB gzipped, fully offline, indexed with the same fuse.js module) as the **primary** Search-USDA source. The **live FDC API fallback is DEFERRED**. Products created via Search-USDA get `usda_data_type = "sr_legacy"`, `fdc_id`, and a category-derived section.
- **D-07 (Inline):** `nutrient_basis_g`, `kcal`, `protein_g`, `fat_g`, `carb_g` on `products` (per-100g basis). No `product_nutrients` linked table. Only `fdc_id` must be populated at seed time; macros backfill later via FDC nutrient ids 1008/1003/1004/1005.
- **Density model DEFERRED** to a follow-on phase. Phase 3 only preserves the hooks (retain `fdc_id`, keep `canonical_unit`/`dimension` nullable). Do NOT plan `purchase_unit`/gram-weight work.

### Claude's Discretion

- Fuzzy-search library choice; name→FDC join algorithm details; schema-migration mechanics (admin UI vs migration); exact external dataset (pending Open Question 1); dry-run/report mode on the seed script.

### Deferred Ideas (OUT OF SCOPE)

- **Density / purchase-unit single-line model** → dedicated follow-on phase. Requires a per-product gram-weight bridge (Foundation Foods lacks household portions; SR Legacy/FNDDS carry "1 tbsp = X g" data). Reverses the locked "no density model" decision — too much to fold into Phase 3.
- `swap-aware-prep-naming` — belongs to Phase 5.
- `nas-pocketbase-tailnet` — infra prereq, not Phase 3 (seed scripts run against prod from a dev machine over LAN).
- `deploy-pb-superuser-env` — deploy/infra, not Phase 3 scope; seed/schema scripts need PB superuser creds locally (gitignored `.env.local`), same as Phase 1.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | Registry seeded with a broad base of plain-named raw ingredients, default store/section, zero duplicate names against the existing set | External-catalog recommendation (Standard Stack), category→section/store mapping table, dedup/join algorithm (Architecture Patterns, Code Examples), verified live schema/data facts (291 products, 121 raw, composite unique index scope) |
| REG-02 | Product search on registry page, recipe editor, quick-create tolerates typos + reordered words | Fuzzy library selection (fuse.js) with concrete config + sorted-token trick for word-order independence; four wiring sites with verified file:line targets |
| REG-03 | Quick-create offers a "Search USDA" mode for on-demand items | Bundled SR-Legacy asset build step, verified file sizes, wiring into `QuickCreateProductDialog.tsx`; interaction with the dialog's existing unit-required validation flagged as an open design point |
| REG-04 | Seeded products carry nutrition fields (FDC ID, macros) with no nutrition UI | Nutrient ID mapping (1008/1003/1004/1005) verified via USDA sources; Foundation-Foods 1008-deprecation pitfall documented; inline nullable schema fields per D-07 |

</phase_requirements>

## Summary

Phase 3 has two genuinely new pieces of research beyond the phase doc's already-valid guidance: **which external catalog supplies plain ingredient names** (D-01's pivot), and **how that catalog's names get joined back to a USDA `fdc_id`**. Everything else — PocketBase schema mechanics, the fuzzy-search library, the Search-USDA bundle, and the four wiring sites — has concrete, verifiable answers in the existing codebase and public documentation.

For the catalog: **no single freely-licensed, ready-to-use dataset delivers "clean concept-level household names + a section-mappable category + a native fdc_id"** in one file. The strongest available candidate is the **Open Food Facts categories taxonomy** (`categories.json`/`categories.txt`, ODbL-licensed, actively maintained, real and large — but noisy: mixes branded/regional appellation entries with generic ones and needs a filtering + curation pass to reach the "few-hundred-to-800" target). A hand-curated static seed list (built once, by hand or LLM-assisted, organized directly into the 8 existing sections) is a legitimate, lower-risk fallback if that filtering pass proves not worth the effort for a ~400-800-item personal registry — this is flagged as a genuine judgment call for the planner, not a settled fact.

For the join: use the **USDA bulk CSV/JSON download** (not the live API) — CC0/public-domain, no rate limit, no network dependency during the shopping-hotspot window that matters for a *different* surface (Search-USDA) but is good practice anyway. Crucially, **the SR Legacy bulk file the seed's join step needs is the exact same file D-06's bundled Search-USDA asset needs** — one download, two consumers. Join via normalized-name matching (reusing the same fuzzy module built for D-05, at a conservative threshold, skip-with-review on ambiguous matches — consistent with D-03's posture), Foundation Foods first (more rigorous per-item data) then SR Legacy fallback, then null.

Two live-data facts materially change the phase doc's assumptions and are worth calling out up front: (1) the products unique index is **composite on `(name COLLATE NOCASE, type)`**, not `name` alone — dedup only needs to resolve against the **121 existing `raw` products**, not all 291; and (2) the real `stores` collection has **four** stores (`safeway`, `costco`, `trader joes`, `online`), not the phase doc's assumed two — `trader joes` and `online` are plausible defaults for international/specialty items that have no clean category mapping.

**Primary recommendation:** Build the seed from a curated/filtered Open Food Facts category export (fallback: hand-curated list), join to USDA via bulk SR-Legacy+Foundation-Foods CSV with a conservative fuzzy-match resolver reusing the fuse.js module, and use fuse.js (not match-sorter) for all four search-surface wirings, configured with `ignoreLocation`, a tuned `threshold`, and a synthetic sorted-token key to get true word-order independence.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Seed data acquisition + transform (external catalog → USDA join → `usda-seed.json`) | Offline data-prep (dev-machine script) | — | One-time artifact generation; not a runtime dependency; mirrors Phase 1's `build-*`/`scripts/data` convention |
| Seed insertion + dedup against existing registry | Backend / Database (PocketBase via Node script) | — | Direct PocketBase REST writes from a dev-machine script (`scripts/seed-usda.js`), same convention as `merge-products.js`/`find-duplicates.js` |
| Schema migration (new `products` fields) | Database (PocketBase Admin UI, both instances) | Frontend (types.ts) | No `pb_migrations/` dir in this repo — schema-as-code is Admin UI + `pb_schema.json` export (established Phase 1 convention); `Product` TS interface mirrors it |
| Client-side fuzzy/token search module | Browser / Client | — | Runs entirely in-memory over the fetched `Product[]` array; no server round-trip, no new endpoint |
| Search-USDA bundled SR-Legacy index | Browser / Client (static asset) + Build step | Offline data-prep | Static JSON asset shipped in the app bundle; built once by an offline script, consumed at runtime with zero network calls (satisfies the flaky-hotspot constraint) |
| Nutrition fields (storage only, no UI) | Database / Storage | — | Inline nullable columns on `products`; no new tier introduced since D-07 rejected a linked table |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `fuse.js` | 7.4.2 [VERIFIED: npm registry, `npm view fuse.js version`] | Client-side fuzzy/token search across all four surfaces (D-05) | Purpose-built weighted fuzzy matcher; already the phase doc's proposed default; per-term typo tolerance handles "garbonzo"→"garbanzo" natively, and its multi-key search + `ignoreLocation` + a synthetic sorted-token key covers "paste tomato"→"tomato paste" (see Architecture Patterns) [VERIFIED: krisk/Fuse GitHub repo, 10.1M weekly downloads via package-legitimacy check] |
| `pocketbase` | ^0.26.5 (already in `package.json`) [VERIFIED: repo file] | JS client for seed/join scripts against prod (`:8090`) and test (`:8091`) | Already the project's established scripting convention (`find-duplicates.js`, `merge-products.js`) — reuse, don't add a second client library |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | ^4.23.0 (already a devDependency) [VERIFIED: repo file] | Run the new `.js`/`.ts` seed/build scripts directly | Already installed for `scripts/lint.js` per Phase 1; reuse for `build-usda-seed.js`/`seed-usda.js` if written in TS, otherwise plain ESM `.js` matches every existing script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fuse.js` | `match-sorter` (8.3.0) [VERIFIED: npm registry; 3.0M weekly downloads, canonical `kentcdodds/match-sorter` repo via package-legitimacy check] | `match-sorter` produces more "intuitively deterministic" ranking and is simpler to configure, but its typo tolerance is weaker than Fuse's per-term fuzzy match (it's substring/rank-based, not edit-distance based) — fails the "garbonzo"→"garbanzo" bar more often. Reasonable pick if the team later finds Fuse's ranking behavior counter-intuitive during real use. [CITED: comparisons synthesized from fusejs.io docs, match-sorter GitHub README, and third-party comparison posts — see Sources] |
| Bundled SR-Legacy JSON (D-06, locked) | Live FDC API (`api.nal.usda.gov/fdc/v1/foods/search`) | Explicitly deferred by D-06; smaller bundle but adds an external dependency + network round-trip that must survive the flaky-hotspot shopping context. Revisit only if the bundled index shows a real miss rate in use. |
| Open Food Facts categories taxonomy (seed source) | Hand-curated static JSON list | OFF gives real breadth "for free" but needs a nontrivial filter/curation pass to strip branded/regional noise down to the household-staple subset; a hand-curated list has zero filtering cost and zero license exposure but is 100% manual labor and carries no external "we didn't just make this up" credibility. Both are legitimate; treat as a judgment call to make during planning, not before (see Open Questions). |

**Installation:**
```bash
npm install fuse.js
```

**Version verification:** `npm view fuse.js version` → `7.4.2`, published 2026-06-05 [VERIFIED: npm registry]. `npm view match-sorter version` → `8.3.0`, published 2026-04-15 [VERIFIED: npm registry]. Both confirmed via `gsd-tools query package-legitimacy check` (see Package Legitimacy Audit).

## Package Legitimacy Audit

| Package | Registry | Age/Published | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------|-----------|--------------|---------|-------------|
| `fuse.js` | npm | Latest published 2026-06-05 | 10,179,964/wk | github.com/krisk/Fuse | OK | Approved |
| `match-sorter` | npm | Latest published 2026-04-15 | 3,037,317/wk | github.com/kentcdodds/match-sorter | OK | Approved (not selected — see Alternatives Considered) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

No new packages are required beyond `fuse.js`. Both candidates cleared `npm view <pkg> scripts.postinstall` (null — no postinstall script on either) and the package-legitimacy seam.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │  External catalog source     │
                     │  (OFF categories export OR    │
                     │   hand-curated JSON)          │
                     └──────────────┬────────────────┘
                                    │  filter/curate
                                    ▼
                     ┌─────────────────────────────┐        ┌────────────────────────┐
                     │  build-usda-seed.js          │◄───────┤ USDA bulk CSV/JSON       │
                     │  (offline, one-time)          │  name  │ (Foundation Foods +     │
                     │  - normalize + rename names   │  match │  SR Legacy download)    │
                     │  - join to fdc_id (fuzzy)     │        │ downloaded once, offline│
                     │  - map category→section/store │        └───────────┬─────────────┘
                     │  - map keyword→canonical_unit  │                    │ same file
                     └──────────────┬────────────────┘                    │ also feeds
                                    │ emits usda-seed.json                │
                                    ▼                                     ▼
                     ┌─────────────────────────────┐        ┌────────────────────────┐
                     │  seed-usda.js                 │        │ build-usda-search-      │
                     │  (test DB first, then prod)    │        │ index.js (offline)      │
                     │  - resolve name vs existing     │        │ trims to {name,        │
                     │    raw products (dedup, D-03)  │        │ foodCategory, fdc_id}  │
                     │  - backfill fdc_id on match     │        │ → usda-sr-legacy.json  │
                     │  - insert on genuine miss        │        │ (gzip ~150-250KB)      │
                     └──────────────┬────────────────┘        └───────────┬─────────────┘
                                    │ writes                              │ bundled as
                                    ▼                                     ▼ static asset
                     ┌───────────────────────────────────────────────────────────┐
                     │  PocketBase `products` collection (prod :8090 / test :8091)│
                     └──────────────────────┬──────────────────────────────────────┘
                                            │ fetched at runtime
                                            ▼
                     ┌───────────────────────────────────────────────────────────┐
                     │  src/lib/search/product-search.ts  (searchProducts, fuse.js)│
                     └───┬──────────┬──────────────┬──────────────────┬───────────┘
                         │          │              │                  │
                         ▼          ▼              ▼                  ▼
                  Products.tsx  RecipeEditor.tsx  ProductForm.tsx  ShopSwapDialog.tsx
                  (registry     (2 Autocomplete    (dup-check       (replacement-product
                   list filter)  filterOptions)     filter)          Autocomplete)
                                                                             │
                                                                             ▼
                                                              QuickCreateProductDialog.tsx
                                                              + "Search USDA" tab, indexed
                                                              over usda-sr-legacy.json via
                                                              the same searchProducts module
```

### Recommended Project Structure

```
recipe-planner/
├── scripts/
│   ├── data/
│   │   ├── usda-foundation.json        # bulk download, offline artifact
│   │   ├── usda-sr-legacy.json         # bulk download, offline artifact
│   │   ├── external-catalog-raw.json   # OFF export or hand-curated source
│   │   └── usda-seed.json              # build-usda-seed.js output (committed or gitignored — team's call)
│   ├── build-usda-seed.js              # transform: catalog → seed rows with fdc_id join
│   ├── build-usda-search-index.js      # transform: SR Legacy bulk → trimmed Search-USDA asset
│   └── seed-usda.js                    # idempotent insert against PocketBase (test-first)
├── src/
│   ├── lib/
│   │   ├── search/
│   │   │   └── product-search.ts       # searchProducts(query, products) — fuse.js wrapper
│   │   └── usda/
│   │       └── usda-lookup.ts          # loads bundled usda-sr-legacy.json, searches via same module
│   └── assets/ (or public/)
│       └── usda-sr-legacy.json.gz      # the bundled Search-USDA index shipped with the app
```

### Pattern 1: Reusable fuzzy module across four surfaces (D-05)

**What:** One `searchProducts(query, products): Product[]` function backing every search surface, built once over a `fuse.js` instance.

**When to use:** Registry list filter, RecipeEditor Autocomplete `filterOptions`, ProductForm dup-check, ShopSwapDialog replacement-product Autocomplete `filterOptions`.

**Example (synthesized — the sorted-token trick is not itself documented by Fuse.js but composes directly from its documented multi-key + `ignoreLocation` options):**

```typescript
// src/lib/search/product-search.ts
import Fuse, { type IFuseOptions } from "fuse.js";
import type { Product } from "../types";

interface SearchableProduct extends Product {
  /** Words alpha-sorted + joined — makes "paste tomato" and "tomato paste"
   *  the same string, giving word-order independence without a custom
   *  tokenizer. Combined with the plain `name` key (still typo-tolerant via
   *  Fuse's per-character fuzzy match) so a single-word typo still ranks. */
  _sortedTokens: string;
}

function toSortedTokens(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const FUSE_OPTIONS: IFuseOptions<SearchableProduct> = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "_sortedTokens", weight: 0.4 },
  ],
  threshold: 0.35, // 0 = exact, 1 = match anything; 0.3-0.4 tolerates 1-2 char typos on short words
  ignoreLocation: true, // match position in string doesn't matter
  includeScore: true,
};

export function searchProducts(query: string, products: Product[]): Product[] {
  if (!query.trim()) return products;

  const indexed: SearchableProduct[] = products.map((p) => ({
    ...p,
    _sortedTokens: toSortedTokens(p.name),
  }));

  const fuse = new Fuse(indexed, FUSE_OPTIONS);
  // Query itself is also sorted-token-normalized on the _sortedTokens key by
  // Fuse's own matcher (Fuse fuzzy-matches the raw query string against each
  // key independently) — no extra query preprocessing needed.
  return fuse.search(query).map((result) => result.item);
}
```

**Verification approach:** unit test asserting `searchProducts("paste tomato", products)[0].name === "tomato paste"` and `searchProducts("garbonzo", products)[0].name === "garbanzo"` — matches the phase doc's §4.4 verify step and this project's existing `vitest` convention (`src/lib/*.test.ts`).

### Pattern 2: Wiring into MUI Autocomplete via `filterOptions`

**What:** MUI `Autocomplete` supports a `filterOptions` prop that receives the full option array and returns the filtered subset — this is the seam for RecipeEditor and ShopSwapDialog (both already use plain `Autocomplete` with no `filterOptions`, i.e. default substring filtering).

**Verified wiring targets (read directly from the current source, 2026-07-07):**
- `src/pages/registries/Products.tsx:99-106` — `filteredItems` `useMemo` currently does `item.name.toLowerCase().includes(query)`. Replace body with `searchProducts(searchQuery, items)`.
- `src/pages/RecipeEditor.tsx:900-904` — `Autocomplete` over `products`, no `filterOptions` (MUI default substring). Add `filterOptions={(options, { inputValue }) => searchProducts(inputValue, options)}`.
- `src/pages/RecipeEditor.tsx:1144-1148` — second `Autocomplete` over `products` in the "Edit Product Node" dialog. Same wiring.
- `src/components/ProductForm.tsx:229-251` — `potentialDuplicates` `useMemo` currently does `productName.includes(searchTerm) || searchTerm.includes(productName)`. Replace with `searchProducts(searchTerm, existingProducts).slice(0, 5)`.
- `src/components/outputs/ShopSwapDialog.tsx:298-324` — `Autocomplete` over `replacementProducts`, no `filterOptions`. Add the same `filterOptions` pattern as RecipeEditor.

```typescript
// Example: RecipeEditor.tsx / ShopSwapDialog.tsx Autocomplete wiring
<Autocomplete
  options={products}
  filterOptions={(options, { inputValue }) => searchProducts(inputValue, options)}
  value={selectedProduct}
  onChange={(_, newValue) => setSelectedProduct(newValue)}
  getOptionLabel={(option) => option.name}
  // ...renderInput, renderOption unchanged
/>
```

### Pattern 3: Idempotent dedup/backfill resolver (extends `find-duplicates.js`'s grouping shape)

**What:** For each seed row, resolve against existing `raw` products by normalized name before inserting.

**Verified schema detail that changes the phase doc's dedup framing:** the actual unique index is
`CREATE UNIQUE INDEX idx_products_name_type_ci ON products (name COLLATE NOCASE, type)`
[VERIFIED: `pb_schema.json`, `products` collection `pbc_7402169584`] — **composite on `(name, type)`, not `name` alone.** The seed only needs to dedup-check against the **121 existing `type="raw"` products** [VERIFIED: live prod query, `GET /api/collections/products/records?fields=type` → `{raw: 121, transient: 69, stored: 57, inventory: 44}`, total 291], not all 291. A `stored` or `transient` product sharing a name with a new `raw` seed item will NOT violate the index — but per Phase 1's own precedent ("cross-type same-name collisions quarantined into a separate MD section" — `01-CONTEXT.md`/dedup decisions), the resolver's dry-run report should still flag cross-type name collisions for human review even though they won't hard-block the insert.

```javascript
// scripts/seed-usda.js (pattern — follows find-duplicates.js's PB-client
// boilerplate convention: ESM import PocketBase, PB_URL env override for
// test :8091 vs prod :8090)
const existingRaw = await pb.collection("products").getFullList({
  filter: 'type = "raw"',
});
const existingByNormalizedName = new Map(
  existingRaw.map((p) => [p.name.toLowerCase().trim(), p])
);

for (const seedRow of seedRows) {
  const key = seedRow.name.toLowerCase().trim();
  const exact = existingByNormalizedName.get(key);

  if (exact) {
    // D-03: mandatory backfill of fdc_id/usda_* on empty fields — required,
    // not optional, since it seeds the re-run join key.
    if (!exact.fdc_id) {
      await pb.collection("products").update(exact.id, {
        fdc_id: seedRow.fdc_id,
        usda_data_type: seedRow.usda_data_type,
        usda_category: seedRow.usda_category,
      });
    }
    continue; // never auto-merge beyond the backfill
  }

  // Conservative near-match check (reuse the same fuse.js module built for
  // D-05) — skip-with-review, do not auto-insert or auto-merge.
  const nearMatches = searchProducts(seedRow.name, existingRaw)
    .filter((r) => r.score !== undefined && r.score < 0.2); // tight threshold for review-worthy, not auto-block
  if (nearMatches.length > 0) {
    report.push({ seedRow, nearMatches, action: "SKIP_REVIEW" });
    continue;
  }

  // Genuine miss — insert.
  await pb.collection("products").create({
    name: seedRow.name,
    type: "raw",
    store: seedRow.storeId,
    section: seedRow.sectionId,
    fdc_id: seedRow.fdc_id,
    usda_data_type: seedRow.usda_data_type,
    usda_category: seedRow.usda_category,
    canonical_unit: seedRow.canonical_unit ?? undefined,
    dimension: seedRow.dimension ?? undefined,
  });
}
```

### Anti-Patterns to Avoid

- **Auto-merging on a fuzzy near-match:** D-03 is explicit — conservative skip-with-review only. A tight `fuse.js` threshold used for the *hard* dedup decision (not the search-surface threshold) prevents silent false-merges like "onion" vs "onions" or "chili powder" vs "chili pepper".
- **Treating the FDC API as the join mechanism:** individual API calls for ~400-800 products work within FDC's rate limits but are slow, network-dependent, and duplicate work already needed for the D-06 bundled asset. Use the bulk CSV/JSON download once.
- **Assuming nutrient ID 1008 ("Energy") is always present:** see Common Pitfalls — Foundation Foods records may carry 2047/2048 instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Fuzzy/typo-tolerant string matching | A custom Levenshtein-distance or n-gram matcher | `fuse.js` | Already solves per-term typo tolerance, weighted multi-key search, and scoring; 10M+ weekly downloads, actively maintained |
| Word-order-independent matching | A custom tokenizer/permutation matcher | The sorted-token synthetic key composed on top of `fuse.js`'s documented multi-key search (Pattern 1) | Reuses Fuse's existing matching engine instead of building a second one; ~10 lines of glue code, not a new dependency |
| CSV/JSON parsing of USDA bulk downloads | A custom streaming parser | Node's built-in `JSON.parse` (JSON downloads are the smaller of the two formats per-dataset — see verified sizes below) or a small CSV lib only if the CSV variant is chosen | The JSON downloads are well under Node's default string-parse limits at these sizes (Foundation Foods: 6.5M unzipped; SR Legacy: 205M unzipped — SR Legacy JSON is large enough that the CSV variant, 54M unzipped, is the better pick for that one file) |

**Key insight:** Every piece of new functionality in this phase (fuzzy search, name normalization, dedup) is either a thin wrapper over `fuse.js` or a straightforward data transform script — there is no case in this phase where a "build vs. buy" decision favors building.

## Common Pitfalls

### Pitfall 1: Nutrient ID 1008 ("Energy") may be absent on Foundation Foods records

**What goes wrong:** A macro-backfill script that looks up `nutrient_id = 1008` for every `fdc_id` will silently get `kcal = null` for some Foundation-Foods-sourced matches.
**Why it happens:** USDA's own FAQ/changelog states energy value ID 1008 "will no longer display in FoodData Central's Foundation Foods, but will continue to display for the other food data types" [CITED: fdc.nal.usda.gov, via WebSearch synthesis — see Sources] — Foundation Foods has moved to Atwater-factor-specific energy IDs (commonly 2047 "Energy (Atwater General Factors)" / 2048 "Energy (Atwater Specific Factors)") instead of a single blanket 1008.
**How to avoid:** The macro-backfill step (not this phase's job to build, but its schema is this phase's job) should fall back to 2047/2048 when 1008 is missing and the source `usda_data_type` is `foundation_food`. Document this in the code comment near wherever `nutrient_basis_g`/`kcal` get populated later.
**Warning signs:** A cluster of seeded products with a non-null `fdc_id` but conspicuously null `kcal` after a future backfill pass, disproportionately among Foundation-Foods-sourced rows.

### Pitfall 2: Dedup resolver checking against all 291 products instead of the 121 `raw` ones

**What goes wrong:** A resolver that treats any same-name product (regardless of `type`) as a hard duplicate will incorrectly skip legitimate seed inserts (e.g., an existing `stored` "chicken stock" product doesn't block seeding a `raw` "chicken stock" concept) — or, if scoped too loosely the other way, silently attempts an insert the unique index rejects, producing a confusing runtime API error instead of a clean skip.
**Why it happens:** The phase doc and CONTEXT.md both describe the guard rail as "case-insensitive unique index on `products.name`" in prose, but the actual index (`pb_schema.json`) is composite on `(name COLLATE NOCASE, type)` [VERIFIED].
**How to avoid:** Scope the hard-dedup query to `type = "raw"` (121 records as of 2026-07-07), and separately surface cross-type name collisions in the dry-run report as review items (not hard blocks) — following Phase 1's own precedent for this exact situation.
**Warning signs:** Seed script insert errors referencing the unique index during a test-DB rehearsal, or (the opposite failure) a seeded product silently reusing an unrelated `stored`/`inventory` product's identity.

### Pitfall 3: Store defaults hardcoded from the phase doc's guesses instead of the real `stores` collection

**What goes wrong:** The phase doc's §4.2 store-default table only knew of `safeway` and `costco` (its two guessed defaults). The live `stores` collection actually has **four** records: `safeway`, `costco`, `trader joes`, `online` [VERIFIED: `GET http://192.168.50.95:8090/api/collections/stores/records`, 2026-07-07]. A category→store mapping built only from the phase doc would never route anything to `trader joes` or `online`, even where they're the better fit (e.g., specialty/international items, or items with no other clean section/store default).
**How to avoid:** Resolve store relations by **name lookup against the live `stores` collection at seed-script runtime** (as the phase doc already specifies architecturally — "sections/stores are existing PocketBase relations resolved by name during seeding"), and when designing the category/keyword→store default table, explicitly consider all four stores, not just two.
**Warning signs:** None of the seeded products ever get `store = trader joes` or `store = online` even where a manual reviewer would expect it.

### Pitfall 4: Foundation Foods vs SR Legacy energy/coverage tradeoff during the join

**What goes wrong:** Preferring SR Legacy matches over Foundation Foods matches (or vice versa) inconsistently across the seed can produce macro data of mixed rigor with no clear provenance signal.
**How to avoid:** Pick one deterministic priority order (this research recommends Foundation Foods first — lab-analyzed, higher rigor per CONTEXT's own framing — then SR Legacy as the broader fallback) and always record which one matched via `usda_data_type`, so a future nutrition UI (NUTR-01) can distinguish data quality if it ever matters.
**Warning signs:** None currently — this is a forward-looking consistency concern, not a bug that manifests immediately.

## Code Examples

### PocketBase schema change convention (this project's established pattern — no migrations directory)

```
// NOT code — this project's schema-as-code story, verified from Phase 1's
// own research + summaries (01-RESEARCH.md, 01-07-PLAN.md, 01-08-SUMMARY.md):
//
// 1. Add each new field via the PocketBase Admin UI, on BOTH instances:
//    prod  http://192.168.50.95:8090/_/
//    test  http://192.168.50.95:8091/_/
//    (apply to test first, rehearse, then prod — same order both times)
// 2. Re-export the schema from prod (the live source of truth) to
//    pb_schema.json (NOT pb_schema_updated.json — that file was deleted and
//    consolidated during Phase 1's Plan 08).
// 3. Extend src/lib/types.ts's Product interface with the new optional
//    fields, matching the schema exactly.
//
// There is no pb_migrations/ directory; sync-to-test.js copies RECORDS, not
// schema (confirmed by direct code inspection in 01-RESEARCH.md).
```

```typescript
// src/lib/types.ts — extend Product (currently ends at store_bought_product?, line 59)
export interface Product extends BaseRecord {
  // ...existing fields unchanged...
  fdc_id?: number;
  usda_data_type?: "foundation_food" | "sr_legacy" | "";
  usda_category?: string;
  nutrient_basis_g?: number;
  kcal?: number;
  protein_g?: number;
  fat_g?: number;
  carb_g?: number;
}
```

### USDA nutrient IDs for the macro backfill (schema only — no UI, per D-07)

```
1008 = Energy (kcal)         — see Pitfall 1 for the Foundation-Foods caveat
1003 = Protein (g)
1004 = Total lipid / fat (g)
1005 = Carbohydrate, by difference (g)
```
[CITED: fdc.nal.usda.gov nutrient documentation + `food_nutrient.csv` column structure (`fdc_id`, `nutrient_id`, `amount`, per 100g) — synthesized via WebSearch, standard/stable USDA nutrient numbering]

## State of the Art

| Old Approach (phase doc) | Current Approach (this research) | When Changed | Impact |
|---------------------------|-----------------------------------|---------------|--------|
| Seed from renamed USDA Foundation Foods descriptions (~800 items assumed) | Seed from an external plain-name catalog, joined to USDA only for `fdc_id`/macros | This discussion (D-01, 2026-07-06) | Foundation Foods alone yields <150 net-new products after dedup — insufficient breadth; the rename step is no longer the seed's job, only the join's |
| "~800 USDA Foundation Foods" language in REG-01/ROADMAP | Breadth comes from the external catalog; USDA is a join target, not the source of the count | Same | REQUIREMENTS.md's REG-01 wording is now inaccurate (flagged by CONTEXT.md) — planner should not treat "800" as a target count |
| Assumed 2 stores (safeway, costco) for default-store mapping | 4 real stores (safeway, costco, trader joes, online) | Verified live 2026-07-07 | Category→store table should route specialty/international/no-fit items to `trader joes`/`online` rather than defaulting everything to safeway/costco |
| "unique index on products.name" (prose in phase doc + CONTEXT.md) | Composite unique index on `(name COLLATE NOCASE, type)` | Verified live 2026-07-07 from `pb_schema.json` | Dedup only needs to check the 121 `raw` products; cross-type name collisions are a soft review flag, not a hard block |

**Deprecated/outdated:**
- USDA's Foundation-Foods-specific dropping of nutrient ID 1008 in favor of Atwater-factor-specific energy IDs (2047/2048) is a documented, recent USDA methodology change — not deprecated exactly, but a gotcha for any macro-backfill code that assumes 1008 is universal.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Open Food Facts categories taxonomy is the best available external plain-name catalog for this phase's purpose | Summary, Standard Stack (Alternatives) | If the filtering/curation cost turns out too high in practice, the planner should be ready to fall back to a hand-curated static list without re-researching — both options are documented here |
| A2 | Expected name→FDC join coverage against SR Legacy + Foundation Foods for a household-staple catalog is "high" (informal estimate, no measurement performed this session) | Summary | If actual coverage is much lower than expected, more products seed with `fdc_id = null` than desired — still a valid state per D-02, but reduces REG-04's practical value until a later pass. The seed script's dry-run/report mode (Claude's discretion, already planned) should surface the real match rate before any prod write, mitigating this risk directly |
| A3 | A conservative fuzzy-match threshold (~0.2 Fuse score) is tight enough to avoid false auto-skips while catching true near-duplicates for review | Architecture Patterns (Pattern 3) | Miscalibrated threshold either buries genuine misses under false "near-match, skip" flags, or misses real near-dupes; tune against the actual seed list during a test-DB dry run before the prod run, same as Phase 1's rehearsal discipline |
| A4 | Foundation Foods should be preferred over SR Legacy when both match, for macro rigor | Common Pitfalls (Pitfall 4) | Low risk — either order is defensible; this is a consistency preference, not a correctness requirement |

**If this table is empty:** N/A — see above; the external-catalog choice and coverage estimate are the phase's genuine open unknowns and are exactly why CONTEXT.md marked them "Open Questions for Research" rather than locked decisions.

## Open Questions

1. **Exact external catalog + curation method (Open Question 1, unresolved)**
   - What we know: Open Food Facts categories taxonomy (`categories.json`/`categories.txt`, ODbL license) is real, large, actively maintained, and includes an English name + parent/child hierarchy per category node [VERIFIED: direct fetch of `static.openfoodfacts.org/data/taxonomies/categories.json`, 2026-07-07]. It is NOT purpose-built as a "clean household ingredient list" — it mixes branded/regional/PDO-style entries (e.g. `fr:pommard-les-pezerolles`) with generic ones (e.g. `en:tomatoes`), so reaching a few-hundred-to-800 clean list requires a filtering pass (English-only, specific top-level branches like `en:vegetables`/`en:fruits`/`en:meats`/`en:dairies`/`en:cereals-and-potatoes`/`en:fats`, leaf-level generic nodes only) plus manual review.
   - What's unclear: whether that filtering pass is cheaper than simply hand-authoring (with LLM assistance) a curated ~400-800-item list directly organized into the 8 existing sections, given the project is a single-user personal app, not a public dataset consumer.
   - Recommendation: the planner should treat this as a first-task decision point in the phase plan itself (e.g., a `checkpoint:human-verify` or a short spike task comparing "OFF-derived + filtered" vs "hand-curated" for a 50-item sample before committing to the full build), rather than something this research session can settle definitively without doing the actual curation work.

2. **Expected name→FDC join coverage (Open Question 2, partially resolved)**
   - What we know: the join should use the bulk CSV/JSON downloads (public domain / CC0 [VERIFIED via WebSearch synthesis of USDA's own stated terms], no rate limit), matching Foundation Foods first then SR Legacy, via normalized-name + conservative fuzzy match reusing the D-05 `fuse.js` module.
   - What's unclear: the actual match rate against whatever final external-catalog names are chosen — this can only be measured empirically once Open Question 1 is settled and the seed list exists.
   - Recommendation: build the dry-run/report mode (already Claude's discretion per CONTEXT.md) to surface this number before any prod write; treat a low match rate as acceptable (D-02 explicitly allows null `fdc_id`) rather than a blocker.

3. **Category→section keyword map for the external catalog (Open Question 3, approach resolved, table not yet built)**
   - What we know: the phase doc's USDA-`foodCategory`→section table doesn't apply once the seed source changes (D-01). The same *shape* of table (a small keyword/prefix map, unmapped → null, corrected at first use, per D-04's established pattern for `frozen`/`international`) should be rebuilt against whichever catalog's own category taxonomy is chosen. Store defaults should route across all 4 real stores (`safeway`, `costco`, `trader joes`, `online` — verified above), not just 2.
   - What's unclear: the concrete mapping table itself, which depends on Open Question 1's resolution.
   - Recommendation: build the section/store keyword map as part of `build-usda-seed.js`, spot-checked the same way the phase doc's §4.2 already specifies (20-item spot check, confirm a mix of dimensions/sections appears, no hard count assertion).

4. **Quick-create's existing "unit required" validation vs Search-USDA pre-fill**
   - What we know: `QuickCreateProductDialog.tsx`'s `isValid` currently requires `unit !== ""` (a manual `Select`) [VERIFIED: direct read of `QuickCreateProductDialog.tsx:67`]. Search-USDA pre-fill (D-06) supplies `name`/section/`fdc_id` from the bundled SR-Legacy index, but SR Legacy carries no purchase-unit concept (same reason Foundation Foods didn't, per the phase doc's own §3 reasoning) — so `canonical_unit` cannot be auto-filled from the USDA match itself.
   - What's unclear: whether Search-USDA selection should (a) leave the unit `Select` for the user to fill manually (simplest, no new logic), or (b) attempt the same keyword→canonical_unit map used in seeding (adds logic to a component that currently has none).
   - Recommendation: (a) is simpler and consistent with quick-create's "ruthlessly minimal" design intent already documented in the component's own comments — the planner should default to leaving unit manual unless a strong reason emerges during discuss-phase-level design.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| PocketBase prod (`192.168.50.95:8090`) | Seed script final run, schema migration | ✓ [VERIFIED: reachable, 291 products confirmed via live `GET`, 2026-07-07] | — | — |
| PocketBase test (`192.168.50.95:8091`) | Seed script rehearsal (test-DB-first per established Phase 1 discipline) | Not probed this session (assume reachable, matches prod's network path per Phase 1 precedent) | — | If unreachable, this blocks the mandatory test-first rehearsal — verify at plan-execution time |
| Node.js / npm | All new scripts, `fuse.js` install | ✓ (project already builds/runs via `npm`/`vite`/`vitest`) | — | — |
| Network access to `fdc.nal.usda.gov` (one-time bulk download) | Acquiring Foundation Foods + SR Legacy bulk CSV/JSON | Assumed available on the dev machine (not probed — this is a one-time offline download, not a runtime dependency) | — | If blocked, USDA data mirrors exist on Kaggle/Ag Data Commons (e.g. `agdatacommons.nal.usda.gov`) as a fallback source for the same public-domain data |
| Network access to an external catalog source (OFF or similar), if that path is chosen | Acquiring the seed's plain-name breadth (Open Question 1) | `static.openfoodfacts.org` confirmed reachable this session | — | Hand-curated static list requires no network dependency at all |

**Missing dependencies with no fallback:** none identified.

**Missing dependencies with fallback:** USDA bulk data (Kaggle/Ag Data Commons mirrors exist); external catalog (hand-curated list fallback, see Open Question 1).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest` (already configured — `vitest.config.ts`, `npm test` → `vitest run`) [VERIFIED: `package.json`, repo file listing] |
| Config file | `recipe-planner/vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/search/product-search.test.ts` |
| Full suite command | `npm test` (repo root: `recipe-planner/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| REG-01 | Seed produces non-null `fdc_id` where matched, zero case-insensitive-and-type duplicates against existing `raw` products | integration (script dry-run against test DB) | `PB_URL=http://192.168.50.95:8091 node scripts/seed-usda.js --dry-run` | ❌ Wave 0 — script doesn't exist yet |
| REG-02 | `searchProducts("paste tomato", …)` ranks "tomato paste" first; `searchProducts("garbonzo", …)` matches "garbanzo" | unit | `npx vitest run src/lib/search/product-search.test.ts` | ❌ Wave 0 |
| REG-03 | Search-USDA mode returns candidates and creates a product with `fdc_id` + `usda_data_type = "sr_legacy"` | unit/manual | `npx vitest run src/lib/usda/usda-lookup.test.ts` (index-search logic); the dialog's create flow is UI-manual per this project's existing UAT convention | ❌ Wave 0 for the unit test; manual UAT for the dialog itself (consistent with how Phase 2's quick-create was verified) |
| REG-04 | Schema has nullable `fdc_id`/`usda_*`/nutrition fields; existing 291 products still load without error | manual/smoke (PocketBase Admin UI + `Products.tsx` load) | No automated command — schema changes in this project are verified by loading the registry page and checking the PB Admin UI, per Phase 1's established pattern (no migrations dir, no schema-test harness) | N/A — manual-only by established convention |

### Sampling Rate

- **Per task commit:** run the relevant new unit test file (`product-search.test.ts`, `usda-lookup.test.ts`) via `npx vitest run <file>`.
- **Per wave merge:** `npm test` (full suite) — must stay green; this phase adds files but should not break existing suites (`units.test.ts`, `linter.test.ts`, aggregation tests, etc.).
- **Phase gate:** full suite green + the seed script's dry-run report reviewed by the user before any prod write (mirrors Phase 1's mandatory human-reviewed dedup step).

### Wave 0 Gaps

- [ ] `src/lib/search/product-search.test.ts` — covers REG-02's two behavior cases
- [ ] `src/lib/usda/usda-lookup.test.ts` — covers REG-03's search-index logic
- [ ] `scripts/seed-usda.js` dry-run/report mode — no test file needed, but the report itself is the verification artifact for REG-01 (same convention as Phase 1's `scripts/dedup-output/`)
- [ ] Framework install: none — `vitest` already configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No | Single-user self-hosted app; PocketBase superuser creds already gitignored (`.env.local`), no new auth surface introduced |
| V3 Session Management | No | No new session concept introduced |
| V4 Access Control | No | No new access-control surface; existing PocketBase collection rules unchanged by this phase |
| V5 Input Validation | Yes | Seed script inputs are offline/local (bulk downloads, catalog export) — not user-facing at write time, but the "Search USDA" quick-create path IS user-facing: validate/trim the free-text query before it hits the fuzzy index (already implicit in `searchProducts`'s empty-query passthrough) |
| V6 Cryptography | No | No new secrets beyond the existing gitignored PB superuser credential convention (already established, not new to this phase) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Malformed/oversized external data files (bulk USDA download, external catalog export) causing a script crash or resource exhaustion during offline processing | Denial of Service (low severity — offline dev-machine script, not a running service) | Standard `JSON.parse`/CSV-parse error handling in the build scripts; not a runtime-exposed attack surface since these are one-time offline data-prep steps, not endpoints |
| Committing the PocketBase superuser credential into the repo while writing the new seed script | Information Disclosure | Reuse the existing gitignored `.env.local` convention from Phase 1's merge scripts — do not introduce a new credential-handling pattern |

This phase introduces no new user-facing write surface beyond quick-create (already existing, already validated in Phase 2) and no new auth/session/crypto concerns — the security-relevant work is entirely about not accidentally widening the existing credential-handling and data-validation posture, not building new controls.

## Sources

### Primary (HIGH confidence)

- Direct codebase reads (2026-07-07): `pb_schema.json` (`products` collection `pbc_7402169584` — composite unique index, existing fields), `src/lib/types.ts`, `src/pages/registries/Products.tsx`, `src/pages/RecipeEditor.tsx`, `src/components/ProductForm.tsx`, `src/components/outputs/ShopSwapDialog.tsx`, `src/components/outputs/QuickCreateProductDialog.tsx`, `scripts/find-duplicates.js`, `package.json`
- Direct live-data verification (2026-07-07): `GET http://192.168.50.95:8090/api/collections/{products,stores,sections}/records` — 291 total products (121 raw/69 transient/57 stored/44 inventory), 4 stores, 8 sections, confirmed no `fdc_id`/nutrition fields yet exist on prod
- `npm view fuse.js version` / `npm view match-sorter version` — 7.4.2 / 8.3.0 respectively
- `gsd-tools query package-legitimacy check --ecosystem npm fuse.js match-sorter` — both OK, download counts, canonical repos
- Prior-phase research/summaries: `.planning/phases/01-data-hygiene/01-RESEARCH.md`, `01-07-PLAN.md`, `01-08-SUMMARY.md`, `01-CONTEXT.md` — PocketBase's no-migrations-directory schema convention, cross-type dedup precedent
- [USDA FoodData Central Downloadable Data page](https://fdc.nal.usda.gov/download-datasets/) — verified via direct WebFetch: Foundation Foods (467K/3.4M zipped JSON/CSV), SR Legacy (12.3M/6.7M zipped JSON/CSV), FNDDS, Branded, Full Download sizes

### Secondary (MEDIUM confidence)

- [Open Food Facts GitHub org](https://github.com/openfoodfacts), [taxonomy-editor repo](https://github.com/openfoodfacts/taxonomy-editor), [Global categories taxonomy wiki](https://wiki.openfoodfacts.org/Global_categories_taxonomy) — ODbL license, taxonomy structure, confirmed via WebSearch + direct fetch of `static.openfoodfacts.org/data/taxonomies/categories.json`
- [Fuse.js docs](https://www.fusejs.io/), [Fuse.js GitHub](https://github.com/krisk/fuse), [match-sorter GitHub](https://github.com/kentcdodds/match-sorter) — config options, ranking behavior, via WebSearch synthesis
- USDA nutrient ID numbering (1008/1003/1004/1005) and the Foundation-Foods 1008-deprecation note — via WebSearch synthesis of `fdc.nal.usda.gov` FAQ/nutrient-list content and community-maintained USDA data-wrangling repos
- USDA CC0/public-domain terms — via WebSearch synthesis (not a direct fetch of a dedicated terms-of-use page)

### Tertiary (LOW confidence)

- Instacart Market Basket dataset, GroceryDB, Mealie's ingredient-labels discussion, `drriley/grocery` — evaluated and explicitly rejected/deprioritized as seed-source candidates (branded-product shape, non-commercial license restriction, no bundled dataset, or too small — see reasoning in Summary/Standard Stack); not used as sources for any claim in this document, listed here only for completeness of the search performed

## Metadata

**Confidence breakdown:**
- Standard stack (fuse.js pick, version, legitimacy): HIGH — directly verified via npm + package-legitimacy tool
- Schema/dedup mechanics (composite index, 291/121 split, 4 stores, no-migrations convention): HIGH — directly verified against live `pb_schema.json` and live PocketBase API
- USDA bulk data facts (file sizes, CC0 license, nutrient IDs, Foundation-Foods 1008 caveat): HIGH-MEDIUM — verified via direct WebFetch of the official download page; nutrient-ID and license specifics are WebSearch-synthesized, not fetched from a single authoritative page
- External catalog choice (Open Question 1) and join coverage estimate: MEDIUM-LOW — reasoned recommendation with a documented, real alternative (OFF categories taxonomy) and an explicit fallback (hand-curated list), but not empirically resolved this session; correctly flagged as an open question rather than a locked recommendation

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (30 days — stack/schema facts are stable; USDA bulk-download URLs/sizes and OFF taxonomy contents may shift on their own release cadences, re-verify file sizes before the actual download if this research is consumed after that window)
