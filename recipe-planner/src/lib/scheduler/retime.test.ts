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
import { generateSchedule } from "./genetic";
import type {
  ResourceTimeline,
  StepInstance,
  SchedulerConfig,
  Schedule,
  WeekGraph,
} from "./types";
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
    const baseline: Schedule = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config);

    // A actually took 20 minutes (estimate was 10) — a 10-minute delay.
    const actualCompletions = new Map<string, number>([[instanceA.id, 20]]);
    const retimed: Schedule = retimeSchedule(fixedOrder, actualCompletions, emptyTimeline(), config);

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

  it("preserves parallelism — an independent step packs into another step's passive window instead of waiting for its full end", () => {
    // A 5-active/30-passive oven bake, then an independent hands-on step with
    // NO precedence edge between them.
    const bake = makeInstance(
      "meal-1",
      makeRecipeStep("bake", { resource: "oven", oven_temp_f: 400, active_minutes: 5, passive_minutes: 30, rack_slots: 1 })
    );
    const indep = makeInstance(
      "meal-1",
      makeRecipeStep("indep", { resource: "none", active_minutes: 10, passive_minutes: 0 })
    );
    const schedule = retimeSchedule([bake, indep], new Map(), emptyTimeline(), baseConfig(), []);

    // Bake occupies the cook only during its 5-min active window; its 30-min
    // passive [5,35) leaves the cook free. The independent step must start at 5
    // (right after the bake's active window), DEEP inside the passive window —
    // not at 35 (which the old serial retime produced by waiting the full end).
    expect(schedule.starts.get(bake.id)).toBe(0);
    expect(schedule.starts.get(indep.id)).toBe(5);
    expect(schedule.starts.get(indep.id)!).toBeLessThan(schedule.ends.get(bake.id)!);
  });

  it("respects precedence — a dependent step waits for its predecessor's FULL end (active + passive)", () => {
    const bake = makeInstance(
      "meal-1",
      makeRecipeStep("bake", { resource: "oven", oven_temp_f: 400, active_minutes: 5, passive_minutes: 30, rack_slots: 1 })
    );
    const dep = makeInstance(
      "meal-1",
      makeRecipeStep("dep", { resource: "none", active_minutes: 5, passive_minutes: 0 })
    );
    // dep consumes bake's output — a real precedence edge.
    const edges = [{ from: bake.id, to: dep.id }];
    const schedule = retimeSchedule([bake, dep], new Map(), emptyTimeline(), baseConfig(), edges);

    // With the edge, dep cannot pack into the passive window — it waits for the
    // bake's full end (5 active + 30 passive = 35).
    expect(schedule.starts.get(dep.id)).toBe(35);
  });

  it("checking off a passive step on-time does NOT move a step packed into its passive window (the first-check-off reshuffle)", () => {
    // Reproduces the user-reported bug: an oven bake (5 active / 30 passive)
    // with an independent hands-on step packed into its passive window. The
    // Full Schedule shows [bake@0, indep@5]. Checking off the bake with its
    // estimated duration (what a full-list check-off records) must NOT shove
    // indep to 35 — the cook is free during the bake's passive window.
    const bake = makeInstance(
      "meal-1",
      makeRecipeStep("bake", { resource: "oven", oven_temp_f: 400, active_minutes: 5, passive_minutes: 30, rack_slots: 1 })
    );
    const indep = makeInstance(
      "meal-1",
      makeRecipeStep("indep", { resource: "none", active_minutes: 10, passive_minutes: 0 })
    );
    const fixedOrder = [bake, indep];
    const config = baseConfig();

    const before = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config, []);
    expect(before.starts.get(indep.id)).toBe(5);

    // Check off the bake with its full estimated duration (5 + 30 = 35).
    const after = retimeSchedule(fixedOrder, new Map([[bake.id, 35]]), emptyTimeline(), config, []);
    expect(after.starts.get(bake.id)).toBe(0);
    // indep must stay at 5 — checking off a passive step does not busy the cook
    // through its passive window.
    expect(after.starts.get(indep.id)).toBe(5);
  });

  it("reproduces generateSchedule's start times exactly with no completions — the no-first-check-off-reshuffle guarantee", () => {
    const bake = makeInstance(
      "meal-1",
      makeRecipeStep("bake", { resource: "oven", oven_temp_f: 400, active_minutes: 5, passive_minutes: 30, rack_slots: 1 })
    );
    const indep = makeInstance(
      "meal-1",
      makeRecipeStep("indep", { resource: "none", active_minutes: 10, passive_minutes: 0 })
    );
    const dep = makeInstance(
      "meal-1",
      makeRecipeStep("dep", { resource: "none", active_minutes: 5, passive_minutes: 0 })
    );
    const weekGraph: WeekGraph = {
      nodes: [bake, indep, dep],
      edges: [{ from: bake.id, to: dep.id }],
    };
    const config = baseConfig();

    const generated = generateSchedule(weekGraph, config);
    // First check-off (before any real completion) recomputes via retime over
    // the GA's own order + edges. If retime's timing diverges from the decode,
    // the clock-ordered list reshuffles. It must be identical.
    const retimed = retimeSchedule(generated.order, new Map(), emptyTimeline(), config, weekGraph.edges);

    for (const instance of generated.order) {
      expect(retimed.starts.get(instance.id)).toBe(generated.starts.get(instance.id));
      expect(retimed.ends.get(instance.id)).toBe(generated.ends.get(instance.id));
    }
  });
});
