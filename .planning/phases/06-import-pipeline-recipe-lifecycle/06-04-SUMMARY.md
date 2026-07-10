---
phase: 06-import-pipeline-recipe-lifecycle
plan: 04
subsystem: import-pipeline
tags: [graph-write, refactor, recipe-editor, id-remap, spine]
requires:
  - "NormalizedGraph type (Plan 06-02 validate-import.ts)"
  - "Recipe.status / revision_of + recipe_product_nodes.source_node schema (Plan 06-01)"
provides:
  - "planGraphWrites(graph, remapSeed) — pure create/update/edge planner"
  - "buildRecipeGraph(graph, opts) — the single PB write executor (ref→dbId map)"
  - "RecipeEditor.handleSave delegating to the shared spine"
affects:
  - "recipe-planner/src/pages/RecipeEditor.tsx"
  - "recipe-planner/src/lib/import/validate-import.ts"
tech-stack:
  added: []
  patterns:
    - "pure-planner + thin-executor split (unit-testable id-remap without live PB)"
    - "lazy import('../api') to keep the pure module node-env importable past the localStorage-reading pb client (mirrors 06-03 recipe-lint)"
key-files:
  created:
    - recipe-planner/src/lib/import/build-recipe-graph.ts
    - recipe-planner/src/lib/import/graph-write.test.ts
  modified:
    - recipe-planner/src/pages/RecipeEditor.tsx
    - recipe-planner/src/lib/import/validate-import.ts
decisions:
  - "recipe create-vs-update is carried through a reserved remapSeed key (__recipe__) so planGraphWrites keeps its (graph, remapSeed) signature and stays pure"
  - "planGraphWrites node data OMITS the recipe relation; the executor injects recipe:recipeId once known — keeps the planner testable without a live recipe"
  - "New-Recipe (isNew) create path sets status=published explicitly (Open Q1 / Pitfall 3); only import/evolution set draft"
  - "NormalizedProductNode/Step extended with optional write-path fields (mealDestination, sourceNode) so the editor→graph build is behavior-identical and D-10 write-back has its seam"
  - "executor generics use PocketBase RecordModel (not a local shape) to satisfy create/getAll<T extends RecordModel> under tsc -b"
metrics:
  duration: 18min
  completed: "2026-07-10"
  tasks: 3
  files: 4
status: complete
---

# Phase 06 Plan 04: Graph-Write Spine Extraction Summary

One pure `planGraphWrites(graph, remapSeed)` planner plus a thin `buildRecipeGraph(graph, opts)` PocketBase executor extracted from `RecipeEditor.handleSave`, with `handleSave` refactored to build a `NormalizedGraph` and delegate — collapsing recipe/node/step/edge writes to exactly one path (D-01/D-05, IMP-02).

## What Was Built

- **`planGraphWrites` (pure, api-free):** turns a `NormalizedGraph` + `remapSeed` into a plain-data `GraphWritePlan` — recipe create-or-update, per-node `{op, collection, ref, dbId?, data}`, and edge `{collection, sourceRef, targetRef}` entries. Ports the verified handleSave contract: ref in `remapSeed` → update-in-place, ref absent → create; edge direction inferred from the `product-*`/`step-*` ref prefix; edges skipped when an endpoint is unresolved or is a product↔product / step↔step pair; positions emitted as `{x:0,y:0}` (non-load-bearing — `loadRecipe` re-runs dagre). Carries all Phase-5 step fields (active_minutes, passive_minutes, instructions, prep_action, resource, oven_temp_f, rack_slots).
- **`buildRecipeGraph` (thin executor):** lazy-imports `../api`, runs the planner, executes the recipe op, node ops (injecting the `recipe` relation), and edge delete-all-then-recreate; returns `{recipeId, nodeDbIds}` (the ref→dbId map that seeds evolution write-back, Plan 10).
- **`graph-write.test.ts`:** 15 pure Vitest cases (node env, no live PB) covering create-vs-update per remapSeed, edge direction inference, endpoint resolution (incl. seed-only refs), Phase-5 field pass-through, `{0,0}` positions, and status/revision_of/source_node handling.
- **`RecipeEditor.handleSave` refactor:** builds a `NormalizedGraph` from ReactFlow nodes/edges + name/notes/recipeType, delegates to `buildRecipeGraph` (passing `id` + `nodeDbIds` as remapSeed for the existing-recipe case), then keeps the tag diff-sync + navigate behavior. New-Recipe create path sets `status="published"`.

## How to Verify

- `cd recipe-planner && npx vitest run src/lib/import/graph-write.test.ts` → 15/15 green.
- `cd recipe-planner && npx tsc --noEmit` → clean; `npm run build` (`tsc -b && vite build`) → green.
- Full suite: `npx vitest run` → 238/238 (29 files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Executor generics rejected by `tsc -b`**
- **Found during:** Task 3 build smoke.
- **Issue:** `npx tsc --noEmit` (root config) passed, but the build's `tsc -b` project config enforces `create/getAll<T extends RecordModel>`; a local `{ id: string }` shape is missing `collectionId`/`collectionName`.
- **Fix:** import `type { RecordModel } from "pocketbase"` and use `create<RecordModel>` / `getAll<RecordModel>`.
- **Files modified:** recipe-planner/src/lib/import/build-recipe-graph.ts
- **Commit:** 26b8a6e

**2. [Rule 2 - Correctness] Carried `mealDestination` + purity guard**
- The pure planner must not import `../api` (pocketbase.ts reads `localStorage` at module load → node-env crash), so collection names are duplicated as string literals and the executor lazy-imports `../api` (mirrors 06-03 recipe-lint). `NormalizedProductNode`/`Step` gained optional `mealDestination`/`sourceNode` so the editor→graph build preserves the original `meal_destination` write exactly and seeds D-10 write-back. Both are additive/optional — no validate-import behavior change.

## Needs UI Verification (UAT)

Task 3 was a `checkpoint:human-verify` (live editor smoke — jsdom-untestable). Auto-mode: not blocked; automated tsc + full-suite + production build all green. Manual UAT steps for end-of-phase:

1. `cd recipe-planner && npm run dev` (Test DB is fine).
2. Open an EXISTING recipe: change a step's `active_minutes` and a product node's quantity, add one new step + one edge, Save.
3. Reload the recipe — confirm the edited values, the new step, and the new edge all persisted (Phase-5 fields intact).
4. Create a NEW recipe (1 product + 1 step + 1 edge), Save — confirm it lands, reopens correctly, and appears in the recipe list (status published).

## Self-Check: PASSED
