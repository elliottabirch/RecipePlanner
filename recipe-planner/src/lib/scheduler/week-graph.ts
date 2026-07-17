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
 *
 * A PARALLEL pull merge (260717-fva) collapses every single-inventory-input,
 * `resource: "none"` pull step across the plan into ONE node per inventory
 * product (`merged-pull::<productId>`) — the same problem, one level up the
 * type lattice: three recipes each pulling the same `garlic cubes (frozen)`
 * show three duplicate cards. This path is disjoint from the raw path
 * (`singleRawInput` only matches `ProductType.Raw`, `singleInventoryInput`
 * only `ProductType.Inventory`) and never reuses `makeMergedPrepStep` — a
 * freezer pull is a `Pull {product}`, never a `Prep {product}`. Candidacy is
 * additionally gated on the product NOT being produced anywhere in-plan
 * (`producedProductIds`), which keeps this pass provably disjoint from pass
 * (3b)'s spurious-in-plan-pull elision below (that pass's gate is the exact
 * inverse: produced in-plan).
 */
import type {
  ExpandedProductNode,
  MealKeyedRecipeData,
  RecipeGraphData,
} from "../aggregation/types";
import { ProductType, StepType, Timing, type RecipeStep } from "../types";
import {
  collectProducedProductIds,
  collectSpuriousPullInstanceIds,
} from "../aggregation/utils/connective";
import { stepResource } from "./resources";
import type { StepInstance, WeekGraph, WeekGraphEdge } from "./types";

/** `plannedMealId` sentinel for a week-wide merged prep node — it belongs to no
 * single planned meal. Cook Mode keys merged behaviour off `mergedMembers`, not
 * this value, so it only needs to be non-colliding with a real meal id. */
const MERGED_PREP_MEAL_ID = "__merged_prep__";

/** `plannedMealId` sentinel for a week-wide merged PULL node — parallel to
 * `MERGED_PREP_MEAL_ID`, same reasoning: it belongs to no single planned
 * meal. */
const MERGED_PULL_MEAL_ID = "__merged_pull__";

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

/**
 * If `stepId`'s ONLY input is a single INVENTORY product node — the signature
 * of a one-ingredient freezer/pantry pull ("Pull garlic cubes") — return that
 * product's id and name; otherwise `null`. Mirrors `singleRawInput` exactly,
 * one type over: `singleRawInput` matches only `ProductType.Raw`, this
 * matches only `ProductType.Inventory`, so the two are disjoint by
 * construction and a step can never be a candidate for both merge paths. Do
 * NOT modify `singleRawInput` — this is a parallel path, not a generalization
 * of it (260717-fva planning_findings #1/#3).
 */
