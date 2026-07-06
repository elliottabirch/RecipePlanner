/**
 * Unit vocabulary, dimension map, alias table, exact conversion math, and
 * deterministic display-unit selection.
 *
 * This module is the single source of truth for units across the app —
 * aggregation builders, the recipe linter, and the editor all consume it.
 * No cross-dimension conversion is attempted (volume <-> mass requires a
 * density model the project deliberately does not have — see PROJECT.md
 * "Out of Scope"). Fraction/human-friendly rounding is explicitly NOT this
 * module's job (D-11) — it stays exact and reviewable; rendering handles
 * display formatting.
 *
 * Conversion factors are the exact, legally-defined NIST Handbook 44 /
 * BIPM SI Brochure values (verified 2026-07-05; see
 * .planning/phases/01-data-hygiene/01-RESEARCH.md "Architecture Patterns >
 * Pattern 1" for the source citation). Do not "round to something that
 * looks close" — a wrong factor silently corrupts every shopping list.
 */

export type Dimension = "volume" | "mass" | "count";

export type Unit =
  | "tsp"
  | "tbsp"
  | "fl_oz"
  | "cup"
  | "pint"
  | "qt"
  | "gal"
  | "ml"
  | "l"
  | "g"
  | "kg"
  | "oz"
  | "lb"
  | "each";

export const UNIT_DIMENSIONS: Record<Unit, Dimension> = {
  tsp: "volume",
  tbsp: "volume",
  fl_oz: "volume",
  cup: "volume",
  pint: "volume",
  qt: "volume",
  gal: "volume",
  ml: "volume",
  l: "volume",
  g: "mass",
  kg: "mass",
  oz: "mass",
  lb: "mass",
  each: "count",
};

// Exact factors — verified against NIST Handbook 44 / BIPM SI Brochure
// (2026-07-05). 1 US gal = 3.785411784 L exactly; 1 lb = 453.59237 g
// exactly; 1 oz (avdp) = 28.349523125 g exactly. Copied verbatim from
// 01-RESEARCH.md Pattern 1 — do not re-derive.
export const TO_ML: Partial<Record<Unit, number>> = {
  tsp: 4.92892,
  tbsp: 14.78676,
  fl_oz: 29.57353,
  cup: 236.588236,
  pint: 473.176473,
  qt: 946.352946,
  gal: 3785.411784,
  ml: 1,
  l: 1000,
};

export const TO_G: Partial<Record<Unit, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

/** Alias -> canonical enum token. Seeded from the 445-record live
 * recipe_product_nodes.unit disposition table in 01-RESEARCH.md
 * "Common Pitfalls #2". Keys are matched against the lowercased/trimmed
 * raw string in normalizeUnit(). Container-type strings (e.g.
 * "quart restaurant", "vacuum sealed bag") and genuinely unresolvable
 * junk (e.g. "by", "chile", "medium", "28oz cans") are intentionally
 * absent — they must resolve to null and be surfaced for manual
 * resolution (D-08), never guessed.
 */
export const UNIT_ALIASES: Record<string, Unit> = {
  ea: "each",
  cups: "cup",
  tbl: "tbsp",
  cu: "cup",
  quart: "qt",
  clove: "each",
  cloves: "each",
  can: "each", // D-13: loses can-size distinction by design
  bu: "each", // D-13: bunch abbreviation, no dedicated count unit
  bunch: "each",
  whole: "each",
  cube: "each",
  cubes: "each",
  slices: "each",
  pitas: "each",
  sprigs: "each",
};

export function getDimension(unit: Unit): Dimension {
  return UNIT_DIMENSIONS[unit];
}

export function canConvert(a: Unit, b: Unit): boolean {
  const da = getDimension(a);
  const db = getDimension(b);
  // Non-enum units (e.g. "" written to cleared stored nodes, or an
  // unresolved raw string cast `as Unit` by the aggregation layer) have no
  // dimension. Two of them must NOT be treated as convertible — otherwise
  // `undefined === undefined` reads as `true` and `convert` returns NaN,
  // silently corrupting the merged quantity. Unknown units are never
  // convertible; the caller splits instead of summing.
  if (da === undefined || db === undefined) return false;
  return da === db;
}

