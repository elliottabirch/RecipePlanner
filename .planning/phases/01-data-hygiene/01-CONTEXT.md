# Phase 1: Data Hygiene - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the recipe data layer unit-disciplined and duplicate-free so every downstream
aggregation (shopping list, batch prep, containers) is trustworthy by construction.
Deliverables: unit enum + conversion module (`recipe-planner/src/lib/units.ts`),
convert-or-split aggregation fix, removal of the `unit`-as-container-type overload,
one-shot product dedup + case-insensitive unique index on `products.name`, one-shot
node-unit normalization, recipe linter v1 (4 data-hygiene rules), and docs/schema
reconciliation (`decisions.md` step-aggregation wording + `pb_schema_updated.json`
re-export). Requirements DATA-01 through DATA-07. No new features — correctness fixes
plus minimum schema/enum scaffolding.

**Note on paths:** the app code lives under `recipe-planner/` (e.g.
`recipe-planner/src/lib/aggregation/…`, `recipe-planner/scripts/…`). The phase doc
sometimes omits that prefix.

</domain>

<decisions>
## Implementation Decisions

### Container type placement (phase doc §3.4 — now resolved)
- **D-01:** Container type stays **product-level only** (`products.container_type`).
  No per-node `container_type` relation this phase — no current data demonstrates the
  need, and manual two-DB schema edits are a standing risk to minimize.
- **D-02:** Record the revisit trigger explicitly in `decisions.md`: add a per-node
  container relation if/when a real recipe needs one stored product in different
  containers across recipes. Deliberate future decision, not an implicit gap.

### Linter v1 surface & rules (phase doc §4.6 — now resolved)
- **D-03:** Surface = **Lint button + findings panel on the Products registry page**
  (`recipe-planner/src/pages/registries/Products.tsx`) **plus** a headless
  `recipe-planner/scripts/lint.js` wrapping the same pure functions in
  `recipe-planner/src/lib/linter/`. No dedicated /lint route in v1 (defer to linter
  v2 in Phase 5 if the rule set grows to justify it).
- **D-04:** Rule 3 (missing store/section) ships with the **`SECTION_REQUIRED_STORES`
  set**: Safeway requires section; Costco, Trader Joes, and online/specialty require
  store only — formalizing `.claude/skills/recipe-import/SKILL.md:72-85`. Not
  store-only; the Safeway section gap has caused real misses (chives, crema, ancho
  chile).

### Dedup & backfill workflow (phase doc §4.4 — now resolved)
- **D-05:** Merge review format = **generated JSON decisions file + companion Markdown
  context report**. `find-duplicates.js` (extended) emits a human-readable report with
  candidate clusters, names side-by-side, and per-collection reference counts; the user
  edits a small JSON `{dupeId → survivorId, confirmed}` file, which is the ONLY input
  `merge-products.js` reads. The JSON file is the durable, diffable audit trail.
- **D-06:** Safety net (all mandatory): (1) rehearse the full flow (dedup → merge →
  backfill → normalize) against the **test** instance after a fresh
  `recipe-planner/scripts/sync-to-test.js` copy of prod; (2) snapshot prod via
  PocketBase's built-in **`pb.backups.create()`** immediately before the real run (no
  SSH/pb_data copying); (3) `merge-products.js` performs **pre-flight ID validation**
  (every ID in the map exists) before acting; (4) zero-orphan verification before any
  delete.
- **D-07:** Product-reference collections are enumerated against the **live DB / code**,
  never the stale `pb_schema_updated.json` (it omits `meal_variant_overrides`). Known
  set: `recipe_product_nodes.product`, `inventory_items.product`,
  `products.store_bought_product`, `meal_variant_overrides.replacement_product`.
- **D-08:** `canonical_unit` backfill: scripted inference with review; genuinely
  ambiguous products are left **null for linter rule 4 to surface** — never guessed.
  Node units matching neither enum nor alias are reported for manual resolution.

### Unit enum & display (phase doc §4.2/§4.3 — now resolved)
- **D-09:** Ship the proposed enum as-is — volume: `tsp, tbsp, fl_oz, cup, pint, qt,
  gal, ml, l`; mass: `g, kg, oz, lb`; count: `each`. Grep evidence shows real data only
  uses `each, cup(s), tbsp, lb(s), oz, qt, pint`. **No** dedicated `clove/bunch/head/can`
  enum members — alias count-words to `each` via `UNIT_ALIASES`; add count units only
  when a real recipe demonstrably loses shopping information.
- **D-10:** Merged-line display unit: convert into the product's `canonical_unit` when
  set (primary path). When null (edge case linter rule 4 drives to zero), fallback =
  **largest unit keeping quantity ≥ 1, capped at `cup` (volume) / `lb` (mass), never
  crossing metric↔customary within one promotion path**. Not the smallest-base-unit
  tie-break originally proposed in the phase doc §4.3 — "36 tsp" is unacceptable on the
  tablet in the store. Still fully deterministic (independent of node order).
- **D-11:** Fraction/human formatting (e.g. 0.375 cup vs 6 tbsp) is a **render-layer
  concern**, not `units.ts`. The conversion module stays exact and reviewable;
  human-friendly rounding happens only at display time.