function singleInventoryInput(
  recipeData: RecipeGraphData,
  stepId: string
): { productId: string; productName: string } | null {
  const inputs = recipeData.productToStepEdges.filter((e) => e.target === stepId);
  if (inputs.length !== 1) return null;
  const product = findProductNode(recipeData, inputs[0].source)?.expand?.product;
  if (product?.type !== ProductType.Inventory) return null;
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

/** Synthetic `RecipeStep` for a merged PULL node — deliberately does NOT
 * reuse `makeMergedPrepStep` (which hardcodes `StepType.Prep` and a
 * `Prep {product}` name; reusing it would render a freezer pull as "Prep
 * garlic cubes (frozen)", planning_findings #3). Name is `Pull {productName}`
 * — no per-action breakdown, since pulls carry no cut-action vocabulary.
 * `step_type` mirrors the members' shared type when they agree, defaulting to
 * `StepType.Assembly` (pulls are pass-through connectors) when they don't;
 * `active_minutes` sums the members' (most real pulls are 0-time, but this
 * stays correct for any that aren't); resource is normalized to `"none"` —
 * pulls are always resource-none by the time they reach this path. */
function makeMergedPullStep(
  mergedId: string,
  productName: string,
  members: StepInstance[]
): RecipeStep {
  const stepTypes = new Set(members.map((m) => m.step.step_type));
  const step_type = stepTypes.size === 1 ? members[0].step.step_type : StepType.Assembly;
  return {
    id: mergedId,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "",
    name: `Pull ${productName}`,
    step_type,
    active_minutes: members.reduce((s, m) => s + (m.step.active_minutes ?? 0), 0),
    passive_minutes: 0,
    resource: "none",
    rack_slots: 1,
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
  const pullMergeableInfo = new Map<string, { productId: string; productName: string }>();
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
      if (stepResource(step) === "none") {
        const raw = singleRawInput(recipeData, step.id);
        if (raw) mergeableInfo.set(id, raw);
        const pull = singleInventoryInput(recipeData, step.id);
        if (pull) pullMergeableInfo.set(id, pull);
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

  // (3b) Elide spurious in-plan pull connectors. A zero-time Assembly step
  // whose single input is an `inventory` product that ANOTHER recipe in the
  // plan produces is a "pull from freezer" graph connector, not a real cook-day
  // task (we made it fresh this week). Short-circuit producer -> [pull] ->
  // consumer into producer -> consumer and drop the pull node, so cook mode
  // never surfaces a spurious 0-time "pull out X" card (todo:
  // connective-recipe-batch-then-consume). A pull is single-`inventory`-input,
  // never a single-RAW-input node, so it is never a merge candidate below —
  // this pass and the (4) merge are independent.
  const producedProductIds = collectProducedProductIds(mealData);
  const pullIds = collectSpuriousPullInstanceIds(mealData, producedProductIds);
  const activePullIds = new Set([...pullIds].filter((id) => includedIds.has(id)));
  if (activePullIds.size > 0) {
    // Bridge each pull's non-pull predecessors to its non-pull successors
    // (producer -> downstream), deduped, then drop every pull node + its edges.
    const bridged = new Set<string>();
    for (const pullId of activePullIds) {
      const preds = edges
        .filter((e) => e.to === pullId && !activePullIds.has(e.from))
        .map((e) => e.from);
      const succs = edges
        .filter((e) => e.from === pullId && !activePullIds.has(e.to))
        .map((e) => e.to);
      for (const from of preds) {
        for (const to of succs) {
          if (from !== to) bridged.add(`${from} ${to}`);
        }
      }
    }
    const kept = edges.filter(
      (e) => !activePullIds.has(e.from) && !activePullIds.has(e.to)
    );
    const keptKeys = new Set(kept.map((e) => `${e.from} ${e.to}`));
    const bridgedEdges: WeekGraphEdge[] = [];
    for (const key of bridged) {
      if (keptKeys.has(key)) continue;
      const [from, to] = key.split(" ");
      bridgedEdges.push({ from, to });
    }
    edges.length = 0;
    edges.push(...kept, ...bridgedEdges);
    for (const pullId of activePullIds) {
      includedIds.delete(pullId);
      const idx = nodes.findIndex((node) => node.id === pullId);
      if (idx >= 0) nodes.splice(idx, 1);
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

  // (4b) Week-wide PULL merge (260717-fva): group single-inventory-input pull
  // nodes by their inventory product and collapse each 2+-member group into
  // one merged node, sharing `originalToMerged` with the raw-prep merge above
  // so the remap + edge-dedupe below handles both uniformly. Candidacy is
  // gated on the product NOT being produced in-plan (`producedProductIds`,
  // already computed above for pass 3b) — genuine prior-week stock, never
  // something 3b would have elided — plus a defensive check that the node
  // still exists in `nodeById` (provably disjoint from 3b per the file
  // header, but cheap to guard structurally rather than by luck).
  const pullMembersByProduct = new Map<string, StepInstance[]>();
  for (const [nodeId, info] of pullMergeableInfo) {
    if (producedProductIds.has(info.productId)) continue;
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const group = pullMembersByProduct.get(info.productId) ?? [];
    group.push(node);
    pullMembersByProduct.set(info.productId, group);
  }

  const pullMergedNodes: StepInstance[] = [];
  for (const [productId, members] of pullMembersByProduct) {
    if (members.length < 2) continue; // one occurrence — nothing to aggregate
    const mergedId = `merged-pull::${productId}`;
    const { productName } = pullMergeableInfo.get(members[0].id)!;
    pullMergedNodes.push({
      id: mergedId,
      plannedMealId: MERGED_PULL_MEAL_ID,
      step: makeMergedPullStep(mergedId, productName, members),
      recipeName: "Prep day",
      mergedMembers: members.map((m) => ({
        plannedMealId: m.plannedMealId,
        stepId: m.step.id,
      })),
    });
    for (const m of members) originalToMerged.set(m.id, mergedId);
  }

  // Nothing merged (neither raw prep nor pulls) — return the per-instance
  // graph unchanged.
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
    .concat(mergedNodes, pullMergedNodes);

  return { nodes: mergedGraphNodes, edges: mergedEdges };
}
