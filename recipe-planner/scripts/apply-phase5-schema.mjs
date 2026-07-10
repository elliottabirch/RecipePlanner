// Phase 5 (Prep-Day Engine) additive-nullable schema migration.
// Lands PREP-01/03/04/05's schema foundation on ONE PocketBase instance per
// invocation (PB_URL env override selects test :8091 vs prod :8090 — the
// established test-first-rehearsal convention, see add-product-nutrition-
// fields.js / seed-week-template.js precedent). Idempotent: every step
// existence-checks before mutating, so re-running is a no-op (T-05-01a).
//
// (a) recipe_steps gains 7 nullable fields: active_minutes, passive_minutes,
//     instructions, prep_action (select), resource (select), oven_temp_f,
//     rack_slots. All additive — the existing 185 steps validate unchanged.
//     rack_slots' "default 1" (05-CONTEXT.md D-05) is enforced at the
//     application layer (RecipeEditor/backfill), not a schema-level default —
//     this PB version's field schema has no `default` property (confirmed:
//     zero "default" keys anywhere in pb_schema.json).
// (b) cook_progress collection (D-03): keyed by (weekly_plan, step_instance),
//     unique-indexed, mirrors shopping_state's uniqueness precedent.
// (c) scheduler_config collection (D-04, singleton) + one seeded record with
//     the active-boosted default weights (D-06 — active is the PRIMARY
//     objective, so its weight must be strictly greater than every other).
//
// Does NOT add a lead_time_minutes field anywhere (D-02 cuts the day-before
// horizon entirely) — asserted explicitly below.
//
// After a successful run against the TEST instance, the live schema is
// re-exported to the canonical schema mirror. NOTE: that mirror lives at the
// REPO ROOT (`pb_schema.json`), not `recipe-planner/pb_schema.json` — the
// Phase-1 Plan-08 consolidation moved it there (confirmed live 2026-07-09;
// this plan's frontmatter path was out of date, corrected here as a Rule-3
// blocking-issue fix, no separate file created).
//
// PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are read from the environment
// (sourced from gitignored recipe-planner/.env.local by the caller, e.g.
// `node --env-file=.env.local scripts/apply-phase5-schema.mjs`). Never
// printed, never committed.

import PocketBase from "pocketbase";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};

// PB_URL lets this same script be pointed at test (:8091) for the mandatory
// rehearsal before the real prod (:8090, default) run.
const PB_URL = process.env.PB_URL || DB_URLS.production;
const pb = new PocketBase(PB_URL);

// Repo-root canonical schema mirror (see header note above).
const SCHEMA_MIRROR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../pb_schema.json"
);

const RECIPE_STEPS_NEW_FIELDS = [
  {
    id: "number_active_minutes",
    name: "active_minutes",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    onlyInt: false,
    max: null,
    min: null,
  },
  {
    id: "number_passive_minutes",
    name: "passive_minutes",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    onlyInt: false,
    max: null,
    min: null,
  },
  {
    id: "text_instructions",
    name: "instructions",
    type: "text",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    autogeneratePattern: "",
    pattern: "",
    min: 0,
    max: 0,
    primaryKey: false,
  },
  {
    id: "select_prep_action",
    name: "prep_action",
    type: "select",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    // Verbatim from src/lib/linter/rules/prep-words.ts PREP_VERBS (one
    // controlled prep vocabulary, per 05-CONTEXT.md Claude's Discretion).
    values: ["sliced", "diced", "minced", "chopped", "grated", "shredded"],
  },
  {
    id: "select_resource",
    name: "resource",
    type: "select",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    values: ["oven", "stovetop", "blender", "food_processor", "instant_pot", "microwave", "sous_vide", "none"],
  },
  {
    id: "number_oven_temp_f",
    name: "oven_temp_f",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    onlyInt: false,
    max: null,
    min: null,
  },
  {
    id: "number_rack_slots",
    name: "rack_slots",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    onlyInt: false,
    max: null,
    min: null,
  },
];

const DEFAULT_WEIGHTS = {
  active: 8,
  chopping: 3,
  grouping: 3,
  elapsed: 4,
  resource_pressure: 3,
};

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

