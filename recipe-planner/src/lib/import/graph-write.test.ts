/**
 * Unit tests for the PURE graph-write planner `planGraphWrites` (Plan 06-04,
 * D-01 id-remap contract). No live PocketBase — every assertion is against the
 * plain-data `GraphWritePlan` the planner emits from a `NormalizedGraph` +
 * `remapSeed`. Vitest node env (no jsdom, no api import — see build-recipe-graph.ts
 * module doc for why the pure planner must stay api-free).
 */
import { describe, it, expect } from "vitest";
import {
  planGraphWrites,
  RECIPE_REMAP_KEY,
  COLLECTION_PRODUCT_NODES,
  COLLECTION_STEPS,
  COLLECTION_PRODUCT_TO_STEP,
  COLLECTION_STEP_TO_PRODUCT,
} from "./build-recipe-graph";
import type { NormalizedGraph } from "./validate-import";

/** A minimal fully-resolvable graph: one product → one step edge. */
function baseGraph(): NormalizedGraph {
  return {
    recipe: { name: "Test Recipe", recipe_type: "meal" },
    tagIds: [],
    productNodes: [
      {
        ref: "product-1",
        name: "Onion",
        unit: "each",
        quantity: 2,
        matchProductId: "prodA",
        mealDestination: "dinner",
      },
    ],
    steps: [
      {
        ref: "step-1",
        name: "Dice onion",
        step_type: "prep",
        timing: "batch",
        active_minutes: 5,
        passive_minutes: 3,
        instructions: "Dice it small",
        prep_action: "diced",
        resource: "none",
        oven_temp_f: 350,
        rack_slots: 2,
      },
    ],
    edges: [{ from: "product-1", to: "step-1" }],
  };
}

describe("planGraphWrites — all-new graph (empty remapSeed)", () => {
  it("emits a recipe create op", () => {
    const plan = planGraphWrites(baseGraph(), {});
    expect(plan.recipe.op).toBe("create");
    expect(plan.recipe.dbId).toBeUndefined();
    expect(plan.recipe.data.name).toBe("Test Recipe");
    expect(plan.recipe.data.recipe_type).toBe("meal");
  });

  it("emits one create op per product node with product-relation + hints mapped", () => {
    const plan = planGraphWrites(baseGraph(), {});
    const productOps = plan.nodes.filter(
      (n) => n.collection === COLLECTION_PRODUCT_NODES
    );
    expect(productOps).toHaveLength(1);
    const op = productOps[0];
    expect(op.op).toBe("create");
    expect(op.ref).toBe("product-1");
    expect(op.dbId).toBeUndefined();
    expect(op.data.product).toBe("prodA");
    expect(op.data.quantity).toBe(2);
    expect(op.data.unit).toBe("each");
    expect(op.data.meal_destination).toBe("dinner");
  });

  it("emits one create op per step carrying ALL Phase-5 fields", () => {
    const plan = planGraphWrites(baseGraph(), {});
    const stepOps = plan.nodes.filter((n) => n.collection === COLLECTION_STEPS);
    expect(stepOps).toHaveLength(1);
    const op = stepOps[0];
    expect(op.op).toBe("create");
    expect(op.ref).toBe("step-1");
    expect(op.data.name).toBe("Dice onion");
    expect(op.data.step_type).toBe("prep");
    expect(op.data.timing).toBe("batch");
    expect(op.data.active_minutes).toBe(5);
    expect(op.data.passive_minutes).toBe(3);
    expect(op.data.instructions).toBe("Dice it small");
    expect(op.data.prep_action).toBe("diced");
    expect(op.data.resource).toBe("none");
    expect(op.data.oven_temp_f).toBe(350);
    expect(op.data.rack_slots).toBe(2);
  });

  it("emits {x:0,y:0} positions (non-load-bearing; loadRecipe re-runs dagre)", () => {
    const plan = planGraphWrites(baseGraph(), {});
    for (const op of plan.nodes) {
      expect(op.data.position_x).toBe(0);
      expect(op.data.position_y).toBe(0);
    }
  });

  it("does NOT bake a recipe relation into node data (executor injects it)", () => {
    const plan = planGraphWrites(baseGraph(), {});
    for (const op of plan.nodes) {
      expect("recipe" in op.data).toBe(false);
    }
  });

  it("emits a product_to_step edge op for a product→step edge", () => {
    const plan = planGraphWrites(baseGraph(), {});
    expect(plan.edges).toHaveLength(1);
    const e = plan.edges[0];
    expect(e.collection).toBe(COLLECTION_PRODUCT_TO_STEP);
    expect(e.sourceRef).toBe("product-1");
    expect(e.targetRef).toBe("step-1");
  });
});

