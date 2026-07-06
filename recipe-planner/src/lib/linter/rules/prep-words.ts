/**
 * Prep-words rule (DATA-06 rule 2). A `raw` product whose name contains a
 * controlled prep verb, or a "(raw)" suffix, produces a finding — prep
 * vocabulary belongs on steps/transient products, not raw ingredient names
 * (see .claude/skills/recipe-import/SKILL.md naming conventions).
 */
import type { LintFinding, ProductExpanded } from "../index";

const PREP_VERBS = [
  "sliced",
  "diced",
  "minced",
  "chopped",
  "grated",
  "shredded",
];

const RAW_SUFFIX_RE = /\(raw\)\s*$/i;

export function lintPrepWords(products: ProductExpanded[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const product of products) {
    if (product.type !== "raw") continue;
    const lowerName = product.name.toLowerCase();
    const hasPrepVerb = PREP_VERBS.some((verb) => lowerName.includes(verb));
    const hasRawSuffix = RAW_SUFFIX_RE.test(product.name);

    if (hasPrepVerb || hasRawSuffix) {
      findings.push({
        severity: "warning",
        rule: "prep-words",
        message: `${product.name}: raw product name contains a prep verb or "(raw)" suffix`,
        productId: product.id,
      });
    }
  }

  return findings;
}
