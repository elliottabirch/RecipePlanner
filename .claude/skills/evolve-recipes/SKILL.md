---
name: evolve-recipes
description: Turn pending recipe notes into reviewable draft revisions, then write an approved revision back onto the original published recipe. Use when the user wants to process recipe feedback ("apply my recipe notes", "evolve this recipe", "drain the pending notes", "review the revision"), or when acting on the week wizard's "updated per your note, review?" flag. Manual, chat-first, human-reviewable — proposes changes and confirms before any write-back.
---

# Evolve Recipes

The manual evolution loop (D-10, D-11, IMP-06): drain `status="pending"`
`recipe_notes` into **draft revisions** of the target recipe, let the human
review them, and on approval write the reviewed graph **back onto the ORIGINAL
recipe id**. This is a manual skill (mirroring `recipe-import`), NOT an
automatic hook/cron — every revision is proposed and confirmed in chat before
it is written.

## The one invariant (read this first)

> **NEVER mint a new recipe id. NEVER churn unchanged node ids.**

`planned_meals.recipe → recipes.id` and
`meal_variant_overrides.original_node → recipe_product_nodes.id` are hard
relations. Keeping the recipe id AND every unchanged node id stable means
already-planned weeks and ingredient-swap overrides stay valid automatically —
no re-point, no override-remap migration. The write-back is an **in-place
branch** (D-10): the draft exists purely for review; approval `update`s the
original records in place. Only genuinely removed/replaced nodes can dangle an
override (`dangling`) — the far smaller blast radius D-10 accepts.

The two pure modules that guarantee this are already built and unit-tested —
**reuse them, do not re-implement the id logic**:

- `src/lib/import/write-back.ts` → `planWriteBack(reviewedGraph, originalNodeIds)`
  returns `{ remapSeed, dangling }`.
- `src/lib/import/build-recipe-graph.ts` → `buildRecipeGraph(graph, opts)` (the
  one graph-write spine) and `planGraphWrites` (its pure planner).

## Conventions (same as `recipe-import`)

- **Run scripts from inside `recipe-planner/`** (alongside its `node_modules`);
  a script that `import`s `pocketbase` from `/tmp/` or a parent dir fails with
  `ERR_MODULE_NOT_FOUND`.
- **Wrap the body in `async function main()` + `.catch`** — an unhandled
  pocketbase rejection prints the entire ~20K-char minified ESM bundle and
  drowns out the real error:
  ```javascript
  main().catch((e) => console.error("ERROR:", e.message, e.status, e.url));
  ```
- **PB URL**: `const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";`
  (prod default; point at `:8091` test for a rehearsal against a fresh
  `scripts/sync-to-test.js` copy).
- **Superuser auth** (writes need it): read creds from the gitignored
  `.env.local` env — **never hardcode or print them** (T-06-10c):
  ```javascript
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) throw new Error("set PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD");
  await pb.collection("_superusers").authWithPassword(email, password);
  ```
- One-off drain/write-back scripts are throwaway — **delete after running**;
  git history is the audit trail.

The write path is a **TypeScript** module. Import it from a Node script by
pointing at the source with a loader (e.g. `npx tsx drain-notes.ts` from inside
`recipe-planner/`), or port the tiny `planWriteBack` shape inline if you must
stay in plain `.js` — but the DB writes should still go through
`buildRecipeGraph` so the id-remap + edge-recreate + Phase-5 step-field handling
lives in exactly one place (a second copy drifts and reintroduces solved bugs).

---

## Operation 1 — DRAIN (pending notes → draft revision)

Turns each pending note into a reviewable `draft` clone of its target recipe.
The note stays `pending` until the human reviews + approves (Operation 2).

1. **Query pending notes, grouped by recipe.**
   ```javascript
   const notes = await pb.collection("recipe_notes").getFullList({
     filter: 'status="pending"',
     expand: "recipe",
   });
   // group by note.recipe → one draft revision per target recipe R
   ```

2. **For each target recipe R, do a `loadRecipe`-equivalent read** — the same
   6 collections `RecipeEditor.loadRecipe()` reads (RecipeEditor.tsx:272-305),
   each filtered by `recipe="R"`:
   `recipes` (getOne), `recipe_product_nodes`, `recipe_steps`,
   `product_to_step_edges`, `step_to_product_edges`, `recipe_tags`.

