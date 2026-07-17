/**
 * The single recipe graph-write spine (Plan 06-04, D-01/D-05, IMP-02).
 *
 * A pure planner `planGraphWrites(graph, remapSeed)` + a thin PB executor
 * `buildRecipeGraph(graph, opts)` extracted from `RecipeEditor.handleSave`
 * (657-825). This is the ONE write path: RecipeEditor's manual save, import
 * landing (Plan 07), /suggest landing (Plan 11), and evolution write-back
 * (Plan 10) all delegate here so the subtle id-remap + edge-recreate +
 * Phase-5 step-field handling exists in exactly one place (Anti-Pattern: a
 * second copy drifts and reintroduces solved bugs).
 *
 * IMPORT-TIME PURITY (mirrors linter/recipe-lint.ts, Phase 06-03): the pure
 * `planGraphWrites` and all types/constants below MUST NOT import `../api`,
 * because `api.ts` → `pocketbase.ts` reads `localStorage` at module load and
 * would crash the node-env Vitest suite. The executor `buildRecipeGraph`
 * therefore lazy-imports `../api` inside the async body only.
 */
import type { RecordModel } from "pocketbase";
import type { NormalizedGraph } from "./validate-import";
import { normalizeUnit } from "../units";

export type { NormalizedGraph } from "./validate-import";

// Collection-name literals duplicated as plain strings so the pure planner
// stays free of the `../api` import (see module doc). They must match the
// `collections` map in lib/api.ts exactly.
export const COLLECTION_PRODUCT_NODES = "recipe_product_nodes";
export const COLLECTION_STEPS = "recipe_steps";
export const COLLECTION_PRODUCT_TO_STEP = "product_to_step_edges";
export const COLLECTION_STEP_TO_PRODUCT = "step_to_product_edges";

/**
 * Reserved key in a `remapSeed` map used to carry the recipe's own existing
 * dbId (create-vs-update for the recipe record itself). Node refs follow the
 * `product-*` / `step-*` convention, so this sentinel never collides with a
 * node ref. `buildRecipeGraph` injects it from `opts.recipeId`.
 */
export const RECIPE_REMAP_KEY = "__recipe__";

type NodeCollection = typeof COLLECTION_PRODUCT_NODES | typeof COLLECTION_STEPS;
type EdgeCollection =
  | typeof COLLECTION_PRODUCT_TO_STEP
  | typeof COLLECTION_STEP_TO_PRODUCT;

/** Recipe create-or-update op. `data` never includes the recipe's own id. */
export interface RecipeWriteOp {
  op: "create" | "update";
  dbId?: string;
  data: Record<string, unknown>;
}

/**
 * A single node write op. `data` deliberately OMITS the `recipe` relation —
 * the executor injects it once the recipe id is known (so the planner stays
 * pure and testable without a live recipe).
 */
export interface NodeWriteOp {
  op: "create" | "update";
  collection: NodeCollection;
  ref: string;
  dbId?: string;
  data: Record<string, unknown>;
}

/** A single edge to (re)create. Direction already resolved to a collection. */
export interface EdgeWriteOp {
  collection: EdgeCollection;
  sourceRef: string;
  targetRef: string;
}

export interface GraphWritePlan {
  recipe: RecipeWriteOp;
  nodes: NodeWriteOp[];
  edges: EdgeWriteOp[];
}

/**
 * PURE. Turn a `NormalizedGraph` + a `remapSeed` (ref→existing dbId) into a
 * plain-data description of the writes needed, WITHOUT touching PocketBase.
 *
 * Ports the verified handleSave contract (RecipeEditor.tsx 704-813):
 *  - a ref present in `remapSeed` → `update` in place (that dbId); absent → `create`
 *  - edges are recreated each save; direction is resolved from each endpoint's
 *    node KIND (a product node vs a step node in the graph), falling back to the
 *    `product-*` / `step-*` ref prefix only for refs present solely in
 *    `remapSeed` (WR-02: kind resolution stops a valid edge between
 *    non-prefixed node refs from being silently dropped). An edge is skipped
 *    when either endpoint ref does not resolve (not a graph node and not seeded)
 *    or is a product↔product / step↔step pair (no valid edge collection —
 *    `validateImportJson` rejects these before they reach here)
 *  - positions are emitted as {x:0,y:0} (non-load-bearing; loadRecipe re-runs dagre)
 */
