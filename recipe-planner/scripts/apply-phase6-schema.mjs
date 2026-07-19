// Phase 6 (Import Pipeline & Recipe Lifecycle) additive-nullable schema
// migration. Lands IMP-01/05/06's schema foundation on ONE PocketBase instance
// per invocation (PB_URL env override selects test :8091 vs prod :8090 — the
// established test-first-rehearsal convention, verbatim from
// apply-phase5-schema.mjs). Idempotent: every step existence-checks before
// mutating, so re-running is a no-op (T-06-01a).
//
// Five changes (change (e) added post-UAT):
// (a) recipes gains a nullable `status` select (draft|published) mirroring the
//     existing `recipe_type` select shape (D-03), PLUS a nullable `revision_of`
//     relation → recipes (D-10 draft→original linkage). Both additive.
// (b) BACKFILL every existing recipe to status="published" IN THE SAME SCRIPT,
//     immediately after the field add (06-RESEARCH Pitfall 1: a PocketBase
//     select that is un-set returns "", and an empty status would be treated
//     as a draft by a naive `status="published"` filter — the backfill makes
//     the fail-open `status != "draft"` planning filter safe and guarantees
//     nothing vanishes from planning on day one). Fail-open: EVERY row → published.
// (c) recipe_notes collection (D-09): recipe relation (cascadeDelete=true),
//     text, status select [pending/applied/dismissed], source_surface select
//     [cook_mode/calendar/recipe_card], draft_revision relation → recipes
//     (cascadeDelete=false), autodate created + updated. Open CRUD rules like
//     cook_progress.
// (d) recipe_product_nodes gains a nullable `source_node` relation →
//     recipe_product_nodes (D-10, Open Q2 option A: node correspondence for
//     id-stable evolution write-back).
// (e) recipe_steps gains a nullable `source_node` relation → recipe_steps
//     (06 UAT #4: mirror (d) for STEP correspondence so a full-graph
//     write-back can update cloned steps in place instead of churning ids).
//
// After a successful run against the TEST instance, the live schema is
// re-exported to the canonical schema mirror at the REPO ROOT
// (`../../pb_schema.json`) — the Phase-1 Plan-08 consolidation moved it there.
//
// PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are read from the environment
// (sourced from gitignored recipe-planner/.env.local by the caller, e.g.
// `node --env-file=.env.local scripts/apply-phase6-schema.mjs`). Never
// printed, never committed.

