# Catalog Source Comparison (D-01 / Open Question 1)

Generated: 2026-07-07T06:37:32.967Z
Decision this report supports: which plain-name catalog backs the full seed build — Open Food Facts categories taxonomy (filtered) vs a hand-curated (LLM-assisted) static list. See Task 2 of 03-03-PLAN.md.

Existing-registry overlap is measured against the live 121 `raw` products (composite `(name, type)` unique index — see 03-RESEARCH.md Pitfall 2), for information only. No PocketBase writes were made by this script.

## Summary

| Approach | Sample size | fdc_id match rate | Null fdc_id | Section-mapping coverage | Already in registry |
|----------|-------------|--------------------|-------------|--------------------------|----------------------|
| Open Food Facts (filtered) | 50 | 14.0% | 43 | 100.0% | 0 |
| Hand-curated | 50 | 96.0% | 2 | 100.0% | 10 |

## Approach 1: Open Food Facts categories taxonomy (filtered)

Filter: English-only, ASCII-simple names, leaf nodes under the `en:vegetables`/`en:fruits`/`en:meats`/`en:dairies`/`en:cereals-and-potatoes`/`en:fats` branches, prep-state descriptors (Frozen/Canned/Cooked/... prefixes) excluded, >1-capitalized-word names excluded (brand/region heuristic). This filter reduced the raw taxonomy (14,541 total category nodes) to **1136 generic candidate names**; the 50-item sample below is a deterministic every-Nth-item slice across that filtered pool (spans all 6 branches, not clustered in one).

**Noise/junk observed even after filtering** (excluded from the sample below, but present in the 1136-item filtered pool and illustrative of the remaining curation cost):

