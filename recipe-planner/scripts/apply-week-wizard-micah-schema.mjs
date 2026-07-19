// Week-wizard Micah/adult split — additive-nullable schema migration.
// Lands the two new `template_slots` pool-refinement fields on ONE PocketBase
// instance per invocation (PB_URL env override selects test :8091 vs prod
// :8090 — the established test-first-rehearsal convention, verbatim from
// apply-phase6-schema.mjs). Idempotent: existence-checks before mutating, so
// re-running is a no-op.
//
// Two additive fields on template_slots:
// (a) `exclude_tags` — nullable relation → tags (mirrors the existing
//     `pool_tags` relation shape). A recipe carrying ANY excluded tag is
//     dropped from the slot's pool. The adult slots exclude "micah meal" so
//     the Micah and adult pools stay strictly separate.
// (b) `match_all` — nullable bool (default-false semantics in the app). When
//     set, a recipe must carry EVERY pool_tag to qualify. The Micah component
//     slots use it (e.g. "Micah Proteins" = protein AND micah meal).
//
// Both additive + nullable: existing rows read exclude_tags=[] / match_all=false
// and keep their current match-any behaviour untouched.
//
// After a successful run against the TEST instance, the live schema is
// re-exported to the canonical mirror at the REPO ROOT (`../../pb_schema.json`).
//
// PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are read from the environment
// (sourced from gitignored recipe-planner/.env.local by the caller, e.g.
// `node --env-file=.env.local scripts/apply-week-wizard-micah-schema.mjs`).

import PocketBase from "pocketbase";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DB_URLS = {
  production: "http://127.0.0.1:8090",
  test: "http://127.0.0.1:8091",
};

const PB_URL = process.env.PB_URL || DB_URLS.production;
const pb = new PocketBase(PB_URL);

const SCHEMA_MIRROR_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../pb_schema.json"
);

// The `tags` collection id (pool_tags already relates to it — keep in sync).
const TAGS_COLLECTION_ID = "pbc_4015827361";

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

/**
 * Idempotent, append-only field merge (verbatim shape from
 * apply-phase6-schema.mjs): appends ONLY fields whose `name` is not already
 * present, asserts no existing field is dropped, updates with the FULL merged
 * array, then post-verifies.
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

async function applyTemplateSlotsFields() {
  const excludeTagsField = {
    id: "relation_exclude_tags",
    name: "exclude_tags",
    type: "relation",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    cascadeDelete: false,
    collectionId: TAGS_COLLECTION_ID, // → tags (mirrors pool_tags)
    maxSelect: 999,
    minSelect: 0,
  };
  const matchAllField = {
    id: "bool_match_all",
    name: "match_all",
    type: "bool",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  };
  await applyFieldsToCollection("template_slots", [excludeTagsField, matchAllField]);
}

async function reExportSchema() {
  console.log("\n--- Re-exporting live schema mirror ---");
  const allCollections = await pb.collections.getFullList();
  writeFileSync(SCHEMA_MIRROR_PATH, JSON.stringify(allCollections, null, 2) + "\n");
  console.log(`  Wrote ${allCollections.length} collection(s) to ${SCHEMA_MIRROR_PATH}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("APPLY WEEK-WIZARD MICAH SCHEMA — template_slots.exclude_tags + match_all");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  await authenticateSuperuser();
  await applyTemplateSlotsFields();

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
