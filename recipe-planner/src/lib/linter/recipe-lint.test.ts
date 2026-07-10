import { describe, expect, it } from "vitest";
import { composeRecipeFindings } from "./recipe-lint";
import type { ProductExpanded } from "./index";
import type { RecipeStep } from "../types";
import { ProductType, StepType } from "../types";

function makeStep(partial: Partial<RecipeStep>): RecipeStep {
  return {
    id: "s1",
    created: "",
    updated: "",
    collectionId: "",
    collectionName: "recipe_steps",
    recipe: "r1",
    name: "step",
    step_type: StepType.Assembly,
    ...partial,
  } as RecipeStep;
}

function makeProduct(partial: Partial<ProductExpanded>): ProductExpanded {
  return {
    id: "p1",
    created: "",
    updated: "",
    collectionId: "",
    collectionName: "products",
    name: "product",
    type: ProductType.Raw,
    ...partial,
  } as ProductExpanded;
}

describe("composeRecipeFindings — step + product only, week excluded (D-06, IMP-07)", () => {
  it("surfaces a step-rule finding (missing-durations)", () => {
    const steps = [
      makeStep({ id: "s1", name: "Chop onions", active_minutes: undefined, passive_minutes: undefined }),
    ];
    const findings = composeRecipeFindings(steps, []);
    expect(findings.some((f) => f.rule === "missing-durations")).toBe(true);
  });

  it("surfaces a product-rule finding (missing-store-section)", () => {
    // non-transient, non-pantry product with no store => finding
    const products = [makeProduct({ id: "p1", name: "Carrots", type: ProductType.Raw })];
    const findings = composeRecipeFindings([], products);
    expect(findings.some((f) => f.rule === "missing-store-section")).toBe(true);
  });

  it("returns both step and product findings together", () => {
    const steps = [makeStep({ name: "Rest dough" })];
    const products = [makeProduct({ name: "Flour" })];
    const findings = composeRecipeFindings(steps, products);
    expect(findings.some((f) => f.rule === "missing-durations")).toBe(true);
    expect(findings.some((f) => f.rule === "missing-store-section")).toBe(true);
  });

  it("NEVER emits a week/pull-step finding for any input (Pitfall 4, T-06-03b)", () => {
    const steps = [makeStep({ name: "Reheat stored beans" })];
    const products = [makeProduct({ name: "Beans", type: ProductType.Stored })];
    const findings = composeRecipeFindings(steps, products);
    expect(findings.every((f) => f.rule !== "missing-pull-step")).toBe(true);
  });

  it("returns an empty array for clean input", () => {
    // a step with a duration and a pantry product with no store are both clean
    const steps = [makeStep({ name: "Combine", active_minutes: 5 })];
    const products = [makeProduct({ name: "Salt", pantry: true })];
    expect(composeRecipeFindings(steps, products)).toEqual([]);
  });
});
