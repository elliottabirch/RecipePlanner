/**
 * Import JSON contract normalizer (IMP-02, D-01/D-02). Pure `src/lib` module —
 * type-only imports, no React, no side effects — mirroring the linter's style
 * so it can run under Vitest's node env.
 *
 * FIRST-CLASS INVARIANT: `validateImportJson` NEVER throws and NEVER blocks.
 * Every failure mode (malformed JSON, a product line missing name/unit, a step
 * missing step_type, a dangling edge ref) is surfaced as an `ImportError` list
 * rather than propagated — so the import UI renders problems inline and a bad
 * paste can never produce a partial graph write (threat T-06-02a/T-06-02b).
 *
 * Unknown `resource`/`timing` enum values normalize to `undefined` + a warning
 * (never a hard reject), mirroring `loadRecipe`'s `|| undefined` idiom
 * (RecipeEditor.tsx:359-366). The `product-*` / `step-*` ref convention is
 * preserved/assigned so the id-remap in Plan 04's `buildRecipeGraph` ports
 * unchanged.
 *
 * No new dependency: `ajv` (transitive @6.12.6) is deliberately NOT adopted —
 * its throw-on-invalid model fights the never-block invariant (RESEARCH
 * Alternatives Considered). The `{name + hints}` contract is small enough for
 * a hand-written normalizer.
 */

export interface ImportError {
  severity: "error" | "warning";
  message: string;
}

/** A product line after normalization — `{name + optional hints}` (D-01). */
export interface NormalizedProductNode {
  ref: string;
  name: string;
  unit: string;
  quantity?: number;
  matchProductId?: string;
  productType?: string;
  pantry?: boolean;
  fdcId?: number;
  store?: string;
  section?: string;
  // Write-path fields (Plan 06-04). Carried by the RecipeEditor→NormalizedGraph
  // build so buildRecipeGraph preserves handleSave behavior exactly; the
  // import validator does not populate these yet.
  mealDestination?: string;
  // Evolution write-back correspondence (D-10): a clone node points back at the
  // original published node's dbId so the write-back updates in place.
  sourceNode?: string;
}

/** A step after normalization — full Phase-5 metadata (D-05). */
export interface NormalizedStep {
  ref: string;
  name: string;
  step_type: "prep" | "assembly";
  timing?: "batch" | "just_in_time";
  active_minutes?: number;
  passive_minutes?: number;
  instructions?: string;
  prep_action?: string;
  resource?: string;
  oven_temp_f?: number;
  rack_slots?: number;
  // Evolution write-back correspondence (D-10), mirrors NormalizedProductNode.
  sourceNode?: string;
}

export interface NormalizedGraph {
  recipe: {
    name: string;
    notes?: string;
    recipe_type?: "meal" | "batch_prep";
    status?: "draft" | "published";
    revision_of?: string;
  };
  tagIds: string[];
  productNodes: NormalizedProductNode[];
  steps: NormalizedStep[];
  edges: { from: string; to: string }[];
}

export type ValidateImportResult =
  | { ok: true; graph: NormalizedGraph; warnings: ImportError[] }
  | { ok: false; errors: ImportError[] };

