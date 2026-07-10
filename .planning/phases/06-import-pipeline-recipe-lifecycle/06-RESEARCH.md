# Phase 6: Import Pipeline & Recipe Lifecycle - Research

**Researched:** 2026-07-10
**Domain:** In-app structured-JSON import, PocketBase additive schema migration, recipe draft/publish lifecycle, shared graph-write service extraction, evolution (note→revision) loop
**Confidence:** HIGH (this is an internal-codebase phase — nearly every claim is verified against source files, not external docs)

## Summary

This phase is almost entirely **internal refactor + additive schema**, not new-library integration. The single highest-leverage move is extracting `RecipeEditor.handleSave()` (`recipe-planner/src/pages/RecipeEditor.tsx:657–825`) into a headless `buildRecipeGraph()` service reused by three callers: the import page, `/suggest-recipes` landing, and the evolution-clone write-back. The existing save routine already contains the exact local→DB id-remap contract (lines 704–762 for nodes, 796–813 for edges) the import JSON `ref` scheme was designed (D-01) to port into unchanged. No new runtime dependency is required — `ajv` exists only transitively at v6.12.6 and should **not** be adopted; the `{name+hints}` contract is small enough for a hand-written normalizing validator that surfaces failures without blocking (the phase's first-class invariant).

Schema work follows the established `apply-phase5-schema.mjs` pattern verbatim: an idempotent, existence-checking `.mjs` script pointed at test (`PB_URL=…:8091`) first, then prod (`…:8090`), authenticating as superuser from gitignored `.env.local`, re-exporting the canonical `pb_schema.json` **at repo root** after the test run. Two changes: add a `select status` to `recipes` (backfill all existing rows to `published`) and create a new `recipe_notes` collection. Draft invisibility is a **two-call-site filter change** (`WeekWizard.tsx` recipe load, `WeeklyPlans.tsx:153`) — the correctness-critical surface where a missed filter leaks a draft into a meal plan.

The evolution loop's integrity hinge (D-10) is node-id preservation on write-back: `meal_variant_overrides.original_node → recipe_product_nodes.id` (verified: relation to `pbc_9624381706`) and `planned_meals.recipe → recipes.id` (verified: relation to `pbc_5183946072`) are hard relations. Keeping the recipe id stable protects `planned_meals` for free; protecting overrides additionally requires a per-node correspondence link so unchanged cloned nodes write back onto their **original** node ids. This is the one place a minimal new linkage field is genuinely needed.

**Primary recommendation:** Extract `buildRecipeGraph()` as a pure-planner + thin-executor pair first (Wave 0), then build import, lifecycle filter, publish gate, and evolution loop on top of it. Add `status` to `recipes` and a `recipe_notes` collection via the `apply-phase5-schema.mjs` idiom. Use a hand-written contract validator, not `ajv`. Filter planning queries with `status != "draft"` (fail-open), never `status = "published"` (fail-closed).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Import JSON uses a `{name + optional hints}` product model — each product line carries `name`, `unit`, `quantity`, and optional hints (`matchProductId?`, `productType?`, `pantry?`, `fdcId?`, `store?`, `section?`). Steps carry the full Phase-5 metadata (`step_type`, `timing`, `active_minutes`, `passive_minutes`, `instructions`, `prep_action?`, `resource?`, `oven_temp_f?`, `rack_slots?`). Products/steps referenced by string `ref`s; edges are `{from: ref, to: ref}`. The `ref` convention mirrors RecipeEditor's `product-*` / `step-*` local-node ids so the existing id-remap logic ports directly. Rationale: an emitter needs no DB access to produce valid JSON.
- **D-02:** Inline-resolve, then land. At import, auto-match high-confidence product lines silently (via Phase-3 `searchProducts` fuse score gate); for unmatched / low-confidence lines, surface an inline resolution step (pick-existing / `QuickCreateProductDialog` / Search-USDA) before the draft finishes landing. This resolution step is part of import, not the publish gate — "importing never blocks" still holds.
- **D-03:** Add `select status: draft|published` to the `recipes` collection (mirrors existing `recipe_type` select). Migration backfills all existing recipes to `published`.
- **D-04:** Draft filter added to exactly two planning queries: `components/WeekWizard.tsx:102` (rotation-pool source) and `pages/WeeklyPlans.tsx:153` (Add-Meal picker). Leave unfiltered (drafts must stay visible): `pages/Recipes.tsx:86`, `pages/RecipeEditor.tsx:287`, `pages/registries/Products.tsx:128`, `pages/StepBackfill.tsx:145`.
- **D-05:** Import review happens in the existing RecipeEditor. Imported graph lands immediately as a `draft` via RecipeEditor's save path, then redirects into RecipeEditor. No separate read-only preview. (Post-import summary optional.)
- **D-06:** Publish gate = a "Publish" button inside RecipeEditor calling a new `runRecipeLint(recipeId)` wrapper composing `runStepLint(recipe_steps)` + product-scoped `runLint(referenced products)`; `runWeekLint` cannot participate. Failures render in the `Products.tsx:165` findings-dialog pattern. Status flips to `published` only on a clean pass. Draft recipes get a `<Chip>` badge in `Recipes.tsx` mirroring the Batch chip (lines 418–430).
- **D-07:** `/suggest-recipes` — propose in chat, land accepted. Skill prints 3–5 candidate summaries; only accepted candidates are built as drafts direct to prod via the D-01 contract + D-02 matching.
- **D-08:** Constraints computed where data allows (active-prep from step minutes, batch-prep from `recipe_type`+`timing`, overlap from `products`). Protein/macro floor is a soft heuristic with "estimated" note — hard filter not computable (`protein_g`/`kcal` = 0 across all products).
- **D-09:** Notes live in a new `recipe_notes` collection (`recipe` relation, `text`, `status` [pending/applied/dismissed], `source_surface`, `created`). Do not overload `recipe_queue` or `recipes.notes`. Pending queue = `status="pending"`; each note links to the draft it produced. Surfaces: cook mode, calendar cell, recipe card.
- **D-10:** Revision model = in-place branch. Agent pass clones target graph into a `draft` purely for review; on approval, the reviewed graph is written back onto the ORIGINAL recipe id (not a record swap). Keeping the recipe id stable keeps already-planned weeks and unchanged-node overrides valid automatically. Only genuinely removed/replaced nodes can dangle an override.
- **D-11:** Agent passes are manual skills (mirror recipe-import skill). A skill drains `status="pending"` notes → draft revisions; `/suggest-recipes` likewise manual. The week wizard (`WeekWizard.tsx`) renders the "updated per your note, review?" flag by checking each recipe for a linked pending draft revision.

### Claude's Discretion
- Exact fuse-score threshold for "confident match" vs "surface for inline resolve" in D-02 (researcher suggested ≈0.15) — tune during implementation.
- Whether to add the optional post-import summary screen (D-05).
- Shape of the `recipe_notes.source_surface` enum values and the review-flag UI treatment in the wizard.

### Deferred Ideas (OUT OF SCOPE)
- Automatic agent passes (PocketBase hook / cron turning notes into revisions with no manual skill run).
- Hard nutrition/macro filtering for `/suggest-recipes` (blocked on nutrition backfill).
- Read-only graph preview renderer distinct from RecipeEditor.
- `meal_variant_overrides` remap on node removal (the small residual dangling-override case) — targeted cleanup, not a general migration.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMP-01 | Recipes have draft/published lifecycle; drafts invisible to planning | `status` select via `apply-phase5-schema.mjs` idiom; backfill to `published`; two-call-site `status != "draft"` filter (§Schema Migration, §Draft Lifecycle) |
| IMP-02 | Import structured recipe JSON in-app, landing in prod as draft via shared graph-write path | `buildRecipeGraph()` extracted from `handleSave()` 657–825; import route in `App.tsx`; validator + product-resolve (§Graph-Write Spine, §JSON Contract) |
| IMP-03 | `recipe-import` skill emits JSON instead of scripts; test→prod migration ritual retired | Rewrite `.claude/skills/recipe-import/SKILL.md` to emit the D-01 contract; refresh stale `references/schema.md`; delete Step 6 promote-to-prod (§Skill Rewrite) |
| IMP-04 | `/suggest-recipes` proposes 3–5 import-ready candidates honoring four constraints | New manual skill reading `products` + `planned_meals`; constraints computed from step minutes / recipe_type / registry overlap; macro = soft (D-08) (§/suggest-recipes) |
| IMP-05 | One-tap note on a recipe from calendar / cook mode / recipe card | `recipe_notes` collection + `useRecipeNotes` hook mirroring `useRecipeQueue.ts`; attach buttons at 3 surfaces (§Evolution Loop) |
| IMP-06 | Agent pass turns pending notes into draft revisions, surfaced in week wizard | Manual skill drains `status="pending"`; `loadRecipe`+`buildRecipeGraph` clone; wizard flag via `revision_of` link (§Evolution Loop) |
| IMP-07 | Publishing gates on the recipe linter (import does not) | `runRecipeLint(recipeId)` composing `runStepLint`+`runLint`; Publish button in RecipeEditor; findings dialog (§Publish Gate) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| JSON contract validation/normalization | Client (import page, pure module) | — | No DB needed; runs in-browser before any write; must be unit-testable in isolation |
| Product name→id resolution (D-02) | Client (import page) | Database (products read) | Reuses Phase-3 `searchProducts` fuse matcher client-side; QuickCreateProductDialog writes new products |
| Graph write (recipe+nodes+steps+edges) | Client service `buildRecipeGraph()` | Database (PocketBase 8090) | Extracted from RecipeEditor; all writes are PB `create/update` via `lib/api.ts` |
| Draft/published gating | Database (query filter) | Client (Recipes badge) | Correctness lives in the `getAll` filter at two planning call sites; badge is cosmetic |
| Publish lint gate | Client (`runRecipeLint`) | Database (reads steps+products) | Pure rule functions in `lib/linter`; reads live records, composes existing aggregators |
| Note capture | Database (`recipe_notes`) | Client (attach buttons, hook) | New collection; CRUD hook mirrors `useRecipeQueue` |
| Note→revision agent pass | Manual skill (Claude Code) | Database + `buildRecipeGraph` | D-11: human-reviewable, run from inside `recipe-planner/` against live PB |
| `/suggest-recipes` proposal | Manual skill (Claude Code) | Database (products+plans read) | D-07: chat-first, confirm-before-write |
| Schema migration | One-off `.mjs` script | Database (both instances) | Idempotent superuser script, test-first, per `apply-phase5-schema.mjs` |

## Standard Stack

### Core (all already present — no installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pocketbase` (JS SDK) | ^0.26.5 | All DB reads/writes + `pb.collections.create/update` for schema | [VERIFIED: recipe-planner/package.json devDependencies] — established, drives every existing script |
| `fuse.js` | 7.4.2 | Product confidence-match gate (D-02) via `searchProducts` | [VERIFIED: package.json + src/lib/search/product-search.ts] — already the single search surface |
| `@xyflow/react` (ReactFlow) | ^12.10.0 | RecipeEditor graph canvas (review surface) | [VERIFIED: package.json] — the import review UI is the existing editor (D-05) |
| `dagre` | ^0.8.5 | Auto-layout on recipe load (positions non-load-bearing for import) | [VERIFIED: RecipeEditor.tsx loadRecipe applies dagre; positions recomputed on load] |
| `@mui/material` | ^7.3.6 | Import page form, badge `<Chip>`, findings `<Dialog>` | [VERIFIED: package.json] — Batch chip & lint dialog patterns already exist |
| `vitest` | ^4.1.10 | Unit tests for validator, graph-write planner, lint composition | [VERIFIED: package.json + vitest.config.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | ^4.23.0 | Run `.ts` scripts directly (already used by `scripts/lint.js`) | Only if a migration/skill helper is authored in TS; `.mjs` is the schema-script convention |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written contract validator | `ajv` (present transitively @6.12.6) | `ajv` is **not a direct dependency** — it's pulled in by tooling; relying on a transitive is fragile, v6 is old, and its throw-on-invalid model fights the "importing never blocks / normalize-and-surface" invariant. Recommend hand-written normalizer. `[VERIFIED: node_modules/ajv/package.json = 6.12.6; absent from package.json deps]` |
| Extending `searchProducts` in place | Add `searchProductsScored()` sibling | `searchProducts` sets `includeScore: true` but **discards the score** (`.map(r => r.item.__original)`, product-search.ts:53). The D-02 confidence gate needs the numeric score, so a scored variant (or a small `scoreProduct(query, products)` returning `{product, score}[]`) is required. `[VERIFIED: product-search.ts:52-53; grep found zero score consumers]` |

**Installation:** None. No new runtime packages. All schema/skill work uses existing `pocketbase` + `.mjs` scripts.

## Package Legitimacy Audit

> No external packages are installed this phase. Every capability is built from packages already in `recipe-planner/package.json` (verified present). `ajv` appears in `node_modules` at 6.12.6 but only transitively; it is **not** recommended for adoption (see Alternatives Considered).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new installs) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Schema Migration Mechanics

**Mechanism (VERIFIED against `recipe-planner/scripts/apply-phase5-schema.mjs`):** additive schema changes are applied by a single idempotent `.mjs` script that:
1. Reads `PB_URL` env (`http://192.168.50.95:8091` test / `…:8090` prod, prod default) so the **same** script rehearses on test before prod.
2. Authenticates as superuser via `pb.collection("_superusers").authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD)`, both sourced from gitignored `recipe-planner/.env.local` (`node --env-file=.env.local scripts/…`). Never printed, never committed.
3. Existence-checks before mutating (`getCollectionSafe` swallows 404; field-add filters on `!existingNames.has(f.name)`), so **re-running is a no-op**.
4. For a field add: fetches the live collection, appends only new fields, asserts no existing field is dropped, then `pb.collections.update(collection.id, { fields: mergedFields })` (PB replaces the whole array).
5. For a new collection: `pb.collections.create({ name, type:"base", listRule:"", …, fields, indexes })`.
6. After the **test** run only, re-exports the live schema to the canonical mirror at **repo root** `../../pb_schema.json` (NOT `recipe-planner/pb_schema.json` — moved to root in Phase 1 Plan 08). `[VERIFIED: apply-phase5-schema.mjs:51-55,432-437]`

Prior precedent confirmed: Phase 5 added the 7 `recipe_steps` fields; Phase 3 `add-product-nutrition-fields.js` added nullable product fields; Phase 1 added `canonical_unit`. `sync-to-test.js` copies prod→test preserving IDs.

### Concrete change 1 — `recipes.status` (D-03)
Add one select field mirroring the existing `recipe_type` shape `[VERIFIED: pb_schema.json recipes collection has select_recipe_type with values ["meal","batch_prep"]]`:

```js
// append to recipes.fields
{
  id: "select_status",
  name: "status",
  type: "select",
  required: false,
  hidden: false, presentable: false, system: false,
  maxSelect: 1,
  values: ["draft", "published"],
}
```

**Backfill in the SAME script, after the field add** — critical because a PocketBase select that is un-set returns `""`, and an empty-string status would be treated as a draft by a naive `status="published"` filter (see Pitfall 1). Backfill every existing recipe:

```js
const recipes = await pb.collection("recipes").getFullList();
for (const r of recipes) {
  if (r.status !== "published") await pb.collection("recipes").update(r.id, { status: "published" });
}
```

### Concrete change 2 — new `recipe_notes` collection (D-09)
Model on the `recipe_queue` relation shape `[VERIFIED: pb_schema.json recipe_queue → recipe relation to pbc_5183946072]` plus the fields D-09 names. Recommended fields:

```js
fields: [
  { id: "text_id", name: "id", type:"text", system:true, primaryKey:true, required:true,
    min:15, max:15, pattern:"^[a-z0-9]+$", autogeneratePattern:"[a-z0-9]{15}" },
  { id: "relation_note_recipe", name:"recipe", type:"relation", required:true,
    collectionId:"pbc_5183946072", maxSelect:1, minSelect:0, cascadeDelete:true },
  { id: "text_note_text", name:"text", type:"text", required:true, min:0, max:0 },
  { id: "select_note_status", name:"status", type:"select", maxSelect:1,
    values:["pending","applied","dismissed"] },
  { id: "select_note_source", name:"source_surface", type:"select", maxSelect:1,
    values:["cook_mode","calendar","recipe_card"] },  // Claude's discretion on exact enum
  { id: "relation_note_draft", name:"draft_revision", type:"relation", required:false,
    collectionId:"pbc_5183946072", maxSelect:1, minSelect:0, cascadeDelete:false }, // links note → draft it produced (D-09)
  { id: "autodate_note_created", name:"created", type:"autodate", onCreate:true },
  { id: "autodate_note_updated", name:"updated", type:"autodate", onCreate:true, onUpdate:true },
]
```

### Concrete change 3 — evolution-loop linkage on `recipes` (needed for D-10/D-11)
Add a nullable `revision_of` relation on `recipes` (draft → original published recipe). This gives (a) the wizard flag "does published recipe R have a pending draft revision?" (query drafts where `revision_of = R.id && status="draft"`), and (b) the write-back its target id. See §Evolution Loop for the node-correspondence field decision.

```js
{ id:"relation_revision_of", name:"revision_of", type:"relation", required:false,
  collectionId:"pbc_5183946072", maxSelect:1, minSelect:0, cascadeDelete:false }
```

Also register `recipeNotes: "recipe_notes"` in the `collections` map in `src/lib/api.ts` `[VERIFIED: api.ts:51-73 is the name map]`, and add `Recipe.status`, `Recipe.revision_of`, and a `RecipeNote` interface to `src/lib/types.ts` `[VERIFIED: types.ts:73-77 Recipe interface has no status field]`.

## Architecture Patterns

### System Data Flow

```
                          IMPORT PATH (IMP-02)
  paste JSON ──▶ validateImportJson() ──▶ resolveProducts()
   (in page)     (pure, normalize,        (auto-match via scoreProduct
                  never throws)            gate ≈0.15; unmatched ▶ inline
                        │                   QuickCreateProductDialog / USDA)
                        ▼                          │
                 normalized graph ◀────────────────┘ (every line now has product id)
                        │
                        ▼
            buildRecipeGraph(graph, {status:"draft"})   ◀── shared service
                        │  (create recipe + nodes + steps + edges,
                        │   local ref→dbId remap)
                        ▼
              draft recipe in PROD  ──▶ redirect /recipes/:id (RecipeEditor review, D-05)
                                              │
                                        [Publish button] ──▶ runRecipeLint(id)
                                              │                 (runStepLint + runLint)
                                     clean? ──┴── fail ──▶ findings Dialog (never writes status)
                                        │
                                        ▼  status = "published"

                          PLANNING PATH (IMP-01)
  WeekWizard recipe load ─┐
  WeeklyPlans Add-Meal   ─┴─▶ getAll(recipes, {filter:'status != "draft"'})  ◀── drafts excluded
  Recipes list / Editor / Products / StepBackfill ──▶ getAll(recipes)        ◀── unfiltered (drafts visible+badged)

                          EVOLUTION PATH (IMP-05/06)
  one-tap note ──▶ recipe_notes {recipe, text, status:"pending", source_surface}
                        │
   manual skill drains status="pending" ──▶ loadRecipe(orig) ──▶ buildRecipeGraph(clone,
                        │                                          {status:"draft", revision_of:orig,
                        │                                           preserve source_node links})
                        ▼
              draft revision R'  ──▶ wizard flags orig ("review?") ──▶ RecipeEditor review
                        │
                 approve ──▶ writeBackOntoOriginal(R', orig.id)  ◀── keeps recipe id + unchanged node ids
                        │        (planned_meals + overrides stay valid, D-10)
                        ▼  note.status="applied", draft cleaned up
```

### Pattern 1: Extracted `buildRecipeGraph()` service (the spine)
**What:** A headless port of `handleSave()` (RecipeEditor.tsx:657–825) that takes a normalized graph and does the create/update writes with local-ref→dbId remapping.
**When to use:** import landing, `/suggest` landing, evolution clone, evolution write-back.
**Must NOT depend on:** ReactFlow `nodes`/`edges` state, `setNodeDbIds`/`setState`, `navigate`, component-local `name`/`notes`/`recipeType`/`selectedTags`. All inputs are plain data.

Recommended signature (a **pure planner + thin executor** split so the id-remap logic is unit-testable without a live PB):

```typescript
// Source: derived from RecipeEditor.tsx handleSave (657-825) + loadRecipe (272-368)
interface NormalizedGraph {
  recipe: { name: string; notes?: string; recipe_type: "meal" | "batch_prep";
            status?: "draft" | "published"; revision_of?: string };
  tagIds: string[];
  productNodes: { ref: string; productId: string; quantity?: number; unit?: string;
                  mealDestination?: string; sourceNode?: string /* orig node id for write-back */ }[];
  steps: { ref: string; name: string; step_type: "prep"|"assembly"; timing?: "batch"|"just_in_time";
           active_minutes?: number; passive_minutes?: number; instructions?: string;
           prep_action?: string; resource?: string; oven_temp_f?: number; rack_slots?: number;
           sourceNode?: string }[];
  edges: { from: string; to: string }[];   // refs; direction inferred from product-*/step-* prefix
}

// remapSeed pre-populates ref→existingDbId (for update-in-place / write-back).
// Returns the full ref→dbId map (mirrors handleSave's newNodeDbIds return).
async function buildRecipeGraph(
  graph: NormalizedGraph,
  opts?: { recipeId?: string; remapSeed?: Record<string, string> }
): Promise<{ recipeId: string; nodeDbIds: Record<string, string> }>
```

**The id-remap contract (VERIFIED from handleSave):**
- Node refs `product-<x>` / `step-<x>`; edge direction is inferred from the ref prefix (`edge.source.startsWith("product")`), lines 789–794 — the JSON `ref` scheme (D-01) must keep this prefix convention so this ports unchanged.
- A ref already in `remapSeed`/`nodeDbIds` → `update` in place; a ref not present → `create`, then record `newNodeDbIds[ref] = created.id` (lines 707, 721–733, 752–760).
- Edges are **fully deleted then recreated** each save (lines 767–785), and skipped if either endpoint's dbId is missing (`if (!sourceDbId || !targetDbId) continue;`, line 799).
- `position_x/position_y` are written from ReactFlow but are **not load-bearing** — `loadRecipe` re-runs dagre layout on read (lines 249–267, 331). Import may pass `{x:0,y:0}`.

RecipeEditor's `handleSave` should be refactored to build a `NormalizedGraph` from its ReactFlow state and delegate to `buildRecipeGraph`, so there is exactly one write path.

### Pattern 2: JSON contract validation (hand-written normalizer)
**What:** `validateImportJson(raw): { ok: true; graph: NormalizedGraph } | { ok: false; errors: ImportError[] }`. Structural validation + normalization only; **never throws, never blocks** — surfaces a list of problems the import UI renders inline (D-02 inline-resolve is a UI step, not a hard gate).
**When to use:** first step of the import page, before product resolution.
**Failure modes to surface (not block):** malformed JSON parse error; product line missing `name`/`unit`; step missing `step_type`; edge `ref` pointing at a non-existent node; `resource`/`prep_action`/`timing` value outside the enum (normalize to `undefined` + warn, matching `loadRecipe`'s `|| undefined` treatment, RecipeEditor.tsx:359-366).

### Pattern 3: Two-call-site draft filter (D-04)
`getAll(collections.recipes, {...})` already accepts a `filter` option `[VERIFIED: api.ts:5-15, getFullList passes filter]`. Add exactly:
- `components/WeekWizard.tsx` recipe load (the `getAll<Recipe>(collections.recipes, { sort: "name" })` inside the `Promise.all`, ~line 103) → `{ sort:"name", filter:'status != "draft"' }`.
- `pages/WeeklyPlans.tsx:153` (`getAll<Recipe>(collections.recipes, { sort:"name" })`) → same.
Leave the four unfiltered surfaces untouched (Recipes list, RecipeEditor, Products, StepBackfill). Use `status != "draft"` not `status = "published"` — see Pitfall 1.

### Anti-Patterns to Avoid
- **Duplicating the graph-write logic** in the import page instead of extracting `buildRecipeGraph`. The remap + edge-recreate + Phase-5 step-field handling is subtle; a second copy will drift.
- **`status = "published"` filter.** Fails closed on un-set/empty status → a recipe silently vanishes from planning. Use `status != "draft"`.
- **Record-swap on approval** (mint a new recipe id). D-10 forbids it: it dangles every `planned_meals.recipe` and every override.
- **Blocking import on lint or on unmatched products.** The invariant is "importing never blocks; publishing is the only hard block."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recipe graph write | New import-specific create routine | Extracted `buildRecipeGraph()` from handleSave 657–825 | Remap + edge direction + Phase-5 step fields already correct & battle-tested |
| Full-graph read (clone source) | New multi-collection fetch | `RecipeEditor.loadRecipe()` (272–305) reads all 6 collections by `recipe=` filter | Exact read half of the evolution clone |
| Product fuzzy matching | New matcher | `searchProducts` + a scored sibling (product-search.ts) | One tuned Fuse config across the app (REG-02); a divergent matcher reintroduces near-dupe bugs |
| Unmatched-product create | Bare `products.create({name})` | `QuickCreateProductDialog` (`onCreated` callback) | Guarantees store/section/unit — D-02's whole point; bare create caused the shopping-list-dropout bug |
| Per-recipe lint | New rule functions | `runRecipeLint = runStepLint + runLint` wrapper in linter/index.ts | Rules already exist; wrapper is pure composition |
| Note CRUD hook | New pattern | `useRecipeNotes` mirroring `useRecipeQueue.ts` | Identical create/getAll/remove + refresh shape |
| JSON schema validation | `ajv` (transitive) | Hand-written normalizer | Small contract; must normalize-and-surface, not throw-and-block |

**Key insight:** Nearly every "new" capability in this phase is a thin composition or relocation of Phase 1–5 code. The risk is not missing a library — it's *re-implementing* an existing primitive slightly differently and reintroducing a solved bug (near-duplicate products, unscaled quantities, dropped shopping lines).

## Runtime State Inventory

> Rename/refactor concerns are minor here (extraction, not rename), but the schema + skill changes touch runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `recipes` rows on **both** prod (8090) and test (8091) need `status` backfilled to `published` — an un-set select returns `""` and would read as non-published. | Data migration inside the schema `.mjs` (backfill loop), run on both instances |
| Live service config | PocketBase collection schemas live in each PB instance's own SQLite, **not** in git (only the exported `pb_schema.json` mirror is). New `status` field, `recipe_notes` + `revision_of` must be applied to both instances via the script. | API mutation via `pb.collections.create/update`; re-export mirror after test run |
| OS-registered state | None — no OS-level registrations reference recipe lifecycle. | None (verified: no Task Scheduler / systemd / pm2 involvement in this phase) |
| Secrets/env vars | `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` in gitignored `recipe-planner/.env.local` required to run the migration; unchanged names. | None (reuse existing creds via `--env-file=.env.local`) |
| Build artifacts | The `.claude/skills/recipe-import/references/schema.md` is **stale** (predates Phase 5, lacks `active_minutes`/`passive_minutes`/`instructions`/`prep_action`/`resource`/`oven_temp_f`/`rack_slots`). The skill's Step 4/6 script-generation + test→prod promote flow is being retired. | Rewrite SKILL.md to emit D-01 JSON; refresh schema.md; delete promote-to-prod ritual |

**The canonical question — after every repo file is updated, what runtime systems still hold old state?** Both PocketBase instances (schema + backfilled data) and the recipe-import skill's stale reference doc. Nothing else.

## Common Pitfalls

### Pitfall 1: Un-set select reads as empty string, not the "default"
**What goes wrong:** After adding `status`, existing rows return `status = ""` until backfilled; a `filter: 'status = "published"'` treats them as non-published and they **vanish from planning**.
**Why it happens:** This PB version has no field-level `default` (confirmed in apply-phase5-schema.mjs:12-14 — "zero default keys anywhere in pb_schema.json"). An un-set select is `""`.
**How to avoid:** (1) Backfill all existing recipes to `published` in the same migration script; (2) use `filter: 'status != "draft"'` (fail-open) at the two planning call sites; (3) ensure every recipe-create path sets status explicitly.
**Warning signs:** Recipes missing from the WeekWizard pool or Add-Meal picker right after the migration.

### Pitfall 2: Node-id churn on write-back dangles overrides
**What goes wrong:** Writing the reviewed graph onto the original recipe by delete-all-nodes + recreate mints new `recipe_product_nodes.id`s → every `meal_variant_overrides.original_node` for that recipe dangles.
**Why it happens:** `meal_variant_overrides.original_node → recipe_product_nodes.id` is a hard relation `[VERIFIED: pb_schema.json → collectionId pbc_9624381706]`; overrides key on node id, not recipe id.
**How to avoid:** Preserve node ids for unchanged nodes on write-back — requires per-node correspondence (see §Evolution Loop) so unchanged clone nodes `update` their original node in place rather than create fresh.
**Warning signs:** Ingredient swaps disappearing from already-planned meals after a revision is approved.

### Pitfall 3: Recipe-create paths that forget `status`
**What goes wrong:** RecipeEditor "New Recipe" (`handleSave` isNew branch, 667–673) currently creates a recipe with no status; under `status != "draft"` it reads as published (fine), but if the team later switches to `status = "published"` it vanishes.
**Why it happens:** `handleSave` create omits `status` (`[VERIFIED: RecipeEditor.tsx:668-672 sets only name/notes/recipe_type]`).
**How to avoid:** Decide the default for hand-authored new recipes (recommend explicit `status:"published"` to preserve old behavior; import/evolution explicitly set `"draft"`). Flag as Open Question 1.
**Warning signs:** New hand-authored recipes behaving inconsistently vs imported ones.

### Pitfall 4: `runWeekLint` cannot participate in the publish gate
**What goes wrong:** Attempting to include the `missing-pull-step` rule in `runRecipeLint`.
**Why it happens:** `runWeekLint(weekGraph, consumedStoredInputs)` needs a whole `WeekGraph` + cross-recipe consumption list — inputs that don't exist for a single unplanned recipe `[VERIFIED: linter/index.ts:87-92, 17-19]`.
**How to avoid:** `runRecipeLint` composes only `runStepLint(steps)` + `runLint(products)` (D-06). Document that pull-step correctness remains a week-scoped, cook-mode "Check plan" concern, not a publish gate.

### Pitfall 5: fuse score is discarded by `searchProducts`
**What goes wrong:** Building the D-02 confidence gate on `searchProducts` and finding no score to threshold on.
**Why it happens:** `searchProducts` sets `includeScore:true` but returns `result.item.__original`, dropping the score (`[VERIFIED: product-search.ts:52-53]`).
**How to avoid:** Add a `scoreProduct(query, products): {product, score}[]` sibling in `product-search.ts` reusing the same `FUSE_OPTIONS`; gate on score (lower = better; ≈0.15 suggested, tune).

## Code Examples

### `runRecipeLint` wrapper (D-06, IMP-07)
```typescript
// Source: composition over recipe-planner/src/lib/linter/index.ts (runStepLint 77-79, runLint 67-74)
import { runStepLint, runLint, type LintFinding, type ProductExpanded } from "./index";
import { getOne, getAll, collections } from "../api";
import type { Recipe, RecipeStep, RecipeProductNode } from "../types";

export async function runRecipeLint(recipeId: string): Promise<LintFinding[]> {
  const [steps, nodes] = await Promise.all([
    getAll<RecipeStep>(collections.recipeSteps, { filter: `recipe="${recipeId}"` }),
    getAll<RecipeProductNode>(collections.recipeProductNodes, {
      filter: `recipe="${recipeId}"`, expand: "product",
    }),
  ]);
  // Product-scoped runLint needs the ProductExpanded shape (store/section/container_type expand
  // + this product's node units). Fetch referenced products expanded, attach their nodes —
  // mirror Products.tsx:150-164 enrichment. runWeekLint is intentionally excluded (Pitfall 4).
  const products: ProductExpanded[] = /* build from expanded nodes, group units by product */ [];
  return [...runStepLint(steps), ...runLint(products)];
}
```

### Publish button flow (RecipeEditor, findings dialog per Products.tsx:165)
```typescript
// Source: pattern from pages/registries/Products.tsx:164-166
const findings = await runRecipeLint(id!);
if (findings.length > 0) { setFindings(findings); setLintDialogOpen(true); return; } // never writes status
await update(collections.recipes, id!, { status: "published" });
```

### Scored product match (fills the D-02 gate gap)
```typescript
// Source: extends recipe-planner/src/lib/search/product-search.ts (reuses FUSE_OPTIONS)
export function scoreProduct<T extends Product>(query: string, products: T[]): { product: T; score: number }[] {
  const indexed = products.map((p) => ({ ...p, _sortedTokens: toSortedTokens(p.name), __original: p }));
  return new Fuse(indexed, FUSE_OPTIONS).search(query)
    .map((r) => ({ product: r.item.__original, score: r.score ?? 1 }));
}
// D-02: score <= ~0.15 → auto-match silently; else surface for inline resolve.
```

## Evolution Loop — Concrete Mechanism (D-10, D-11)

**Draining pending notes (manual skill, D-11):**
1. Skill (run from inside `recipe-planner/`, using its `node_modules` pocketbase — per the SKILL convention `[VERIFIED: recipe-import SKILL.md:246-247]`) queries `recipe_notes` where `status="pending"`, grouped by `recipe`.
2. For each target recipe R: `loadRecipe`-equivalent read (6 collections by `recipe="R"`, RecipeEditor.tsx:279-305) → build a `NormalizedGraph`, applying the note's intent (agent edits step text / quantities / adds nodes).
3. **Set `sourceNode` on each cloned node = the original node's id** (this is the correspondence link that makes write-back id-stable). New nodes the revision adds have no `sourceNode`.
4. `buildRecipeGraph(clone, {status:"draft", revision_of:"R"})` → draft R'. Set `recipe_notes.draft_revision = R'.id`, leave note `status="pending"` until reviewed (or add an `in_review` state).

**Wizard flag (D-11):** `WeekWizard` checks, per published recipe R in the pool, whether any recipe exists with `revision_of = R.id && status = "draft"`; if so render "updated per your note, review?". One extra `getAll(recipes, {filter:'revision_of != "" && status="draft"'})` up front, indexed client-side by `revision_of`.

**Approval write-back (the D-10 crux):** Given draft R' (with per-node `source_node` links) approved:
1. Read R' graph and R's current node ids.
2. Build a `NormalizedGraph` from R', seeding `remapSeed[ref] = sourceNode` for every cloned node that carries a `source_node` still present on R. → those nodes `update` in place onto the **original** node ids (overrides preserved).
3. Call `buildRecipeGraph(reviewedGraph, {recipeId: "R", remapSeed})`. Recipe id stays R (planned_meals valid); unchanged node ids stay (overrides valid); edges are recreated (edge ids don't matter — nothing relates to them).
4. Original nodes with **no** corresponding reviewed node are deleted → the only dangling-override case, explicitly the smaller blast radius D-10 accepts (cleanup deferred).
5. Set `recipe_notes.status="applied"`, delete/archive draft R'.

**Minimal linkage fields required (recommendation):**
- `recipes.revision_of` (relation, draft→original) — for the wizard flag + write-back target. **Required.**
- `recipe_notes.draft_revision` (relation, note→draft) — D-09 "each note links to the draft it produced." **Required.**
- **Node correspondence** for override integrity. Two options:
  - **(A, recommended) `recipe_product_nodes.source_node`** (nullable relation to `recipe_product_nodes`): explicit, survives across sessions, directly seeds the write-back remap. Adds one field to a graph collection.
  - **(B) No new node field**, store the `{origNodeId: cloneNodeId}` map as JSON on R' or on `recipe_notes`: avoids a schema field but couples correspondence to a text blob and is easy to desync. Prefer (A).

## /suggest-recipes (D-07, D-08, IMP-04)

Manual skill (mirrors recipe-import). Reads `products` (registry) + `planned_meals`/`recipes` (recent plans). Computes, per candidate it drafts:
- **Registry overlap %** — fraction of candidate ingredients matching existing `products` via `scoreProduct` (target ≈80%+, D-08).
- **Active prep time** — sum of `recipe_steps.active_minutes` (low = good); passive time acceptable `[VERIFIED: types.ts:118-119 fields exist]`.
- **Batch-prep fit** — `recipe_type` + step `timing` (`batch` vs `just_in_time`).
- **Protein/macro floor** — **soft heuristic with explicit "estimated" note** (D-08). Hard filter not computable: `protein_g`/`kcal` are 0/null across products `[VERIFIED: types.ts:60-69 nullable, populated only at later backfill; STATE.md Decision D-08]`.

Prints 3–5 summaries in chat; only **accepted** candidates are built as drafts via the D-01 contract + `buildRecipeGraph({status:"draft"})`. No junk drafts.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-recipe `import-*.js` script → test DB → verify → `migrate-*.js` promote to prod | In-app JSON import page landing a draft directly in prod; test DB for schema/code only | Phase 6 (this) | Retires the PC-bound migration ritual (IMP-03); recipe-import skill emits JSON not scripts |
| recipe-import skill Step 2 Mermaid + Step 4/6 script gen + promote | Skill emits the D-01 `{name+hints}` JSON contract for the import page | Phase 6 | SKILL.md rewrite; `references/schema.md` refresh (stale since Phase 5) |
| Recipes always plannable | draft/published lifecycle; drafts excluded at 2 call sites | Phase 6 | IMP-01 |

**Deprecated/outdated:**
- `.claude/skills/recipe-import/references/schema.md` — predates Phase 5, missing 7 step fields; must be refreshed to the D-01 contract.
- recipe-import SKILL.md Steps 4–6 (script generation, test-DB run, promote-to-prod) — replaced by JSON emission.

## Validation Architecture

> Nyquist validation is enabled (no `workflow.nyquist_validation:false` found in config). Section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 `[VERIFIED: package.json, vitest.config.ts]` |
| Config file | `recipe-planner/vitest.config.ts` (environment: `node`, include `src/**/*.test.ts` + `scripts/**/*.test.js`) |
| Quick run command | `cd recipe-planner && npx vitest run src/lib/<file>.test.ts` |
| Full suite command | `cd recipe-planner && npm test` (currently ~194 tests, 24 files, green) |
| Constraint | **No jsdom/DOM env** (`[VERIFIED: vitest.config.ts:3-4 comment]`) — component-level UI is not unit-testable this phase. Logic must be extracted into **pure modules** to be covered. |

### Phase Requirements → Test Map (observable behaviors)
| Req ID | Behavior to validate | Test Type | Automated Command | File Exists? |
|--------|----------------------|-----------|-------------------|-------------|
| IMP-01 | Draft recipe never appears in the WeekWizard pool / Add-Meal picker; published + un-set do | unit (filter builder) | `npx vitest run src/lib/lifecycle/draft-filter.test.ts` | ❌ Wave 0 |
| IMP-02 | Malformed JSON never yields a partial write — `validateImportJson` returns errors, no `buildRecipeGraph` call | unit | `npx vitest run src/lib/import/validate-import.test.ts` | ❌ Wave 0 |
| IMP-02 | `planGraphWrites(graph, seed)` emits correct create-vs-update ops + edge remap for a fixture graph | unit (pure planner) | `npx vitest run src/lib/import/graph-write.test.ts` | ❌ Wave 0 |
| IMP-02 | Product resolution: high-score auto-matches, low-score flagged for inline resolve | unit | `npx vitest run src/lib/search/product-search.test.ts` (extend) | ⚠️ extend existing |
| IMP-07 | Publish blocked when a step lint rule fails; status unchanged | unit | `npx vitest run src/lib/linter/recipe-lint.test.ts` | ❌ Wave 0 |
| IMP-07 | Import path never invokes lint (invariant) | unit/assertion | covered in validate-import + graph-write tests | ❌ Wave 0 |
| IMP-10 (D-10) | Write-back keeps `planned_meals.recipe` id stable and unchanged-node ids stable (override survives); removed node → dangling override flagged | unit (pure remap planner) | `npx vitest run src/lib/import/write-back.test.ts` | ❌ Wave 0 |
| IMP-05 | Note create/list/drain hook shape | unit or manual | `useRecipeNotes` mirrors `useRecipeQueue` (untested today) | manual-only (hook) |
| IMP-04 | Registry-overlap / active-time / batch-fit computation on a fixture | unit | `npx vitest run src/lib/suggest/constraints.test.ts` | ❌ Wave 0 (if extracted) |

Manual-only (justified): the import **page** UI, RecipeEditor Publish button, note-attach buttons, and the wizard review flag are React components with no jsdom env — validated via live UAT on the tablet/NAS, not Vitest. Mitigation: push all logic (validation, remap planning, lint composition, constraint math) into pure `src/lib/*` modules that **are** unit-tested; keep components as thin wiring.

### Sampling Rate
- **Per task commit:** `npx vitest run` on the touched `src/lib/**` test file(s).
- **Per wave merge:** `npm test` (full suite green).
- **Phase gate:** full suite green + `npx tsc --noEmit` clean before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/lib/import/validate-import.test.ts` — covers IMP-02 (never-throw normalizer)
- [ ] `src/lib/import/graph-write.test.ts` — covers IMP-02 (pure `planGraphWrites` create/update/edge remap)
- [ ] `src/lib/import/write-back.test.ts` — covers D-10/IMP-06 (node-id preservation + dangling detection)
- [ ] `src/lib/lifecycle/draft-filter.test.ts` — covers IMP-01 (filter string builder; `status != "draft"` semantics incl. empty)
- [ ] `src/lib/linter/recipe-lint.test.ts` — covers IMP-07 (`runRecipeLint` composes step+product, excludes week)
- [ ] Extend `src/lib/search/product-search.test.ts` — `scoreProduct` gate
- [ ] (recommended architecture) extract a pure `planGraphWrites(graph, remapSeed)` from the PB-executing `buildRecipeGraph` so the id-remap logic is testable without a live PocketBase. Framework already installed — no new deps.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PocketBase prod | All landing/publish writes | ✓ (NAS) | 0.26.x @ `192.168.50.95:8090` | — |
| PocketBase test | Schema-migration rehearsal | ✓ (NAS) | 0.26.x @ `192.168.50.95:8091` | — |
| `pocketbase` JS SDK | reads/writes + `pb.collections.*` schema | ✓ | ^0.26.5 | — |
| `PB_SUPERUSER_*` creds | schema migration script | ✓ (gitignored `.env.local`) | — | — |
| Vitest | unit validation | ✓ | ^4.1.10 | — |
| Node.js `--env-file` | run migration with `.env.local` | ✓ (used in Phase 5) | — | — |

**Missing dependencies with no fallback:** none — this phase adds no external dependency.
**Note (non-blocking):** the `nas-pocketbase-tailnet` todo (STATE.md) is still open — phone/store use over the tailnet is unverified. It does **not** block local development or the import/lifecycle build (LAN works). Phone-based import (a D-01 use case) needs it before real-world phone use.

## Security Domain

> `security_enforcement` not explicitly `false`; section included. This is a **self-hosted, single-household, trusted-network** app with no auth (`[VERIFIED: pb_schema.json recipes has empty listRule/createRule/etc = open]`), so the surface is small.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No user auth (single household, trusted LAN/tailnet); superuser creds only for admin scripts, in gitignored `.env.local` |
| V3 Session Management | no | n/a |
| V4 Access Control | no | Open PB rules by design (documented existing posture) |
| V5 Input Validation | **yes** | `validateImportJson` normalizes pasted JSON; product `ref` integrity checked; enum values normalized — the primary new input surface |
| V6 Cryptography | no | No secrets handled beyond existing PB superuser creds (unchanged) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/oversized pasted import JSON | Tampering / DoS | `validateImportJson` bounds + never-throw; import is manual, single user |
| Partial graph write on validation failure | Tampering (data integrity) | Validate fully before any `buildRecipeGraph` call; land as a single logical draft |
| Draft leaking into a live meal plan | (data integrity, not security) | `status != "draft"` filter at exactly the two planning call sites (D-04) |
| Secret leakage in migration script | Info disclosure | Reuse the established pattern: creds from `.env.local`, never printed/committed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ajv@6.12.6` is only a transitive dep and its throw-model is a poor fit for the never-block invariant | Standard Stack / Alternatives | Low — confirmed absent from `package.json` deps; if a schema-validation need grows, adding `ajv` directly is a small change |
| A2 | Positions (`position_x/y`) are non-load-bearing for import because `loadRecipe` re-runs dagre | Pattern 1 | Low — verified loadRecipe applies dagre; worst case imported graph opens with a re-layout |
| A3 | `revision_of` on `recipes` + `source_node` on `recipe_product_nodes` are the minimal linkage for D-10 write-back integrity | Evolution Loop | Medium — this is a design recommendation, not a locked decision; the planner/discuss should confirm the field choice (A vs B) before schema work |
| A4 | Default status for hand-authored "New Recipe" (RecipeEditor create) should stay `published` | Pitfall 3 / Open Q1 | Medium — a UX decision; if the team wants new hand-authored recipes to be drafts-by-default, the create path changes |
| A5 | Suggested confident-match fuse score gate ≈0.15 | /suggest, D-02 | Low — explicitly Claude's-discretion to tune during implementation |
| A6 | Component-level UI remains manual-UAT-only (no jsdom this phase) | Validation Architecture | Low — matches the stated vitest.config posture; adding jsdom is a deliberate later choice |

## Open Questions (RESOLVED)

> All three resolved during planning (plan-checker verified). Resolutions folded into the plans as noted.

1. **Default `status` for hand-authored new recipes (RecipeEditor "New Recipe")?** — **RESOLVED → Plan 06-04:** the `isNew` create path sets `status:"published"` explicitly; only import/evolution set `"draft"`.
   - What we know: D-03 covers import (draft) + backfill (published); handleSave create currently sets no status.
   - What's unclear: whether a freshly hand-authored recipe should be a draft (consistent with "unpublished = draft") or published (old behavior).
   - Recommendation: set `status:"published"` explicitly in the manual create path to preserve behavior; only import/evolution set `"draft"`. Confirm in planning.

2. **Node-correspondence linkage: schema field (A) vs JSON map (B)?** — **RESOLVED → Plan 06-01:** adopted option (A) — `recipe_product_nodes.source_node` relation.
   - What we know: override integrity on write-back needs per-node correspondence (Pitfall 2).
   - What's unclear: whether to add `recipe_product_nodes.source_node` (A) or store the map off-schema (B).
   - Recommendation: (A) — explicit relation, session-durable, directly seeds the write-back remap. Small additive field, consistent with the app's schema-first style.

3. **Does `runLint`'s `ProductExpanded` enrichment need store/section/container expand at publish time?** — **RESOLVED → Plan 06-03:** `runRecipeLint` mirrors the `Products.tsx:150-166` enrichment (expand product on node fetch + a second `getAll(products, {expand:"store,section,container_type"})`).
   - What we know: `runLint` rules read store/section/container + node units (Products.tsx enriches before calling).
   - What's unclear: cheapest way to assemble that shape for just a recipe's referenced products inside `runRecipeLint`.
   - Recommendation: expand `product` on the node fetch, then a second `getAll(products, {expand:"store,section,container_type", filter: id-in-list})` — mirror Products.tsx:150-164. Confirm the multi-id filter form during implementation.

## Sources

### Primary (HIGH confidence — verified against source files this session)
- `recipe-planner/src/pages/RecipeEditor.tsx` (handleSave 657–825, loadRecipe 272–368, isNew create 668–672, edge remap 789–813) — graph-write spine + id-remap contract
- `recipe-planner/src/lib/linter/index.ts` (runStepLint 77-79, runLint 67-74, runWeekLint 87-92) — publish-gate composition
- `recipe-planner/src/lib/api.ts` (getAll filter option 5-15, collections map 51-73) — filter injection + collection registration
- `recipe-planner/src/lib/search/product-search.ts` (FUSE_OPTIONS, score discarded 52-53) — D-02 gate gap
- `recipe-planner/scripts/apply-phase5-schema.mjs` — the schema-migration idiom (idempotent, test-first, repo-root re-export)
- `recipe-planner/src/hooks/useRecipeQueue.ts` — `useRecipeNotes` template
- `recipe-planner/src/lib/types.ts` (Recipe 73-77, RecipeProductNode 88-96, RecipeStep 108-125, Product nutrition 60-69, PlannedMeal 150-157)
- `pb_schema.json` (recipes select_recipe_type; recipe_queue relation shape; planned_meals.recipe→pbc_5183946072; meal_variant_overrides.original_node→pbc_9624381706)
- `recipe-planner/vitest.config.ts` (node env, no jsdom) + `package.json` (deps/versions/test script)
- `.claude/skills/recipe-import/SKILL.md` (rewrite target; script-run-from-recipe-planner convention 246-247; stale schema.md ref)
- `.planning/phases/06-import-pipeline-recipe-lifecycle/06-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `plans/workflow-redesign.md` §Topic 5

### Secondary (MEDIUM)
- Call-site line reads: `WeekWizard.tsx` recipe load (~103), `WeeklyPlans.tsx:153`, `Recipes.tsx` (query 86, Batch chip 418-430), `Products.tsx:150-166` findings dialog, `App.tsx:53-56` routes, `Layout.tsx` nav

### Tertiary (LOW)
- `ajv@6.12.6` version read from `node_modules/ajv/package.json` (transitive; adoption not recommended)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package verified in `package.json`; no external installs
- Schema migration mechanics: HIGH — verbatim from `apply-phase5-schema.mjs`
- Graph-write spine & id-remap contract: HIGH — read line-by-line from handleSave/loadRecipe
- Draft lifecycle filter: HIGH — verified `getAll` filter option + call sites
- Evolution write-back linkage: MEDIUM — hard-relation facts verified; the `source_node`/`revision_of` field design is a recommendation (Open Q2)
- Publish gate: HIGH — linter composition verified
- Pitfalls: HIGH — each grounded in a verified source line

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (stable internal codebase; re-check if PocketBase major version or the recipe graph schema changes)
</content>
</invoke>
