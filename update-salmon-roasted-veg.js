import PocketBase from "pocketbase";

const pb = new PocketBase("http://127.0.0.1:8090");

const RECIPE_ID = "23j8z8529m32404";

// Existing products (reused from veggie bowls and other recipes)
const existingProducts = {
  onionRed: "q7lg8g4v080cvgl",
  onionRedLargeDice: "d7451xuqk036i1r",
  sweetPotato: "95sz8vqs71bijy7",
  sweetPotatoLargeDice: "s6a5x3d7d55oblo",
  broccoli: "wmwz5h7253180rk",
  broccoliFlorets: "40kiv7uxu8c4fq2",
  roastedVegAggregate: "4t02jh5y52ffr1m",
};

// Things to DELETE from the current salmon recipe:
// - Costco "roasting vegetables" node: ca70q82h7g2lp7h
// - Edge from that node to assembly step: r24dg1z2ufezm83
// - Separate broccoli chain (now folded into veggie aggregate):
//   - broccoli raw node: i95l92764s6629b
//   - broccoli florets node: pzg3l9s2x5k8ih4
//   - broccoli florets roasted node: vmu4g83h96g2iwc
//   - broccoli florets stored node: f2cujx910j29sn2
//   - step "process broccoli": yi95f0836ys9hit
//   - step "roast broccoli": 4w08wp1znhm3di1
//   - step "store broccoli": 567bu263q5f3r37
//   - p2s edge broccoli -> process broccoli: 924qil9674tcv0u
//   - s2p edge process broccoli -> broccoli florets: 916ra6a7458pf9y
//   - p2s edge broccoli florets -> roast broccoli: 562u3a5b219zwg8
//   - s2p edge roast broccoli -> broccoli florets roasted: 5oicb09z0wm7a08
//   - p2s edge broccoli florets roasted -> store broccoli: i1jpj519y2hml15
//   - s2p edge store broccoli -> broccoli florets stored: q82b8pz1rd5ae8m
//   - p2s edge broccoli florets stored -> assembly step: 55ek61yx4373qq0

