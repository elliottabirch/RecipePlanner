/**
 * RED tests for the pure readiness-derivation helper (PREP-04, D-03,
 * 05-UI-SPEC.md Surface 1). AND-semantics per RESEARCH A4 — an assembly
 * step is "ready" only once EVERY upstream producer has been checked off in
 * `cook_progress`; otherwise it is "waiting" and lists each un-checked
 * upstream producer by StepInstance.id. A step with no upstream producers
 * is "ready" at t=0 (nothing to wait on). `readiness.ts` does not exist yet
 * — this suite is EXPECTED to fail on import until implemented.
 */
import { describe, it, expect } from "vitest";
import { deriveReadiness } from "./readiness";
import { StepType, type RecipeStep } from "../types";
import type { StepInstance, WeekGraph } from "./types";

function makeRecipeStep(id: string, overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: `Step ${id}`,
    step_type: StepType.Assembly,
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

describe("deriveReadiness — AND-semantics (RESEARCH A4)", () => {
  it("is 'waiting' listing each un-checked upstream producer, and 'ready' only once ALL are checked", () => {
    const consumer = makeInstance("meal-1", makeRecipeStep("consumer"));
    const producerA = makeInstance("meal-1", makeRecipeStep("producer-a"));
    const producerB = makeInstance("meal-1", makeRecipeStep("producer-b"));

    const weekGraph: WeekGraph = {
      nodes: [consumer, producerA, producerB],
      edges: [
        { from: producerA.id, to: consumer.id },
        { from: producerB.id, to: consumer.id },
      ],
    };

    // Neither producer checked yet — waiting on both.
    const noneChecked = deriveReadiness(consumer.id, weekGraph, new Set());
    expect(noneChecked.state).toBe("waiting");
    expect(noneChecked.waitingOn.sort()).toEqual(
      [producerA.id, producerB.id].sort()
    );

    // Only producer A checked — still waiting, only on B (AND-semantics: one
    // checked producer is not enough).
    const oneChecked = deriveReadiness(
      consumer.id,
      weekGraph,
      new Set([producerA.id])
    );
    expect(oneChecked.state).toBe("waiting");
    expect(oneChecked.waitingOn).toEqual([producerB.id]);

    // Both producers checked — ready, nothing left to wait on.
    const allChecked = deriveReadiness(
      consumer.id,
      weekGraph,
      new Set([producerA.id, producerB.id])
    );
    expect(allChecked.state).toBe("ready");
    expect(allChecked.waitingOn).toEqual([]);
  });

  it("is 'ready' at t=0 for a step with no upstream producers", () => {
    const standalone = makeInstance("meal-1", makeRecipeStep("standalone"));
    const weekGraph: WeekGraph = { nodes: [standalone], edges: [] };

    const result = deriveReadiness(standalone.id, weekGraph, new Set());
    expect(result.state).toBe("ready");
    expect(result.waitingOn).toEqual([]);
  });
});
