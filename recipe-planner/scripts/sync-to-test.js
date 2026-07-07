import PocketBase from "pocketbase";

// Note: DB URLs are also defined in src/lib/db-config.ts for the frontend
// But that's a TypeScript/browser module, so we duplicate them here for the Node.js script
const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};

const pbProd = new PocketBase(DB_URLS.production);
const pbTest = new PocketBase(DB_URLS.test);

// Top-down dependency order (parents first). Used for create.
// Reverse of this is used for delete so children are removed before parents
// (PocketBase rejects deletes that would orphan a required relation).
//
// Some relation fields cannot be satisfied in a single top-down pass:
//   - products.source_recipe   -> recipes (copied AFTER products)
//   - products.store_bought_product -> products (self-reference; target may
//     not be copied yet within the same collection pass)
// These are stripped at create time and patched in a deferred second pass
// after every collection has been copied.
const DEFERRED_RELATION_FIELDS = {
  products: ["source_recipe", "store_bought_product"],
};

const COLLECTIONS_TOP_DOWN = [
  "stores",
  "sections",
  "container_types",
  "tags",
  "products",
  "recipes",
  "recipe_tags",
  "recipe_product_nodes",
  "recipe_steps",
  "product_to_step_edges",
  "step_to_product_edges",
  "week_templates",
  "template_slots",
  "weekly_plans",
  "planned_meals",
  "meal_variant_overrides",
  "inventory_items",
  "recipe_queue",
];

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function clearAllTestCollections() {
  console.log("\n--- Phase 1: clearing test DB (children → parents) ---");
  const order = [...COLLECTIONS_TOP_DOWN].reverse();
  for (const name of order) {
    const records = await pbTest.collection(name).getFullList();
    if (records.length === 0) {
      console.log(`  ${name}: empty`);
      continue;
    }
    let deleted = 0;
    let failed = 0;
    for (const r of records) {
      try {
        await pbTest.collection(name).delete(r.id);
        deleted++;
      } catch (e) {
        failed++;
        if (failed <= 3) {
          console.log(`    ⚠️  delete ${name}/${r.id} failed: ${fmtError(e)}`);
        }
      }
    }
    console.log(`  ${name}: deleted ${deleted}/${records.length}${failed ? ` (${failed} failed)` : ""}`);
    if (failed > 0) {
      throw new Error(`Could not fully clear ${name} — aborting before partial copy makes things worse`);
    }
  }
}

async function copyAllFromProd() {
  console.log("\n--- Phase 2: copying prod → test (parents → children) ---");
  let totalCopied = 0;
  // { collection, id, patch } entries applied after all collections copy.
  const deferredPatches = [];
  for (const name of COLLECTIONS_TOP_DOWN) {
    const prodRecords = await pbProd.collection(name).getFullList();
    if (prodRecords.length === 0) {
      console.log(`  ${name}: empty in prod`);
      continue;
    }
    const deferredFields = DEFERRED_RELATION_FIELDS[name] ?? [];
    let copied = 0;
    let failed = 0;
    for (const record of prodRecords) {
      const {
        id,
        created,
        updated,
        collectionId,
        collectionName: _cn,
        expand,
        ...data
      } = record;
      const patch = {};
      for (const field of deferredFields) {
        if (data[field]) {
          patch[field] = data[field];
          delete data[field];
        }
      }
      try {
        await pbTest.collection(name).create(
          { id, ...data },
          { $autoCancel: false },
        );
        copied++;
        if (Object.keys(patch).length > 0) {
          deferredPatches.push({ collection: name, id, patch });
        }
      } catch (e) {
        failed++;
        if (failed <= 5) {
          console.log(`    ⚠️  create ${name}/${id} failed: ${fmtError(e)}`);
        }
      }
    }
    console.log(`  ${name}: copied ${copied}/${prodRecords.length}${failed ? ` (${failed} failed)` : ""}`);
    totalCopied += copied;
    if (failed > 0) {
      throw new Error(`Aborting at ${name} — ${failed} create failures would corrupt downstream collections`);
    }
  }

  if (deferredPatches.length > 0) {
    console.log("\n--- Phase 3: patching deferred relation fields ---");
    let patched = 0;
    let failed = 0;
    for (const { collection, id, patch } of deferredPatches) {
      try {
        await pbTest.collection(collection).update(id, patch, { $autoCancel: false });
        patched++;
      } catch (e) {
        failed++;
        console.log(`    ⚠️  patch ${collection}/${id} failed: ${fmtError(e)}`);
      }
    }
    console.log(`  deferred relations patched: ${patched}/${deferredPatches.length}${failed ? ` (${failed} failed)` : ""}`);
    if (failed > 0) {
      throw new Error(`${failed} deferred relation patch(es) failed — test copy is incomplete`);
    }
  }
  return totalCopied;
}

async function syncToTest() {
  console.log("=".repeat(80));
  console.log("SYNCING PRODUCTION DATA TO TEST DATABASE");
  console.log("=".repeat(80));
  console.log(`Source (Production): ${DB_URLS.production}`);
  console.log(`Target (Test):       ${DB_URLS.test}`);

  try {
    await clearAllTestCollections();
    const total = await copyAllFromProd();
    console.log("\n" + "=".repeat(80));
    console.log("✨ SYNC COMPLETE");
    console.log("=".repeat(80));
    console.log(`Total records synced: ${total}`);
    console.log("\n✅ Test database is now a copy of production\n");
  } catch (error) {
    console.error("\n❌ SYNC FAILED:", fmtError(error));
    process.exit(1);
  }
}

syncToTest();
