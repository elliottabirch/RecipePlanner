/**
 * Pure downstream-convergence derivation for cook mode's Now/Next card
 * (container-convergence-indicator todo, 2026-07-12). Answers, for one step:
 * *which other ingredients does this converge with, and into what container?*
 * — so the cook prepping a cucumber can see it ends up tossed with the soba,
 * shrimp, edamame, dressing and green onion in the one salad container.
 *
 * There is deliberately NO new "container instance" data model (see the todo):
 * the signal is already in the recipe graph. The ingredients that share a
 * container are exactly the ones that flow into the same downstream assembly
 * step, whose output is the single stored product that carries the container.
 * The walk:
 *
 *   this step
 *     → stepToProductEdges   → its output product node(s)
 *     → productToStepEdges   → the downstream assembly step(s) A
 *     → A's OTHER inputs      = the co-ingredients you'll combine with
 *     → A's output product    = the shared destination (container_type or,
 *                               when unset, the stored product's own name)
 *
 * Operates on a single `RecipeGraphData` (the consuming/producing walk is
 * intra-recipe — a shared container is one recipe's assembly). React-free and
 * PocketBase-free so it is unit-testable in isolation (see convergence.test.ts)
 * and callable from CookMode without hook plumbing.
 *
 * Scope (v1): ordinary per-recipe nodes only. Week-wide merged-prep nodes
 * (`StepInstance.mergedMembers`) span several recipes with per-recipe
 * destinations — the caller passes no `recipeData` for those, so they get no
 * line. Per-recipe convergence on merged nodes is a deferred follow-up.
 */
import type {
  ExpandedProductNode,
  RecipeGraphData,
} from "../aggregation/types";
import { ProductType } from "../types";

export interface ConvergenceResult {
  /** Base-ingredient names of the OTHER inputs at the convergence step, in
   * first-seen order, deduped. Non-empty whenever this result is returned. */
  combinesWith: string[];
  /** Human label for the shared destination: the `container_type` name when
   * set, else the stored/output product's own name. Undefined when no
   * downstream container/stored product is resolvable. */
  destination?: string;
}

/** How far to chase a transient output downstream before giving up on finding
 * a container/stored destination — guards against a cyclic or pathologically
 * deep graph. Real recipes converge in 1–2 hops. */
const MAX_DESTINATION_HOPS = 6;

function findNode(
  recipeData: RecipeGraphData,
  nodeId: string
): ExpandedProductNode | undefined {
  return recipeData.productNodes.find((n) => n.id === nodeId);
}

/** Output product-node ids of a step (stepToProductEdges: step -> node). */
function outputNodeIds(recipeData: RecipeGraphData, stepId: string): string[] {
  return recipeData.stepToProductEdges
    .filter((e) => e.source === stepId)
    .map((e) => e.target);
}

/** Input product-node ids of a step (productToStepEdges: node -> step). */
function inputNodeIds(recipeData: RecipeGraphData, stepId: string): string[] {
  return recipeData.productToStepEdges
    .filter((e) => e.target === stepId)
    .map((e) => e.source);
}

/** Step ids that consume a product node (productToStepEdges: node -> step). */
function consumingStepIds(recipeData: RecipeGraphData, nodeId: string): string[] {
  return recipeData.productToStepEdges
    .filter((e) => e.source === nodeId)
    .map((e) => e.target);
}

/** Step id that produces a product node, if any (stepToProductEdges). */
function producingStepId(
  recipeData: RecipeGraphData,
  nodeId: string
): string | undefined {
  return recipeData.stepToProductEdges.find((e) => e.target === nodeId)?.source;
}

/**
 * The name to show for a co-input node. A transient/stored intermediate reads
 * awkwardly by its own name ("green onion sliced", "soba noodles cooked"), so
 * when it is produced by a single-raw/inventory-input step we surface that base
 * ingredient instead ("green onion", "soba noodles"). Multi-input intermediates
 * (a made dressing) keep their own name — there is no single base ingredient.
 */
function coInputLabel(recipeData: RecipeGraphData, nodeId: string): string | null {
  const node = findNode(recipeData, nodeId);
  const product = node?.expand?.product;
  if (!product) return null;

  if (product.type === ProductType.Raw || product.type === ProductType.Inventory) {
    return product.name;
  }

  // Transient/stored intermediate — resolve to its base ingredient when its
  // producer has exactly one raw/inventory input.
  const producer = producingStepId(recipeData, nodeId);
  if (producer) {
    const producerInputs = inputNodeIds(recipeData, producer);
    if (producerInputs.length === 1) {
      const baseProduct = findNode(recipeData, producerInputs[0])?.expand?.product;
      if (
        baseProduct &&
        (baseProduct.type === ProductType.Raw ||
          baseProduct.type === ProductType.Inventory)
      ) {
        return baseProduct.name;
      }
    }
  }
  return product.name;
}

/**
 * The shared destination reachable from a convergence step: the first
 * `container_type` name found walking its outputs downstream, else the first
 * stored output product's own name. Bounded by `MAX_DESTINATION_HOPS`.
 */
function resolveDestination(
  recipeData: RecipeGraphData,
  stepId: string
): string | undefined {
  const seen = new Set<string>();
  let frontier = outputNodeIds(recipeData, stepId);
  let storedFallback: string | undefined;

  for (let hop = 0; hop < MAX_DESTINATION_HOPS && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      if (seen.has(nodeId)) continue;
      seen.add(nodeId);
      const node = findNode(recipeData, nodeId);
      const product = node?.expand?.product;
      if (!product) continue;

      const containerName = product.expand?.container_type?.name;
      if (containerName) return containerName; // best signal — a real container

      if (product.type === ProductType.Stored && !storedFallback) {
        storedFallback = product.name; // keep looking for a container, but remember
      }
      // Chase transients further downstream toward their eventual container.
      for (const consumer of consumingStepIds(recipeData, nodeId)) {
        next.push(...outputNodeIds(recipeData, consumer));
      }
    }
    frontier = next;
  }
  return storedFallback;
}

export function deriveConvergence(
  stepId: string,
  recipeData: RecipeGraphData
): ConvergenceResult | null {
  const ownOutputs = new Set(outputNodeIds(recipeData, stepId));
  if (ownOutputs.size === 0) return null;

  const combinesWith: string[] = [];
  const seenLabels = new Set<string>();
  let destination: string | undefined;

  // Every step that consumes one of this step's outputs is a convergence
  // candidate; its OTHER inputs are the co-ingredients.
  const convergenceSteps = new Set<string>();
  for (const outId of ownOutputs) {
    for (const consumer of consumingStepIds(recipeData, outId)) {
      convergenceSteps.add(consumer);
    }
  }

  for (const consumer of convergenceSteps) {
    const otherInputs = inputNodeIds(recipeData, consumer).filter(
      (id) => !ownOutputs.has(id)
    );
    if (otherInputs.length === 0) continue; // pass-through, nothing to combine with

    for (const inId of otherInputs) {
      const label = coInputLabel(recipeData, inId);
      if (label && !seenLabels.has(label)) {
        seenLabels.add(label);
        combinesWith.push(label);
      }
    }
    if (!destination) destination = resolveDestination(recipeData, consumer);
  }

  if (combinesWith.length === 0) return null;
  return { combinesWith, destination };
}
