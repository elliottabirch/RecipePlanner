// Phase 5 Plan 04 (PREP-02), Task 1: read-only export of every recipe_steps
// row on prod (:8090), grouped by recipe, with enough graph context (input/
// output product names on each step, via product_to_step_edges /
// step_to_product_edges) for an offline drafter to infer the 7 metadata
// fields (active_minutes, passive_minutes, instructions, prep_action,
// resource, oven_temp_f, rack_slots).
//
// READ-ONLY: this script issues zero create/update/delete calls against any
// collection. It authenticates as a superuser only to guarantee full read
// visibility (matching the apply-phase5-schema.mjs / merge-products.js
// precedent), then only ever calls getFullList().
//
// Credentials: PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are read from the
// environment (sourced from gitignored recipe-planner/.env.local by the
// caller, e.g. `node --env-file=.env.local scripts/export-steps-for-backfill.mjs`).
// Never printed, never logged.
//
// Usage:
//   node --env-file=.env.local scripts/export-steps-for-backfill.mjs
//     -> writes the full grouped export to scripts/data/step-export.json
//        (gitignored intermediate artifact) and prints a summary to stdout.
//   node --env-file=.env.local scripts/export-steps-for-backfill.mjs --dry-count
//     -> fetches and prints step/recipe counts only, writes no file.

import PocketBase from "pocketbase";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DB_URLS = {
  production: "http://127.0.0.1:8090",
  test: "http://127.0.0.1:8091",
};

// PB_URL lets this script be pointed at test (:8091) if ever needed; prod
// (:8090) is the default per the plan (content backfill targets prod).
const PB_URL = process.env.PB_URL || DB_URLS.production;
const pb = new PocketBase(PB_URL);

const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "data/step-export.json"
);

const DRY_COUNT = process.argv.includes("--dry-count");

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function authenticateSuperuser() {
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be set in the environment"
    );
  }
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`  Authenticated as superuser: ${email}`);
}

const METADATA_FIELDS = [
  "active_minutes",
  "passive_minutes",
  "instructions",
  "prep_action",
  "resource",
  "oven_temp_f",
  "rack_slots",
];

function isFullyPopulated(step) {
  // "Fully populated" = every one of the 7 metadata fields already has a
  // non-null/non-empty value. Used only to compute the summary line here;
  // Task 2's drafter decides skip/no-skip per-field-set nuance itself.
  return METADATA_FIELDS.every((f) => step[f] !== null && step[f] !== undefined && step[f] !== "");
}

async function main() {
  console.log(`Connecting to ${PB_URL} (read-only export)...`);
  await authenticateSuperuser();

  console.log("\nFetching recipes, product nodes, steps, and edges...");
  const [recipes, productNodes, steps, productToStepEdges, stepToProductEdges] =
    await Promise.all([
      pb.collection("recipes").getFullList(),
      pb.collection("recipe_product_nodes").getFullList({ expand: "product" }),
      pb.collection("recipe_steps").getFullList(),
      pb.collection("product_to_step_edges").getFullList(),
      pb.collection("step_to_product_edges").getFullList(),
    ]);

  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const nodeById = new Map(productNodes.map((n) => [n.id, n]));

  // step.id -> [product name, ...] (inputs feeding into this step)
  const inputsByStep = new Map();
  for (const edge of productToStepEdges) {
    const node = nodeById.get(edge.source);
    const productName = node?.expand?.product?.name;
    if (!productName) continue;
    const list = inputsByStep.get(edge.target) ?? [];
    list.push(productName);
    inputsByStep.set(edge.target, list);
  }

  // step.id -> [product name, ...] (outputs this step produces)
  const outputsByStep = new Map();
  for (const edge of stepToProductEdges) {
    const node = nodeById.get(edge.target);
    const productName = node?.expand?.product?.name;
    if (!productName) continue;
    const list = outputsByStep.get(edge.source) ?? [];
    list.push(productName);
    outputsByStep.set(edge.source, list);
  }

  const stepsOut = steps.map((step) => {
    const recipe = recipeById.get(step.recipe);
    return {
      id: step.id,
      recipe_id: step.recipe,
      recipe_name: recipe?.name ?? "(unknown recipe)",
      step_name: step.name,
      step_type: step.step_type,
      inputs: inputsByStep.get(step.id) ?? [],
      outputs: outputsByStep.get(step.id) ?? [],
      current: {
        active_minutes: step.active_minutes ?? null,
        passive_minutes: step.passive_minutes ?? null,
        instructions: step.instructions ?? null,
        prep_action: step.prep_action ?? null,
        resource: step.resource ?? null,
        oven_temp_f: step.oven_temp_f ?? null,
        rack_slots: step.rack_slots ?? null,
      },
      already_fully_populated: isFullyPopulated(step),
    };
  });

  // Group by recipe, preserving recipe name/id, for the Task-2 drafter to
  // work through in batches (one recipe at a time, per the plan's action).
  const byRecipe = new Map();
  for (const s of stepsOut) {
    const key = s.recipe_id;
    const group = byRecipe.get(key) ?? {
      recipe_id: s.recipe_id,
      recipe_name: s.recipe_name,
      steps: [],
    };
    group.steps.push(s);
    byRecipe.set(key, group);
  }

  const grouped = [...byRecipe.values()].sort((a, b) =>
    a.recipe_name.localeCompare(b.recipe_name)
  );

  const populatedCount = stepsOut.filter((s) => s.already_fully_populated).length;
  const summary = {
    recipes: grouped.length,
    steps: stepsOut.length,
    already_fully_populated: populatedCount,
    needs_draft: stepsOut.length - populatedCount,
  };

  console.log(
    `\nFound ${summary.recipes} recipes, ${summary.steps} steps ` +
      `(${summary.already_fully_populated} already fully populated, ${summary.needs_draft} need drafting).`
  );

  if (DRY_COUNT) {
    console.log("--dry-count: no file written.");
    return;
  }

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify({ summary, recipes: grouped }, null, 2));
  console.log(`\nWrote export to ${OUTPUT_PATH}`);
}

main().catch((e) => {
  console.error("ERROR:", fmtError(e));
  process.exit(1);
});
