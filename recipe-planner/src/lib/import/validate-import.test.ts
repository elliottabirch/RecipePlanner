import { describe, it, expect } from "vitest";
import { validateImportJson } from "./validate-import";

/** A minimal fully-valid import payload; individual tests mutate a clone. */
function validPayload() {
  return {
    recipe: { name: "Hummus", notes: "creamy", recipe_type: "batch_prep" },
    tags: ["tag-1"],
    products: [
      {
        ref: "product-1",
        name: "Garbanzo Beans",
        unit: "g",
        quantity: 400,
        matchProductId: "prod-abc",
        productType: "raw",
        pantry: true,
        fdcId: 173756,
        store: "store-1",
        section: "section-1",
      },
      { ref: "product-2", name: "Tahini", unit: "g", quantity: 60 },
    ],
    steps: [
      {
        ref: "step-1",
        name: "Blend",
        step_type: "prep",
        timing: "batch",
        active_minutes: 5,
        passive_minutes: 0,
        instructions: "Blend until smooth",
        prep_action: "blend",
        resource: "blender",
      },
    ],
    edges: [
      { from: "product-1", to: "step-1" },
      { from: "product-2", to: "step-1" },
    ],
  };
}

describe("validateImportJson — never-throw contract normalizer", () => {
  it("returns ok:false with a parse error for malformed JSON, never throws", () => {
    const result = validateImportJson("{ not valid json ]");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors.some((e) => /json|parse/i.test(e.message))).toBe(true);
    }
  });

  it("never throws for any pathological input", () => {
    const inputs: unknown[] = [
      undefined,
      null,
      42,
      "",
      "[]",
      "null",
      "\"just a string\"",
      {},
      { products: "not-an-array" },
      { products: [null], steps: [undefined], edges: ["nope"] },
      [1, 2, 3],
    ];
    for (const input of inputs) {
      expect(() => validateImportJson(input)).not.toThrow();
    }
  });

  it("surfaces a product line missing name as an error, no graph returned", () => {
    const p = validPayload();
    delete (p.products[0] as { name?: string }).name;
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /name/i.test(e.message))).toBe(true);
    }
  });

  it("surfaces a product line missing unit as an error", () => {
    const p = validPayload();
    delete (p.products[1] as { unit?: string }).unit;
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /unit/i.test(e.message))).toBe(true);
    }
  });

  it("surfaces a step missing step_type as an error", () => {
    const p = validPayload();
    delete (p.steps[0] as { step_type?: string }).step_type;
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /step_type/i.test(e.message))).toBe(true);
    }
  });

  it("surfaces a step with an invalid step_type as an error", () => {
    const p = validPayload();
    (p.steps[0] as { step_type: string }).step_type = "garnish";
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
  });

  it("surfaces a dangling edge ref naming the missing node", () => {
    const p = validPayload();
    p.edges.push({ from: "product-1", to: "step-999" });
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes("step-999"))).toBe(true);
    }
  });

  it("rejects an edge connecting two product nodes (incoherent direction, WR-02)", () => {
    const p = validPayload();
    p.edges.push({ from: "product-1", to: "product-2" });
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => /two product nodes/i.test(e.message) && e.message.includes("product-1")
        )
      ).toBe(true);
    }
  });

  it("rejects an edge connecting two step nodes (incoherent direction, WR-02)", () => {
    const p = validPayload();
    p.steps.push({ ref: "step-2", name: "Chill", step_type: "assembly" });
    p.edges.push({ from: "step-1", to: "step-2" });
    const result = validateImportJson(p);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /two step nodes/i.test(e.message))).toBe(true);
    }
  });

  it("accepts both product→step and step→product coherent edges", () => {
    const p = validPayload();
    // add a step→product edge (e.g. a step producing an output product)
    p.products.push({ ref: "product-3", name: "Hummus", unit: "g", quantity: 460 });
    p.edges.push({ from: "step-1", to: "product-3" });
    const result = validateImportJson(p);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.edges).toContainEqual({ from: "step-1", to: "product-3" });
    }
  });

  it("normalizes an unknown resource enum to undefined with a warning, graph still ok", () => {
    const p = validPayload();
    (p.steps[0] as { resource: string }).resource = "laser-oven";
    const result = validateImportJson(p);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.steps[0].resource).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.warnings.some(
          (w) => w.severity === "warning" && /resource/i.test(w.message)
        )
      ).toBe(true);
    }
  });

  it("normalizes an unknown timing enum to undefined with a warning", () => {
    const p = validPayload();
    (p.steps[0] as { timing: string }).timing = "someday";
    const result = validateImportJson(p);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.steps[0].timing).toBeUndefined();
      expect(result.warnings.some((w) => /timing/i.test(w.message))).toBe(true);
    }
  });

  it("round-trips a fully-valid graph with product hints, step fields and edges", () => {
    const result = validateImportJson(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const g = result.graph;
      expect(g.recipe.name).toBe("Hummus");
      expect(g.recipe.recipe_type).toBe("batch_prep");
      expect(g.productNodes).toHaveLength(2);
      const p1 = g.productNodes[0];
      expect(p1).toMatchObject({
        ref: "product-1",
        name: "Garbanzo Beans",
        unit: "g",
        quantity: 400,
        matchProductId: "prod-abc",
        productType: "raw",
        pantry: true,
        fdcId: 173756,
        store: "store-1",
        section: "section-1",
      });
      expect(g.steps[0]).toMatchObject({
        ref: "step-1",
        name: "Blend",
        step_type: "prep",
        timing: "batch",
        active_minutes: 5,
        resource: "blender",
      });
      expect(g.edges).toEqual([
        { from: "product-1", to: "step-1" },
        { from: "product-2", to: "step-1" },
      ]);
      expect(result.warnings).toHaveLength(0);
    }
  });

  it("accepts an already-parsed object identically to its JSON string form", () => {
    const obj = validPayload();
    const fromObj = validateImportJson(obj);
    const fromStr = validateImportJson(JSON.stringify(obj));
    expect(fromObj.ok).toBe(true);
    expect(fromStr.ok).toBe(true);
    if (fromObj.ok && fromStr.ok) {
      expect(fromStr.graph).toEqual(fromObj.graph);
    }
  });

  it("assigns product-*/step-* refs when the input omits them", () => {
    const p = validPayload();
    delete (p.products[0] as { ref?: string }).ref;
    delete (p.steps[0] as { ref?: string }).ref;
    // rewire edges to the auto-assigned refs
    p.edges = [{ from: "product-1", to: "step-1" }];
    const result = validateImportJson(p);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.productNodes[0].ref).toBe("product-1");
      expect(result.graph.steps[0].ref).toBe("step-1");
    }
  });
});