3. **Build a `NormalizedGraph` for the clone, applying the note's intent.**
   Show the proposed change in chat and confirm before writing. The graph shape
   is the same one `buildRecipeGraph` consumes (see `validate-import.ts`
   `NormalizedGraph`): `{ recipe, tagIds, productNodes[], steps[], edges[] }`.
   Use the existing `product-*` / `step-*` ref convention for every node.
   Apply the note (edit a step's `instructions`/`active_minutes`, change a
   node's `quantity`, add a new product node + step, etc.).

4. **Set the correspondence link — this is what makes write-back id-stable.**
   For every cloned node that came from an original node, set
   `sourceNode = <the original node's dbId>`. Nodes the revision **adds** carry
   **no** `sourceNode` (they'll be created fresh on write-back).
   ```javascript
   // cloned-from-original node:
   { ref: "product-1", name: "Onion", unit: "each", quantity: 3,
     matchProductId: origNode.product, sourceNode: origNode.id }
   // brand-new node the revision adds:
   { ref: "product-new", name: "Garlic", unit: "clove", matchProductId: garlicId }
   ```

5. **Write the draft + link the note.** `buildRecipeGraph` mints the draft
   recipe id (this is the ONE place a new id is created — for the review copy,
   never for the write-back):
   ```javascript
   const { recipeId: draftId } = await buildRecipeGraph(cloneGraph, {
     /* status + revision_of live on cloneGraph.recipe */
   });
   // cloneGraph.recipe = { name: R.name, status: "draft", revision_of: R.id, ... }
   await pb.collection("recipe_notes").update(note.id, { draft_revision: draftId });
   // leave note.status = "pending" until the human approves in Operation 2
   ```
   The draft is now visible + badged in the recipe list, invisible to planning,
   and the week wizard's flag lights up for R (it queries drafts where
   `revision_of = R.id && status = "draft"`).

---

## Operation 2 — APPROVE / WRITE-BACK (reviewed draft → original recipe id)

Given an approved draft `R'` (produced by Operation 1, carrying per-node
`source_node` links). **Confirm approval in chat first** — this mutates a live,
possibly-planned recipe in place.

1. **Read the reviewed draft `R'`** (same 6-collection read) and **the original
   `R`'s current node ids** (`recipe_product_nodes` + `recipe_steps` where
   `recipe="R"`).
   ```javascript
   const originalNodeIds = [
     ...(await pb.collection("recipe_product_nodes").getFullList({ filter: `recipe="${R}"` })).map(n => n.id),
     ...(await pb.collection("recipe_steps").getFullList({ filter: `recipe="${R}"` })).map(s => s.id),
   ];
   ```

2. **Build the reviewed `NormalizedGraph` from `R'`** (each node keeps its
   `sourceNode` link) and **call `planWriteBack`**:
   ```javascript
   import { planWriteBack } from "./src/lib/import/write-back";
   const { remapSeed, dangling } = planWriteBack(reviewedGraph, originalNodeIds);
   // remapSeed[ref] = original node id  → those nodes UPDATE in place
   // dangling = original node ids no reviewed node maps back to (removed/replaced)
   ```

3. **Write back onto the ORIGINAL recipe id** — pass `recipeId: R` (NOT a new
   record) and the `remapSeed`:
   ```javascript
   await buildRecipeGraph(reviewedGraph, { recipeId: R, remapSeed });
   ```
   - Recipe id stays `R` → every `planned_meals.recipe` row stays valid.
   - Every `remapSeed` node id stays → `meal_variant_overrides.original_node`
     for unchanged nodes stays valid.
   - New nodes (no `source_node`) are created fresh; edges are recreated
     (edge ids don't matter — nothing relates to them).

4. **Clean up the dangling residual** (the only accepted override-dangle,
   D-10). Delete the original nodes in `dangling` — these are nodes the revision
   removed/replaced; any override pointing at them is the small residual D-10
   deferred:
   ```javascript
   for (const nodeId of dangling) {
     // node lives in recipe_product_nodes OR recipe_steps — try both / know which
     await pb.collection(collectionForNode).delete(nodeId);
   }
   ```

5. **Close the loop.** Mark the note applied and archive/delete the draft:
   ```javascript
   await pb.collection("recipe_notes").update(note.id, { status: "applied" });
   await pb.collection("recipes").delete(R2 /* draft R' id */);
   ```
   Report to the user: which nodes updated in place, which were created, and any
   `dangling` nodes removed (so they can re-point an affected override if one
   existed).

---

## Why this shape (D-10 / D-11 rationale)

- **In-place branch, not a record swap** (D-10): the household can't have a
  mid-week dinner recipe change under them, and a new recipe id would orphan
  every planned meal + override. Writing back onto `R` keeps the published
  recipe live and stable through the whole review.
- **Manual + chat-first** (D-11): drafts are produced for review; the note stays
  `pending` and the write-back happens **only on explicit approval** — no note
  is drained silently, no revision is applied unreviewed (T-06-10b).
- **`planWriteBack` is unit-tested** (`src/lib/import/write-back.test.ts`) for
  exactly the three cases that keep overrides valid: unchanged node → id
  preserved, new node → created fresh, removed node → dangling. Trust it; don't
  hand-roll the remap.

## Related

- `recipe-import` skill — the import-side sibling (JSON → draft in prod); same
  run-from-inside-`recipe-planner/` + `async main()` + auth conventions.
- `src/lib/import/write-back.ts`, `src/lib/import/build-recipe-graph.ts` — the
  pure planners this skill orchestrates.
- Week wizard flag: drafts where `revision_of = R.id && status="draft"` render
  "updated per your note, review?" for recipe R.
