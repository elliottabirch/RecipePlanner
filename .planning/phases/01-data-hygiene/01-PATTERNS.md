# Phase 1: Data Hygiene - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 15 (new + modified)
**Analogs found:** 12 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `recipe-planner/src/lib/units.ts` | utility (pure module) | transform | `recipe-planner/src/lib/aggregation/utils/product-utils.ts` | role-match (pure-fn utility module) |
| `recipe-planner/src/lib/units.test.ts` | test | transform | none (no test infra exists) | no analog |
| `recipe-planner/vitest.config.ts` | config | — | none (no test config exists) | no analog |
| `recipe-planner/src/lib/aggregation/builders/product-builder.ts` (MODIFY) | service/builder | CRUD (merge) | itself (existing file, same file) | exact — modify in place |
| `recipe-planner/src/lib/aggregation/builders/step-builder.ts` (MODIFY) | service/builder | CRUD (merge) | itself (existing file, same file) | exact — modify in place |
| `recipe-planner/src/lib/aggregation/builders/product-builder.test.ts` | test | transform | none | no analog |
| `recipe-planner/src/lib/aggregation/builders/step-builder.test.ts` | test | transform | none | no analog |
| `recipe-planner/src/lib/aggregation/types.ts` (MODIFY) | model (type defs) | — | itself | exact — modify in place |
| `recipe-planner/src/lib/aggregation.ts` (MODIFY, lines 334, 388) | service (read/derive) | transform | itself | exact — modify in place |
| `recipe-planner/src/pages/RecipeEditor.tsx` (MODIFY, lines 397-400, 485-488) | component (form/editor) | request-response | itself | exact — modify in place |
| `recipe-planner/src/components/outputs/ShoppingListTab.tsx` (MODIFY, lines 181, 191) | component | request-response | itself | exact — modify in place |
| `recipe-planner/src/lib/linter/index.ts` | service (pure rules aggregator) | transform | `recipe-planner/src/lib/aggregation/builders/product-builder.ts` (pure-function-over-collection shape) | role-match |
| `recipe-planner/src/lib/linter/rules/*.ts` (4 files) | service (pure rule fn) | transform | `recipe-planner/src/lib/aggregation/utils/product-utils.ts` (pure helper fns) | role-match |
| `recipe-planner/src/lib/linter/linter.test.ts` | test | transform | none | no analog |
| `recipe-planner/src/pages/registries/Products.tsx` (MODIFY — add Lint button/panel) | component (registry CRUD page) | CRUD + request-response | itself (existing file) | exact — modify in place |
| `recipe-planner/scripts/lint.js` | script (headless CLI) | batch | `recipe-planner/scripts/find-duplicates.js` | exact (Node one-shot script, no CLI framework, prints report) |
| `recipe-planner/scripts/find-duplicates.js` (MODIFY — emit JSON+MD) | script | batch | itself | exact — modify in place |
| `recipe-planner/scripts/merge-products.js` | script (destructive one-shot) | batch | `recipe-planner/scripts/sync-to-test.js` | role-match (multi-collection REST script with ordered dependency + failure-abort pattern) |
| `recipe-planner/scripts/backfill-units.js` | script (one-shot enrich) | batch | `recipe-planner/scripts/find-duplicates.js` | role-match (read-only-analysis Node script; same "collect+report" shape, no dependency ordering needed) |
| `recipe-planner/scripts/normalize-node-units.js` | script (one-shot mutate) | batch | `recipe-planner/scripts/sync-to-test.js` | role-match (per-record update loop with failure counting/abort) |
| `decisions.md` (MODIFY — step-aggregation wording) | docs | — | n/a | n/a (doc edit, no code analog) |
| `pb_schema_updated.json` (MODIFY — re-export) | config/schema snapshot | — | n/a | n/a (generated export, no code analog) |

## Pattern Assignments

### `recipe-planner/src/lib/units.ts` (utility, transform)

**Analog:** `recipe-planner/src/lib/aggregation/utils/product-utils.ts` (pure-function module shape; also see RESEARCH.md Pattern 1 for the concrete implementation sketch, which is authoritative for constants).

