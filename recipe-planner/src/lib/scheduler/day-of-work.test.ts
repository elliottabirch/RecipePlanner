/**
 * Pure, node-env tests for the day-of work collector (quick task
 * 260716-u4p). Fixture convention mirrors `week-graph.test.ts` (inline
 * `makeStep` / `Map<string, RecipeGraphData>`; no live PocketBase, no
 * jsdom — there is no component-test infrastructure in this repo
 * (planning_findings #12) and this plan does not add any).
 */
import { describe, it, expect } from "vitest";
import { collectDayOfWork, formatDayOfSummary, type DayOfMeal } from "./day-of-work";
import { StepType, Timing, type RecipeStep } from "../types";
import type { MealKeyedRecipeData, RecipeGraphData } from "../aggregation/types";

function makeStep(id: string, overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id,
    created: "",
    updated: "",
    collectionId: "recipe_steps",
    collectionName: "recipe_steps",
    recipe: "recipe-1",
    name: "Step",
    step_type: StepType.Assembly,
    timing: Timing.Batch,
    ...overrides,
  };
}

function makeRecipeData(
  overrides: Partial<RecipeGraphData> = {},
  recipeId = "recipe-1",
  recipeName = "Recipe"
): RecipeGraphData {
  return {
    recipe: {
      id: recipeId,
      created: "",
      updated: "",
      collectionId: "recipes",
      collectionName: "recipes",
      name: recipeName,
    },
    productNodes: [],
    steps: [],
    productToStepEdges: [],
    stepToProductEdges: [],
    ...overrides,
  };
}

describe("collectDayOfWork", () => {
  it("(a) a meal with mixed batch + JIT steps yields one DayOfMeal carrying ONLY the JIT steps", () => {
    const batchStep = makeStep("batch-1", { name: "Brown mushrooms", timing: Timing.Batch });
    const jitStep = makeStep("jit-1", { name: "Serve over noodles", timing: Timing.JustInTime });

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", makeRecipeData({ steps: [batchStep, jitStep] }, "recipe-a", "Recipe A")],
    ]);

    const result = collectDayOfWork(mealData);
    expect(result).toHaveLength(1);
    expect(result[0].plannedMealId).toBe("meal-a");
    expect(result[0].recipeName).toBe("Recipe A");
    expect(result[0].steps.map((s) => s.id)).toEqual(["jit-1"]);
  });

  it("(b) a meal with no JIT steps is absent entirely", () => {
    const batchStep = makeStep("batch-1", { name: "Brown mushrooms", timing: Timing.Batch });

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", makeRecipeData({ steps: [batchStep] }, "recipe-a", "Recipe A")],
    ]);

    expect(collectDayOfWork(mealData)).toEqual([]);
  });

  it("(c) blank-timing steps are never reported (they are prep-day per week-graph.ts's header)", () => {
    const blankStep = makeStep("blank-1", { name: "Blank timing step", timing: undefined });

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", makeRecipeData({ steps: [blankStep] }, "recipe-a", "Recipe A")],
    ]);

    expect(collectDayOfWork(mealData)).toEqual([]);
  });

  it("(d) a prep-typed step tagged JIT IS reported", () => {
    // This is the case `isJustInTimeStep` (aggregation/utils/step-utils.ts)
    // would silently drop — it requires `step_type === Assembly` in
    // addition to `timing === JustInTime`. `collectDayOfWork` must NOT
    // reuse that helper: it predicates on `timing` alone, so it stays the
    // exact complement of `week-graph.ts:158`'s exclusion (which also only
    // checks `timing`) even for a prep step. Prod has zero such steps today
    // (verified 2026-07-16), but this pins the latent gap so a future edit
    // can't quietly reopen it.
    const prepJitStep = makeStep("prep-jit-1", {
      name: "Chop garnish (mis-tagged prep JIT)",
      step_type: StepType.Prep,
      timing: Timing.JustInTime,
    });

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", makeRecipeData({ steps: [prepJitStep] }, "recipe-a", "Recipe A")],
    ]);

    const result = collectDayOfWork(mealData);
    expect(result).toHaveLength(1);
    expect(result[0].steps.map((s) => s.id)).toEqual(["prep-jit-1"]);
  });

  it("(e) two planned meals of the SAME recipe yield two entries", () => {
    const jitStep1 = makeStep("jit-1", { name: "Plate it", timing: Timing.JustInTime });
    const jitStep2 = makeStep("jit-2", { name: "Plate it", timing: Timing.JustInTime });

    const mealData: MealKeyedRecipeData = new Map([
      ["meal-a", makeRecipeData({ steps: [jitStep1] }, "recipe-a", "Same Recipe")],
      ["meal-b", makeRecipeData({ steps: [jitStep2] }, "recipe-a", "Same Recipe")],
    ]);

    const result = collectDayOfWork(mealData);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.plannedMealId)).toEqual(["meal-a", "meal-b"]);
    expect(result.every((m) => m.recipeName === "Same Recipe")).toBe(true);
  });
});

