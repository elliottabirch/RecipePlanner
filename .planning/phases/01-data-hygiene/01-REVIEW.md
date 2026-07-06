---
phase: 01-data-hygiene
reviewed: 2026-07-06T18:05:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - recipe-planner/src/lib/units.ts
  - recipe-planner/src/lib/units.test.ts
  - recipe-planner/src/lib/types.ts
  - recipe-planner/vitest.config.ts
  - recipe-planner/scripts/apply-unit-resolutions.js
  - recipe-planner/scripts/backfill-units.js
  - recipe-planner/scripts/find-duplicates.js
  - recipe-planner/scripts/lint.js
  - recipe-planner/scripts/merge-products.js
  - recipe-planner/scripts/normalize-node-units.js
  - recipe-planner/scripts/sync-to-test.js
  - recipe-planner/src/components/outputs/ShoppingListTab.tsx
  - recipe-planner/src/lib/aggregation.ts
  - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts
  - recipe-planner/src/lib/aggregation/builders/step-builder.test.ts
  - recipe-planner/src/lib/aggregation/builders/step-builder.ts
  - recipe-planner/src/lib/aggregation/types.ts
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts
  - recipe-planner/src/lib/linter/index.ts
  - recipe-planner/src/lib/linter/linter.test.ts
  - recipe-planner/src/lib/linter/rules/cross-dimension.ts
  - recipe-planner/src/lib/linter/rules/missing-canonical-unit.ts
  - recipe-planner/src/lib/linter/rules/missing-store-section.ts
  - recipe-planner/src/lib/linter/rules/prep-words.ts
  - recipe-planner/src/pages/RecipeEditor.tsx
  - recipe-planner/src/pages/registries/Products.tsx
findings:
  critical: 1
  warning: 12
  info: 8
  total: 21
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-06T18:05:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Reviewed the Phase 1 (Data Hygiene) unit-discipline pass: the new `units.ts` conversion module and tests, the convert-or-split aggregation changes (product-builder, step-builder, product-utils, aggregation.ts), linter v1 (4 rules + two surfaces), the one-shot migration scripts, and the two touched UI pages. No hardcoded secrets found — superuser credentials are read exclusively from `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` env vars and never printed.

