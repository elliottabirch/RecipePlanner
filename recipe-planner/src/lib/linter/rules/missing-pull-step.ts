/**
 * Missing-pull-step rule (PREP-06 rule a, D-07). WEEK-SCOPED — this rule's
 * input shape intentionally diverges from the Phase-1 per-recipe/per-product
 * rule precedent: it consumes a `WeekGraph` (the scheduler's cross-recipe
 * producer→consumer edges, built by `scheduler/week-graph.ts`) plus a flat
 * list of stored/inventory input consumptions, not a single recipe's step
 * array. An input is satisfied if it is produced in the planned week — checked
 * PER INPUT (`producedInPlan`, computed in the collector): the consumed product
 * node is made in its own recipe, OR (stored/inventory) the product is made in
 * another planned meal. This resolves RESEARCH A6 in favor of week scope (the
 * real cross-recipe chicken-stock case: recipe A consumes the stock recipe B
 * makes) — a producer in a different recipe suppresses the finding.
 *
 * 260718: the check is per-input, NOT per-consumer-step. The earlier "does the
 * consumer step have ANY incoming producer edge" test wrongly cleared a step
 * the moment one of its inputs was produced, masking an unmade input on a
 * multi-input assembly step (`Toss the salad` consumes produced soba/shrimp/
 * veg AND an unmade dressing — the dressing must still be flagged).
 *
 * 260717-fva: a sourceless (no in-plan producer) `Inventory` consumption is
 * exempt — that is a legitimate freezer/pantry pull, prior-week/pantry stock
 * that is never "made" this week by design. A sourceless `Stored` consumption
 * is NOT exempt — a this-week fridge item nothing in the plan produces is a
 * genuine missing make/pull step, the rule's teeth. See
 * `isExemptSourcelessInventory` below.
 *
 * 260718 (unproduced-non-raw-inputs): `Transient` inputs join stored in the
 * collection and stay non-exempt. A transient is a recipe-internal intermediate
 * (a sauce, a cooked component) that MUST be produced by a step; intra-recipe
 * production yields a week-graph edge (week-graph.ts section 2, any type), so a
 * normally-made transient is never sourceless. A sourceless transient is the
 * real hole — a consumed sauce nothing in the plan makes (e.g. `asian peanut
 * dressing`), previously invisible to every guard. A library-wide probe found
 * exactly one such case and zero false positives, because transients don't
 * cross recipes (section 3 cross-recipe edges are stored/inventory only, but
 * transients are never shared that way by design).
 */
import type { LintFinding } from "../index";
import type { MealKeyedRecipeData } from "../../aggregation/types";
import { ProductType, Timing } from "../../types";

/** A single stored/inventory/transient input consumed by an assembly step. */
export interface StoredInputConsumption {
  /** StepInstance.id of the consuming assembly step */
  consumerId: string;
  productId: string;
  productName: string;
  /** `stored`, `inventory`, or `transient` — carried so `lintMissingPullStep`
   * can exempt a sourceless INVENTORY consumption (legit prior-week/pantry
   * stock) while keeping a sourceless STORED or TRANSIENT consumption flagged
   * (260717-fva; transient added 260718). */
  productType: ProductType;
  /**
   * Whether THIS specific input is produced in the planned week — the per-input
   * satisfaction check (260718 fix). True if the consumed product node is made
   * by an in-plan step in its own recipe (intra-recipe, matched by node id) OR,
   * for stored/inventory, the product is made by a step in another planned meal
   * (cross-recipe, matched by product id) — mirroring the two edge-building
   * passes in `week-graph.ts` (sections 2 and 3).
   *
   * This replaces the old "does the consumer STEP have any incoming producer
   * edge" heuristic, which wrongly marked a step satisfied whenever ANY of its
   * inputs was produced — masking an unmade input on a multi-input assembly step
   * (e.g. `Toss the salad` consumes produced soba/shrimp AND an unmade dressing).
   */
  producedInPlan: boolean;
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
  // Producer sets, mirroring week-graph.ts's two producer passes. A JIT
  // (day-of) producer is excluded, exactly as the week graph excludes it — a
  // prep-day consumer can't be fed by a step that runs day-of.
  //   - producedNodeIds: intra-recipe production (step -> node), by node id.
  //   - producedProductByMeal: per-meal set of produced product ids, for the
  //     cross-recipe stored/inventory case (a producer in ANOTHER meal).
  const producedNodeIds = new Set<string>();
  const producedProductByMeal = new Map<string, Set<string>>();
  for (const [mealId, recipeData] of mealData) {
    const jitStepIds = new Set(
      recipeData.steps
        .filter((step) => step.timing === Timing.JustInTime)
        .map((step) => step.id)
    );
    const nodeById = new Map(recipeData.productNodes.map((n) => [n.id, n]));
    const producedProducts = new Set<string>();
    for (const produceEdge of recipeData.stepToProductEdges) {
      if (jitStepIds.has(produceEdge.source)) continue;
      producedNodeIds.add(produceEdge.target);
      const producedProductId = nodeById.get(produceEdge.target)?.product;
      if (producedProductId) producedProducts.add(producedProductId);
    }
    producedProductByMeal.set(mealId, producedProducts);
  }

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
        inputProduct.type !== ProductType.Inventory &&
        inputProduct.type !== ProductType.Transient
      ) {
        continue;
      }
      const consumerId = `${consumerMealId}::${consumeEdge.target}`;
      if (!includedConsumerIds.has(consumerId)) continue;
      const dedupeKey = `${consumerId}::${inputProduct.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const intraProduced = producedNodeIds.has(inputNode.id);
      const crossProduced =
        (inputProduct.type === ProductType.Stored ||
          inputProduct.type === ProductType.Inventory) &&
        [...producedProductByMeal].some(
          ([mealId, products]) =>
            mealId !== consumerMealId && products.has(inputProduct.id)
        );

      consumptions.push({
        consumerId,
        productId: inputProduct.id,
        productName: inputProduct.name,
        productType: inputProduct.type,
        producedInPlan: intraProduced || crossProduced,
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
  consumedStoredInputs: StoredInputConsumption[]
): LintFinding[] {
  return consumedStoredInputs
    .filter((consumption) => !consumption.producedInPlan)
    .filter((consumption) => !isExemptSourcelessInventory(consumption))
    .map((consumption) => ({
      severity: "error" as const,
      rule: "missing-pull-step",
      message:
        consumption.productType === ProductType.Transient
          ? `${consumption.productName}: consumed in the plan but no step makes it — decide whether to make or buy it`
          : `${consumption.productName}: no pull/thaw/make step produces this stored input anywhere in the planned week`,
      productId: consumption.productId,
      nodeId: consumption.consumerId,
    }));
}
