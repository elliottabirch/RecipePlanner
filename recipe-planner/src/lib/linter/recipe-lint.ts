/**
 * Publish-gate rule engine (D-06, IMP-07). Composes the existing per-step and
 * per-product linter aggregators into a single recipe-scoped pass used by the
 * RecipeEditor "Publish" button (Plan 06). Status flips to `published` only on
 * an empty findings result.
 *
 * DELIBERATELY excludes `runWeekLint` / the `missing-pull-step` rule: that rule
 * needs a whole planned `WeekGraph` + cross-recipe stored-input consumptions
 * (D-07, index.ts:87-92), which do not exist for a single unplanned recipe
 * (Pitfall 4, threat T-06-03b). Letting it participate would either crash or
 * emit a spurious block, so composition is step + product only.
 */
import type { RecipeStep, RecipeProductNode, Product } from "../types";
import {
  runStepLint,
  runLint,
  type LintFinding,
  type ProductExpanded,
  type LinterProductNode,
} from "./index";

/**
 * Pure, unit-testable core of the publish gate. Returns exactly
 * `runStepLint(steps) ++ runLint(products)` — step-rule and product-rule
 * findings only, never a week/pull-step finding for any input.
 */
export function composeRecipeFindings(
  steps: RecipeStep[],
  products: ProductExpanded[]
): LintFinding[] {
  return [...runStepLint(steps), ...runLint(products)];
}

/**
 * Runs the publish gate against live records for one recipe: reads its steps
 * and its referenced products (enriched to `ProductExpanded` the way
 * Products.tsx:151-166 does, so the cross-dimension rule sees each product's
 * node units), then composes the step + product findings. Excludes the week
 * rule (see module doc).
 */
export async function runRecipeLint(recipeId: string): Promise<LintFinding[]> {
  // Lazy import so the pure `composeRecipeFindings` core stays importable in a
  // node/vitest env — a top-level `../api` import pulls in the PocketBase
  // client which reads `localStorage` at module load (db-config.ts), absent
  // outside the browser.
  const { getAll, collections } = await import("../api");
  const recipeFilter = `recipe = "${recipeId}"`;

  const steps = await getAll<RecipeStep>(collections.recipeSteps, {
    filter: recipeFilter,
  });

  // The cross-dimension rule needs each product's recipe_product_nodes unit
  // values. Fetch this recipe's nodes, group units by product id, and collect
  // the set of referenced product ids.
  const nodes = await getAll<RecipeProductNode>(collections.recipeProductNodes, {
    filter: recipeFilter,
  });
  const nodesByProduct = new Map<string, LinterProductNode[]>();
  const productIds = new Set<string>();
  for (const node of nodes) {
    if (!node.product) continue;
    productIds.add(node.product);
    const list = nodesByProduct.get(node.product) ?? [];
    list.push({ id: node.id, unit: node.unit });
    nodesByProduct.set(node.product, list);
  }

  // Fetch the referenced products with store/section/container_type expand
  // (mirrors Products.tsx's ProductExpanded shape; RESEARCH Open Q3).
  const products =
    productIds.size === 0
      ? []
      : await getAll<Product>(collections.products, {
          filter: [...productIds].map((id) => `id = "${id}"`).join(" || "),
          expand: "store,section,container_type",
        });

  const enriched: ProductExpanded[] = products.map((product) => ({
    ...product,
    nodes: nodesByProduct.get(product.id) ?? [],
  }));

  return composeRecipeFindings(steps, enriched);
}
