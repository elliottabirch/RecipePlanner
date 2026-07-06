import { describe, expect, it } from "vitest";
import {
  canConvert,
  convert,
  getDimension,
  normalizeUnit,
  promoteUnit,
  chooseDisplayUnit,
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
    // 48 tsp = 1 cup exactly-ish; should promote all the way to cup.
    const result = promoteUnit(48, "tsp");
    expect(result.unit).toBe("cup");
    expect(result.quantity).toBeCloseTo(1);
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
});
