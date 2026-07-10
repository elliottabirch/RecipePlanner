# Phase 6: Import Pipeline & Recipe Lifecycle - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Adding and evolving recipes happens entirely in-app. A structured-JSON import page builds the full recipe graph as a **draft** directly in prod; drafts are invisible to weekly planning but visible + badged in the recipe list. Publishing a draft is gated on the recipe linter (importing itself never blocks). The test-database content-migration ritual is retired (test DB remains for schema/code changes only). `/suggest-recipes` proposes registry-reusing candidates, and a recipe-note → agent-revision "evolution loop" produces reviewable draft revisions of published recipes.

**Requirements:** IMP-01 … IMP-07 (see ROADMAP.md Phase 6).

**Out of scope (deferred, not this phase):** automatic (hook/cron) agent passes; hard nutrition/macro filtering; a read-only preview renderer separate from RecipeEditor; nutrition backfill.

</domain>

<decisions>
## Implementation Decisions

### Import JSON contract & product matching
- **D-01:** Import JSON uses a **`{name + optional hints}`** product model — each product line carries `name`, `unit`, `quantity`, and optional hints (`matchProductId?`, `productType?`, `pantry?`, `fdcId?`, `store?`, `section?`). Steps carry the full Phase-5 metadata (`step_type`, `timing`, `active_minutes`, `passive_minutes`, `instructions`, `prep_action?`, `resource?`, `oven_temp_f?`, `rack_slots?`). Products/steps referenced by string `ref`s; edges are `{from: ref, to: ref}`. The `ref` convention mirrors RecipeEditor's `product-*` / `step-*` local-node ids so the existing id-remap logic ports directly. Rationale: an emitter (recipe-import skill, or Claude on a phone) needs **no DB access** to produce valid JSON.
- **D-02:** **Inline-resolve, then land.** At import, auto-match high-confidence product lines silently (via Phase-3 `searchProducts` fuse score gate); for the handful of unmatched / low-confidence lines, surface an **inline resolution step** (pick-existing / `QuickCreateProductDialog` / Search-USDA) **before** the draft finishes landing. Guarantees every product carries store/section/unit — avoids reintroducing the near-duplicate and shopping-list-dropout bugs that silent bare-product creation would cause. This resolution step is part of import, not the publish gate — "importing never blocks" still holds (the only hard block is publish).

### Draft/publish lifecycle
- **D-03:** Add **`select status: draft|published`** to the `recipes` collection (mirrors the existing `recipe_type` select). Migration **backfills all existing recipes to `published`** so nothing disappears from planning on day one.
- **D-04:** **Draft filter is added to exactly two planning queries** (correctness-critical — a missed one leaks a draft into a meal plan): `components/WeekWizard.tsx:102` (rotation-pool source for guided-fill — highest risk) and `pages/WeeklyPlans.tsx:153` (the "Add Meal" recipe picker). Leave **unfiltered** (drafts must stay visible): `pages/Recipes.tsx:86` (list), `pages/RecipeEditor.tsx:287` (review surface), `pages/registries/Products.tsx:128` (`source_recipe` linkage), `pages/StepBackfill.tsx:145` (authoring tool).
- **D-05:** **Import review happens in the existing RecipeEditor.** Imported graph lands immediately as a `draft` via RecipeEditor's existing save path, then redirects into RecipeEditor for review/edit. No separate read-only preview component. (A post-import summary is optional polish, not required.)
- **D-06:** **Publish gate = a "Publish" button inside RecipeEditor.** It calls a new `runRecipeLint(recipeId)` wrapper composing the existing `runStepLint(recipe's recipe_steps)` + product-scoped `runLint(referenced products)`; `runWeekLint` **cannot** participate (it requires a whole WeekGraph). Failures render in the same findings-dialog pattern as `Products.tsx:165`. Status flips to `published` only on a clean pass. Draft recipes get a `<Chip>` badge in `Recipes.tsx` mirroring the existing Batch chip (lines 418–430).

### /suggest-recipes
- **D-07:** **Propose in chat, land accepted.** The skill (Claude Code) reads the product registry + recent plans, prints 3–5 candidate summaries in chat (registry overlap %, active time, batch-fit); the user picks; **only accepted candidates are built as drafts direct to prod** via the D-01 import contract + D-02 matching. Avoids junk drafts and re-uses the review-before-write ergonomics of the existing recipe-import skill.
- **D-08:** Constraints are **computed where data allows**: active-prep time from `recipe_steps.active_minutes`/`passive_minutes`, batch-prep from `recipes.recipe_type` + `recipe_steps.timing`, registry overlap from `products`. The **protein/macro floor is a soft heuristic with an explicit "estimated" note** — a hard filter is not computable (`protein_g`/`kcal` = 0 across all 725 products; bundled USDA index carries no macros). Path to a hard filter later: backfill `products.protein_g` from `fdc_id` via the live FDC API (scaffold exists at `recipe-planner/scripts/add-product-nutrition-fields.js`).

