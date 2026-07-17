/**
 * Recipe linter v1 (DATA-06) + v2 (PREP-06). Pure rule functions surfaced
 * two ways — a Lint button + findings panel on Products.tsx, and a headless
 * scripts/lint.js — both calling these same aggregators so rule logic is
 * never duplicated (D-03).
 *
 * All imports from "../types" here are type-only (`import type`), so this
 * module never pulls the `ProductType`/`StepType`/etc. runtime enums into
 * the bundle it produces — required so `scripts/lint.js` can attempt a
 * direct `node` type-stripped run without hitting TS enum runtime syntax
 * unsupported by Node's strip-only mode (see Task 2 SUMMARY for the actual
 * result of that attempt).
 *
 * Linter v2 (PREP-06) adds a step-scoped aggregator (`runStepLint`, per-step
 * rules only — missing-durations, missing-prep-action) and a SEPARATE
 * week-scoped entry point (`runWeekLint`) for `missing-pull-step`, since that
 * rule's input (a `WeekGraph` + cross-recipe stored-input consumptions, D-07)
 * diverges from the per-recipe/per-step shape every other rule uses. Both
 * run on-demand only — publish-gate wiring is Phase 6.
 */
import type { Product, Store, Section, ContainerType, RecipeStep } from "../types";
import type { WeekGraph } from "../scheduler/types";
import { lintCrossDimension } from "./rules/cross-dimension";
import { lintMixedDenomination } from "./rules/mixed-denomination";
import { lintPrepWords } from "./rules/prep-words";
import { lintMissingStoreSection } from "./rules/missing-store-section";
import { lintMissingCanonicalUnit } from "./rules/missing-canonical-unit";
import { lintMissingDurations } from "./rules/missing-durations";
import { lintMissingPrepAction } from "./rules/missing-prep-action";
import {
  lintMissingPullStep,
  type StoredInputConsumption,
} from "./rules/missing-pull-step";

export { collectStoredInputConsumptions } from "./rules/missing-pull-step";

export interface LintFinding {
  severity: "error" | "warning";
  rule: string;
  message: string;
  recipeId?: string;
  productId?: string;
  nodeId?: string;
}

/**
 * A single recipe_product_nodes reference to this product. `quantity` is
 * needed by the mixed-denomination rule, which reads the *spread* of counts
 * across a product's nodes rather than any single unit.
 */
export interface LinterProductNode {
  id?: string;
  unit?: string;
  quantity?: number;
}

/**
 * Input shape for the linter. Mirrors Products.tsx's local ProductExpanded
 * (store/section/container_type expand) plus an optional `nodes` array of
 * this product's recipe_product_nodes unit values, needed by the
 * cross-dimension rule. Defined here (not in ../types) per plan direction
 * to avoid editing types.ts in this plan.
 */
export interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
  };
  nodes?: LinterProductNode[];
}

export function runLint(products: ProductExpanded[]): LintFinding[] {
  return [
    ...lintCrossDimension(products),
    // Only meaningful when `products` carries registry-wide nodes (the
    // Products.tsx Lint button), since the two denominations it compares
    // usually live in different recipes. Recipe-scoped callers pass one
    // recipe's nodes and it finds nothing — same as cross-dimension.
    ...lintMixedDenomination(products),
    ...lintPrepWords(products),
    ...lintMissingStoreSection(products),
    ...lintMissingCanonicalUnit(products),
  ];
}

/** Step-scoped linter v2 aggregator (PREP-06 rules b/c) — per-step rules only. */
export function runStepLint(steps: RecipeStep[]): LintFinding[] {
  return [...lintMissingDurations(steps), ...lintMissingPrepAction(steps)];
}

/**
 * Week-scoped linter v2 entry point (PREP-06 rule a, D-07). Deliberately
 * separate from `runStepLint`/`runLint` — `missing-pull-step` needs the
 * whole planned week's cross-recipe producer→consumer edges, not a flat
 * per-recipe/per-step array.
 */
export function runWeekLint(
  weekGraph: WeekGraph,
  consumedStoredInputs: StoredInputConsumption[]
): LintFinding[] {
  return [...lintMissingPullStep(weekGraph, consumedStoredInputs)];
}
