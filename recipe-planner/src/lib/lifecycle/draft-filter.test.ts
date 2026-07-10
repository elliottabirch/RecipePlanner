import { describe, expect, it } from "vitest";
import {
  DRAFT_EXCLUDING_FILTER,
  buildDraftExcludingFilter,
  isPlannable,
} from "./draft-filter";

describe("draft-filter — fail-open draft exclusion (D-04, IMP-01)", () => {
  it("emits the not-equals-draft (fail-open) form, never equals-published", () => {
    expect(DRAFT_EXCLUDING_FILTER).toBe('status != "draft"');
    // The fail-closed equals-published form silently drops unset-status rows.
    expect(DRAFT_EXCLUDING_FILTER).not.toContain('status = "published"');
    expect(DRAFT_EXCLUDING_FILTER).not.toContain('status="published"');
  });

  it("buildDraftExcludingFilter() returns the same fail-open filter string", () => {
    expect(buildDraftExcludingFilter()).toBe('status != "draft"');
    expect(buildDraftExcludingFilter()).toBe(DRAFT_EXCLUDING_FILTER);
  });

  describe("isPlannable — false only when status is exactly draft", () => {
    it("keeps published recipes plannable", () => {
      expect(isPlannable("published")).toBe(true);
    });

    it("keeps unset/empty status plannable (fail-open — Pitfall 1)", () => {
      expect(isPlannable(undefined)).toBe(true);
      expect(isPlannable("")).toBe(true);
    });

    it("excludes draft recipes", () => {
      expect(isPlannable("draft")).toBe(false);
    });

    it("keeps any other/unknown status plannable (fail-open)", () => {
      expect(isPlannable("archived")).toBe(true);
    });
  });
});
