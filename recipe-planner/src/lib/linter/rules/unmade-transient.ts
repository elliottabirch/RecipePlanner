/**
 * Unmade-transient rule (publish gate, unproduced-non-raw-inputs 260718).
 * RECIPE-SCOPED — unlike `missing-pull-step` (which needs the whole planned
 * week), this rule only inspects one recipe's own graph, so it belongs in the
 * publish gate (`composeRecipeFindings`).
 *
 * A `transient` product is a recipe-internal intermediate (a sauce, a cooked
 * component) that MUST be produced by a step in the same recipe — transients are
 * never shared across recipes (only stored/inventory cross recipes). So a
 * transient node that is CONSUMED (a product→step edge leaves it) but never
 * PRODUCED (no step→product edge lands on it) is an authoring gap: the recipe
 * asks for something it never makes.
 *
 * The gate blocks publish only when the product ALSO has no make/buy escape
 * hatch — no `source_recipe` (make it elsewhere) and no `store_bought_product`
 * (buy it). With neither set the product is unmakeable and unbuyable as
 * authored (the `asian peanut dressing` case), which is exactly what should not
 * ship. If a relation IS set, the author has signalled intent, so it is left to
 * the plan-time week lint / shopping surface rather than blocked here.
 */
import type { LintFinding } from "../index";
import type { Product } from "../../types";
import { ProductType } from "../../types";

export interface RecipeGraphInputs {
  nodes: { id: string; product?: string }[];
  /** product→step edges; `source` is the consumed product-node id. */
  productToStepEdges: { source: string }[];
  /** step→product edges; `target` is the produced product-node id. */
  stepToProductEdges: { target: string }[];
}

export function lintUnmadeTransient(
  graph: RecipeGraphInputs,
  products: Pick<
    Product,
    "id" | "name" | "type" | "source_recipe" | "store_bought_product"
  >[]
): LintFinding[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const consumedNodeIds = new Set(graph.productToStepEdges.map((e) => e.source));
  const producedNodeIds = new Set(graph.stepToProductEdges.map((e) => e.target));

  const findings: LintFinding[] = [];
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.product) continue;
    const product = productById.get(node.product);
    if (!product || product.type !== ProductType.Transient) continue;
    if (!consumedNodeIds.has(node.id)) continue; // not consumed here
    if (producedNodeIds.has(node.id)) continue; // produced in-recipe — fine
    // Escape hatch: a make or buy relation means the author has a plan for it.
    if (product.source_recipe || product.store_bought_product) continue;
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    findings.push({
      severity: "error",
      rule: "unmade-transient",
      message: `${product.name}: consumed but no step makes it, and it has no make (source_recipe) or buy (store_bought_product) source — the recipe can't produce it`,
      productId: product.id,
    });
  }
  return findings;
}
