# Phase 1: Data Hygiene - Research

**Researched:** 2026-07-05
**Domain:** TypeScript business-logic correctness fixes + PocketBase (SQLite) schema hygiene, in a single-user, self-hosted meal-planning SPA
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Container type stays **product-level only** (`products.container_type`). No per-node `container_type` relation this phase.
- **D-02:** Record the revisit trigger explicitly in `decisions.md`: add a per-node container relation if/when a real recipe needs one stored product in different containers across recipes.
- **D-03:** Surface = **Lint button + findings panel on the Products registry page** (`recipe-planner/src/pages/registries/Products.tsx`) **plus** a headless `recipe-planner/scripts/lint.js` wrapping the same pure functions in `recipe-planner/src/lib/linter/`. No dedicated /lint route in v1.
- **D-04:** Rule 3 (missing store/section) ships with the **`SECTION_REQUIRED_STORES` set**: Safeway requires section; Costco, Trader Joes, and online/specialty require store only.
- **D-05:** Merge review format = **generated JSON decisions file + companion Markdown context report**. `find-duplicates.js` (extended) emits a human-readable report with candidate clusters; the user edits a small JSON `{dupeId → survivorId, confirmed}` file, which is the ONLY input `merge-products.js` reads.
- **D-06:** Safety net (all mandatory): (1) rehearse the full flow against the **test** instance after a fresh `sync-to-test.js` copy of prod; (2) snapshot prod via PocketBase's built-in **`pb.backups.create()`** immediately before the real run; (3) `merge-products.js` performs **pre-flight ID validation** before acting; (4) zero-orphan verification before any delete.
- **D-07:** Product-reference collections are enumerated against the **live DB / code**, never the stale `pb_schema_updated.json`. Known set: `recipe_product_nodes.product`, `inventory_items.product`, `products.store_bought_product`, `meal_variant_overrides.replacement_product`.
- **D-08:** `canonical_unit` backfill: scripted inference with review; genuinely ambiguous products are left **null for linter rule 4 to surface** — never guessed. Node units matching neither enum nor alias are reported for manual resolution.
- **D-09:** Ship the proposed enum as-is — volume: `tsp, tbsp, fl_oz, cup, pint, qt, gal, ml, l`; mass: `g, kg, oz, lb`; count: `each`. **No** dedicated `clove/bunch/head/can` enum members — alias count-words to `each` via `UNIT_ALIASES`.
- **D-10:** Merged-line display unit: convert into the product's `canonical_unit` when set. When null, fallback = **largest unit keeping quantity ≥ 1, capped at `cup` (volume) / `lb` (mass), never crossing metric↔customary within one promotion path**. Deterministic (independent of node order).
- **D-11:** Fraction/human formatting is a **render-layer concern**, not `units.ts`. The conversion module stays exact and reviewable.

### Claude's Discretion

- Dimension storage (§3.1 open question): store `dimension` on the product, auto-written from `canonical_unit` via the unit→dimension map. Planner may collapse to derive-only if cleaner; `canonical_unit` is the single source of truth either way.
- Exact conversion constants in `units.ts` — must be exact and covered by round-trip unit tests; flag anything unusual for review.
- `mergeQuantities` shared-helper refactor vs inlining in both builders — implementer's choice.
- Lint findings panel UX (dialog vs collapsible section, grouping by rule vs by product) — keep it simple, findings link to the offending product/recipe.

### Deferred Ideas (OUT OF SCOPE)

- Per-node container type relation — revisit trigger recorded in `decisions.md` (D-02); build only when real data demands it.
- Dedicated /lint page — reconsider with linter v2 (Phase 5).
- Dedicated count-dimension enum members (`clove`, `bunch`, `head`, `can`) — add only when a real recipe loses information aliasing to `each`.
- PB `select` conversion of `recipe_product_nodes.unit` — deferred until all values are confirmed enum members.
- Import-time linting — Phase 6.
- `nas-pocketbase-tailnet` todo — reviewed, kept in Phase 2; Phase 1 is pure data/logic with no connectivity dependency.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Shopping aggregation never sums mismatched units — converts within dimension to canonical unit, or splits by dimension | Verified bug at `product-builder.ts:91`/`step-builder.ts:133,145`; exact NIST conversion factors below; `lineId` split-identity design in Architecture Patterns |
| DATA-02 | Units are an enum with canonical unit + dimension per product, with a within-dimension conversion module (`src/lib/units.ts`) | Enum + conversion table verified against NIST Handbook 44 / BIPM exact factors (Code Examples) |
| DATA-03 | `recipe_product_nodes.unit` carries measurement units only — container-type semantics split into their own field | Overload verified live at `RecipeEditor.tsx:397-400,485-488` and `aggregation.ts:334,388`; `containerTypeName` threading plan |
| DATA-04 | Products deduped one-shot, protected by case-insensitive unique index on `products.name` | **Live-data finding below: two products share a name across different `type`s by design — index must be scoped, see Common Pitfalls #1** |
| DATA-05 | Existing node units normalized to enum tokens | **Live query of prod `recipe_product_nodes.unit` (445 records) — full distinct-value table below, materially messier than assumed** |
| DATA-06 | Linter v1 flags the 4 data-hygiene rule violations on demand | Real store name strings from prod (`safeway`, `costco`, `trader joes`, `online`) confirm D-04's `SECTION_REQUIRED_STORES` set is implementable exactly as specified |
| DATA-07 | `decisions.md` reconciled with actual signature-based step aggregation; stale schema re-exported | `createStepSignature` verified at `step-utils.ts:20-27`; `meal_variant_overrides` confirmed missing from `pb_schema_updated.json`, confirmed used at `api.ts:66` |
</phase_requirements>

## Summary

