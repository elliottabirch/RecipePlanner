/**
 * Tests for the pure downstream-convergence derivation
 * (container-convergence-indicator todo, 2026-07-12). The fixtures mirror the
 * real "Peanut Soba Salad with Shrimp" subgraph probed from prod: raw cucumber
 * → Slice cucumber → cucumber sliced → Toss the salad (with soba/shrimp/edamame/
 * dressing/green onion) → peanut soba salad [stored].
 */
import { describe, it, expect } from "vitest";
import { deriveConvergence } from "./convergence";
import { ProductType, type Product } from "../types";
import type {
  ExpandedProductNode,
  RecipeGraphData,
} from "../aggregation/types";

let seq = 0;
function node(
  name: string,
  type: ProductType,
  containerTypeName?: string
): ExpandedProductNode {
  const id = `node-${name.replace(/\s+/g, "-")}-${seq++}`;
  const product = {
    id: `prod-${name.replace(/\s+/g, "-")}`,
    name,
    type,
    expand: containerTypeName
      ? { container_type: { id: "ct", name: containerTypeName } }
      : undefined,
  } as unknown as Product & {
    expand?: { container_type?: { id: string; name: string } };
  };
  return { id, product: product.id, expand: { product } } as ExpandedProductNode;
}

/** Assemble a RecipeGraphData from product nodes + (node->step) / (step->node)
 * edge lists expressed as `[nodeId, stepId]` / `[stepId, nodeId]`. */
function graph(
  nodes: ExpandedProductNode[],
  productToStep: [string, string][],
  stepToProduct: [string, string][]
): RecipeGraphData {
  return {
    recipe: { id: "r", name: "Test", collectionId: "recipes", collectionName: "recipes", created: "", updated: "" } as RecipeGraphData["recipe"],
    productNodes: nodes,
    steps: [],
    productToStepEdges: productToStep.map(([source, target]) => ({
      id: `${source}->${target}`,
      collectionId: "product_to_step_edges",
      collectionName: "product_to_step_edges",
      created: "",
      updated: "",
      recipe: "r",
      source,
      target,
    })),
    stepToProductEdges: stepToProduct.map(([source, target]) => ({
      id: `${source}->${target}`,
      collectionId: "step_to_product_edges",
      collectionName: "step_to_product_edges",
      created: "",
      updated: "",
      recipe: "r",
      source,
      target,
    })),
  };
}

/** The soba subgraph, returned with the node ids the tests assert against. */
function sobaGraph(opts: { container?: string } = {}) {
  const sobaRaw = node("soba noodles", ProductType.Raw);
  const sobaCooked = node("soba noodles cooked", ProductType.Transient);
  const shrimpRaw = node("frozen shrimp", ProductType.Raw);
  const shrimpCooked = node("shrimp cooked", ProductType.Transient);
  const cucumberRaw = node("cucumber", ProductType.Raw);
  const cucumberSliced = node("cucumber sliced", ProductType.Transient);
  const edamame = node("frozen edamame", ProductType.Raw);
  const dressing = node("asian peanut dressing", ProductType.Transient);
  const pb = node("Peanut Butter", ProductType.Raw);
  const soy = node("soy sauce", ProductType.Raw);
  const onionRaw = node("green onion", ProductType.Raw);
  const onionSliced = node("green onion sliced", ProductType.Transient);
  const salad = node("peanut soba salad", ProductType.Stored, opts.container);

  const S = {
    cookSoba: "step-cook-soba",
    cookShrimp: "step-cook-shrimp",
    sliceCucumber: "step-slice-cucumber",
    sliceOnion: "step-slice-onion",
    combineDressing: "step-combine-dressing",
    toss: "step-toss",
  };

  const g = graph(
    [
      sobaRaw, sobaCooked, shrimpRaw, shrimpCooked, cucumberRaw, cucumberSliced,
      edamame, dressing, pb, soy, onionRaw, onionSliced, salad,
    ],
    [
      [sobaRaw.id, S.cookSoba],
      [shrimpRaw.id, S.cookShrimp],
      [cucumberRaw.id, S.sliceCucumber],
      [onionRaw.id, S.sliceOnion],
      [pb.id, S.combineDressing],
      [soy.id, S.combineDressing],
      // Toss the salad consumes every prepared/cooked component.
      [sobaCooked.id, S.toss],
      [shrimpCooked.id, S.toss],
      [cucumberSliced.id, S.toss],
      [edamame.id, S.toss],
      [dressing.id, S.toss],
      [onionSliced.id, S.toss],
    ],
    [
      [S.cookSoba, sobaCooked.id],
      [S.cookShrimp, shrimpCooked.id],
      [S.sliceCucumber, cucumberSliced.id],
      [S.sliceOnion, onionSliced.id],
      [S.combineDressing, dressing.id],
      [S.toss, salad.id],
    ]
  );
  return { g, S };
}

