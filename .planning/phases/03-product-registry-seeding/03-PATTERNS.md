# Phase 3: Product Registry Seeding - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 9 (new + modified)
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `recipe-planner/scripts/build-usda-seed.js` | utility (offline data-prep) | batch/transform | `recipe-planner/scripts/find-product-matches.js` (client boilerplate) + `find-duplicates.js` (grouping/report shape) | role-match |
| `recipe-planner/scripts/seed-usda.js` | utility (batch DB writer) | batch (idempotent insert/backfill) | `recipe-planner/scripts/find-duplicates.js` (dedup grouping, report artifacts) | role-match |
| `recipe-planner/scripts/build-usda-search-index.js` | utility (offline data-prep) | transform | `recipe-planner/scripts/find-duplicates.js` (structure only: read → transform → write JSON) | partial-match |
| `recipe-planner/src/lib/search/product-search.ts` | utility (search module) | transform (in-memory query) | none — net-new capability | no analog |
| `recipe-planner/src/lib/usda/usda-lookup.ts` | service (static-asset lookup) | request-response (in-memory) | `recipe-planner/src/lib/search/product-search.ts` (itself, once built) | role-match (sibling) |
| `recipe-planner/src/lib/types.ts` (MODIFY) | model | CRUD (schema mirror) | itself — extend `Product` interface in place | exact |
| `recipe-planner/src/pages/registries/Products.tsx` (MODIFY) | component | request-response (client filter) | itself — replace `filteredItems` useMemo body | exact |
| `recipe-planner/src/pages/RecipeEditor.tsx` (MODIFY, 2 sites) | component | request-response (client filter) | itself — add `filterOptions` to two `Autocomplete`s | exact |
| `recipe-planner/src/components/ProductForm.tsx` (MODIFY) | component | request-response (client filter) | itself — replace `potentialDuplicates` useMemo body | exact |
| `recipe-planner/src/components/outputs/ShopSwapDialog.tsx` (MODIFY) | component | request-response (client filter) | `recipe-planner/src/pages/RecipeEditor.tsx` Autocomplete (same `filterOptions` wiring) | exact |
| `recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx` (MODIFY, add "Search USDA" tab) | component | request-response + file-I/O (static asset) | itself (extend existing minimal dialog) | role-match |

## Pattern Assignments

### `recipe-planner/scripts/build-usda-seed.js` (utility, batch/transform)

**Analog:** `recipe-planner/scripts/find-duplicates.js` + `find-product-matches.js`

**PocketBase client boilerplate** (`find-product-matches.js:1-10`, `find-duplicates.js:1-12`):
```javascript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this same script be pointed at test (:8091) instead of prod (:8090)
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";
const pb = new PocketBase(PB_URL);
```
Note: `find-product-matches.js` hardcodes the URL directly (`new PocketBase("http://192.168.50.95:8090")`) with no env override — `find-duplicates.js`'s `PB_URL` env-override pattern is the one to copy (needed for D-06's test-first rehearsal against `:8091`).

**Case-insensitive name grouping** (`find-duplicates.js:56-63`):
```javascript
const nameGroups = new Map();
products.forEach((p) => {
  const name = p.name.toLowerCase();
  if (!nameGroups.has(name)) nameGroups.set(name, []);
  nameGroups.get(name).push(p);
});
```

**Report artifact output pattern** (`find-duplicates.js:14, 173-182`):
```javascript
const OUTPUT_DIR = path.join(__dirname, "dedup-output");
// ... build mdReport string + decisions array ...
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "dedup-report.md"), mdReport, "utf-8");
fs.writeFileSync(path.join(OUTPUT_DIR, "dedup-decisions.json"), JSON.stringify(decisions, null, 2), "utf-8");
```
Apply this same shape for the seed's dry-run report (Claude's discretion, CONTEXT.md) — e.g. `scripts/seed-output/seed-report.md` + `seed-report.json` showing match-rate stats and SKIP_REVIEW entries.

**Error handling / entrypoint** (`find-duplicates.js:240-244`):
```javascript
main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
```

---

### `recipe-planner/scripts/seed-usda.js` (utility, batch idempotent writer)

**Analog:** `recipe-planner/scripts/find-duplicates.js` (dedup/grouping shape) — RESEARCH.md Pattern 3 already supplies a concrete draft implementation (see `03-RESEARCH.md` lines 276-326), which should be treated as the primary template:

```javascript
// scripts/seed-usda.js (from RESEARCH.md Pattern 3 — extends find-duplicates.js's
// PB-client boilerplate + grouping convention)
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
    if (!exact.fdc_id) {
      await pb.collection("products").update(exact.id, {
        fdc_id: seedRow.fdc_id,
        usda_data_type: seedRow.usda_data_type,
        usda_category: seedRow.usda_category,
      });
    }
    continue; // never auto-merge beyond the backfill
  }

  const nearMatches = searchProducts(seedRow.name, existingRaw)
    .filter((r) => r.score !== undefined && r.score < 0.2);
  if (nearMatches.length > 0) {
    report.push({ seedRow, nearMatches, action: "SKIP_REVIEW" });
    continue;
  }

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

**Critical scoping detail (verified against `pb_schema.json`):** the hard-dedup query MUST filter `type = "raw"` (121 records), not all 291 — the unique index is composite on `(name COLLATE NOCASE, type)`. Cross-type name collisions are a soft review flag (mirror `find-duplicates.js:91-99`'s `crossTypeCollisions` quarantine section), not a hard block.

**Report/entrypoint conventions:** copy `find-duplicates.js`'s `main().catch(...)` error handler and `--dry-run`-style gating (support a dry-run mode that never writes, per CONTEXT.md's "dry-run/report mode" discretion item) before the real prod run.

---

### `recipe-planner/scripts/build-usda-search-index.js` (utility, transform)

**Analog:** `recipe-planner/scripts/find-duplicates.js` (read → transform → write-JSON shape only; no PocketBase dependency needed here since input is the USDA bulk file, output is a static asset).

Structure: read bulk SR-Legacy JSON/CSV → map to `{name, foodCategory, fdc_id}` → `JSON.stringify` → write to `recipe-planner/src/assets/usda-sr-legacy.json` (or `public/`), gzip per D-06 (~150-250KB target). No PocketBase client needed in this script.

---

### `recipe-planner/src/lib/search/product-search.ts` (utility, no analog — net new)

Fully specified in RESEARCH.md Architecture Patterns → Pattern 1 (concrete implementation using `fuse.js`, sorted-token trick for word-order independence). Use verbatim as the base implementation:

```typescript
// src/lib/search/product-search.ts
import Fuse, { type IFuseOptions } from "fuse.js";
import type { Product } from "../types";

interface SearchableProduct extends Product {
  _sortedTokens: string;
}

function toSortedTokens(name: string): string {
  return name.toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");
}

const FUSE_OPTIONS: IFuseOptions<SearchableProduct> = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "_sortedTokens", weight: 0.4 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
};

export function searchProducts(query: string, products: Product[]): Product[] {
  if (!query.trim()) return products;
  const indexed: SearchableProduct[] = products.map((p) => ({
    ...p,
    _sortedTokens: toSortedTokens(p.name),
  }));
  const fuse = new Fuse(indexed, FUSE_OPTIONS);
  return fuse.search(query).map((result) => result.item);
}
```

**Test file convention:** `src/lib/search/product-search.test.ts` — follow the existing `vitest` convention used by `src/lib/units.test.ts`/`linter.test.ts` (co-located `*.test.ts`, `npx vitest run <file>`).

---

### `recipe-planner/src/lib/usda/usda-lookup.ts` (service, static-asset lookup)

**Analog:** the sibling `product-search.ts` module — same `fuse.js` wrapper shape, but indexed over the bundled `usda-sr-legacy.json` asset instead of live `Product[]`. Reuse the identical `Fuse` config/options; the only difference is the input array shape (`{name, foodCategory, fdc_id}` instead of `Product`).

```typescript
// src/lib/usda/usda-lookup.ts (sketch — mirrors product-search.ts's Fuse wrapper)
import Fuse from "fuse.js";
import usdaIndex from "../../assets/usda-sr-legacy.json"; // or fetch() if not statically imported

interface UsdaEntry {
  name: string;
  foodCategory: string;
  fdc_id: number;
}

const fuse = new Fuse<UsdaEntry>(usdaIndex, {
  keys: ["name"],
  threshold: 0.35,
  ignoreLocation: true,
});

export function searchUsda(query: string): UsdaEntry[] {
  if (!query.trim()) return [];
  return fuse.search(query).map((r) => r.item);
}
```

---

### `recipe-planner/src/lib/types.ts` (MODIFY — model)

**Exact location:** `Product` interface, currently lines 44-60, ends at `store_bought_product?: string;` (line 59).

**Current interface** (lines 44-60):
```typescript
export interface Product extends BaseRecord {
  name: string;
  type: ProductType;
  pantry?: boolean;
  track_quantity?: boolean;
  store?: string;
  section?: string;
  storage_location?: StorageLocation;
  container_type?: string;
  canonical_unit?: Unit;
  dimension?: Dimension;
  ready_to_eat?: boolean;
  meal_slot?: "snack" | "meal";
  source_recipe?: string;
  store_bought_product?: string;
}
```

**Fields to add** (per D-07/REG-04, RESEARCH.md Code Examples):
```typescript
  fdc_id?: number;
  usda_data_type?: "foundation_food" | "sr_legacy" | "";
  usda_category?: string;
  nutrient_basis_g?: number;
  kcal?: number;
  protein_g?: number;
  fat_g?: number;
  carb_g?: number;
