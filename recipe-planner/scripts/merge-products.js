import PocketBase from "pocketbase";

// Note: DB URLs are also defined in src/lib/db-config.ts for the frontend
// But that's a TypeScript/browser module, so we duplicate them here for the Node.js script
const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};

// PB_URL lets this script be pointed at test for the D-06 rehearsal flow
// (against a fresh sync-to-test.js copy of prod) before the real prod run.
const PB_URL = process.env.PB_URL || DB_URLS.production;

const pb = new PocketBase(PB_URL);

// The four D-07 live-enumerated product-reference collections. Hardcoded
// here — NOT derived from pb_schema_updated.json, which is stale (it omits
// meal_variant_overrides). If a new product-referencing collection/field is
// added to the schema in the future, this list must be updated by hand.
const REFERENCE_FIELDS = [
  { collection: "recipe_product_nodes", field: "product" },
  { collection: "inventory_items", field: "product" },
  { collection: "products", field: "store_bought_product" },
  { collection: "meal_variant_overrides", field: "replacement_product" },
];

const DECISIONS_PATH = process.argv[2] || "./scripts/dedup-output/dedup-decisions.json";

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function loadConfirmedDecisions(decisionsPath) {
  const fs = await import("node:fs");
  const raw = fs.readFileSync(decisionsPath, "utf-8");
  const all = JSON.parse(raw);
  if (!Array.isArray(all)) {
    throw new Error(`Decisions file ${decisionsPath} must contain a JSON array`);
  }
  const confirmed = all.filter((d) => d.confirmed === true && d.survivorId != null);
  console.log(`  Loaded ${all.length} entries, ${confirmed.length} confirmed with a survivorId`);
  return confirmed;
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
 * D-06.3 / Pitfall #1: assert every dupeId and survivorId exists as a live
 * products record, and that no confirmed pair has mismatched `type` (merging
 * across type would silently break shouldCreateInstances() branching).
 * Aborts (throws) on any failure — never proceeds with a partially-valid set.
 */
async function preflightValidate(confirmed) {
  console.log("\n--- Pre-flight ID validation ---");
  const errors = [];
  const productCache = new Map();

  async function getProduct(id) {
    if (productCache.has(id)) return productCache.get(id);
    let record = null;
    try {
      record = await pb.collection("products").getOne(id);
    } catch (e) {
      record = null;
    }
    productCache.set(id, record);
    return record;
  }

  for (const decision of confirmed) {
    const dupe = await getProduct(decision.dupeId);
    const survivor = await getProduct(decision.survivorId);

    if (!dupe) {
      errors.push(`dupeId ${decision.dupeId} (${decision.name ?? "?"}) does not exist as a live products record`);
      continue;
    }
    if (!survivor) {
      errors.push(`survivorId ${decision.survivorId} for dupeId ${decision.dupeId} does not exist as a live products record`);
      continue;
    }
    if (dupe.id === survivor.id) {
      errors.push(`dupeId ${decision.dupeId} equals survivorId ${decision.survivorId} — refusing self-merge`);
      continue;
    }
    if (dupe.type !== survivor.type) {
      errors.push(
        `TYPE MISMATCH: dupeId ${decision.dupeId} [${dupe.type}] "${dupe.name}" -> survivorId ${decision.survivorId} [${survivor.type}] "${survivor.name}" — cross-type merges are forbidden (D-12/Pitfall #1)`
      );
    }
  }

  if (errors.length > 0) {
    console.error("\n  Pre-flight validation FAILED:");
    errors.forEach((e) => console.error(`    - ${e}`));
    throw new Error(`Pre-flight validation failed with ${errors.length} error(s) — aborting before any mutation`);
  }

  console.log(`  All ${confirmed.length} confirmed decisions passed pre-flight validation`);
  return productCache;
}

/**
 * D-06.2: snapshot prod via PocketBase's built-in backup service before any
 * mutation. Must complete (resolve) before repointing/deleting begins.
 */
async function backupBeforeMerge() {
  console.log("\n--- Creating pre-merge backup ---");
  // PocketBase backup names must match ^[a-z0-9_-]+\.zip$ — lowercase only,
  // .zip suffix required. Raw ISO timestamps (uppercase T/Z, no suffix) get
  // rejected with validation_match_invalid; caught during the D-06 rehearsal.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-merge-products-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error("pb.backups.create() did not confirm success — aborting before any mutation");
  }
  console.log(`  Backup created: ${basename}`);
}