describe("deriveConvergence — soba salad subgraph (probed from prod)", () => {
  it("shows the co-ingredients a sliced cucumber combines with, resolved to base names", () => {
    const { g, S } = sobaGraph();
    const result = deriveConvergence(S.sliceCucumber, g);
    expect(result).not.toBeNull();
    // Base names, not transient "…cooked/sliced"; multi-input dressing keeps
    // its own name; the cucumber itself (our output) is excluded.
    expect(result!.combinesWith.sort()).toEqual(
      [
        "asian peanut dressing",
        "frozen edamame",
        "frozen shrimp",
        "green onion",
        "soba noodles",
      ].sort()
    );
  });

  it("falls back to the stored product's own name when no container_type is set", () => {
    const { g, S } = sobaGraph(); // no container
    expect(deriveConvergence(S.sliceCucumber, g)!.destination).toBe(
      "peanut soba salad"
    );
  });

  it("prefers the container_type name over the product name when set", () => {
    const { g, S } = sobaGraph({ container: "large deli container" });
    expect(deriveConvergence(S.sliceCucumber, g)!.destination).toBe(
      "large deli container"
    );
  });

  it("also surfaces convergence from a cook step (soba cooked meets the rest)", () => {
    const { g, S } = sobaGraph();
    const result = deriveConvergence(S.cookSoba, g);
    expect(result!.combinesWith).toContain("frozen shrimp");
    expect(result!.combinesWith).toContain("cucumber");
    expect(result!.combinesWith).not.toContain("soba noodles"); // itself excluded
  });

  it("returns null for the terminal assembly (nothing downstream to combine into)", () => {
    const { g, S } = sobaGraph();
    expect(deriveConvergence(S.toss, g)).toBeNull();
  });
});

describe("deriveConvergence — edge cases", () => {
  it("returns null when the only consuming step has no other inputs (pure pass-through)", () => {
    const raw = node("carrot", ProductType.Raw);
    const diced = node("carrot diced", ProductType.Transient);
    const soup = node("soup", ProductType.Stored);
    const g = graph(
      [raw, diced, soup],
      [
        [raw.id, "step-dice"],
        [diced.id, "step-cook"], // sole input to cook
      ],
      [
        ["step-dice", diced.id],
        ["step-cook", soup.id],
      ]
    );
    expect(deriveConvergence("step-dice", g)).toBeNull();
  });

  it("returns null for a step with no outputs at all", () => {
    const g = graph([], [], []);
    expect(deriveConvergence("nonexistent", g)).toBeNull();
  });

  it("walks multiple hops to find the final container through a sub-assembly", () => {
    // raw A -> prep -> A' -> subAssembly (+ B') -> sub -> finalAssembly (+ C) -> jar[container]
    const aRaw = node("A", ProductType.Raw);
    const aPrepped = node("A prepped", ProductType.Transient);
    const bРrepped = node("B prepped", ProductType.Transient);
    const bRaw = node("B", ProductType.Raw);
    const sub = node("sub mix", ProductType.Transient);
    const c = node("C", ProductType.Raw);
    const jar = node("final jar", ProductType.Stored, "mason jar");
    const g = graph(
      [aRaw, aPrepped, bRaw, bРrepped, sub, c, jar],
      [
        [aRaw.id, "prep-a"],
        [bRaw.id, "prep-b"],
        [aPrepped.id, "sub-assembly"],
        [bРrepped.id, "sub-assembly"],
        [sub.id, "final-assembly"],
        [c.id, "final-assembly"],
      ],
      [
        ["prep-a", aPrepped.id],
        ["prep-b", bРrepped.id],
        ["sub-assembly", sub.id],
        ["final-assembly", jar.id],
      ]
    );
    const result = deriveConvergence("prep-a", g);
    // Direct convergence at sub-assembly is with B (base name).
    expect(result!.combinesWith).toContain("B");
    // Destination chases past the transient sub-mix to the mason jar.
    expect(result!.destination).toBe("mason jar");
  });
});
