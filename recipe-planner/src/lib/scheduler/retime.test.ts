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
    //
    // 260717-25d NOTE: this test passes `actualElapsed = 35` — the bake's
    // FULL estimate (5 active + 30 passive) — which is what a full-LIST
    // check-off records. That is the path the old passive-collapse formula
    // was actually correct on (`actualElapsed - activeOcc` reduces to
    // `estPassive`), so this test alone could not (and did not) catch the
    // Now-card bug below, where `actualElapsed` is active-only. Left
    // unmodified — it still pins real, correct behaviour on the full-list
    // path.
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

  it("260717-25d: a PROMPT check-off of Simmer bourguignon (8a/35p, real prod shape) is a no-op — it still ends at 43 and its dependent still starts at 43, not 8 (the todo's own regression case)", () => {
    // Real prod durations (planning_findings #10), verified read-only against
    // recipe 5t10ugwgxb166ll on 2026-07-17: `Simmer bourguignon` 8a/35p
    // stovetop, `Serve over noodles` 3a/0p. This is a SYNTHETIC arrangement
    // of real durations, not a replay of the real week graph — in the real
    // week graph both are just_in_time and excluded from the week graph
    // entirely (week-graph.ts:158). The precedence edge here stands in for
    // that relationship so the dependent-collapse symptom is exercisable.
    //
    // This exercises the `actualElapsed <= estActive` path — a PROMPT
    // check-off (elapsed=8, the hands-on work only) — which
    // retime.test.ts:146 above never touches (it passes the full 35-minute
    // estimate, the full-list path that already worked). Under the OLD
    // formula this test fails: both assertions below read 8, not 43.
    const simmer = makeInstance(
      "meal-1",
      makeRecipeStep("simmer-bourguignon", {
        resource: "stovetop",
        active_minutes: 8,
        passive_minutes: 35,
      })
    );
    const serve = makeInstance(
      "meal-1",
      makeRecipeStep("serve-over-noodles", {
        resource: "none",
        active_minutes: 3,
        passive_minutes: 0,
      })
    );
    const edges = [{ from: simmer.id, to: serve.id }];
    const config = baseConfig();
    const fixedOrder = [simmer, serve];

    const baseline = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config, edges);
    expect(baseline.ends.get(simmer.id)).toBe(43);
    expect(baseline.starts.get(serve.id)).toBe(43);

    // Prompt check-off: hands-on work (8 min) is done, the pot is simmering.
    const afterCheckoff = retimeSchedule(
      fixedOrder,
      new Map([[simmer.id, 8]]),
      emptyTimeline(),
      config,
      edges
    );
    expect(afterCheckoff.ends.get(simmer.id)).toBe(43);
    expect(afterCheckoff.starts.get(serve.id)).toBe(43);
  });

  it("260717-25d: THE PHANTOM-BURNER TEST — a prompt check-off must not free a burner the pot is still physically sitting on, even with NO precedence edge at all (the finding the todo missed)", () => {
    // Real prod durations (planning_findings #10): `Simmer bourguignon`
    // 8a/35p stovetop and `Brown mushrooms` 12a/0p stovetop, `burner_count:
    // 1`. Deliberately NO precedence edge between them — this is what proves
    // the defect is about RESOURCE OCCUPANCY, not precedence: `resources.ts`
    // (`isFeasibleAt`, the stovetop branch) meters stovetop across a step's
    // FULL active+passive window because a simmering pot still physically
    // occupies its burner. Collapsing the simmer's passive window lies to
    // that model and lets the scheduler place a second pot on an occupied
    // burner — a PHYSICALLY IMPOSSIBLE schedule, not merely a wrong time.
    // Synthetic arrangement of real durations, not a replay of the real week
    // (both steps are just_in_time there and excluded from the week graph;
    // in the real week graph `Brown mushrooms -> Simmer bourguignon` is
    // actually the edge, in the opposite direction from this fixture).
    const simmer = makeInstance(
      "meal-1",
      makeRecipeStep("simmer-bourguignon", {
        resource: "stovetop",
        active_minutes: 8,
        passive_minutes: 35,
      })
    );
    const mushrooms = makeInstance(
      "meal-1",
      makeRecipeStep("brown-mushrooms", {
        resource: "stovetop",
        active_minutes: 12,
        passive_minutes: 0,
      })
    );
    const fixedOrder = [simmer, mushrooms];
    const config: SchedulerConfig = { ...baseConfig(), burner_count: 1 };

    // Baseline: with one burner and no edge, mushrooms still can't start
    // until the simmer's burner frees at 43 (its full active+passive span).
    const baseline = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config, []);
    expect(baseline.starts.get(mushrooms.id)).toBe(43);

    // Prompt check-off of the simmer at elapsed=8 (hands-on done, pot still
    // simmering). mushrooms must NOT move earlier — the burner is not free.
    // Under the bug, the simmer's footprint collapses to [0,8), the burner
    // reads free at t=8, and mushrooms starts at 8 — 35 minutes before the
    // bourguignon pot actually comes off the stove.
    const afterCheckoff = retimeSchedule(
      fixedOrder,
      new Map([[simmer.id, 8]]),
      emptyTimeline(),
      config,
      []
    );
    expect(afterCheckoff.starts.get(mushrooms.id)).toBe(43);
  });

  it("260717-25d: genuine overrun absorption survives the fix — a simmer that really took 50 minutes still ends at 50, not 43 (the floor is a floor, not a pin)", () => {
    const simmer = makeInstance(
      "meal-1",
      makeRecipeStep("simmer-bourguignon", {
        resource: "stovetop",
        active_minutes: 8,
        passive_minutes: 35,
      })
    );
    const config = baseConfig();
    const fixedOrder = [simmer];

    // The cook spent 42 real minutes hands-on-and-simmering past the "Now"
    // anchor — an active overrun well past the 8-minute estimate, but the
    // pot really did simmer the full 35 (passiveOcc = max(35, 42) = 42).
    const retimed = retimeSchedule(
      fixedOrder,
      new Map([[simmer.id, 50]]),
      emptyTimeline(),
      config,
      []
    );
    expect(retimed.ends.get(simmer.id)).toBe(50);
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
