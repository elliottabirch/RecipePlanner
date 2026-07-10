/**
 * Wave-0 RED tests for the resource-feasibility model (PREP-03, D-05).
 * Encodes 05-RESEARCH.md Pattern 2's `isFeasibleAt` contract: the implicit
 * singleton "cook" resource (active-only), oven same-temp-only + rack_slots
 * capacity (Pitfall 2), stovetop burner_count capacity, and singleton
 * appliance (capacity 1) rules. `resources.ts` does not exist yet — this
 * suite is EXPECTED to fail on import until a later wave implements it.
 */
import { describe, it, expect } from "vitest";
import { isFeasibleAt } from "./resources";
import type { ResourceTimeline } from "./types";
import { StepType, type RecipeStep } from "../types";

function emptyTimeline(): ResourceTimeline {
  return {
    cookBusy: [],
    ovenUsage: [],
    activeBurners: [],
    singletonAppliances: { blender: [], food_processor: [], instant_pot: [] },
  };
}

function makeStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: "step-1",
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Step",
    step_type: StepType.Prep,
    active_minutes: 10,
    passive_minutes: 0,
    resource: "none",
    rack_slots: 1,
    ...overrides,
  };
}

describe("isFeasibleAt — implicit singleton cook resource", () => {
  it("rejects a candidate whose active window overlaps another step's active (cook-busy) window", () => {
    const timeline = emptyTimeline();
    timeline.cookBusy.push({ start: 0, end: 10 });

    const step = makeStep({ active_minutes: 10, passive_minutes: 0 });
    // candidate start 5 -> active window [5, 15) overlaps existing [0, 10)
    expect(isFeasibleAt(5, step, timeline, { ovenRackSlots: 2, burnerCount: 4 })).toBe(false);
  });

  it("accepts a candidate whose active window falls inside another step's PASSIVE-only window (passive absorbs active)", () => {
    const timeline = emptyTimeline();
    // A prior oven step: active [0,5) cook-busy, then passive-only [5,30) oven-busy, no cook.
    timeline.cookBusy.push({ start: 0, end: 5 });
    timeline.ovenUsage.push({ start: 0, end: 30, tempF: 350, rackSlots: 1 });

    // A new stovetop step, cook-active only, starting at 10 (inside the prior
    // step's passive oven window, but after cook frees up at 5).
    const step = makeStep({ active_minutes: 10, passive_minutes: 0, resource: "stovetop" });
    expect(isFeasibleAt(10, step, timeline, { ovenRackSlots: 2, burnerCount: 4 })).toBe(true);
  });
});

describe("isFeasibleAt — oven temperature-conflict rule (Pitfall 2)", () => {
  it("rejects two different-temperature oven steps overlapping regardless of rack capacity", () => {
    const timeline = emptyTimeline();
    timeline.ovenUsage.push({ start: 0, end: 30, tempF: 350, rackSlots: 1 });

    const step = makeStep({
      active_minutes: 0,
      passive_minutes: 20,
      resource: "oven",
      oven_temp_f: 400,
      rack_slots: 1,
    });
    // ample rack capacity, but temp differs -> must still be infeasible
    expect(isFeasibleAt(10, step, timeline, { ovenRackSlots: 4, burnerCount: 4 })).toBe(false);
  });

  it("enforces oven rack_slots capacity at equal temperature", () => {
    const timeline = emptyTimeline();
    timeline.ovenUsage.push({ start: 0, end: 30, tempF: 350, rackSlots: 2 });

    const step = makeStep({
      active_minutes: 0,
      passive_minutes: 10,
      resource: "oven",
      oven_temp_f: 350,
      rack_slots: 1,
    });

    // total would be 2 + 1 = 3 > capacity 2 -> infeasible
    expect(isFeasibleAt(5, step, timeline, { ovenRackSlots: 2, burnerCount: 4 })).toBe(false);
    // capacity 3 is enough -> feasible
    expect(isFeasibleAt(5, step, timeline, { ovenRackSlots: 3, burnerCount: 4 })).toBe(true);
  });
});

describe("isFeasibleAt — stovetop burner_count capacity", () => {
  it("rejects a candidate that would exceed the configured burner count", () => {
    const timeline = emptyTimeline();
    timeline.activeBurners.push({ start: 0, end: 20 }, { start: 0, end: 20 });

    const step = makeStep({ active_minutes: 10, passive_minutes: 0, resource: "stovetop" });

    expect(isFeasibleAt(5, step, timeline, { ovenRackSlots: 2, burnerCount: 2 })).toBe(false);
    expect(isFeasibleAt(5, step, timeline, { ovenRackSlots: 2, burnerCount: 3 })).toBe(true);
  });
});

describe("isFeasibleAt — singleton appliance capacity 1", () => {
  it("rejects a candidate overlapping an already-busy singleton appliance", () => {
    const timeline = emptyTimeline();
    timeline.singletonAppliances.blender.push({ start: 0, end: 10 });

    const step = makeStep({ active_minutes: 5, passive_minutes: 0, resource: "blender" });

    expect(isFeasibleAt(3, step, timeline, { ovenRackSlots: 2, burnerCount: 4 })).toBe(false);
    // starts exactly when the busy window ends -> no overlap -> feasible
    expect(isFeasibleAt(10, step, timeline, { ovenRackSlots: 2, burnerCount: 4 })).toBe(true);
  });
});
