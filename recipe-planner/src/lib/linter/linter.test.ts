import { describe, it, expect } from "vitest";
import { runLint, runWeekLint, type ProductExpanded, type LintFinding } from "./index";
import { SECTION_REQUIRED_STORES } from "./rules/missing-store-section";
import { lintMissingDurations } from "./rules/missing-durations";
import { lintMissingPrepAction } from "./rules/missing-prep-action";
import {
  lintMissingPullStep,
  type StoredInputConsumption,
} from "./rules/missing-pull-step";
import { ProductType, StepType } from "../types";
import type { Store, Section, RecipeStep } from "../types";
import type { StepInstance, WeekGraph } from "../scheduler/types";

function baseRecord(idSuffix: string) {
  return {
    id: `test-${idSuffix}`,
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    collectionId: "products",
    collectionName: "products",
  };
}

function makeStore(name: string): Store {
  return { ...baseRecord(`store-${name}`), name };
}

function makeSection(name: string): Section {
  return { ...baseRecord(`section-${name}`), name };
}

function makeProduct(overrides: Partial<ProductExpanded> = {}): ProductExpanded {
  return {
    ...baseRecord("product"),
    name: "test product",
    type: ProductType.Raw,
    pantry: false,
    canonical_unit: "each",
    expand: {
      store: makeStore("costco"),
    },
    nodes: [{ unit: "each" }],
    ...overrides,
  };
}

describe("cross-dimension rule", () => {
  it("flags a product whose node units span multiple dimensions", () => {
    const product = makeProduct({
      canonical_unit: undefined,
      nodes: [{ unit: "cup" }, { unit: "lb" }],
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(1);
  });

  it("flags a product whose node units are not convertible to its canonical_unit", () => {
    const product = makeProduct({
      canonical_unit: "cup",
      nodes: [{ unit: "lb" }],
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a product with consistent-dimension units convertible to canonical_unit", () => {
    const product = makeProduct({
      canonical_unit: "cup",
      nodes: [{ unit: "cup" }, { unit: "tbsp" }],
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("prep-words rule", () => {
  it("flags a raw product name containing a controlled prep verb", () => {
    const product = makeProduct({ type: ProductType.Raw, name: "onion sliced" });
    const findings = runLint([product]).filter((f: LintFinding) => f.rule === "prep-words");
    expect(findings).toHaveLength(1);
  });

  it("flags a raw product name with a (raw) suffix", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      name: "chicken breast (raw)",
    });
    const findings = runLint([product]).filter((f: LintFinding) => f.rule === "prep-words");
    expect(findings).toHaveLength(1);
  });

  it("does not flag a clean raw product name", () => {
    const product = makeProduct({ type: ProductType.Raw, name: "onion" });
    const findings = runLint([product]).filter((f: LintFinding) => f.rule === "prep-words");
    expect(findings).toHaveLength(0);
  });
});

describe("missing-store-section rule", () => {
  it("SECTION_REQUIRED_STORES contains only safeway", () => {
    expect([...SECTION_REQUIRED_STORES]).toEqual(["safeway"]);
  });

  it("flags a non-pantry, non-transient product with no store", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: {},
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(1);
  });

  it("flags a safeway product with no section", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("safeway") },
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a costco/trader joes/online product with no section", () => {
    const costco = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("costco") },
    });
    const traderJoes = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("trader joes") },
    });
    const online = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("online") },
    });
    const findings = runLint([costco, traderJoes, online]).filter(
      (f: LintFinding) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a safeway product that has a section", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("safeway"), section: makeSection("produce") },
    });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("missing-canonical-unit rule", () => {
  it("flags a non-pantry product with null canonical_unit", () => {
    const product = makeProduct({ pantry: false, canonical_unit: undefined });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "missing-canonical-unit"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a product with canonical_unit set", () => {
    const product = makeProduct({ pantry: false, canonical_unit: "each" });
    const findings = runLint([product]).filter(
      (f: LintFinding) => f.rule === "missing-canonical-unit"
    );
    expect(findings).toHaveLength(0);
  });
});

// ============================================================================
// PREP-06 (Wave 0 RED): linter v2 — missing-durations, missing-prep-action,
// missing-pull-step (week-scoped, D-07). `lintMissingDurations`,
// `lintMissingPrepAction`, `lintMissingPullStep`, and `runWeekLint` do not
// exist yet — these cases are EXPECTED to fail until a later wave (Plan 07)
// implements them.
// ============================================================================

function makeStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: "step-1",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Step",
    step_type: StepType.Prep,
    ...overrides,
  };
}

