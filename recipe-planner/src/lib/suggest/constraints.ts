/**
 * Pure constraint math for `/suggest-recipes` (IMP-04, D-07/D-08).
 *
 * These functions turn a candidate recipe's ingredient names + steps into the
 * four numbers the skill prints per candidate in chat:
 *   - registry overlap %   (how much of the recipe reuses existing products)
 *   - active prep minutes   (hands-on time; lower = better)
 *   - batch-prep fit         (is it prep-day friendly?)
 *   - a SOFT macro estimate  (explicitly "estimated", never a hard filter)
 *
 * PURITY: type-only imports + the reused `scoreProduct` matcher — no PocketBase,
 * no React, no side effects — so the whole module runs under Vitest's node env
 * (mirrors src/lib/import/*). The skill (Claude Code) reads the registry and
 * feeds it in; this module never touches the DB itself.
 *
 * MACRO IS SOFT (D-08): `products.protein_g`/`kcal` are 0/null across the entire
 * registry — no macro data has been backfilled. `macroEstimate` therefore
 * returns a figure explicitly flagged `estimated: true` with a note; it must
 * never be presented as a hard filter (threat T-06-11b).
 */

import type { Product, RecipeStep } from "../types";
import { scoreProduct } from "../search/product-search";

/**
 * Default fuse-score gate for "confident match" (D-02, Assumption A5 ≈0.15).
 * `scoreProduct` returns lower = better (0 = exact), so a candidate ingredient
 * counts as "in the registry" when its best match scores at or under this gate.
 * Tunable per call.
 */
export const CONFIDENT_MATCH_GATE = 0.15;

/**
 * Fraction (0..1) of candidate ingredient names that confidently match an
 * existing registry product via {@link scoreProduct} at/under `gate`.
 * Higher = more registry reuse (target ≈0.8+, D-08). Empty candidate list → 0
 * (no ingredients, nothing to reuse — and avoids divide-by-zero).
 */
export function registryOverlap(
  candidateIngredientNames: string[],
  products: Product[],
  gate: number = CONFIDENT_MATCH_GATE
): number {
  if (candidateIngredientNames.length === 0) return 0;
  let matched = 0;
  for (const name of candidateIngredientNames) {
    const results = scoreProduct(name, products);
    if (results.length > 0 && results[0].score <= gate) matched += 1;
  }
  return matched / candidateIngredientNames.length;
}

/**
 * Total hands-on minutes for a recipe: the sum of `active_minutes` across steps.
 * Missing `active_minutes` counts as 0. `passive_minutes` (unattended oven/
 * simmer time) is deliberately NOT included — passive time is acceptable, only
 * active time is the cost we minimize (D-08).
 */
export function activePrepMinutes(
  steps: Pick<RecipeStep, "active_minutes">[]
): number {
  return steps.reduce((sum, s) => sum + (s.active_minutes ?? 0), 0);
}

export interface BatchFitResult {
  /** True when the recipe is batch-prep friendly (see {@link batchFit}). */
  fit: boolean;
  /** Fraction (0..1) of steps timed `batch` vs `just_in_time`. */
  batchStepRatio: number;
}

/**
 * Batch-prep compatibility from `recipe_type` + step `timing` (D-08).
 * `batchStepRatio` is the fraction of steps timed `batch` (0 for no steps).
 * `fit` is true only when the recipe is declared `batch_prep` AND a majority
 * (≥50%) of its steps are batch-timed — i.e. it genuinely belongs on prep day,
 * not a just-in-time meal mislabeled as batch.
 */
export function batchFit(
  recipeType: "meal" | "batch_prep" | undefined,
  steps: Pick<RecipeStep, "timing">[]
): BatchFitResult {
  const total = steps.length;
  const batchCount = steps.filter((s) => s.timing === "batch").length;
  const batchStepRatio = total === 0 ? 0 : batchCount / total;
  const fit = recipeType === "batch_prep" && batchStepRatio >= 0.5;
  return { fit, batchStepRatio };
}

export interface MacroEstimate {
  /** ALWAYS true — this figure is a heuristic, never authoritative (D-08). */
  estimated: true;
  /** Summed `protein_g` across the given products (0 across today's registry). */
  proteinG: number;
  /** Human-facing caveat printed alongside the figure in chat. */
  note: string;
}

/**
 * A SOFT protein estimate for a candidate — sums `protein_g` across its matched
 * products and flags the result `estimated: true` with a caveat. Because
 * `protein_g`/`kcal` are 0 across the entire registry (no backfill yet), the
 * summed figure is 0 today; this exists so the skill can print a protein line
 * that is explicitly non-authoritative rather than silently omitting it or —
 * worse — using it as a hard filter (threat T-06-11b, D-08). When macros are
 * backfilled later (from `fdc_id` via the FDC API) this starts returning real
 * numbers, still flagged estimated until a hard filter is deliberately built.
 */
export function macroEstimate(
  matchedProducts: Pick<Product, "protein_g">[]
): MacroEstimate {
  const proteinG = matchedProducts.reduce(
    (sum, p) => sum + (p.protein_g ?? 0),
    0
  );
  return {
    estimated: true,
    proteinG,
    note:
      "ESTIMATED — soft heuristic, not a hard filter. protein_g/kcal are 0 " +
      "across the product registry (no macro data backfilled yet, D-08), so " +
      "this figure is indicative only. Never gate a candidate on it.",
  };
}
