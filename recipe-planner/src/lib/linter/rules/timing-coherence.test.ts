import { describe, it, expect } from "vitest";
import {
  lintTimingCoherence,
  MIN_PASSIVE_MINUTES,
  MAKE_AHEAD_VERBS,
} from "./timing-coherence";
import { StepType, Timing, type RecipeStep } from "../../types";

function step(
  id: string,
  overrides: Partial<RecipeStep> = {}
): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Step",
    step_type: StepType.Assembly,
    timing: Timing.JustInTime,
    ...overrides,
  };
}

describe("linter — timing-coherence", () => {
  it("(a) flags Simmer bourguignon as it was pre-retag (assembly, JIT, 8a/35p, 'simmer' in name)", () => {
    const findings = lintTimingCoherence([
      step("simmer-bourguignon", {
        name: "Simmer bourguignon",
        active_minutes: 8,
        passive_minutes: 35,
        instructions: "Simmer the mushroom bourguignon until thickened.",
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("timing-coherence");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("Simmer bourguignon");
  });

  it("(b) flags create spaghetti pre-retag via the INSTRUCTIONS, not the name — the name alone has no verb", () => {
    // The name "create spaghetti" carries no make-ahead verb; only the
    // instructions do ("...and simmer over cooked spaghetti..."). This is
    // why the regex reads name + instructions, not name alone.
    const createSpaghetti = step("create-spaghetti", {
      name: "create spaghetti",
      active_minutes: 8,
      passive_minutes: 15,
      instructions:
        "Brown ground beef, combine with marinara, and simmer over cooked spaghetti; top with parmesan.",
    });
    expect(MAKE_AHEAD_VERBS.test(createSpaghetti.name)).toBe(false);
    const findings = lintTimingCoherence([createSpaghetti]);
    expect(findings).toHaveLength(1);
    expect(findings[0].nodeId).toBe("create-spaghetti");
  });

  it("(c) the same steps at timing: batch (their real current prod state) produce no finding — the regression proving the landed retag is clean", () => {
    const findings = lintTimingCoherence([
      step("simmer-bourguignon", {
        name: "Simmer bourguignon",
        timing: Timing.Batch,
        active_minutes: 8,
        passive_minutes: 35,
        instructions: "Simmer the mushroom bourguignon until thickened.",
      }),
      step("create-spaghetti", {
        name: "create spaghetti",
        timing: Timing.Batch,
        active_minutes: 8,
        passive_minutes: 15,
        instructions:
          "Brown ground beef, combine with marinara, and simmer over cooked spaghetti; top with parmesan.",
      }),
    ]);
    expect(findings).toEqual([]);
  });

  // (d) The prod false-positive fixture — the most valuable test here.
  // These are real published recipes; a finding against any of them is a
  // recipe the user can no longer publish (RecipeEditor.tsx:767 is
  // severity-blind). This fixture is the executable form of the design
  // argument in timing-coherence.ts's header — widen the verb list or drop
  // the passive gate and it fails.
  const PROD_JIT_2026_07_16: RecipeStep[] = [
    step("cook-salmon", { name: "cook salmon", passive_minutes: 8 }),
    step("cook-hamburger-patties", {
      name: "cook hamburger patties",
      passive_minutes: 10,
    }),
    step("cook-lasagna", { name: "cook lasagna", passive_minutes: 45 }),
    step("cook-garlic-chicken", {
      name: "cook garlic chicken",
      passive_minutes: 20,
    }),
    step("assemble-roasting-veg-and-cook-salmon", {
      name: "assemble roasting veg and cook salmon",
      passive_minutes: 8,
    }),
    step("assemble-tuna-salad-sandwiches", {
      name: "assemble tuna salad sandwiches",
      passive_minutes: 5,
    }),
    step("warm-pitas-in-oven", { name: "Warm pitas in oven", passive_minutes: 5 }),
    step("bake-french-fries", { name: "bake french fries", passive_minutes: 22 }),
    step("cook-egg-noodles", { name: "Cook egg noodles", passive_minutes: 8 }),
    step("bake-cod-day-of", { name: "Bake cod (day-of)", passive_minutes: 12 }),
    step("serve-with-topping", {
      name: "Serve with topping",
      passive_minutes: 0,
      instructions: "Top the stew with the lemon-parsley mixture.",
    }),
  ];

  it("(d) zero findings against every live JIT step a naive rule would have flagged", () => {
    expect(lintTimingCoherence(PROD_JIT_2026_07_16)).toEqual([]);
  });

  it("(e) Brown mushrooms (12a/0p, JIT) is NOT flagged — a KNOWN, ACCEPTED miss, not an oversight", () => {
    // Zero passive time; no passive-gated rule can ever reach it. Do not
    // "fix" this by relaxing MIN_PASSIVE_MINUTES — see (d) above.
    const findings = lintTimingCoherence([
      step("brown-mushrooms", {
        name: "Brown mushrooms",
        active_minutes: 12,
        passive_minutes: 0,
      }),
    ]);
    expect(findings).toEqual([]);
    expect(MIN_PASSIVE_MINUTES).toBe(5);
  });

  it("does not flag a prep-typed step even if it matches the verb + passive gate (assembly-only scope)", () => {
    const findings = lintTimingCoherence([
      step("prep-simmer", {
        name: "Simmer stock",
        step_type: StepType.Prep,
        passive_minutes: 30,
      }),
    ]);
    expect(findings).toEqual([]);
  });

  it("does not flag a batch step regardless of verb/passive", () => {
    const findings = lintTimingCoherence([
      step("batch-simmer", {
        name: "Simmer sauce",
        timing: Timing.Batch,
        passive_minutes: 30,
      }),
    ]);
    expect(findings).toEqual([]);
  });
});
