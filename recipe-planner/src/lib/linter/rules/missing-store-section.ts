/**
 * Missing store/section rule (DATA-06 rule 3, D-04). A product you BUY (raw,
 * non-pantry) with no store is a finding; a product whose store is in
 * SECTION_REQUIRED_STORES with no section is a finding. Costco/Trader
 * Joes/online products need only a store, not a section.
 *
 * NON-purchased types carry no store and are exempt:
 * - `transient` intermediates AND `stored` recipe outputs are produced, never
 *   purchased (#06-07 UAT).
 * - `inventory` items (frozen garlic cubes, stocks, etc.) are stocked/made
 *   components pulled into recipes, not per-shop purchases — the registry bears
 *   this out (37 of 44 inventory products have no store). Requiring one would
 *   make the publish gate reject any recipe pulling from inventory. (post-06
 *   UAT — mirrors the stored/transient exemption.)
 *
 * So only `raw` non-pantry products are shopped for and need a store.
 */
import type { LintFinding, ProductExpanded } from "../index";

export const SECTION_REQUIRED_STORES = new Set(["safeway"]);

export function lintMissingStoreSection(
  products: ProductExpanded[]
): LintFinding[] {
  return products
    .filter(
      (p) =>
        p.type !== "transient" &&
        p.type !== "stored" &&
        p.type !== "inventory" &&
        !p.pantry
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
