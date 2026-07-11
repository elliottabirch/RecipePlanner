/**
 * The evolution write-back remap planner (Plan 06-10, D-10, IMP-06).
 *
 * PURE. Given an approved reviewed draft graph and the ORIGINAL recipe's
 * current node ids, produce the `remapSeed` that makes `buildRecipeGraph`
 * write the reviewed graph back onto the original recipe id while UPDATING
 * unchanged nodes in place — so already-planned weeks (`planned_meals.recipe`)
 * and ingredient-swap overrides (`meal_variant_overrides.original_node`) stay
 * valid with no re-point / override-remap migration.
 *
 * This is the phase's subtlest correctness requirement (RESEARCH Pitfall 2:
 * node-id churn on write-back dangles overrides). The invariant:
 *  - a reviewed node whose `source_node` is still present on the original
 *    → remapSeed[node.ref] = source_node  → buildRecipeGraph `update`s that
 *    ORIGINAL node id in place (override survives).
 *  - a reviewed node with no `source_node` (a node the revision ADDED)
 *    → absent from remapSeed → created fresh.
 *  - an original node id that NO reviewed node maps back to (the revision
 *    removed/replaced it) → reported in `dangling` — the only override-dangling
 *    case D-10 accepts (targeted cleanup, not a general migration).
 *
 * The recipe id is NEVER part of the remap: it is passed separately to
 * `buildRecipeGraph` as `opts.recipeId` (which injects the RECIPE_REMAP_KEY),
 * so the recipe record is updated in place and never re-minted.
 *
 * IMPORT-TIME PURITY (mirrors build-recipe-graph.ts / validate-import.ts):
 * type-only imports, no `../api`, no side effects — so it runs under Vitest's
 * node env without the localStorage-reading pb client.
 */
import type { NormalizedGraph } from "./validate-import";

export interface WriteBackPlan {
  /** ref → original node dbId, for every reviewed node still on the original. */
  remapSeed: Record<string, string>;
  /** Original node ids no reviewed node maps back to (removed/replaced). */
  dangling: string[];
}

/**
 * PURE. Build the write-back remap + dangling list for an approved revision.
 *
 * @param reviewedGraph the approved draft graph, with `sourceNode` set on each
 *   node that corresponds to an original node (new nodes carry none).
 * @param originalNodeIds the ORIGINAL recipe's current node ids
 *   (recipe_product_nodes + recipe_steps). NODE ids only — never the recipe id.
 */
export function planWriteBack(
  reviewedGraph: NormalizedGraph,
  originalNodeIds: string[]
): WriteBackPlan {
  const originalSet = new Set(originalNodeIds);
  const remapSeed: Record<string, string> = {};
  const mappedOriginals = new Set<string>();

  // Every reviewed node whose source_node is still on the original updates that
  // original node id in place. Iterating product nodes then steps mirrors the
  // node-op order buildRecipeGraph/planGraphWrites already use.
  const reviewedNodes: { ref: string; sourceNode?: string }[] = [
    ...reviewedGraph.productNodes,
    ...reviewedGraph.steps,
  ];
  for (const node of reviewedNodes) {
    const src = node.sourceNode;
    if (src && originalSet.has(src)) {
      remapSeed[node.ref] = src;
      mappedOriginals.add(src);
    }
    // else: no source_node, or a stale/foreign one → created fresh (not seeded).
  }

  // Dangling = original node ids nothing maps back to, in input order (stable
  // for the caller's delete-original-nodes cleanup + deterministic tests).
  const dangling = originalNodeIds.filter((id) => !mappedOriginals.has(id));

  return { remapSeed, dangling };
}
