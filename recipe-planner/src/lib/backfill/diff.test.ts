import { describe, it, expect } from "vitest";
import {
  computeBackfillWriteSet,
  isStepUnbackfilled,
  type BackfillDraftEntry,
} from "./diff";
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

  // Regression: PocketBase stores un-set number fields as 0 and text/select as
  // "" (not null). A step at those defaults must still be treated as needing
  // backfill, not "already populated" (the "all caught up" bug).
  it("treats a step at PocketBase defaults (0 / empty string) as needing backfill", () => {
    const step = makeStep({
      active_minutes: 0,
      passive_minutes: 0,
      instructions: "",
      prep_action: "",
      resource: "" as RecipeStep["resource"],
      oven_temp_f: 0,
      rack_slots: 0,
    });
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: {
        active_minutes: { status: "accept" as const },
        instructions: { status: "accept" as const },
      },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet.step1).toEqual({
      active_minutes: 5,
      instructions: "Dice the onion.",
    });
  });

  it("excludes a step once it carries any real metadata (idempotent after a partial save)", () => {
    // passive_minutes set to a real value; everything else still at PB default
    const step = makeStep({
      active_minutes: 0,
      passive_minutes: 120,
      instructions: "",
      prep_action: "",
      resource: "" as RecipeStep["resource"],
      oven_temp_f: 0,
    });
    const draft = { step1: makeDraft() };
    const decisions = {
      step1: { instructions: { status: "accept" as const } },
    };

    const writeSet = computeBackfillWriteSet(draft, [step], decisions);

    expect(writeSet).toEqual({});
  });
});

describe("isStepUnbackfilled", () => {
  it("is true for a step at PocketBase defaults", () => {
    expect(
      isStepUnbackfilled(
        makeStep({
          active_minutes: 0,
          passive_minutes: 0,
          instructions: "",
          prep_action: "",
          resource: "" as RecipeStep["resource"],
          oven_temp_f: 0,
          rack_slots: 0,
        })
      )
    ).toBe(true);
  });

  it("is true for a step with all null/undefined fields", () => {
    expect(isStepUnbackfilled(makeStep())).toBe(true);
  });

  it("is false once any duration/instruction/prep/resource field is meaningful", () => {
    expect(isStepUnbackfilled(makeStep({ passive_minutes: 120 }))).toBe(false);
    expect(isStepUnbackfilled(makeStep({ instructions: "whisk 3:1" }))).toBe(false);
    expect(isStepUnbackfilled(makeStep({ resource: "oven" as RecipeStep["resource"] }))).toBe(false);
    expect(isStepUnbackfilled(makeStep({ prep_action: "diced" }))).toBe(false);
  });

  it("ignores rack_slots as a standalone signal (its backfilled default of 1)", () => {
    // whitespace-only instructions and rack_slots=1 alone do not count as backfilled
    expect(
      isStepUnbackfilled(
        makeStep({
          active_minutes: 0,
          passive_minutes: 0,
          instructions: "   ",
          rack_slots: 1,
        })
      )
    ).toBe(true);
  });
});
