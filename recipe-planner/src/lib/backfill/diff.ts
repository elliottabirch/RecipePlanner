/**
 * Pure diff/apply core for the in-app AI-backfill review flow (PREP-02,
 * 05-CONTEXT.md "Claude's Discretion" backfill delivery surface). Given the
 * Plan-04 offline draft, the current recipe_steps rows, and the human's
 * per-field decisions, computes the exact partial write-set to send to
 * PocketBase: idempotent (only touches steps still missing a field the
 * draft supplies), approval-only (a field enters the write-set only when
 * accepted or edited -- never on draft presence alone). No PocketBase or
 * React imports -- the page (StepBackfill.tsx) is a thin shell over this.
 */
import type { RecipeStep } from "../types";

export const BACKFILL_FIELDS = [
  "active_minutes",
  "passive_minutes",
  "instructions",
  "prep_action",
  "resource",
  "oven_temp_f",
  "rack_slots",
] as const;

export type BackfillFieldKey = (typeof BACKFILL_FIELDS)[number];

/** Shape of one entry in step-backfill-draft.json, keyed by recipe_steps.id. */
export interface BackfillDraftEntry {
  active_minutes: number | null;
  passive_minutes: number | null;
  instructions: string | null;
  prep_action: string | null;
  resource: RecipeStep["resource"] | null;
  oven_temp_f: number | null;
  rack_slots: number | null;
}

export type FieldDecision =
  | { status: "accept" }
  | { status: "edit"; value: unknown }
  | { status: "reject" };

/** Per-step, per-field human decisions collected by the review page. */
export type StepDecisions = Partial<Record<BackfillFieldKey, FieldDecision>>;

/** recipe_steps.id -> partial field object ready for update(). */
export type BackfillWriteSet = Record<string, Partial<RecipeStep>>;

function isMissing(value: unknown): boolean {
  return value === null || value === undefined;
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A step is "unbackfilled" when it carries no real Phase-5 metadata yet.
 *
 * PocketBase stores un-set number fields as `0` and un-set text/select fields
 * as `""` (NOT null), so a plain null check reports every freshly-migrated
 * step as already-populated. This treats those defaults as empty: a step
 * counts as backfilled once ANY of its duration/instruction/prep/resource
 * fields holds a meaningful (non-default) value. Idempotent — once a batch is
 * saved, its steps stop matching and drop out of the review list.
 * (`rack_slots` is intentionally excluded: its backfilled default of 1 vs. the
 * PB default of 0 makes it an unreliable "untouched" signal on its own.)
 */
export function isStepUnbackfilled(step: RecipeStep): boolean {
  return (
    !step.active_minutes &&
    !step.passive_minutes &&
    !step.oven_temp_f &&
    !nonEmptyString(step.instructions) &&
    !nonEmptyString(step.prep_action) &&
    !nonEmptyString(step.resource)
  );
}

/**
 * Compute the write-set for a reviewed batch. A step is included only if it
 * is still missing at least one field the draft supplies (idempotency --
 * fully-populated steps are excluded entirely, so re-running backfill on an
 * already-complete recipe yields an empty write-set). Within an included
 * step, only accepted or edited fields are written: rejected fields (or
 * fields with no decision yet) are omitted, edited fields use the edited
 * value instead of the drafted value.
 */
export function computeBackfillWriteSet(
  draftEntries: Record<string, BackfillDraftEntry>,
  currentSteps: RecipeStep[],
  decisions: Record<string, StepDecisions>
): BackfillWriteSet {
  const writeSet: BackfillWriteSet = {};

  for (const step of currentSteps) {
    const draft = draftEntries[step.id];
    if (!draft) continue;

    // Idempotency at the step level: a step already carrying real metadata
    // (any non-default field) is skipped entirely, so re-running backfill on
    // an already-reviewed recipe yields an empty write-set. This replaces a
    // per-field null check that mis-read PocketBase's 0/"" field defaults as
    // "already populated" (which made every step look done).
    if (!isStepUnbackfilled(step)) continue;

    const stepDecisions = decisions[step.id] ?? {};
    const fields: Record<string, unknown> = {};

    for (const field of BACKFILL_FIELDS) {
      const draftValue = draft[field];
      if (isMissing(draftValue)) continue; // draft doesn't supply this field

      const decision = stepDecisions[field];
      if (!decision || decision.status === "reject") continue;

      fields[field] = decision.status === "edit" ? decision.value : draftValue;
    }

    if (Object.keys(fields).length > 0) {
      writeSet[step.id] = fields as Partial<RecipeStep>;
    }
  }

  return writeSet;
}