This phase is almost entirely custom TypeScript business logic and PocketBase schema hygiene — there is no new external library to "get right," the risk is in getting the conversion math, the merge safety net, and the two-database manual schema workflow correct. All factual claims in the phase doc (`.planning/phase-docs/phase-1-data-hygiene.md`) were independently re-verified against the live source files and the live prod/test PocketBase instances during this research pass, and they check out. Two live-data findings materially change the risk picture for the planner and are called out below: (1) the case-insensitive unique name index, if applied as a bare `name` index, would break two existing legitimate same-name-different-`type` product pairs; (2) the real `recipe_product_nodes.unit` corpus is messier than the phase doc's grep evidence suggested — roughly 20% of populated values are container-type strings, and there are truly ambiguous/garbage values (`"medium"`, `"large"`, `"by"`, `"chile"`, `"28oz cans"`) that no alias map can resolve.

No test framework exists in the repo today (confirmed: no vitest/jest, no `*.test.*` files, no test script in `package.json`). The `units.ts` conversion module has explicit round-trip-test requirements in CONTEXT.md, so this phase must also stand up a minimal test harness. Vitest is both the codebase-mapper's prior recommendation (`.planning/codebase/TESTING.md`) and the standard pairing for a Vite + React 19 + TS project — install it as part of Wave 0.

**Primary recommendation:** Treat this phase as a strict dependency chain — `units.ts` (with `UNIT_ALIASES` seeded from the real 445-record unit-value inventory below) → node-unit normalization script → aggregation fix → linter — and do not attempt the case-insensitive unique index until the type-scoping question (Common Pitfalls #1) is resolved with the user.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unit enum + conversion math (`units.ts`) | API/Backend logic (shared TS module, no server) | Browser (editor validation) | Pure function module consumed by both the aggregation builders and the React editor; single source of truth, no PB round-trip needed |
| Unit-blind aggregation fix (product/step builders) | API/Backend logic (business logic layer) | — | `src/lib/aggregation/` is explicitly the "single source of truth" layer per `ARCHITECTURE.md`; UI only renders its output |
| Container-type-as-unit overload removal | Browser (RecipeEditor write path) + Backend logic (aggregation read path) | — | Write happens in the editor component; the read/derive happens in `aggregation.ts` builders — both must change together |
| Product dedup + backfill + unique index | Database/Storage (PocketBase collections + SQLite index) | Scripts (Node one-shot) | Schema change is PB-native (SQLite `COLLATE NOCASE` index); the merge logic is a plain Node script working directly against the PB REST API, no server code exists |
| Recipe linter v1 | API/Backend logic (`src/lib/linter/` pure functions) | Browser (Products.tsx panel), Scripts (`scripts/lint.js`) | Rules are pure `LintFinding[]` functions per D-03; two thin surfaces (UI panel, CLI script) call the same core — no logic duplication |
| `decisions.md` / schema re-export reconciliation | Docs / Database export | — | Not a runtime tier; a documentation and schema-snapshot correctness task |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pocketbase (JS SDK) | `^0.26.5` (resolves to `0.26.9`; registry latest `0.27.0`) [VERIFIED: npm registry] | REST client for all data access, backups, script access | Already the project's sole data-access dependency; no reason to bump the major-adjacent `0.27.0` mid-phase — stay on `0.26.x` unless a specific 0.27 feature is needed |
| typescript | `~5.9.3` [VERIFIED: local package.json] | `units.ts`, linter, and all new modules | Existing project standard; strict mode already enabled (`tsconfig.app.json`) |

No new runtime dependency is required for the enum/conversion/linter/dedup work itself — this phase is pure TypeScript + Node scripts, consistent with the project's existing "plain Node.js, no CLI frameworks" convention (CONTEXT.md, Established Patterns).

### Supporting (test infrastructure — new for this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | `4.1.9` current registry latest [ASSUMED — see Package Legitimacy Audit] | Round-trip unit tests for `units.ts` conversions (CONTEXT.md hard requirement) | Install as devDependency; Vite-native, zero extra config for a Vite project |
| @testing-library/react | `16.3.2` [ASSUMED] | Only if the linter findings panel gets component tests | Optional this phase — `units.ts`/linter core logic tests don't need DOM |
| jsdom | `29.1.1` [ASSUMED] | DOM environment for Vitest, only if component tests are added | Pair with `@testing-library/react`; skip if only testing pure functions |

**Recommendation:** for this phase, install only `vitest` (pure-function testing needs no DOM). Add `@testing-library/react` + `jsdom` in a later phase if/when component-level tests are wanted.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Jest requires more config for ESM/Vite/rolldown-vite interop; Vitest shares Vite's config and transform pipeline directly — less setup, faster |
| Hand-rolled string diff for dedup clusters | `fastest-levenshtein` / `string-similarity` npm packages | Not needed this phase — the existing `find-duplicates.js` heuristic (exact case-insensitive + same-type-first-word) is what D-05 says to *extend*, not replace; a real fuzzy-matching library is more relevant to REG-02 (Phase 3) fuzzy search UI. Don't add a new dependency for a one-shot script when the existing heuristic plus human review (D-05's explicit design) already covers it. |

**Installation:**
```bash
cd recipe-planner
npm install -D vitest
```

