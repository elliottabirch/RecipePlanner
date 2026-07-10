# Phase 6: Import Pipeline & Recipe Lifecycle - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 15 new/modified files
**Analogs found:** 14 / 15 (1 net-new pure module has role-only analog)

> All analog line numbers verified against source this session. This phase is almost
> entirely internal refactor + additive schema — the risk is *re-implementing* an
> existing primitive slightly differently, not missing a library. Copy from the analogs.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/import/build-recipe-graph.ts` (+ pure `planGraphWrites`) | service | transform → CRUD | `RecipeEditor.tsx` handleSave 657–825, loadRecipe 272 | exact (extraction) |
| `src/lib/import/validate-import.ts` | utility | transform (validate/normalize) | pure `src/lib/*` modules (`product-search.ts`, `linter/index.ts`) | role-match |
| `src/lib/lifecycle/draft-filter.ts` | utility | filter-string builder | `lib/api.ts` getAll filter option; call sites WeekWizard/WeeklyPlans | role-match |
| `src/lib/linter/recipe-lint.ts` — `runRecipeLint(recipeId)` | service | CRUD-read → transform | `lib/linter/index.ts` runStepLint/runLint 67–79; Products.tsx enrich 150–166 | exact (composition) |
| `src/lib/search/product-search.ts` — add `scoreProduct` | utility | transform (search) | existing `searchProducts` 38–54 (same file) | exact (extend) |
| `src/hooks/useRecipeNotes.ts` | hook | CRUD | `hooks/useRecipeQueue.ts` | exact |
| `src/pages/Import.tsx` (new `/import` route) | page | request-response (form) | Products.tsx page shell + `QuickCreateProductDialog` | role-match |
| Draft `<Chip>` in `Recipes.tsx` | component | render | Batch `<Chip>` Recipes.tsx 418–430 | exact |
| Publish button + lint dialog in `RecipeEditor.tsx` | component | request-response | Products.tsx findings dialog 522–561 | exact |
| One-tap note buttons (Recipes/CookMode/WeeklyPlans) | component | event → CRUD | (uses `useRecipeNotes`; MUI IconButton) | role-match |
| Wizard revision flag in `WeekWizard.tsx` | component | render | Batch `<Chip>` (low-emphasis chip) | role-match |
| `scripts/apply-phase6-schema.mjs` | migration | schema mutation | `scripts/apply-phase5-schema.mjs` | exact |
| `/suggest-recipes` skill | config/skill | batch read → propose | `.claude/skills/recipe-import/SKILL.md` | role-match |
| recipe-import SKILL.md rewrite | config/skill | transform (emit JSON) | itself (current SKILL.md) | rewrite |
| `src/lib/types.ts` — add `Recipe.status`, `revision_of`, `RecipeNote` | model | type defs | existing `Recipe` interface | exact |

## Pattern Assignments

### `src/lib/import/build-recipe-graph.ts` (+ pure `planGraphWrites`) — service, transform→CRUD

**Analog:** `src/pages/RecipeEditor.tsx` `handleSave()` (657–825). Extract the write spine into a
headless service; split a pure `planGraphWrites(graph, remapSeed)` (unit-testable, no live PB) from
a thin PB executor. RecipeEditor.handleSave should be refactored to build a `NormalizedGraph` and
delegate, so there is exactly one write path.

**Recipe create/update pattern** (RecipeEditor.tsx:667–680) — import passes `status:"draft"`:
```typescript
if (isNew) {
  const newRecipe = await create<Recipe>(collections.recipes, {
    name: name.trim(), notes: notes.trim() || undefined, recipe_type: recipeType,
  });
  recipeId = newRecipe.id;
} else {
  await update(collections.recipes, id!, { name, notes, recipe_type: recipeType });
}
```

**Node create-vs-update + id-remap** (RecipeEditor.tsx:704–762) — THE contract the JSON `ref` scheme (D-01) ports into. A ref already in `remapSeed`/`nodeDbIds` → `update` in place; else `create` then record `newNodeDbIds[ref] = created.id`:
```typescript
const newNodeDbIds: Record<string, string> = { ...nodeDbIds };
for (const node of nodes) {
  const existingDbId = nodeDbIds[node.id];
  if (node.type === "product") {
    const nodeData = { recipe: recipeId, product: data.productId, quantity: data.quantity,
      unit: data.unit, meal_destination: data.mealDestination, position_x: 0, position_y: 0 };
    if (existingDbId) await update(collections.recipeProductNodes, existingDbId, nodeData);
    else { const created = await create<RecipeProductNode>(collections.recipeProductNodes, nodeData);
           newNodeDbIds[node.id] = created.id; }
  } else if (node.type === "step") {
    // ALL Phase-5 fields carried (745–749): active_minutes, passive_minutes, instructions,
    // prep_action, resource, oven_temp_f, rack_slots — import JSON must pass these through.
  }
}
```

**Edge delete-all-then-recreate + prefix-inferred direction** (RecipeEditor.tsx:767–813). Direction is inferred from `ref` prefix (`product-*`/`step-*`); skip edge if either endpoint dbId missing:
```typescript
// delete all existing edges for recipe first (767–785), then:
for (const edge of edges) {
  const sourceType = edge.source.startsWith("product") ? "product" : "step";
  const sourceDbId = newNodeDbIds[edge.source];
  const targetDbId = newNodeDbIds[edge.target];
  if (!sourceDbId || !targetDbId) continue;               // line 799 — critical guard
  if (sourceType === "product") await create(collections.productToStepEdges, {...});
  else await create(collections.stepToProductEdges, {...});
}
```

**Write-back (D-10):** seed `remapSeed[ref] = sourceNode` for every cloned node carrying a `source_node` still present on the original → those `update` in place onto ORIGINAL node ids (overrides preserved). Positions are non-load-bearing — `loadRecipe` re-runs dagre; import may pass `{x:0,y:0}`.

---

### `src/lib/import/validate-import.ts` — utility, transform (never-throw normalizer)

**Analog:** pure `src/lib/*` module style — `product-search.ts` and `linter/index.ts` (type-only imports, no side effects, no React). Net-new logic.

**Signature (from RESEARCH Pattern 2):** `validateImportJson(raw): { ok: true; graph: NormalizedGraph } | { ok: false; errors: ImportError[] }`. Structural validate + normalize only; **never throws, never blocks** — returns a list the import UI renders inline.

**Enum-normalize idiom to mirror** — `loadRecipe`'s `|| undefined` treatment (RecipeEditor.tsx:359–366): unknown `resource`/`prep_action`/`timing` values normalize to `undefined` + warn, never reject the whole graph. Do NOT adopt `ajv` (transitive @6.12.6, throw-model fights the never-block invariant).

---

### `src/lib/lifecycle/draft-filter.ts` — utility, filter-string builder

**Analog:** `lib/api.ts` `getAll` filter option (api.ts:5–15) + the two planning call sites.

`getAll` already accepts a `filter` string:
```typescript
export async function getAll<T extends RecordModel>(
  collection: string,
  options?: { expand?: string; sort?: string; filter?: string }
): Promise<T[]> { return pb.collection(collection).getFullList<T>({ ...options }); }
```

**Two call sites to patch (D-04 — correctness-critical):**
- `components/WeekWizard.tsx` ~line 102 (verified): `getAll<Recipe>(collections.recipes, { sort: "name" })` → add `filter: 'status != "draft"'`.
- `pages/WeeklyPlans.tsx:153` (verified): `getAll<Recipe>(collections.recipes, { sort: "name" })` → same.

**Anti-pattern (Pitfall 1):** use `status != "draft"` (fail-open), NEVER `status = "published"` (fail-closed — un-set select returns `""` and vanishes from planning). Leave unfiltered: Recipes.tsx:86, RecipeEditor.tsx:287, Products.tsx:128, StepBackfill.tsx:145.

---

### `src/lib/linter/recipe-lint.ts` — `runRecipeLint(recipeId)` — service, CRUD-read→transform

**Analog:** `lib/linter/index.ts` aggregators (67–79) + Products.tsx enrichment (150–166).

**Compose (D-06):** `runStepLint(steps)` + `runLint(products)` only. `runWeekLint` **cannot** participate (Pitfall 4 — needs a whole `WeekGraph`, index.ts:87–92).
```typescript
export function runLint(products: ProductExpanded[]): LintFinding[] { /* index.ts:67 */ }
export function runStepLint(steps: RecipeStep[]): LintFinding[] {      /* index.ts:77 */
  return [...lintMissingDurations(steps), ...lintMissingPrepAction(steps)];
}
```

**ProductExpanded enrichment to mirror** (Products.tsx:151–164) — `runLint`'s cross-dimension rule needs each product's node units grouped by product id:
```typescript
const nodes = await getAll<RecipeProductNode>(collections.recipeProductNodes /* filter recipe */);
const nodesByProduct = new Map<string, { unit?: string }[]>();
for (const node of nodes) { /* group by node.product, push {unit: node.unit} */ }
const enriched = items.map((item) => ({ ...item, nodes: nodesByProduct.get(item.id) ?? [] }));
return [...runStepLint(steps), ...runLint(enriched)];  // runWeekLint excluded
```

---

### `src/lib/search/product-search.ts` — add `scoreProduct` — utility, extend

**Analog:** existing `searchProducts` in the SAME file (38–54). It sets `includeScore: true` but discards the score (`.map(r => r.item.__original)`, line 53). D-02 gate needs the numeric score.

**Add a scored sibling reusing `FUSE_OPTIONS`** (21–29) and the `toSortedTokens`/`__original` indexing (44–50):
```typescript
export function scoreProduct<T extends Product>(query: string, products: T[]): { product: T; score: number }[] {
  const indexed = products.map((p) => ({ ...p, _sortedTokens: toSortedTokens(p.name), __original: p }));
  return new Fuse(indexed, FUSE_OPTIONS).search(query)
    .map((r) => ({ product: r.item.__original, score: r.score ?? 1 }));
}
// D-02: score <= ~0.15 → auto-match silently; else surface for inline resolve (tune threshold).
```

---

### `src/hooks/useRecipeNotes.ts` — hook, CRUD

**Analog:** `hooks/useRecipeQueue.ts` (whole file) — identical `useState` + `useCallback` refresh + create/getAll/remove shape.

**Mirror this structure:**
```typescript
export function useRecipeNotes() {
  const [notes, setNotes] = useState<RecipeNoteExpanded[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const items = await getAll<RecipeNoteExpanded>(collections.recipeNotes, { expand: "recipe", sort: "-created" });
    setNotes(items);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const addNote = useCallback(async (recipeId, text, source_surface) =>
    { await create(collections.recipeNotes, { recipe: recipeId, text, status: "pending", source_surface }); await refresh(); }, [refresh]);
  // removeNote / dismissNote mirror removeFromQueue (useRecipeQueue.ts:51–57)
  return { notes, loading, addNote, refresh };
}
```
Register `recipeNotes: "recipe_notes"` in the `collections` map (api.ts:51–73).

---

### `src/pages/Import.tsx` (new `/import` route) — page, request-response

**Analog:** a registry page shell (e.g. Products.tsx `Box` + `h6` title) + `QuickCreateProductDialog` for inline unmatched resolution.

**Flow (UI-SPEC §1):** multiline monospace `TextField` (`minRows={10}`) → `validateImportJson()` feedback in `Alert` stack → if unmatched, inline "Match these products" step reusing `QuickCreateProductDialog` (`onCreated(product)` callback) → land via `buildRecipeGraph({status:"draft"})` → `navigate('/recipes/:id')`. Route added in `App.tsx:53–56`; nav in `Layout.tsx` via `renderNav`. Primary "Import recipe" `Button variant="contained"` (green accent) never hard-blocks.

---

### Draft `<Chip>` in `Recipes.tsx` — component, render

**Analog:** Batch chip (Recipes.tsx:418–430). Copy exactly, grey instead of purple, gated on `item.status === "draft"`. Both chips can coexist in the same `gap={1}` flex row (414):
```tsx
{item.status === "draft" && (
  <Chip label="Draft" size="small"
    sx={{ backgroundColor: "#757575", color: "white", fontWeight: 600, fontSize: "0.7rem", height: 22 }} />
)}
```

---

### Publish button + lint dialog in `RecipeEditor.tsx` — component, request-response

**Analog:** Products.tsx findings dialog (522–561) + lint-run handler (145–173).

**Publish handler** (UI-SPEC §3): `Button variant="contained"` shown only when `status === "draft"`. On click run `runRecipeLint(id)`; findings → open dialog, do NOT write status; clean → `update(recipes, id, {status:"published"})`.

**Findings dialog to copy** (Products.tsx:522–561) — title *"Fix N issue(s) before publishing"*, one `Alert severity={finding.severity}` per finding (`<strong>{finding.rule}</strong>: {finding.message}`, line 552), `DialogActions` "Close". Status never written on failure.

---

### One-tap note buttons — Recipes/CookMode/WeeklyPlans — component, event→CRUD

**Analog:** MUI `IconButton` (`NoteAddIcon`) + `useRecipeNotes.addNote`. Three surfaces (UI-SPEC §4), ≥44px touch target:
- `Recipes.tsx` card → `source_surface="recipe_card"`
- `components/cook-mode/NowNextCard.tsx` header row (~103–117) → `source_surface="cook_mode"`
- `WeeklyPlans.tsx` planned-meal cell → `source_surface="calendar"`

Tap opens compact `TextField` + "Save note"; writes `status="pending"`. No navigation.

---

### Wizard revision flag in `WeekWizard.tsx` — component, render

**Analog:** low-emphasis MUI chip (NOT accent green — use `warning`/`info` outlined). Per pool recipe R, check if any recipe has `revision_of = R.id && status="draft"`; if so render *"Revised — review?"* chip → tap opens draft in RecipeEditor. One extra up-front `getAll(recipes, {filter:'revision_of != "" && status="draft"'})`, indexed client-side by `revision_of`.

---

### `scripts/apply-phase6-schema.mjs` — migration

**Analog:** `scripts/apply-phase5-schema.mjs` (copy verbatim structure). Idempotent, existence-checking, `PB_URL` env (test :8091 first, prod :8090 default), superuser auth from gitignored `.env.local`, re-export canonical `pb_schema.json` at **repo root** (`../../pb_schema.json`, path.resolve line 52–55) after the TEST run only.

**Header + DB-URL + mirror-path idiom** (phase5 lines 41–55):
```javascript
const DB_URLS = { production: "http://192.168.50.95:8090", test: "http://192.168.50.95:8091" };
const PB_URL = process.env.PB_URL || DB_URLS.production;
const pb = new PocketBase(PB_URL);
const SCHEMA_MIRROR_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../pb_schema.json");
```

**Three changes (RESEARCH §Schema Migration):**
1. `recipes.status` select `["draft","published"]` mirroring `select_recipe_type` shape + **backfill all rows to `published` in the same script** (Pitfall 1).
2. New `recipe_notes` collection (`recipe` relation cascadeDelete, `text`, `status` [pending/applied/dismissed], `source_surface`, `draft_revision` relation, autodate `created`/`updated`).
3. `recipes.revision_of` nullable relation (draft→original) + `recipe_product_nodes.source_node` nullable relation (node correspondence, Open Q2 recommends option A).

Field-add merges into the fetched collection's full `fields` array (PB replaces the whole array), asserting no existing field dropped. Also add `Recipe.status`, `Recipe.revision_of`, `RecipeNote` to `src/lib/types.ts` and `recipeNotes` to the api.ts collections map.

---

### `/suggest-recipes` skill — config/skill

**Analog:** `.claude/skills/recipe-import/SKILL.md`. Chat-first, confirm-before-write (D-07). Reads `products` + `planned_meals` from inside `recipe-planner/` (its `node_modules` pocketbase); prints 3–5 candidate summaries (registry overlap % via `scoreProduct`, active time from step minutes, batch-fit from `recipe_type`+`timing`, protein = soft "estimated" note per D-08); only accepted candidates built as drafts via D-01 contract + `buildRecipeGraph({status:"draft"})`.

---

### recipe-import SKILL.md rewrite — config/skill

**Analog:** itself. Rewrite to emit the D-01 `{name+hints}` JSON contract for the import page (IMP-03). **Delete** current Steps 4–6 (script generation, test-DB run 8091, promote-to-prod — retires the migration ritual). Refresh the **stale** `references/schema.md` (predates Phase 5 — missing `active_minutes`/`passive_minutes`/`instructions`/`prep_action`/`resource`/`oven_temp_f`/`rack_slots`) to the D-01 contract.

## Shared Patterns

### Generic CRUD via `lib/api.ts`
**Source:** `src/lib/api.ts:5–48` (`getAll`/`getOne`/`create`/`update`/`remove`) + collections map (51–73).
**Apply to:** every DB touch this phase. New collection name `recipe_notes` must be registered in the map. All reads/writes go through these wrappers — never call `pb.collection()` directly in feature code.

### Draft-filter (fail-open)
**Source:** `status != "draft"` string passed to `getAll`'s `filter` option.
**Apply to:** exactly WeekWizard.tsx:~102 and WeeklyPlans.tsx:153. Never `status = "published"`.

### Findings-dialog + Alert-per-finding
**Source:** `Products.tsx:522–561`.
**Apply to:** RecipeEditor Publish gate. `<strong>{rule}</strong>: {message}`, severity from finding.

### Chip badge on card
**Source:** `Recipes.tsx:418–430` (Batch chip).
**Apply to:** Draft badge (grey #757575), wizard revision flag (outlined warning/info).

### Schema-migration idiom
**Source:** `scripts/apply-phase5-schema.mjs`.
**Apply to:** `apply-phase6-schema.mjs` — idempotent, test-first, repo-root re-export, `.env.local` creds.

### Pure `src/lib/*` module for testability
**Source:** `product-search.ts`, `linter/index.ts` (type-only imports, no React/side effects).
**Apply to:** validate-import.ts, planGraphWrites, draft-filter.ts, recipe-lint.ts, scoreProduct — all logic pushed into pure modules (no jsdom this phase; components stay thin wiring).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/import/validate-import.ts` | utility | transform | No existing JSON-contract normalizer; net-new logic. Follows pure-module *style* (product-search.ts) but no behavioral analog. Use RESEARCH Pattern 2 + `loadRecipe`'s `\|\| undefined` enum-normalize idiom. |

## Metadata

**Analog search scope:** `recipe-planner/src/{pages,components,hooks,lib}`, `recipe-planner/scripts`, `.claude/skills`, `pb_schema.json`
**Files scanned (read this session):** RecipeEditor.tsx (657–825), useRecipeQueue.ts, product-search.ts, linter/index.ts (1–92), Products.tsx (145–173, 518–561), Recipes.tsx (410–444), api.ts (1–73), apply-phase5-schema.mjs (1–60), WeekWizard.tsx (~100–106), WeeklyPlans.tsx (150–156), recipe-import SKILL.md (1–20)
**Pattern extraction date:** 2026-07-10
</content>
</invoke>
