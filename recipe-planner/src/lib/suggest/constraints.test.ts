import { describe, it, expect } from "vitest";
import {
  registryOverlap,
  activePrepMinutes,
  batchFit,
  macroEstimate,
  CONFIDENT_MATCH_GATE,
} from "./constraints";
import { ProductType, type Product, type RecipeStep } from "../types";

/** Minimal Product fixture — only `name`/`type`/nutrition matter here. */
function mkProduct(name: string, extra: Partial<Product> = {}): Product {
  return {
    id: `id-${name.replace(/\s+/g, "-")}`,
    created: "",
    updated: "",
    collectionId: "",
    collectionName: "products",
    name,
    type: ProductType.Raw,
    ...extra,
  };
}

/** Minimal RecipeStep fixture. */
function mkStep(extra: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: `step-${Math.random()}`,
    created: "",
    updated: "",
    collectionId: "",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "step",
    step_type: "prep" as RecipeStep["step_type"],
    ...extra,
  };
}

const REGISTRY: Product[] = [
  mkProduct("onion (yellow)"),
  mkProduct("garlic cubes (frozen)"),
  mkProduct("tomato paste"),
  mkProduct("olive oil", { protein_g: 0 }),
  mkProduct("black beans", { protein_g: 0 }),
];

describe("registryOverlap", () => {
  it("returns 0 for an empty candidate list (no division by zero)", () => {
    expect(registryOverlap([], REGISTRY)).toBe(0);
  });

  it("scores a near-exact match as covered by the confidence gate", () => {
    // "onion (yellow)" and "tomato paste" are (near-)exact registry names.
    const overlap = registryOverlap(
      ["onion (yellow)", "tomato paste"],
      REGISTRY
    );
    expect(overlap).toBe(1);
  });

  it("counts only ingredients confidently matched, as a fraction", () => {
    // 2 of 4 are exact registry names; the other 2 are absent.
    const overlap = registryOverlap(
      ["onion (yellow)", "tomato paste", "dragonfruit", "quokka meat"],
      REGISTRY
    );
    expect(overlap).toBeCloseTo(0.5, 5);
  });

  it("respects a tighter gate (stricter → fewer matches)", () => {
    // A fuzzy-but-not-exact query passes a loose gate but fails a very tight one.
    const looseGate = registryOverlap(["yellow onion"], REGISTRY, 0.6);
    const tightGate = registryOverlap(["yellow onion"], REGISTRY, 0.0001);
    expect(looseGate).toBeGreaterThan(tightGate);
  });

  it("exposes the default confidence gate constant", () => {
    expect(typeof CONFIDENT_MATCH_GATE).toBe("number");
    expect(CONFIDENT_MATCH_GATE).toBeGreaterThan(0);
  });
});

describe("activePrepMinutes", () => {
  it("sums active_minutes across steps", () => {
    const steps = [
      mkStep({ active_minutes: 5 }),
      mkStep({ active_minutes: 10 }),
      mkStep({ active_minutes: 2 }),
    ];
    expect(activePrepMinutes(steps)).toBe(17);
  });

  it("treats missing active_minutes as 0", () => {
    const steps = [mkStep({ active_minutes: 8 }), mkStep({})];
    expect(activePrepMinutes(steps)).toBe(8);
  });

  it("does NOT count passive_minutes as active", () => {
    const steps = [mkStep({ active_minutes: 3, passive_minutes: 40 })];
    expect(activePrepMinutes(steps)).toBe(3);
  });

  it("returns 0 for no steps", () => {
    expect(activePrepMinutes([])).toBe(0);
  });
});

describe("batchFit", () => {
  it("fits when recipe is batch_prep and most steps are batch-timed", () => {
    const steps = [
      mkStep({ timing: "batch" as RecipeStep["timing"] }),
      mkStep({ timing: "batch" as RecipeStep["timing"] }),
      mkStep({ timing: "just_in_time" as RecipeStep["timing"] }),
    ];
    const result = batchFit("batch_prep", steps);
    expect(result.fit).toBe(true);
    expect(result.batchStepRatio).toBeCloseTo(2 / 3, 5);
  });

  it("does not fit a meal with mostly just-in-time steps", () => {
    const steps = [
      mkStep({ timing: "just_in_time" as RecipeStep["timing"] }),
      mkStep({ timing: "just_in_time" as RecipeStep["timing"] }),
      mkStep({ timing: "batch" as RecipeStep["timing"] }),
    ];
    const result = batchFit("meal", steps);
    expect(result.fit).toBe(false);
    expect(result.batchStepRatio).toBeCloseTo(1 / 3, 5);
  });

  it("does not fit a batch_prep recipe whose steps are all just-in-time", () => {
    const steps = [
      mkStep({ timing: "just_in_time" as RecipeStep["timing"] }),
      mkStep({ timing: "just_in_time" as RecipeStep["timing"] }),
    ];
    const result = batchFit("batch_prep", steps);
    expect(result.fit).toBe(false);
    expect(result.batchStepRatio).toBe(0);
  });

  it("returns ratio 0 and no fit for zero steps", () => {
    const result = batchFit("batch_prep", []);
    expect(result.fit).toBe(false);
    expect(result.batchStepRatio).toBe(0);
  });
});

describe("macroEstimate", () => {
  it("is always flagged estimated (never authoritative, D-08)", () => {
    const est = macroEstimate([mkProduct("black beans", { protein_g: 0 })]);
    expect(est.estimated).toBe(true);
    expect(est.note.toLowerCase()).toContain("estimated");
  });

  it("documents that protein_g is 0 across the registry (soft, not a hard filter)", () => {
    const est = macroEstimate(REGISTRY);
    // All registry protein_g are 0 → the summed figure is 0, proving the
    // heuristic can't be a hard filter today.
    expect(est.proteinG).toBe(0);
    expect(est.note).toMatch(/hard filter|heuristic|soft/i);
  });

  it("sums protein_g when (hypothetically) present, still flagged estimated", () => {
    const est = macroEstimate([
      mkProduct("tofu", { protein_g: 8 }),
      mkProduct("edamame", { protein_g: 11 }),
    ]);
    expect(est.proteinG).toBe(19);
    expect(est.estimated).toBe(true);
  });
});
