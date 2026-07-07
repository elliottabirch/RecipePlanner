// Offline seed-build pipeline (Phase 3, D-01/D-02/D-03/D-04, REG-01).
//
// Reusable pieces built here:
//   (a) normalizeName / tokenize        — plain-name normalization
//   (b) joinToFdc                        — name -> fdc_id fuzzy join
//                                          (Foundation Foods first, SR Legacy
//                                          fallback, null on genuine miss)
//   (c) mapCategoryToSection             — category -> one of the 8 sections
//                                          (frozen/international always null
//                                          per D-04 — no source equivalent)
//   (d) mapToStore                       — category/keyword -> one of the
//                                          4 real stores
//   (e) mapToUnit                        — keyword -> canonical_unit/dimension
//
// This script performs NO PocketBase writes. It only reads (to resolve live
// section/store names and to check overlap against the existing 121 `raw`
// products for informational purposes) and emits report files under
// scripts/seed-output/. The actual insert/backfill is Plan 04's job
// (scripts/seed-usda.js).
//
// Task 1 also runs the pipeline over a 50-item sample under BOTH candidate
// catalog approaches (Open Food Facts categories taxonomy, filtered, vs a
// hand-curated household-staple list) and writes
// scripts/seed-output/catalog-comparison.md — the decision artifact for
// Task 2's D-01/Open-Question-1 checkpoint.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";
import Fuse from "fuse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this same script be pointed at test (:8091) instead of prod
// (:8090). Default stays prod — this script only performs READS against it
// (existing raw-product overlap check, live section/store name resolution).
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";
const pb = new PocketBase(PB_URL);

const DATA_DIR = path.join(__dirname, "data");
const OUTPUT_DIR = path.join(__dirname, "seed-output");

const FOUNDATION_JSON_PATH = path.join(
  DATA_DIR,
  "foundation_extract",
  "FoodData_Central_foundation_food_json_2026-04-30.json"
);
const SR_LEGACY_DIR = path.join(
  DATA_DIR,
  "sr_legacy_extract",
  "FoodData_Central_sr_legacy_food_csv_2018-04"
);

// ---------------------------------------------------------------------------
// (a) Name normalization
// ---------------------------------------------------------------------------

/** Lowercase, trim, collapse whitespace — plain concept-level name form. */
function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Naive English singularizer — good enough for FDC's plural produce/meat
 *  naming ("Onions" -> "onion", "Tomatoes" -> "tomato", "Berries" -> "berry").
 *  Left alone for words <= 3 chars to avoid mangling short tokens. */
function singularize(word) {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ses|xes|ches|shes|oes)$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Tokenize into normalized, singularized words >= 2 chars (drops stray
 *  single-char tokens like the "s" left behind by a possessive apostrophe). */
function tokenize(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(singularize);
}

/** Tokens of the FDC description's head segment (text before the first
 *  comma) — FDC/SR-Legacy descriptions are conventionally
 *  "HeadNoun, modifier, modifier, ..., raw", so the head segment is the
 *  strongest signal of "what food is this actually about" vs. a modifier
 *  that merely mentions the query word in passing (e.g. "Flour, potato"
 *  vs. "Potatoes, russet, without skin, raw" both contain token "potato",
 *  but only the second is actually a potato). */
function headTokens(name) {
  return tokenize(name.split(",")[0]);
}

// ---------------------------------------------------------------------------
// USDA bulk data loaders
// ---------------------------------------------------------------------------

/** Minimal quoted-CSV line parser — handles embedded commas and doubled
 *  escaped quotes ("") per RFC 4180, which is all the SR Legacy CSVs use. */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Foundation Foods bulk JSON -> flat {fdc_id, name, category} array.
 *  ~32 of 395 array entries are `null` in the 2026-04-30 export (a known
 *  quirk of this dataset) — filtered out. */
function loadFoundationFoods() {
  const raw = JSON.parse(fs.readFileSync(FOUNDATION_JSON_PATH, "utf-8"));
  return raw.FoundationFoods.filter(Boolean).map((f) => ({
    fdc_id: f.fdcId,
    name: f.description,
    category: f.foodCategory?.description || "",
  }));
}

/** SR Legacy bulk CSV (food.csv + food_category.csv joined on
 *  food_category_id) -> flat {fdc_id, name, category} array. */