```
All nullable/optional — the existing 291 products stay valid with no migration needed on the TS side (schema itself needs the PocketBase Admin-UI field additions on both `:8090` and `:8091`, per the project's no-`pb_migrations/`-directory convention documented in RESEARCH.md).

---

### `recipe-planner/src/pages/registries/Products.tsx` (MODIFY — component)

**Current substring filter** (lines 71, 98-106):
```typescript
const [searchQuery, setSearchQuery] = useState("");
// ...
const filteredItems = useMemo(() => {
  if (!searchQuery.trim()) {
    return items;
  }
  const query = searchQuery.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(query));
}, [items, searchQuery]);
```

**Replacement:**
```typescript
import { searchProducts } from "../../lib/search/product-search";
// ...
const filteredItems = useMemo(() => {
  return searchProducts(searchQuery, items);
}, [items, searchQuery]);
```
Note `filteredItems` operates on `ProductExpanded[]` (extends `Product`), compatible with `searchProducts(query: string, products: Product[])`.

---

### `recipe-planner/src/pages/RecipeEditor.tsx` (MODIFY — component, 2 sites)

**Site 1** — main product picker, `Autocomplete` at lines 900-904 (no `filterOptions`, default MUI substring):
```typescript
<Autocomplete
  options={products}
  value={selectedProduct}
  onChange={(_, newValue) => setSelectedProduct(newValue)}
  getOptionLabel={(option) => option.name}
  ...
```
**Site 2** — "Edit Product Node" dialog `Autocomplete` at lines 1144-1148, identical shape.

**Wiring to add at both sites** (per RESEARCH.md Pattern 2):
```typescript
<Autocomplete
  options={products}
  filterOptions={(options, { inputValue }) => searchProducts(inputValue, options)}
  value={selectedProduct}
  onChange={(_, newValue) => setSelectedProduct(newValue)}
  getOptionLabel={(option) => option.name}
  // ...renderInput, renderOption unchanged
/>
```
Import `searchProducts` from `../lib/search/product-search` once at top of file, reuse for both sites.

---

### `recipe-planner/src/components/ProductForm.tsx` (MODIFY — component)

**Current naive dup-check** (lines 229-258):
```typescript
const potentialDuplicates = useMemo(() => {
  if (!form.name.trim() || form.name.trim().length < 2) {
    return [];
  }
  const searchTerm = form.name.toLowerCase().trim();
  return existingProducts
    .filter((product) => {
      if (editingProductId && product.id === editingProductId) {
        return false;
      }
      const productName = product.name.toLowerCase();
      return (
        productName.includes(searchTerm) || searchTerm.includes(productName)
      );
    })
    .slice(0, 5);
}, [form.name, existingProducts, editingProductId]);

const hasExactMatch = useMemo(() => {
  const searchTerm = form.name.toLowerCase().trim();
  return potentialDuplicates.some(
    (product) => product.name.toLowerCase() === searchTerm
  );
}, [form.name, potentialDuplicates]);
```

**Replacement** (keep the `editingProductId` exclusion and `hasExactMatch` logic; swap only the matching mechanism):
```typescript
const potentialDuplicates = useMemo(() => {
  if (!form.name.trim() || form.name.trim().length < 2) {
    return [];
  }
  const candidates = existingProducts.filter(
    (product) => !(editingProductId && product.id === editingProductId)
  );
  return searchProducts(form.name, candidates).slice(0, 5);
}, [form.name, existingProducts, editingProductId]);

// hasExactMatch unchanged — still does its own exact-match string compare
// against potentialDuplicates for the "already exists" hard-stop UI cue.
```

---

### `recipe-planner/src/components/outputs/ShopSwapDialog.tsx` (MODIFY — component)

**Current `Autocomplete`** (lines 298-324, no `filterOptions`, has `groupBy`):
```typescript
<Autocomplete
  options={replacementProducts}
  value={replacementProduct}
  onChange={(_, newValue) => setReplacementProduct(newValue)}
  getOptionLabel={(option) => option.name}
  groupBy={(option) => option.type}
  renderInput={(params) => (
    <TextField {...params} label="Replacement Product" placeholder="Select a product..." margin="dense" fullWidth />
  )}
  renderOption={(props, option) => (
    <li {...props} key={option.id}>
      <Box display="flex" alignItems="center" gap={1}>
        <ProductIcon sx={{ color: TYPE_COLORS[option.type] || "#999" }} fontSize="small" />
        {option.name}
      </Box>
    </li>
  )}
