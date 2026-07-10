/**
 * Wave-0 RED tests for the seeded GA scheduler (PREP-03/PREP-05). Encodes
 * the D-01a determinism contract, the DAG-precedence + resource-constraint
 * "no violations" invariant, the D-06 active-session-span primary
 * objective (Pitfall 1), and weight-vector sensitivity (PREP-05).
 * `genetic.ts` does not exist yet — this suite is EXPECTED to fail on
 * import until a later wave implements it.
 */
import { describe, it, expect } from "vitest";
import { scheduleWeek, computeActiveSessionSpan } from "./genetic";
import type { StepInstance, WeekGraph, Schedule, SchedulerConfig } from "./types";
import { StepType, type RecipeStep } from "../types";

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

function makeInstance(
  plannedMealId: string,
  step: RecipeStep,
  recipeName = "Recipe"
): StepInstance {
  return {
    id: `${plannedMealId}::${step.id}`,
    plannedMealId,
    step,
    recipeName,
  };
}

function baseConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
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
    ...overrides,
  };
}

function independentWeekGraph(): WeekGraph {
  const nodes: StepInstance[] = [
    makeInstance("meal-1", makeRecipeStep("chop-onion", { active_minutes: 5 }), "Soup"),
    makeInstance("meal-1", makeRecipeStep("chop-carrot", { active_minutes: 5 }), "Soup"),
    makeInstance("meal-2", makeRecipeStep("sear-chicken", { active_minutes: 8, resource: "stovetop" }), "Chicken"),
    makeInstance("meal-2", makeRecipeStep("bake-chicken", { active_minutes: 2, passive_minutes: 25, resource: "oven", oven_temp_f: 375 }), "Chicken"),
    makeInstance("meal-3", makeRecipeStep("blend-sauce", { active_minutes: 4, resource: "blender" }), "Sauce"),
  ];
  return { nodes, edges: [] };
}

describe("scheduleWeek — determinism (D-01a)", () => {
  it("determinism: fixed (seed, weights, plan) produces a byte-identical Schedule across two runs", () => {
    const graph = independentWeekGraph();
    const config = baseConfig();

    const schedule1 = scheduleWeek(graph, config);
    const schedule2 = scheduleWeek(graph, config);

    expect(schedule1).toEqual(schedule2);
  });
});

describe("scheduleWeek — no violations invariant", () => {
  it("no violations: output respects every precedence edge and never double-books the cook or a resource", () => {
    const chop = makeRecipeStep("chop-onion", { active_minutes: 5 });
    const bake = makeRecipeStep("bake-casserole", {
      active_minutes: 3,
      passive_minutes: 30,
      resource: "oven",
      oven_temp_f: 350,
    });
    const otherBake = makeRecipeStep("bake-bread", {
      active_minutes: 3,
      passive_minutes: 30,
      resource: "oven",
      oven_temp_f: 400,
    });

    const chopInstance = makeInstance("meal-1", chop, "Casserole");
    const bakeInstance = makeInstance("meal-1", bake, "Casserole");
    const otherBakeInstance = makeInstance("meal-2", otherBake, "Bread");

    const graph: WeekGraph = {
      nodes: [chopInstance, bakeInstance, otherBakeInstance],
      edges: [{ from: chopInstance.id, to: bakeInstance.id }],
    };
    const config = baseConfig();

    const schedule: Schedule = scheduleWeek(graph, config);

    // Precedence: chop must finish before bake starts.
    expect(schedule.starts.get(bakeInstance.id)!).toBeGreaterThanOrEqual(
      schedule.ends.get(chopInstance.id)!
    );

    // Cook exclusivity: no two instances' active windows may overlap.
    const activeWindows = schedule.order.map((instance) => {
      const start = schedule.starts.get(instance.id)!;
      return { start, end: start + instance.step.active_minutes! };
    });
    for (let i = 0; i < activeWindows.length; i++) {
      for (let j = i + 1; j < activeWindows.length; j++) {
        const a = activeWindows[i];
        const b = activeWindows[j];
        const overlaps = a.start < b.end && b.start < a.end;
        expect(overlaps).toBe(false);
      }
    }

    // Different-temp oven steps must never overlap regardless of rack capacity.
    const bakeStart = schedule.starts.get(bakeInstance.id)!;
    const bakeEnd = bakeStart + bake.active_minutes! + (bake.passive_minutes ?? 0);
    const otherBakeStart = schedule.starts.get(otherBakeInstance.id)!;
    const otherBakeEnd =
      otherBakeStart + otherBake.active_minutes! + (otherBake.passive_minutes ?? 0);
    const ovenOverlap = bakeStart < otherBakeEnd && otherBakeStart < bakeEnd;
    expect(ovenOverlap).toBe(false);
  });
});

describe("computeActiveSessionSpan — D-06 primary objective (Pitfall 1)", () => {
  it("scores a schedule that packs active work into passive windows better (lower span) than one that fully serializes active work", () => {
    const stepA = makeRecipeStep("a", { active_minutes: 10, passive_minutes: 20 });
    const stepB = makeRecipeStep("b", { active_minutes: 10, passive_minutes: 20 });
    const stepC = makeRecipeStep("c", { active_minutes: 10, passive_minutes: 20 });

    const instanceA = makeInstance("meal-1", stepA);
    const instanceB = makeInstance("meal-1", stepB);
    const instanceC = makeInstance("meal-1", stepC);

    // Packed: each next active burst starts as soon as the cook frees up
    // (right when the previous step's ACTIVE window ends), absorbing into
    // the previous steps' passive windows.
    const packed: Schedule = {
      order: [instanceA, instanceB, instanceC],
      starts: new Map([
        [instanceA.id, 0],
        [instanceB.id, 10],
        [instanceC.id, 20],
      ]),
      ends: new Map([
        [instanceA.id, 30],
        [instanceB.id, 40],
        [instanceC.id, 50],
      ]),
    };

    // Serialized: each step waits for the PRIOR step's full resource window
    // (active + passive) to finish before starting its own active work.
    const serialized: Schedule = {
      order: [instanceA, instanceB, instanceC],
      starts: new Map([
        [instanceA.id, 0],
        [instanceB.id, 30],
        [instanceC.id, 60],
      ]),
      ends: new Map([
        [instanceA.id, 30],
        [instanceB.id, 60],
        [instanceC.id, 90],
      ]),
    };

    const packedSpan = computeActiveSessionSpan(packed);
    const serializedSpan = computeActiveSessionSpan(serialized);

    expect(packedSpan).toBeLessThan(serializedSpan);
    // Sum of active_minutes is invariant under reordering (Pitfall 1) — the
    // span must NOT equal that constant sum for the packed case.
    expect(packedSpan).not.toBe(30);
  });
});

describe("scheduleWeek — weight-vector sensitivity (PREP-05)", () => {
  it("two different weight vectors can produce different orders for the same seed and plan", () => {
    const graph = independentWeekGraph();
    const configActiveHeavy = baseConfig({
      weights: { active: 1, chopping: 0, grouping: 0, elapsed: 0, resource_pressure: 0 },
    });
    const configResourceHeavy = baseConfig({
      weights: { active: 0, chopping: 0, grouping: 0, elapsed: 0, resource_pressure: 1 },
    });

    const scheduleA = scheduleWeek(graph, configActiveHeavy);
    const scheduleB = scheduleWeek(graph, configResourceHeavy);

    const orderIdsA = scheduleA.order.map((i) => i.id);
    const orderIdsB = scheduleB.order.map((i) => i.id);

    expect(orderIdsA).not.toEqual(orderIdsB);
  });
});
