/**
 * Missing-pull-step rule (PREP-06 rule a, D-07). WEEK-SCOPED — this rule's
 * input shape intentionally diverges from the Phase-1 per-recipe/per-product
 * rule precedent: it consumes a `WeekGraph` (the scheduler's cross-recipe
 * producer→consumer edges, built by `scheduler/week-graph.ts`) plus a flat
 * list of stored/inventory input consumptions, not a single recipe's step
 * array. A stored/inventory input is satisfied if ANY recipe in the planned
 * week produces it — i.e. some edge in the week graph lands on the consuming
 * step instance. This resolves RESEARCH A6 in favor of week scope (the real
 * cross-recipe chicken-stock case: recipe A consumes the stock recipe B
 * makes) — a producer in a different recipe suppresses the finding.
 *
 * 260717-fva: a sourceless (no in-plan producer) `Inventory` consumption is
 * exempt — that is a legitimate freezer/pantry pull, prior-week/pantry stock
 * that is never "made" this week by design. A sourceless `Stored` consumption
 * is NOT exempt — a this-week fridge item nothing in the plan produces is a
 * genuine missing make/pull step, the rule's teeth. See
 * `isExemptSourcelessInventory` below.
 */
import type { LintFinding } from "../index";
import type { WeekGraph } from "../../scheduler/types";
import type { MealKeyedRecipeData } from "../../aggregation/types";
import { ProductType } from "../../types";

/** A single stored/inventory input consumed by an assembly step instance. */
export interface StoredInputConsumption {
  /** StepInstance.id of the consuming assembly step */
  consumerId: string;
  productId: string;
  productName: string;
  /** `stored` or `inventory` — carried so `lintMissingPullStep` can exempt a
   * sourceless INVENTORY consumption (legit prior-week/pantry stock) while
   * keeping a sourceless STORED consumption flagged (260717-fva). */
  productType: ProductType;
}

/**
 * Derive the `consumedStoredInputs` list `lintMissingPullStep`/`runWeekLint`
 * expect, straight from the same `MealKeyedRecipeData` the week-graph is built
 * from. Mirrors `week-graph.ts` section (3)'s consumer side: every input
 * product node of type `stored`/`inventory` consumed by a step is a stored
 * input that needs a producer somewhere in the planned week.
 *
 * `includedConsumerIds` is the week-graph's own node-id set — passing it drops
 * consumers that the builder excluded (day-of `just_in_time` steps), so the
 * linter never flags a stored input for a step that isn't in the prep-day
 * schedule at all. The `${mealId}::${stepId}` key matches the builder's
 * `instanceId`; a stored-input consumer is never a mergeable single-raw prep
 * node, so its id is always present un-remapped in the graph's nodes.
 */
export function collectStoredInputConsumptions(
  mealData: MealKeyedRecipeData,
  includedConsumerIds: ReadonlySet<string>
): StoredInputConsumption[] {
  const seen = new Set<string>();
  const consumptions: StoredInputConsumption[] = [];
  for (const [consumerMealId, recipeData] of mealData) {
    for (const consumeEdge of recipeData.productToStepEdges) {
      const inputNode = recipeData.productNodes.find(
        (node) => node.id === consumeEdge.source
      );
      const inputProduct = inputNode?.expand?.product;
      if (!inputProduct) continue;
      if (
        inputProduct.type !== ProductType.Stored &&
        inputProduct.type !== ProductType.Inventory
      ) {
        continue;
      }
      const consumerId = `${consumerMealId}::${consumeEdge.target}`;
      if (!includedConsumerIds.has(consumerId)) continue;
      const dedupeKey = `${consumerId}::${inputProduct.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      consumptions.push({
        consumerId,
        productId: inputProduct.id,
        productName: inputProduct.name,
        productType: inputProduct.type,
      });
    }
  }
  return consumptions;
}

/**
 * A sourceless (no in-plan producer) `Inventory` consumption is a legitimate
 * freezer/pantry pull, not a miss: inventory is prior-week/pantry stock by
 * design — you do not "make" it each week — so it having zero incoming
 * producer edges is the EXPECTED shape, not a gap (260717-fva
 * planning_findings #8). A sourceless `Stored` consumption stays flagged: a
 * this-week fridge item (chicken stock, cooked pasta) that nothing in the
 * plan produces IS a genuine missing make/pull step — the rule's teeth. This
 * is a type check, never a name check or a step-type check.
 */
function isExemptSourcelessInventory(consumption: StoredInputConsumption): boolean {
  return consumption.productType === ProductType.Inventory;
}

export function lintMissingPullStep(
  weekGraph: WeekGraph,
  consumedStoredInputs: StoredInputConsumption[]
): LintFinding[] {
  const consumerIdsWithProducer = new Set(weekGraph.edges.map((edge) => edge.to));

  return consumedStoredInputs
    .filter((consumption) => !consumerIdsWithProducer.has(consumption.consumerId))
    .filter((consumption) => !isExemptSourcelessInventory(consumption))
    .map((consumption) => ({
      severity: "error",
      rule: "missing-pull-step",
      message: `${consumption.productName}: no pull/thaw/make step produces this stored input anywhere in the planned week`,
      nodeId: consumption.consumerId,
    }));
}
