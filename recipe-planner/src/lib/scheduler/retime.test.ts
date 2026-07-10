/**
 * Wave-0 RED tests for the check-off recompute path (PREP-04, D-01a.3).
 * "Order is authoritative, the clock adapts": a late actual completion
 * shifts downstream start/end times by the delta, but must never permute
 * the fixed order (05-RESEARCH.md Pattern 3). `retime.ts` does not exist
 * yet — this suite is EXPECTED to fail on import until a later wave
 * implements it.
 */
import { describe, it, expect } from "vitest";
import { retimeSchedule } from "./retime";
import type { ResourceTimeline, StepInstance, SchedulerConfig } from "./types";
import { StepType, type RecipeStep } from "../types";

function emptyTimeline(): ResourceTimeline {
  return {
    cookBusy: [],
    ovenUsage: [],
    activeBurners: [],
    singletonAppliances: { blender: [], food_processor: [], instant_pot: [] },
  };
}

function makeRecipeStep(id: string, overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: `Step ${id}`,
    step_type: StepType.Prep,
    active_minutes: 10,
    passive_minutes: 0,
    resource: "none",
    rack_slots: 1,
    ...overrides,
  };
}

function makeInstance(plannedMealId: string, step: RecipeStep): StepInstance {
  return {
    id: `${plannedMealId}::${step.id}`,
    plannedMealId,
    step,
    recipeName: "Recipe",
  };
}

function baseConfig(): SchedulerConfig {
  return {
    id: "scheduler-config",
    created: "",
    updated: "",
    collectionId: "scheduler_config",
    collectionName: "scheduler_config",
    seed: 42,
    weights: { active: 1, chopping: 0, grouping: 0, elapsed: 0, resource_pressure: 0 },
    burner_count: 4,
    oven_rack_slots: 2,
    appliances: [],
  };
}

describe("retimeSchedule — order-preserving recompute (D-01a.3)", () => {
  it("shifts downstream starts by the delta from a late actual completion, without reordering the fixed order", () => {
    const instanceA = makeInstance("meal-1", makeRecipeStep("a"));
    const instanceB = makeInstance("meal-1", makeRecipeStep("b"));
    const instanceC = makeInstance("meal-1", makeRecipeStep("c"));
    const fixedOrder: StepInstance[] = [instanceA, instanceB, instanceC];
    const config = baseConfig();

    // Baseline: no actual completions yet, everything uses estimates. The
    // single-cook resource forces these three active-only steps sequential.
    const baseline = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config);

    // A actually took 20 minutes (estimate was 10) — a 10-minute delay.
    const actualCompletions = new Map<string, number>([[instanceA.id, 20]]);
    const retimed = retimeSchedule(fixedOrder, actualCompletions, emptyTimeline(), config);

    // Order array is never permuted.
    expect(retimed.order.map((i) => i.id)).toEqual(fixedOrder.map((i) => i.id));

    const delta = 10;
    expect(retimed.starts.get(instanceB.id)!).toBe(
      baseline.starts.get(instanceB.id)! + delta
    );
    expect(retimed.ends.get(instanceB.id)!).toBe(
      baseline.ends.get(instanceB.id)! + delta
    );
    expect(retimed.starts.get(instanceC.id)!).toBe(
      baseline.starts.get(instanceC.id)! + delta
    );
    expect(retimed.ends.get(instanceC.id)!).toBe(
      baseline.ends.get(instanceC.id)! + delta
    );
  });
});
