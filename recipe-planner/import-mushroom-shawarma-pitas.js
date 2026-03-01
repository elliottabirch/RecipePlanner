import PocketBase from "pocketbase";

const pb = new PocketBase("http://192.168.50.95:8091"); // TEST ONLY

async function importRecipe() {
  console.log("Starting import: Vegetarian Mushroom Shawarma Pitas");

  // 1. Create recipe
  const recipe = await pb.collection("recipes").create({
    name: "Vegetarian Mushroom Shawarma Pitas",
    recipe_type: "meal",
  });
  console.log("Created recipe:", recipe.id);

  // 2. Product IDs (all products already exist)
  const products = {
    // Pre-existing products
    onionRed: "q7lg8g4v080cvgl",
    onionRedLargeDice: "d7451xuqk036i1r",
    plainGreekYogurt: "b48vxag34gap4ev",
    cilantro: "81u02r5087b916g",
    turmeric: "nualhpbsdc4e7v6",
    oliveOil: "6m06pr6cyq0e277",
    // Products created for this recipe
    portobeltoMushroom: "u44p8vv0w9t94ye",
    cabbageRed: "2h3e8e1o45ss01g",
    pita: "btuzm92cg0l86jo",
    cumin: "9322e1z0w70b703",
    coriander: "69vr4232uy37x3f",
    paprika: "1aw8hflei3r3729",
    salt: "ru31330bnw6ho3q",
    pepperBlack: "smg186lm9h7n69u",
    mushroomSliced: "0dui98u64e93912",
    cabbageRedSliced: "j50sk8304d6zh32",
    cabbageDressed: "n3ntk957523ptam",
    pitaWarmed: "8p113l04879j5vw",
    turmericYogurt: "t5d769k82t2xns2",
    mushroomShawarma: "t3t9w31m1s7075c",
    mushroomMixtureRoasted: "4go8kqz81k88jbu",
  };
  console.log("Using existing products");

  // 3. Create product nodes

  // Raw ingredient nodes
  const nodePortobello = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.portobeltoMushroom,
    quantity: 0.75,
    unit: "lb",
  });

  const nodeOnionRed = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.onionRed,
    quantity: 1,
    unit: "medium",
  });

  const nodeOliveOil = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.oliveOil,
    quantity: 3,
    unit: "tbsp",
  });

  const nodeOliveOil2 = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.oliveOil,
    quantity: 2,
    unit: "tsp",
  });

  const nodeCumin = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.cumin,
    quantity: 1,
    unit: "tsp",
  });

  const nodeCoriander = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.coriander,
    quantity: 0.75,
    unit: "tsp",
  });

  const nodePaprika = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.paprika,
    quantity: 0.5,
    unit: "tsp",
  });

  const nodeSalt = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.salt,
    quantity: 1,
    unit: "tsp",
  });

  const nodePepper = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.pepperBlack,
    quantity: 0.5,
    unit: "tsp",
  });

  const nodeCabbageRed = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.cabbageRed,
    quantity: 2,
    unit: "cups",
  });

  const nodeYogurt = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.plainGreekYogurt,
    quantity: 0.75,
    unit: "cup",
  });

  const nodeTurmeric = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.turmeric,
    quantity: 0.75,
    unit: "tsp",
  });

  const nodePita = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.pita,
    quantity: 4,
    unit: "pitas",
  });

  const nodeCilantro = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.cilantro,
    quantity: 1,
    unit: "bunch",
  });

  // Transient product nodes
  const nodeMushroomSliced = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.mushroomSliced,
  });

  const nodeOnionRedLargeDice = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.onionRedLargeDice,
  });

  const nodeCabbageRedSliced = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.cabbageRedSliced,
  });

  const nodeCabbageDressed = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.cabbageDressed,
  });

  const nodeTurmericYogurt = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.turmericYogurt,
  });

  const nodePitaWarmed = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.pitaWarmed,
  });

  const nodeMushroomShawarma = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.mushroomShawarma,
  });

  // Stored product node
  const nodeMushroomMixtureRoasted = await pb.collection("recipe_product_nodes").create({
    recipe: recipe.id,
    product: products.mushroomMixtureRoasted,
    quantity: 1,
    unit: "quart",
  });

  console.log("Created all product nodes");

  // 4. Create steps

  const stepSliceMushrooms = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Slice mushrooms ½-inch thick",
    step_type: "prep",
    timing: "batch",
  });

  const stepDiceOnion = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Large dice red onion",
    step_type: "prep",
    timing: "batch",
  });

  const stepSliceCabbage = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Thinly slice red cabbage",
    step_type: "prep",
    timing: "batch",
  });

  const stepRoast = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Roast mushrooms and onion with spices at 425°F for 20 min",
    step_type: "assembly",
    timing: "batch",
  });

  const stepMixYogurt = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Mix yogurt with turmeric, salt, and pepper",
    step_type: "assembly",
    timing: "batch",
  });

  const stepDressCabbage = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Toss cabbage with olive oil, salt, and pepper",
    step_type: "assembly",
    timing: "just_in_time",
  });

  const stepWarmPitas = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Warm pitas in oven for 5 min",
    step_type: "assembly",
    timing: "just_in_time",
  });

  const stepAssemble = await pb.collection("recipe_steps").create({
    recipe: recipe.id,
    name: "Slather yogurt on pitas, top with cabbage, mushroom mixture, and cilantro",
    step_type: "assembly",
    timing: "just_in_time",
  });

  console.log("Created all steps");

  // 5. Create edges

  // Slice mushrooms: portobello -> step -> mushroom sliced
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodePortobello.id,
    target: stepSliceMushrooms.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepSliceMushrooms.id,
    target: nodeMushroomSliced.id,
  });

  // Dice onion: onion red -> step -> onion red large dice
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeOnionRed.id,
    target: stepDiceOnion.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepDiceOnion.id,
    target: nodeOnionRedLargeDice.id,
  });

  // Slice cabbage: cabbage red -> step -> cabbage red sliced
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCabbageRed.id,
    target: stepSliceCabbage.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepSliceCabbage.id,
    target: nodeCabbageRedSliced.id,
  });

  // Roast: mushroom sliced, onion diced, oil, spices -> step -> mushroom mixture roasted
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeMushroomSliced.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeOnionRedLargeDice.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeOliveOil.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCumin.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCoriander.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodePaprika.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeSalt.id,
    target: stepRoast.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodePepper.id,
    target: stepRoast.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepRoast.id,
    target: nodeMushroomMixtureRoasted.id,
  });

  // Mix yogurt: yogurt, turmeric -> step -> turmeric yogurt
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeYogurt.id,
    target: stepMixYogurt.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeTurmeric.id,
    target: stepMixYogurt.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepMixYogurt.id,
    target: nodeTurmericYogurt.id,
  });

  // Dress cabbage: cabbage sliced, oil -> step -> cabbage dressed
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCabbageRedSliced.id,
    target: stepDressCabbage.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeOliveOil2.id,
    target: stepDressCabbage.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepDressCabbage.id,
    target: nodeCabbageDressed.id,
  });

  // Warm pitas: pita -> step -> pita warmed
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodePita.id,
    target: stepWarmPitas.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepWarmPitas.id,
    target: nodePitaWarmed.id,
  });

  // Assemble: pita warmed, turmeric yogurt, cabbage dressed, mushroom mixture, cilantro -> step -> final
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodePitaWarmed.id,
    target: stepAssemble.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeTurmericYogurt.id,
    target: stepAssemble.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCabbageDressed.id,
    target: stepAssemble.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeMushroomMixtureRoasted.id,
    target: stepAssemble.id,
  });
  await pb.collection("product_to_step_edges").create({
    recipe: recipe.id,
    source: nodeCilantro.id,
    target: stepAssemble.id,
  });
  await pb.collection("step_to_product_edges").create({
    recipe: recipe.id,
    source: stepAssemble.id,
    target: nodeMushroomShawarma.id,
  });

  console.log("Created all edges");
  console.log("\n✓ Import complete! Recipe ID:", recipe.id);
  console.log("Please verify in the TEST database UI (green chip)");
}

importRecipe().catch(console.error);