**Module shape convention** (no imports needed beyond types — pure math module, matches `product-utils.ts`'s no-side-effect style):
```typescript
// Follow this file's convention: exported pure functions, typed inputs/outputs,
// no PocketBase/React imports. JSDoc header comment block describing the module's purpose.
```

**Export/typing convention** — mirror the way `aggregation/types.ts` centralizes shared types (`Dimension`, `Unit` should live in `units.ts` itself since nothing else currently owns a "vocabulary" file; import them into `aggregation/types.ts` if `AggregatedFlowProduct.unit` gets typed as `Unit` rather than `string`).

**Concrete conversion table and function signatures:** use RESEARCH.md's `## Pattern 1` code block verbatim as the implementation baseline (`UNIT_DIMENSIONS`, `TO_ML`, `TO_G`, `getDimension`, `canConvert`, `convert`) — it is already reviewed against NIST/BIPM factors. Do not re-derive constants from scratch.

---

### `recipe-planner/src/lib/aggregation/builders/product-builder.ts` (builder, CRUD/merge) — MODIFY

**Current merge site** (lines 79-124, `addOrMergeProduct`):
```typescript
// Current blind merge (line 91) — the bug DATA-01 fixes:
const existing = products.get(key);
if (existing) {
  existing.totalQuantity += newProduct.totalQuantity;
  addMealSource(
    existing.mealSources,
    newProduct.mealSources[0].recipeName,
    newProduct.mealSources[0].quantity,
    newProduct.mealSources[0].count
  );
} else {
  products.set(key, newProduct);
}
```

**Pattern to apply:** replace the unconditional `existing.totalQuantity +=` with the convert-or-split logic from RESEARCH.md Pattern 1 (`mergeInto` sketch). Key by `lineId` (`${productId}` or `${productId}|${dimension}`) rather than bare `key` when dimensions diverge — this changes the `products.get(key)`/`products.set(key, ...)` call sites in `addOrMergeProduct` and the `key` computation in `buildAggregatedProduct` (lines 55-70).

**Existing helper-import convention** (lines 8-14) to follow for new `units.ts` imports:
```typescript
import {
  calculateProductQuantity,
  createProductKey,
  shouldCreateInstances,
  createMealSource,
  addMealSource,
} from "../utils/product-utils";
// add: import { canConvert, convert, getDimension } from "../../units";
```

---

### `recipe-planner/src/lib/aggregation/builders/step-builder.ts` (builder, CRUD/merge) — MODIFY

**Two blind-merge sites** (`addOrMergeStep`, lines 128-149):
```typescript
// Merge inputs (line 133) and outputs (line 145) — same bug, twice:
if (existingInput) {
  existingInput.quantity += input.quantity;  // BLIND — needs convert-or-split
} else {
  existing.inputs.push({ ...input });
}
// ... outputs mirror this exactly (line 145)
```

**Pattern to apply:** identical convert-or-split fix as `product-builder.ts`, applied twice (inputs array, outputs array). Strong candidate for the discretionary `mergeQuantities` shared helper (CONTEXT.md notes this refactor is implementer's choice) — if extracted, put it in `aggregation/utils/` alongside `product-utils.ts`/`step-utils.ts` following their existing pure-function-export style.

---

### `recipe-planner/src/lib/aggregation/types.ts` (model) — MODIFY

**Current `AggregatedFlowProduct`** (lines 67-79) and **`AggregatedFlowStep`** (lines 84-103) — add `lineId: string` to `AggregatedFlowProduct` and thread `containerTypeName?: string` per the RESEARCH.md sketch. Note `StoredItem` (line 158-166), `PullListItem` (line 171-177), and `MealContainer` (line 192-201) **already have `containerTypeName?: string`** — the pattern to copy is already in this same file; `AggregatedFlowProduct`/`AggregatedFlowStep` inputs/outputs are the only structs missing it.

---

### `recipe-planner/src/lib/aggregation.ts` (MODIFY, lines 334, 388)

**Current container-type-as-unit overload** (confirmed via grep):
```typescript
// line 334:
containerTypeName: product.unit, // unit is now the container type
// line 388:
containerTypeName: product.unit, // unit is the container type
```
Also line 378 keys a dedup map off `product.unit` (`${cleanName}-${product.storageLocation}-${product.unit}`) — this must switch to `containerTypeName` too, or stored-product dedup keys will break silently once `unit` stops carrying container info.

**Correct source already exists in-repo** — `RecipeEditor.tsx:384` shows the pattern for reading real container type: `productWithExpand?.expand?.container_type?.name`. `aggregation.ts` needs the equivalent: read `product.expand?.container_type?.name` (already expanded per CONTEXT.md's note that `Outputs.tsx` already expands `product.container_type`), not `product.unit`.

---

### `recipe-planner/src/pages/RecipeEditor.tsx` (MODIFY, lines 397-400, 485-488)

**Current overload write site** (both `handleSaveEditedProduct` and `handleAddProduct` are near-identical):
```typescript
// lines 397-400 and 485-488, identical pattern twice:
unit:
  selectedProduct.type === "stored"
    ? containerTypeName
    : productUnit || undefined,
```
where `containerTypeName` is already correctly derived a few lines above (line 384/474):
```typescript
const productWithExpand = products.find((p) => p.id === selectedProduct.id);
const containerTypeName = productWithExpand?.expand?.container_type?.name;
```

**Pattern to apply:** stop writing `containerTypeName` into `unit` for stored products — `unit` should always be `productUnit || undefined` (measurement-only), and container type should be read downstream from `product.container_type`, not stored on the node at all. Since this write pattern is duplicated verbatim in two handlers, consider extracting a small shared helper (matches the codebase's existing preference for shared pure helpers per `product-utils.ts`/`step-utils.ts`), though CONTEXT.md leaves this to implementer discretion.

**Unit-select conversion (§4.7):** `productUnit` is currently a free-text state (`useState`-backed `TextField` presumably) — convert to an enum `<Select>` sourced from `units.ts`'s `Unit` type. No existing enum-`<Select>` analog found in `RecipeEditor.tsx` itself; closest UI analog for a typed dropdown is `Products.tsx`'s `productForm.setStorageLocation`/`containerTypeId` `<Select>` pattern (see `ProductForm` component, not read in full — grep `ProductForm.tsx` for the `<Select>` JSX shape before implementing).

---

### `recipe-planner/src/components/outputs/ShoppingListTab.tsx` (MODIFY, lines 181, 191)

**Pattern to apply** (per RESEARCH.md Pattern 1, "Split-line identity" section): replace `item.productId` used as the React `key` and checkbox-key input with `item.lineId`:
```typescript
// was:
const key = getShoppingCheckboxKey(item.productId);
// becomes:
const key = getShoppingCheckboxKey(item.lineId);
// ...
<CheckableListItem key={item.lineId} itemKey={key} ... />
```
This is a mechanical rename at the two cited line numbers once `lineId` exists on `AggregatedProduct`/`AggregatedFlowProduct`. No further pattern extraction needed — read lines 175-195 directly at implementation time to get exact surrounding JSX.

---

### `recipe-planner/src/lib/linter/` (new module: `index.ts`, `rules/*.ts`)

**Analog:** `recipe-planner/src/lib/aggregation/utils/product-utils.ts` + `step-utils.ts` for the "pure exported function, no side effects, typed in/out" shape; RESEARCH.md's own `## Pattern 3` code block is the concrete template to copy (already written against this codebase's real `ProductExpanded` shape and `SECTION_REQUIRED_STORES` values).

**Concrete rule template** (copy directly, adjust rule name/logic per rule):
```typescript
// src/lib/linter/rules/missing-store-section.ts — from RESEARCH.md Pattern 3
const SECTION_REQUIRED_STORES = new Set(["safeway"]); // per D-04, verified live store names

export function lintMissingStoreSection(
  products: ProductExpanded[]
): LintFinding[] {
  return products
    .filter((p) => p.type !== "transient" && !p.pantry)
    .flatMap((p) => {
      const findings: LintFinding[] = [];
      if (!p.expand?.store) {
        findings.push({ severity: "error", rule: "missing-store-section", message: `${p.name}: missing store`, productId: p.id });
        return findings;
      }
      const storeName = p.expand.store.name.toLowerCase();
      if (SECTION_REQUIRED_STORES.has(storeName) && !p.expand?.section) {
        findings.push({ severity: "error", rule: "missing-store-section", message: `${p.name}: ${storeName} requires a section`, productId: p.id });
      }
      return findings;
    });
}
```

**`ProductExpanded` type to reuse:** `Products.tsx` (lines 42-48) already defines the exact expand shape the linter needs:
```typescript
interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
  };
}
```
Move this (or an equivalent) into a shared location (`src/lib/types.ts` or `linter/index.ts`) rather than duplicating — `linter/` and `Products.tsx` both need it.

**Cross-dimension rule** should import `canConvert`/`getDimension` from the new `units.ts`, mirroring how `product-builder.ts` will import it.

---

### `recipe-planner/src/pages/registries/Products.tsx` (MODIFY — add Lint button + findings panel)

**Analog:** itself — follow this file's existing `loadItems`/`useState`/dialog conventions exactly.

**Data-loading convention to extend** (lines 100-115, `loadItems`):
```typescript
const loadItems = async () => {
  try {
    setLoading(true);
    setError(null);
    const records = await getAll<ProductExpanded>(collections.products, {
      sort: "name",
      expand: "store,section,container_type",
    });
    setItems(records);
  } catch (err) {
    setError("Failed to load products");
    console.error(err);
  } finally {
    setLoading(false);
  }
};
```
Add a `runLint` handler alongside `handleSave`/`handleDeleteConfirm` that calls the linter rules against `items` (already loaded+expanded) and stores `LintFinding[]` in new state (`const [findings, setFindings] = useState<LintFinding[]>([])`), following the same `useState` + `try/catch/finally` shape as `loadItems`.

**Button convention** (lines 233-239, existing "Add Product" button) — copy this exact `<Button variant="contained" startIcon={...} onClick={...}>` shape for the new "Lint" button, placed in the same header `<Box display="flex" justifyContent="space-between">` row (lines 219-240).

**Findings panel:** no existing collapsible/dialog panel analog in this file beyond the two `<Dialog>` blocks (lines 420-451, 454-475) — reuse the `<Dialog>` pattern for a findings modal, or introduce a `<Collapse>`/inline `<Alert>` list under the search box (line 243-270 area) per CONTEXT.md's "keep it simple" discretion note. The existing `<Alert severity="error">` (lines 272-276) is the closest existing pattern for rendering error-like findings inline.

---

### `recipe-planner/scripts/lint.js` (headless script, batch)

**Analog:** `recipe-planner/scripts/find-duplicates.js` — same "connect, fetch full list, run pure analysis, console.log a report" shape.

**Connection + fetch pattern** (lines 1-6):
```javascript
import PocketBase from "pocketbase";
const pb = new PocketBase("http://192.168.50.95:8090");
async function findDuplicates() {
  const products = await pb.collection("products").getFullList({ sort: "name" });
  // ...
}
findDuplicates();
```
`lint.js` should follow this exactly, but call into the same rule functions from `src/lib/linter/` that `Products.tsx` uses (import compiled/transpiled TS via the project's existing Node/ESM setup — check how `find-duplicates.js` is invoked, e.g. `node --experimental-...` or via `tsx`, before assuming plain `node` can import `.ts` directly).

**Also apply RESEARCH.md's top-level error-guard convention** (already used by `find-duplicates.js`-adjacent scripts per RESEARCH.md's Code Examples section):
```javascript
main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
```

---

### `recipe-planner/scripts/find-duplicates.js` (MODIFY — emit JSON decisions file + MD report per D-05)

**Current output is console-only** (entire file, 111 lines) — grouping logic to reuse verbatim:
```javascript
// Exact-duplicate grouping (lines 14-19) — the base for the new JSON cluster output:
const nameCount = new Map();
products.forEach((p) => {
  const name = p.name.toLowerCase();
  if (!nameCount.has(name)) nameCount.set(name, []);
  nameCount.get(name).push(p);
});
```
**Required change per D-05/Pitfall #1:** this grouping must add a `type`-aware flag so cross-`type` collisions (the two legitimate `transient`/`stored` pairs) are separately flagged, not silently included as merge candidates. Extend to write `fs.writeFileSync` calls for both the Markdown report and a JSON skeleton (`{dupeId → survivorId, confirmed}` template) instead of only `console.log`.

---

### `recipe-planner/scripts/merge-products.js` (new)

**Analog:** `recipe-planner/scripts/sync-to-test.js` — closest existing script for "multi-collection, ordered, fail-fast, REST-based" mutation logic.

**Patterns to copy directly:**

1. **Dual-instance client setup + shared URL config** (lines 1-11):
```javascript
import PocketBase from "pocketbase";
const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};
const pbProd = new PocketBase(DB_URLS.production);
const pbTest = new PocketBase(DB_URLS.test);
```

2. **Error formatting helper** (lines 33-39) — reuse verbatim:
```javascript
function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}
```

3. **Ordered collection list + fail-fast-on-error loop** (lines 16-31, 41-68) — `merge-products.js` needs its own reference-collection list per D-07's live-enumerated set (`recipe_product_nodes.product`, `inventory_items.product`, `products.store_bought_product`, `meal_variant_overrides.replacement_product`), and should copy the "count deleted/failed, abort with thrown Error if any failure" pattern (lines 50-67) for its repoint-then-delete steps.

4. **Top-level try/catch + exit-code convention** (lines 113-132):
```javascript
try {
  await clearAllTestCollections();
  const total = await copyAllFromProd();
  console.log("...SYNC COMPLETE...");
} catch (error) {
  console.error("\n❌ SYNC FAILED:", fmtError(error));
  process.exit(1);
}
```

**New logic not present in the analog** (must be added, no existing pattern to copy): D-06's `pb.backups.create()` pre-flight call (see RESEARCH.md "Pre-flight prod snapshot" code example) and pre-flight ID validation against the JSON decisions file (D-05) before any mutation — these are genuinely new, not adaptable from `sync-to-test.js`.

---

### `recipe-planner/scripts/backfill-units.js` (new)

**Analog:** `recipe-planner/scripts/find-duplicates.js` for the read-then-report shape; `sync-to-test.js` for the "count success/failure, abort on failure" update-loop shape if the backfill writes `canonical_unit` back to `products`.

Follow `find-duplicates.js`'s `pb.collection(X).getFullList({ sort: ... })` fetch convention, then per D-08 apply the update pattern from `sync-to-test.js`'s `copyAllFromProd` loop (lines 79-103: iterate records, try/catch per record, count `copied`/`failed`, abort if `failed > 0`) — but adapted to `pb.collection("products").update(id, { canonical_unit, dimension })` calls instead of `create`.

---

### `recipe-planner/scripts/normalize-node-units.js` (new)

**Analog:** `sync-to-test.js`'s per-record update loop (same shape as `backfill-units.js` above) — this script mutates `recipe_product_nodes.unit` via the alias table in RESEARCH.md's Pitfall #2 table, reporting unresolved values (`by`, `chile`, `medium`, `28oz cans`, etc.) rather than silently dropping them, per D-08's explicit "never guessed" requirement. Copy the "count success/failed, print per-item warnings capped at N (`if (failed <= 3)`)" convention from `sync-to-test.js` lines 56-63.

## Shared Patterns

### Script scaffolding (all new/modified `scripts/*.js` files)
**Source:** `recipe-planner/scripts/find-duplicates.js` (simple/read-only) and `recipe-planner/scripts/sync-to-test.js` (mutating/multi-collection)
**Apply to:** `lint.js`, `merge-products.js`, `backfill-units.js`, `normalize-node-units.js`
- Plain `import PocketBase from "pocketbase"` + `new PocketBase(url)`, no CLI framework (yargs/commander), matching CONTEXT.md's "Established Patterns" note.
- `fmtError(e)` helper (from `sync-to-test.js` lines 33-39) for consistent error reporting — copy verbatim into any script that calls `.create/.update/.delete`.
- Fail-fast on partial failure: count successes/failures per collection, `throw new Error(...)` if any failure occurred, rather than silently continuing (see `sync-to-test.js` lines 64-67, 106-108).
- Top-level `async function main() { ... } main().catch(...)` guard (RESEARCH.md Code Examples section) to avoid raw unhandled-rejection dumps.

### Pure-function module shape (all new `src/lib/*` logic modules)
**Source:** `recipe-planner/src/lib/aggregation/utils/product-utils.ts`, `step-utils.ts`
**Apply to:** `units.ts`, `linter/index.ts`, `linter/rules/*.ts`
- Exported named functions, fully typed parameters/returns, no side effects, no PocketBase/React imports inside the pure logic files (only in the thin callers: `Products.tsx`, `scripts/lint.js`, aggregation builders).

### Container-type-as-unit overload removal (cross-cutting read+write fix)
**Source:** `RecipeEditor.tsx:384` (already-correct read pattern), applied to `aggregation.ts:334,388` and `RecipeEditor.tsx:397-400,485-488` (currently-wrong write/read sites)
**Apply to:** `aggregation.ts`, `RecipeEditor.tsx`, and any future consumer of `product.unit` on stored-type nodes
```typescript
// The one correct pattern already in the codebase — copy this expand-and-read shape everywhere `containerTypeName` is needed:
const containerTypeName = productWithExpand?.expand?.container_type?.name;
```

### Expand-based data loading (registries/detail loaders)
**Source:** `Products.tsx:100-115` (`loadItems`)
**Apply to:** any new loader in `linter`/`Products.tsx` lint-panel work that needs `store`/`section`/`container_type` expanded
```typescript
const records = await getAll<ProductExpanded>(collections.products, {
  sort: "name",
  expand: "store,section,container_type",
});
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `recipe-planner/src/lib/units.test.ts` | test | transform | No test infrastructure exists yet in the repo (confirmed: no vitest/jest, no `*.test.*` files) — RESEARCH.md's "Round-trip conversion test" code example is the template to use verbatim |
| `recipe-planner/vitest.config.ts` | config | — | No test config exists; Wave 0 must create it from scratch (minimal, no jsdom needed per RESEARCH.md) |
| `recipe-planner/src/lib/aggregation/builders/product-builder.test.ts` | test | transform | No existing builder tests; write against the modified `addOrMergeProduct`/`buildAggregatedProduct` using the white-bean-stew acceptance anchor (CONTEXT.md `specifics`) |
| `recipe-planner/src/lib/aggregation/builders/step-builder.test.ts` | test | transform | Same — no existing test to pattern-match |
| `recipe-planner/src/lib/linter/linter.test.ts` | test | transform | New module, no existing linter tests anywhere |
| `decisions.md` (step-aggregation wording fix) | docs | — | Pure prose edit; no code pattern applies — read `step-utils.ts:20-27`'s `createStepSignature` directly to get the accurate wording source of truth |
| `pb_schema_updated.json` (re-export) | config/schema snapshot | — | Mechanical re-export from PB Admin UI, not a code-pattern task |

## Metadata

**Analog search scope:** `recipe-planner/src/lib/aggregation/**`, `recipe-planner/src/lib/*.ts`, `recipe-planner/src/pages/**`, `recipe-planner/src/components/outputs/**`, `recipe-planner/scripts/**`
**Files scanned:** `product-builder.ts`, `step-builder.ts`, `aggregation/types.ts`, `aggregation.ts` (grep), `RecipeEditor.tsx` (lines 370-500), `types.ts` (lines 1-80, grep), `registries/Products.tsx` (full), `scripts/find-duplicates.js` (full), `scripts/sync-to-test.js` (full)
**Pattern extraction date:** 2026-07-05