export function planGraphWrites(
  graph: NormalizedGraph,
  remapSeed: Record<string, string> = {}
): GraphWritePlan {
  // --- Recipe op -----------------------------------------------------------
  // WR-01: on the UPDATE path a field left `undefined` is dropped by the PB SDK
  // (JSON.stringify omits undefined keys) — so an update could only ever SET a
  // field, never CLEAR one back to empty. Emit explicit empty sentinels
  // (`""` for text/select, `null` for number) for clearable fields on update so
  // blanking a field actually persists. The CREATE path is unchanged: undefined
  // keys are dropped and PB applies its own empty defaults.
  const recipeDbId = remapSeed[RECIPE_REMAP_KEY];
  const isRecipeUpdate = Boolean(recipeDbId);
  const recipeData: Record<string, unknown> = {
    name: graph.recipe.name,
    notes: isRecipeUpdate ? graph.recipe.notes ?? "" : graph.recipe.notes,
    recipe_type: isRecipeUpdate
      ? graph.recipe.recipe_type ?? ""
      : graph.recipe.recipe_type,
    ...(graph.recipe.status ? { status: graph.recipe.status } : {}),
    ...(graph.recipe.revision_of
      ? { revision_of: graph.recipe.revision_of }
      : {}),
  };
  const recipe: RecipeWriteOp = recipeDbId
    ? { op: "update", dbId: recipeDbId, data: recipeData }
    : { op: "create", data: recipeData };

  // --- Node ops (create-vs-update per remapSeed) ---------------------------
  const nodes: NodeWriteOp[] = [];

  for (const pn of graph.productNodes) {
    const dbId = remapSeed[pn.ref];
    const isUpdate = Boolean(dbId);
    const data: Record<string, unknown> = {
      product: pn.matchProductId,
      // WR-01: clear on update — quantity is a number (→ null), meal_destination
      // is text (→ "").
      quantity: isUpdate ? pn.quantity ?? null : pn.quantity,
      // D-08: normalize aliases (e.g. "cloves" -> "each") at the single
      // write path shared by RecipeEditor.handleSave and the /import page
      // (Phase 06-04) — this is the import-JSON-contract hole planning_findings
      // #10 identifies (the editor's unit input is already enum-bound). Keeps
      // existing empty semantics intact: "" stays "" (not a WR-01 clear
      // sentinel, `unit` is already a plain required string).
      unit: normalizeUnit(pn.unit) ?? pn.unit,
      meal_destination: isUpdate ? pn.mealDestination ?? "" : pn.mealDestination,
      position_x: 0,
      position_y: 0,
      ...(pn.sourceNode ? { source_node: pn.sourceNode } : {}),
    };
    nodes.push({
      op: isUpdate ? "update" : "create",
      collection: COLLECTION_PRODUCT_NODES,
      ref: pn.ref,
      ...(dbId ? { dbId } : {}),
      data,
    });
  }

  for (const step of graph.steps) {
    const dbId = remapSeed[step.ref];
    const isUpdate = Boolean(dbId);
    // WR-01: clear on update. This is the concrete assembly→prep bug — a prep
    // step must be able to blank `timing` (select → "") so the prep-day
    // scheduler does not consume a stale serve-time timing. Number fields
    // (active/passive minutes, oven_temp_f, rack_slots) clear with null;
    // select/text fields (timing, prep_action, resource, instructions) with "".
    const data: Record<string, unknown> = {
      name: step.name,
      step_type: step.step_type,
      timing: isUpdate ? step.timing ?? "" : step.timing,
      position_x: 0,
      position_y: 0,
      active_minutes: isUpdate ? step.active_minutes ?? null : step.active_minutes,
      passive_minutes: isUpdate
        ? step.passive_minutes ?? null
        : step.passive_minutes,
      instructions: isUpdate ? step.instructions ?? "" : step.instructions,
      prep_action: isUpdate ? step.prep_action ?? "" : step.prep_action,
      resource: isUpdate ? step.resource ?? "" : step.resource,
      oven_temp_f: isUpdate ? step.oven_temp_f ?? null : step.oven_temp_f,
      rack_slots: isUpdate ? step.rack_slots ?? null : step.rack_slots,
      ...(step.sourceNode ? { source_node: step.sourceNode } : {}),
    };
    nodes.push({
      op: isUpdate ? "update" : "create",
      collection: COLLECTION_STEPS,
      ref: step.ref,
      ...(dbId ? { dbId } : {}),
      data,
    });
  }

  // --- Edge ops (direction + endpoint resolution) --------------------------
  // A ref resolves if it is a graph node or already seeded. Mirrors
  // handleSave's newNodeDbIds = {...seed, ...created}: every graph node ends
  // up with a dbId, and seeded refs are already present.
  const resolvable = new Set<string>();
  const productRefs = new Set<string>();
  const stepRefs = new Set<string>();
  for (const pn of graph.productNodes) {
    resolvable.add(pn.ref);
    productRefs.add(pn.ref);
  }
  for (const step of graph.steps) {
    resolvable.add(step.ref);
    stepRefs.add(step.ref);
  }
  for (const key of Object.keys(remapSeed)) {
    if (key !== RECIPE_REMAP_KEY) resolvable.add(key);
  }

  // WR-02: resolve direction from node kind, not the ref string. A ref present
  // only in `remapSeed` (an evolution write-back seed) has no declared node
  // here, so fall back to the `product-*` convention for those — RecipeEditor's
  // local node ids always follow it.
  const refIsProduct = (ref: string): boolean => {
    if (productRefs.has(ref)) return true;
    if (stepRefs.has(ref)) return false;
    return ref.startsWith("product");
  };

  const edges: EdgeWriteOp[] = [];
  for (const edge of graph.edges) {
    if (!resolvable.has(edge.from) || !resolvable.has(edge.to)) continue;
    const sourceIsProduct = refIsProduct(edge.from);
    const targetIsProduct = refIsProduct(edge.to);
    if (sourceIsProduct && !targetIsProduct) {
      edges.push({
        collection: COLLECTION_PRODUCT_TO_STEP,
        sourceRef: edge.from,
        targetRef: edge.to,
      });
    } else if (!sourceIsProduct && targetIsProduct) {
      edges.push({
        collection: COLLECTION_STEP_TO_PRODUCT,
        sourceRef: edge.from,
        targetRef: edge.to,
      });
    }
    // product→product / step→step: no valid edge collection — skipped, exactly
    // as handleSave (only product/step and step/product branches create).
  }

  return { recipe, nodes, edges };
}