import PocketBase from "pocketbase";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DB_URLS = {
  production: "http://127.0.0.1:8090",
  test: "http://127.0.0.1:8091",
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
 * T-06-01a / T-06-01c: idempotent, append-only field merge on an existing
 * collection. Fetches the live collection, appends ONLY fields whose `name` is
 * not already present, asserts no existing field is dropped, then calls
 * collections.update() with the FULL merged fields array (PB replaces the whole
 * array on update). Post-update verify confirms new fields present + no drop.
 * Mirrors apply-phase5-schema.mjs applyRecipeStepsFields verbatim, generalized
 * over collection name + new-fields list.
 */
async function applyFieldsToCollection(collectionName, newFields) {
  console.log(`\n--- ${collectionName}: additive-nullable field migration ---`);
  const collection = await pb.collections.getOne(collectionName);
  const existingFields = collection.fields ?? collection.schema ?? [];
  const existingNames = new Set(existingFields.map((f) => f.name));

  const toAdd = newFields.filter((f) => !existingNames.has(f.name));
  const alreadyPresent = newFields.filter((f) => existingNames.has(f.name));

  if (alreadyPresent.length > 0) {
    console.log(`  Already present (skipping): ${alreadyPresent.map((f) => f.name).join(", ")}`);
  }

  if (toAdd.length === 0) {
    console.log(`  All ${newFields.length} ${collectionName} field(s) already present — no-op (idempotent re-run confirmed)`);
    return;
  }

  console.log(`  Adding ${toAdd.length} new field(s): ${toAdd.map((f) => f.name).join(", ")}`);

  const mergedFields = [...existingFields, ...toAdd];

  const mergedNames = new Set(mergedFields.map((f) => f.name));
  const dropped = [...existingNames].filter((n) => !mergedNames.has(n));
  if (dropped.length > 0) {
    throw new Error(`Refusing to update: merge would drop existing field(s): ${dropped.join(", ")}`);
  }

  await pb.collections.update(collection.id, { fields: mergedFields });
  console.log(`  Updated ${collectionName} — ${toAdd.length} field(s) added, ${existingFields.length} pre-existing field(s) preserved`);

  const updated = await pb.collections.getOne(collectionName);
  const updatedFields = updated.fields ?? updated.schema ?? [];
  const updatedNames = new Set(updatedFields.map((f) => f.name));
  const stillMissing = newFields.filter((f) => !updatedNames.has(f.name)).map((f) => f.name);
  if (stillMissing.length > 0) {
    throw new Error(`Post-update verification FAILED: still missing ${stillMissing.join(", ")}`);
  }
  const stillDropped = [...existingNames].filter((n) => !updatedNames.has(n));
  if (stillDropped.length > 0) {
    throw new Error(`Post-update verification FAILED: existing field(s) were dropped: ${stillDropped.join(", ")}`);
  }
  console.log(`  Post-update verification passed: all ${newFields.length} target field(s) present, all pre-existing fields intact`);
}

/**
 * D-03 + D-10: append `status` (select, mirrors recipe_type shape) and
 * `revision_of` (nullable relation → recipes) to the recipes collection.
 */
async function applyRecipesFields() {
  const recipes = await pb.collections.getOne("recipes");
  const statusField = {
    id: "select_status",
    name: "status",
    type: "select",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    values: ["draft", "published"],
  };
  const revisionOfField = {
    id: "relation_revision_of",
    name: "revision_of",
    type: "relation",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    cascadeDelete: false,
    collectionId: recipes.id, // → recipes (draft points at original published)
    maxSelect: 1,
    minSelect: 0,
  };
  await applyFieldsToCollection("recipes", [statusField, revisionOfField]);
}

/**
 * D-03 / 06-RESEARCH Pitfall 1: backfill legacy recipes with no status yet to
 * status="published", immediately after the field add. An un-set select reads
 * as "" and would vanish under a fail-closed filter — this fail-open backfill
 * guarantees nothing disappears from planning on day one.
 *
 * Idempotent AND draft-safe (CR-01): ONLY rows whose status was never assigned
 * ("" / null / undefined) are touched. An explicit "draft" is a live lifecycle
 * value the phase introduces — a re-run must NEVER force-publish it. (The
 * earlier `status !== "published"` gate also matched drafts, so any re-run once
 * the lifecycle was in use silently promoted every draft to published — the
 * exact data corruption this migration is supposed to protect against.)
 */
async function backfillRecipeStatus() {
  console.log("\n--- recipes.status: backfill un-set rows to published (D-03) ---");
  const recipes = await pb.collection("recipes").getFullList();
  let updated = 0;
  for (const r of recipes) {
    // Only legacy rows that were never assigned a status. Never an explicit
    // "draft" (a live lifecycle value) and never an existing "published".
    if (r.status === "" || r.status == null) {
      await pb.collection("recipes").update(r.id, { status: "published" });
      updated++;
    }
  }
  if (updated === 0) {
    console.log(`  All ${recipes.length} recipe(s) already carry a status — no-op (idempotent re-run confirmed)`);
  } else {
    console.log(`  Backfilled ${updated} of ${recipes.length} recipe(s) (un-set → published)`);
  }
  // Post-backfill assertion: no row may be left with an EMPTY status (the
  // fail-open guarantee). Explicit drafts are expected and must survive a
  // re-run, so they are NOT stragglers.
  const check = await pb.collection("recipes").getFullList();
  const stragglers = check.filter((r) => r.status === "" || r.status == null);
  if (stragglers.length > 0) {
    throw new Error(`Backfill verification FAILED: ${stragglers.length} recipe(s) still have no status`);
  }
  console.log(`  Verified: all ${check.length} recipe(s) carry a status (drafts preserved)`);
}

/**
 * D-09: recipe_notes collection, modeled on the recipe_queue relation shape.
 * recipe relation cascadeDelete=true (a note dies with its recipe);
 * draft_revision relation cascadeDelete=false (the draft is independent).
 * Open CRUD rules like cook_progress (self-hosted, single household).
 */
async function applyRecipeNotesCollection() {
  console.log("\n--- recipe_notes: collection creation (D-09) ---");
  const existing = await getCollectionSafe("recipe_notes");
  if (existing) {
    console.log("  recipe_notes already exists — no-op (idempotent re-run confirmed)");
    return;
  }

  const recipes = await pb.collections.getOne("recipes");

  const fields = [
    {
      id: "text_note_id",
      name: "id",
      type: "text",
      system: true,
      primaryKey: true,
      required: true,
      hidden: false,
      presentable: false,
      min: 15,
      max: 15,
      pattern: "^[a-z0-9]+$",
      autogeneratePattern: "[a-z0-9]{15}",
    },
    {
      id: "relation_note_recipe",
      name: "recipe",
      type: "relation",
      required: true,
      hidden: false,
      presentable: false,
      system: false,
      cascadeDelete: true,
      collectionId: recipes.id,
      maxSelect: 1,
      minSelect: 0,
    },
    {
      id: "text_note_text",
      name: "text",
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
      id: "select_note_status",
      name: "status",
      type: "select",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      maxSelect: 1,
      values: ["pending", "applied", "dismissed"],
    },
    {
      id: "select_note_source",
      name: "source_surface",
      type: "select",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      maxSelect: 1,
      values: ["cook_mode", "calendar", "recipe_card"],
    },
    {
      id: "relation_note_draft",
      name: "draft_revision",
      type: "relation",
      required: false,
      hidden: false,
      presentable: false,
      system: false,
      cascadeDelete: false,
      collectionId: recipes.id, // → recipes (the draft this note produced)
      maxSelect: 1,
      minSelect: 0,
    },
    {
      id: "autodate_note_created",
      name: "created",
      type: "autodate",
      hidden: false,
      presentable: false,
      system: false,
      onCreate: true,
      onUpdate: false,
    },
    {
      id: "autodate_note_updated",
      name: "updated",
      type: "autodate",
      hidden: false,
      presentable: false,
      system: false,
      onCreate: true,
      onUpdate: true,
    },
  ];

  await pb.collections.create({
    name: "recipe_notes",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "",
    deleteRule: "",
    fields,
    indexes: [],
  });
  console.log("  Created recipe_notes collection (recipe/text/status/source_surface/draft_revision/created/updated)");
}

/**
 * D-10 (Open Q2 option A): append a nullable `source_node` relation on
 * recipe_product_nodes (→ recipe_product_nodes) so a draft-revision clone node
 * can point back at its original node for id-stable write-back.
 */
async function applyRecipeProductNodesFields() {
  const nodes = await pb.collections.getOne("recipe_product_nodes");
  const sourceNodeField = {
    id: "relation_source_node",
    name: "source_node",
    type: "relation",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    cascadeDelete: false,
    collectionId: nodes.id, // → recipe_product_nodes (self-relation)
    maxSelect: 1,
    minSelect: 0,
  };
  await applyFieldsToCollection("recipe_product_nodes", [sourceNodeField]);
}

/**
 * 06 UAT #4: mirror the `source_node` correspondence field onto recipe_steps
 * (→ recipe_steps, self-relation) so a draft-revision's cloned STEPS — not just
 * its product nodes — can point back at their originals for id-stable
 * full-graph write-back. Additive + nullable; only clone steps set it.
 */
async function applyRecipeStepsFields() {
  const steps = await pb.collections.getOne("recipe_steps");
  const sourceNodeField = {
    id: "relation_step_source_node",
    name: "source_node",
    type: "relation",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    cascadeDelete: false,
    collectionId: steps.id, // → recipe_steps (self-relation)
    maxSelect: 1,
    minSelect: 0,
  };
  await applyFieldsToCollection("recipe_steps", [sourceNodeField]);
}

async function reExportSchema() {
  console.log("\n--- Re-exporting live schema mirror ---");
  const allCollections = await pb.collections.getFullList();
  writeFileSync(SCHEMA_MIRROR_PATH, JSON.stringify(allCollections, null, 2) + "\n");
  console.log(`  Wrote ${allCollections.length} collection(s) to ${SCHEMA_MIRROR_PATH}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("APPLY PHASE 6 SCHEMA — additive-nullable migration (IMP-01/05/06)");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  await authenticateSuperuser();
  await applyRecipesFields();
  await backfillRecipeStatus();
  await applyRecipeNotesCollection();
  await applyRecipeProductNodesFields();
  await applyRecipeStepsFields();

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
