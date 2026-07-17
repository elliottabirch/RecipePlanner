/**
 * Timing-coherence rule (quick task 260716-u4p). Flags an `assembly` step
 * tagged `just_in_time` that reads like make-ahead cook work, not day-of
 * work — the exact class of defect that stranded a cook mid-week: Mushroom
 * Bourguignon's `Simmer bourguignon` (8a/35p) and both spaghetti recipes'
 * `create spaghetti` (8a/15p) were all mis-tagged `just_in_time` when the
 * recipe-import skill's own convention says "simmering" is the CANONICAL
 * `batch` example (`SKILL.md:415-426`).
 *
 * READ FIRST — the rule as originally scoped ("an assembly step with
 * meaningful passive_minutes tagged just_in_time is at least a warning",
 * i.e. `passive_minutes >= 5` ALONE) produces **10 findings against live
 * prod, ALL false positives**: `cook salmon` (8p), `cook hamburger patties`
 * (10p), `cook lasagna` (45p), `cook garlic chicken` (20p), `assemble
 * roasting veg and cook salmon` (8p), `assemble tuna salad sandwiches` (5p),
 * `Warm pitas in oven` (5p), `bake french fries` (22p), `Cook egg noodles`
 * (8p), `Bake cod (day-of)` (12p) — every one a step the mis-tag audit
 * blessed by hand as correctly JIT. And a `warning` is NOT advisory here:
 * `RecipeEditor.tsx:767` (`if (lintFindings.length > 0)`) is severity-blind,
 * so shipping the rule as scoped would make all ten of those recipes
 * unpublishable. See the new todo
 * `.planning/todos/pending/2026-07-16-publish-gate-is-severity-blind.md` —
 * that defect is real but out of scope here; the 0-FP bar below is a HARD
 * requirement precisely because there is no non-blocking way to ship a
 * warning.
 *
 * Why the conjunction (passive time cannot separate the two classes alone).
 * `cook lasagna` is 45p and correctly `just_in_time` (a heat-and-eat bake),
 * while `Simmer bourguignon` was 35p and WRONG. Passive duration alone says
 * nothing about make-ahead vs. day-of; a verb is needed too.
 *
 * Why `MAKE_AHEAD_VERBS` is `/simmer|braise|stew/i` and not more.
 * `roast` was explicitly considered and DROPPED: adding it flags `cook
 * garlic chicken` (20p) and `assemble roasting veg and cook salmon` (8p) —
 * both correctly JIT — and catches nothing extra in the historical mis-tag
 * set. `bake` is worse: it additionally flags `cook lasagna`, `bake french
 * fries`, and `Bake cod (day-of)`. **A future reader must not widen this
 * verb list without re-running the prod measurement** (see
 * timing-coherence.test.ts's `PROD_JIT_2026_07_16` fixture — it is the
 * executable form of this argument and will fail if the list is widened
 * carelessly). The verb alone (no passive gate) also isn't 0-FP on its own:
 * it matches `Serve with topping` (0p) on "Top the STEW with the
 * lemon-parsley mixture" — "stew" as a noun naming the dish, not the verb.
 * Only passive-gated AND verb-matched together are 0-FP.
 *
 * Why `MIN_PASSIVE_MINUTES = 5`. Not false-positive-constrained: 1, 5, and
 * 10 are all 0-FP once the verb conjunction is in place. 5 is the smallest
 * round value that still reads as "meaningful passive" and clears the 0p
 * prose-noun case (`Serve with topping`) with margin.
 *
 * Its blind spot, plainly — this rule CANNOT catch every historical
 * mis-tag. It catches 3 of the 5 records this plan verified (`Simmer
 * bourguignon`, and `create spaghetti` in both spaghetti recipes). It
 * structurally cannot reach `Brown mushrooms` (12a/**0p**) or `Pull garlic
 * cubes` (1a/**0p**) — both zero passive time, so no passive-gated rule
 * ever flags them. A prose-based detector (spotting "simmer"/"braise" in
 * ACTIVE-only steps) is the natural companion and is not built here.
 */
import { StepType, Timing, type RecipeStep } from "../../types";
import type { LintFinding } from "../index";

/** See header: not FP-constrained, but the smallest round value that still
 * reads as "meaningful passive" and clears the 0p prose-noun case. */
export const MIN_PASSIVE_MINUTES = 5;

/** See header: `roast` and `bake` are deliberately excluded — both add
 * false positives against live prod and catch nothing extra. Do not widen
 * this without re-running the prod measurement (timing-coherence.test.ts's
 * PROD_JIT_2026_07_16 fixture pins the 0-FP bar). */
export const MAKE_AHEAD_VERBS = /simmer|braise|stew/i;

export function lintTimingCoherence(steps: RecipeStep[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const step of steps) {
    if (step.step_type !== StepType.Assembly) continue;
    if (step.timing !== Timing.JustInTime) continue;
    const passive = step.passive_minutes ?? 0;
    if (passive < MIN_PASSIVE_MINUTES) continue;
    const haystack = `${step.name} ${step.instructions ?? ""}`;
    if (!MAKE_AHEAD_VERBS.test(haystack)) continue;

    const matched = haystack.match(MAKE_AHEAD_VERBS)?.[0] ?? "";
    findings.push({
      severity: "warning",
      rule: "timing-coherence",
      message:
        `${step.name}: tagged just_in_time but has ${passive} passive minutes ` +
        `and reads like make-ahead work (matched "${matched}"). A weekly ` +
        `meal's cook steps are batch unless the dish is ruined by being made ` +
        `ahead — "simmering" is the import skill's own canonical batch example ` +
        `(SKILL.md:415-426). If this step genuinely must happen the night you ` +
        `eat it, dismiss this warning; otherwise retag it batch.`,
      nodeId: step.id,
    });
  }

  return findings;
}