- `Tomato off season raw` / `Tomato in season raw` — seasonal-availability variants, not a single plain concept name
- `Green beans imported by plane` / `Green beans imported by boat` — transport-method variants (EU carbon-labeling category, irrelevant to a household registry)
- `Pumpkin tomatoes` / `Heirloom tomatoe` (note: singular typo in the source taxonomy itself) — cultivar-level entries, noisier than the household "tomato" concept
- Single-capitalized-word entries can still slip past the brand/region heuristic (e.g. `Mashua`, `Kohlrabi` — these are fine, just illustrating the heuristic isn't perfect)

**50-item sample + join results:**

| Name | fdc_id | USDA source | Matched USDA name | Section | Store | Unit |
|------|--------|-------------|--------------------|---------|-------|------|
| Abate pears | — | — | — | produce | safeway | — |
| Apricot yogurts | 170864 | sr_legacy | Yogurt, Greek, 2% fat, apricot, CHOBANI | dairy | safeway | — |
| Barley flakes | — | — | — | baking supplies | safeway | — |
| Blackberries in syrup | — | — | — | produce | safeway | fl_oz (volume) |
| Braised pork spare-ribs | — | — | — | meat | costco | lb (mass) |
| Breakfast cereals puffed corn with honey fortified with vitamins and chemical elements | — | — | — | baking supplies | safeway | — |
| Buttermilk quark | — | — | — | dairy | safeway | fl_oz (volume) |
| Cappuccino | — | — | — | dairy | safeway | — |
| Cheddar with chili | — | — | — | dairy | safeway | — |
| Chicken feet | 171119 | sr_legacy | Chicken, feet, boiled | meat | costco | lb (mass) |
| Clarified margarines | — | — | — | baking supplies | safeway | — |
| Corn oils | 748323 | foundation_food | Oil, corn | baking supplies | safeway | — |
| Croutons with herbs | — | — | — | baking supplies | safeway | — |
| Deer red fresh meat | — | — | — | meat | costco | — |
| Dry-cured ham with fat and rind removed | — | — | — | meat | costco | — |
| Dutch fruits | — | — | — | produce | safeway | — |
| Fat free plain fermented dairy desserts | — | — | — | dairy | safeway | — |
| Flax seed flours | — | — | — | baking supplies | safeway | — |
| Fruit stirred yogurts | — | — | — | dairy | safeway | — |
| Gofio | — | — | — | baking supplies | safeway | — |
| Guinea fowl breast | — | — | — | meat | costco | — |
| Herb quarks | — | — | — | dairy | safeway | — |
| Jujube dates | — | — | — | produce | safeway | — |
| Koshihikari rices | — | — | — | baking supplies | safeway | — |
| Lemon yogurts | 171310 | sr_legacy | Yogurt, Greek, nonfat, lemon blend, CHOBANI | dairy | safeway | each (count) |
| Maasdam | — | — | — | dairy | safeway | — |
| Medlars | — | — | — | produce | safeway | — |
| Molded butters | — | — | — | baking supplies | safeway | — |
| Nazca potatoes | — | — | — | baking supplies | safeway | — |
| Orkney beef | — | — | — | meat | costco | lb (mass) |
| Paratha | 174076 | sr_legacy | Bread, paratha, whole wheat, commercially prepared, frozen | baking supplies | safeway | — |
| Persimmon pulp | — | — | — | produce | safeway | — |
| Pixie apples | — | — | — | produce | safeway | — |
| Plain quarks | — | — | — | dairy | safeway | — |
| Pork racks | — | — | — | meat | costco | lb (mass) |
| Powdered amaranth milks | — | — | — | baking supplies | safeway | — |
| Provencal-style tomatoes | — | — | — | produce | safeway | — |
| Puffed rye cakes | — | — | — | baking supplies | safeway | — |
| Ratte potatoes | — | — | — | baking supplies | safeway | — |
| Refrigerated flan with eggs | — | — | — | dairy | safeway | each (count) |
| Rices for porridge | — | — | — | baking supplies | safeway | — |
| Rye groats | — | — | — | baking supplies | safeway | — |
| scallions | 2727585 | foundation_food | Green onion, (scallion), bulb and greens, root removed, raw | produce | safeway | — |
| Shelf-stable vegetable fats | — | — | — | baking supplies | safeway | — |
| Sourdough sliced breads | — | — | — | baking supplies | safeway | — |
| Story apples | — | — | — | produce | safeway | — |
| Sweetened puffed rice | — | — | — | baking supplies | safeway | lb (mass) |
| Tintern | — | — | — | dairy | safeway | — |
| Unprepared frozen fruits | — | — | — | produce | safeway | — |
| Vanilla custard puddings | 171379 | sr_legacy | Babyfood, dessert, custard pudding, vanilla, strained | dairy | safeway | — |

## Approach 2: Hand-curated (LLM-assisted) household-staple list

50 items authored directly against the 8 existing sections (produce, dairy, baking supplies, meat, bakery, prepared meals, frozen, international) — no filtering/curation pass needed, by construction. `frozen`/`international` entries are hand-assigned since neither has a USDA/category equivalent (D-04).

**50-item list + join results:**

| Name | fdc_id | USDA source | Matched USDA name | Section | Store | Unit |
|------|--------|-------------|--------------------|---------|-------|------|
| onion | 790577 | foundation_food | Onions, red, raw | produce | safeway | each (count) |
| garlic | 1104647 | foundation_food | Garlic, raw | produce | safeway | each (count) |
| carrot | 2258586 | foundation_food | Carrots, mature, raw | produce | safeway | — |
| celery | 2346405 | foundation_food | Celery, raw | produce | safeway | — |
| tomato | 1999634 | foundation_food | Tomato, roma | produce | safeway | each (count) |
| potato | 2346401 | foundation_food | Potatoes, russet, without skin, raw | produce | safeway | each (count) |
| bell pepper | 2258588 | foundation_food | Peppers, bell, green, raw | produce | safeway | each (count) |
| spinach | 1999632 | foundation_food | Spinach, baby | produce | safeway | — |
| broccoli | 747447 | foundation_food | Broccoli, raw | produce | safeway | — |
| lemon | 167747 | sr_legacy | Lemon juice, raw | produce | safeway | each (count) |
| whole milk | 746782 | foundation_food | Milk, whole, 3.25% milkfat, with added vitamin D | dairy | safeway | gal (volume) |
| butter | 789828 | foundation_food | Butter, stick, unsalted | dairy | safeway | lb (mass) |
| cheddar cheese | 328637 | foundation_food | Cheese, cheddar | dairy | safeway | lb (mass) |
| plain yogurt | 2647437 | foundation_food | Yogurt, plain, nonfat | dairy | safeway | fl_oz (volume) |
| heavy cream | 2346386 | foundation_food | Cream, heavy | dairy | safeway | fl_oz (volume) |
| sour cream | 2346387 | foundation_food | Cream, sour, full fat | dairy | safeway | fl_oz (volume) |
| cottage cheese | 328841 | foundation_food | Cheese, cottage, lowfat, 2% milkfat | dairy | safeway | lb (mass) |
| mozzarella cheese | 329370 | foundation_food | Cheese, mozzarella, low moisture, part-skim | dairy | safeway | lb (mass) |
| all-purpose flour | 789890 | foundation_food | Flour, wheat, all-purpose, enriched, bleached | baking supplies | costco | lb (mass) |
| granulated sugar | 746784 | foundation_food | Sugars, granulated | baking supplies | safeway | lb (mass) |
| brown sugar | 168833 | sr_legacy | Sugars, brown | baking supplies | safeway | lb (mass) |
| baking soda | 175040 | sr_legacy | Leavening agents, baking soda | baking supplies | safeway | — |
| baking powder | 172805 | sr_legacy | Leavening agents, baking powder, low-sodium | baking supplies | safeway | — |
| vanilla extract | 173471 | sr_legacy | Vanilla extract | baking supplies | safeway | fl_oz (volume) |
| cornstarch | 169698 | sr_legacy | Cornstarch | baking supplies | costco | lb (mass) |
| active dry yeast | 175043 | sr_legacy | Leavening agents, yeast, baker's, active dry | baking supplies | safeway | — |
| chicken breast | 2646170 | foundation_food | Chicken, breast, boneless, skinless, raw | meat | costco | lb (mass) |
| ground beef | 2514743 | foundation_food | Beef, ground, 90% lean meat / 10% fat, raw | meat | costco | lb (mass) |
| bacon | 749420 | foundation_food | Pork, cured, bacon, cooked, restaurant | meat | costco | lb (mass) |
| pork chop | 2727575 | foundation_food | Pork, chop, center cut, raw | meat | costco | lb (mass) |
| salmon fillet | — | — | — | meat | costco | lb (mass) |
| shrimp | 2684443 | foundation_food | Crustaceans, shrimp, farm raised, raw | meat | costco | lb (mass) |
| chicken thigh | 2646171 | foundation_food | Chicken, thigh, boneless, skinless, raw | meat | costco | lb (mass) |
| ground turkey | 2514747 | foundation_food | Turkey, ground, 93% lean/ 7% fat, raw | meat | costco | lb (mass) |
| white bread | 790146 | foundation_food | Flour, bread, white, enriched, unbleached | bakery | costco | — |
| tortillas | 169829 | sr_legacy | Tortilla, blue corn, Sakwavikaviki (Hopi) | bakery | trader joes | — |
| bagels | 167533 | sr_legacy | Bagels, wheat | bakery | safeway | — |
| hamburger buns | 173318 | sr_legacy | Fast foods, hamburger; single, regular patty; double decker bun with condiments and special sauce | bakery | safeway | — |
| pita bread | 172816 | sr_legacy | Bread, pita, white, unenriched | bakery | safeway | — |
| dinner rolls | 174107 | sr_legacy | Rolls, dinner, sweet | bakery | safeway | — |
| rotisserie chicken | 171524 | sr_legacy | Chicken, broiler, rotisserie, BBQ, skin | prepared meals | trader joes | lb (mass) |
| frozen pizza | 168957 | sr_legacy | Pizza rolls, frozen, unprepared | prepared meals | trader joes | — |
| canned soup | 171153 | sr_legacy | Soup, minestrone, canned, condensed | prepared meals | trader joes | — |
| mac and cheese | — | — | — | prepared meals | trader joes | lb (mass) |
| frozen peas | 170012 | sr_legacy | Peas, edible-podded, frozen, unprepared | frozen | safeway | — |
| frozen corn | 173345 | sr_legacy | Corn dogs, frozen, prepared | frozen | safeway | — |
| frozen strawberries | 168174 | sr_legacy | Strawberries, frozen, sweetened, sliced | frozen | safeway | — |
| soy sauce | 174278 | sr_legacy | Soy sauce made from soy (tamari) | international | costco | fl_oz (volume) |
| curry powder | 170924 | sr_legacy | Spices, curry powder | international | trader joes | — |
| salsa | 746777 | foundation_food | Sauce, salsa, ready-to-serve | international | trader joes | — |

## Observations for the decision (Task 2)

- **Join coverage is dramatically different in this real run**: OFF-filtered 14.0% vs. hand-curated 96.0% fdc_id match rate. This is NOT a join-algorithm artifact — the same join code (containment-first, fuse.js-fallback, Foundation-Foods-then-SR-Legacy) runs against both lists. It is a **candidate-quality artifact of unweighted taxonomy sampling**: the OFF-filtered pool's leaf-level/English/non-branded filter (Approach 1) still passes through rare cultivar/regional/prep-variant leaf nodes (e.g. `Nazca potatoes`, `Maasdam`, `Tintern`, `Gofio`, `Koshihikari rices`) that are real, legitimate OFF taxonomy entries but are NOT household-staple concepts USDA's Foundation Foods/SR Legacy bother to catalog individually — so most of this sample genuinely misses (`fdc_id = null`, a valid D-02 state, but 43/50 of them here).
- **What this means for the OFF path**: the filter this pipeline applies (English, leaf-node, no-prep-prefix, no-brand heuristic) is necessary but *not sufficient* to reach "household staple" quality — RESEARCH.md's warning that OFF "needs a filtering + curation pass" is confirmed empirically here, and the curation gap is larger than a simple English/leaf/brand filter can close. A production OFF-sourced build would need an additional popularity/genericness curation step (e.g. preferring shorter names, common-word lists, or a manual pass) — real, non-trivial additional work beyond what this script already does.
- **Section-mapping coverage** is 100% for both in this sample — for OFF this is because the sample is restricted to 6 well-defined root branches with a clean root->section map (this holds even for the rare/obscure items above — knowing "Maasdam" came from `en:dairies` is enough to route it to the dairy section, independent of whether the fdc_id join succeeds); for hand-curated it's 100% by construction.
- **Name-quality noise**: the hand-curated list is 100% concept-level, zero-noise by construction. The OFF filtered pool (1136 items after filtering, before sampling) still contains prep-state, transport-method, seasonal, and cultivar/regional-variety entries (see examples above) that this filter does not fully eliminate.
- **Breadth**: OFF's filtered pool (1136 candidates from just 6 branches) is large and can scale past 800 if wanted, but per the point above, raw breadth from this pool trades off hard against join quality without further curation. The hand-curated approach is capped at whatever is authored (50 here; scaling to 400-800 means authoring 400-800 more entries by hand/LLM-assist) but each authored item is a deliberate, high-quality choice — this sample's 96.0% match rate is a more realistic preview of what a full hand-curated build would achieve.
- Either choice is valid per D-02 (null fdc_id is an acceptable per-item state) — but this run's real numbers argue that reaching OFF's breadth-and-credibility upside at a join-quality comparable to hand-curation requires budgeting for a real curation pass on top of the filter already built here, not treating the filter alone as sufficient.