function loadSrLegacy() {
  const catLines = fs
    .readFileSync(path.join(SR_LEGACY_DIR, "food_category.csv"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);
  const catMap = new Map();
  for (let i = 1; i < catLines.length; i++) {
    const row = parseCsvLine(catLines[i]);
    catMap.set(row[0], row[2]);
  }

  const foodLines = fs
    .readFileSync(path.join(SR_LEGACY_DIR, "food.csv"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);
  const entries = [];
  for (let i = 1; i < foodLines.length; i++) {
    const row = parseCsvLine(foodLines[i]);
    entries.push({
      fdc_id: Number(row[0]),
      name: row[2],
      category: catMap.get(row[3]) || "",
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// (b) name -> fdc_id join
// ---------------------------------------------------------------------------

/** Same conservative fuse.js config used elsewhere this phase
 *  (src/lib/search/product-search.ts): sorted-token synthetic key +
 *  ignoreLocation. Threshold is tighter here (0.2, matching the RESEARCH.md
 *  Pattern 3 "tight threshold for review-worthy" join posture) since this is
 *  a join decision, not an interactive search-ranking decision. */
const FUSE_JOIN_OPTIONS = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "_sortedTokens", weight: 0.4 },
  ],
  threshold: 0.2,
  ignoreLocation: true,
  includeScore: true,
};

function toSortedTokens(name) {
  return tokenize(name).sort().join(" ");
}

function buildFuseIndex(entries) {
  const indexed = entries.map((e) => ({
    ...e,
    _sortedTokens: toSortedTokens(e.name),
  }));
  return new Fuse(indexed, FUSE_JOIN_OPTIONS);
}

/** Primary join tier: every query token must appear (post-singularize) among
 *  the target's tokens. Among all entries satisfying that containment, prefer
 *  (1) entries whose head segment overlaps a query token (real head-noun
 *  match, not just a modifier mentioning the word), (2) fewest "extra"
 *  tokens beyond the query (closest to the base concept), (3) a "raw"
 *  preparation state when tied. Deterministic, explainable — the typo
 *  tolerance itself is fuse.js's job (tier 2, below), not this tier's. */
function containmentJoin(candidateName, entries) {
  const qTokens = tokenize(candidateName);
  const contained = entries
    .map((e) => ({ e, tTokens: tokenize(e.name) }))
    .filter(({ tTokens }) => qTokens.every((qt) => tTokens.includes(qt)));

  if (contained.length === 0) return null;

  contained.sort((a, b) => {
    const aHead = headTokens(a.e.name).some((t) => qTokens.includes(t)) ? 0 : 1;
    const bHead = headTokens(b.e.name).some((t) => qTokens.includes(t)) ? 0 : 1;
    if (aHead !== bHead) return aHead - bHead;

    const extraA = a.tTokens.length - qTokens.length;
    const extraB = b.tTokens.length - qTokens.length;
    if (extraA !== extraB) return extraA - extraB;

    const aRaw = /\braw\b/i.test(a.e.name) ? 0 : 1;
    const bRaw = /\braw\b/i.test(b.e.name) ? 0 : 1;
    return aRaw - bRaw;
  });

  return contained[0].e;
}

/**
 * name -> fdc_id join. Foundation Foods first (higher rigor, D-02/Pitfall 4),
 * SR Legacy fallback, `fdc_id = null` on a genuine miss (D-02 — a valid
 * per-item state). Records which source matched via `usda_data_type`.
 *
 * Tier 1/2: deterministic token-containment (primary — see containmentJoin).
 * Tier 3/4: fuse.js conservative fuzzy fallback (score < 0.2) — catches
 * near-misses containment's exact-token-containment requirement would drop
 * (e.g. minor spelling variants), reusing the same fuse.js module as the
 * rest of this phase per the plan's "Don't Hand-Roll" guidance.
 */
function joinToFdc(candidateName, foundation, foundationFuse, srLegacy, srFuse) {
  let match = containmentJoin(candidateName, foundation);
  if (match) {
    return {
      fdc_id: match.fdc_id,
      usda_data_type: "foundation_food",
      usda_category: match.category,
      matched_name: match.name,
      match_tier: "containment",
    };
  }

  match = containmentJoin(candidateName, srLegacy);
  if (match) {
    return {
      fdc_id: match.fdc_id,
      usda_data_type: "sr_legacy",
      usda_category: match.category,
      matched_name: match.name,
      match_tier: "containment",
    };
  }

  const fFuzzy = foundationFuse
    .search(candidateName)
    .find((r) => r.score !== undefined && r.score < 0.2);
  if (fFuzzy) {
    return {
      fdc_id: fFuzzy.item.fdc_id,
      usda_data_type: "foundation_food",
      usda_category: fFuzzy.item.category,
      matched_name: fFuzzy.item.name,
      match_tier: "fuzzy",
    };
  }

  const sFuzzy = srFuse
    .search(candidateName)
    .find((r) => r.score !== undefined && r.score < 0.2);
  if (sFuzzy) {
    return {
      fdc_id: sFuzzy.item.fdc_id,
      usda_data_type: "sr_legacy",
      usda_category: sFuzzy.item.category,
      matched_name: sFuzzy.item.name,
      match_tier: "fuzzy",
    };
  }

  // Genuine miss — D-02 explicitly allows null fdc_id as a valid state.
  return {
    fdc_id: null,
    usda_data_type: "",
    usda_category: null,
    matched_name: null,
    match_tier: "none",
  };
}

// ---------------------------------------------------------------------------
// (c) category -> section map (8 existing sections; live-verified 2026-07-07)
// ---------------------------------------------------------------------------

// `frozen` and `international` have NO USDA/OFF-category equivalent (D-04) —
// they are intentionally absent from this map and always resolve to null,
// left for first-use correction, same as every other unmapped category.
const SECTION_KEYWORD_RULES = [
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

/** category (FDC's food_category description, or an OFF root-branch label)
 *  -> one of the 8 existing sections, or null if unmapped. */
function mapCategoryToSection(category) {
  if (!category) return null;
  for (const rule of SECTION_KEYWORD_RULES) {
    if (rule.test.test(category)) return rule.section;
  }
  return null;
}

// OFF top-level branch -> section (used only for the OFF-derived candidate
// list, since we know each candidate's originating branch before any FDC
// join happens — this is the "own taxonomy" category, distinct from the FDC
// join's category).
const OFF_ROOT_TO_SECTION = {
  "en:vegetables": "produce",
  "en:fruits": "produce",
  "en:meats": "meat",
  "en:dairies": "dairy",
  "en:cereals-and-potatoes": "baking supplies",
  "en:fats": "baking supplies",
};

// ---------------------------------------------------------------------------
// (d) category/keyword -> store map (all 4 real stores, per Pitfall 3)
// ---------------------------------------------------------------------------

/** Routes across all 4 real stores (safeway, costco, trader joes, online) —
 *  not just the phase doc's stale 2-store guess (Pitfall 3). Bulk-friendly
 *  categories -> costco; prepared/ethnic/specialty -> trader joes; anything
 *  with no clean section fit -> online (Pitfall 3's explicit recommendation
 *  for no-fit items); everything else -> safeway (default everyday grocery). */
function mapToStore(category, section, normalizedName) {
  const cat = (category || "").toLowerCase();

  if (section === "meat" || /cereal|grain|nut|legume/.test(cat)) {
    return "costco";
  }
  if (
    section === "prepared meals" ||
    /ethnic|hispanic|asian|international/.test(cat) ||
    /soy sauce|curry|salsa|tortilla|taco/.test(normalizedName)
  ) {
    return "trader joes";
  }
  if (!section) {
    return "online";
  }
  return "safeway";
}

// ---------------------------------------------------------------------------
// (e) keyword -> canonical_unit/dimension map (small map; else null, D-04)
// ---------------------------------------------------------------------------

const UNIT_KEYWORD_RULES = [
  { test: /\bmilk\b/, unit: "gal", dimension: "volume" },
  { test: /\b(cream|yogurt|buttermilk)\b/, unit: "fl_oz", dimension: "volume" },
  {
    test: /\b(oil|vinegar|soy sauce|syrup|extract|juice)\b/,
    unit: "fl_oz",
    dimension: "volume",
  },
  {
    test: /\b(flour|sugar|rice|cornstarch|salt)\b/,
    unit: "lb",
    dimension: "mass",
  },
  { test: /\bbutter\b/, unit: "lb", dimension: "mass" },
  { test: /\bcheese\b/, unit: "lb", dimension: "mass" },
  {
    test: /\b(bacon|beef|pork|turkey|chicken|shrimp|salmon)\b/,
    unit: "lb",
    dimension: "mass",
  },
  { test: /\begg/, unit: "each", dimension: "count" },
  {
    test: /\b(onion|garlic|potato|lemon|apple|banana|tomato|pepper)\b/,
    unit: "each",
    dimension: "count",
  },
];

function mapToUnit(normalizedName) {
  for (const rule of UNIT_KEYWORD_RULES) {
    if (rule.test.test(normalizedName)) {
      return { canonical_unit: rule.unit, dimension: rule.dimension };
    }
  }
  return { canonical_unit: null, dimension: null };
}

// ---------------------------------------------------------------------------
// Candidate list A: Open Food Facts categories taxonomy, filtered
// ---------------------------------------------------------------------------

const OFF_TAXONOMY_PATH = path.join(DATA_DIR, "off-categories.json");

// Prep-state / preparation-descriptor prefixes — OFF's taxonomy mixes
// concept-level names ("Tomatoes") with prep-state variants ("Frozen sliced
// zucchini"). These aren't wrong, but they aren't the plain concept-level
// name bar this phase wants (D-01) — excluded from the filtered candidate
// pool. This exclusion is itself one of the "OFF needs a filtering pass"
// costs the comparison report surfaces.
const OFF_PREP_PREFIXES =
  /^(Frozen|Canned|Cooked|Boiled|Peeled|Fresh|Prepared|Dried|Dehydrated|Pickled|Smoked|Roasted|Grilled|Fried|Baked|Steamed|Raw|Whole|Sliced|Chopped|Diced|Minced|Grated|Shredded|Crushed|Pureed|Mashed|Miniature|Organic|Mini)\b/i;

function collectDescendants(taxonomy, rootKey) {
  const seen = new Set();
  const stack = [rootKey];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const node = taxonomy[k];
    if (!node) continue;
    for (const c of node.children || []) stack.push(c);
  }
  seen.delete(rootKey);
  return seen;
}

/**
 * Filters the OFF categories taxonomy down to English, leaf-level, generic
 * (non-branded/non-regional) candidate names under the vegetables/fruits/
 * meats/dairies/cereals-and-potatoes/fats branches (per RESEARCH.md Open
 * Question 1), then takes a deterministic 50-item stratified sample (every
 * Nth item of the alphabetically-sorted filtered pool, spanning the full
 * pool rather than clustering in one branch).
 */
function loadOffCategoriesFiltered(sampleSize = 50) {
  const taxonomy = JSON.parse(fs.readFileSync(OFF_TAXONOMY_PATH, "utf-8"));
  const roots = Object.keys(OFF_ROOT_TO_SECTION);

  const perRootCandidates = [];
  for (const root of roots) {
    const descendants = collectDescendants(taxonomy, root);
    for (const key of descendants) {
      const node = taxonomy[key];
      if (!node) continue;
      const isLeaf = !node.children || node.children.length === 0;
      if (!isLeaf) continue;
      const name = node.name && node.name.en;
      if (!name) continue;
      if (!/^[a-zA-Z\s\-']+$/.test(name)) continue; // English-only, no digits/diacritics
      if (OFF_PREP_PREFIXES.test(name)) continue; // strip prep-state descriptors
      const words = name.split(/\s+/);
      const capWords = words.filter((w) => /^[A-Z]/.test(w));
      if (capWords.length > 1) continue; // >1 capitalized word => likely brand/region (e.g. "Vale of Evesham Asparagus")
      perRootCandidates.push({ name, root });
    }
  }

  perRootCandidates.sort((a, b) => a.name.localeCompare(b.name));
  const totalFiltered = perRootCandidates.length;

  const step = Math.max(1, Math.floor(totalFiltered / sampleSize));
  const sample = [];
  for (let i = 0; i < totalFiltered && sample.length < sampleSize; i += step) {
    sample.push(perRootCandidates[i]);
  }

  return { sample, totalFiltered };
}

// ---------------------------------------------------------------------------
// Candidate list B: hand-curated (LLM-assisted) household-staple list
// ---------------------------------------------------------------------------

// Organized directly into the 8 existing sections — this is exactly the
// "pro" the hand-curated option offers (zero section-mapping ambiguity, per
// RESEARCH.md/03-03-PLAN.md option comparison). 50 items total.
const HAND_CURATED_50 = [
  // produce (10)
  { name: "onion", section: "produce" },
  { name: "garlic", section: "produce" },
  { name: "carrot", section: "produce" },
  { name: "celery", section: "produce" },
  { name: "tomato", section: "produce" },
  { name: "potato", section: "produce" },
  { name: "bell pepper", section: "produce" },
  { name: "spinach", section: "produce" },
  { name: "broccoli", section: "produce" },
  { name: "lemon", section: "produce" },
  // dairy (8)
  { name: "whole milk", section: "dairy" },
  { name: "butter", section: "dairy" },
  { name: "cheddar cheese", section: "dairy" },
  { name: "plain yogurt", section: "dairy" },
  { name: "heavy cream", section: "dairy" },
  { name: "sour cream", section: "dairy" },
  { name: "cottage cheese", section: "dairy" },
  { name: "mozzarella cheese", section: "dairy" },
  // baking supplies (8)
  { name: "all-purpose flour", section: "baking supplies" },
  { name: "granulated sugar", section: "baking supplies" },
  { name: "brown sugar", section: "baking supplies" },
  { name: "baking soda", section: "baking supplies" },
  { name: "baking powder", section: "baking supplies" },
  { name: "vanilla extract", section: "baking supplies" },
  { name: "cornstarch", section: "baking supplies" },
  { name: "active dry yeast", section: "baking supplies" },
  // meat (8)
  { name: "chicken breast", section: "meat" },
  { name: "ground beef", section: "meat" },
  { name: "bacon", section: "meat" },
  { name: "pork chop", section: "meat" },
  { name: "salmon fillet", section: "meat" },
  { name: "shrimp", section: "meat" },
  { name: "chicken thigh", section: "meat" },
  { name: "ground turkey", section: "meat" },
  // bakery (6)
  { name: "white bread", section: "bakery" },
  { name: "tortillas", section: "bakery" },
  { name: "bagels", section: "bakery" },
  { name: "hamburger buns", section: "bakery" },
  { name: "pita bread", section: "bakery" },
  { name: "dinner rolls", section: "bakery" },
  // prepared meals (4)
  { name: "rotisserie chicken", section: "prepared meals" },
  { name: "frozen pizza", section: "prepared meals" },
  { name: "canned soup", section: "prepared meals" },
  { name: "mac and cheese", section: "prepared meals" },
  // frozen (3) — D-04: no USDA/category equivalent, section assigned by hand
  { name: "frozen peas", section: "frozen" },
  { name: "frozen corn", section: "frozen" },
  { name: "frozen strawberries", section: "frozen" },
  // international (3) — D-04: no USDA/category equivalent, section assigned by hand
  { name: "soy sauce", section: "international" },
  { name: "curry powder", section: "international" },
  { name: "salsa", section: "international" },
];

// ---------------------------------------------------------------------------
// Full ~500-item hand-curated household-staple catalog (Plan 04, D-01/03-03
// LOCKED decision). Authored (LLM-assisted) directly into the 8 existing
// sections, per 03-03-SUMMARY.md's target breadth. `frozen`/`international`
// entries are hand-assigned since neither has a USDA/category equivalent
// (D-04). Internal exact-name duplicates (if any slipped in during authoring)
// are dropped at build time by `dedupeByNormalizedName` — see Full Seed
// Build below — so a stray repeat here is a safety-netted non-issue, not a
// silent bug.
// ---------------------------------------------------------------------------

const HAND_CURATED_FULL = [
  // produce (114)
  ...[
    "onion", "red onion", "white onion", "yellow onion", "sweet onion",
    "shallot", "garlic", "ginger", "scallion", "leek", "carrot", "celery",
    "celery root", "tomato", "cherry tomato", "roma tomato", "grape tomato",
    "potato", "russet potato", "red potato", "yukon gold potato",
    "sweet potato", "yam", "bell pepper", "red bell pepper",
    "green bell pepper", "yellow bell pepper", "jalapeno pepper",
    "serrano pepper", "poblano pepper", "habanero pepper", "spinach", "kale",
    "romaine lettuce", "iceberg lettuce", "butter lettuce", "arugula",
    "swiss chard", "collard greens", "broccoli", "broccolini", "cauliflower",
    "brussels sprouts", "cabbage", "red cabbage", "napa cabbage", "bok choy",
    "asparagus", "green beans", "snap peas", "snow peas", "zucchini",
    "yellow squash", "butternut squash", "acorn squash", "spaghetti squash",
    "cucumber", "eggplant", "corn on the cob", "mushroom", "cremini mushroom",
    "portobello mushroom", "shiitake mushroom", "radish", "beet", "turnip",
    "parsnip", "fennel", "artichoke", "avocado", "lemon", "lime", "orange",
    "grapefruit", "apple", "banana", "pear", "peach", "plum", "nectarine",
    "apricot", "grape", "strawberry", "blueberry", "raspberry", "blackberry",
    "watermelon", "cantaloupe", "honeydew melon", "pineapple", "mango",
    "kiwi", "papaya", "pomegranate", "cherry", "fig", "date", "cranberry",
    "cilantro", "parsley", "basil", "mint", "rosemary", "thyme", "sage",
    "dill", "chives", "oregano", "tarragon", "bay leaf", "green onion",
    "jicama", "okra", "rutabaga",
  ].map((name) => ({ name, section: "produce" })),

  // dairy (54)
  ...[
    "whole milk", "2% milk", "1% milk", "skim milk", "half and half",
    "heavy cream", "whipping cream", "buttermilk", "butter", "unsalted butter",
    "salted butter", "margarine", "cheddar cheese", "sharp cheddar cheese",
    "mild cheddar cheese", "mozzarella cheese", "shredded mozzarella cheese",
    "parmesan cheese", "grated parmesan cheese", "swiss cheese",
    "provolone cheese", "feta cheese", "goat cheese", "cream cheese",
    "cottage cheese", "ricotta cheese", "blue cheese", "gruyere cheese",
    "monterey jack cheese", "pepper jack cheese", "string cheese",
    "plain yogurt", "greek yogurt", "vanilla yogurt", "strawberry yogurt",
    "sour cream", "whipped cream", "coffee creamer", "egg", "egg white",
    "egg substitute", "almond milk", "oat milk", "soy milk", "coconut milk",
    "lactose free milk", "kefir", "mascarpone cheese", "queso fresco",
    "shredded cheddar cheese", "sliced american cheese", "evaporated milk",
    "condensed milk", "ghee",
  ].map((name) => ({ name, section: "dairy" })),

  // baking supplies (96)
  ...[
    "all-purpose flour", "whole wheat flour", "bread flour", "cake flour",
    "self-rising flour", "almond flour", "cornmeal", "cornstarch",
    "granulated sugar", "brown sugar", "light brown sugar", "dark brown sugar",
    "powdered sugar", "confectioners sugar", "honey", "maple syrup",
    "corn syrup", "molasses", "agave nectar", "baking soda", "baking powder",
    "active dry yeast", "instant yeast", "vanilla extract", "almond extract",
    "cocoa powder", "unsweetened cocoa powder", "chocolate chips",
    "semi-sweet chocolate chips", "dark chocolate chips",
    "white chocolate chips", "baking chocolate", "sprinkles", "food coloring",
    "gelatin", "cream of tartar", "salt", "kosher salt", "sea salt",
    "black pepper", "ground black pepper", "white rice", "brown rice",
    "jasmine rice", "basmati rice", "wild rice", "quinoa", "oats",
    "rolled oats", "steel cut oats", "instant oatmeal", "pasta", "spaghetti",
    "penne pasta", "macaroni", "fettuccine", "linguine", "lasagna noodles",
    "egg noodles", "couscous", "barley", "lentils", "red lentils",
    "split peas", "black beans", "kidney beans", "pinto beans", "chickpeas",
    "garbanzo beans", "cannellini beans", "navy beans", "black eyed peas",
    "almonds", "walnuts", "pecans", "cashews", "peanuts", "peanut butter",
    "almond butter", "pine nuts", "sunflower seeds", "chia seeds",
    "flax seeds", "sesame seeds", "vegetable oil", "canola oil", "olive oil",
    "extra virgin olive oil", "coconut oil", "sesame oil", "vinegar",
    "balsamic vinegar", "apple cider vinegar", "white vinegar",
    "rice vinegar", "red wine vinegar",
  ].map((name) => ({ name, section: "baking supplies" })),

  // meat (70)
  ...[
    "chicken breast", "boneless chicken breast", "chicken thigh",
    "boneless chicken thigh", "chicken drumstick", "chicken wing",
    "whole chicken", "ground chicken", "turkey breast", "ground turkey",
    "turkey bacon", "turkey sausage", "ground beef", "lean ground beef",
    "beef chuck roast", "beef brisket", "ribeye steak", "sirloin steak",
    "flank steak", "skirt steak", "beef stew meat", "beef short ribs",
    "ground pork", "pork chop", "pork tenderloin", "pork shoulder",
    "pork loin", "bacon", "ham", "deli ham", "prosciutto", "sausage",
    "italian sausage", "breakfast sausage", "chorizo", "hot dog", "bratwurst",
    "lamb chop", "ground lamb", "leg of lamb", "salmon fillet", "salmon steak",
    "tuna steak", "canned tuna", "cod fillet", "tilapia fillet", "halibut",
    "shrimp", "jumbo shrimp", "scallops", "crab meat", "lobster tail",
    "mussels", "clams", "ground veal", "veal cutlet", "deli turkey",
    "deli roast beef", "deli salami", "pepperoni", "andouille sausage",
    "chicken tenders", "chicken liver", "corned beef", "pastrami",
    "canned salmon", "smoked salmon", "anchovies", "sardines", "duck breast",
  ].map((name) => ({ name, section: "meat" })),

  // bakery (35)
  ...[
    "white bread", "whole wheat bread", "sourdough bread", "multigrain bread",
    "rye bread", "french bread", "baguette", "ciabatta bread", "brioche bread",
    "english muffin", "bagel", "everything bagel", "dinner rolls",
    "hamburger buns", "hot dog buns", "pita bread", "naan bread", "tortilla",
    "flour tortilla", "corn tortilla", "croissant", "muffin",
    "blueberry muffin", "banana bread", "biscuit", "pancake mix", "waffle",
    "breadcrumbs", "panko breadcrumbs", "pie crust", "pizza dough",
    "focaccia bread", "cornbread", "donut", "cinnamon roll",
  ].map((name) => ({ name, section: "bakery" })),

  // prepared meals (50)
  ...[
    "rotisserie chicken", "frozen pizza", "canned chicken noodle soup",
    "canned tomato soup", "canned vegetable soup", "canned minestrone soup",
    "canned black bean soup", "mac and cheese", "instant ramen",
    "canned chili", "canned beef stew", "frozen lasagna", "frozen burrito",
    "frozen chicken nuggets", "frozen fish sticks", "frozen mozzarella sticks",
    "canned baked beans", "canned refried beans", "canned corn",
    "canned green beans", "canned peas", "canned carrots",
    "canned diced tomatoes", "canned crushed tomatoes", "canned tomato sauce",
    "canned tomato paste", "marinara sauce", "alfredo sauce", "pesto sauce",
    "bbq sauce", "ketchup", "mustard", "mayonnaise", "ranch dressing",
    "italian dressing", "caesar dressing", "salad dressing", "hot sauce",
    "worcestershire sauce", "teriyaki sauce", "gravy", "chicken broth",
    "beef broth", "vegetable broth", "bouillon cubes",
    "cream of mushroom soup", "canned clam chowder", "frozen tv dinner",
    "frozen pot pie", "hummus",
  ].map((name) => ({ name, section: "prepared meals" })),

  // frozen (40) — D-04: no USDA/category equivalent, section assigned by hand
  ...[
    "frozen peas", "frozen corn", "frozen strawberries", "frozen blueberries",
    "frozen mixed berries", "frozen mixed vegetables", "frozen broccoli",
    "frozen cauliflower", "frozen spinach", "frozen green beans",
    "frozen carrots", "frozen hash browns", "frozen french fries",
    "frozen tater tots", "frozen waffles", "frozen pancakes", "frozen shrimp",
    "frozen chicken breast", "frozen ground beef", "frozen edamame",
    "frozen mango", "frozen pineapple", "frozen banana",
    "frozen peach slices", "frozen raspberries", "frozen blackberries",
    "frozen brussels sprouts", "frozen okra", "frozen bell pepper strips",
    "frozen diced onion", "frozen stir fry vegetables", "frozen dumplings",
    "frozen egg rolls", "frozen ice cream", "frozen sorbet",
    "frozen popsicles", "frozen whipped topping", "frozen puff pastry",
    "frozen pie crust", "frozen garlic bread",
  ].map((name) => ({ name, section: "frozen" })),

  // international (49) — D-04: no USDA/category equivalent, section assigned by hand
  ...[
    "soy sauce", "curry powder", "salsa", "curry paste", "red curry paste",
    "green curry paste", "canned coconut milk", "fish sauce", "hoisin sauce",
    "oyster sauce", "mirin", "sriracha", "gochujang", "miso paste", "tahini",
    "harissa", "garam masala", "cumin seed", "ground cumin", "coriander seed",
    "ground coriander", "turmeric", "paprika", "smoked paprika",
    "cayenne pepper", "chili powder", "chili flakes", "five spice powder",
    "za'atar", "sumac", "tamarind paste", "wasabi paste", "pickled ginger",
    "nori sheets", "rice paper wrappers", "wonton wrappers",
    "egg roll wrappers", "ramen noodles", "udon noodles", "soba noodles",
    "rice noodles", "panang curry paste", "salsa verde", "adobo sauce",
    "chipotle peppers in adobo", "taco seasoning", "enchilada sauce",
    "tortilla chips", "kimchi",
  ].map((name) => ({ name, section: "international" })),
];

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

function runPipeline(candidates, ctx, ownCategoryFn) {
  const { foundation, foundationFuse, srLegacy, srFuse, existingRawNames } = ctx;

  return candidates.map((c) => {
    const rawName = typeof c === "string" ? c : c.name;
    const norm = normalizeName(rawName);
    const join = joinToFdc(norm, foundation, foundationFuse, srLegacy, srFuse);

    // Section: prefer the candidate's own pre-assigned/pre-known category
    // (OFF root branch, or the hand-curated list's direct assignment) over
    // deriving it from the FDC join's category — the join can miss (null
    // fdc_id) while the candidate's own category is still known.
    const ownCategory = ownCategoryFn(c);
    const section =
      ownCategory && OFF_ROOT_TO_SECTION[ownCategory]
        ? OFF_ROOT_TO_SECTION[ownCategory]
        : typeof c === "object" && c.section
          ? c.section
          : mapCategoryToSection(join.usda_category);

    const store = mapToStore(join.usda_category, section, norm);
    const unit = mapToUnit(norm);
    const existsAlready = existingRawNames.has(norm);

    return {
      name: rawName,
      normalized: norm,
      ...join,
      section,
      store,
      canonical_unit: unit.canonical_unit,
      dimension: unit.dimension,
      existsAlready,
    };
  });
}

// ---------------------------------------------------------------------------
// Comparison report
// ---------------------------------------------------------------------------

function summarize(results) {
  const total = results.length;
  const matched = results.filter((r) => r.fdc_id !== null).length;
  const nullCount = total - matched;
  const sectioned = results.filter((r) => r.section !== null).length;
  const overlap = results.filter((r) => r.existsAlready).length;
  return {
    total,
    matched,
    matchRate: total ? ((matched / total) * 100).toFixed(1) + "%" : "n/a",
    nullCount,
    sectioned,
    sectionCoverage: total ? ((sectioned / total) * 100).toFixed(1) + "%" : "n/a",
    overlap,
  };
}

function renderResultsTable(results) {
  const lines = [
    "| Name | fdc_id | USDA source | Matched USDA name | Section | Store | Unit |",
    "|------|--------|-------------|--------------------|---------|-------|------|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.name} | ${r.fdc_id ?? "—"} | ${r.usda_data_type || "—"} | ${
        r.matched_name ?? "—"
      } | ${r.section ?? "—"} | ${r.store} | ${
        r.canonical_unit ? `${r.canonical_unit} (${r.dimension})` : "—"
      } |`
    );
  }
  return lines.join("\n");
}

function buildComparisonReport({ offResults, offMeta, curatedResults }) {
  const offStats = summarize(offResults);
  const curatedStats = summarize(curatedResults);

  const lines = [];
  lines.push("# Catalog Source Comparison (D-01 / Open Question 1)");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(
    "Decision this report supports: which plain-name catalog backs the full seed build — Open Food Facts categories taxonomy (filtered) vs a hand-curated (LLM-assisted) static list. See Task 2 of 03-03-PLAN.md."
  );
  lines.push("");
  lines.push(
    `Existing-registry overlap is measured against the live 121 \`raw\` products (composite \`(name, type)\` unique index — see 03-RESEARCH.md Pitfall 2), for information only. No PocketBase writes were made by this script.`
  );
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(
    "| Approach | Sample size | fdc_id match rate | Null fdc_id | Section-mapping coverage | Already in registry |"
  );
  lines.push("|----------|-------------|--------------------|-------------|--------------------------|----------------------|");
  lines.push(
    `| Open Food Facts (filtered) | ${offStats.total} | ${offStats.matchRate} | ${offStats.nullCount} | ${offStats.sectionCoverage} | ${offStats.overlap} |`
  );
  lines.push(
    `| Hand-curated | ${curatedStats.total} | ${curatedStats.matchRate} | ${curatedStats.nullCount} | ${curatedStats.sectionCoverage} | ${curatedStats.overlap} |`
  );
  lines.push("");

  lines.push("## Approach 1: Open Food Facts categories taxonomy (filtered)");
  lines.push("");
  lines.push(
    `Filter: English-only, ASCII-simple names, leaf nodes under the \`en:vegetables\`/\`en:fruits\`/\`en:meats\`/\`en:dairies\`/\`en:cereals-and-potatoes\`/\`en:fats\` branches, prep-state descriptors (Frozen/Canned/Cooked/... prefixes) excluded, >1-capitalized-word names excluded (brand/region heuristic). This filter reduced the raw taxonomy (14,541 total category nodes) to **${offMeta.totalFiltered} generic candidate names**; the 50-item sample below is a deterministic every-Nth-item slice across that filtered pool (spans all 6 branches, not clustered in one).`
  );
  lines.push("");
  lines.push(
    `**Noise/junk observed even after filtering** (excluded from the sample below, but present in the ${offMeta.totalFiltered}-item filtered pool and illustrative of the remaining curation cost):`
  );
  lines.push("");
  lines.push(
    "- `Tomato off season raw` / `Tomato in season raw` — seasonal-availability variants, not a single plain concept name"
  );
  lines.push(
    "- `Green beans imported by plane` / `Green beans imported by boat` — transport-method variants (EU carbon-labeling category, irrelevant to a household registry)"
  );
  lines.push(
    "- `Pumpkin tomatoes` / `Heirloom tomatoe` (note: singular typo in the source taxonomy itself) — cultivar-level entries, noisier than the household \"tomato\" concept"
  );
  lines.push(
    "- Single-capitalized-word entries can still slip past the brand/region heuristic (e.g. `Mashua`, `Kohlrabi` — these are fine, just illustrating the heuristic isn't perfect)"
  );
  lines.push("");
  lines.push("**50-item sample + join results:**");
  lines.push("");
  lines.push(renderResultsTable(offResults));
  lines.push("");

  lines.push("## Approach 2: Hand-curated (LLM-assisted) household-staple list");
  lines.push("");
  lines.push(
    "50 items authored directly against the 8 existing sections (produce, dairy, baking supplies, meat, bakery, prepared meals, frozen, international) — no filtering/curation pass needed, by construction. `frozen`/`international` entries are hand-assigned since neither has a USDA/category equivalent (D-04)."
  );
  lines.push("");
  lines.push("**50-item list + join results:**");
  lines.push("");
  lines.push(renderResultsTable(curatedResults));
  lines.push("");

  lines.push("## Observations for the decision (Task 2)");
  lines.push("");
  lines.push(
    `- **Join coverage is dramatically different in this real run**: OFF-filtered ${offStats.matchRate} vs. hand-curated ${curatedStats.matchRate} fdc_id match rate. This is NOT a join-algorithm artifact — the same join code (containment-first, fuse.js-fallback, Foundation-Foods-then-SR-Legacy) runs against both lists. It is a **candidate-quality artifact of unweighted taxonomy sampling**: the OFF-filtered pool's leaf-level/English/non-branded filter (Approach 1) still passes through rare cultivar/regional/prep-variant leaf nodes (e.g. \`Nazca potatoes\`, \`Maasdam\`, \`Tintern\`, \`Gofio\`, \`Koshihikari rices\`) that are real, legitimate OFF taxonomy entries but are NOT household-staple concepts USDA's Foundation Foods/SR Legacy bother to catalog individually — so most of this sample genuinely misses (\`fdc_id = null\`, a valid D-02 state, but ${offStats.nullCount}/${offStats.total} of them here).`
  );
  lines.push(
    `- **What this means for the OFF path**: the filter this pipeline applies (English, leaf-node, no-prep-prefix, no-brand heuristic) is necessary but *not sufficient* to reach "household staple" quality — RESEARCH.md's warning that OFF "needs a filtering + curation pass" is confirmed empirically here, and the curation gap is larger than a simple English/leaf/brand filter can close. A production OFF-sourced build would need an additional popularity/genericness curation step (e.g. preferring shorter names, common-word lists, or a manual pass) — real, non-trivial additional work beyond what this script already does.`
  );
  lines.push(
    `- **Section-mapping coverage** is 100% for both in this sample — for OFF this is because the sample is restricted to 6 well-defined root branches with a clean root->section map (this holds even for the rare/obscure items above — knowing "Maasdam" came from \`en:dairies\` is enough to route it to the dairy section, independent of whether the fdc_id join succeeds); for hand-curated it's 100% by construction.`
  );
  lines.push(
    `- **Name-quality noise**: the hand-curated list is 100% concept-level, zero-noise by construction. The OFF filtered pool (${offMeta.totalFiltered} items after filtering, before sampling) still contains prep-state, transport-method, seasonal, and cultivar/regional-variety entries (see examples above) that this filter does not fully eliminate.`
  );
  lines.push(
    `- **Breadth**: OFF's filtered pool (${offMeta.totalFiltered} candidates from just 6 branches) is large and can scale past 800 if wanted, but per the point above, raw breadth from this pool trades off hard against join quality without further curation. The hand-curated approach is capped at whatever is authored (50 here; scaling to 400-800 means authoring 400-800 more entries by hand/LLM-assist) but each authored item is a deliberate, high-quality choice — this sample's ${curatedStats.matchRate} match rate is a more realistic preview of what a full hand-curated build would achieve.`
  );
  lines.push(
    "- Either choice is valid per D-02 (null fdc_id is an acceptable per-item state) — but this run's real numbers argue that reaching OFF's breadth-and-credibility upside at a join-quality comparable to hand-curation requires budgeting for a real curation pass on top of the filter already built here, not treating the filter alone as sufficient."
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full seed build (Plan 04) — runs the locked hand-curated catalog through
// the pipeline and emits scripts/data/usda-seed.json for seed-usda.js.
// ---------------------------------------------------------------------------

/** Drops any internal exact-name (case-insensitive, trimmed) duplicates from
 *  a candidate list, keeping the first occurrence. Safety net for hand
 *  authoring — a repeat here would otherwise make seed-usda.js attempt two
 *  INSERTs for the same normalized name in one run (unique-index violation
 *  on the second), since seed-usda.js resolves against a single snapshot of
 *  existing raw products taken before any writes in that run. */
function dedupeByNormalizedName(candidates) {
  const seen = new Set();
  const deduped = [];
  let droppedCount = 0;
  for (const c of candidates) {
    const key = normalizeName(typeof c === "string" ? c : c.name);
    if (seen.has(key)) {
      droppedCount++;
      continue;
    }
    seen.add(key);
    deduped.push(c);
  }
  return { deduped, droppedCount };
}

/**
 * Runs the full hand-curated catalog through the pipeline and maps each
 * result to the final seed-row shape consumed by seed-usda.js:
 * {name, type: "raw", storeId, sectionId, fdc_id, usda_data_type,
 *  usda_category, canonical_unit, dimension}. `storeId`/`sectionId` are
 * resolved by name against the live collections (Pitfall 3) — never
 * hardcoded IDs.
 */
function buildFullSeedRows(ctx, sectionNameToId, storeNameToId) {
  const { deduped, droppedCount } = dedupeByNormalizedName(HAND_CURATED_FULL);
  console.log(
    `  Catalog: ${HAND_CURATED_FULL.length} authored items, ${droppedCount} internal duplicate(s) dropped, ${deduped.length} unique rows`
  );

  const results = runPipeline(deduped, ctx, () => null);

  return results.map((r) => ({
    name: r.name,
    type: "raw",
    storeId: storeNameToId.get(r.store) ?? null,
    sectionId: r.section ? (sectionNameToId.get(r.section) ?? null) : null,
    fdc_id: r.fdc_id,
    usda_data_type: r.usda_data_type || null,
    usda_category: r.usda_category,
    canonical_unit: r.canonical_unit,
    dimension: r.dimension,
  }));
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

// --full-seed (Plan 04): run the LOCKED hand-curated catalog through the
// pipeline and emit scripts/data/usda-seed.json. Default (no flag): the
// original Plan 03 Task 1 catalog-comparison spike, unchanged.
const FULL_SEED = process.argv.includes("--full-seed");

async function main() {
  console.log("=".repeat(80));
  console.log(
    FULL_SEED
      ? "BUILD USDA SEED — full ~500-item hand-curated seed build (Plan 04)"
      : "BUILD USDA SEED — pipeline scaffolding + catalog comparison spike"
  );
  console.log(`PB (read-only): ${PB_URL}`);
  console.log("=".repeat(80));

  console.log("\nLoading USDA bulk data...");
  const foundation = loadFoundationFoods();
  const srLegacy = loadSrLegacy();
  console.log(`  Foundation Foods: ${foundation.length} entries`);
  console.log(`  SR Legacy: ${srLegacy.length} entries`);

  console.log("\nBuilding fuse.js fallback indexes...");
  const foundationFuse = buildFuseIndex(foundation);
  const srFuse = buildFuseIndex(srLegacy);

  console.log("\nReading existing raw products (read-only, for overlap info only)...");
  const existingRaw = await pb
    .collection("products")
    .getFullList({ filter: 'type = "raw"' });
  const existingRawNames = new Set(existingRaw.map((p) => normalizeName(p.name)));
  console.log(`  ${existingRaw.length} existing raw products loaded`);

  console.log("\nResolving live sections/stores (read-only, name lookup)...");
  const sections = await pb.collection("sections").getFullList();
  const stores = await pb.collection("stores").getFullList();
  console.log(
    `  ${sections.length} sections: ${sections.map((s) => s.name).join(", ")}`
  );
  console.log(`  ${stores.length} stores: ${stores.map((s) => s.name).join(", ")}`);

  const ctx = { foundation, foundationFuse, srLegacy, srFuse, existingRawNames };

  if (FULL_SEED) {
    console.log("\nBuilding full seed rows from the locked hand-curated catalog...");
    const sectionNameToId = new Map(sections.map((s) => [s.name, s.id]));
    const storeNameToId = new Map(stores.map((s) => [s.name, s.id]));
    const seedRows = buildFullSeedRows(ctx, sectionNameToId, storeNameToId);

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const seedJsonPath = path.join(DATA_DIR, "usda-seed.json");
    fs.writeFileSync(seedJsonPath, JSON.stringify(seedRows, null, 2), "utf-8");

    const withFdc = seedRows.filter((r) => r.fdc_id).length;
    const withSection = seedRows.filter((r) => r.sectionId).length;
    const overlapCount = HAND_CURATED_FULL.filter((c) =>
      existingRawNames.has(normalizeName(c.name))
    ).length;
    console.log(`\nWrote ${seedRows.length} seed rows to: ${seedJsonPath}`);
    console.log(
      `  fdc_id join coverage: ${withFdc}/${seedRows.length} (${((withFdc / seedRows.length) * 100).toFixed(1)}%)`
    );
    console.log(`  section-mapped: ${withSection}/${seedRows.length}`);
    console.log(
      `  already-in-registry overlap (informational only, seed-usda.js resolves these): ${overlapCount}`
    );
    console.log(
      "\nNo PocketBase writes performed by this script — seed-usda.js (Plan 04 Task 2) does the actual insert/backfill."
    );
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  // Helper artifact for Plan 04's seed-usda.js (avoids re-querying section/
  // store IDs by name on every future run of this pipeline).
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "section-store-ids.json"),
    JSON.stringify(
      {
        sections: sections.map((s) => ({ id: s.id, name: s.name })),
        stores: stores.map((s) => ({ id: s.id, name: s.name })),
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\nLoading + filtering Open Food Facts categories taxonomy...");
  const { sample: offSample, totalFiltered } = loadOffCategoriesFiltered(50);
  console.log(`  ${totalFiltered} candidates after filtering; sampled ${offSample.length}`);

  console.log("\nRunning pipeline over OFF-filtered 50-item sample...");
  const offResults = runPipeline(offSample, ctx, (c) => c.root);

  console.log("Running pipeline over hand-curated 50-item list...");
  const curatedResults = runPipeline(curatedList(), ctx, () => null);

  const report = buildComparisonReport({
    offResults,
    offMeta: { totalFiltered },
    curatedResults,
  });

  const reportPath = path.join(OUTPUT_DIR, "catalog-comparison.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`\nWrote comparison report to: ${reportPath}`);
  console.log(
    "\nNo PocketBase writes performed. This is the decision artifact for Task 2's checkpoint."
  );
}

function curatedList() {
  return HAND_CURATED_50;
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
