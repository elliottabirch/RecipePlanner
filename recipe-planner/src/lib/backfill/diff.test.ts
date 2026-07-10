import { describe, it, expect } from "vitest";
import { computeBackfillWriteSet, type BackfillDraftEntry } from "./diff";
import type { RecipeStep } from "../types";

function makeStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: "step1",
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe1",
    name: "Dice onion",
    step_type: "prep" as RecipeStep["step_type"],
    active_minutes: undefined,
    passive_minutes: undefined,
    instructions: undefined,
    prep_action: undefined,
    resource: undefined,
    oven_temp_f: undefined,
    rack_slots: undefined,
    ...overrides,
  } as RecipeStep;
}

function makeDraft(overrides: Partial<BackfillDraftEntry> = {}): BackfillDraftEntry {
  return {
    active_minutes: 5,
    passive_minutes: 0,
    instructions: "Dice the onion.",
    prep_action: "diced",
    resource: "none",
    oven_temp_f: null,
    rack_slots: 1,
    ...overrides,
  };
}

describe("computeBackfillWriteSet", () => {
  it("excludes a step that is already fully populated (idempotency)", () => {
    const step = makeStep({
      active_minutes: 5,
      passive_minutes: 0,
      instructions: "Dice the onion.",
      prep_action: "diced",
      resource: "none",
      oven_temp_f: null as unknown as number,
      rack_slots: 1,
    });
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: {
        active_minutes: { status: "accept" as const },
        passive_minutes: { status: "accept" as const },
        instructions: { status: "accept" as const },
        prep_action: { status: "accept" as const },
        resource: { status: "accept" as const },
        rack_slots: { status: "accept" as const },
      },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet).toEqual({});
    expect(writeSet.step1).toBeUndefined();
  });

  it("includes only accepted fields for a step still missing fields", () => {
    const step = makeStep(); // all target fields undefined -> missing
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: {
        active_minutes: { status: "accept" as const },
        instructions: { status: "accept" as const },
        // passive_minutes, prep_action, resource, rack_slots left undecided
      },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet.step1).toEqual({
      active_minutes: 5,
      instructions: "Dice the onion.",
    });
  });

  it("uses the edited value (not the draft value) when a field was edited before accept", () => {
    const step = makeStep();
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: {
        active_minutes: { status: "edit" as const, value: 12 },
      },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet.step1).toEqual({ active_minutes: 12 });
  });

  it("omits a rejected field from the write-set", () => {
    const step = makeStep();
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: {
        active_minutes: { status: "accept" as const },
        instructions: { status: "reject" as const },
      },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet.step1).toEqual({ active_minutes: 5 });
    expect(writeSet.step1.instructions).toBeUndefined();
  });
});
