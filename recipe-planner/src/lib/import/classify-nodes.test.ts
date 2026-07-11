import { describe, it, expect } from "vitest";
import { classifyImportNodes } from "./classify-nodes";
import type { NormalizedGraph } from "./validate-import";

function graph(partial: Partial<NormalizedGraph>): NormalizedGraph {
  return {
    recipe: { name: "R" },
    productNodes: [],
    steps: [],
    edges: [],
    tagIds: [],
    ...partial,
  } as NormalizedGraph;
}

describe("classifyImportNodes", () => {
  it("marks a leaf input never produced by a step as raw", () => {
    const g = graph({
      productNodes: [{ ref: "product-tomato", name: "tomato", unit: "each" }],
      steps: [{ ref: "step-combine", name: "combine", step_type: "assembly" }],
      edges: [{ from: "product-tomato", to: "step-combine" }],
    });
    expect(classifyImportNodes(g)["product-tomato"]).toBe("raw");
  });

  it("marks a terminal step output (produced, not consumed) as stored", () => {
    const g = graph({
      productNodes: [
        { ref: "product-tomato", name: "tomato", unit: "each" },
        { ref: "product-salad", name: "salad", unit: "each" },
      ],
      steps: [{ ref: "step-combine", name: "combine", step_type: "assembly" }],
      edges: [
        { from: "product-tomato", to: "step-combine" },
        { from: "step-combine", to: "product-salad" },
      ],
    });
    const roles = classifyImportNodes(g);
    expect(roles["product-salad"]).toBe("stored");
    expect(roles["product-tomato"]).toBe("raw");
  });

  it("marks an intermediate (produced AND consumed) as transient", () => {
    const g = graph({
      productNodes: [
        { ref: "product-parsley", name: "parsley", unit: "each" },
        { ref: "product-parsley-chopped", name: "parsley chopped", unit: "cup" },
        { ref: "product-salad", name: "salad", unit: "each" },
      ],
      steps: [
        { ref: "step-chop", name: "chop", step_type: "prep" },
        { ref: "step-combine", name: "combine", step_type: "assembly" },
      ],
      edges: [
        { from: "product-parsley", to: "step-chop" },
        { from: "step-chop", to: "product-parsley-chopped" },
        { from: "product-parsley-chopped", to: "step-combine" },
        { from: "step-combine", to: "product-salad" },
      ],
    });
    const roles = classifyImportNodes(g);
    expect(roles["product-parsley"]).toBe("raw");
    expect(roles["product-parsley-chopped"]).toBe("transient");
    expect(roles["product-salad"]).toBe("stored");
  });
});