async function updateRecipe() {
  console.log("Updating: salmon and roasted veg (23j8z8529m32404)");
  console.log("Replacing Costco roasting veg with homemade roasted veg aggregate\n");

  // ============================================================================
  // STEP 1: Delete old edges
  // ============================================================================
  console.log("🗑️  Deleting old edges...");

  const edgesToDelete = {
    product_to_step_edges: [
      "r24dg1z2ufezm83", // costco veg -> assembly
      "924qil9674tcv0u", // broccoli -> process broccoli
      "562u3a5b219zwg8", // broccoli florets -> roast broccoli
      "i1jpj519y2hml15", // broccoli florets roasted -> store broccoli
      "55ek61yx4373qq0", // broccoli florets stored -> assembly
    ],
    step_to_product_edges: [
      "916ra6a7458pf9y", // process broccoli -> broccoli florets
      "5oicb09z0wm7a08", // roast broccoli -> broccoli florets roasted
      "q82b8pz1rd5ae8m", // store broccoli -> broccoli florets stored
    ],
  };

  for (const [collection, ids] of Object.entries(edgesToDelete)) {
    for (const id of ids) {
      await pb.collection(collection).delete(id);
      console.log(`  ✓ Deleted ${collection} edge: ${id}`);
    }
  }

  // ============================================================================
  // STEP 2: Delete old steps
  // ============================================================================
  console.log("\n🗑️  Deleting old steps...");

  const stepsToDelete = [
    "yi95f0836ys9hit", // process broccoli
    "4w08wp1znhm3di1", // roast broccoli
    "567bu263q5f3r37", // store broccoli
  ];

  for (const id of stepsToDelete) {
    await pb.collection("recipe_steps").delete(id);
    console.log(`  ✓ Deleted step: ${id}`);
  }

  // ============================================================================
  // STEP 3: Delete old product nodes
  // ============================================================================
  console.log("\n🗑️  Deleting old product nodes...");

  const nodesToDelete = [
    "ca70q82h7g2lp7h", // costco roasting vegetables
    "i95l92764s6629b", // broccoli raw
    "pzg3l9s2x5k8ih4", // broccoli florets
    "vmu4g83h96g2iwc", // broccoli florets roasted
    "f2cujx910j29sn2", // broccoli florets stored
  ];

  for (const id of nodesToDelete) {
    await pb.collection("recipe_product_nodes").delete(id);
    console.log(`  ✓ Deleted node: ${id}`);
  }

  // ============================================================================
  // STEP 4: Create new product nodes (matching veggie bowls pattern)
  // ============================================================================
  console.log("\n📦 Creating new product nodes...");

  const nodeOnionRed = await pb.collection("recipe_product_nodes").create({
    recipe: RECIPE_ID,
    product: existingProducts.onionRed,
    quantity: 1,
    unit: "ea",
  });
  console.log(`  ✓ onion (red): ${nodeOnionRed.id}`);

  const nodeSweetPotato = await pb.collection("recipe_product_nodes").create({
    recipe: RECIPE_ID,
    product: existingProducts.sweetPotato,
    quantity: 1,
    unit: "ea",
  });
  console.log(`  ✓ sweet potato: ${nodeSweetPotato.id}`);

  const nodeBroccoli = await pb.collection("recipe_product_nodes").create({
    recipe: RECIPE_ID,
    product: existingProducts.broccoli,
    quantity: 1,
    unit: "ea",
  });
  console.log(`  ✓ broccoli: ${nodeBroccoli.id}`);

  const nodeOnionDiced = await pb.collection("recipe_product_nodes").create({
    recipe: RECIPE_ID,
    product: existingProducts.onionRedLargeDice,
  });
  console.log(`  ✓ onion (red) large dice: ${nodeOnionDiced.id}`);

  const nodeSweetPotatoDiced = await pb
    .collection("recipe_product_nodes")
    .create({
      recipe: RECIPE_ID,
      product: existingProducts.sweetPotatoLargeDice,
    });
  console.log(`  ✓ sweet potato large dice: ${nodeSweetPotatoDiced.id}`);

  const nodeBroccoliFlorets = await pb
    .collection("recipe_product_nodes")
    .create({
      recipe: RECIPE_ID,
      product: existingProducts.broccoliFlorets,
    });
  console.log(`  ✓ broccoli florets: ${nodeBroccoliFlorets.id}`);

  const nodeVeggieAggregate = await pb
    .collection("recipe_product_nodes")
    .create({
      recipe: RECIPE_ID,
      product: existingProducts.roastedVegAggregate,
    });
  console.log(`  ✓ roasted veg aggregate (transient): ${nodeVeggieAggregate.id}`);

  // ============================================================================
  // STEP 5: Create new steps
  // ============================================================================
  console.log("\n⚙️  Creating new steps...");

  const stepDiceOnion = await pb.collection("recipe_steps").create({
    recipe: RECIPE_ID,
    name: "dice onions",
    step_type: "prep",
  });
  console.log(`  ✓ dice onions: ${stepDiceOnion.id}`);

  const stepDicePotato = await pb.collection("recipe_steps").create({
    recipe: RECIPE_ID,
    name: "dice potatoes",
    step_type: "prep",
  });
  console.log(`  ✓ dice potatoes: ${stepDicePotato.id}`);

  const stepProcessBroccoli = await pb.collection("recipe_steps").create({
    recipe: RECIPE_ID,
    name: "process broccoli into florets",
    step_type: "prep",
  });
  console.log(`  ✓ process broccoli into florets: ${stepProcessBroccoli.id}`);

  const stepAssembleVeg = await pb.collection("recipe_steps").create({
    recipe: RECIPE_ID,
    name: "assemble roasted veg",
    step_type: "assembly",
    timing: "batch",
  });
  console.log(`  ✓ assemble roasted veg: ${stepAssembleVeg.id}`);

  // ============================================================================
  // STEP 6: Create edges
  // ============================================================================
  console.log("\n🔗 Creating edges...");

  // Dice onion: onion red -> step -> onion red large dice
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeOnionRed.id,
    target: stepDiceOnion.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: RECIPE_ID,
    source: stepDiceOnion.id,
    target: nodeOnionDiced.id,
  });
  console.log("  ✓ onion -> dice -> onion diced");

  // Dice potato: sweet potato -> step -> sweet potato large dice
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeSweetPotato.id,
    target: stepDicePotato.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: RECIPE_ID,
    source: stepDicePotato.id,
    target: nodeSweetPotatoDiced.id,
  });
  console.log("  ✓ sweet potato -> dice -> sweet potato diced");

  // Process broccoli: broccoli -> step -> broccoli florets
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeBroccoli.id,
    target: stepProcessBroccoli.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: RECIPE_ID,
    source: stepProcessBroccoli.id,
    target: nodeBroccoliFlorets.id,
  });
  console.log("  ✓ broccoli -> process -> broccoli florets");

  // Assemble roasted veg: diced onion + diced potato + broccoli florets -> step -> veggie aggregate
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeOnionDiced.id,
    target: stepAssembleVeg.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeSweetPotatoDiced.id,
    target: stepAssembleVeg.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeBroccoliFlorets.id,
    target: stepAssembleVeg.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: RECIPE_ID,
    source: stepAssembleVeg.id,
    target: nodeVeggieAggregate.id,
  });
  console.log("  ✓ onion diced + sweet potato diced + broccoli florets -> assemble -> veggie aggregate");

  // Wire veggie aggregate into existing assembly step
  await pb.collection("product_to_step_edges").create({
    recipe: RECIPE_ID,
    source: nodeVeggieAggregate.id,
    target: "rz8w8lnd3n3de5s", // "assemble roasting veg and cook salmon"
  });
  console.log("  ✓ veggie aggregate -> final assembly step");

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n================================================================================");
  console.log("✨ UPDATE COMPLETE!");
  console.log("================================================================================");
  console.log("Deleted:");
  console.log("  - 5 product nodes (costco veg + broccoli chain)");
  console.log("  - 3 steps (broccoli process/roast/store)");
  console.log("  - 8 edges");
  console.log("Created:");
  console.log("  - 7 product nodes (onion, sweet potato, broccoli + transients + aggregate)");
  console.log("  - 4 steps (dice onion, dice potato, process broccoli, assemble roasted veg)");
  console.log("  - 11 edges");
  console.log("\nThe salmon recipe now uses homemade roasted veg aggregate");
  console.log("(onion + sweet potato + broccoli) instead of Costco roasting vegetables.\n");
}

updateRecipe().catch(console.error);
