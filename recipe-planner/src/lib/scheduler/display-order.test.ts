/**
 * Tests for the frozen display-order helpers (PREP-04, D-01a.3, 260717-25d).
 * This is the todo's own requested test ("cook-mode-list-shuffles-on-checkoff"),
 * made possible without any jsdom/component-test infrastructure by extracting
 * the sort + freeze into a React-free module (`readiness.ts` precedent).
 *
 * The main fixture below is the RESIDUAL shuffle — the one that survives the
 * passive-collapse fix (260717-25d Task 1) and needs a genuine overrun to
 * reproduce (planning_findings #5). It is NOT redundant with Task 1: with no
 * passive phase anywhere, a single-cook resource makes starts monotone in
 * `fixedOrder` and the sort provably cannot permute (planning_findings #6) —
 * crossings are reachable ONLY through passive windows, which is exactly why
 * this fixture uses a passive step and a real overrun rather than an
 * on-time check-off.
 */
import { describe, it, expect } from "vitest";
import { freezeDisplayOrder, applyDisplayOrder } from "./display-order";
import { retimeSchedule } from "./retime";
import type {
  ResourceTimeline,
  StepInstance,
  SchedulerConfig,
  Schedule,
  WeekGraphEdge,
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
    active_minutes: 5,
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

/** Build a Schedule directly from explicit start offsets, bypassing the
 * resource-feasibility model entirely — `freezeDisplayOrder`/
 * `applyDisplayOrder` are pure functions of `Schedule.order`/`starts`, so
 * hand-built fixtures are the simplest way to pin sort-tie-break and
 * absent-id edge cases that don't need real resource placement. */
function makeSchedule(
  entries: Array<{ instance: StepInstance; start: number; end: number }>
): Schedule {
  return {
    order: entries.map((e) => e.instance),
    starts: new Map(entries.map((e) => [e.instance.id, e.start])),
    ends: new Map(entries.map((e) => [e.instance.id, e.end])),
  };
}

describe("freezeDisplayOrder / applyDisplayOrder — the frozen display order (260717-25d)", () => {
  it("THE RESIDUAL SHUFFLE — survives the passive-collapse fix: a genuine overrun (bake 5a/2p -> 40) crosses Dep and Indep, but applyDisplayOrder holds the frozen order while the times keep moving", () => {
    // Topological fixedOrder [Bake, Dep, Indep] with a REAL Bake -> Dep edge;
    // Indep has no edge to either. bake is 5a/2p — a passive window is what
    // decouples Indep from Dep and lets them cross (planning_findings #6);
    // the brief's 5a/30p variant does NOT cross and would make this test
    // pass vacuously, so 5a/2p is used per planning_findings #5.
    const bake = makeInstance(
      "meal-1",
      makeRecipeStep("bake", { active_minutes: 5, passive_minutes: 2 })
    );
    const dep = makeInstance(
      "meal-1",
      makeRecipeStep("dep", { active_minutes: 5, passive_minutes: 0 })
    );
    const indep = makeInstance(
      "meal-1",
      makeRecipeStep("indep", { active_minutes: 5, passive_minutes: 0 })
    );
    const fixedOrder = [bake, dep, indep];
    const edges: WeekGraphEdge[] = [{ from: bake.id, to: dep.id }];
    const config = baseConfig();

    // Generation-time schedule: baseline starts are Bake@0, Dep@7, Indep@12
    // (Dep waits for bake's FULL end — active+passive — per the precedence
    // rule; Indep has no edge and packs in wherever the cook is free).
    const generated = retimeSchedule(fixedOrder, new Map(), emptyTimeline(), config, edges);
    expect(generated.starts.get(bake.id)).toBe(0);
    expect(generated.starts.get(dep.id)).toBe(7);
    expect(generated.starts.get(indep.id)).toBe(12);

    // Freeze happens once, at generation.
    const frozen = freezeDisplayOrder(generated);
    expect(frozen).toEqual([bake.id, dep.id, indep.id]);

    // A genuine overrun: the bake really took 40 minutes (measured elapsed
    // from the "Now" anchor), not the 7-minute estimate.
    const retimed = retimeSchedule(
      fixedOrder,
      new Map([[bake.id, 40]]),
      emptyTimeline(),
      config,
      edges
    );

    // The crossing is REAL — assert it before asserting the fix holds, or
    // this test would pass vacuously (the exact way the original bug's own
    // test, retime.test.ts:146, kept passing without exercising the bug).
    const reSortedByLiveStarts = freezeDisplayOrder(retimed);
    expect(reSortedByLiveStarts).not.toEqual(frozen);
    expect(reSortedByLiveStarts).toEqual([bake.id, indep.id, dep.id]);

    // The FIX: applying the frozen order to the retimed schedule holds the
    // original sequence — Bake, Dep, Indep — even though live starts crossed.
    expect(applyDisplayOrder(retimed, frozen).map((i) => i.id)).toEqual([
      bake.id,
      dep.id,
      indep.id,
    ]);

    // Times DID move — the clock adapts even though the sequence didn't.
    expect(retimed.starts.get(dep.id)).toBe(40);
    expect(retimed.starts.get(dep.id)).not.toBe(generated.starts.get(dep.id));
  });

  it("tie-break: two steps with the identical start time keep their activity-list order", () => {
    const a = makeInstance("meal-1", makeRecipeStep("a"));
    const b = makeInstance("meal-1", makeRecipeStep("b"));
    // Activity-list order is [b, a] — both start at the same clock time (a
    // hand-built fixture; real resource placement can't produce two active
    // windows overlapping the same cook, so this pins the tie-break rule in
    // isolation).
    const schedule = makeSchedule([
      { instance: b, start: 0, end: 5 },
      { instance: a, start: 0, end: 5 },
    ]);

    const frozen = freezeDisplayOrder(schedule);
    // Sort key is (start, then activity-list index) — both start at 0, so
    // the activity-list index (b=0, a=1) decides: b before a.
    expect(frozen).toEqual([b.id, a.id]);
  });

  it("absent id: a step missing from the frozen order is appended at the end and is NEVER dropped; known steps' relative order is untouched", () => {
    const known1 = makeInstance("meal-1", makeRecipeStep("known-1"));
    const known2 = makeInstance("meal-1", makeRecipeStep("known-2"));
    const unknown = makeInstance("meal-1", makeRecipeStep("unknown"));

    // frozenIds only knows about known-1/known-2 — `unknown` was never part
    // of the frozen generation (can't happen without a regenerate today, but
    // must degrade deterministically if it ever does).
    const frozen = [known1.id, known2.id];
    const schedule = makeSchedule([
      { instance: unknown, start: 0, end: 5 }, // earliest live start
      { instance: known1, start: 5, end: 10 },
      { instance: known2, start: 10, end: 15 },
    ]);

    const applied = applyDisplayOrder(schedule, frozen).map((i) => i.id);
    // Known steps keep the frozen relative order; unknown is appended at the
    // end rather than sorting by its (earlier) live start — degrade one
    // step, never re-sort the list.
    expect(applied).toEqual([known1.id, known2.id, unknown.id]);
    expect(applied).toContain(unknown.id); // never dropped
  });

  it("filtering preserves relative order — the visibleOrder/Now-Next contract", () => {
    const one = makeInstance("meal-1", makeRecipeStep("one"));
    const two = makeInstance("meal-1", makeRecipeStep("two"));
    const three = makeInstance("meal-1", makeRecipeStep("three"));
    const schedule = makeSchedule([
      { instance: one, start: 0, end: 5 },
      { instance: two, start: 5, end: 10 },
      { instance: three, start: 10, end: 15 },
    ]);
    const frozen = [one.id, two.id, three.id];

    const ordered = applyDisplayOrder(schedule, frozen);
    // Filtering out a checked-off step (Array.filter preserves relative
    // order) must not disturb the sequence of what remains.
    const checkedIds = new Set([two.id]);
    const visible = ordered.filter((inst) => !checkedIds.has(inst.id));
    expect(visible.map((i) => i.id)).toEqual([one.id, three.id]);
  });
});