/**
 * Convert `qty` from one unit to another. Returns null when the units are
 * in different dimensions (e.g. volume <-> mass) or when converting
 * between two different count units (each has no sub-units — count-to-count
 * only "converts" when both sides are the same unit).
 */
export function convert(qty: number, from: Unit, to: Unit): number | null {
  if (!canConvert(from, to)) return null;
  const dim = getDimension(from);
  if (dim === "count") return from === to ? qty : null;
  const table = dim === "volume" ? TO_ML : TO_G;
  return (qty * table[from]!) / table[to]!;
}

function isUnit(value: string): value is Unit {
  return Object.prototype.hasOwnProperty.call(UNIT_DIMENSIONS, value);
}

/**
 * Resolve a raw, human-entered unit string to a canonical Unit token.
 * Lowercases and trims first; if the result is already an enum member it
 * is returned as-is; otherwise the alias table is consulted; otherwise
 * null (unresolved — never guessed, per D-08).
 */
export function normalizeUnit(raw: string): Unit | null {
  const normalized = raw.trim().toLowerCase();
  if (isUnit(normalized)) return normalized;
  const alias = UNIT_ALIASES[normalized];
  return alias ?? null;
}

export interface DisplayResult {
  unit: Unit;
  quantity: number;
}

// Promotion orders are ascending by size and never mix metric/customary
// within one dimension's system. Customary volume is capped at `cup`
// (D-10: "36 tsp" is unacceptable on the tablet in the store); customary
// mass is capped at `lb`.
const CUSTOMARY_VOLUME_ORDER: Unit[] = ["tsp", "tbsp", "fl_oz", "cup"];
const METRIC_VOLUME_ORDER: Unit[] = ["ml", "l"];
const CUSTOMARY_MASS_ORDER: Unit[] = ["oz", "lb"];
const METRIC_MASS_ORDER: Unit[] = ["g", "kg"];

const METRIC_UNITS = new Set<Unit>(["ml", "l", "g", "kg"]);

function promotionOrderFor(unit: Unit, dimension: Dimension): Unit[] {
  if (dimension === "volume") {
    return METRIC_UNITS.has(unit) ? METRIC_VOLUME_ORDER : CUSTOMARY_VOLUME_ORDER;
  }
  if (dimension === "mass") {
    return METRIC_UNITS.has(unit) ? METRIC_MASS_ORDER : CUSTOMARY_MASS_ORDER;
  }
  return ["each"];
}

/**
 * Pick the largest unit within the same system (customary or metric) that
 * keeps the displayed quantity >= 1, capped at `cup` (volume) / `lb`
 * (mass), never crossing metric<->customary. Deterministic and
 * independent of argument/node order (D-10 fallback path, used when a
 * product's canonical_unit is not set).
 */
export function promoteUnit(qty: number, unit: Unit): DisplayResult {
  const dimension = getDimension(unit);
  if (dimension === "count") return { unit, quantity: qty };

  let best: DisplayResult = { unit, quantity: qty };
  for (const candidate of promotionOrderFor(unit, dimension)) {
    const converted = convert(qty, unit, candidate);
    if (converted !== null && converted >= 1) {
      best = { unit: candidate, quantity: converted };
    }
  }
  return best;
}

/**
 * Choose the display unit for a merged aggregation line (D-10). When the
 * product's canonical_unit is set, that is always the display unit
 * (primary path) — convert the total into it. When null (edge case; the
 * linter should be flagging this product for review), fall back to
 * promoteUnit's largest-unit-keeping-qty->=1 selection.
 */
export function chooseDisplayUnit(
  dimension: Dimension,
  canonicalUnit: Unit | null,
  qty: number,
  currentUnit: Unit
): DisplayResult {
  if (dimension === "count") return { unit: currentUnit, quantity: qty };
  if (canonicalUnit) {
    const converted = convert(qty, currentUnit, canonicalUnit);
    // Only relabel to the canonical unit when the conversion actually
    // succeeded. If it returns null (canonicalUnit is in a different
    // dimension than the line — e.g. a mis-backfilled product), keep the
    // honest current unit via the promotion fallback rather than stamping
    // the canonical label onto an unconverted quantity ("500 g" -> "500 cup").
    if (converted !== null) return { unit: canonicalUnit, quantity: converted };
  }
  return promoteUnit(qty, currentUnit);
}
