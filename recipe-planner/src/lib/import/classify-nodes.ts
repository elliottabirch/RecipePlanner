import type { NormalizedGraph } from "./validate-import";

export type NodeRole = "raw" | "transient" | "stored";

/**
 * Classify each product node by its position in the recipe graph so the import
 * resolver knows whether an unmatched product is something you BUY vs something
 * the recipe MAKES. Only RAW products are purchased and therefore need a
 * store/section (the shopping list + `missing-store-section` linter rule use
 * them); made products (transient intermediates and stored outputs) have no
 * store/section — asking for one is meaningless.
 *
 * - `raw`:       a leaf input — never produced by a step in this recipe.
 * - `transient`: produced by a step AND consumed by a later step (intermediate).
 * - `stored`:    produced by a step and not consumed further (terminal output).
 *
 * Edge direction is authoritative: a product is "made" iff it is the `to` of a
 * step→product edge. (`validateImportJson` guarantees edges are coherent
 * product↔step, so `from`/`to` kinds are unambiguous here.)
 */
export function classifyImportNodes(
  graph: NormalizedGraph
): Record<string, NodeRole> {
  const stepRefs = new Set(graph.steps.map((s) => s.ref));
  const producedByStep = new Set<string>(); // product ref is the `to` of a step→product edge
  const consumedByStep = new Set<string>(); // product ref is the `from` of a product→step edge
  for (const e of graph.edges) {
    if (stepRefs.has(e.from)) producedByStep.add(e.to);
    if (stepRefs.has(e.to)) consumedByStep.add(e.from);
  }

  const roles: Record<string, NodeRole> = {};
  for (const pn of graph.productNodes) {
    if (!producedByStep.has(pn.ref)) {
      roles[pn.ref] = "raw";
    } else {
      roles[pn.ref] = consumedByStep.has(pn.ref) ? "transient" : "stored";
    }
  }
  return roles;
}