### Evolution loop (note → draft revision)
- **D-09:** Notes live in a **new `recipe_notes` collection** (`recipe` relation, `text`, `status` [pending/applied/dismissed], `source_surface`, `created`). Do **not** overload `recipe_queue` (that is the plan-next list, no text field) or `recipes.notes` (that is the human-facing card blurb). Pending queue = `status="pending"` filter; each note links to the draft it produced. One-tap note-attach surfaces: cook mode (`CookMode.tsx` + `components/cook-mode/*`), calendar cell (`WeeklyPlans.tsx`), recipe card (`Recipes.tsx`).
- **D-10:** **Revision model = in-place branch.** The agent pass clones the target graph into a `draft` recipe **purely for review**; on **approval, the reviewed graph is written back onto the ORIGINAL recipe id** (not a record swap). Because `planned_meals.recipe → recipes.id` and `meal_variant_overrides.original_node → recipe_product_nodes.id` are hard relations, keeping the recipe id stable means already-planned weeks and ingredient-swap overrides for unchanged nodes stay valid automatically — no re-point / override-remap migration. (Only genuinely removed/replaced nodes can dangle an override, a far smaller blast radius than minting a new recipe id.)
- **D-11:** **Agent passes are manual skills** (mirroring the recipe-import skill): a skill drains `status="pending"` notes → draft revisions; `/suggest-recipes` is likewise a manual skill. Keeps agent output human-reviewable; automate (PB hook/cron) only after the loop proves out. The **week wizard (`WeekWizard.tsx`)** renders the "updated per your note, review?" flag by checking each recipe for a linked pending draft revision.

### Claude's Discretion
- The exact fuse-score threshold for "confident match" vs "surface for inline resolve" in D-02 (researcher suggested ≈0.15) — tune during implementation.
- Whether to add the optional post-import summary screen (D-05) — adopt only if the product-matching report earns its keep.
- Shape of the `recipe_notes.source_surface` enum values and the review-flag UI treatment in the wizard.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authoritative decision record
- `plans/workflow-redesign.md` §"Topic 5 — Import pipeline & inspiration" and §"Phased roadmap" item 6 — the locked feature decisions this phase implements (draft flag direct-to-prod, in-app JSON import, recipe-import skill rewrite to emit JSON, retire migration scripts, `/suggest-recipes` constraints, evolution loop).
- `.planning/ROADMAP.md` §"Phase 6" — goal, dependencies (Phase 4 wizard hosts the evolution prompt; Phase 5 `recipe_steps` metadata is a hard input; tailnet infra prereq), requirements IMP-01…IMP-07, success criteria.
- `.planning/REQUIREMENTS.md` — IMP-01…IMP-07 requirement text.

### Import contract & graph-write spine
- `recipe-planner/src/pages/RecipeEditor.tsx` `handleSave()` (lines 657–825) — the full graph-write routine (recipe + tags + product nodes + steps incl. all Phase-5 fields + edges, with local→DB id remapping). Extract into a shared `buildRecipeGraph(json)` service reused by import, /suggest, and the evolution clone. `loadRecipe()` (line 272) is the matching full-graph read.
- `recipe-planner/src/lib/api.ts` — generic `create/getAll/getOne/update/remove` + `collections` name map; `getAll`/`getOne` already accept a `filter` option (draft filtering is a one-arg change per call site).
- `.claude/skills/recipe-import/SKILL.md` (+ `references/`) — the skill to **rewrite** to emit JSON. Its `references/schema.md` is **stale** (predates Phase 5 — lacks `active_minutes`/`passive_minutes`/`instructions`/`prep_action`/`resource`/`oven_temp_f`/`rack_slots`); update it to the D-01 contract.
- `pb_schema.json` — source of truth for `recipes`, `recipe_product_nodes`, `recipe_steps`, `product_to_step_edges`, `step_to_product_edges`, `recipe_tags`, `recipe_queue`, `planned_meals`, `meal_variant_overrides` field shapes.

