/**
 * Week-graph builder (PREP-03). Builds the scheduler's per-instance DAG
 * directly from `MealKeyedRecipeData` — the pre-aggregation, per-recipe
 * graph structure produced by `lib/aggregation.ts` — and NEVER routes
 * through the batch-list signature-merge helpers exported from
 * `lib/aggregation/utils/step-utils.ts`. Those helpers intentionally
 * collapse multiple planned instances of an identical step into one
 * aggregated batch-list node — correct for `BatchPrepTab.tsx`'s flat print
 * view, but WRONG here: it would make the scheduler lose per-meal
 * precedence edges and double-count resource usage (05-RESEARCH.md
 * Pitfall 3).
 *
 * Node ids: `${plannedMealId}::${step.id}` (`StepInstance.id`) — stable and
 * collision-proof even when the same recipe is planned twice in one week.
 *
 * Edges:
 *  - Intra-recipe: a step that consumes (via `productToStepEdges`) a
 *    product node produced (via `stepToProductEdges`) by another step IN
 *    THE SAME planned meal gets a precedence edge producer -> consumer.
 *  - Cross-recipe: for every consuming input product node whose expanded
 *    product type is `stored` or `inventory`, every producing output node
 *    in every OTHER planned meal whose product id matches gets an edge
 *    into the consumer (fan-in AND-semantics — 05-RESEARCH.md Assumption
 *    A4: the consumer waits on ALL matching producers, not just one). If
 *    no producer exists anywhere in the planned week, the input is left as
 *    a graph SOURCE (no edge) — surfacing that gap is the missing-pull-step
 *    linter's job (Plan 07), not a builder error.
 *
 * Week-wide prep merge (final pass): every single-raw-ingredient, `resource:
 * "none"` prep step across the WHOLE plan is collapsed into ONE node per raw
 * product (`merged-prep::<productId>`) whose `active_minutes` is the sum of its
 * members' — prep day is a single session, so "dice onion" for six soups
 * becomes one "Prep onion" task (D-01a follow-on, user-directed 2026-07-10).
 * This is deliberately NOT the batch-list signature-merge Pitfall 3 warns
 * against: (a) precedence is preserved, not lost — every member's downstream
 * edge is fanned out from the merged node, so the sliced-cucumber consumer and
 * the diced-cucumber consumer both still wait on it (cuts live on the consuming
 * edges, not the step); (b) no resource is double-booked — only `resource:
 * "none"` knife prep is merged, and summed active time is exact for a single
 * cook. Ingredients used by just one step are left untouched (nothing to
 * aggregate).
 */
import type {
  ExpandedProductNode,
  MealKeyedRecipeData,
  RecipeGraphData,
} from "../aggregation/types";
import { ProductType, StepType, Timing, type RecipeStep } from "../types";
import type { StepInstance, WeekGraph, WeekGraphEdge } from "./types";

/** `plannedMealId` sentinel for a week-wide merged prep node — it belongs to no
 * single planned meal. Cook Mode keys merged behaviour off `mergedMembers`, not
 * this value, so it only needs to be non-colliding with a real meal id. */
const MERGED_PREP_MEAL_ID = "__merged_prep__";

function instanceId(plannedMealId: string, stepId: string): string {
  return `${plannedMealId}::${stepId}`;
}

function findProductNode(
  recipeData: RecipeGraphData,
  nodeId: string
): ExpandedProductNode | undefined {
  return recipeData.productNodes.find((node) => node.id === nodeId);
}

/**
 * If `stepId`'s ONLY input is a single RAW product node — the signature of a
 * one-ingredient knife-prep step (dice onion, slice cucumber) — return that
 * product's id and name; otherwise `null`. A step consuming a raw ingredient
 * plus anything else (stored stock, a transient) is a cook/assembly step, not
 * mergeable prep.
 */