The conversion math, alias table, and the happy-path convert-or-split logic are correct and well-tested. However, the entire aggregation path is only type-safe on paper: raw `node.unit` strings (including the empty string, which this phase's own migration deliberately *writes* to stored-product nodes) are cast `as Unit` and fed into `convert()`, which returns **NaN instead of null** for unknown units. Two unitless quantities for the same product therefore merge into `NaN` — a silent data-loss path in the shopping list and batch-prep totals that no test covers. That is the one blocker. The rest are robustness, convention, and completeness gaps, several of which weaken the guarantees the migration scripts claim to provide.

## Critical Issues

### CR-01: Merging two unitless (or otherwise non-enum) units produces `NaN` totals — `convert()` returns NaN instead of null

**File:** `recipe-planner/src/lib/units.ts:110-126`, `recipe-planner/src/lib/aggregation/utils/product-utils.ts:43-64`, `recipe-planner/src/lib/aggregation/builders/product-builder.ts:94-104,121-143`, `recipe-planner/src/lib/aggregation/builders/step-builder.ts:132-175`, `recipe-planner/src/lib/aggregation.ts:250-261`

**Issue:** `canConvert(a, b)` compares `getDimension(a) === getDimension(b)`. For any string that is not a `Unit` (empty string, whitespace-padded unit, legacy alias), `UNIT_DIMENSIONS[unit]` is `undefined` — so **two non-enum units compare `undefined === undefined` and are declared convertible**. `convert()` then does `(qty * table[from]!) / table[to]!` with `table[from] === undefined`, returning **`NaN`, not `null`**, violating its own documented contract ("Returns null when…").

Trace of the concrete failure, using data this phase itself creates:
1. `normalize-node-units.js` intentionally clears container-type strings on stored nodes to `""`, and unitless count entries (e.g. "2 onions") have always had `unit: ""`.
2. `buildAggregatedProduct` sets `unit: node.unit || ""` (product-builder.ts:40) — raw string, never passed through `normalizeUnit`.
3. Same product appears in two planned recipes with `unit: ""` → `resolveMergeTargetKey` calls `canConvert("" as Unit, "" as Unit)` → `true` → same line.
4. `mergeQuantities("", "")` → `convert(addQty, "", "")` → `NaN` → `NaN ?? 0` is `NaN` (NaN is not nullish) → `cumulative = existingQty + NaN = NaN`.
5. The line's `totalQuantity` is `NaN`. In `ShoppingListTab.tsx:183` the falsy `NaN` silently hides the quantity (`item.totalQuantity && item.unit`); in the batch-prep list `step-builder`'s identical merge path (lines 139-171) leaves `NaN` quantities that render as "NaN".

The comment at product-builder.ts:131-132 ("merged is guaranteed non-null here") is true but beside the point — the merged *value* is NaN. The comment at aggregation.ts:247-249 ("Every source … is guaranteed to share a dimension with product.unit") is false for non-enum units. No test exercises empty or unresolved units through the merge path — every fixture uses valid `Unit` values.

**Fix:** Make `convert()` honor its contract and make dimension checks reject non-units:
```ts
// units.ts
export function getDimension(unit: Unit): Dimension | undefined {
  return UNIT_DIMENSIONS[unit]; // callers must handle undefined
}

export function canConvert(a: Unit, b: Unit): boolean {
  const da = UNIT_DIMENSIONS[a];
  const db = UNIT_DIMENSIONS[b];
  return da !== undefined && da === db;
}

export function convert(qty: number, from: Unit, to: Unit): number | null {
  if (!canConvert(from, to)) return null;
  const dim = UNIT_DIMENSIONS[from];
  if (dim === "count") return from === to ? qty : null;
  const table = dim === "volume" ? TO_ML : TO_G;
  const f = table[from];
  const t = table[to];
  if (f === undefined || t === undefined) return null;
  return (qty * f) / t;
}
```
Then in `mergeQuantities` (product-utils.ts), treat identical raw unit strings as plain addition so unitless quantities still aggregate (`"" + ""` → add, keep unit `""`), and return `null` (split, don't drop) when conversion genuinely fails — see WR-02. Add regression tests: `convert(1, "" as Unit, "" as Unit) === null`, and a product-builder test merging two nodes with `unit: ""` asserting a finite summed total.

## Warnings

### WR-01: `chooseDisplayUnit` silently relabels a quantity with the canonical unit when conversion is impossible

**File:** `recipe-planner/src/lib/units.ts:206-209`
**Issue:** `return { unit: canonicalUnit, quantity: converted ?? qty };` — when `convert()` returns null (current unit not convertible to `canonical_unit`, e.g. product data error where canonical is `cup` but node history is in `g`), the raw quantity is passed through **but labeled with the canonical unit**: 500 g becomes "500 cup" on the shopping list. This is exactly the data state the cross-dimension lint rule flags, but the linter is advisory — nothing prevents this path executing. A wrong-unit label is worse than an unconverted one.
**Fix:**
```ts
if (canonicalUnit) {
  const converted = convert(qty, currentUnit, canonicalUnit);
  if (converted !== null) return { unit: canonicalUnit, quantity: converted };
  return promoteUnit(qty, currentUnit); // keep the truthful unit
}
```

### WR-02: `mergeQuantities` silently drops the incoming quantity when conversion fails (`?? 0`)

**File:** `recipe-planner/src/lib/aggregation/utils/product-utils.ts:54-55`
**Issue:** `const cumulative = existingQty + (convertedAdd ?? 0);` — if `convert()` ever returns null after `canConvert` passed (count units, or after the CR-01 fix, junk units), the incoming quantity is **added as zero**: the shopping list under-buys with no error. Masking a failed conversion as 0 is a data-loss pattern; the function should return `null` so the caller splits the line instead.
**Fix:** `if (convertedAdd === null) return null;` before computing `cumulative`.

### WR-03: `normalize-node-units.js` never fixes whitespace-padded units, which then hit the CR-01 NaN path

**File:** `recipe-planner/scripts/normalize-node-units.js:93-98`
**Issue:** `raw` is the *trimmed* value (`(node.unit ?? "").trim()`), and the skip check is `if (canonical === raw)`. A DB value of `" cup "` trims to `"cup"`, equals its canonical form, and is counted as "Already canonical" — **the padded value is left in the database**. Downstream, aggregation uses `node.unit` verbatim (`node.unit || ""`, product-builder.ts:40) with no trim/normalize, so `" cup "` is a non-enum unit → `getDimension` undefined → the CR-01 merge corruption. A normalization script that leaves non-canonical bytes in the field defeats its purpose.
**Fix:** Compare against the stored value, not the trimmed copy:
```js
if (canonical === node.unit) { unchanged++; continue; }
```

### WR-04: `sync-to-test.js` omits `meal_variant_overrides` — the D-06 merge rehearsal ran against an incomplete copy

**File:** `recipe-planner/scripts/sync-to-test.js:27-42`
**Issue:** `COLLECTIONS_TOP_DOWN` lists 14 collections but omits `meal_variant_overrides` (and `recipe_queue`, both present in `types.ts`). Yet `merge-products.js` (lines 21-26) explicitly enumerates `meal_variant_overrides.replacement_product` as one of the four reference fields it must repoint. So the test-DB rehearsal of the merge exercised only 3 of the 4 repoint targets — the rehearsal could pass while the prod run hit failures (or vice versa) on the one collection never copied. Also stale override records in the test DB are never cleared.
**Fix:** Add `"meal_variant_overrides"` (after `planned_meals`, since it references them) and `"recipe_queue"` to `COLLECTIONS_TOP_DOWN`.

### WR-05: `backfill-units.js` and `normalize-node-units.js` perform writes without superuser authentication

**File:** `recipe-planner/scripts/backfill-units.js:137-141`, `recipe-planner/scripts/normalize-node-units.js:127-131`
**Issue:** `apply-unit-resolutions.js` and `merge-products.js` both call `authenticateSuperuser()` before mutating; these two scripts call `pb.collection(...).update(...)` in `--apply` mode with **no authentication at all**. Either (a) the runs failed with 403s, or (b) — since the phase reports successful prod runs — the prod PocketBase collection rules allow **unauthenticated updates to `products` and `recipe_product_nodes`**, which is a real exposure on a LAN-reachable server and an inconsistency the scripts should not rely on.
**Fix:** Add the same `authenticateSuperuser()` call (gated on `!DRY_RUN`) to both scripts, and audit the PB collection API rules to require auth for writes.

### WR-06: `merge-products.js` has no dry-run mode despite being the most destructive script in the set

**File:** `recipe-planner/scripts/merge-products.js:226-249`
**Issue:** The phase convention (and every sibling mutation script) is "dry-run unless `--apply`". `merge-products.js` repoints references and **deletes product records** immediately on invocation with a confirmed decisions file — there is no `--apply` gate and no preview mode. Preflight validation and the backup mitigate but do not replace a dry-run: a reviewer cannot see the exact repoint/delete plan without executing it.
**Fix:** Add the standard `const DRY_RUN = !process.argv.includes("--apply")` gate; in dry-run, print the planned repoints/deletes (reusing the live reference counts) and skip `backupBeforeMerge`/mutations.

### WR-07: `merge-products.js` preflight does not reject chained merges (survivor that is itself a dupe)

**File:** `recipe-planner/scripts/merge-products.js:68-116,140-204`
**Issue:** If the decisions file contains `A → B` and `B → C`, preflight passes (all IDs live, types match). Depending on array order, `repointReferences` can move A's references onto B *after or before* B's references move to C; `verifyZeroOrphans` then finds references still pointing at dupe B and **aborts mid-mutation** — leaving prod half-repointed with only the backup as recovery. The invalid input is detectable up front.
**Fix:** In `preflightValidate`, build a `Set` of all `dupeId`s and error on any decision whose `survivorId` is in that set (and on duplicate `dupeId` entries).

### WR-08: No UI surface can set `canonical_unit`/`dimension` — the linter's fix path is a dead end

**File:** `recipe-planner/src/pages/registries/Products.tsx:179-199,542-559` (and `src/components/ProductForm.tsx`, which contains no reference to `canonical_unit` — verified by grep across `src/**/*.tsx`)
**Issue:** The `missing-canonical-unit` lint finding is clickable and opens the product edit dialog (Products.tsx:549-554), but `ProductForm`/`useProductForm` has no `canonical_unit` or `dimension` field — the user lands on a form that cannot resolve the finding. Worse, every product created after the one-shot backfill (via Products.tsx or RecipeEditor's inline create) starts with `canonical_unit` null and there is no in-app way to ever set it; the null-canonical population will only grow, and the D-10 primary display path degrades to the fallback for all new products.
**Fix:** Add a `canonical_unit` select (enum-bound, from `UNIT_DIMENSIONS`) to `ProductForm`, deriving `dimension` from the chosen unit on save (same never-drift rule the scripts enforce).

### WR-09: `npm run sync-to-test` is broken — wrong script path

**File:** `recipe-planner/package.json:11`
**Issue:** `"sync-to-test": "node sync-to-test.js"` — the file lives at `scripts/sync-to-test.js`; npm scripts run from the package root, so this command fails with `MODULE_NOT_FOUND`. The documented rehearsal entry point does not work as shipped.
**Fix:** `"sync-to-test": "node scripts/sync-to-test.js"`.

### WR-10: RecipeEditor leaks a stale unit onto stored-product nodes and never normalizes on save

**File:** `recipe-planner/src/pages/RecipeEditor.tsx:397-401,481-486,962-980,1195-1213`
**Issue:** The unit `Select` is hidden when `selectedProduct.type === "stored"`, but `productUnit` state is not cleared when the selected product changes. Sequence: user picks a raw product, selects "cup", then changes the Autocomplete to a stored product and clicks Add — `handleAddProduct` writes `unit: "cup"` onto the stored node even though the field was invisible. Same in the edit dialog. Additionally, a legacy non-enum unit loaded into the edit dialog renders as a blank Select but is silently re-saved verbatim (`unit: productUnit || undefined`), so DATA-03's "free-text entry is no longer possible" guarantee has two leaks.
**Fix:** Clear `productUnit` in the Autocomplete `onChange` when the new product's type is `stored` (or force `unit: undefined` at save time for stored products), and run `normalizeUnit` on the loaded value when opening the edit dialog, falling back to `""` when unresolvable.

### WR-11: Shopping list renders raw floating-point totals — nothing performs the display rounding D-11 defers to rendering

**File:** `recipe-planner/src/components/outputs/ShoppingListTab.tsx:183-185,219-222`
**Issue:** `units.ts` explicitly stays exact and assigns human-friendly rounding to rendering (units.ts:9-11). But the renderer interpolates raw numbers: merging 0.25 cup + 2 tbsp into canonical `cup` yields `0.25 + 2×14.78676/236.588236 = 0.374999935…`, displayed as `Olive Oil — 0.374999935 cup` on the store tablet. The responsibility was deferred and then never picked up anywhere.
**Fix:** Format at render: e.g. `const qty = Number(item.totalQuantity.toFixed(2));` (or a shared `formatQuantity()` helper) in both the store-section and pantry branches.

### WR-12: Plain `node` scripts import `.ts` modules — undocumented Node >= 22.6 (type-stripping) requirement

**File:** `recipe-planner/scripts/backfill-units.js:5`, `recipe-planner/scripts/normalize-node-units.js:5`, `recipe-planner/scripts/lint.js:2`
**Issue:** `import { normalizeUnit } from "../src/lib/units.ts"` from a plain `.js` ESM script only works on Node ≥ 22.6 with type stripping (default-on in 23.6+/24). On any earlier Node the migration/lint scripts crash with `ERR_UNKNOWN_FILE_EXTENSION`. `tsx` is in devDependencies but no npm script or shebang uses it, and no `engines` field pins the Node version. This will bite the next machine/CI that runs these scripts.
**Fix:** Add `"engines": { "node": ">=22.18" }` (first version with strip-types on by default in the 22 line) to package.json, or provide npm scripts that run via `tsx` (`"backfill-units": "tsx scripts/backfill-units.js"`).

## Info

### IN-01: Header claims "exact NIST factors — do not round", but four factors are rounded

**File:** `recipe-planner/src/lib/units.ts:55-69`
**Issue:** Exact values are tsp 4.92892159375, tbsp 14.78676478125, fl_oz 29.5735295625, cup 236.5882365; the table stores 5-9 significant-digit roundings. Consequences: `convert(1, "cup", "tbsp")` is 16.000005…, and 2 × cup (473.176472) ≠ pint (473.176473). Error is ~1e-7 relative (harmless for shopping) but directly contradicts the "exact, do not round" comment.
**Fix:** Paste the full exact values or soften the comment.

### IN-02: Dead code — `skippedUnchanged` and the redundant `checked` set

**File:** `recipe-planner/scripts/apply-unit-resolutions.js:130,156`, `recipe-planner/scripts/find-duplicates.js:103,111-113`
**Issue:** `skippedUnchanged` is declared, never incremented, and returned. `checked` in find-duplicates can never dedupe anything the `p1.id >= p2.id` guard hasn't already excluded.
**Fix:** Delete both.

### IN-03: Record IDs interpolated into PocketBase filter strings without escaping

**File:** `recipe-planner/scripts/find-duplicates.js:34`, `recipe-planner/scripts/merge-products.js:148,189`, `recipe-planner/src/pages/RecipeEditor.tsx:233-247` (`filter: \`recipe="${id}"\``)
**Issue:** Values come from PB-generated IDs / route params, so practical injection risk is low, but the SDK provides `pb.filter("field = {:id}", { id })` for exactly this. RecipeEditor's `id` comes from the URL and is user-controllable.
**Fix:** Use `pb.filter()` parameter binding.

### IN-04: Pantry section keys/checkbox state collide for split pantry lines

**File:** `recipe-planner/src/components/outputs/ShoppingListTab.tsx:217-231`
**Issue:** Store sections key items by `lineId`, but the pantry section uses `key={item.productId}` and `getPantryCheckboxKey(item.productId)`. A pantry product split into two dimension lines produces duplicate React keys and a single shared checkbox for both lines.
**Fix:** Use `item.lineId` for the React key (checkbox semantics — one pantry check per product — may be intentional).

### IN-05: `missing-store-section` flags stored/inventory products that are never purchased

**File:** `recipe-planner/src/lib/linter/rules/missing-store-section.ts:16`
**Issue:** The filter excludes only `transient` and pantry. A `stored` product (batch-prep output) or a recipe-sourced `inventory` product legitimately has no store, yet is reported as an **error**. If intentional per D-04's verbatim research pattern, fine — otherwise this is standing noise that trains the user to ignore errors.
**Fix:** Consider `p.type === "raw"` (or exclude `stored`) if the rule intent is "purchasable products need a store".

### IN-06: Alias table singular/plural asymmetry

**File:** `recipe-planner/src/lib/units.ts:87-104`
**Issue:** `slices`/`sprigs`/`pitas` are aliased but `slice`/`sprig`/`pita` are not (`cube`/`cubes` both are). Seeded from live data, so absence is deliberate today, but the first future "1 slice" entry resolves to null and lands in the manual-review queue for no principled reason.
**Fix:** Add the singular forms alongside existing plurals.

### IN-07: Vitest include pattern `scripts/**/*.test.js` matches nothing

**File:** `recipe-planner/vitest.config.ts:9`
**Issue:** No `*.test.js` files exist under `scripts/`. Harmless, but implies script tests that were never written.
**Fix:** Remove the pattern or add the intended tests.

### IN-08: Prep-verb rule uses substring matching — legitimate product names will be flagged

**File:** `recipe-planner/src/lib/linter/rules/prep-words.ts:26`
**Issue:** `lowerName.includes(verb)` flags store-bought raw products like "Sliced Almonds" or "Shredded Mozzarella", which are correct names for what is purchased.
**Fix:** Acceptable for v1 given a small catalog; consider word-boundary matching plus an allowlist if noise appears.

---

_Reviewed: 2026-07-06T18:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
