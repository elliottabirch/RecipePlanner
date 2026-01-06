/**
 * Inventory Feature Migration Script
 *
 * This script sets recipe_type = "meal" for all existing recipes
 * Run this AFTER importing the updated schema (pb_schema_updated.json)
 *
 * Usage:
 *   node migration.js
 */

import PocketBase from "pocketbase";

// Configuration
const PB_URL = "http://192.168.50.95:8090";

async function runMigration() {
  console.log("🚀 Starting Inventory Feature Migration...\n");

  const pb = new PocketBase(PB_URL);

  try {
    // Step 1: Connect to PocketBase
    console.log("📡 Connecting to PocketBase at", PB_URL);

    // Note: PocketBase doesn't require auth for API calls when rules are set to ""
    // If your instance requires auth, uncomment and configure:
    // await pb.admins.authWithPassword('admin@example.com', 'your-password');

    // Step 2: Fetch all recipes
    console.log("📚 Fetching all recipes...");
    const recipes = await pb.collection("recipes").getFullList({
      sort: "name",
    });

    console.log(`Found ${recipes.length} recipes\n`);

    // Step 3: Update recipes that don't have recipe_type set
    let updatedCount = 0;
    let skippedCount = 0;

    for (const recipe of recipes) {
      if (!recipe.recipe_type) {
        try {
          await pb.collection("recipes").update(recipe.id, {
            recipe_type: "meal",
          });
          console.log(`✅ Updated: ${recipe.name} -> meal`);
          updatedCount++;
        } catch (error) {
          console.error(`❌ Failed to update ${recipe.name}:`, error.message);
        }
      } else {
        console.log(
          `⏭️  Skipped: ${recipe.name} (already has type: ${recipe.recipe_type})`
        );
        skippedCount++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("Migration Complete!");
    console.log("=".repeat(50));
    console.log(`✅ Updated: ${updatedCount} recipes`);
    console.log(
      `⏭️  Skipped: ${skippedCount} recipes (already had recipe_type)`
    );
    console.log(`📊 Total:   ${recipes.length} recipes`);

    if (updatedCount === 0 && recipes.length > 0) {
      console.log("\n⚠️  No recipes were updated. This is normal if:");
      console.log("   - Migration has already been run");
      console.log("   - All recipes already have recipe_type set");
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Ensure PocketBase is running at", PB_URL);
    console.error(
      "2. Verify schema has been imported (pb_schema_updated.json)"
    );
    console.error(
      "3. Check that recipe_type field exists in recipes collection"
    );
    process.exit(1);
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log("\n✨ Migration script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Unexpected error:", error);
    process.exit(1);
  });
