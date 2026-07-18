import { describe, expect, it } from "vitest";
import { StepType, ProductType, StorageLocation } from "../../types";
import type { AggregatedFlowStep } from "../types.js";
import { convert, type Unit } from "../../units";
import { addOrMergeStep } from "./step-builder";

function makeInput(quantity: number, unit: Unit, productId = "flour") {
  return {
    productId,
    productName: "Flour",
    productType: ProductType.Raw,
    storageLocation: StorageLocation.Dry,
    quantity,
    unit,
  };
}

function makeOutput(quantity: number, unit: Unit, productId = "dough") {
  return {
    productId,
    productName: "Dough",
    quantity,
    unit,
  };
}

describe("step-builder — convert-or-split merge (DATA-01)", () => {
  it("merges two step inputs for the same product in convertible units", () => {
    const steps = new Map<string, AggregatedFlowStep>();

    addOrMergeStep(
      steps,
      "step-1",
      "Mix dough",
      StepType.Prep,
      "Bread",
      1,
      [makeInput(0.25, "cup")],
      []
    );
    addOrMergeStep(
      steps,
      "step-1",
      "Mix dough",
      StepType.Prep,
      "Bread",
      1,
      [makeInput(2, "tbsp")],
      []
    );

    const step = steps.get("step-1")!;
    expect(step.inputs).toHaveLength(1);
    const totalInTbsp = convert(
      step.inputs[0].quantity,
      step.inputs[0].unit as Unit,
      "tbsp"
    );
    expect(totalInTbsp).not.toBeNull();
    expect(totalInTbsp as number).toBeCloseTo(6, 5);
  });

  it("keeps cross-dimension step inputs separate (no false sum)", () => {
    const steps = new Map<string, AggregatedFlowStep>();

    addOrMergeStep(
      steps,
      "step-2",
      "Combine",
      StepType.Prep,
      "Bread",
      1,
      [makeInput(1, "cup")],
      []
    );
    addOrMergeStep(
      steps,
      "step-2",
      "Combine",
      StepType.Prep,
      "Bread",
      1,
      [makeInput(1, "lb")],
      []
    );

    const step = steps.get("step-2")!;
    expect(step.inputs).toHaveLength(2);
    expect(step.inputs.find((i) => i.unit === "cup")?.quantity).toBeCloseTo(
      1,
      5
    );
    expect(step.inputs.find((i) => i.unit === "lb")?.quantity).toBeCloseTo(
      1,
      5
    );
  });

  it("merges two step outputs for the same product in convertible units", () => {
    const steps = new Map<string, AggregatedFlowStep>();

    addOrMergeStep(
      steps,
      "step-3",
      "Portion dough",
      StepType.Assembly,
      "Bread",
      1,
      [],
      [makeOutput(0.25, "cup")]
    );
    addOrMergeStep(
      steps,
      "step-3",
      "Portion dough",
      StepType.Assembly,
      "Bread",
      1,
      [],
      [makeOutput(2, "tbsp")]
    );

    const step = steps.get("step-3")!;
    expect(step.outputs).toHaveLength(1);
    const totalInTbsp = convert(
      step.outputs[0].quantity,
      step.outputs[0].unit as Unit,
      "tbsp"
    );
    expect(totalInTbsp).not.toBeNull();
    expect(totalInTbsp as number).toBeCloseTo(6, 5);
  });

  it("keeps cross-dimension step outputs separate (no false sum)", () => {
    const steps = new Map<string, AggregatedFlowStep>();

    addOrMergeStep(
      steps,
      "step-4",
      "Portion dough",
      StepType.Assembly,
      "Bread",
      1,
      [],
      [makeOutput(1, "cup")]
    );
    addOrMergeStep(
      steps,
      "step-4",
      "Portion dough",
      StepType.Assembly,
      "Bread",
      1,
      [],
      [makeOutput(1, "lb")]
    );

    const step = steps.get("step-4")!;
    expect(step.outputs).toHaveLength(2);
    expect(step.outputs.find((o) => o.unit === "cup")?.quantity).toBeCloseTo(
      1,
      5
    );
    expect(step.outputs.find((o) => o.unit === "lb")?.quantity).toBeCloseTo(
      1,
      5
    );
  });
});

describe("step-builder — prep_action threading (E1)", () => {
  it("stores the prep_action on a newly created merged step", () => {
    const steps = new Map<string, AggregatedFlowStep>();
    addOrMergeStep(
      steps,
      "step-5",
      "dice onion",
      StepType.Prep,
      "Soup",
      1,
      [makeInput(1, "each", "onion")],
      [],
      "dice"
    );
    expect(steps.get("step-5")!.prep_action).toBe("dice");
  });

  it("keeps the first-seen prep_action but fills in from a later actionless-first member", () => {
    const steps = new Map<string, AggregatedFlowStep>();
    // First member has no action; second supplies one → filled in.
    addOrMergeStep(steps, "s", "chop onion", StepType.Prep, "A", 1, [makeInput(1, "each", "onion")], []);
    addOrMergeStep(steps, "s", "chop onion", StepType.Prep, "B", 1, [makeInput(1, "each", "onion")], [], "chop");
    expect(steps.get("s")!.prep_action).toBe("chop");
    // A later differing value does NOT overwrite the established one.
    addOrMergeStep(steps, "s", "chop onion", StepType.Prep, "C", 1, [makeInput(1, "each", "onion")], [], "mince");
    expect(steps.get("s")!.prep_action).toBe("chop");
  });
});