**Version verification:** confirmed via `npm view pocketbase version` (0.27.0 latest, project pinned `^0.26.5`→resolves `0.26.9`) and `npm view vitest version` (`4.1.9`) on 2026-07-05.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| vitest | npm | created 2021-12-03 (~4.5 yrs); latest version published 2026-06-15 | 67.9M/wk | github.com/vitest-dev/vitest | [SUS] (tool flagged "too-new" — this fires on latest-version publish recency, not package age; download count and repo history are unambiguous) | Flagged — planner should add a lightweight `checkpoint:human-verify` before `npm install -D vitest`, but evidence (4.5-year-old package, 68M weekly downloads, canonical repo) strongly supports approval |
| @testing-library/react | npm | published 2026-01-19 (latest ver) | 42.6M/wk | github.com/testing-library/react-testing-library | [OK] | Approved (only needed if component tests are added) |
| @testing-library/jest-dom | npm | published 2025-10-01 (latest ver) | 48.2M/wk | github.com/testing-library/jest-dom | [OK] | Approved (optional) |
| @testing-library/user-event | npm | published 2025-01-21 (latest ver) | 36.4M/wk | github.com/testing-library/user-event | [OK] | Approved (optional) |
| jsdom | npm | published 2026-04-30 (latest ver) | 74.8M/wk | github.com/jsdom/jsdom | [OK] | Approved (optional) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — the flag is a false positive driven by recent-release recency rather than package age; planner should still gate the install behind a quick human confirmation per protocol, but no alternative package is warranted.

*No other new npm packages are introduced by this phase — the unit enum, conversion module, dedup/backfill/normalize scripts, and linter are all hand-written TypeScript/Node, matching the project's existing "no CLI frameworks" convention.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   RecipeEditor.tsx       │        │  scripts/*.js (one-shot)  │
│  (node unit: enum select)│        │  find-duplicates.js       │
│  (stored: reads           │        │  merge-products.js (new)  │
│   container_type, no      │        │  backfill-units.js (new)  │
│   longer writes into unit)│        │  normalize-node-units.js   │
└───────────┬──────────────┘        │  (new)                    │
            │ writes                └─────────────┬─────────────┘
            ▼                                      │ REST (pb.collection)
┌────────────────────────────────────────────────────────────────┐
│                    PocketBase (SQLite-backed)                    │
│  products (+ canonical_unit, dimension, name COLLATE NOCASE idx) │
│  recipe_product_nodes.unit (free text, enum-normalized values)   │
│  meal_variant_overrides, inventory_items, ... (all product refs) │
└───────────────────────────┬──────────────────────────────────────┘
                             │ reads (expand: product, product.container_type)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│         src/lib/aggregation/  (pure builder functions)           │
│  product-builder.ts ─┐                                           │
│  step-builder.ts     ├─► convert-or-split via units.ts ─► lineId │
│  aggregation.ts       ┘   (canConvert / convert / getDimension)   │
└───────────┬───────────────────────────────────┬──────────────────┘
            │ AggregatedProduct[]               │ AggregatedFlowProduct
            ▼ (lineId keyed)                    ▼ (containerTypeName)
┌─────────────────────┐              ┌─────────────────────────────┐
│ ShoppingListTab.tsx   │              │ FridgeFreezerTab /            │
│ (checkbox key=lineId) │              │ MealContainersTab / PullLists │
└─────────────────────┘              └─────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              src/lib/linter/ (pure LintFinding[] rules)           │
│  1. cross-dimension mismatch (uses units.canConvert)              │
│  2. prep-words in raw product names                              │
│  3. missing store/section (SECTION_REQUIRED_STORES = {"safeway"}) │
│  4. missing canonical_unit                                        │
└───────────┬────────────────────────────────────┬─────────────────┘
            ▼                                     ▼
  Products.tsx "Lint" button + panel      scripts/lint.js (headless)
```

### Recommended Project Structure

```
recipe-planner/src/lib/
├── units.ts                    # NEW — enum, UNIT_DIMENSIONS, UNIT_ALIASES, convert/canConvert/getDimension/normalizeUnit
├── units.test.ts               # NEW — round-trip conversion tests (Vitest)
├── linter/
│   ├── index.ts                # NEW — exports all rules + LintFinding type
│   ├── rules/
│   │   ├── cross-dimension.ts  # NEW
│   │   ├── prep-words.ts       # NEW
│   │   ├── missing-store-section.ts  # NEW — SECTION_REQUIRED_STORES
│   │   └── missing-canonical-unit.ts # NEW
│   └── linter.test.ts          # NEW
├── aggregation/
│   ├── builders/
│   │   ├── product-builder.ts  # MODIFY — convert-or-split, lineId
│   │   └── step-builder.ts     # MODIFY — same convert-or-split for inputs/outputs
│   ├── utils/
│   │   └── product-utils.ts    # MODIFY (maybe) — shared mergeQuantities helper
│   └── types.ts                 # MODIFY — add lineId, containerTypeName to AggregatedFlowProduct
└── aggregation.ts               # MODIFY — containerTypeName sourcing (:334, :388)

recipe-planner/scripts/
├── find-duplicates.js           # MODIFY — emit JSON decisions file + Markdown report
├── merge-products.js            # NEW — reads JSON decisions, repoints refs, deletes dupes
├── backfill-units.js            # NEW (or folded into merge-products.js) — canonical_unit/dimension
├── normalize-node-units.js      # NEW — one-shot node.unit → enum token pass
└── lint.js                      # NEW — headless linter runner
```

### Pattern 1: Convert-or-split aggregation (the core fix)

**What:** When merging a new quantity into an existing aggregated line, first attempt a within-dimension unit conversion; only merge numerically if that succeeds. Otherwise, key the line by `${productId}|${dimension}` so incompatible dimensions become distinct, stable lines.

**When to use:** Every merge site currently doing blind `+=` on a `totalQuantity` — `product-builder.ts:91`, `step-builder.ts:133`, `step-builder.ts:145`.

**Example:**
```typescript
// src/lib/units.ts (new) — shape informed by CONTEXT.md D-09/D-10/D-11
export type Dimension = "volume" | "mass" | "count";
export type Unit =
  | "tsp" | "tbsp" | "fl_oz" | "cup" | "pint" | "qt" | "gal" | "ml" | "l"
  | "g" | "kg" | "oz" | "lb"
  | "each";

