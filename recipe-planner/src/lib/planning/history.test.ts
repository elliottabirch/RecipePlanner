import { describe, expect, it } from "vitest";
import type { PlannedMeal, WeeklyPlan } from "../types";
import {
  computeLastPlannedDates,
  orderPoolByLRU,
  poolForSlot,
} from "./history";

// ============================================================================
// Wave 0 RED scaffold (04-01-PLAN.md Task 1). `./history` does not exist
// yet — this whole file is expected to fail on the missing module import
// until 04-04 (LRU history service) lands. See 04-RESEARCH.md Pattern 5
// (exact function shapes + "LRU tie-break unit test shape" code example)
// and Pattern 6 (poolForSlot) for the contracts these tests lock in.
// ============================================================================

function plan(overrides: { id: string; start_date?: string }): WeeklyPlan & {
  start_date?: string;
} {
  return {
    created: "",
    updated: "",
    collectionId: "weekly_plans",
    collectionName: "weekly_plans",
    ...overrides,
  } as unknown as WeeklyPlan & { start_date?: string };
}

function meal(overrides: {
  id: string;
  recipe: string;
  weekly_plan: string;
}): PlannedMeal {
  return {
    created: "",
    updated: "",
    collectionId: "planned_meals",
    collectionName: "planned_meals",
    meal_slot: "dinner",
    ...overrides,
  } as unknown as PlannedMeal;
}

function recipe(id: string, name: string): { id: string; name: string } {
  return { id, name };
}

describe("computeLastPlannedDates + orderPoolByLRU — AC#6 LRU tie-break (WEEK-04)", () => {
  it("a never-planned recipe sorts before one planned last week", () => {
    const lastPlanned = computeLastPlannedDates(
      [plan({ id: "plan-1", start_date: "2026-06-01" })],
      [meal({ id: "meal-1", recipe: "recipe-a", weekly_plan: "plan-1" })]
    );

    const ordered = orderPoolByLRU(
      [recipe("recipe-a", "A"), recipe("recipe-b", "B")],
      lastPlanned
    );

    expect(ordered.map((r) => r.id)).toEqual(["recipe-b", "recipe-a"]);
  });

  it("a recipe planned 3 weeks ago sorts before one planned this week", () => {
    const lastPlanned = computeLastPlannedDates(
      [
        plan({ id: "plan-old", start_date: "2026-06-15" }), // 3 weeks before plan-new
        plan({ id: "plan-new", start_date: "2026-07-06" }), // this week
      ],
      [
        meal({ id: "meal-1", recipe: "recipe-stale", weekly_plan: "plan-old" }),
        meal({ id: "meal-2", recipe: "recipe-fresh", weekly_plan: "plan-new" }),
      ]
    );

    const ordered = orderPoolByLRU(
      [recipe("recipe-fresh", "Fresh"), recipe("recipe-stale", "Stale")],
      lastPlanned
    );

    expect(ordered.map((r) => r.id)).toEqual(["recipe-stale", "recipe-fresh"]);
  });

  it("ties on an equal last-planned date break by name asc then id asc, deterministic across a reversed input array", () => {
    const lastPlanned = computeLastPlannedDates(
      [plan({ id: "plan-1", start_date: "2026-06-01" })],
      [
        meal({ id: "meal-1", recipe: "z-id", weekly_plan: "plan-1" }),
        meal({ id: "meal-2", recipe: "a-id", weekly_plan: "plan-1" }),
      ]
    );
    const recipes = [recipe("z-id", "Same"), recipe("a-id", "Same")];

    const ordered1 = orderPoolByLRU(recipes, lastPlanned);
    const ordered2 = orderPoolByLRU([...recipes].reverse(), lastPlanned);

    expect(ordered1.map((r) => r.id)).toEqual(["a-id", "z-id"]);
    expect(ordered2.map((r) => r.id)).toEqual(["a-id", "z-id"]); // order-independent
  });

  it("two never-planned recipes tie-break by name asc then id asc", () => {
    const lastPlanned = new Map<string, string>(); // both never-planned
    const recipes = [recipe("z-id", "Same"), recipe("a-id", "Same")];

    const ordered = orderPoolByLRU(recipes, lastPlanned);

    expect(ordered.map((r) => r.id)).toEqual(["a-id", "z-id"]);
  });
});

describe("poolForSlot — WEEK-03 tag-pool resolution (match-any)", () => {
  it("returns only recipes whose tags intersect the slot's pool_tags", () => {
    const recipeTags = new Map<string, string[]>([
      ["recipe-a", ["tag-a", "tag-b"]],
      ["recipe-b", ["tag-c"]],
      ["recipe-c", ["tag-a"]],
    ]);
    const slot = { pool_tags: ["tag-a"] };
    const recipes = [
      recipe("recipe-a", "A"),
      recipe("recipe-b", "B"),
      recipe("recipe-c", "C"),
    ];

    const pool = poolForSlot(slot as any, recipes as any, recipeTags);

    expect(pool.map((r) => r.id).sort()).toEqual(["recipe-a", "recipe-c"]);
  });

  it("excludes a recipe that has none of the slot's pool tags", () => {
    const recipeTags = new Map<string, string[]>([["recipe-a", ["tag-x"]]]);
    const slot = { pool_tags: ["tag-a"] };

    const pool = poolForSlot(
      slot as any,
      [recipe("recipe-a", "A")] as any,
      recipeTags
    );

    expect(pool).toHaveLength(0);
  });
});

describe("poolForSlot — Micah/adult split (match_all + exclude_tags)", () => {
  it("match_all requires EVERY pool tag (Micah Proteins = protein AND micah meal)", () => {
    const recipeTags = new Map<string, string[]>([
      ["micah-protein", ["protein", "micah meal"]], // qualifies
      ["adult-protein", ["protein"]], // missing micah meal — excluded
      ["micah-green", ["green", "micah meal"]], // missing protein — excluded
    ]);
    const slot = { pool_tags: ["protein", "micah meal"], match_all: true };
    const recipes = [
      recipe("micah-protein", "MP"),
      recipe("adult-protein", "AP"),
      recipe("micah-green", "MG"),
    ];

    const pool = poolForSlot(slot as any, recipes as any, recipeTags);

    expect(pool.map((r) => r.id)).toEqual(["micah-protein"]);
  });

  it("exclude_tags drops a recipe carrying an excluded tag (adult pool excludes micah meal)", () => {
    const recipeTags = new Map<string, string[]>([
      ["adult-dinner", ["pescatarian"]], // qualifies
      ["micah-pesc", ["pescatarian", "micah meal"]], // excluded by micah meal
    ]);
    const slot = { pool_tags: ["pescatarian"], exclude_tags: ["micah meal"] };
    const recipes = [recipe("adult-dinner", "AD"), recipe("micah-pesc", "MPz")];

    const pool = poolForSlot(slot as any, recipes as any, recipeTags);

    expect(pool.map((r) => r.id)).toEqual(["adult-dinner"]);
  });

  it("exclude_tags wins even when a pool tag also matches", () => {
    const recipeTags = new Map<string, string[]>([
      ["both", ["pescatarian", "micah meal"]],
    ]);
    const slot = { pool_tags: ["pescatarian"], exclude_tags: ["micah meal"] };

    const pool = poolForSlot(
      slot as any,
      [recipe("both", "B")] as any,
      recipeTags
    );

    expect(pool).toHaveLength(0);
  });
});
