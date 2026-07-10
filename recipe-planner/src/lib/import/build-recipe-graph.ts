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
import type { NormalizedGraph } from "./validate-import";

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
 *  - edges are recreated each save; direction inferred from the `product-*` /
 *    `step-*` ref prefix; an edge is skipped when either endpoint ref does not
 *    resolve (not a graph node and not seeded) or is a product↔product /
 *    step↔step pair (no valid edge collection)
 *  - positions are emitted as {x:0,y:0} (non-load-bearing; loadRecipe re-runs dagre)
 */
export function planGraphWrites(
  graph: NormalizedGraph,
  remapSeed: Record<string, string> = {}
): GraphWritePlan {
  // --- Recipe op -----------------------------------------------------------
  const recipeDbId = remapSeed[RECIPE_REMAP_KEY];
  const recipeData: Record<string, unknown> = {
    name: graph.recipe.name,
    notes: graph.recipe.notes,
    recipe_type: graph.recipe.recipe_type,
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
    const data: Record<string, unknown> = {
      product: pn.matchProductId,
      quantity: pn.quantity,
      unit: pn.unit,
      meal_destination: pn.mealDestination,
      position_x: 0,
      position_y: 0,
      ...(pn.sourceNode ? { source_node: pn.sourceNode } : {}),
    };
    const dbId = remapSeed[pn.ref];
    nodes.push({
      op: dbId ? "update" : "create",
      collection: COLLECTION_PRODUCT_NODES,
      ref: pn.ref,
      ...(dbId ? { dbId } : {}),
      data,
    });
  }

  for (const step of graph.steps) {
    const data: Record<string, unknown> = {
      name: step.name,
      step_type: step.step_type,
      timing: step.timing,
      position_x: 0,
      position_y: 0,
      active_minutes: step.active_minutes,
      passive_minutes: step.passive_minutes,
      instructions: step.instructions,
      prep_action: step.prep_action,
      resource: step.resource,
      oven_temp_f: step.oven_temp_f,
      rack_slots: step.rack_slots,
      ...(step.sourceNode ? { source_node: step.sourceNode } : {}),
    };
    const dbId = remapSeed[step.ref];
    nodes.push({
      op: dbId ? "update" : "create",
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
  for (const pn of graph.productNodes) resolvable.add(pn.ref);
  for (const step of graph.steps) resolvable.add(step.ref);
  for (const key of Object.keys(remapSeed)) {
    if (key !== RECIPE_REMAP_KEY) resolvable.add(key);
  }

  const edges: EdgeWriteOp[] = [];
  for (const edge of graph.edges) {
    if (!resolvable.has(edge.from) || !resolvable.has(edge.to)) continue;
    const sourceIsProduct = edge.from.startsWith("product");
    const targetIsProduct = edge.to.startsWith("product");
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
  type RecordLike = { id: string };

  const seed = { ...(opts?.remapSeed ?? {}) };
  const planSeed: Record<string, string> = { ...seed };
  if (opts?.recipeId) planSeed[RECIPE_REMAP_KEY] = opts.recipeId;

  const plan = planGraphWrites(graph, planSeed);

  // 1. Recipe.
  let recipeId: string;
  if (plan.recipe.op === "update") {
    await update(collections.recipes, plan.recipe.dbId!, plan.recipe.data);
    recipeId = plan.recipe.dbId!;
  } else {
    const created = await create<RecordLike & Record<string, unknown>>(
      collections.recipes,
      plan.recipe.data
    );
    recipeId = created.id;
  }

  // 2. Nodes — inject the recipe relation, create or update, record dbIds.
  const nodeDbIds: Record<string, string> = { ...seed };
  for (const nodeOp of plan.nodes) {
    const data = { recipe: recipeId, ...nodeOp.data };
    if (nodeOp.op === "update") {
      await update(nodeOp.collection, nodeOp.dbId!, data);
      nodeDbIds[nodeOp.ref] = nodeOp.dbId!;
    } else {
      const created = await create<RecordLike & Record<string, unknown>>(
        nodeOp.collection,
        data
      );
      nodeDbIds[nodeOp.ref] = created.id;
    }
  }

  // 3. Edges — delete all existing (existing-recipe path only), then recreate.
  if (opts?.recipeId) {
    const [oldPts, oldStp] = await Promise.all([
      getAll<RecordLike>(collections.productToStepEdges, {
        filter: `recipe="${recipeId}"`,
      }),
      getAll<RecordLike>(collections.stepToProductEdges, {
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
    await create(edgeOp.collection, {
      recipe: recipeId,
      source: sourceDbId,
      target: targetDbId,
    });
  }

  return { recipeId, nodeDbIds };
}
