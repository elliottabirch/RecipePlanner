import { describe, expect, it } from "vitest";
import {
  canConvert,
  convert,
  getDimension,
  normalizeUnit,
  promoteUnit,
  chooseDisplayUnit,
  scaleQuantity,
  type Unit,
} from "./units";

describe("units.ts — conversion math", () => {
  it("round-trips cup <-> tbsp exactly (within float tolerance)", () => {
    expect(convert(1, "cup", "tbsp")).toBeCloseTo(16);
    expect(convert(16, "tbsp", "cup")).toBeCloseTo(1);
  });

  it("white-bean anchor: 0.25 cup + 2 tbsp === 6 tbsp", () => {
    const quarterCupInTbsp = convert(0.25, "cup", "tbsp");
    expect(quarterCupInTbsp).not.toBeNull();
    expect((quarterCupInTbsp as number) + 2).toBeCloseTo(6);
  });

  it("cannot convert across dimensions (volume <-> mass)", () => {
    expect(canConvert("cup", "lb")).toBe(false);
    expect(convert(1, "cup", "lb")).toBeNull();
  });

  it("cannot convert count (each) to volume or mass", () => {
    expect(canConvert("each", "cup")).toBe(false);
    expect(convert(1, "each", "cup")).toBeNull();
    expect(convert(1, "each", "g")).toBeNull();
  });

  it("count-to-count is a pass-through only when units are equal", () => {
    expect(convert(3, "each", "each")).toBe(3);
  });

  it("getDimension reports the correct dimension for representative units", () => {
    expect(getDimension("cup")).toBe("volume");
    expect(getDimension("lb")).toBe("mass");
    expect(getDimension("each")).toBe("count");
  });
});

describe("units.ts — normalizeUnit (alias resolution)", () => {
  const cases: Array<[string, Unit | null]> = [
    ["ea", "each"],
    ["cups", "cup"],
    ["Tbsp", "tbsp"],
    ["clove", "each"],
    ["cloves", "each"],
    ["can", "each"],
    ["bu", "each"],
    ["bunch", "each"],
    ["tbl", "tbsp"],
    ["cu", "cup"],
    ["whole", "each"],
    ["cubes", "each"],
    // Genuinely unresolvable — never guessed (D-08)
    ["by", null],
    ["chile", null],
    ["medium", null],
    ["28oz cans", null],
  ];

  it.each(cases)("normalizeUnit(%j) === %j", (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeUnit("  CUP  ")).toBe("cup");
    expect(normalizeUnit(" Ea ")).toBe("each");
  });
});

describe("units.ts — display-unit selection (D-10)", () => {
  it("does not promote a sub-cup volume total past cup", () => {
    const result = promoteUnit(0.5, "cup");
    const volumeCap: Unit[] = ["tsp", "tbsp", "fl_oz", "cup"];
    expect(volumeCap).toContain(result.unit);
    expect(result.quantity).toBeGreaterThanOrEqual(1);
  });

  it("does not promote a sub-lb mass total past lb", () => {
    const result = promoteUnit(8, "oz");
    expect(result.unit).toBe("oz");
    expect(result.quantity).toBeCloseTo(8);
  });

  it("promotes an under-representation up to the largest unit keeping qty >= 1", () => {
    // 60 tsp = 1.25 cup, comfortably over the >= 1 threshold at cup.
    const result = promoteUnit(60, "tsp");
    expect(result.unit).toBe("cup");
    expect(result.quantity).toBeCloseTo(1.25);
  });

  it("never crosses metric <-> customary within one promotion path", () => {
    const customaryResult = promoteUnit(4, "fl_oz");
    expect(["tsp", "tbsp", "fl_oz", "cup"]).toContain(customaryResult.unit);

    const metricResult = promoteUnit(500, "ml");
    expect(["ml", "l"]).toContain(metricResult.unit);
  });

  it("is deterministic and independent of argument order (same inputs -> same output)", () => {
    const a = promoteUnit(0.5, "cup");
    const b = promoteUnit(0.5, "cup");
    expect(a).toEqual(b);
  });

  it("chooseDisplayUnit prefers canonical_unit when set", () => {
    const result = chooseDisplayUnit("volume", "cup", 16, "tbsp");
    expect(result.unit).toBe("cup");
    expect(result.quantity).toBeCloseTo(1);
  });

  it("chooseDisplayUnit falls back to promoteUnit when canonical_unit is null", () => {
    const result = chooseDisplayUnit("mass", null, 8, "oz");
    expect(result.unit).toBe("oz");
  });

  // Regression: CR-01 — non-enum units (e.g. "" written to cleared stored
  // nodes, or an unresolved raw string cast `as Unit`) must be treated as
  // unconvertible, never silently summed into NaN.
  it("treats non-enum / empty units as unconvertible (no NaN)", () => {
    const empty = "" as unknown as Unit;
    const junk = "chile" as unknown as Unit;
    expect(canConvert(empty, empty)).toBe(false);
    expect(canConvert(junk, junk)).toBe(false);
    expect(canConvert(empty, "cup")).toBe(false);
    expect(convert(2, empty, empty)).toBeNull();
    expect(convert(2, junk, junk)).toBeNull();
  });

  // Regression: WR-01 — a canonical_unit in a different dimension than the
  // line's current unit must NOT relabel the quantity ("500 g" -> "500 cup").
  it("chooseDisplayUnit does not relabel across a failed conversion", () => {
    const result = chooseDisplayUnit("mass", "cup" as Unit, 500, "g");
    // "cup" is volume; the line is mass. Conversion fails, so the honest
    // metric-mass promotion is kept (500 g stays under 1 kg) — never "500 cup".
    expect(result.unit).toBe("g");
    expect(result.quantity).toBeCloseTo(500);
  });
});

// ============================================================================
// Wave 0 RED scaffold (04-01-PLAN.md Task 2). `scaleQuantity` is not yet
// exported from ./units — this block is expected to fail until 04-03
// (D-04 shared rounding helper) lands. See 04-RESEARCH.md Pattern 3.
// ============================================================================
describe("units.ts — scaleQuantity (D-04 discrete/continuous rounding)", () => {
  it("continuous mass unit returns exact qty*factor, including fractional results", () => {
    expect(scaleQuantity(3, 0.5, "g")).toBeCloseTo(1.5);
  });

  it("continuous volume unit returns exact qty*factor, including fractional results", () => {
    expect(scaleQuantity(3, 0.5, "cup")).toBeCloseTo(1.5);
  });

  it("each-dimension unit ceils (never under-buy an indivisible item)", () => {
    expect(scaleQuantity(3, 0.5, "each")).toBe(2);
  });

  it("the literal 'discrete' third arg ceils regardless of the unit's own dimension", () => {
    // Container-instance counts (Pattern 3 category 2) are always
    // integer-conceptual, even for a continuous-mass/volume product.
    expect(scaleQuantity(3, 0.5, "discrete")).toBe(2);
  });

  it("documents the deliberate ceil on container float drift (2 * 1.0000000001 rounds up to 3)", () => {
    expect(scaleQuantity(2, 1.0000000001, "discrete")).toBe(3);
  });

  it("exact integers stay put (2 * 1 discrete does not spuriously round up)", () => {
    expect(scaleQuantity(2, 1, "discrete")).toBe(2);
  });
});
