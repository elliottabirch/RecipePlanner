/**
 * Controlled prep-action vocabulary — the SINGLE source of truth for the
 * `recipe_steps.prep_action` field (E1, `.planning/notes/E1-derived-step-labels-
 * proposal.md`). Replaces the 3-way-duplicated `PREP_VERBS` string list that
 * previously lived (copied) in the linter, RecipeEditor, and the schema script.
 *
 * Each action key maps to TWO grammatical display forms (user decision
 * 2026-07-18):
 *   - `verb`  — imperative, for a STEP TITLE   ("dice onion", "process broccoli")
 *   - `state` — past-participle, for a PREP-STATE OUTPUT PRODUCT name
 *               ("diced onion", "processed broccoli")
 * Irregular forms (brunoise, chiffonade) live in the map rather than being
 * auto-suffixed. One DB field (the key); the forms are display-only.
 *
 * The vocabulary is a single FLAT enum — size is baked into the key
 * (`small_dice`/`large_dice` are distinct values, not a separate `size` field).
 */

export const PREP_ACTIONS = {
  dice: { verb: "dice", state: "diced" },
  small_dice: { verb: "small dice", state: "small-diced" },
  large_dice: { verb: "large dice", state: "large-diced" },
  fine_dice: { verb: "fine dice", state: "fine-diced" },
  brunoise: { verb: "brunoise", state: "brunoised" },
  slice: { verb: "slice", state: "sliced" },
  thin_slice: { verb: "thinly slice", state: "thinly sliced" },
  chiffonade: { verb: "chiffonade", state: "chiffonade" },
  chop: { verb: "chop", state: "chopped" },
  mince: { verb: "mince", state: "minced" },
  shred: { verb: "shred", state: "shredded" },
  grate: { verb: "grate", state: "grated" },
  halve: { verb: "halve", state: "halved" },
  quarter: { verb: "quarter", state: "quartered" },
  zest: { verb: "zest", state: "zested" },
  juice: { verb: "juice", state: "juiced" },
  trim: { verb: "trim", state: "trimmed" },
  peel: { verb: "peel", state: "peeled" },
  process: { verb: "process", state: "processed" },
  pull: { verb: "pull", state: "pulled" },
} as const;

export type PrepAction = keyof typeof PREP_ACTIONS;

/** All action keys, in declaration order — for the editor Select, the schema
 *  `select` values, and backfill mapping. */
export const PREP_ACTION_KEYS = Object.keys(PREP_ACTIONS) as PrepAction[];

/** The past-participle STATE words (diced, sliced, …) — used by the prep-words
 *  linter to flag prep vocabulary leaking into raw product names. Derived from
 *  the one map so the linter can never drift from the vocabulary. */
export const PREP_STATE_WORDS: string[] = PREP_ACTION_KEYS.map(
  (k) => PREP_ACTIONS[k].state
);

/** Narrowing guard: is `value` a known prep-action key? (PocketBase stores an
 *  un-set `prep_action` as `""`, which is correctly rejected here.) */
export function isPrepAction(value: string | undefined | null): value is PrepAction {
  return !!value && Object.prototype.hasOwnProperty.call(PREP_ACTIONS, value);
}

/** Imperative verb form for a step title, e.g. `pull` -> "pull". */
export function actionVerb(action: PrepAction): string {
  return PREP_ACTIONS[action].verb;
}

/** Past-participle state form for a prep-state output product, e.g.
 *  `pull` -> "pulled". */
export function actionState(action: PrepAction): string {
  return PREP_ACTIONS[action].state;
}

/**
 * Derives a step's DISPLAY TITLE. When the step carries a known `prep_action`
 * AND we know its single input product, the title is derived as
 * `"{verb} {input}"` — swap-aware for free, because a swap re-points the input
 * product (variant-utils `applyVariantOverrides`) and this re-derives from it.
 * Otherwise (no action, unknown action, or unknown input — i.e. the
 * instructional cook/assembly steps that keep their prose) the authored
 * `step.name` is returned unchanged. This is the hybrid model: derive only
 * where opted in.
 */
export function deriveStepLabel(
  step: { name: string; prep_action?: string },
  inputProductName?: string | null
): string {
  if (isPrepAction(step.prep_action) && inputProductName) {
    return `${actionVerb(step.prep_action)} ${inputProductName}`;
  }
  return step.name;
}

/**
 * Derives a prep-state OUTPUT product name as `"{state} {base}"`
 * (e.g. base "onion (yellow)" + `small_dice` -> "small-diced onion (yellow)").
 * Layer 2 (E1-b, Option A). Returns `null` for an unknown action so callers can
 * fall back to the authored product name.
 */
export function derivePrepStateName(
  baseProductName: string,
  action: string | undefined
): string | null {
  if (!isPrepAction(action)) return null;
  return `${actionState(action)} ${baseProductName}`;
}
