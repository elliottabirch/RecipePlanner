# Phase 6: Import Pipeline & Recipe Lifecycle

> Derived from `plans/workflow-redesign.md` Topic 5 + roadmap item 6, and the evolution-loop / connectivity decisions in `.planning/notes/exploration-2026-07-05.md`. Where this doc elaborates beyond the decision record, new choices are marked **Proposed (not yet decided)**.

---

## 1. Purpose & Problem Statement

This phase removes the last piece of self-inflicted overhead in the workflow — the bespoke import/migration pipeline — and closes the loop that lets recipes improve over time without interrupting a cooking session.

**Frustration solved (root cause #4 in the diagnosis):** "The import pipeline is self-inflicted overhead." The app already contains a full recipe-graph editor that performs the exact same DB writes as the import scripts, and recipe data never required a frontend deploy — yet every new recipe still goes through a five-to-seven-step script-and-migrate ritual.

**Concrete failure today:**

- The `recipe-import` skill (`.claude/skills/recipe-import/SKILL.md`) makes the agent hand-write a one-off `import-<recipe>.js` hardcoded to the **test** DB (port 8091), run it, wait for manual UI verification, then hand-write a second one-off `migrate-<recipe>.js` that copies six collections (`recipes`, `recipe_tags`, `recipe_product_nodes`, `recipe_steps`, `product_to_step_edges`, `step_to_product_edges`) from test → prod with ID-first/name-fallback product mapping (Skill Steps 4–6, lines 89–207). A stale artifact of exactly this pattern still sits in the repo root: `update-salmon-roasted-veg.js` (10.9 KB).
- This whole dance duplicates `RecipeEditor.tsx`'s `handleSave` (`src/pages/RecipeEditor.tsx:550–699`), which already creates the recipe, tags, product nodes, steps, and both edge collections in dependency order. The scripts add nothing the editor's write path doesn't already do — they exist only because there was no way to feed a machine-generated graph into that path.
- It also **requires a PC**: the scripts need Node + the repo's `node_modules` (Skill "Common Gotchas", line 247). A recipe photographed on a phone at the store cannot be captured.
- The test DB exists largely to host this migration staging. Per the decision record it becomes **schema/code-only**, eliminating `scripts/sync-to-test.js` runs and the compare/migrate scripts for content.

Beyond import, two capability gaps remain:

- **No inspiration engine.** Choosing what to cook is manual. The registry (`products`) and planning history (`planned_meals`, once dated in Phase 4) contain enough signal to propose recipes that reuse what the household already buys and fit the batch-prep model — but nothing consumes it.
- **No evolution loop.** A cook thinks "more lemon next time" mid-dinner and has no low-friction way to capture it. Editing the recipe immediately interrupts the meal; a weekly rating ritual was explicitly rejected. Improvements are lost.

---

## 2. Feature Descriptions

### 2.1 Draft / published recipes

Every recipe gains a lifecycle status. **Drafts are invisible to planning** — they never appear in the weekly-plan recipe picker or the rotation pools — but are fully visible and editable in the recipe list and the graph editor. A draft is promoted to **published** with a one-tap "Publish" action once the cook has reviewed it. This is the gate that makes direct-to-prod import safe: a machine-generated graph lands in prod immediately but cannot corrupt a week until a human blesses it.

Day-to-day: the recipe list (`Recipes.tsx`) shows a "Draft" badge and a filter toggle; the weekly-plan flow simply never sees drafts. Nothing about publishing requires a deploy or a second database.

### 2.2 In-app JSON import page

A new page accepts a **structured recipe JSON document** (the schema in §3.4) and, on submit, builds the entire recipe graph in prod as a **draft**, then drops the user into the existing `RecipeEditor` for that recipe to review the auto-laid-out graph. The JSON can come from:

- the rewritten `recipe-import` skill (agent parses a recipe and emits JSON), or
- Claude on a phone parsing a pasted or photographed recipe, with the JSON pasted into the page.

The page resolves each referenced product against the registry (match by explicit `productId`, then by exact name), creates any genuinely new products inline — **purchased products (`raw`/`inventory`/`stored`, `pantry:false`) require `store`/`section`; transient prep-output products are created without them**, matching the store/section discipline scoped in the recipe-import skill (`SKILL.md` "Store + section assignment (REQUIRED for every new non-pantry product)"), which requires store/section only for products the user actually buys (`pantry:false`), not transient intermediates. It **reports unmatched/ambiguous items for confirmation** (an ambiguous exact-name match — two products sharing a name — becomes reliable once Phase 1's unique `products.name` index lands; see §5), and only then writes the graph. This is the same write sequence as `RecipeEditor.handleSave` (`RecipeEditor.tsx:550–699`), factored so both the editor and the import page share it.

Because everything lands in prod as a draft, **the test→prod content-migration step disappears entirely**. The test DB is retained only for schema and code changes.

### 2.3 `recipe-import` skill rewrite

The skill stops generating scripts. Its new job: take a recipe (text/photo), do the product-matching analysis it already does well (Skill Step 3, lines 46–87 — the store/section discipline is preserved), and **emit a single JSON document** conforming to §3.4, which the user pastes into the import page. Steps 4 (script authoring), 5 (run on test), and 6 (promote to prod) are deleted. The Mermaid flow-diagram approval step (Step 2) is kept as a useful pre-JSON sanity artifact.

### 2.4 `/suggest-recipes` on-demand skill

A new agent skill, invoked on demand (not scheduled). It reads the product registry (`products`) and recent planning history (`planned_meals` + dated `weekly_plans`) and proposes **3–5 candidate recipes as import-ready JSON** (§3.4), each ready to paste into the import page. All four constraints from the decision record apply:

- **≥ ~80% ingredient overlap** with the existing registry (minimize new products to buy/create).
- **Low active prep time** — passive/hands-off time is fine, hands-on time is penalized.
- **Batch-prep compatible** — stores, reheats, and assembles within the prep-day model (produces `stored`/`transient` outputs, not serve-only dishes).
- **Protein/macro floor per serving** — pairs with the nutrition-later schema (see §5 dependency; interim handling in §7).

### 2.5 Recipe evolution loop

**One-tap notes.** From any recipe surface — a calendar cell, cook mode, a recipe card — the cook can attach a short free-text note to a recipe ("more lemon", "brussels version was better", "double the dressing"). This is one tap plus typing; it never opens the editor and never blocks the meal.

**Pending-note queue.** Notes accumulate in a queue, each tied to its recipe and the surface it came from, with a status (pending / applied / dismissed).

**Agent-applied draft revisions.** An agent pass reads the pending notes and, for each, produces a **draft revision** of the target recipe — a new draft recipe whose graph is the published recipe's graph with the note's change applied (e.g. bump a quantity node, add a step). The original published recipe is untouched and stays in rotation. The note is marked `applied` and linked to the revision it produced.

**Week-wizard approval.** When the Phase-4 week wizard offers a recipe that has a pending draft revision, it flags it — "updated per your note, review?" — and lets the cook approve (publish the revision, retire the original) or keep the original. Approval reuses the same draft→published mechanics as import.

This is deliberately *not* edit-immediately (breaks dinner) and *not* a structured post-cook rating ritual (unwanted weekly chore) — both explicitly rejected in the exploration notes.

> **Naming caution for the planner:** an existing `recipe_queue` collection (hook `src/hooks/useRecipeQueue.ts`, surfaced in `Recipes.tsx`) already exists and is a *"recipes to plan next" shortlist* — **not** the note queue. The evolution loop introduces a separate `recipe_notes` collection (§3.3). Do not conflate them.

---

## 3. Data Model Changes

Source of truth for existing collections is `pb_schema_updated.json`. **Note a real drift the planner must reconcile (see §7): that dump is stale — it does *not* contain `recipe_queue` or `meal_variant_overrides`, yet both are live in prod and used by working UI (`api.ts:66–67`, `useRecipeQueue.ts`, `WeeklyPlans.tsx:314/483/489/502`, `Outputs.tsx:216`). Regenerate the schema dump from prod before starting.**

Schema changes now land **directly on prod** (test is schema/code-only and is re-synced from prod structure as needed).

### 3.1 `recipes` — add lifecycle status (existing collection `pbc_5183946072`)

Current fields: `name`, `notes`, `recipe_type` (`meal` | `batch_prep`).

Add:

- `status` — `select` (single), values `["draft", "published"]`. **Migration:** backfill all existing recipes to `published` (they are all live today). New recipes created by the import page default to `draft`; recipes created via the existing "New Recipe" button in `Recipes.tsx:121` should also default to `draft` (**Proposed** — the decision record only specifies drafts for *imports*; defaulting manual creation to draft is a small consistency choice worth confirming).
- `revision_of` — `relation` → `recipes` (single, nullable, no cascade). Set on a draft that is an agent-produced revision of a published recipe; null for originals and normal imports. Enables the week wizard to find "this published recipe has a pending revision".

> **Proposed (not yet decided) — archived state.** When a revision is approved, the original published recipe must be removed from rotation. Options: (a) add `"archived"` to the `status` enum and flip the original to it; (b) hard-delete the original and let the revision take its place. The decision record says only "the original stays published until approved" — it does not specify the post-approval fate. Recommend (a) `archived` to preserve history and any `planned_meals`/`source_recipe` references. Flag for the planner.

### 3.2 Reuse `status` for the draft gate everywhere

No new field for "invisible to planning" — it is derived from `status = "published"`. Planning surfaces filter on it (§4).

### 3.3 `recipe_notes` — NEW collection (evolution loop)

| field | type | notes |
|---|---|---|
| `id` | text (auto) | PK |
| `recipe` | relation → `recipes` (single, required, cascade delete) | the recipe the note is about |
| `text` | text (required) | the free-text note ("more lemon") |
| `surface` | select `["calendar", "cook_mode", "recipe_card"]` | where it was captured (analytics / context for the agent) |
| `status` | select `["pending", "applied", "dismissed"]`, default `pending` | queue state |
| `applied_revision` | relation → `recipes` (single, nullable) | the draft revision this note produced, once `applied` |

No `created`/`updated` autodate fields are guaranteed present on custom base collections in this project's dumps — **add explicit `created` autodate** so the queue can be ordered oldest-first (the existing `weekly_plans` collection lacks `created`, which has already caused a 400-on-sort gotcha noted in the skill, line 248; do not repeat that).

### 3.4 Recipe import JSON contract (application-level, not a DB collection)

A documented, versioned JSON shape the import page and both skills agree on. **Proposed shape** (mirrors the graph the editor builds; the planner should treat field names as the contract to lock down):

```jsonc
{
  "schema_version": 1,
  "recipe": { "name": "…", "notes": "…", "recipe_type": "meal" },
  "tags": ["dinner", "bean-bowl"],            // matched to tags.name, created if missing
  "products": [                                // one entry per graph product node
    {
      "ref": "onion",                          // local handle used by edges below
      "productId": "10x87sv01ut8xa7",          // optional: explicit registry match
      "name": "onion (yellow)",                // required if productId absent → name match, else create
      "type": "raw",                           // raw|transient|stored|inventory
      "new": {                                 // present only when creating a PURCHASED product
        "pantry": false, "store": "Safeway", "section": "produce",   // store/section REQUIRED for pantry:false raw/inventory/stored
        "storage_location": null, "container_type": null
      },
      "quantity": 0.5, "unit": "cup",          // on raw inputs / stored outputs
      "meal_destination": null
    },
    {
      "ref": "onion-diced",                    // transient prep output — created without store/section
      "name": "onion (yellow) diced",
      "type": "transient",
      "new": { "pantry": false }               // transient intermediates omit store/section (skill discipline)
    }
  ],
  "steps": [
    {
      "ref": "dice-onion", "name": "Dice onion",
      "step_type": "prep", "timing": "batch",
      // Phase-5 recipe_steps metadata (see §5 dependency). REQUIRED once Phase 5's
      // step schema + linter have shipped (publish is gated on linter-clean, §7);
      // omittable only before Phase 5 lands.
      "active_minutes": 3, "passive_minutes": 0,
      "instructions": "Small dice, ~1/4 inch.",
      "prep_action": "diced"                   // controlled prep vocab from Phase 5 / Topic 2
    }
  ],
  "edges": [
    { "from": "onion", "to": "dice-onion" },   // product→step
    { "from": "dice-onion", "to": "onion-diced" } // step→product
  ]
}
```

Edge direction is inferred from whether each endpoint `ref` is a **product** or a **step** entry (not from any id-prefix convention), which `writeRecipeGraph` (§4 item 4) consumes as a normalized per-endpoint kind. No new DB fields are implied by the JSON beyond §3.1/§3.3 and the Phase-5 `recipe_steps` fields (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`) that this contract carries through.

> **Phase-5 step-metadata dependency (see §5).** The `steps[]` shape above carries the four Phase-5 `recipe_steps` fields. Phase 5 precedes Phase 6 in the roadmap and makes these **required at import, linter-enforced** (decision record Topic 4: "New recipes require the fields at import"). Every producer of this JSON — the import page, the rewritten `recipe-import` skill (item 6), `/suggest-recipes` (item 10), and the evolution agent (item 11) — must emit them once Phase 5 has shipped, or imported recipes cannot be published (§7 gates publish on linter-clean).

### 3.5 Products already support the make-at-home / suggest linkage

No change needed: `products.source_recipe` (relation → recipes) and `products.store_bought_product` already exist in `pb_schema_updated.json` (fields `relation_source_recipe`, `relation_store_bought_product`) and in `types.ts:54–55`. `/suggest-recipes` reads these to reason about what the registry can already make.

---

## 4. Implementation Plan

Ordered; each item independently verifiable.

1. **Regenerate `pb_schema_updated.json` from prod** and reconcile the drift (add `recipe_queue`, `meal_variant_overrides`). **This is the same one-shot re-export Phase 1 §4.4 and Phase 2 item 2 perform;** if either has already run, verify the two collections are present rather than re-doing it — one shared re-export task, restated per phase because the phases can ship out of order. *Verify:* dump contains both collections and matches `api.ts` collection names. (Blocks nothing but prevents planning on a false schema.)

2. **Add `recipes.status` + `recipes.revision_of` on prod**, backfill existing recipes to `published`. Update `types.ts` `Recipe` interface (`src/lib/types.ts:59–63`) with `status` and `revision_of`. *Verify:* every existing recipe reads `published`; a manually created draft reads `draft`.

3. **Filter drafts out of planning surfaces.** In `WeeklyPlans.tsx:139` change the recipe load to `filter: 'status="published"'` (and the Phase-4 wizard pools likewise). Leave `Recipes.tsx:86` loading all, but add a "Draft" badge + status filter chip and a "Publish" button on each draft card. *Verify:* a draft never appears in the week picker; it does appear (badged) in the recipe list and opens in the editor.

4. **Extract the graph-write path from `RecipeEditor`.** Factor `handleSave`'s node/step/edge creation (`RecipeEditor.tsx:596–699`) into a reusable `lib/recipe-graph/writeRecipeGraph.ts` that takes a **normalized graph** + `recipeId` and creates product nodes, steps, and both edge collections in dependency order. **Normalized input shape (not the editor's React-Flow shape):** each node declares its kind explicitly (`{ kind: "product" | "step", … }`) and each edge names its endpoints by node handle with a resolved kind per endpoint — `writeRecipeGraph` must **not** rely on the `edge.source.startsWith("product")` id-prefix convention (`RecipeEditor.tsx:675/678`) nor on editor component-state (`newNodeDbIds`); direction (product→step vs step→product) is derived from the two endpoint kinds. The editor adapts its React-Flow nodes/edges into this shape before calling. **Note:** tag creation (`RecipeEditor.tsx:587–594`) is a **separate block outside** the 596–699 range and is **not** part of `writeRecipeGraph` — tag resolution is handled by the import page (item 5) and the editor's own tag block. Refactor `handleSave` to call it (no behavior change). *Verify:* saving an existing recipe in the editor still round-trips unchanged, **and** a graph built directly from §3.4 refs (no id-prefix) round-trips to the same DB rows via `writeRecipeGraph` — proving the extraction dropped the prefix/editor-state coupling.

5. **Build the import page** (`src/pages/ImportRecipe.tsx` + route + nav entry). Paste-JSON textarea → parse & validate against §3.4 → **product resolution** (explicit id → exact name → flag-for-create; purchased `pantry:false` products require store/section, transient outputs do not — §2.2) → create products → **tag resolution**: match each `tags[]` entry against `tags.name`, create any missing `tags` row, then write a `recipe_tags` row per tag linking it to the new recipe (the shape `RecipeEditor.tsx:587–594` writes, but here resolving/creating by name since the paste has no pre-selected tag ids) → `create(recipes, { …, status:"draft" })` → `writeRecipeGraph(...)` → navigate to `RecipeEditor` for review. **Ambiguous exact-name match** (two products share a name): surface the candidates for the user to pick; this case becomes rare/impossible once Phase 1's unique `products.name` index lands (§5). Auto-layout node positions (reuse whatever layout the editor uses for imported nodes; if none, simple layered layout — **Proposed**). *Verify:* pasting a sample JSON produces a draft recipe whose editor graph **and tags** match the JSON (tags resolved-or-created, `recipe_tags` rows present so it joins the Phase-4 rotation pools once published); re-opening the app shows it as a draft, absent from planning.

6. **Rewrite the `recipe-import` skill** (`.claude/skills/recipe-import/SKILL.md`): keep Steps 1–3 (analyze, Mermaid, product/store-section matching), replace Steps 4–6 with "emit the §3.4 JSON and instruct the user to paste it into the import page." The emitted `steps[]` must include the **Phase-5 metadata fields** (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`) once Phase 5 has shipped, so imported recipes are linter-clean and publishable (§3.4 dependency note). Update `RECIPE-IMPORT-GUIDE.md` (repo root) to match. *Verify:* running the skill on a sample recipe yields valid importable JSON (steps carrying the Phase-5 fields), no `.js` script.

7. **Retire the bespoke pipeline.** Delete the stale `update-salmon-roasted-veg.js` (repo root) **and the two surviving bespoke import scripts `examples/white-bean-stew/import-white-bean-stew.js` and `examples/broccoli-patties/import-broccoli-patties.js`** — the same script pattern being retired. **Keep** the sibling reference files in `examples/` (`*-flow.md`, `*-product-results.md`, `product-check-results.json`): the skill still cites the `examples/` flow diagrams as reference (`SKILL.md:44,262`), so the directory is retained, only its `import-*.js` scripts are removed. Remove content-migration guidance from the skill. Decide the fate of maintenance scripts (all under `recipe-planner/scripts/`, not repo-root `scripts/` which is empty): `recipe-planner/scripts/sync-to-test.js` and `recipe-planner/scripts/compare-product-ids.js` are only needed for schema re-sync now — keep but re-document as schema-only; `recipe-planner/scripts/find-duplicates.js` / `recipe-planner/scripts/find-product-matches.js` stay (Phase 1/registry tools). *Verify:* no `import-*.js` / `migrate-*.js` / `update-*.js` recipe scripts remain anywhere in the repo — root **or** `examples/`; skill references no test-DB content flow.

8. **`recipe_notes` collection on prod** (§3.3) + `types.ts` types + `lib/api.ts` collection entry (`recipeNotes: "recipe_notes"`). *Verify:* collection exists with `created` autodate; a note can be created and listed oldest-first.

9. **One-tap note capture UI.** A small "add note" affordance on: calendar cells (`WeeklyPlans.tsx` / `WeeklyCalendar.tsx`), cook mode (Phase 5 surface — coordinate; if cook mode isn't built yet, ship calendar + recipe-card capture and leave a cook-mode hook), and recipe cards (`Recipes.tsx`). Each opens a one-field dialog that writes a `pending` `recipe_notes` row. *Verify:* tapping the affordance and typing creates a queue row without navigating away.

10. **`/suggest-recipes` skill** (`.claude/skills/suggest-recipes/SKILL.md`). Reads `products`, `planned_meals`, `weekly_plans`; applies the four constraints; emits 3–5 §3.4 JSON docs — including the **Phase-5 step-metadata fields** (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`) on each step once Phase 5 has shipped, so candidates import linter-clean. Documents the interim macro-floor handling (§7). *Verify:* invoking it returns paste-ready JSON candidates whose products are ≥~80% already in the registry and whose steps carry the Phase-5 fields.

11. **Evolution agent pass.** A skill/agent (`/apply-recipe-notes` — **Proposed** name) that, for each `pending` note: loads the published recipe graph, applies the note as a graph edit, writes a new `draft` recipe with `revision_of` = original via `writeRecipeGraph`, sets the note `applied` + `applied_revision`. *Verify:* running it on a "more lemon" note yields a draft revision with the lemon quantity increased and the original untouched.

12. **Week-wizard revision prompt.** In the Phase-4 wizard, when a candidate published recipe has a draft where `revision_of` = its id, show "updated per your note, review?" with approve (publish revision, archive original per §3.1) / keep-original. *Verify:* a recipe with a pending revision surfaces the prompt; approving swaps it in for future planning; declining leaves the original.

---

## 5. Dependencies & Prerequisites

- **Phase 4 (Week memory)** — the evolution-loop approval prompt lives *inside* the guided-fill week wizard (item 12), and `/suggest-recipes` LRU/recency logic relies on **dated `weekly_plans`** introduced in Phase 4. Note capture (items 8–11) and the whole import path (items 2–7) do **not** depend on Phase 4 and can ship first.
- **Phase 5 (Prep-day engine) — two distinct dependencies:**
  - **Step schema is a HARD input to the §3.4 contract.** Phase 5 adds `active_minutes`, `passive_minutes`, `instructions`, and `prep_action` to `recipe_steps` (verified absent today in `types.ts` and `pb_schema_updated.json`) and makes them **required at import, linter-enforced** (decision record Topic 4; phase-5 doc §3/AC1). The §3.4 `steps[]` shape carries these, and every JSON producer (items 5, 6, 10, 11) must emit them once Phase 5 has shipped — otherwise, with publish gated on linter-clean (§7), imported recipes could never be published without hand-editing. If Phase 6 ships any import surface before Phase 5, those steps are emitted without the fields and must be backfilled when Phase 5 lands.
  - **Cook mode** is one of the three note-capture surfaces (item 9). If cook mode ships after this phase, land calendar + recipe-card capture now and add the cook-mode entry point when cook mode exists. No hard block.
- **Phase 3 (Registry seeding) + nutrition-ready schema** — the `/suggest-recipes` **protein/macro floor** constraint depends on per-product nutrition data, which the decision record explicitly defers ("design for it, build later"). Until nutrition fields are populated, the macro floor is agent-estimated (§7). `/suggest-recipes` also benefits from a well-seeded registry for the ≥80%-overlap metric to be meaningful — better after Phase 3, usable before.
- **Infra — NAS PocketBase on tailnet** (`.planning/todos/pending/nas-pocketbase-tailnet.md`, `recipe-planner/src/lib/db-config.ts:15–18`): required for phone-based capture at the store to actually reach prod. Direct-to-prod import from a phone assumes reachability. This is the same prerequisite Phase 2 carries; if the tailnet switch hasn't happened, in-app import still works on the LAN, and phone capture works wherever prod is reachable.
- **Phase 1 (Data hygiene)** — a deduped registry with a unique `products.name` index makes the import page's name-match resolution reliable. Soft dependency for import generally, but it specifically **hardens the ambiguous exact-name-match case** (§2.2, item 5): before the unique index exists, two products can share a name and the page must surface both for the user to pick; after Phase 1 the ambiguity is designed out. Ship the multi-match picker regardless, but expect it to be a rare/dead path once Phase 1 lands.

Nothing in this phase depends on Phase 6 items landing in a strict internal order beyond the numbered plan; items 1–7 (import) and 8–12 (evolution) are two independently shippable tracks.

---

## 6. Acceptance Criteria

1. Every existing recipe reads `status = "published"`; no existing recipe changed rotation eligibility after the migration.
2. Creating a recipe through the import page produces a `draft` recipe in **prod** whose graph, opened in `RecipeEditor`, matches the pasted JSON (products resolved or created — purchased products with store/section, transient outputs without; steps; both edge directions correct). Its `tags[]` round-trip: each is resolved-or-created against `tags.name` and written as a `recipe_tags` row, so once published the recipe joins the matching Phase-4 rotation pool.
3. A `draft` recipe never appears in the weekly-plan recipe picker or wizard pools; it appears, badged, in the recipe list and is editable.
4. Publishing a draft makes it appear in planning; no deploy and no second database were involved at any point.
5. The `recipe-import` skill produces valid §3.4 JSON and generates **no** `.js` import or migration script; `RECIPE-IMPORT-GUIDE.md` matches.
6. No `import-*.js` / `migrate-*.js` / `update-*.js` recipe scripts remain anywhere in the repo — repo root **or** `examples/` (the sibling `examples/*/*-flow.md` and product-results reference files are retained); the skill contains no test→prod content-migration flow.
7. A one-tap note from a calendar cell (and recipe card) creates a `pending` `recipe_notes` row without leaving the current screen; the queue lists notes oldest-first.
8. The evolution agent turns a pending note into a `draft` recipe with `revision_of` set to the original, marks the note `applied` with `applied_revision`, and leaves the original published and unchanged.
9. The week wizard flags a published recipe that has a pending revision and lets the user approve (revision published, original archived) or keep the original.
10. `/suggest-recipes` returns 3–5 paste-ready §3.4 JSON candidates in which ≥~80% of referenced products already exist in the registry, each batch-prep compatible.
11. Once Phase 5 has shipped, an imported recipe's steps carry `active_minutes`, `passive_minutes`, `instructions`, and `prep_action`, and the recipe passes the linter cleanly — it can be published without hand-editing to fill missing step metadata. (Before Phase 5 exists, this criterion is inapplicable.)

---

## 7. Risks & Open Questions

- **Schema-dump drift (must fix first).** `pb_schema_updated.json` is missing live collections (`recipe_queue`, `meal_variant_overrides`). Any planner or migration built on it will be wrong. Item 1 addresses it; called out here because it is easy to miss and silently breaks assumptions.
- **Direct-to-prod safety.** The draft gate is the only thing preventing a malformed import from being plannable. If a bug lets a draft slip into planning, a bad graph reaches a real week. Mitigation: the `status="published"` filter is enforced at the single planning-load site (`WeeklyPlans.tsx:139`) and the wizard pools — keep those the *only* recipe-read paths that omit the filter deliberately. **Open:** should the import ever run structural validation (e.g. Phase-5 linter) before allowing publish? Recommend gating **publish** (not import) on linter-clean once the linter exists.
- **Macro floor without nutrition data (deferred dependency).** The protein/macro-floor constraint in `/suggest-recipes` cannot be computed precisely until nutrition enrichment lands (Phase 3+). **Interim (Proposed):** the agent estimates protein per serving from ingredients and states the estimate + confidence in each candidate, rather than hard-filtering. Revisit when FDC-linked nutrition fields are populated.
- **Post-approval fate of the original recipe (Proposed).** §3.1 — `archived` status vs hard delete. Recommend `archived` to preserve `planned_meals` history and `source_recipe` links; not yet decided.
- **Revision as a full recipe copy.** Modeling a revision as a *new* draft recipe (`revision_of`) duplicates the whole graph. Simple and reuses all existing mechanics, but two near-identical recipes exist until approval, and any `planned_meals` pointing at the original are not auto-repointed on approval. **Open:** on approval, do we repoint existing `planned_meals` from original→revision, or only affect future planning? Decision record implies future-only ("next time the recipe comes up"); recommend future-only, repoint nothing.
- **Note→graph-edit ambiguity.** Some notes map cleanly to a node ("more lemon" → bump a lemon quantity); others are vague ("was better as brussels"). The agent may misapply or need to no-op. Mitigation: the draft revision is always human-reviewed at the wizard before publish, so a bad revision is caught, not cooked. Notes the agent can't confidently apply should be left `pending` with a surfaced explanation rather than force a guess.
- **Default status for manually created recipes (Proposed).** Item 2/§3.1 — defaulting the "New Recipe" button to `draft` is a consistency choice beyond the decision record (which only mandates drafts for imports). Low risk either way; flag for confirmation.
- **Two note-capture surfaces vs three.** Cook-mode capture depends on Phase 5. Shipping only calendar + recipe-card capture first is acceptable and does not undermine the loop.
