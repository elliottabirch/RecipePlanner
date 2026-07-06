import { describe, it, expect } from "vitest";
import { runLint, type ProductExpanded } from "./index";
import { SECTION_REQUIRED_STORES } from "./rules/missing-store-section";
import { ProductType } from "../types";
import type { Store, Section } from "../types";

function baseRecord(idSuffix: string) {
  return {
    id: `test-${idSuffix}`,
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    collectionId: "products",
    collectionName: "products",
  };
}

function makeStore(name: string): Store {
  return { ...baseRecord(`store-${name}`), name };
}

function makeSection(name: string): Section {
  return { ...baseRecord(`section-${name}`), name };
}

function makeProduct(overrides: Partial<ProductExpanded> = {}): ProductExpanded {
  return {
    ...baseRecord("product"),
    name: "test product",
    type: ProductType.Raw,
    pantry: false,
    canonical_unit: "each",
    expand: {
      store: makeStore("costco"),
    },
    nodes: [{ unit: "each" }],
    ...overrides,
  };
}

describe("cross-dimension rule", () => {
  it("flags a product whose node units span multiple dimensions", () => {
    const product = makeProduct({
      canonical_unit: undefined,
      nodes: [{ unit: "cup" }, { unit: "lb" }],
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(1);
  });

  it("flags a product whose node units are not convertible to its canonical_unit", () => {
    const product = makeProduct({
      canonical_unit: "cup",
      nodes: [{ unit: "lb" }],
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a product with consistent-dimension units convertible to canonical_unit", () => {
    const product = makeProduct({
      canonical_unit: "cup",
      nodes: [{ unit: "cup" }, { unit: "tbsp" }],
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "cross-dimension"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("prep-words rule", () => {
  it("flags a raw product name containing a controlled prep verb", () => {
    const product = makeProduct({ type: ProductType.Raw, name: "onion sliced" });
    const findings = runLint([product]).filter((f) => f.rule === "prep-words");
    expect(findings).toHaveLength(1);
  });

  it("flags a raw product name with a (raw) suffix", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      name: "chicken breast (raw)",
    });
    const findings = runLint([product]).filter((f) => f.rule === "prep-words");
    expect(findings).toHaveLength(1);
  });

  it("does not flag a clean raw product name", () => {
    const product = makeProduct({ type: ProductType.Raw, name: "onion" });
    const findings = runLint([product]).filter((f) => f.rule === "prep-words");
    expect(findings).toHaveLength(0);
  });
});

describe("missing-store-section rule", () => {
  it("SECTION_REQUIRED_STORES contains only safeway", () => {
    expect([...SECTION_REQUIRED_STORES]).toEqual(["safeway"]);
  });

  it("flags a non-pantry, non-transient product with no store", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: {},
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(1);
  });

  it("flags a safeway product with no section", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("safeway") },
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a costco/trader joes/online product with no section", () => {
    const costco = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("costco") },
    });
    const traderJoes = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("trader joes") },
    });
    const online = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("online") },
    });
    const findings = runLint([costco, traderJoes, online]).filter(
      (f) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(0);
  });

  it("does not flag a safeway product that has a section", () => {
    const product = makeProduct({
      type: ProductType.Raw,
      pantry: false,
      expand: { store: makeStore("safeway"), section: makeSection("produce") },
    });
    const findings = runLint([product]).filter(
      (f) => f.rule === "missing-store-section"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("missing-canonical-unit rule", () => {
  it("flags a non-pantry product with null canonical_unit", () => {
    const product = makeProduct({ pantry: false, canonical_unit: undefined });
    const findings = runLint([product]).filter(
      (f) => f.rule === "missing-canonical-unit"
    );
    expect(findings).toHaveLength(1);
  });

  it("does not flag a product with canonical_unit set", () => {
    const product = makeProduct({ pantry: false, canonical_unit: "each" });
    const findings = runLint([product]).filter(
      (f) => f.rule === "missing-canonical-unit"
    );
    expect(findings).toHaveLength(0);
  });
});

describe("fully-clean product", () => {
  it("produces zero findings across all rules", () => {
    const product = makeProduct({
      name: "onion",
      type: ProductType.Raw,
      pantry: false,
      canonical_unit: "each",
      expand: { store: makeStore("costco") },
      nodes: [{ unit: "each" }],
    });
    expect(runLint([product])).toHaveLength(0);
  });
});
