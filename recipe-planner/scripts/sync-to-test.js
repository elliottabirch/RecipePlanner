import PocketBase from "pocketbase";

// Note: DB URLs are also defined in src/lib/db-config.ts for the frontend
// But that's a TypeScript/browser module, so we duplicate them here for the Node.js script
const DB_URLS = {
  production: "http://192.168.50.95:8090",
  test: "http://192.168.50.95:8091",
};

// Connect to both databases
const pbProd = new PocketBase(DB_URLS.production);
const pbTest = new PocketBase(DB_URLS.test);

async function syncToTest() {
  console.log(
    "================================================================================",
  );
  console.log("SYNCING PRODUCTION DATA TO TEST DATABASE");
  console.log(
    "================================================================================\n",
  );
  console.log(`Source (Production): ${DB_URLS.production}`);
  console.log(`Target (Test):       ${DB_URLS.test}\n`);

  try {
    // Collections to sync (in order to preserve relationships)
    const collections = [
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
      "weekly_plans",
      "planned_meals",
      "inventory_items",
    ];

    let totalRecords = 0;

    for (const collectionName of collections) {
      console.log(`\n📦 Syncing collection: ${collectionName}`);

      try {
        // Get all records from production
        const prodRecords = await pbProd
          .collection(collectionName)
          .getFullList({
            sort: "created",
          });

        console.log(`  Found ${prodRecords.length} records in production`);

        if (prodRecords.length === 0) {
          console.log(`  ✓ Skipped (no records)`);
          continue;
        }

        // Delete all existing records in test
        const testRecords = await pbTest
          .collection(collectionName)
          .getFullList();

        for (const record of testRecords) {
          await pbTest.collection(collectionName).delete(record.id);
        }

        console.log(`  Cleared ${testRecords.length} existing test records`);

        // Copy records to test (preserving IDs)
        let copied = 0;
        for (const record of prodRecords) {
          try {
            // Remove system fields
            const {
              id,
              created,
              updated,
              collectionId,
              collectionName: _collectionName,
              expand,
              ...data
            } = record;

            // Create record in test with same ID
            await pbTest.collection(collectionName).create(
              {
                id, // Preserve the ID
                ...data,
              },
              {
                // Use create endpoint with ID specification
                $autoCancel: false,
              },
            );
            copied++;
          } catch (error) {
            console.error(
              `    ⚠️  Failed to copy record ${record.id}:`,
              error.message,
            );
          }
        }

        console.log(`  ✓ Copied ${copied} records`);
        totalRecords += copied;
      } catch (error) {
        console.error(`  ❌ Error syncing ${collectionName}:`, error.message);
      }
    }

    console.log("\n");
    console.log(
      "================================================================================",
    );
    console.log("✨ SYNC COMPLETE");
    console.log(
      "================================================================================",
    );
    console.log(`Total records synced: ${totalRecords}`);
    console.log("\n✅ Test database is now a copy of production\n");
  } catch (error) {
    console.error("\n❌ SYNC FAILED:");
    console.error(error);
    process.exit(1);
  }
}

// Run the sync
syncToTest();