export const UNIT_DIMENSIONS: Record<Unit, Dimension> = {
  tsp: "volume", tbsp: "volume", fl_oz: "volume", cup: "volume",
  pint: "volume", qt: "volume", gal: "volume", ml: "volume", l: "volume",
  g: "mass", kg: "mass", oz: "mass", lb: "mass",
  each: "count",
};

// Exact factors — verified against NIST Handbook 44 / BIPM SI Brochure (2026-07-05).
// 1 US gal = 3.785411784 L exactly; 1 lb = 453.59237 g exactly; 1 oz(avdp) = 28.349523125 g exactly.
const TO_ML: Partial<Record<Unit, number>> = {
  tsp: 4.92892, tbsp: 14.78676, fl_oz: 29.57353, cup: 236.588236,
  pint: 473.176473, qt: 946.352946, gal: 3785.411784, ml: 1, l: 1000,
};
const TO_G: Partial<Record<Unit, number>> = {
  g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237,
};

export function getDimension(unit: Unit): Dimension {
  return UNIT_DIMENSIONS[unit];
}

export function canConvert(a: Unit, b: Unit): boolean {
  return getDimension(a) === getDimension(b);
}

export function convert(qty: number, from: Unit, to: Unit): number | null {
  if (!canConvert(from, to)) return null;
  const dim = getDimension(from);
  if (dim === "count") return from === to ? qty : null; // each has no sub-units
  const table = dim === "volume" ? TO_ML : TO_G;
  return (qty * table[from]!) / table[to]!;
}
```

```typescript
// src/lib/aggregation/builders/product-builder.ts — convert-or-split sketch
import { canConvert, convert, getDimension } from "../../units";

function mergeInto(
  existing: AggregatedFlowProduct,
  incoming: AggregatedFlowProduct
): void {
  if (canConvert(existing.unit as Unit, incoming.unit as Unit)) {
    const converted = convert(incoming.totalQuantity, incoming.unit as Unit, existing.unit as Unit);
    existing.totalQuantity += converted ?? 0; // canConvert already guarantees non-null here
  }
  // else: caller must have keyed this incoming product under a *different*
  // `${productId}|${dimension}` map key — it never reaches mergeInto in that case.
}
```

**Split-line identity (must ship alongside the merge fix):**
```typescript
// src/lib/aggregation/types.ts
export interface AggregatedFlowProduct {
  // ... existing fields
  lineId: string; // NEW — `${productId}` for the common case, `${productId}|${dimension}` when split
}
```
```typescript
// src/components/outputs/ShoppingListTab.tsx — replace item.productId with item.lineId
const key = getShoppingCheckboxKey(item.lineId); // was item.productId
// ...
<CheckableListItem key={item.lineId} itemKey={key} ... />
```

### Pattern 2: Case-insensitive unique index via native SQLite collation (not app-level checks)

**What:** PocketBase (SQLite-backed) supports arbitrary raw-SQL index definitions through the Admin UI's collection "Indexes" editor. A `COLLATE NOCASE` unique index enforces case-insensitive uniqueness at the database layer — PocketBase's own validation layer inspects collection indexes and applies the same collation automatically, so `create()` calls get a proper 400 validation error, not just an app-level pre-check that could be bypassed by a direct Admin UI edit.

**When to use:** §3.2's `products.name` uniqueness requirement (DATA-04).

**Example:**
```sql
-- Add via PB Admin UI → products collection → Options → Indexes
CREATE UNIQUE INDEX idx_products_name_ci ON products (name COLLATE NOCASE)
```
[CITED: github.com/pocketbase/pocketbase/discussions/6337 — documents the exact `COLLATE NOCASE` pattern PocketBase's own auth-email uniqueness uses, and confirms PB's internal lookup/validation respects the collation once the index exists.]

**Don't hand-roll:** a client-side or script-side "check if name already exists (lowercased)" before every create call. This has a race condition (two concurrent creates can both pass the check) and doesn't protect direct Admin UI edits. The native index is authoritative and free.

⚠️ **See Common Pitfalls #1 below before implementing this pattern as a bare `name`-only index — live prod data has a legitimate same-name-different-`type` collision that this index would block going forward.**

### Pattern 3: Pure linter functions, dual-surfaced

**What:** Linter rules are pure functions `(data) => LintFinding[]`, matching the codebase's existing "aggregation = pure builder functions" convention (CONTEXT.md, Established Patterns). One core module, two thin callers.

**Example:**
```typescript
// src/lib/linter/rules/missing-store-section.ts
const SECTION_REQUIRED_STORES = new Set(["safeway"]); // exact lowercase store.name values, verified live 2026-07-05

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

### Anti-Patterns to Avoid

