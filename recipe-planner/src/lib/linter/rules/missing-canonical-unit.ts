/**
 * Missing canonical_unit rule (DATA-06 rule 4, D-08 surface). A non-pantry
 * product with a null canonical_unit is a finding — genuinely ambiguous
 * products are left null by the backfill script rather than guessed, and
 * this rule is their on-demand surface.
 */
import type { LintFinding, ProductExpanded } from "../index";

export function lintMissingCanonicalUnit(
  products: ProductExpanded[]
): LintFinding[] {
  return products
    .filter((p) => !p.pantry && !p.canonical_unit)
    .map((p) => ({
      severity: "warning" as const,
      rule: "missing-canonical-unit",
      message: `${p.name}: missing canonical_unit`,
      productId: p.id,
    }));
}
