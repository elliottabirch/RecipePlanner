/**
 * Recipe linter v1 (DATA-06). Four pure rule functions surfaced two ways —
 * a Lint button + findings panel on Products.tsx, and a headless
 * scripts/lint.js — both calling this same `runLint` aggregator so rule
 * logic is never duplicated (D-03).
 *
 * All imports from "../types" here are type-only (`import type`), so this
 * module never pulls the `ProductType`/`StepType`/etc. runtime enums into
 * the bundle it produces — required so `scripts/lint.js` can attempt a
 * direct `node` type-stripped run without hitting TS enum runtime syntax
 * unsupported by Node's strip-only mode (see Task 2 SUMMARY for the actual
 * result of that attempt).
 */
import type { Product, Store, Section, ContainerType } from "../types";
import { lintCrossDimension } from "./rules/cross-dimension";
import { lintPrepWords } from "./rules/prep-words";
import { lintMissingStoreSection } from "./rules/missing-store-section";
import { lintMissingCanonicalUnit } from "./rules/missing-canonical-unit";

export interface LintFinding {
  severity: "error" | "warning";
  rule: string;
  message: string;
  recipeId?: string;
  productId?: string;
  nodeId?: string;
}

/** A single recipe_product_nodes reference to this product, unit only. */
export interface LinterProductNode {
  id?: string;
  unit?: string;
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
    ...lintPrepWords(products),
    ...lintMissingStoreSection(products),
    ...lintMissingCanonicalUnit(products),
  ];
}