describe("planGraphWrites — remapSeed drives create-vs-update", () => {
  it("a node ref present in remapSeed → update op targeting that dbId", () => {
    const seed = {
      "product-1": "dbP1",
      "step-1": "dbS1",
      [RECIPE_REMAP_KEY]: "recipeX",
    };
    const plan = planGraphWrites(baseGraph(), seed);
    expect(plan.recipe.op).toBe("update");
    expect(plan.recipe.dbId).toBe("recipeX");

    const productOp = plan.nodes.find((n) => n.ref === "product-1")!;
    expect(productOp.op).toBe("update");
    expect(productOp.dbId).toBe("dbP1");

    const stepOp = plan.nodes.find((n) => n.ref === "step-1")!;
    expect(stepOp.op).toBe("update");
    expect(stepOp.dbId).toBe("dbS1");
  });

  it("mixed: a seeded ref updates, an absent ref creates", () => {
    const graph = baseGraph();
    graph.steps.push({
      ref: "step-2",
      name: "New step",
      step_type: "assembly",
    });
    const plan = planGraphWrites(graph, { "step-1": "dbS1" });
    const s1 = plan.nodes.find((n) => n.ref === "step-1")!;
    const s2 = plan.nodes.find((n) => n.ref === "step-2")!;
    expect(s1.op).toBe("update");
    expect(s1.dbId).toBe("dbS1");
    expect(s2.op).toBe("create");
    expect(s2.dbId).toBeUndefined();
  });

  it("the reserved recipe key is never treated as a node ref", () => {
    const plan = planGraphWrites(baseGraph(), {
      [RECIPE_REMAP_KEY]: "recipeX",
    });
    expect(plan.nodes.every((n) => n.ref !== RECIPE_REMAP_KEY)).toBe(true);
  });
});

describe("planGraphWrites — edge direction + endpoint resolution", () => {
  it("infers step_to_product for a step→product edge", () => {
    const graph = baseGraph();
    graph.edges = [{ from: "step-1", to: "product-1" }];
    const plan = planGraphWrites(graph, {});
    expect(plan.edges).toHaveLength(1);
    expect(plan.edges[0].collection).toBe(COLLECTION_STEP_TO_PRODUCT);
    expect(plan.edges[0].sourceRef).toBe("step-1");
    expect(plan.edges[0].targetRef).toBe("product-1");
  });

  it("skips product→product and step→step edges (no valid collection)", () => {
    const graph = baseGraph();
    graph.productNodes.push({
      ref: "product-2",
      name: "Garlic",
      unit: "clove",
      matchProductId: "prodB",
    });
    graph.steps.push({ ref: "step-2", name: "Mix", step_type: "assembly" });
    graph.edges = [
      { from: "product-1", to: "product-2" },
      { from: "step-1", to: "step-2" },
    ];
    const plan = planGraphWrites(graph, {});
    expect(plan.edges).toHaveLength(0);
  });

  it("skips an edge whose endpoint ref is unresolved (not a node, not seeded)", () => {
    const graph = baseGraph();
    graph.edges = [
      { from: "product-1", to: "step-1" }, // resolvable
      { from: "product-1", to: "step-99" }, // step-99 unknown
    ];
    const plan = planGraphWrites(graph, {});
    expect(plan.edges).toHaveLength(1);
    expect(plan.edges[0].targetRef).toBe("step-1");
  });

  it("resolves an edge endpoint that exists only in remapSeed", () => {
    const graph = baseGraph();
    // step-1 is a graph node; add an edge to a seed-only product ref
    graph.edges = [{ from: "step-1", to: "product-seed" }];
    const plan = planGraphWrites(graph, { "product-seed": "dbSeed" });
    expect(plan.edges).toHaveLength(1);
    expect(plan.edges[0].collection).toBe(COLLECTION_STEP_TO_PRODUCT);
    expect(plan.edges[0].targetRef).toBe("product-seed");
  });
});