describe("missing-durations rule", () => {
  it("flags a step with both active_minutes and passive_minutes null", () => {
    const step = makeStep({ active_minutes: undefined, passive_minutes: undefined });
    const findings = lintMissingDurations([step]).filter(
      (f: LintFinding) => f.rule === "missing-durations"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a step with active_minutes populated", () => {
    const step = makeStep({ active_minutes: 10, passive_minutes: undefined });
    const findings = lintMissingDurations([step]).filter(
      (f: LintFinding) => f.rule === "missing-durations"
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a step with only passive_minutes populated", () => {
    const step = makeStep({ active_minutes: undefined, passive_minutes: 30 });
    const findings = lintMissingDurations([step]).filter(
      (f: LintFinding) => f.rule === "missing-durations"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("missing-prep-action rule", () => {
  it("flags a prep-type step whose prep_action is null", () => {
    const step = makeStep({ step_type: StepType.Prep, prep_action: undefined });
    const findings = lintMissingPrepAction([step]).filter(
      (f: LintFinding) => f.rule === "missing-prep-action"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a prep-type step with prep_action populated", () => {
    const step = makeStep({ step_type: StepType.Prep, prep_action: "diced" });
    const findings = lintMissingPrepAction([step]).filter(
      (f: LintFinding) => f.rule === "missing-prep-action"
    );
    expect(findings).toHaveLength(0);
  });

  it("ignores assembly steps regardless of prep_action", () => {
    const step = makeStep({ step_type: StepType.Assembly, prep_action: undefined });
    const findings = lintMissingPrepAction([step]).filter(
      (f: LintFinding) => f.rule === "missing-prep-action"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("missing-pull-step rule (week-scoped, D-07)", () => {
  function makeInstance(plannedMealId: string, stepId: string): StepInstance {
    return {
      id: `${plannedMealId}::${stepId}`,
      plannedMealId,
      step: makeStep({ id: stepId }),
      recipeName: "Recipe",
    };
  }

  it("flags a stored/inventory input consumed by an assembly step when NO recipe in the planned week produces it", () => {
    const assembleInstance = makeInstance("meal-a", "assemble-soup");
    const weekGraph: WeekGraph = {
      nodes: [assembleInstance],
      edges: [],
    };
    const consumedStoredInputs: StoredInputConsumption[] = [
      {
        consumerId: assembleInstance.id,
        productId: "chicken-stock",
        productName: "Chicken Stock",
        productType: ProductType.Stored,
        producedInPlan: false,
      },
    ];

    const findings = lintMissingPullStep(consumedStoredInputs).filter(
      (f: LintFinding) => f.rule === "missing-pull-step"
    );
    expect(findings).toHaveLength(1);

    const weekFindings = runWeekLint(weekGraph, consumedStoredInputs).filter(
      (f: LintFinding) => f.rule === "missing-pull-step"
    );
    expect(weekFindings).toHaveLength(1);
  });

  it("does not flag when another recipe in the planned week produces the stored input (cross-recipe reuse)", () => {
    const stockInstance = makeInstance("meal-b", "make-stock");
    const assembleInstance = makeInstance("meal-a", "assemble-soup");
    const weekGraph: WeekGraph = {
      nodes: [stockInstance, assembleInstance],
      edges: [{ from: stockInstance.id, to: assembleInstance.id }],
    };
    // Cross-recipe reuse is now expressed per-input: the collector marks this
    // consumption producedInPlan=true because another planned meal makes the
    // stock (formerly modeled by the week-graph edge; the producer check moved
    // per-input in 260718).
    const consumedStoredInputs: StoredInputConsumption[] = [
      {
        consumerId: assembleInstance.id,
        productId: "chicken-stock",
        productName: "Chicken Stock",
        productType: ProductType.Stored,
        producedInPlan: true,
      },
    ];

    const findings = lintMissingPullStep(consumedStoredInputs).filter(
      (f: LintFinding) => f.rule === "missing-pull-step"
    );
    expect(findings).toHaveLength(0);

    const weekFindings = runWeekLint(weekGraph, consumedStoredInputs).filter(
      (f: LintFinding) => f.rule === "missing-pull-step"
    );
    expect(weekFindings).toHaveLength(0);
  });
});

describe("fully-clean product", () => {
  it("produces zero findings across all rules", () => {
    const product = makeProduct({
      name: "onion",
      type: ProductType.Raw,
      pantry: false,
      canonical_unit: "each",
      expand: { store: makeStore("costco") },
      nodes: [{ unit: "each" }],
    });
    expect(runLint([product])).toHaveLength(0);
  });
});
