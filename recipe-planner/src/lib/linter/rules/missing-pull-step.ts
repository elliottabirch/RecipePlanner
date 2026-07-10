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
 * makes) — a producer in a different recipe suppresses the finding. Only
 * flag when NO producer edge exists anywhere in the planned week.
 */
import type { LintFinding } from "../index";
import type { WeekGraph } from "../../scheduler/types";

/** A single stored/inventory input consumed by an assembly step instance. */
export interface StoredInputConsumption {
  /** StepInstance.id of the consuming assembly step */
  consumerId: string;
  productId: string;
  productName: string;
}

export function lintMissingPullStep(
  weekGraph: WeekGraph,
  consumedStoredInputs: StoredInputConsumption[]
): LintFinding[] {
  const consumerIdsWithProducer = new Set(weekGraph.edges.map((edge) => edge.to));

  return consumedStoredInputs
    .filter((consumption) => !consumerIdsWithProducer.has(consumption.consumerId))
    .map((consumption) => ({
      severity: "error",
      rule: "missing-pull-step",
      message: `${consumption.productName}: no pull/thaw/make step produces this stored input anywhere in the planned week`,
      nodeId: consumption.consumerId,
    }));
}
