import PocketBase from "pocketbase";

// ALWAYS connect to test database for safety
const TEST_DB_URL = "http://192.168.50.95:8090";

console.log("\n" + "=".repeat(80));
console.log("🟢 Database Target: TEST DATABASE ONLY");
console.log(`URL: ${TEST_DB_URL}`);
console.log("=".repeat(80) + "\n");

const pb = new PocketBase(TEST_DB_URL);

// Existing product/container IDs
const existing = {
  egg: "298esrj4xnlvg57",
  broccoliPattiesInventory: "p854ozl52kc1mk6", // Final product
  vacuumSealedBag: "13cm45jumr3i4o8", // Container type
};

async function importBroccoliPatties() {
  console.log(
    "================================================================================",
  );
  console.log("IMPORTING: Broccoli Patties (Batch Prep Recipe)");
  console.log(
    "================================================================================\n",
  );

  try {
    // ============================================================================
    // STEP 1: Create the Recipe
    // ============================================================================
    console.log("📝 Creating recipe...");
    const recipe = await pb.collection("recipes").create({
      name: "Broccoli Patties",
      recipe_type: "batch_prep",
      notes:
        "Creates frozen broccoli patties for inventory. Par-baked and vacuum sealed.",
    });
    console.log(`✓ Recipe created: ${recipe.id}\n`);

    // ============================================================================
    // STEP 2: Create Missing Products
    // ============================================================================
    console.log("🛒 Creating missing products...");

    const broccoliFrozen = await pb.collection("products").create({
      name: "broccoli (frozen)",
      type: "raw",
    });
    console.log(`✓ Created: broccoli (frozen) (${broccoliFrozen.id})`);

    const potatoRusset = await pb.collection("products").create({
      name: "potato (russet)",
      type: "raw",
    });
    console.log(`✓ Created: potato (russet) (${potatoRusset.id})`);

    const cheeseShredded = await pb.collection("products").create({
      name: "cheese shredded",
      type: "raw",
    });
    console.log(`✓ Created: cheese shredded (${cheeseShredded.id})`);

    const flour = await pb.collection("products").create({
      name: "flour",
      type: "raw",
      pantry: true,
    });
    console.log(`✓ Created: flour (${flour.id})`);

    const potatoDiced = await pb.collection("products").create({
      name: "potato (russet) large dice",
      type: "transient",
    });
    console.log(`✓ Created: potato (russet) large dice (${potatoDiced.id})`);

    const potatoBoiled = await pb.collection("products").create({
      name: "potato (russet) boiled",
      type: "transient",
    });
    console.log(`✓ Created: potato (russet) boiled (${potatoBoiled.id})`);

    const broccoliSteamed = await pb.collection("products").create({
      name: "broccoli steamed",
      type: "transient",
    });
    console.log(`✓ Created: broccoli steamed (${broccoliSteamed.id})`);

    const pattyMixture = await pb.collection("products").create({
      name: "broccoli patty mixture",
      type: "transient",
    });
    console.log(`✓ Created: broccoli patty mixture (${pattyMixture.id})`);

    const pattiesFormed = await pb.collection("products").create({
      name: "broccoli patties formed",
      type: "transient",
    });
    console.log(`✓ Created: broccoli patties formed (${pattiesFormed.id})`);

    const pattiesParBaked = await pb.collection("products").create({
      name: "broccoli patties par-baked",
      type: "transient",
    });
    console.log(
      `✓ Created: broccoli patties par-baked (${pattiesParBaked.id})\n`,
    );

    // ============================================================================
    // STEP 3: Create Product Nodes
    // ============================================================================
    console.log("📦 Creating product nodes...");

    // Raw ingredient nodes
    const node_broccoli = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: broccoliFrozen.id,
      quantity: 1,
      unit: "bag",
    });

    const node_eggs = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existing.egg,
      quantity: 6,
      unit: "whole",
    });

    const node_potato = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: potatoRusset.id,
      quantity: 2,
      unit: "whole",
    });

    const node_cheese = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: cheeseShredded.id,
      quantity: 1,
      unit: "bag",
    });

    const node_flour = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: flour.id,
      quantity: 4,
      unit: "tbsp",
    });

    // Transient nodes
    const node_potatoDiced = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: potatoDiced.id,
      });

    const node_potatoBoiled = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: potatoBoiled.id,
      });

    const node_broccoliSteamed = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: broccoliSteamed.id,
      });

    const node_pattyMixture = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: pattyMixture.id,
      });

    const node_pattiesFormed = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: pattiesFormed.id,
      });

    const node_pattiesParBaked = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: pattiesParBaked.id,
      });

    // Final inventory product node
    const node_finalPatties = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: existing.broccoliPattiesInventory,
      });

    console.log(`✓ Created 12 product nodes\n`);

    // ============================================================================
    // STEP 4: Create Steps
    // ============================================================================
    console.log("⚙️  Creating recipe steps...");

    const step_dicePotatoes = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Large dice potatoes",
      step_type: "prep",
      timing: "batch",
    });

    const step_boilPotatoes = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Boil potatoes",
      step_type: "prep",
      timing: "batch",
    });

    const step_steamBroccoli = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Steam broccoli",
      step_type: "assembly",
      timing: "batch",
    });

    const step_combine = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Combine ingredients",
      step_type: "assembly",
      timing: "batch",
    });

    const step_form = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Form patties",
      step_type: "assembly",
      timing: "batch",
    });

    const step_parBake = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Par bake patties",
      step_type: "assembly",
      timing: "batch",
    });

    const step_package = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Package for freezing",
      step_type: "assembly",
      timing: "batch",
    });

    console.log(`✓ Created 7 steps\n`);

    // ============================================================================
    // STEP 5: Create Edges
    // ============================================================================
    console.log("🔗 Creating edges...");

    let edgeCount = 0;

    // Dice potatoes
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_potato.id,
      target: step_dicePotatoes.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_dicePotatoes.id,
      target: node_potatoDiced.id,
    });
    edgeCount += 2;

    // Boil potatoes
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_potatoDiced.id,
      target: step_boilPotatoes.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_boilPotatoes.id,
      target: node_potatoBoiled.id,
    });
    edgeCount += 2;

    // Steam broccoli
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_broccoli.id,
      target: step_steamBroccoli.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_steamBroccoli.id,
      target: node_broccoliSteamed.id,
    });
    edgeCount += 2;

    // Combine ingredients
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_broccoliSteamed.id,
      target: step_combine.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_potatoBoiled.id,
      target: step_combine.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_eggs.id,
      target: step_combine.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_cheese.id,
      target: step_combine.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_flour.id,
      target: step_combine.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_combine.id,
      target: node_pattyMixture.id,
    });
    edgeCount += 6;

    // Form patties
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_pattyMixture.id,
      target: step_form.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_form.id,
      target: node_pattiesFormed.id,
    });
    edgeCount += 2;

    // Par bake
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_pattiesFormed.id,
      target: step_parBake.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_parBake.id,
      target: node_pattiesParBaked.id,
    });
    edgeCount += 2;

    // Package for freezing
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_pattiesParBaked.id,
      target: step_package.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_package.id,
      target: node_finalPatties.id,
    });
    edgeCount += 2;

    console.log(`✓ Created ${edgeCount} edges\n`);

    // ============================================================================
    // STEP 6: Update Final Product with Container Type
    // ============================================================================
    console.log("📦 Updating final product with container type...");

    await pb.collection("products").update(existing.broccoliPattiesInventory, {
      container_type: existing.vacuumSealedBag,
      storage_location: "freezer",
    });
    console.log(`✓ Updated broccoli patties with container type\n`);

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log(
      "================================================================================",
    );
    console.log("✨ IMPORT COMPLETE!");
    console.log(
      "================================================================================",
    );
    console.log(`Recipe ID: ${recipe.id}`);
    console.log(`Recipe Name: ${recipe.name}`);
    console.log(`Recipe Type: ${recipe.recipe_type}`);
    console.log(`\nStats:`);
    console.log(`  - 10 new products created`);
    console.log(
      `  - 2 existing products referenced (egg, broccoli patties inventory)`,
    );
    console.log(`  - 12 product nodes created`);
    console.log(`  - 7 steps created (2 prep + 5 assembly)`);
    console.log(`  - ${edgeCount} edges created`);
    console.log(`\nThis batch_prep recipe produces:`);
    console.log(
      `  → broccoli patties [inventory] - stored in vacuum sealed bags in freezer`,
    );
    console.log("\n✅ Recipe imported to TEST database successfully!\n");
  } catch (error) {
    console.error("\n❌ ERROR during import:");
    console.error(error);
    throw error;
  }
}

// Run the import
importBroccoliPatties();