### Product matching (Phase 3 reuse)
- `recipe-planner/src/lib/search/product-search.ts` — `searchProducts(query, products)` fuse.js matcher (threshold 0.35, `includeScore`) for the confidence gate.
- `recipe-planner/src/lib/usda/usda-lookup.ts` + `src/assets/usda-sr-legacy.json` — offline SR-Legacy search/link index (no macro values).
- `recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx` — name+store+section+unit+USDA create dialog (`onCreated(product)` callback) for inline unmatched resolution.
- `recipe-planner/src/lib/usda/category-section-map.ts` — `sectionIdForCategory()` auto-fill.

### Draft lifecycle & publish gate
- `recipe-planner/src/lib/linter/index.ts` — `runStepLint(steps)`, `runLint(products)`, `runWeekLint(...)`. Header notes "publish-gate wiring is Phase 6"; build the new `runRecipeLint(recipeId)` wrapper here.
- `recipe-planner/src/components/WeekWizard.tsx:102` and `recipe-planner/src/pages/WeeklyPlans.tsx:153` — the two queries that MUST gain the draft filter.
- `recipe-planner/src/pages/Recipes.tsx` (Batch `<Chip>` at 418–430) — draft-badge pattern + note-attach surface.
- `recipe-planner/src/pages/registries/Products.tsx:165` — lint-findings dialog pattern to copy for the publish gate.
- `recipe-planner/src/App.tsx` (routes 54–56) — where a new `import` route slots in; nav in `components/Layout.tsx`.

### Evolution loop
- `recipe-planner/src/hooks/useRecipeQueue.ts` — CRUD-hook shape to mirror for a `useRecipeNotes` hook.
- `recipe-planner/src/pages/CookMode.tsx` + `components/cook-mode/*`, `recipe-planner/src/pages/WeeklyPlans.tsx` — note-attach surfaces.
- `.planning/seeds/day-before-prep-horizon.md` — open seed (Phase 5 carry-over, not Phase 6 scope) referenced by workflow-redesign.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RecipeEditor.handleSave()` (657–825): the single graph-write primitive for import, /suggest landing, and the evolution clone — extract to a shared service rather than duplicating.
- `RecipeEditor.loadRecipe()` (272): full-graph read (5 collections by `recipe=` filter) — the read half of the evolution clone.
- Phase-3 `searchProducts` + `QuickCreateProductDialog` + `usda-lookup`: the entire import product-matching + inline-resolve flow, no new search engine needed.
- `linter/index.ts` `runStepLint`: reusable core for the per-recipe publish gate.
- `useRecipeQueue.ts`: hook template for `recipe_notes`.

### Established Patterns
- Node-id convention `product-<id>` / `step-<id>` (temp: `product-temp-<ts>`); edge direction inferred from prefix — the JSON `ref` scheme must match so id-remap (796–813) ports unchanged.
- `select` field pattern (`recipe_type`) → reuse for `status`.
- `<Chip>` badges on recipe cards; findings-dialog for lint output.
- Skills query PocketBase directly from **inside `recipe-planner/`** (its `node_modules`); wrap bodies in `async function main()` + `.catch`.

### Integration Points
- New `import` route in `App.tsx` + nav in `Layout.tsx`.
- New `status` field + `recipe_notes` collection in `pb_schema.json` (both prod + test DBs, per the app's dual-DB schema convention).
- Draft filter injected at `WeekWizard.tsx:102` and `WeeklyPlans.tsx:153` only.
- Publish button + `runRecipeLint` in RecipeEditor.

</code_context>

<specifics>
## Specific Ideas

- "Importing never blocks; publishing is the only hard block" — a first-class invariant to preserve through every flow (import, inline-resolve, /suggest landing).
- Evolution loop must keep the **published recipe live and stable** during revision review — the household can't have a mid-week dinner recipe change under them.
- `/suggest-recipes` should feel like the existing recipe-import skill (chat-first, confirm-before-write), not a bulk generator.

</specifics>

<deferred>
## Deferred Ideas

- **Automatic agent passes** (PocketBase hook / cron turning notes into revisions with no manual skill run) — revisit after the manual loop proves out.
- **Hard nutrition/macro filtering** for `/suggest-recipes` — blocked on nutrition backfill (`products.protein_g`/`kcal` populate from `fdc_id` via live FDC API). Own follow-up once macro data exists.
- **Read-only graph preview renderer** distinct from RecipeEditor — only if the land-then-review flow proves insufficient.
- **`meal_variant_overrides` remap on node removal** — the small residual dangling-override case when a revision deletes/replaces a node; handle as a targeted cleanup, not a general migration.

None of the above are Phase 6 scope — discussion stayed within the phase boundary.

</deferred>

---

*Phase: 6-Import Pipeline & Recipe Lifecycle*
*Context gathered: 2026-07-10*