function singleRawInput(
  recipeData: RecipeGraphData,
  stepId: string
): { productId: string; productName: string } | null {
  const inputs = recipeData.productToStepEdges.filter((e) => e.target === stepId);
  if (inputs.length !== 1) return null;
  const product = findProductNode(recipeData, inputs[0].source)?.expand?.product;
  if (product?.type !== ProductType.Raw) return null;
  return { productId: product.id, productName: product.name };
}

/** The label a merged member contributes to the breakdown: its `prep_action`
 * when set (the clean enum vocabulary), else the leading verb of its step name
 * ("squeeze lemons" -> "squeeze") so actionless prep still gets counted. Uses
 * `||` (not `??`): PocketBase stores an un-set `prep_action` as `""`, which
 * `??` would wrongly keep. */
function memberActionLabel(step: RecipeStep): string {
  const fromName = step.name.trim().split(/\s+/)[0]?.toLowerCase();
  return step.prep_action || fromName || "prep";
}

/** Synthetic `RecipeStep` for a merged prep node: summed active time, no
 * passive, no resource; name carries the per-action breakdown over ALL members
 * ("Prep lemon (grated ×1, squeeze ×1)"). `prep_action` is set only when every
 * member shared one real cut action, else left unset (mixed). */
function makeMergedPrepStep(
  mergedId: string,
  productName: string,
  members: StepInstance[]
): RecipeStep {
  // Count every member by its action label, preserving first-seen order for
  // deterministic output.
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const member of members) {
    const label = memberActionLabel(member.step);
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const breakdown = ` (${order.map((l) => `${l} ×${counts.get(l)}`).join(", ")})`;

  const cutActions = [
    ...new Set(
      members.map((m) => m.step.prep_action).filter((a): a is string => Boolean(a))
    ),
  ];
  return {
    id: mergedId,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "",
    name: `Prep ${productName}${breakdown}`,
    step_type: StepType.Prep,
    active_minutes: members.reduce((s, m) => s + (m.step.active_minutes ?? 0), 0),
    passive_minutes: 0,
    resource: "none",
    rack_slots: 1,
    prep_action: cutActions.length === 1 ? cutActions[0] : undefined,
  } as RecipeStep;
}

