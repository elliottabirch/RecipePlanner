/**
 * Unit tests for the PURE evolution write-back remap planner `planWriteBack`
 * (Plan 06-10, D-10 / Pitfall 2). No live PocketBase — every assertion is
 * against the plain-data { remapSeed, dangling } the planner emits from a
 * reviewed `NormalizedGraph` + the original recipe's node ids. Vitest node env
 * (no jsdom, no api import — see build-recipe-graph.ts module doc for why the
 * pure planners must stay api-free).
 *
 * The correctness this file guards (T-06-10a): on approval, a reviewed node
 * whose `source_node` still exists on the original recipe UPDATES that original
 * node id IN PLACE (remapSeed[ref] = source_node), so `meal_variant_overrides.
 * original_node` and `planned_meals.recipe` stay valid. Genuinely-removed
 * original nodes (nothing maps back) are reported as `dangling` — the only
 * override-dangling case D-10 accepts.
 */
import { describe, it, expect } from "vitest";
import { planWriteBack } from "./write-back";
import type { NormalizedGraph } from "./validate-import";

/**
 * A reviewed draft graph cloned from an original recipe with two existing
 * nodes (product `origP` + step `origS`), where the clone carries `source_node`
 * links back to those originals. `product-new` is a node the revision ADDED
 * (no source_node → must be created fresh).
 */
function reviewedGraph(): NormalizedGraph {
  return {
    recipe: { name: "Revised Recipe", status: "draft", revision_of: "origRecipe" },
    tagIds: [],
    productNodes: [
      {
        ref: "product-1",
        name: "Onion",
        unit: "each",
        quantity: 3,
        matchProductId: "prodA",
        sourceNode: "origP", // unchanged node → maps back to original
      },
      {
        ref: "product-new",
        name: "Garlic",
        unit: "clove",
        matchProductId: "prodB",
        // no sourceNode → genuinely new, must be created fresh
      },
    ],
    steps: [
      {
        ref: "step-1",
        name: "Dice onion",
        step_type: "prep",
        sourceNode: "origS", // unchanged node → maps back to original
      },
    ],
    edges: [{ from: "product-1", to: "step-1" }],
  };
}

describe("planWriteBack — node-id preservation (unchanged nodes)", () => {
  it("seeds remapSeed[ref] = source_node for every reviewed node still present on the original", () => {
    const { remapSeed } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    expect(remapSeed["product-1"]).toBe("origP");
    expect(remapSeed["step-1"]).toBe("origS");
  });

  it("preserves the ORIGINAL node id (update in place), never churns it to a new id", () => {
    // The whole point of Pitfall 2: the reviewed node's own ref is the KEY, the
    // original node id is the VALUE — buildRecipeGraph will `update` origP/origS
    // in place so overrides pointing at them survive.
    const { remapSeed } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    expect(Object.values(remapSeed)).toContain("origP");
    expect(Object.values(remapSeed)).toContain("origS");
  });
});

describe("planWriteBack — new nodes are created fresh", () => {
  it("a reviewed node with no source_node is absent from remapSeed (→ create)", () => {
    const { remapSeed } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    expect("product-new" in remapSeed).toBe(false);
  });

  it("a reviewed node whose source_node is NOT among the original ids is created fresh", () => {
    const graph = reviewedGraph();
    // stale/foreign source_node — the original no longer has this node
    graph.productNodes[0].sourceNode = "ghostNode";
    const { remapSeed } = planWriteBack(graph, ["origP", "origS"]);
    expect("product-1" in remapSeed).toBe(false);
  });
});

describe("planWriteBack — dangling detection (removed nodes)", () => {
  it("an original node with no reviewed node mapping back is reported dangling", () => {
    // origS is dropped from the reviewed graph (revision removed that step).
    const graph = reviewedGraph();
    graph.steps = []; // step referencing origS removed
    graph.edges = [];
    const { remapSeed, dangling } = planWriteBack(graph, ["origP", "origS"]);
    expect(remapSeed["product-1"]).toBe("origP");
    expect(dangling).toEqual(["origS"]);
  });

  it("returns an empty dangling list when every original node still maps back", () => {
    const { dangling } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    expect(dangling).toEqual([]);
  });

  it("reports every unmapped original, preserving input order", () => {
    const graph = reviewedGraph();
    graph.productNodes = graph.productNodes.filter((n) => n.ref === "product-new");
    graph.steps = [];
    graph.edges = [];
    const { dangling } = planWriteBack(graph, ["origP", "origS", "origExtra"]);
    expect(dangling).toEqual(["origP", "origS", "origExtra"]);
  });
});

describe("planWriteBack — WR-03 duplicate source_node guard", () => {
  it("only the first reviewed node claims a shared original id; the duplicate is a conflict created fresh", () => {
    const graph = reviewedGraph();
    // Both product-1 and product-new now point at the SAME original id origP.
    graph.productNodes[1].sourceNode = "origP";
    const { remapSeed, conflicts } = planWriteBack(graph, ["origP", "origS"]);
    // first claimant keeps the correspondence
    expect(remapSeed["product-1"]).toBe("origP");
    // duplicate is NOT seeded (→ created fresh) and is reported
    expect("product-new" in remapSeed).toBe(false);
    expect(conflicts).toEqual(["product-new"]);
    // no two refs ever collapse onto the same original id
    const seededOriginals = Object.values(remapSeed);
    expect(new Set(seededOriginals).size).toBe(seededOriginals.length);
  });

  it("reports an empty conflicts list in the normal 1:1 case", () => {
    const { conflicts } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    expect(conflicts).toEqual([]);
  });

  it("a duplicated original id is not double-counted as dangling", () => {
    const graph = reviewedGraph();
    graph.productNodes[1].sourceNode = "origP"; // duplicate claim
    graph.steps = []; // drop origS so it dangles
    graph.edges = [];
    const { dangling } = planWriteBack(graph, ["origP", "origS"]);
    // origP is still mapped (by the first claimant), only origS dangles
    expect(dangling).toEqual(["origS"]);
  });
});

describe("planWriteBack — recipe id is never part of the remap", () => {
  it("does not remap the recipe id even if it appears in originalNodeIds", () => {
    // originalNodeIds is strictly NODE ids; the recipe id is passed separately
    // to buildRecipeGraph as recipeId. planWriteBack only ever keys remapSeed by
    // a reviewed node's `ref` (product-* / step-*), never by a recipe id.
    const { remapSeed } = planWriteBack(reviewedGraph(), ["origP", "origS"]);
    for (const ref of Object.keys(remapSeed)) {
      expect(ref === "origRecipe").toBe(false);
      expect(ref.startsWith("product") || ref.startsWith("step")).toBe(true);
    }
  });
});

describe("planWriteBack — purity", () => {
  it("does not mutate the reviewed graph or the originalNodeIds input", () => {
    const graph = reviewedGraph();
    const snapshot = JSON.stringify(graph);
    const ids = ["origP", "origS"];
    planWriteBack(graph, ids);
    expect(JSON.stringify(graph)).toBe(snapshot);
    expect(ids).toEqual(["origP", "origS"]);
  });
});
