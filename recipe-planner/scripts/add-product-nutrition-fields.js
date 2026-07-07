import PocketBase from "pocketbase";

// Note: DB URLs are also defined in src/lib/db-config.ts for the frontend
// But that's a TypeScript/browser module, so we duplicate them here for the Node.js script
const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};

// PB_URL lets this same script be pointed at test (:8091) for the mandatory
// rehearsal before the real prod run. Default stays prod.
const PB_URL = process.env.PB_URL || DB_URLS.production;

const pb = new PocketBase(PB_URL);

const PRODUCTS_COLLECTION_ID = "pbc_7402169584";

// D-07 / REG-04: 8 new nullable nutrition/USDA fields on `products`. All
// `required: false` — the existing 291 hand-authored products stay valid
// with no data migration. Do NOT touch canonical_unit/dimension — the
// density model is deferred (03-CONTEXT.md); those fields are already
// nullable and are left completely alone by this script.
const NEW_FIELDS = [
  {
    id: "number_fdc_id",
    name: "fdc_id",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    onlyInt: true,
  },
  {
    id: "select_usda_data_type",
    name: "usda_data_type",
    type: "select",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    values: ["foundation_food", "sr_legacy"],
  },
  {
    id: "text_usda_category",
    name: "usda_category",
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
    id: "number_nutrient_basis_g",
    name: "nutrient_basis_g",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  {
    id: "number_kcal",
    name: "kcal",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  {
    id: "number_protein_g",
    name: "protein_g",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  {
    id: "number_fat_g",
    name: "fat_g",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  {
    id: "number_carb_g",
    name: "carb_g",
    type: "number",
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
];

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
 * T-03-01 / T-03-03: idempotent, append-only field merge. Fetches the live
 * `products` collection, appends ONLY fields whose `name` is not already
 * present, then calls collections.update() with the FULL merged fields
 * array — PocketBase replaces the whole array on update, so every existing
 * field must survive the merge (asserted below before and after the call).
 */
async function addNutritionFields() {
  console.log(`\n--- Fetching live products collection (${PRODUCTS_COLLECTION_ID}) ---`);
  const collection = await pb.collections.getOne(PRODUCTS_COLLECTION_ID);
  const existingFields = collection.fields ?? collection.schema ?? [];
  const existingNames = new Set(existingFields.map((f) => f.name));

  console.log(`  Existing fields (${existingFields.length}): ${existingFields.map((f) => f.name).join(", ")}`);

  const toAdd = NEW_FIELDS.filter((f) => !existingNames.has(f.name));
  const alreadyPresent = NEW_FIELDS.filter((f) => existingNames.has(f.name));

  if (alreadyPresent.length > 0) {
    console.log(`  Already present (skipping): ${alreadyPresent.map((f) => f.name).join(", ")}`);
  }

  if (toAdd.length === 0) {
    console.log("  All 8 nutrition fields already present — no-op (idempotent re-run confirmed)");
    return;
  }

  console.log(`  Adding ${toAdd.length} new field(s): ${toAdd.map((f) => f.name).join(", ")}`);

  const mergedFields = [...existingFields, ...toAdd];

  // Safety assertion: every pre-existing field name must survive the merge
  // before we ever call update() — a bug here would silently drop columns
  // (T-03-03, high severity).
  const mergedNames = new Set(mergedFields.map((f) => f.name));
  const dropped = [...existingNames].filter((n) => !mergedNames.has(n));
  if (dropped.length > 0) {
    throw new Error(
      `Refusing to update: merge would drop existing field(s): ${dropped.join(", ")}`
    );
  }

  await pb.collections.update(collection.id, { fields: mergedFields });
  console.log(`  Updated products collection — ${toAdd.length} field(s) added, ${existingFields.length} pre-existing field(s) preserved`);

  // Post-update verification: re-fetch and confirm all 8 target fields + all
  // pre-existing fields are present.
  const updated = await pb.collections.getOne(PRODUCTS_COLLECTION_ID);
  const updatedFields = updated.fields ?? updated.schema ?? [];
  const updatedNames = new Set(updatedFields.map((f) => f.name));

  const stillMissing = NEW_FIELDS.filter((f) => !updatedNames.has(f.name)).map((f) => f.name);
  if (stillMissing.length > 0) {
    throw new Error(`Post-update verification FAILED: still missing ${stillMissing.join(", ")}`);
  }
  const stillDropped = [...existingNames].filter((n) => !updatedNames.has(n));
  if (stillDropped.length > 0) {
    throw new Error(`Post-update verification FAILED: existing field(s) were dropped: ${stillDropped.join(", ")}`);
  }
  console.log("  Post-update verification passed: all 8 nutrition fields present, all pre-existing fields intact");
}

async function main() {
  console.log("=".repeat(80));
  console.log("ADD PRODUCT NUTRITION FIELDS — idempotent append-only schema migration (D-07/REG-04)");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  await authenticateSuperuser();
  await addNutritionFields();

  console.log("\n" + "=".repeat(80));
  console.log("DONE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("ERROR:", fmtError(e));
  process.exit(1);
});
