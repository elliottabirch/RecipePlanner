/**
 * Missing-prep-action rule (PREP-06 rule c). A `prep`-type step with no
 * `prep_action` set is missing the controlled prep vocabulary the cook-mode
 * UI and backfill review rely on; assembly steps are ignored entirely (they
 * never carry `prep_action`). Per-step scope.
 */
import type { LintFinding } from "../index";
import type { RecipeStep } from "../../types";
import { StepType } from "../../types";

export function lintMissingPrepAction(steps: RecipeStep[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const step of steps) {
    if (step.step_type !== StepType.Prep) continue;
    if (step.prep_action == null) {
      findings.push({
        severity: "error",
        rule: "missing-prep-action",
        message: `${step.name}: prep step missing prep_action`,
        nodeId: step.id,
      });
    }
  }

  return findings;
}