/**
 * Repoint every product reference from dupeId to survivorId across exactly
 * the four D-07 collections/fields.
 */
async function repointReferences(confirmed) {
  console.log("\n--- Repointing references ---");
  let totalRepointed = 0;
  let totalFailed = 0;

  for (const decision of confirmed) {
    const { dupeId, survivorId } = decision;
    for (const { collection, field } of REFERENCE_FIELDS) {
      const records = await pb.collection(collection).getFullList({
        filter: `${field} = "${dupeId}"`,
      });
      if (records.length === 0) continue;

      let repointed = 0;
      let failed = 0;
      for (const record of records) {
        try {
          await pb.collection(collection).update(record.id, { [field]: survivorId });
          repointed++;
        } catch (e) {
          failed++;
          console.error(`    ⚠️  ${collection}/${record.id}.${field} repoint failed: ${fmtError(e)}`);
        }
      }
      console.log(`  ${collection}.${field}: ${dupeId} -> ${survivorId}: ${repointed}/${records.length} repointed${failed ? ` (${failed} failed)` : ""}`);
      totalRepointed += repointed;
      totalFailed += failed;
    }
  }

  if (totalFailed > 0) {
    throw new Error(`${totalFailed} reference(s) failed to repoint — aborting before orphan check/delete`);
  }
  console.log(`  Total references repointed: ${totalRepointed}`);
}

/**
 * D-06.4: zero-orphan verification — after repointing, re-query each
 * collection and assert zero records still reference any dupeId. Gates the
 * delete step; must pass before a single delete happens.
 */
async function verifyZeroOrphans(confirmed) {
  console.log("\n--- Zero-orphan verification ---");
  const orphans = [];

  for (const decision of confirmed) {
    const { dupeId } = decision;
    for (const { collection, field } of REFERENCE_FIELDS) {
      const remaining = await pb.collection(collection).getFullList({
        filter: `${field} = "${dupeId}"`,
        fields: "id",
      });
      if (remaining.length > 0) {
        orphans.push(`${collection}.${field} still has ${remaining.length} record(s) referencing dupeId ${dupeId}`);
      }
    }
  }

  if (orphans.length > 0) {
    console.error("\n  Zero-orphan verification FAILED:");
    orphans.forEach((o) => console.error(`    - ${o}`));
    throw new Error(`${orphans.length} orphan reference(s) remain — refusing to delete any dupe`);
  }
  console.log("  Zero orphans confirmed — safe to delete");
}

async function deleteDupes(confirmed) {
  console.log("\n--- Deleting dupes ---");
  let deleted = 0;
  let failed = 0;
  for (const decision of confirmed) {
    try {
      await pb.collection("products").delete(decision.dupeId);
      deleted++;
      console.log(`  deleted ${decision.dupeId} (${decision.name ?? "?"}) -> merged into ${decision.survivorId}`);
    } catch (e) {
      failed++;
      console.error(`  ⚠️  delete ${decision.dupeId} failed: ${fmtError(e)}`);
    }
  }
  console.log(`\n  Deleted ${deleted}/${confirmed.length} dupes${failed ? ` (${failed} failed)` : ""}`);
  if (failed > 0) {
    throw new Error(`${failed} delete(s) failed after references were already repointed — manual follow-up required`);
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("MERGE PRODUCTS — one-shot destructive dedup merge");
  console.log(`Target: ${PB_URL}`);
  console.log(`Decisions file: ${DECISIONS_PATH}`);
  console.log("=".repeat(80));

  const confirmed = await loadConfirmedDecisions(DECISIONS_PATH);
  if (confirmed.length === 0) {
    console.log("\nNo confirmed decisions with a survivorId found — nothing to do.");
    return;
  }

  await authenticateSuperuser();
  await preflightValidate(confirmed);
  await backupBeforeMerge();
  await repointReferences(confirmed);
  await verifyZeroOrphans(confirmed);
  await deleteDupes(confirmed);

  console.log("\n" + "=".repeat(80));
  console.log("✅ MERGE COMPLETE");
  console.log("=".repeat(80));
}

// Do NOT auto-run in CI/import contexts — this script is invoked manually in
// Plan 08's supervised prod run. main().catch(...) guard matches the
// project's existing script convention (find-duplicates.js, sync-to-test.js).
main().catch((e) => {
  console.error("\n❌ MERGE FAILED:", fmtError(e));
  process.exit(1);
});
