/**
 * Missing store/section rule (DATA-06 rule 3, D-04). A product you BUY (raw /
 * inventory, non-pantry) with no store is a finding; a product whose store is
 * in SECTION_REQUIRED_STORES with no section is a finding. Costco/Trader
 * Joes/online products need only a store, not a section.
 *
 * MADE products carry no store: `transient` intermediates AND `stored` recipe
 * outputs are produced, never purchased (confirmed by the registry — every
 * stored batch-prep output has an empty store). Requiring a store for them
 * would make the publish gate reject essentially every recipe. Only raw (and
 * inventory) products are shopped for, so only they need a store. (#06-07 UAT.)
 */
import type { LintFinding, ProductExpanded } from "../index";

export const SECTION_REQUIRED_STORES = new Set(["safeway"]);

export function lintMissingStoreSection(
  products: ProductExpanded[]
): LintFinding[] {
  return products
    .filter(
      (p) => p.type !== "transient" && p.type !== "stored" && !p.pantry
    )
    .flatMap((p) => {
      const findings: LintFinding[] = [];
      if (!p.expand?.store) {
        findings.push({
          severity: "error",
          rule: "missing-store-section",
          message: `${p.name}: missing store`,
          productId: p.id,
        });
        return findings;
      }
      const storeName = p.expand.store.name.toLowerCase();
      if (SECTION_REQUIRED_STORES.has(storeName) && !p.expand?.section) {
        findings.push({
          severity: "error",
          rule: "missing-store-section",
          message: `${p.name}: ${storeName} requires a section`,
          productId: p.id,
        });
      }
      return findings;
    });
}