/>
```
**Add** `filterOptions={(options, { inputValue }) => searchProducts(inputValue, options)}` — same wiring as RecipeEditor sites. `groupBy` and `renderOption` stay unchanged.

---

### `recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx` (MODIFY — add "Search USDA" tab, D-06/REG-03)

**Current minimal dialog** (whole file, 187 lines) — fields are exactly `name` (TextField), `store`/`section` (Select), `unit` (required Select, line 67: `const isValid = name.trim().length > 0 && unit !== "";`). On successful create (lines 69-93) it POSTs directly via `create<Product>(collections.products, {...})` then calls `onCreated(created)` and closes.

**Extension pattern:** add a tab/mode toggle (e.g., MUI `Tabs`) between "Manual" (existing form, unchanged) and "Search USDA" (new). The USDA tab wires a `TextField` + results list through `searchUsda()` from `usda-lookup.ts`; selecting a result pre-fills `name`, a category-derived `sectionId`, and stores the matched `fdc_id`/`usda_data_type = "sr_legacy"` in local state for the `create()` payload. Per RESEARCH.md Open Question 4: **leave `unit` manual** (no auto-fill attempt) — SR Legacy carries no purchase-unit concept, and this keeps the dialog's existing "ruthlessly minimal" intent (see comment block lines 30-35) intact. The `isValid` gate (line 67) stays `name.trim().length > 0 && unit !== ""` unchanged regardless of which tab supplied the name.

**Create payload extension** (lines 74-80), add the three USDA fields when sourced from Search-USDA:
```typescript
const created = await create<Product>(collections.products, {
  name: name.trim(),
  type: ProductType.Raw,
  store: storeId || undefined,
  section: sectionId || undefined,
  canonical_unit: unit as Unit,
  fdc_id: selectedUsdaMatch?.fdc_id, // undefined when manual tab used
  usda_data_type: selectedUsdaMatch ? "sr_legacy" : undefined,
});
```

**Error-handling convention to preserve** (lines 83-92): dialog stays open on failure, user's input preserved, no auto-close — same copywriting-contract pattern applies to the new tab.

---

## Shared Patterns

### Client-side fuzzy search (`searchProducts`)
**Source:** `recipe-planner/src/lib/search/product-search.ts` (new, see above)
**Apply to:** `Products.tsx` (list filter), `RecipeEditor.tsx` (2× `Autocomplete filterOptions`), `ProductForm.tsx` (dup-check), `ShopSwapDialog.tsx` (`Autocomplete filterOptions`). One `fuse.js` instance shape, one import, five call sites.

### PocketBase script boilerplate
**Source:** `recipe-planner/scripts/find-duplicates.js:1-12` (ESM import, `PB_URL` env override, `pb` client)
**Apply to:** `build-usda-seed.js`, `seed-usda.js`. Both need the `PB_URL` override (test `:8091` vs prod `:8090`) for the mandatory test-first rehearsal.

### Dry-run/report artifact convention
**Source:** `recipe-planner/scripts/find-duplicates.js:14, 131-182` (`OUTPUT_DIR`, markdown report + JSON decisions skeleton, human-reviewed before any write)
**Apply to:** `seed-usda.js`'s dry-run mode — surface match-rate stats and SKIP_REVIEW entries before any prod write, mirroring Phase 1's `dedup-output/` precedent.

### Cross-type collision quarantine (not a hard block)
**Source:** `recipe-planner/scripts/find-duplicates.js:65-80, 91-99` (splits same-type merge candidates from cross-type collisions, quarantines the latter)
**Apply to:** `seed-usda.js`'s dedup resolver — scope the hard-dedup unique-index check to `type = "raw"` only (121 records), flag cross-type name collisions as a soft review item, never a hard skip/block.

### MUI Autocomplete `filterOptions` wiring
**Source:** `recipe-planner/src/pages/RecipeEditor.tsx:900-904` / `:1144-1148` (baseline, currently unwired)
**Apply to:** `RecipeEditor.tsx` (both sites) and `ShopSwapDialog.tsx:298-324` — identical `filterOptions={(options, { inputValue }) => searchProducts(inputValue, options)}` prop, no other prop changes needed.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `recipe-planner/src/lib/search/product-search.ts` | utility | transform | No existing client-side fuzzy-search module in the codebase; fully specified from RESEARCH.md instead (Pattern 1, concrete implementation provided). |

## Metadata

**Analog search scope:** `recipe-planner/scripts/`, `recipe-planner/src/lib/`, `recipe-planner/src/pages/`, `recipe-planner/src/components/` (including `components/outputs/`)
**Files scanned:** `find-duplicates.js`, `find-product-matches.js`, `merge-products.js` (boilerplate only, not read in full), `types.ts`, `Products.tsx`, `RecipeEditor.tsx`, `ProductForm.tsx`, `QuickCreateProductDialog.tsx`, `ShopSwapDialog.tsx`
**Pattern extraction date:** 2026-07-06