describe("formatDayOfSummary", () => {
  it("(f) is null for an empty array", () => {
    expect(formatDayOfSummary([])).toBeNull();
  });

  it("(f) singularises both nouns for a single meal, single step", () => {
    const meals: DayOfMeal[] = [
      { plannedMealId: "meal-a", recipeName: "Creamy Tomato Soup", steps: [makeStep("jit-1")] },
    ];
    expect(formatDayOfSummary(meals)).toBe(
      "1 meal still need day-of cooking: Creamy Tomato Soup (1 step)"
    );
  });

  it("(f) pluralises both nouns for multiple meals with multiple steps", () => {
    const meals: DayOfMeal[] = [
      {
        plannedMealId: "meal-a",
        recipeName: "Mushroom Bourguignon (Simple)",
        steps: [makeStep("jit-1"), makeStep("jit-2")],
      },
      { plannedMealId: "meal-b", recipeName: "Harissa Cod with Chickpeas", steps: [makeStep("jit-3")] },
    ];
    expect(formatDayOfSummary(meals)).toBe(
      "2 meals still need day-of cooking: Mushroom Bourguignon (Simple) (2 steps), Harissa Cod with Chickpeas (1 step)"
    );
  });

  // (g) The live-plan fixture. Reconstructs week 7/13's four verified
  // day-of meals from planning_findings (the real `buildWeekGraph`/
  // `collectDayOfWork` output against prod plan `71ukhycp2v4s0fw`, probed
  // 2026-07-16 and re-verified 2026-07-17). Hand-built and offline — it
  // must NOT read prod.
  //
  // A direct user interview (2026-07-17) established how meat spaghetti is
  // actually cooked: the spaghetti is boiled on prep day, combined with
  // the sauce, and stored combined. THERE IS NO DAY-OF WORK FOR THIS DISH.
  // An earlier revision of this comment predicted the split would add
  // `meat spaghetti` here as a fifth day-of item — that was based on a
  // misreading of how the user cooks, not on the data, and is WRONG. Meat
  // spaghetti carries ZERO `just_in_time` steps by design, both before and
  // after the 4-step split (`260716-u4p` Task 1): its absence from this
  // summary is a correctness property, not a gap. Do not restore the
  // fifth-entry prediction.
  const WEEK_7_13_DAY_OF: MealKeyedRecipeData = new Map([
    [
      "meal-harissa-cod",
      makeRecipeData(
        { steps: [makeStep("bake-cod", { name: "Bake cod (day-of)", timing: Timing.JustInTime })] },
        "recipe-harissa-cod",
        "Harissa Cod with Chickpeas"
      ),
    ],
    [
      "meal-bourguignon",
      makeRecipeData(
        {
          steps: [
            makeStep("cook-egg-noodles", { name: "Cook egg noodles", timing: Timing.JustInTime }),
            makeStep("serve-over-noodles", { name: "Serve over noodles", timing: Timing.JustInTime }),
          ],
        },
        "recipe-bourguignon",
        "Mushroom Bourguignon (Simple)"
      ),
    ],
    [
      "meal-salad-and-salmon",
      makeRecipeData(
        {
          steps: [
            makeStep("cook-salmon", { name: "cook salmon", timing: Timing.JustInTime }),
            makeStep(
              "assemble-roasting-veg-and-cook-salmon",
              { name: "assemble roasting veg and cook salmon", timing: Timing.JustInTime }
            ),
          ],
        },
        "recipe-salad-and-salmon",
        "salad and salmon"
      ),
    ],
    [
      "meal-tomato-soup",
      makeRecipeData(
        { steps: [makeStep("garnish-swirl", { name: "Swirl garnish", timing: Timing.JustInTime })] },
        "recipe-tomato-soup",
        "Creamy Tomato Soup"
      ),
    ],
    // Meat spaghetti, POST-split (`260716-u4p` Task 1): four steps, every
    // one `batch` — Cook spaghetti, Cook meat, Simmer meat sauce, Combine
    // all. No day-of work for this dish, before or after the split. This
    // entry turns the absence below into a PROVEN property rather than an
    // incidental: an all-batch meal is never reported as day-of work.
    [
      "meal-meat-spaghetti",
      makeRecipeData(
        {
          steps: [
            makeStep("cook-spaghetti", { name: "Cook spaghetti", timing: Timing.Batch }),
            makeStep("cook-meat", { name: "Cook meat", timing: Timing.Batch }),
            makeStep("simmer-meat-sauce", { name: "Simmer meat sauce", timing: Timing.Batch }),
            makeStep("combine-all", { name: "Combine all", timing: Timing.Batch }),
          ],
        },
        "recipe-meat-spaghetti",
        "meat spaghetti"
      ),
    ],
  ]);

  it("(g) matches the verified week 7/13 summary exactly, and an all-batch meal (meat spaghetti, post-split) is provably absent", () => {
    const result = collectDayOfWork(WEEK_7_13_DAY_OF);
    expect(result).toHaveLength(4);
    expect(result.some((m) => m.recipeName === "meat spaghetti")).toBe(false);

    const summary = formatDayOfSummary(result);
    expect(summary).toBe(
      "4 meals still need day-of cooking: Harissa Cod with Chickpeas (1 step), " +
        "Mushroom Bourguignon (Simple) (2 steps), salad and salmon (2 steps), " +
        "Creamy Tomato Soup (1 step)"
    );
    expect(summary).not.toContain("meat spaghetti");
  });
});
