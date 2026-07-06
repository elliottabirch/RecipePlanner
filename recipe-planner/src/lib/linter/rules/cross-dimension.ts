/**
 * Cross-dimension mismatch rule (DATA-06 rule 1). Flags a product whose
 * recipe_product_nodes units, after normalizeUnit, span more than one
 * dimension, or whose units are not convertible to its canonical_unit.
 */
import { normalizeUnit, getDimension, canConvert, type Unit } from "../../units";
import type { LintFinding, ProductExpanded } from "../index";

export function lintCrossDimension(products: ProductExpanded[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const product of products) {
    const nodes = product.nodes ?? [];
    const resolvedUnits: Unit[] = [];
    for (const node of nodes) {
      if (!node.unit) continue;
      const unit = normalizeUnit(node.unit);
      if (unit) resolvedUnits.push(unit);
    }
    if (resolvedUnits.length === 0) continue;

    const dimensions = new Set(resolvedUnits.map(getDimension));
    let mismatch = dimensions.size > 1;

    if (!mismatch && product.canonical_unit) {
      const canonical = product.canonical_unit;
      mismatch = resolvedUnits.some((unit) => !canConvert(unit, canonical));
    }

    if (mismatch) {
      findings.push({
        severity: "error",
        rule: "cross-dimension",
        message: `${product.name}: node units span multiple dimensions or are not convertible to its canonical_unit`,
        productId: product.id,
      });
    }
  }

  return findings;
}
