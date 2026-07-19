// One-off (usda-search-plain-rename todo, optional part 2): rename the single
// verbose SR-Legacy-artifact product "Kumquats, raw" -> "kumquat", keeping its
// fdc_id (168154), section, and usda_data_type. This is the one product that
// landed with a raw USDA description before the Search-USDA prefill was fixed
// to plain-name via plainNameFromUsda. Only the `name` field changes.
//
// Idempotent (no-op if already "kumquat" or not found). PB_URL selects
// test/prod (prod default).
//   node --env-file=.env.local scripts/rename-kumquat-product.mjs --dry-run
//   node --env-file=.env.local scripts/rename-kumquat-product.mjs

import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(PB_URL);
const DRY_RUN = process.argv.includes("--dry-run");

const OLD_NAME = "Kumquats, raw";
const NEW_NAME = "kumquat";

async function main() {
  console.log("=".repeat(72));
  console.log(`RENAME KUMQUAT PRODUCT — ${PB_URL} — ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("=".repeat(72));

  const product = await pb
    .collection("products")
    .getFirstListItem(`name = "${OLD_NAME}"`)
    .catch(() => null);

  if (!product) {
    console.log(`\n  "${OLD_NAME}" not found — nothing to do (idempotent no-op).`);
    return;
  }

  console.log(
    `\n  Found id=${product.id}  name="${product.name}"  fdc_id=${product.fdc_id}` +
      `  usda_data_type=${product.usda_data_type}  section=${product.section}`
  );
  console.log(`  Plan: name "${product.name}" -> "${NEW_NAME}" (all other fields unchanged)`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes. Re-run without --dry-run to apply.");
    return;
  }

  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`\n  Authenticated as ${email}`);

  const updated = await pb
    .collection("products")
    .update(product.id, { name: NEW_NAME });
  console.log(`  ✅ Updated: id=${updated.id}  name="${updated.name}"  fdc_id=${updated.fdc_id}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
