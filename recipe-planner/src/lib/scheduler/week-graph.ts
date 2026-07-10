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
 */
import type {
  ExpandedProductNode,
  MealKeyedRecipeData,
  RecipeGraphData,
} from "../aggregation/types";
import { ProductType } from "../types";
import type { StepInstance, WeekGraph, WeekGraphEdge } from "./types";

function instanceId(plannedMealId: string, stepId: string): string {
  return `${plannedMealId}::${stepId}`;
}

function findProductNode(
  recipeData: RecipeGraphData,
  nodeId: string
): ExpandedProductNode | undefined {
  return recipeData.productNodes.find((node) => node.id === nodeId);
}

export function buildWeekGraph(mealData: MealKeyedRecipeData): WeekGraph {
  const nodes: StepInstance[] = [];
  const edges: WeekGraphEdge[] = [];

  // (1) Per-instance step nodes — one per (plannedMealId, step.id) pair.
  // Two planned instances of the same recipe's step always yield two
  // distinct nodes; the underlying `RecipeStep` record may be identical.
  for (const [plannedMealId, recipeData] of mealData) {
    for (const step of recipeData.steps) {
      nodes.push({
        id: instanceId(plannedMealId, step.id),
        plannedMealId,
        step,
        recipeName: recipeData.recipe.name,
      });
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
        edges.push({
          from: instanceId(plannedMealId, producerStepId),
          to: instanceId(plannedMealId, edge.target),
        });
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

          edges.push({
            from: instanceId(producerMealId, produceEdge.source),
            to: instanceId(consumerMealId, consumeEdge.target),
          });
        }
      }
    }
  }

  return { nodes, edges };
}
