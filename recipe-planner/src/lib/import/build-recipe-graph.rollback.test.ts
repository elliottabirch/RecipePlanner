/**
 * Executor rollback tests for `buildRecipeGraph` (06 UAT import follow-up).
 * A partial import used to leave an orphan recipe + nodes when a later write
 * (e.g. a step whose select value PB rejects) threw — those leftovers then
 * auto-matched on the next paste and dangled. On the CREATE path the executor
 * now deletes everything it created if any write fails; the UPDATE path
 * (evolution write-back) is intentionally left as-is. `../api` is mocked so the
 * executor's create/remove calls are observable without a live PocketBase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedGraph } from "./validate-import";

const created: { collection: string; id: string }[] = [];
const removed: { collection: string; id: string }[] = [];
let failOnCollection: string | null = null;
let idCounter = 0;
// Existing recipe_tags joins the update path should find + delete before it
// recreates from graph.tagIds. Default empty; set per-test.
let existingRecipeTags: { id: string }[] = [];

vi.mock("../api", () => ({
  collections: {
    recipes: "recipes",
    recipeTags: "recipe_tags",
    productToStepEdges: "product_to_step_edges",
    stepToProductEdges: "step_to_product_edges",
  },
  create: vi.fn(async (collection: string) => {
    if (collection === failOnCollection) {
      const err = new Error("Failed to create record.");
      throw err;
    }
    const id = `id-${++idCounter}`;
    created.push({ collection, id });
    return { id };
  }),
  update: vi.fn(async () => ({})),
  getAll: vi.fn(async (collection: string) =>
    collection === "recipe_tags" ? existingRecipeTags : []
  ),
  remove: vi.fn(async (collection: string, id: string) => {
    removed.push({ collection, id });
  }),
}));

import { buildRecipeGraph } from "./build-recipe-graph";

function graph(): NormalizedGraph {
  return {
    recipe: { name: "Rollback Test", recipe_type: "meal" },
    tagIds: [],
    productNodes: [
      { ref: "product-1", name: "Onion", unit: "each", quantity: 1, matchProductId: "prodA" },
    ],
    steps: [
      { ref: "step-1", name: "Dice", step_type: "prep", prep_action: "diced" },
    ],
    edges: [{ from: "product-1", to: "step-1" }],
  };
}

beforeEach(() => {
  created.length = 0;
  removed.length = 0;
  failOnCollection = null;
  idCounter = 0;
  existingRecipeTags = [];
});

describe("buildRecipeGraph — create-path rollback", () => {
  it("deletes the created recipe + nodes when a later write fails", async () => {
    failOnCollection = "recipe_steps"; // recipe + product node created, then step create throws
    await expect(buildRecipeGraph(graph())).rejects.toThrow("Failed to create record.");

    // recipe (id-1) + product node (id-2) were created before the step threw.
    expect(created.map((c) => c.collection)).toEqual([
      "recipes",
      "recipe_product_nodes",
    ]);
    // Both are rolled back — nodes first (reverse order), recipe last.
    expect(removed).toEqual([
      { collection: "recipe_product_nodes", id: "id-2" },
      { collection: "recipes", id: "id-1" },
    ]);
  });

  it("does not roll back when all writes succeed", async () => {
    await expect(buildRecipeGraph(graph())).resolves.toMatchObject({
      recipeId: "id-1",
    });
    expect(removed).toEqual([]);
  });

  it("does NOT roll back the recipe on the update path (evolution write-back)", async () => {
    failOnCollection = "recipe_steps";
    await expect(
      buildRecipeGraph(graph(), { recipeId: "existing-recipe" })
    ).rejects.toThrow("Failed to create record.");
    // Update path must not delete the pre-existing recipe or anything else.
    expect(removed).toEqual([]);
  });
});

describe("buildRecipeGraph — tag writes (recipe_tags spine)", () => {
  it("creates a recipe_tags row per tagId on the create path", async () => {
    const g = graph();
    g.tagIds = ["tagA", "tagB"];
    await buildRecipeGraph(g);
    const tagCreates = created.filter((c) => c.collection === "recipe_tags");
    expect(tagCreates).toHaveLength(2);
  });

  it("writes no recipe_tags when tagIds is empty", async () => {
    await buildRecipeGraph(graph());
    expect(created.some((c) => c.collection === "recipe_tags")).toBe(false);
  });

  it("rolls back created recipe_tags rows when a later write fails", async () => {
    const g = graph();
    g.tagIds = ["tagA"];
    failOnCollection = "recipe_steps"; // recipe + tag + product node created, then step throws
    await expect(buildRecipeGraph(g)).rejects.toThrow("Failed to create record.");
    expect(removed.some((r) => r.collection === "recipe_tags")).toBe(true);
  });

  it("update path deletes existing recipe_tags then recreates from tagIds", async () => {
    const g = graph();
    g.tagIds = ["tagA", "tagB"];
    existingRecipeTags = [{ id: "old-1" }, { id: "old-2" }];
    await buildRecipeGraph(g, { recipeId: "existing-recipe" });
    expect(
      removed
        .filter((r) => r.collection === "recipe_tags")
        .map((r) => r.id)
        .sort()
    ).toEqual(["old-1", "old-2"]);
    expect(created.filter((c) => c.collection === "recipe_tags")).toHaveLength(2);
  });
});
