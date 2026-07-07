import { describe, it, expect } from "vitest";
import { resolvePlanDate } from "./backfill-plan-dates.js";

// ============================================================================
// Wave 0 RED scaffold (04-01-PLAN.md Task 3). `./backfill-plan-dates.js`
// does not exist yet — this whole file is expected to fail on the missing
// import until 04-05 (backfill resolver) lands. Pure-resolver-only test
// pattern per `scripts/seed-usda.test.js` — no live PocketBase DB, per
// WEEK-01 / 04-RESEARCH.md Runtime State Inventory + Open Question 1.
//
// Contract: resolvePlanDate(plan, index, baseMonday) is a pure function.
//   - `plan` is a plain { id, name, created } record (no live PB record
//     shape assumed beyond these three fields).
//   - When `plan.name` matches "Week of <Month> <Day>, <Year>" it parses
//     that calendar date and rounds BACK to the Monday of that week
//     (never forward) — see phase-doc §3.6 / item 1b, A2 regex-only parse.
//   - Otherwise it falls back to `baseMonday` minus `index * 7` days. The
//     caller (main(), thin PocketBase wiring, not part of this pure
//     function's surface) is responsible for sorting the live plan list
//     descending by `created` (ties broken by `id` ascending) and passing
//     each plan's position in that order as `index` (0 = most recently
//     created plan, gets the most recent/base Monday).
// ============================================================================

const BASE_MONDAY = "2026-07-06"; // a real Monday, used as the fallback anchor

function planFixture(overrides = {}) {
  return {
    id: "plan_1",
    name: null,
    created: "2026-01-01 00:00:00.000Z",
    ...overrides,
  };
}

describe("resolvePlanDate — 'Week of ...' parse path", () => {
  it('parses "Week of Jan 6, 2026" and rounds back to that week\'s Monday (2026-01-05)', () => {
    const plan = planFixture({ id: "plan_named", name: "Week of Jan 6, 2026" });

    const result = resolvePlanDate(plan, 0, BASE_MONDAY);

    expect(result).toBe("2026-01-05");
  });

  it("parses a name whose date IS already a Monday and leaves it unchanged", () => {
    const plan = planFixture({ id: "plan_named_2", name: "Week of Jan 5, 2026" });

    const result = resolvePlanDate(plan, 0, BASE_MONDAY);

    expect(result).toBe("2026-01-05");
  });
});

describe("resolvePlanDate — descending-Mondays fallback path", () => {
  it("a non-matching name falls back to baseMonday minus 7*index days", () => {
    const plan = planFixture({ id: "plan_unnamed", name: "My Custom Plan Name" });

    expect(resolvePlanDate(plan, 0, BASE_MONDAY)).toBe("2026-07-06");
    expect(resolvePlanDate(plan, 1, BASE_MONDAY)).toBe("2026-06-29");
    expect(resolvePlanDate(plan, 2, BASE_MONDAY)).toBe("2026-06-22");
  });

  it("a null/empty name always falls back (never throws on a missing name)", () => {
    const plan = planFixture({ id: "plan_blank", name: "" });

    expect(resolvePlanDate(plan, 3, BASE_MONDAY)).toBe("2026-06-15");
  });

  it("descending-Mondays assignment is monotonic and deterministic across the caller's sort, tie-broken by id asc for equal created timestamps", () => {
    // Caller-side sort contract exercised directly here (main() itself is
    // thin PocketBase wiring, not part of this pure function's surface):
    // descending by `created`, ties broken by `id` ascending.
    const plans = [
      planFixture({ id: "z-id", name: "", created: "2026-06-01 00:00:00.000Z" }),
      planFixture({ id: "a-id", name: "", created: "2026-06-01 00:00:00.000Z" }), // tie with z-id
      planFixture({ id: "b-id", name: "", created: "2026-05-01 00:00:00.000Z" }),
    ];
    const sorted = [...plans].sort((a, b) => {
      if (a.created !== b.created) return a.created < b.created ? 1 : -1; // desc
      return a.id.localeCompare(b.id); // tie: id asc
    });
    expect(sorted.map((p) => p.id)).toEqual(["a-id", "z-id", "b-id"]);

    const dates = sorted.map((p, i) => resolvePlanDate(p, i, BASE_MONDAY));

    // Monotonic non-increasing (each successive index gets an equal-or-earlier Monday).
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
    expect(dates).toEqual(["2026-07-06", "2026-06-29", "2026-06-22"]);
  });
});