/**
 * The thin PocketBase executor. Runs `planGraphWrites`, then executes the
 * recipe create/update, the node create/update ops (injecting the `recipe`
 * relation), and the edge delete-all-then-recreate — returning the full
 * ref→dbId map (mirrors handleSave's `newNodeDbIds`).
 *
 * `opts.recipeId` present → existing recipe (update path + old-edge purge);
 * absent → brand-new recipe (create path, no old edges to purge).
 * `opts.remapSeed` pre-populates ref→existing dbId for update-in-place /
 * evolution write-back.
 */
export async function buildRecipeGraph(
  graph: NormalizedGraph,
  opts?: { recipeId?: string; remapSeed?: Record<string, string> }
): Promise<{ recipeId: string; nodeDbIds: Record<string, string> }> {
  // Lazy import — keeps the pure planner + this module's types importable in a
  // node env without the localStorage-reading pb client (see module doc).
  const { create, update, getAll, remove, collections } = await import(
    "../api"
  );

  const seed = { ...(opts?.remapSeed ?? {}) };
  const planSeed: Record<string, string> = { ...seed };
  if (opts?.recipeId) planSeed[RECIPE_REMAP_KEY] = opts.recipeId;

  const plan = planGraphWrites(graph, planSeed);

  // Rollback bookkeeping — only for the brand-new-recipe (create) path. A
  // partially-written import (e.g. one step whose select value PB rejects) used
  // to leave an orphan recipe + partial nodes that poisoned the next attempt
  // (its auto-created products then auto-matched on retry). On the create path
  // we now delete everything THIS call created if any write throws, so a failed
  // import leaves no partial. The update path (evolution write-back) is left
  // exactly as before — its updates aren't cleanly reversible, so we don't try.
  const isNewRecipe = !opts?.recipeId;
  let createdRecipeId: string | null = null;
  const createdRecords: { collection: string; id: string }[] = [];

  try {
    // 1. Recipe.
    let recipeId: string;
    if (plan.recipe.op === "update") {
      await update(collections.recipes, plan.recipe.dbId!, plan.recipe.data);
      recipeId = plan.recipe.dbId!;
    } else {
      const created = await create<RecordModel>(
        collections.recipes,
        plan.recipe.data
      );
      recipeId = created.id;
      createdRecipeId = created.id;
    }

    // 1b. Tags (recipe_tags joins) — centralized on the shared write spine so
    // BOTH the /import path and the editor save persist tags identically (this
    // is what makes imported/suggested recipes actually land tagged). On the
    // update path, delete the recipe's existing joins first, then recreate from
    // graph.tagIds (mirrors the editor's prior in-place sync); on the create
    // path just create them and record for rollback.
    if (opts?.recipeId) {
      const existingTags = await getAll<RecordModel>(collections.recipeTags, {
        filter: `recipe="${recipeId}"`,
      });
      await Promise.all(
        existingTags.map((rt) => remove(collections.recipeTags, rt.id))
      );
    }
    for (const tagId of graph.tagIds) {
      const createdTag = await create<RecordModel>(collections.recipeTags, {
        recipe: recipeId,
        tag: tagId,
      });
      createdRecords.push({ collection: collections.recipeTags, id: createdTag.id });
    }

    // 2. Nodes — inject the recipe relation, create or update, record dbIds.
    const nodeDbIds: Record<string, string> = { ...seed };
    for (const nodeOp of plan.nodes) {
      const data = { recipe: recipeId, ...nodeOp.data };
      if (nodeOp.op === "update") {
        await update(nodeOp.collection, nodeOp.dbId!, data);
        nodeDbIds[nodeOp.ref] = nodeOp.dbId!;
      } else {
        const created = await create<RecordModel>(nodeOp.collection, data);
        nodeDbIds[nodeOp.ref] = created.id;
        createdRecords.push({ collection: nodeOp.collection, id: created.id });
      }
    }

    // 3. Edges — delete all existing (existing-recipe path only), then recreate.
    if (opts?.recipeId) {
      const [oldPts, oldStp] = await Promise.all([
        getAll<RecordModel>(collections.productToStepEdges, {
          filter: `recipe="${recipeId}"`,
        }),
        getAll<RecordModel>(collections.stepToProductEdges, {
          filter: `recipe="${recipeId}"`,
        }),
      ]);
      await Promise.all([
        ...oldPts.map((e) => remove(collections.productToStepEdges, e.id)),
        ...oldStp.map((e) => remove(collections.stepToProductEdges, e.id)),
      ]);
    }

    for (const edgeOp of plan.edges) {
      const sourceDbId = nodeDbIds[edgeOp.sourceRef];
      const targetDbId = nodeDbIds[edgeOp.targetRef];
      if (!sourceDbId || !targetDbId) continue; // handleSave line 799 guard
      const createdEdge = await create<RecordModel>(edgeOp.collection, {
        recipe: recipeId,
        source: sourceDbId,
        target: targetDbId,
      });
      createdRecords.push({ collection: edgeOp.collection, id: createdEdge.id });
    }

    return { recipeId, nodeDbIds };
  } catch (err) {
    if (isNewRecipe) {
      // Best-effort rollback (reverse order: edges/nodes/steps, then recipe).
      // Swallow individual delete failures — the original error is what matters.
      for (const r of createdRecords.reverse()) {
        await remove(r.collection, r.id).catch(() => {});
      }
      if (createdRecipeId) {
        await remove(collections.recipes, createdRecipeId).catch(() => {});
      }
    }
    throw err;
  }
}
