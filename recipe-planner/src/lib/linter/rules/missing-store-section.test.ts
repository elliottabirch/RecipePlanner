import { describe, it, expect } from "vitest";
import { lintMissingStoreSection } from "./missing-store-section";
import type { ProductExpanded } from "../index";
import { ProductType } from "../../types";

function product(
  name: string,
  type: ProductType,
  opts: { store?: string; section?: string; pantry?: boolean } = {}
): ProductExpanded {
  return {
    id: name,
    name,
    type,
    pantry: opts.pantry ?? false,
    expand: {
      store: opts.store
        ? ({ id: opts.store, name: opts.store } as never)
        : undefined,
      section: opts.section
        ? ({ id: opts.section, name: opts.section } as never)
        : undefined,
    },
  } as unknown as ProductExpanded;
}

describe("lintMissingStoreSection", () => {
  it("flags a raw product with no store (you buy it)", () => {
    const findings = lintMissingStoreSection([
      product("olive oil", ProductType.Raw),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("missing store");
  });

  it("does NOT flag a stored recipe output with no store (it is made, not bought)", () => {
    const findings = lintMissingStoreSection([
      product("chickpea salad", ProductType.Stored),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag a transient intermediate with no store", () => {
    const findings = lintMissingStoreSection([
      product("parsley chopped", ProductType.Transient),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag an inventory item with no store (stocked/made, not per-shop bought)", () => {
    const findings = lintMissingStoreSection([
      product("garlic cubes (frozen)", ProductType.Inventory),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("does NOT flag a pantry product with no store", () => {
    const findings = lintMissingStoreSection([
      product("salt", ProductType.Raw, { pantry: true }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("flags a raw product at a section-required store with no section", () => {
    const findings = lintMissingStoreSection([
      product("tomato", ProductType.Raw, { store: "safeway" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("requires a section");
  });

  it("does NOT flag a raw product at a non-section store with no section", () => {
    const findings = lintMissingStoreSection([
      product("tomato", ProductType.Raw, { store: "costco" }),
    ]);
    expect(findings).toHaveLength(0);
  });
});