export function buildWeekGraph(mealData: MealKeyedRecipeData): WeekGraph {
  const nodes: StepInstance[] = [];
  const edges: WeekGraphEdge[] = [];

  // (1) Per-instance step nodes — one per (plannedMealId, step.id) pair, EXCEPT
  // `just_in_time` steps: those are day-of assembly/serving (plate the bowls,
  // build the sandwich) and have no place in a prep-day schedule (D-01a
  // follow-on, user-directed 2026-07-10). `batch` and blank-timing steps are
  // kept — blank is treated as prep-day, since some real batch steps predate
  // the `timing` field. `includedIds` gates every edge below so nothing dangles
  // into an excluded step. Alongside, note which nodes are single-raw-ingredient
  // prep (the merge pass (4) below consumes this).
  const includedIds = new Set<string>();
  const mergeableInfo = new Map<string, { productId: string; productName: string }>();
  for (const [plannedMealId, recipeData] of mealData) {
    for (const step of recipeData.steps) {
      if (step.timing === Timing.JustInTime) continue;
      const id = instanceId(plannedMealId, step.id);
      includedIds.add(id);
      nodes.push({
        id,
        plannedMealId,
        step,
        recipeName: recipeData.recipe.name,
      });
      if ((step.resource ?? "none") === "none") {
        const raw = singleRawInput(recipeData, step.id);
        if (raw) mergeableInfo.set(id, raw);
      }
    }
  }

  // (2) Intra-recipe precedence edges: within a single planned meal, a
  // product node produced by one step (stepToProductEdges: step -> node)
  // and consumed by another (productToStepEdges: node -> step) gets a
  // producer -> consumer edge, matched by node id.
  for (const [plannedMealId, recipeData] of mealData) {
    const producerStepIdByNodeId = new Map<string, string>();
    for (const edge of recipeData.stepToProductEdges) {
      producerStepIdByNodeId.set(edge.target, edge.source);
    }
    for (const edge of recipeData.productToStepEdges) {
      const producerStepId = producerStepIdByNodeId.get(edge.source);
      if (producerStepId && producerStepId !== edge.target) {
        const from = instanceId(plannedMealId, producerStepId);
        const to = instanceId(plannedMealId, edge.target);
        if (includedIds.has(from) && includedIds.has(to)) edges.push({ from, to });
      }
    }
  }

  // (3) Cross-recipe edges: for every consuming input product node whose
  // product type is stored/inventory, fan in an edge from every producing
  // output node (matched by product id) found in every OTHER planned meal.
  for (const [consumerMealId, consumerRecipeData] of mealData) {
    for (const consumeEdge of consumerRecipeData.productToStepEdges) {
      const inputNode = findProductNode(consumerRecipeData, consumeEdge.source);
      const inputProduct = inputNode?.expand?.product;
      if (!inputProduct) continue;
      if (
        inputProduct.type !== ProductType.Stored &&
        inputProduct.type !== ProductType.Inventory
      ) {
        continue;
      }

      for (const [producerMealId, producerRecipeData] of mealData) {
        if (producerMealId === consumerMealId) continue;

        for (const produceEdge of producerRecipeData.stepToProductEdges) {
          const outputNode = findProductNode(producerRecipeData, produceEdge.target);
          const outputProductId = outputNode?.product;
          if (!outputProductId || outputProductId !== inputNode.product) continue;

          const from = instanceId(producerMealId, produceEdge.source);
          const to = instanceId(consumerMealId, consumeEdge.target);
          if (includedIds.has(from) && includedIds.has(to)) edges.push({ from, to });
        }
      }
    }
  }

  // (4) Week-wide prep merge: group the single-raw-ingredient prep nodes by
  // their raw product and collapse each 2+-member group into one merged node,
  // rewiring every member's edges onto it (see file header).
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const membersByProduct = new Map<string, StepInstance[]>();
  for (const [nodeId, info] of mergeableInfo) {
    const group = membersByProduct.get(info.productId) ?? [];
    group.push(nodeById.get(nodeId)!);
    membersByProduct.set(info.productId, group);
  }

  const originalToMerged = new Map<string, string>();
  const mergedNodes: StepInstance[] = [];
  for (const [productId, members] of membersByProduct) {
    if (members.length < 2) continue; // one occurrence — nothing to aggregate
    const mergedId = `merged-prep::${productId}`;
    const { productName } = mergeableInfo.get(members[0].id)!;
    mergedNodes.push({
      id: mergedId,
      plannedMealId: MERGED_PREP_MEAL_ID,
      step: makeMergedPrepStep(mergedId, productName, members),
      recipeName: "Prep day",
      mergedMembers: members.map((m) => ({
        plannedMealId: m.plannedMealId,
        stepId: m.step.id,
      })),
    });
    for (const m of members) originalToMerged.set(m.id, mergedId);
  }

  // Nothing merged — return the per-instance graph unchanged.
  if (originalToMerged.size === 0) return { nodes, edges };

  const remap = (id: string) => originalToMerged.get(id) ?? id;
  const seenEdge = new Set<string>();
  const mergedEdges: WeekGraphEdge[] = [];
  for (const edge of edges) {
    const from = remap(edge.from);
    const to = remap(edge.to);
    if (from === to) continue; // collapsed a within-group edge (shouldn't occur for raw prep)
    const key = `${from} ${to}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    mergedEdges.push({ from, to });
  }

  const mergedGraphNodes = nodes
    .filter((node) => !originalToMerged.has(node.id))
    .concat(mergedNodes);

  return { nodes: mergedGraphNodes, edges: mergedEdges };
}