async function getCollectionSafe(name) {
  try {
    return await pb.collections.getOne(name);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/**
 * T-05-01a: idempotent, append-only field merge on recipe_steps. Fetches the
 * live collection, appends ONLY fields whose `name` is not already present,
 * then calls collections.update() with the FULL merged fields array (PB
 * replaces the whole array on update) — every existing field must survive
 * the merge (asserted below before the call).
 */
async function applyRecipeStepsFields() {
  console.log("\n--- recipe_steps: additive-nullable field migration ---");
  const collection = await pb.collections.getOne("recipe_steps");
  const existingFields = collection.fields ?? collection.schema ?? [];
  const existingNames = new Set(existingFields.map((f) => f.name));

  const toAdd = RECIPE_STEPS_NEW_FIELDS.filter((f) => !existingNames.has(f.name));
  const alreadyPresent = RECIPE_STEPS_NEW_FIELDS.filter((f) => existingNames.has(f.name));

  if (alreadyPresent.length > 0) {
    console.log(`  Already present (skipping): ${alreadyPresent.map((f) => f.name).join(", ")}`);
  }

  if (toAdd.length === 0) {
    console.log("  All 7 recipe_steps fields already present — no-op (idempotent re-run confirmed)");
    return;
  }

  console.log(`  Adding ${toAdd.length} new field(s): ${toAdd.map((f) => f.name).join(", ")}`);

  const mergedFields = [...existingFields, ...toAdd];

  const mergedNames = new Set(mergedFields.map((f) => f.name));
  const dropped = [...existingNames].filter((n) => !mergedNames.has(n));
  if (dropped.length > 0) {
    throw new Error(`Refusing to update: merge would drop existing field(s): ${dropped.join(", ")}`);
  }
  // D-02: the day-before horizon is cut entirely — never let this field slip in.
  if (mergedFields.some((f) => f.name === "lead_time_minutes")) {
    throw new Error("Refusing to update: lead_time_minutes field present (D-02 cuts this entirely)");
  }

  await pb.collections.update(collection.id, { fields: mergedFields });
  console.log(`  Updated recipe_steps — ${toAdd.length} field(s) added, ${existingFields.length} pre-existing field(s) preserved`);

  const updated = await pb.collections.getOne("recipe_steps");
  const updatedFields = updated.fields ?? updated.schema ?? [];
  const updatedNames = new Set(updatedFields.map((f) => f.name));
  const stillMissing = RECIPE_STEPS_NEW_FIELDS.filter((f) => !updatedNames.has(f.name)).map((f) => f.name);
  if (stillMissing.length > 0) {
    throw new Error(`Post-update verification FAILED: still missing ${stillMissing.join(", ")}`);
  }
  const stillDropped = [...existingNames].filter((n) => !updatedNames.has(n));
  if (stillDropped.length > 0) {
    throw new Error(`Post-update verification FAILED: existing field(s) were dropped: ${stillDropped.join(", ")}`);
  }
  console.log("  Post-update verification passed: all 7 new fields present, all pre-existing fields intact");
}

/**
 * D-03: cook_progress collection, keyed by (weekly_plan, step_instance),
 * unique-indexed so the query-then-branch upsert in useCookProgress is
 * race-safe — mirrors shopping_state's (weekly_plan, line_key) precedent.
 */
async function applyCookProgressCollection() {
  console.log("\n--- cook_progress: collection creation (D-03) ---");
  const existing = await getCollectionSafe("cook_progress");
  if (existing) {
    console.log("  cook_progress already exists — no-op (idempotent re-run confirmed)");
    return;
  }

  const weeklyPlans = await pb.collections.getOne("weekly_plans");

  const fields = [
    {
      id: "relation_cp_weekly_plan",
      name: "weekly_plan",
      type: "relation",
      required: true,
      hidden: false,
      presentable: false,
      system: false,
      cascadeDelete: true,
      collectionId: weeklyPlans.id,
      maxSelect: 1,
      minSelect: 0,
    },
    {
      id: "text_cp_step_instance",
      name: "step_instance",
      type: "text",
      required: true,
      hidden: false,
      presentable: false,
      system: false,
      autogeneratePattern: "",
      pattern: "",
      min: 0,
      max: 0,
      primaryKey: false,
    },
    {
      id: "bool_cp_checked",
      name: "checked",
      type: "bool",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
    },
    {
      id: "date_cp_checked_at",
      name: "checked_at",
      type: "date",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      max: "",
      min: "",
    },
  ];

  await pb.collections.create({
    name: "cook_progress",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields,
    indexes: [
      "CREATE UNIQUE INDEX `idx_cook_progress_plan_step` ON `cook_progress` (`weekly_plan`, `step_instance`)",
    ],
  });
  console.log("  Created cook_progress collection with unique (weekly_plan, step_instance) index");
}

/**
 * D-04: scheduler_config collection (singleton — no weekly_plan relation).
 */
async function applySchedulerConfigCollection() {
  console.log("\n--- scheduler_config: collection creation (D-04) ---");
  const existing = await getCollectionSafe("scheduler_config");
  if (existing) {
    console.log("  scheduler_config already exists — no-op (idempotent re-run confirmed)");
    return;
  }

  const fields = [
    {
      id: "number_sc_seed",
      name: "seed",
      type: "number",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      onlyInt: true,
      max: null,
      min: null,
    },
    {
      id: "json_sc_weights",
      name: "weights",
      type: "json",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      maxSize: 0,
    },
    {
      id: "number_sc_burner_count",
      name: "burner_count",
      type: "number",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      onlyInt: true,
      max: null,
      min: null,
    },
    {
      id: "number_sc_oven_rack_slots",
      name: "oven_rack_slots",
      type: "number",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      onlyInt: true,
      max: null,
      min: null,
    },
    {
      id: "json_sc_appliances",
      name: "appliances",
      type: "json",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      maxSize: 0,
    },
  ];

  await pb.collections.create({
    name: "scheduler_config",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields,
    indexes: [],
  });
  console.log("  Created scheduler_config collection (singleton, no weekly_plan relation)");
}

/**
 * D-04/D-06: exactly one scheduler_config record, seeded with the
 * active-boosted default weights (active MUST be the strict max — active
 * time minimization is the GA's primary objective).
 */
async function seedSchedulerConfigSingleton() {
  console.log("\n--- scheduler_config: seed singleton default record ---");
  const existingRecords = await pb.collection("scheduler_config").getFullList();
  if (existingRecords.length > 0) {
    console.log(`  Singleton record already present (id=${existingRecords[0].id}) — no-op (idempotent re-run confirmed)`);
    return;
  }

  const maxWeight = Math.max(...Object.values(DEFAULT_WEIGHTS));
  if (DEFAULT_WEIGHTS.active !== maxWeight) {
    throw new Error("Refusing to seed: weights.active must be the strict max of all weights (D-06)");
  }

  const created = await pb.collection("scheduler_config").create({
    seed: 12345,
    weights: DEFAULT_WEIGHTS,
    burner_count: 2,
    oven_rack_slots: 2,
    appliances: ["blender", "food_processor", "instant_pot", "microwave", "sous_vide"],
  });
  console.log(`  Seeded scheduler_config singleton (id=${created.id}), weights=${JSON.stringify(DEFAULT_WEIGHTS)}`);
}

async function reExportSchema() {
  console.log("\n--- Re-exporting live schema mirror ---");
  const allCollections = await pb.collections.getFullList();
  writeFileSync(SCHEMA_MIRROR_PATH, JSON.stringify(allCollections, null, 2) + "\n");
  console.log(`  Wrote ${allCollections.length} collection(s) to ${SCHEMA_MIRROR_PATH}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("APPLY PHASE 5 SCHEMA — additive-nullable migration (PREP-01/03/04/05)");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  await authenticateSuperuser();
  await applyRecipeStepsFields();
  await applyCookProgressCollection();
  await applySchedulerConfigCollection();
  await seedSchedulerConfigSingleton();

  if (PB_URL === DB_URLS.test) {
    await reExportSchema();
  } else {
    console.log(
      `\n(Skipping pb_schema.json re-export — only the test instance mirror is authoritative here; re-run with PB_URL=${DB_URLS.test} to refresh it.)`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("DONE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("ERROR:", fmtError(e));
  process.exit(1);
});