// Allowed enum sets (mirror recipe-planner/src/lib/types.ts).
const STEP_TYPES = new Set(["prep", "assembly"]);
const TIMINGS = new Set(["batch", "just_in_time"]);
const RESOURCES = new Set([
  "oven",
  "stovetop",
  "blender",
  "food_processor",
  "instant_pot",
  "microwave",
  "sous_vide",
  "smoker",
  "none",
]);
const RECIPE_TYPES = new Set(["meal", "batch_prep"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function err(message: string): ImportError {
  return { severity: "error", message };
}
function warn(message: string): ImportError {
  return { severity: "warning", message };
}

/** Coerce a value to a finite number, or undefined. Never throws. */
function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

/** Non-empty trimmed string, or undefined. */
function toNonEmptyString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v;
  return undefined;
}

/**
 * Structurally validate + normalize a pasted import payload. Accepts either a
 * raw JSON string (parsed inside try/catch) or an already-parsed object.
 * Guaranteed total: returns a result for every possible input, never throws.
 */
export function validateImportJson(raw: string | unknown): ValidateImportResult {
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];

  // 1. Parse (string) or accept (object). SyntaxError → error entry, no throw.
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return { ok: false, errors: [err(`Invalid JSON: ${detail}`)] };
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      errors: [err("Import payload must be a JSON object at the top level")],
    };
  }

  // 2. Recipe metadata.
  const recipeRaw = isPlainObject(parsed.recipe) ? parsed.recipe : {};
  const recipeName = toNonEmptyString(recipeRaw.name);
  if (!recipeName) {
    errors.push(err("recipe.name is required (non-empty string)"));
  }
  let recipeType: "meal" | "batch_prep" | undefined;
  if (recipeRaw.recipe_type != null && recipeRaw.recipe_type !== "") {
    if (RECIPE_TYPES.has(recipeRaw.recipe_type as string)) {
      recipeType = recipeRaw.recipe_type as "meal" | "batch_prep";
    } else {
      warnings.push(
        warn(
          `recipe.recipe_type "${String(
            recipeRaw.recipe_type
          )}" is not a known value; normalized to undefined`
        )
      );
    }
  }

  // 3. Products — require name + unit; carry through D-01 hints. Assign refs.
  const productsRaw = Array.isArray(parsed.products) ? parsed.products : [];
  if (!Array.isArray(parsed.products)) {
    errors.push(err("products must be an array"));
  }
  const productNodes: NormalizedProductNode[] = [];
  const refs = new Set<string>();
  productsRaw.forEach((entry, i) => {
    const label = `products[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(err(`${label} must be an object`));
      return;
    }
    const name = toNonEmptyString(entry.name);
    const unit = toNonEmptyString(entry.unit);
    if (!name) errors.push(err(`${label} is missing name`));
    if (!unit) errors.push(err(`${label} (${name ?? "?"}) is missing unit`));

    const ref = toNonEmptyString(entry.ref) ?? `product-${i + 1}`;
    if (refs.has(ref)) {
      errors.push(err(`${label} has a duplicate ref "${ref}"`));
    }
    refs.add(ref);

    if (!name || !unit) return; // don't emit a half-built node

    const node: NormalizedProductNode = { ref, name, unit };
    const quantity = toNumber(entry.quantity);
    if (quantity !== undefined) node.quantity = quantity;
    const matchProductId = toNonEmptyString(entry.matchProductId);
    if (matchProductId) node.matchProductId = matchProductId;
    const productType = toNonEmptyString(entry.productType);
    if (productType) node.productType = productType;
    if (typeof entry.pantry === "boolean") node.pantry = entry.pantry;
    const fdcId = toNumber(entry.fdcId);
    if (fdcId !== undefined) node.fdcId = fdcId;
    const store = toNonEmptyString(entry.store);
    if (store) node.store = store;
    const section = toNonEmptyString(entry.section);
    if (section) node.section = section;
    productNodes.push(node);
  });

  // 4. Steps — require step_type in {prep, assembly}; normalize enums to
  //    undefined + warning (mirrors loadRecipe's `|| undefined`).
  const stepsRaw = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (!Array.isArray(parsed.steps)) {
    errors.push(err("steps must be an array"));
  }
  const steps: NormalizedStep[] = [];
  stepsRaw.forEach((entry, i) => {
    const label = `steps[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(err(`${label} must be an object`));
      return;
    }
    const name = toNonEmptyString(entry.name);
    if (!name) errors.push(err(`${label} is missing name`));

    const ref = toNonEmptyString(entry.ref) ?? `step-${i + 1}`;
    if (refs.has(ref)) {
      errors.push(err(`${label} has a duplicate ref "${ref}"`));
    }
    refs.add(ref);

    const stepTypeRaw = entry.step_type;
    if (stepTypeRaw == null || stepTypeRaw === "") {
      errors.push(err(`${label} (${name ?? "?"}) is missing step_type`));
      return;
    }
    if (!STEP_TYPES.has(stepTypeRaw as string)) {
      errors.push(
        err(
          `${label} has an invalid step_type "${String(
            stepTypeRaw
          )}" (expected prep or assembly)`
        )
      );
      return;
    }
    if (!name) return; // name error already recorded; skip half-built node

    const step: NormalizedStep = {
      ref,
      name,
      step_type: stepTypeRaw as "prep" | "assembly",
    };

    // timing enum
    if (entry.timing != null && entry.timing !== "") {
      if (TIMINGS.has(entry.timing as string)) {
        step.timing = entry.timing as "batch" | "just_in_time";
      } else {
        warnings.push(
          warn(
            `${label} timing "${String(
              entry.timing
            )}" is not a known value; normalized to undefined`
          )
        );
      }
    }
    // resource enum
    if (entry.resource != null && entry.resource !== "") {
      if (RESOURCES.has(entry.resource as string)) {
        step.resource = entry.resource as string;
      } else {
        warnings.push(
          warn(
            `${label} resource "${String(
              entry.resource
            )}" is not a known value; normalized to undefined`
          )
        );
      }
    }

    const activeMinutes = toNumber(entry.active_minutes);
    if (activeMinutes !== undefined) step.active_minutes = activeMinutes;
    const passiveMinutes = toNumber(entry.passive_minutes);
    if (passiveMinutes !== undefined) step.passive_minutes = passiveMinutes;
    const instructions = toNonEmptyString(entry.instructions);
    if (instructions) step.instructions = instructions;
    const prepAction = toNonEmptyString(entry.prep_action);
    if (prepAction) step.prep_action = prepAction;
    const ovenTempF = toNumber(entry.oven_temp_f);
    if (ovenTempF !== undefined) step.oven_temp_f = ovenTempF;
    const rackSlots = toNumber(entry.rack_slots);
    if (rackSlots !== undefined) step.rack_slots = rackSlots;

    steps.push(step);
  });

  // 5. Edges — each {from,to} ref must resolve to a declared node.
  const edgesRaw = Array.isArray(parsed.edges) ? parsed.edges : [];
  if (!Array.isArray(parsed.edges)) {
    errors.push(err("edges must be an array"));
  }
  const edges: { from: string; to: string }[] = [];
  edgesRaw.forEach((entry, i) => {
    const label = `edges[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(err(`${label} must be an object with {from,to}`));
      return;
    }
    const from = toNonEmptyString(entry.from);
    const to = toNonEmptyString(entry.to);
    if (!from || !to) {
      errors.push(err(`${label} must have both a from and a to ref`));
      return;
    }
    if (!refs.has(from)) {
      errors.push(err(`${label} references a missing node "${from}"`));
    }
    if (!refs.has(to)) {
      errors.push(err(`${label} references a missing node "${to}"`));
    }
    if (refs.has(from) && refs.has(to)) {
      edges.push({ from, to });
    }
  });

  // 6. Tags (optional).
  const tagIds: string[] = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === "string" && t !== "")
    : [];

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const graph: NormalizedGraph = {
    recipe: {
      name: recipeName as string,
      ...(toNonEmptyString(recipeRaw.notes)
        ? { notes: recipeRaw.notes as string }
        : {}),
      ...(recipeType ? { recipe_type: recipeType } : {}),
      ...(recipeRaw.status === "draft" || recipeRaw.status === "published"
        ? { status: recipeRaw.status }
        : {}),
      ...(toNonEmptyString(recipeRaw.revision_of)
        ? { revision_of: recipeRaw.revision_of as string }
        : {}),
    },
    tagIds,
    productNodes,
    steps,
    edges,
  };

  return { ok: true, graph, warnings };
}
