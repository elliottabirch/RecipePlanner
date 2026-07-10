/**
 * Missing-durations rule (PREP-06 rule b). A step with neither
 * `active_minutes` nor `passive_minutes` populated cannot be placed on the
 * GA scheduler's timeline (D-06 needs at least one duration to compute the
 * active-session span). Per-step scope — no week-graph or cross-recipe
 * context needed, unlike the missing-pull-step rule (D-07).
 */
import type { LintFinding } from "../index";
import type { RecipeStep } from "../../types";

export function lintMissingDurations(steps: RecipeStep[]): LintFinding[] {
  return steps
    .filter((step) => step.active_minutes == null && step.passive_minutes == null)
    .map((step) => ({
      severity: "error",
      rule: "missing-durations",
      message: `${step.name}: missing both active_minutes and passive_minutes`,
      nodeId: step.id,
    }));
}