- **Guessing `canonical_unit` for ambiguous products:** D-08 explicitly forbids this. If a product's node-unit history doesn't clearly map to one dimension (e.g., garlic seen as both `each` and `g`), leave `canonical_unit` null and let linter rule 4 surface it.
- **Deriving `dimension` independently of `canonical_unit`:** would let the two fields drift; always write `dimension` from the `canonical_unit → dimension` map at the same time `canonical_unit` is set (or don't store it at all — see Claude's Discretion).
- **Converting `recipe_product_nodes.unit` to a PB `select` field this phase:** deferred per §3.3/CONTEXT.md — a single non-enum straggler value would break `pb_schema_updated.json` import. Validate at the app layer + linter only.
- **Merging products across `type` without checking downstream branching logic:** `shouldCreateInstances()` and `createProductKey()` branch on `product.type` (Stored vs. not). A dedup merge that changes a product's effective type identity would silently break instance-creation logic for every recipe referencing it — see Common Pitfalls #1.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive uniqueness on `products.name` | App-level "does this name already exist (lowercased)?" check before create | Native SQLite `COLLATE NOCASE` unique index via PB Admin UI | Race-free, enforced even on direct Admin UI edits/API calls PB's own `create()` validation already surfaces the constraint as a normal 400 error |
| Unit conversion factors | Ad-hoc "close enough" constants from memory | The exact NIST Handbook 44 / BIPM factors reproduced in Pattern 1 above | A wrong factor "silently corrupts every list" (CONTEXT.md risk #2) — these are legally-defined exact conversions, not approximations, and are cheap to get right once |
| Prod snapshot before an irreversible merge | Manual `pb_data` folder copy over SSH | `pb.backups.create(basename)` (PocketBase's built-in backup service, confirmed present in SDK 0.26.5's `BackupService`) | D-06 explicitly calls for this; it's a one-line authenticated call vs. filesystem access the app doesn't otherwise need |
| Fuzzy/near-duplicate name detection | A hand-rolled Levenshtein implementation | Keep the existing `find-duplicates.js` first-word heuristic + human review (per D-05's explicit design) | D-05 does not ask for algorithmic fuzzy matching — it asks for a *reviewable report*; a human is the final arbiter of every merge decision anyway, so heuristic quality matters less than review-ability |

**Key insight:** almost nothing in this phase should reach for a new library. The correctness risk is entirely in getting the project's own domain rules right (unit dimensions, container-vs-unit semantics, reference-collection enumeration) — external tooling can't help with that; careful reading of the live data (see below) can.

## Common Pitfalls

### Pitfall 1: A bare `name`-only unique index will reject a live, legitimate data pattern

**What goes wrong:** Live prod data (queried directly 2026-07-05) has exactly two case-insensitive exact-name collisions among 291 products:

| name | type A | type B |
|------|--------|--------|
| `onion (red) sliced` | `transient` (id `vj1v1hehpt60vpv`) | `stored` (id `2v232mkw07d446o`) |
| `cucumber sliced` | `transient` (id `cz84cwpqe1oe432`) | `stored` (id `5xnabnb3v9z8350`) |

These are **not accidental duplicates** — they're the same food concept existing once as an intermediate (`transient`, flows into a further step) and once as a terminal stored/portioned output, which is a legitimate and apparently intentional pattern given the naming conventions in `decisions.md` (Transient: `[ingredient] [action]`; Stored: descriptive). A bare `CREATE UNIQUE INDEX ... ON products (name COLLATE NOCASE)` would (a) fail to create until these two pairs are merged/renamed, and (b) permanently prevent this transient/stored pairing pattern from recurring for any future recipe.

**Why it happens:** `products.name` uniqueness (DATA-04 requirement text) doesn't mention `type` scoping, and the phase doc's acceptance criteria (#5) only checks "PB rejects a case-variant duplicate name on create" without a type qualifier. The requirement was written before this live-data collision was found.

**How to avoid:** The planner has two clean options, both worth surfacing to the user before implementation:
1. **Scope the index to `(name COLLATE NOCASE, type)`** — allows the observed transient/stored pairing to continue, blocks true same-type duplicates. Closest to what the data shows actually happens.
2. **Rename one side of each existing pair** (e.g., stored variant becomes `"onion (red) sliced (stored)"` or similar) and keep the index on bare `name` — matches the DATA-04 requirement text literally, but changes existing display names app-wide (`extractMealDestination`'s parenthetical-parsing regex would need to not misfire on the new suffix).
- Either way, `find-duplicates.js`'s extended exact-match report (D-05) must **exclude or separately flag** cross-`type` name collisions — merging `vj1v1hehpt60vpv` and `2v232mkw07d446o` via `merge-products.js` would be a data-corrupting mistake (`shouldCreateInstances()` branches on `type`, so collapsing a transient and a stored record into one ID would break instance-creation for every recipe using either).

**Warning signs:** `find-duplicates.js`'s current exact-dupe check (`p.name.toLowerCase()` keyed, no type filter) will flag these two pairs as "exact duplicates" — a reviewer who doesn't know the type differs could approve a wrong merge.

### Pitfall 2: The real `recipe_product_nodes.unit` corpus is messier than the phase doc's grep evidence suggests

**What goes wrong:** CONTEXT.md's D-09 states "Grep evidence shows real data only uses `each, cup(s), tbsp, lb(s), oz, qt, pint`." A direct query of prod's 445 `recipe_product_nodes` (2026-07-05) shows a much wider and messier distribution:

| Value | Count | Disposition |
|---|---|---|
| `ea` | 117 | alias → `each` |
| `cup` | 75 | enum member as-is |
| *(empty)* | 48 | no-op (nodes with no measurement unit — fine) |
| `tbsp` | 32 | enum member as-is |
| `tsp` | 25 | enum member as-is |
| `quart restaurant` | 24 | **container-type string** (§3.3 overload — clear on stored nodes) |
| `vacuum sealed bag` | 17 | **container-type string** |
| `oz` | 14 | enum member as-is |
| `bu` | 12 | alias → `each` (bunch abbreviation, per D-09 no dedicated count unit) |
| `original packaging` | 12 | **container-type string** (also a recognized literal elsewhere — `hasOriginalPackaging()` in `filter-utils.ts` checks container type by name) |
| `lb` | 8 | enum member as-is |
| `half-quart restaurant` | 6 | **container-type string** |
| `tupperware` | 5 | **container-type string** |
| `cups` | 5 | alias → `cup` |
| `can` | 5 | alias → `each` (judgment call — flag for review, see below) |
| `package` | 4 | **container-type string** |
| `qt` | 4 | enum member as-is |
| `quart` | 3 | alias → `qt` |
| `medium` | 3 | **not a unit — likely a size descriptor leaked into the field; manual resolution (D-08)** |
| `large ramekin` | 2 | **container-type string** |
| `bag` | 2 | **container-type string** |
| `whole` | 2 | alias → `each` |
| `cubes` | 2 | alias → `each` |
| `small container`, `vacuum sealed bags`, `quart containers`, `container`, `packages`, `bags` | 1 each | **container-type strings** |
| `slices`, `cube`, `pitas`, `bunch`, `sprigs` | 1 each | alias → `each` |
| `tbl` | 1 | alias → `tbsp` (misspelling) |
| `cu` | 1 | alias → `cup` (abbreviation typo) |
| `cloves` | 1 | alias → `each` (explicit D-09 example) |
| `by`, `chile`, `28oz cans`, `large` | 1 each | **genuinely unresolvable — no alias fits; manual resolution required (D-08)** |

Roughly **20% of populated node-unit values (≈90/397 non-empty) are container-type strings**, not the small cleanup implied by the phase doc — and there are at least 4 values (`by`, `chile`, `medium`/`large` ×2, `28oz cans`) that are outright data errors, not spelling variants of a real unit.

**Why it happens:** the phase doc's grep evidence was likely a sample or an earlier snapshot, not an exhaustive query; container-type-as-unit values are exactly the kind of noise a simple grep-for-known-units pass would miss (they don't match unit-shaped strings at all, so they wouldn't show up as "near misses").

**How to avoid:** seed `UNIT_ALIASES` from the exact table above rather than re-deriving it from scratch; budget `normalize-node-units.js` for a genuinely two-part job — (1) alias-map the volume/mass/count spelling variants, (2) clear container-type strings specifically off `stored`-type product nodes (per §4.4/§4.5, these should become empty or a real measurement unit, not be aliased to anything) — and expect a short manual-resolution list (`by`, `chile`, `medium`×3, `large`×1, `28oz cans`) that the script must report, not silently drop.

**Warning signs:** if `normalize-node-units.js`'s "unresolved" report comes back empty, the alias map or the container-string-clearing pass is silently swallowing bad data instead of surfacing it.

### Pitfall 3: Schema changes require identical manual edits on two independently-running PocketBase instances

**What goes wrong:** There is no `pb_migrations/` directory; `sync-to-test.js` copies *records*, not schema (confirmed by direct code inspection). Both prod (`192.168.50.95:8090`) and test (`192.168.50.95:8091`) were reachable and responded `200` on `/api/health` during this research pass — schema edits (new `canonical_unit`/`dimension` fields, the unique index) must be applied by hand in each instance's Admin UI, in the same order, then `pb_schema_updated.json` re-exported from the live (prod) instance.

**Why it happens:** PocketBase's schema-as-code story is the Admin UI + JSON export, not a migration DSL, for this project's setup.

**How to avoid:** rehearse the full field-add + index-add sequence on test first (D-06 already mandates this for the merge/backfill flow — extend the same discipline to schema edits); re-export `pb_schema_updated.json` from prod immediately after, in the same commit as the code that assumes the new fields exist.

**Warning signs:** if `Product.canonical_unit`/`dimension` reads work against test but 404/silently-undefined against prod (or vice versa), the schema edit was applied to only one instance.

## Code Examples

### Verify a package/collection is reachable before running a one-shot script (environment guard)

```javascript
// Pattern already used by scripts/find-duplicates.js and the recipe-import skill —
// always wrap top-level script bodies to avoid dumping the entire pocketbase
// ESM bundle on an unhandled rejection.
import PocketBase from "pocketbase";

async function main() {
  const pb = new PocketBase("http://192.168.50.95:8090");
  // ... script body
}
main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
```

### Pre-flight prod snapshot (D-06, part 2)

```javascript
// Source: pocketbase JS SDK 0.26.5 BackupService (confirmed present in
// node_modules/pocketbase/dist/pocketbase.es.d.ts — create(basename, options?): Promise<boolean>)
// Requires a superuser-authenticated pb client (pb.collection("_superusers").authWithPassword(...))
await pb.backups.create(`pre-merge-products-${new Date().toISOString().replace(/[:.]/g, "-")}`);
```

### Round-trip conversion test (satisfies CONTEXT.md's hard test requirement)

```typescript
// src/lib/units.test.ts
import { describe, it, expect } from "vitest";
import { convert, canConvert } from "./units";

describe("units.convert", () => {
  it("round-trips cup -> tbsp -> cup", () => {
    const tbsp = convert(1, "cup", "tbsp")!;
    expect(tbsp).toBeCloseTo(16, 5);
    expect(convert(tbsp, "tbsp", "cup")).toBeCloseTo(1, 10);
  });

  it("matches the white-bean-stew acceptance anchor: 0.25 cup + 2 tbsp olive oil", () => {
    const asTbsp = convert(0.25, "cup", "tbsp")! + 2;
    expect(asTbsp).toBeCloseTo(6, 5); // 0.25 cup = 4 tbsp; + 2 tbsp = 6 tbsp
  });

  it("refuses cross-dimension conversion", () => {
    expect(canConvert("cup", "lb")).toBe(false);
    expect(convert(1, "cup", "lb")).toBeNull();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `unit` field on `recipe_product_nodes` meaning either "measurement unit" or "container type" depending on `product.type` | Measurement unit only; container type read exclusively from `products.container_type` | This phase (§4.5) | `containerTypeName` must be threaded onto `AggregatedFlowProduct`; every consumer of the old `product.unit`-as-container-name pattern (`aggregation.ts:334,388`, `StoredItem`/`MealContainer` consumers) must switch fields |
| `decisions.md` documents step aggregation as "exact string match" | Code (`createStepSignature`) merges on sorted input+output product-ID signature; names are display-only | Code diverged from docs at some earlier point, unknown date; this phase reconciles docs to match code | Purely documentation-facing; no code change required for DATA-07, just wording |

**Deprecated/outdated:** `decisions.md`'s "Ingredient Handling — user standardizes units manually at recipe authoring time; no conversion layer needed" line (line 34) is superseded by this entire phase and should be updated alongside the step-aggregation wording fix.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vitest is the right test runner choice for this project | Standard Stack, Validation Architecture | Low — Vitest is near-universally paired with Vite projects and the codebase mapper already recommended it; if wrong, swapping to Jest later mainly costs re-writing config, not test logic |
| A2 | `can` (5 occurrences) and `bu`/`bunch` should alias to `each` rather than being flagged for manual resolution | Common Pitfalls #2 | Low-medium — if a recipe's shopping-list correctness depends on knowing "3 cans" vs "3 each," aliasing to `each` loses that distinction; D-09 already accepts this loss by design for cloves, so it's consistent, but worth one explicit confirmation from the user during planning |
| A3 | The correct fix for Pitfall #1 is index scoping to `(name, type)` rather than renaming the two existing pairs | Common Pitfalls #1 | Medium — this is a genuine open decision the user should make, not one this research can resolve; picking wrong means either blocking a real recipe-authoring pattern or doing an unplanned rename with UI ripple effects |

**If this table is empty:** N/A — see rows above; all are genuinely open judgment calls surfaced by direct data verification, not textbook uncertainty.

## Open Questions

1. **Should the `products.name` unique index be scoped to `(name, type)` instead of bare `name`?**
   - What we know: two live product pairs share a name across `transient`/`stored` types, by apparent design (see Pitfall #1).
   - What's unclear: whether this is an intentional recipe-authoring pattern the user wants to keep, or accidental naming laziness that should be cleaned up by renaming.
   - Recommendation: surface this to the user explicitly before writing the `merge-products.js`/index-creation tasks — it changes both the SQL DDL and whether these two specific pairs go into the merge-candidate list at all.

2. **Should `can`/`bu` (bunch) node-unit values alias to `each`, or surface as unresolved for manual review?**
   - What we know: D-09 explicitly aliases `clove` → `each` and defers a dedicated `can`/`bunch` enum member; `can` appears 5 times, `bu` 12 times in live data.
   - What's unclear: whether losing the "5 cans" vs "5 each" distinction on the shopping list is acceptable for these specific products (canned goods commonly have canonical sizes, e.g. 15oz can, so aliasing to `each` may already lose real shopping information the same way DATA-01's cross-dimension example does).
   - Recommendation: alias `bu`→`each` (bunch is genuinely count-like, consistent with clove/head precedent) but flag `can` for one explicit confirmation — it may deserve `canonical_unit: "each"` with the linter-null-fallback path instead of a blanket normalization, since real canned-good quantities often matter more granularly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PocketBase prod (`192.168.50.95:8090`) | Dedup/backfill/normalize scripts, schema edits | ✓ (HTTP 200 on `/api/health`, verified 2026-07-05) | — | — |
| PocketBase test (`192.168.50.95:8091`) | D-06 rehearsal flow | ✓ (HTTP 200 on `/api/health`, verified 2026-07-05) | — | — |
| Node.js | All scripts, Vite build | ✓ | v24.14.0 (project stack docs cite 22.x on the NAS; both satisfy `pocketbase`/Vite requirements) | — |
| npm registry | Installing `vitest` | ✓ (`npm view` succeeded) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — both PocketBase instances and the npm registry were reachable during this research pass.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (none installed yet — Wave 0 install required) |
| Config file | none — Wave 0 creates `recipe-planner/vitest.config.ts` (or reuses `vite.config.ts` via `test` key) |
| Quick run command | `npx vitest run src/lib/units.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-02 | `convert`/`canConvert`/`getDimension` round-trip correctly within each dimension; cross-dimension returns null | unit | `npx vitest run src/lib/units.test.ts` | ❌ Wave 0 |
| DATA-01 | White-bean-stew olive oil (0.25 cup + 2 tbsp) merges to one correct line; cross-dimension case produces two `lineId`-distinct lines | unit | `npx vitest run src/lib/aggregation/builders/product-builder.test.ts` | ❌ Wave 0 |
| DATA-01 (step side) | Step inputs/outputs use the same convert-or-split logic | unit | `npx vitest run src/lib/aggregation/builders/step-builder.test.ts` | ❌ Wave 0 |
| DATA-03 | Stored-node `containerTypeName` sourced from `product.container_type`, not `unit`; grep guard | smoke (shell) | `grep -rn "unit is now the container type\|unit is the container type" recipe-planner/src` (expect empty) | ✅ (grep, no framework needed) |
| DATA-04 | Case-variant duplicate name rejected by PB; existing dupes merged | manual (requires live PB, and resolution of Open Question #1) | manual UAT against test instance after schema edit | N/A |
| DATA-05 | Every non-empty node unit is an enum token or explicitly surfaced for manual resolution | unit + manual | `npx vitest run recipe-planner/scripts/normalize-node-units.test.js` (dry-run mode against a fixture) + manual review of the unresolved list | ❌ Wave 0 |
| DATA-06 | Linter flags cross-dimension mismatch, prep-word raw name, missing store/section (Safeway-only section rule), missing canonical_unit; clean product produces no findings | unit | `npx vitest run src/lib/linter/linter.test.ts` | ❌ Wave 0 |
| DATA-07 | `decisions.md` no longer says "exact string match" for steps | smoke (shell) | `grep -n "exact string match" decisions.md` (expect empty after edit) | ✅ (grep) |

### Sampling Rate

- **Per task commit:** `npx vitest run <changed-file>.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green, plus the two grep smoke checks (DATA-03, DATA-07), before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `npm install -D vitest` (flagged `[SUS]` by the package-legitimacy tool as a false positive — see Package Legitimacy Audit; recommend a quick human confirmation, not a full alternative-package search)
- [ ] `recipe-planner/vitest.config.ts` — minimal config (no jsdom needed if only testing pure functions)
- [ ] `src/lib/units.test.ts` — round-trip + cross-dimension-null tests
- [ ] `src/lib/aggregation/builders/product-builder.test.ts`, `step-builder.test.ts` — convert-or-split + lineId tests
- [ ] `src/lib/linter/linter.test.ts` — one test per rule + one "clean product, no findings" test
- [ ] `package.json` — add `"test": "vitest run"` script

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (absent = enabled), so this section is included per protocol. In practice this app has explicitly **no authentication layer** by design (`decisions.md`: "Single user, no authentication required"; confirmed in `ARCHITECTURE.md`: "Authentication: Not implemented ... no auth layer present"). Most ASVS categories are architecturally out of scope; the relevant ones for this phase are input-validation-shaped.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | App has no auth layer by design (self-hosted, trusted LAN/tailnet); out of scope for this phase |
| V3 Session Management | No | No sessions; PB client uses no persisted auth token for this app's normal (non-superuser) operations |
| V4 Access Control | No | PB collection rules are currently open (`listRule`/`createRule`/etc. all empty strings per `pb_schema_updated.json` — allow-all); unchanged by this phase |
| V5 Input Validation | Yes | Unit enum validation (`normalizeUnit`, app-level select in `RecipeEditor.tsx` per §4.7) + the native `COLLATE NOCASE` unique index (Pattern 2) are exactly ASVS V5-style server/DB-level input validation, replacing free-text entry |
| V6 Cryptography | No | Nothing in this phase touches secrets or crypto; `pb.backups.create()` uses the existing PB superuser auth mechanism, not a new credential path |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Merge script (`merge-products.js`) operating on a stale/incorrect reference-collection list, silently orphaning a relation | Tampering / data integrity | D-07's live-DB-enumeration requirement + D-06's mandatory pre-flight ID validation and zero-orphan check before delete — already locked decisions, just implement them literally |
| Direct Admin UI edit bypassing app-level unit-enum validation | Tampering | The native SQLite `COLLATE NOCASE` unique index (Pattern 2) and the linter (which re-checks the live data on demand, not just at write time) are the two layers that catch this — app-level `<select>` validation alone would not |
| Irreversible product delete during merge before a backup exists | Repudiation / availability (data loss) | D-06 part 2's `pb.backups.create()` immediately before the real run — sequencing matters: backup must complete and be confirmed before `merge-products.js`'s delete step runs |

## Sources

### Primary (HIGH confidence)
- Live PocketBase prod instance (`http://192.168.50.95:8090`) — direct REST queries against `products` (291 records) and `recipe_product_nodes` (445 records), 2026-07-05, for the unit-value inventory and the product-name-collision finding in this document.
- Live PocketBase test instance (`http://192.168.50.95:8091`) — `/api/health` reachability check, 2026-07-05.
- Direct source read: `recipe-planner/src/lib/aggregation/builders/product-builder.ts`, `step-builder.ts`, `src/lib/aggregation.ts`, `src/lib/aggregation/types.ts`, `src/lib/types.ts`, `src/pages/RecipeEditor.tsx` (lines 379-501), `src/components/outputs/ShoppingListTab.tsx` (lines 150-220), `src/lib/aggregation/utils/product-utils.ts`, `step-utils.ts`, `src/lib/api.ts`, `src/lib/db-config.ts`, `src/lib/pocketbase.ts`, `recipe-planner/scripts/find-duplicates.js`, `pb_schema_updated.json`, `decisions.md`.
- `node_modules/pocketbase/dist/pocketbase.es.d.ts` (SDK 0.26.5) — confirmed `BackupService.create(basename, options?): Promise<boolean>` signature.

### Secondary (MEDIUM confidence)
- [PocketBase GitHub Discussion #6337 — Case Insensitive Usernames](https://github.com/pocketbase/pocketbase/discussions/6337) — confirms `COLLATE NOCASE` unique-index pattern and PB's internal respecting of it.
- NIST Handbook 44 / BIPM SI Brochure exact conversion factors (via WebSearch aggregation of multiple citing sources) — 1 US gallon = 3.785411784 L exact, 1 lb = 453.59237 g exact, 1 oz(avdp) = 28.349523125 g exact; derived tsp/tbsp/fl_oz/cup/pint/qt factors cross-checked against these.
- `.planning/codebase/TESTING.md`, `STACK.md`, `ARCHITECTURE.md`, `CONCERNS.md` (codebase-mapper output, dated 2026-03-01) — Vitest recommendation, stack version confirmation, existing test-coverage gaps.

### Tertiary (LOW confidence)
- `npm view vitest version` / `npm view pocketbase version` — registry snapshot at research time (2026-07-05); versions will drift.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new production dependency; test tooling choice (Vitest) is well-established for Vite projects and already recommended by the codebase mapper
- Architecture: HIGH — every architectural claim was verified against live source files, not just the phase doc's assertions
- Pitfalls: HIGH — both major pitfalls (index-scoping collision, messy unit corpus) are backed by direct live-database queries run during this research session, not inference

**Research date:** 2026-07-05
**Valid until:** 2026-08-04 (30 days — stable domain, but live-data findings should be re-verified if prod data changes materially before planning starts, e.g. if someone runs a partial cleanup manually in the interim)