describe("planGraphWrites — WR-01 clear-on-update semantics", () => {
  it("emits explicit empty sentinels for absent clearable step fields on update", () => {
    // A step changed assembly→prep: timing is now undefined and must be CLEARED
    // in the DB, not left stale. On the update path undefined fields would be
    // dropped by the PB SDK, so the planner sends "" / null instead.
    const graph = baseGraph();
    graph.steps = [
      { ref: "step-1", name: "Assemble", step_type: "prep" }, // all optionals absent
    ];
    graph.edges = [];
    const plan = planGraphWrites(graph, { "step-1": "dbS1" });
    const op = plan.nodes.find((n) => n.ref === "step-1")!;
    expect(op.op).toBe("update");
    // select/text clear to "" ; number clears to null
    expect(op.data.timing).toBe("");
    expect(op.data.prep_action).toBe("");
    expect(op.data.resource).toBe("");
    expect(op.data.instructions).toBe("");
    expect(op.data.active_minutes).toBeNull();
    expect(op.data.passive_minutes).toBeNull();
    expect(op.data.oven_temp_f).toBeNull();
    expect(op.data.rack_slots).toBeNull();
  });

  it("clears absent product-node fields on update (quantity→null, meal_destination→\"\")", () => {
    const graph = baseGraph();
    graph.productNodes = [
      { ref: "product-1", name: "Onion", unit: "each", matchProductId: "prodA" },
    ];
    graph.edges = [];
    const plan = planGraphWrites(graph, { "product-1": "dbP1" });
    const op = plan.nodes.find((n) => n.ref === "product-1")!;
    expect(op.op).toBe("update");
    expect(op.data.quantity).toBeNull();
    expect(op.data.meal_destination).toBe("");
  });

  it("clears recipe notes on update but leaves create-path fields undefined", () => {
    const graph = baseGraph();
    graph.recipe = { name: "R" }; // no notes / recipe_type
    const updatePlan = planGraphWrites(graph, { [RECIPE_REMAP_KEY]: "recipeX" });
    expect(updatePlan.recipe.op).toBe("update");
    expect(updatePlan.recipe.data.notes).toBe("");
    expect(updatePlan.recipe.data.recipe_type).toBe("");

    const createPlan = planGraphWrites(graph, {});
    expect(createPlan.recipe.op).toBe("create");
    // create path unchanged: undefined stays undefined (PB applies its defaults)
    expect(createPlan.recipe.data.notes).toBeUndefined();
    expect(createPlan.recipe.data.recipe_type).toBeUndefined();
  });

  it("does NOT overwrite a present step field with an empty sentinel on update", () => {
    const graph = baseGraph(); // step-1 carries a full set of fields
    const plan = planGraphWrites(graph, { "step-1": "dbS1" });
    const op = plan.nodes.find((n) => n.ref === "step-1")!;
    expect(op.data.timing).toBe("batch");
    expect(op.data.active_minutes).toBe(5);
  });
});

describe("planGraphWrites — recipe status + optional fields", () => {
  it("includes status only when set", () => {
    const withStatus = planGraphWrites(
      { ...baseGraph(), recipe: { name: "R", status: "published" } },
      {}
    );
    expect(withStatus.recipe.data.status).toBe("published");

    const withoutStatus = planGraphWrites(baseGraph(), {});
    expect("status" in withoutStatus.recipe.data).toBe(false);
  });

  it("carries revision_of and source_node when present", () => {
    const graph = baseGraph();
    graph.recipe = { name: "Draft", status: "draft", revision_of: "origRecipe" };
    graph.productNodes[0].sourceNode = "origNode";
    const plan = planGraphWrites(graph, {});
    expect(plan.recipe.data.revision_of).toBe("origRecipe");
    const productOp = plan.nodes.find((n) => n.ref === "product-1")!;
    expect(productOp.data.source_node).toBe("origNode");
  });
});
