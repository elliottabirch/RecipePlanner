/**
 * SR-Legacy `foodCategory` → one of the 8 existing product-registry
 * sections, for Search-USDA prefill (D-06, REG-03).
 *
 * Returns the section NAME (e.g. "dairy", "produce"), not a live PocketBase
 * record id — section ids are environment data (they differ between the
 * prod/test PocketBase instances), so the caller (Plan 06's Search-USDA tab)
 * resolves this name against the live `sections` collection to get the
 * actual relation id to prefill.
 *
 * Reuses the exact same keyword rules already established and validated in
 * `scripts/build-usda-seed.js`'s SECTION_KEYWORD_RULES (Plan 03) — one
 * category→section mapping, not a second divergent one. `frozen` and
 * `international` have no USDA/category equivalent (D-04) and are
 * intentionally absent — they always resolve to `undefined`, left for
 * first-use correction like every other unmapped category.
 */
const SECTION_KEYWORD_RULES: { test: RegExp; section: string }[] = [
  { test: /vegetable|fruit/i, section: "produce" },
  { test: /dairy|egg/i, section: "dairy" },
  {
    test: /poultry|beef|pork|lamb|veal|game|sausage|luncheon|finfish|shellfish/i,
    section: "meat",
  },
  { test: /baked products/i, section: "bakery" },
  {
    test: /soup|sauce|grav|meals?, entrees?|fast foods?/i,
    section: "prepared meals",
  },
  {
    test: /cereal|grain|pasta|legume|nut|seed products|spice|herb|fats and oils|sweets/i,
    section: "baking supplies",
  },
];

/**
 * Maps an SR-Legacy `foodCategory` string to one of the 8 existing section
 * names, or `undefined` if unmapped (first-use-corrected, per D-04).
 */
export function sectionIdForCategory(foodCategory: string): string | undefined {
  if (!foodCategory) return undefined;
  for (const rule of SECTION_KEYWORD_RULES) {
    if (rule.test.test(foodCategory)) return rule.section;
  }
  return undefined;
}
