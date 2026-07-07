import { describe, expect, it } from "vitest";
import { formatWeekOf, getUpcomingMonday } from "./dates";

describe("getUpcomingMonday", () => {
  it("returns the same date when `from` is already a Monday", () => {
    // 2026-07-06 is a Monday
    expect(getUpcomingMonday(new Date(2026, 6, 6))).toBe("2026-07-06");
  });

  it("returns the next Monday when `from` is mid-week", () => {
    // 2026-07-08 is a Wednesday -> next Monday is 2026-07-13
    expect(getUpcomingMonday(new Date(2026, 6, 8))).toBe("2026-07-13");
  });

  it("returns the next Monday when `from` is a Sunday", () => {
    // 2026-07-12 is a Sunday -> next Monday is 2026-07-13
    expect(getUpcomingMonday(new Date(2026, 6, 12))).toBe("2026-07-13");
  });
});

describe("formatWeekOf", () => {
  it("formats a space-separated PocketBase date string", () => {
    expect(formatWeekOf("2026-07-06 00:00:00.000Z")).toBe("Week of Jul 6, 2026");
  });

  it("formats a T-separated ISO date string", () => {
    expect(formatWeekOf("2026-07-06T00:00:00.000Z")).toBe("Week of Jul 6, 2026");
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(formatWeekOf(null)).toBe("");
    expect(formatWeekOf(undefined)).toBe("");
    expect(formatWeekOf("")).toBe("");
  });

  it("returns empty string for malformed input (T-04-08b guard)", () => {
    expect(formatWeekOf("not-a-date")).toBe("");
  });
});
