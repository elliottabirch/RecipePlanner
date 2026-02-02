import PocketBase from "pocketbase";

const pb = new PocketBase("http://192.168.50.95:8090");

// Existing product IDs (from database check)
const existingProducts = {
  parsley: "4a3mv36va1b8725",
  lemon: "1oz6u19730m3e6z",
  oliveOil: "6m06pr6cyq0e277",
  tomatoCherry: "z31z0k8zh08e615",
  onionYellow: "10x87sv01ut8xa7",
  thymeFresh: "0817ac3dc7j9856",
  vegetableStock: "j103oq1sw4vl9ax",
  parsleyChopped: "63s20tb673d6mj8",
  onionYellowSmallDice: "r6au9u3209qsc1n",
};

async function importWhiteBeanStew() {
  console.log(
    "================================================================================",
  );
  console.log("IMPORTING: White Bean and Tomato Stew");
  console.log(
    "================================================================================\n",
  );

  try {
    // ============================================================================
    // STEP 1: Create the Recipe
    // ============================================================================
    console.log("📝 Creating recipe...");
    const recipe = await pb.collection("recipes").create({
      name: "White Bean and Tomato Stew",
      recipe_type: "meal",
      notes:
        "Serves 4-6. Tomatoes roasted with thyme, beans simmered with aromatics.",
    });
    console.log(`✓ Recipe created: ${recipe.id}\n`);

    // ============================================================================
    // STEP 2: Create Missing Products
    // ============================================================================
    console.log("🛒 Creating missing products...");

    const whiteBeans = await pb.collection("products").create({
      name: "white beans",
      type: "raw",
      pantry: true,
    });
    console.log(`✓ Created: white beans (${whiteBeans.id})`);

    const redPepperFlakes = await pb.collection("products").create({
      name: "red pepper flakes",
      type: "raw",
      pantry: true,
    });
    console.log(`✓ Created: red pepper flakes (${redPepperFlakes.id})`);

    const frozenGarlicCubes = await pb.collection("products").create({
      name: "garlic cubes (frozen)",
      type: "inventory",
    });
    console.log(`✓ Created: garlic cubes (frozen) (${frozenGarlicCubes.id})`);

    const lemonZest = await pb.collection("products").create({
      name: "lemon zest",
      type: "transient",
    });
    console.log(`✓ Created: lemon zest (${lemonZest.id})`);

    const garlicCube = await pb.collection("products").create({
      name: "garlic cube (pulled)",
      type: "transient",
    });
    console.log(`✓ Created: garlic cube (pulled) (${garlicCube.id})`);

    const rinsedBeans = await pb.collection("products").create({
      name: "white beans rinsed",
      type: "transient",
    });
    console.log(`✓ Created: white beans rinsed (${rinsedBeans.id})`);

    const roastedTomatoes = await pb.collection("products").create({
      name: "tomato cherry roasted",
      type: "transient",
    });
    console.log(`✓ Created: tomato cherry roasted (${roastedTomatoes.id})`);

    const sauteedAromatics = await pb.collection("products").create({
      name: "aromatics sautéed",
      type: "transient",
    });
    console.log(`✓ Created: aromatics sautéed (${sauteedAromatics.id})`);

    const beanMixture = await pb.collection("products").create({
      name: "bean mixture",
      type: "transient",
    });
    console.log(`✓ Created: bean mixture (${beanMixture.id})`);

    const lemonParsleyMix = await pb.collection("products").create({
      name: "lemon-parsley mixture",
      type: "stored",
    });
    console.log(`✓ Created: lemon-parsley mixture (${lemonParsleyMix.id})`);

    const stewBase = await pb.collection("products").create({
      name: "white bean tomato stew base",
      type: "stored",
    });
    console.log(`✓ Created: white bean tomato stew base (${stewBase.id})`);

    const finalStew = await pb.collection("products").create({
      name: "white bean stew with lemon-parsley",
      type: "transient",
    });
    console.log(
      `✓ Created: white bean stew with lemon-parsley (${finalStew.id})\n`,
    );

    // ============================================================================
    // STEP 3: Create Product Nodes
    // ============================================================================
    console.log("📦 Creating product nodes...");

    // Raw ingredient nodes
    const node_parsley = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.parsley,
      quantity: 0.5,
      unit: "cup",
    });

    const node_lemon = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.lemon,
      quantity: 1,
      unit: "large",
    });

    const node_cherryTomatoes = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: existingProducts.tomatoCherry,
        quantity: 20,
        unit: "oz",
      });

    const node_oliveOil1 = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.oliveOil,
      quantity: 0.25,
      unit: "cup",
    });

    const node_oliveOil2 = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.oliveOil,
      quantity: 2,
      unit: "tbsp",
    });

    const node_thyme = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.thymeFresh,
      quantity: 1,
      unit: "tbsp",
    });

    const node_onion = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.onionYellow,
      quantity: 1,
      unit: "medium",
    });

    const node_frozenGarlic = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: frozenGarlicCubes.id,
        quantity: 1,
        unit: "cube",
      });

    const node_pepperFlakes = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: redPepperFlakes.id,
        quantity: 0.5,
        unit: "tsp",
      });

    const node_whiteBeans = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: whiteBeans.id,
      quantity: 30,
      unit: "oz",
    });

    const node_stock = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.vegetableStock,
      quantity: 1.5,
      unit: "cups",
    });

    // Transient/intermediate nodes
    const node_parsleyChopped = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: existingProducts.parsleyChopped,
      });

    const node_lemonZest = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: lemonZest.id,
    });

    const node_onionDiced = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: existingProducts.onionYellowSmallDice,
    });

    const node_garlicCube = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: garlicCube.id,
    });

    const node_rinsedBeans = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: rinsedBeans.id,
      });

    const node_roastedTomatoes = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: roastedTomatoes.id,
      });

    const node_sauteedAromatics = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: sauteedAromatics.id,
      });

    const node_beanMixture = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: beanMixture.id,
      });

    const node_lemonParsleyMix = await pb
      .collection("recipe_product_nodes")
      .create({
        recipe: recipe.id,
        product: lemonParsleyMix.id,
      });

    const node_stewBase = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: stewBase.id,
    });

    const node_finalStew = await pb.collection("recipe_product_nodes").create({
      recipe: recipe.id,
      product: finalStew.id,
    });

    console.log(`✓ Created ${21} product nodes\n`);

    // ============================================================================
    // STEP 4: Create Steps
    // ============================================================================
    console.log("⚙️  Creating recipe steps...");

    const step_chopParsley = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Chop parsley",
      step_type: "prep",
      timing: "batch",
    });

    const step_zestLemon = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Zest lemon",
      step_type: "prep",
      timing: "batch",
    });

    const step_diceOnion = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Small dice onion",
      step_type: "prep",
      timing: "batch",
    });

    const step_pullGarlic = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Pull frozen garlic cube",
      step_type: "prep",
      timing: "batch",
    });

    const step_rinseBeans = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Rinse beans",
      step_type: "prep",
      timing: "batch",
    });

    const step_makeLemonParsley = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Make lemon-parsley mixture",
      step_type: "prep",
      timing: "batch",
    });

    const step_roastTomatoes = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Roast tomatoes",
      step_type: "prep",
      timing: "batch",
    });

    const step_sauteAromatics = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Sauté aromatics",
      step_type: "prep",
      timing: "batch",
    });

    const step_simmerBeans = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Simmer beans",
      step_type: "prep",
      timing: "batch",
    });

    const step_combineStew = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Combine stew base",
      step_type: "assembly",
      timing: "batch",
    });

    const step_serve = await pb.collection("recipe_steps").create({
      recipe: recipe.id,
      name: "Serve with topping",
      step_type: "assembly",
      timing: "just_in_time",
    });

    console.log(`✓ Created ${11} steps\n`);

    // ============================================================================
    // STEP 5: Create Edges (Product → Step → Product)
    // ============================================================================
    console.log("🔗 Creating edges...");

    let edgeCount = 0;

    // Chop parsley
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_parsley.id,
      target: step_chopParsley.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_chopParsley.id,
      target: node_parsleyChopped.id,
    });
    edgeCount += 2;

    // Zest lemon
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_lemon.id,
      target: step_zestLemon.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_zestLemon.id,
      target: node_lemonZest.id,
    });
    edgeCount += 2;

    // Dice onion
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_onion.id,
      target: step_diceOnion.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_diceOnion.id,
      target: node_onionDiced.id,
    });
    edgeCount += 2;

    // Pull garlic
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_frozenGarlic.id,
      target: step_pullGarlic.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_pullGarlic.id,
      target: node_garlicCube.id,
    });
    edgeCount += 2;

    // Rinse beans
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_whiteBeans.id,
      target: step_rinseBeans.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_rinseBeans.id,
      target: node_rinsedBeans.id,
    });
    edgeCount += 2;

    // Make lemon-parsley
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_parsleyChopped.id,
      target: step_makeLemonParsley.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_lemonZest.id,
      target: step_makeLemonParsley.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_makeLemonParsley.id,
      target: node_lemonParsleyMix.id,
    });
    edgeCount += 3;

    // Roast tomatoes
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_cherryTomatoes.id,
      target: step_roastTomatoes.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_oliveOil1.id,
      target: step_roastTomatoes.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_thyme.id,
      target: step_roastTomatoes.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_roastTomatoes.id,
      target: node_roastedTomatoes.id,
    });
    edgeCount += 4;

    // Sauté aromatics
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_oliveOil2.id,
      target: step_sauteAromatics.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_onionDiced.id,
      target: step_sauteAromatics.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_garlicCube.id,
      target: step_sauteAromatics.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_pepperFlakes.id,
      target: step_sauteAromatics.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_sauteAromatics.id,
      target: node_sauteedAromatics.id,
    });
    edgeCount += 5;

    // Simmer beans
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_sauteedAromatics.id,
      target: step_simmerBeans.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_rinsedBeans.id,
      target: step_simmerBeans.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_stock.id,
      target: step_simmerBeans.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_simmerBeans.id,
      target: node_beanMixture.id,
    });
    edgeCount += 4;

    // Combine stew
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_beanMixture.id,
      target: step_combineStew.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_roastedTomatoes.id,
      target: step_combineStew.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_combineStew.id,
      target: node_stewBase.id,
    });
    edgeCount += 3;

    // Serve
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_stewBase.id,
      target: step_serve.id,
    });
    await pb.collection("product_to_step_edges").create({
      recipe: recipe.id,
      source: node_lemonParsleyMix.id,
      target: step_serve.id,
    });
    await pb.collection("step_to_product_edges").create({
      recipe: recipe.id,
      source: step_serve.id,
      target: node_finalStew.id,
    });
    edgeCount += 3;

    console.log(`✓ Created ${edgeCount} edges\n`);

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
    console.log(`\nStats:`);
    console.log(`  - 12 new products created`);
    console.log(`  - 9 existing products referenced`);
    console.log(`  - 21 product nodes created`);
    console.log(`  - 11 steps created`);
    console.log(`  - ${edgeCount} edges created`);
    console.log("\n✅ Recipe is ready to use in the system!\n");
  } catch (error) {
    console.error("\n❌ ERROR during import:");
    console.error(error);
    throw error;
  }
}

// Run the import
importWhiteBeanStew();