### Claude's Discretion
- Dimension storage (§3.1 open question): the phase doc's proposal stands — store
  `dimension` on the product, auto-written from `canonical_unit` via the unit→dimension
  map so they can't drift. Planner may collapse to derive-only if it's cleaner; either
  way `canonical_unit` is the single source of truth.
- Exact conversion constants in `units.ts` — must be exact and covered by round-trip
  unit tests (a wrong factor silently corrupts every list); flag anything unusual for
  review.
- `mergeQuantities` shared-helper refactor vs inlining in both builders (§4.3) —
  implementer's choice.
- Lint findings panel UX (dialog vs collapsible section, grouping by rule vs by
  product) — keep it simple, findings link to the offending product/recipe.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase specification (primary)
- `.planning/phase-docs/phase-1-data-hygiene.md` — Authoritative elaborated phase doc:
  confirmed bugs with file:line evidence, data model changes (§3), ordered
  implementation plan (§4.1–4.7), dependencies (§5), 10 acceptance criteria (§6),
  risks (§7). The decisions above resolve its open questions; where this CONTEXT.md
  and the phase doc differ (e.g. D-10 display fallback), **this CONTEXT.md wins**.
- `plans/workflow-redesign.md` — Milestone decision record (Topic 2 = this phase);
  source of authority behind the phase doc.
- `.planning/phase-docs/00-overview.md` — Milestone decomposition; how Phase 1 gates
  Phases 2–5.

### Conventions & policies
- `.claude/skills/recipe-import/SKILL.md` (lines ~60–90) — Store/section conventions
  that linter rule 3 formalizes (`SECTION_REQUIRED_STORES`); prep-words rule alignment.
- `decisions.md` — Current (stale re: step aggregation) design record; §4.1 reconciles
  it to signature-based behavior. Also receives the D-02 container revisit note.
- `pb_schema_updated.json` — PB schema export; STALE (missing `meal_variant_overrides`,
  `recipe_queue`) until this phase re-exports it. Do not trust for relation enumeration.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — Layering (aggregation builders, data access).
- `.planning/codebase/CONCERNS.md` — Known fragilities: builder logic untested,
  aggregation edge mapping fragile, prod/test switch behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recipe-planner/scripts/find-duplicates.js` — existing dupe finder; extend to emit
  the D-05 Markdown report + JSON decisions file.
- `recipe-planner/scripts/sync-to-test.js` — copies records prod→test; the free
  rehearsal mechanism for D-06 (note: records only, NOT schema).
- `ExpandedProductNode` expand path — `Outputs.tsx` already expands
  `product.container_type` (`Outputs.tsx:262-263`), so §4.5's `containerTypeName`
  threading needs no new expand.

### Established Patterns
- Aggregation layer = pure builder functions (`recipe-planner/src/lib/aggregation/
  builders/product-builder.ts`, `step-builder.ts`) — linter follows the same
  pure-function shape (`LintFinding[]`).
- Scripts are plain Node.js, no CLI frameworks — dedup/backfill/normalize scripts match.
- PB schema managed via Admin UI on prod (:8090) AND test (:8091), then re-exported to
  `pb_schema_updated.json` in the same commit; no migrations directory.
- No test infrastructure exists yet for builder logic (CONCERNS.md) — `units.ts`
  round-trip tests will need a test runner decision by the planner.

### Integration Points
- `product-builder.ts:69,91` and `step-builder.ts:132-147` — the unit-blind merge sites.
- `RecipeEditor.tsx:397-400,485-488` — the overload write sites; also the unit-select
  conversion (§4.7).
- `aggregation.ts:334,388` — container-name read sites; switch to `containerTypeName`.
- `ShoppingListTab.tsx:181,191` — checkbox/row keying that needs the `lineId` split-line
  identity (Phase 2 depends on this key).
- `src/pages/registries/Products.tsx` — linter button/panel host.

</code_context>

<specifics>
## Specific Ideas

- Split shopping lines must have distinct, stable `lineId` identities
  (`${product.id}|${dimension}`), with `lineId === productId` for the common
  single-line case — this is the Phase 2 persisted-checkbox key, so get it right here.
- Per-source breakdown quantities display converted into the merged line's display
  unit so the breakdown visibly sums to the line total.
- Acceptance anchor: white-bean-stew olive oil (0.25 cup + 2 tbsp) renders as one
  correct converted line.

</specifics>

<deferred>
## Deferred Ideas

- Per-node container type relation — revisit trigger recorded in `decisions.md` (D-02);
  build only when real data demands it.
- Dedicated /lint page — reconsider with linter v2 (Phase 5).
- Dedicated count-dimension enum members (`clove`, `bunch`, `head`, `can`) — add only
  when a real recipe loses information aliasing to `each`.
- PB `select` conversion of `recipe_product_nodes.unit` — deferred until all values
  are confirmed enum members (phase doc §3.3).
- Import-time linting — Phase 6.

### Reviewed Todos (not folded)
- `nas-pocketbase-tailnet` (tailnet join + `db-config.ts` hostname switch) — reviewed,
  kept in Phase 2 where it is tagged (`resolves_phase: 2`); Phase 1 is pure data/logic
  with no connectivity dependency.

</deferred>

---

*Phase: 1-Data Hygiene*
*Context gathered: 2026-07-05*
