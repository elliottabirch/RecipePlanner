import PocketBase from "pocketbase";

const pbTest = new PocketBase("http://192.168.50.95:8091");
const pbProd = new PocketBase("http://192.168.50.95:8090");

const RECIPE_IDS = [
  "jp25ysz3hfm16n3", // Indian Vegetarian (batch)
  "0v7cc9889tf8nr3", // Sliced Cucumbers
  "3z8jey685yjq4li", // Smoked Pork Shoulder (batch)
];

function stripSystemFields(record) {
  const { created, updated, collectionId, collectionName, expand, ...data } =
    record;
  return data;
}

async function buildProductIdMap() {
  const testProducts = new Map();
  for (const recipeId of RECIPE_IDS) {
    const nodes = await pbTest
      .collection("recipe_product_nodes")
      .getFullList({ filter: `recipe='${recipeId}'`, expand: "product" });
    for (const node of nodes) {
      const product = node.expand?.product;
      if (product && !testProducts.has(product.id)) {
        testProducts.set(product.id, product);
      }
    }
  }

  const prodProducts = await pbProd.collection("products").getFullList();
  const prodByName = new Map();
  for (const p of prodProducts) {
    prodByName.set(p.name.toLowerCase(), p);
  }

  const idMap = new Map();
  const created = [];
  const matched = [];

  for (const [testId, testProduct] of testProducts) {
    const existing = prodByName.get(testProduct.name.toLowerCase());
    if (existing) {
      idMap.set(testId, existing.id);
      matched.push(`  ${testProduct.name} (test:${testId} -> prod:${existing.id})`);
    } else {
      const data = stripSystemFields(testProduct);
      try {
        const newProduct = await pbProd
          .collection("products")
          .create(data, { $autoCancel: false });
        idMap.set(testId, newProduct.id);
        created.push(`  ${testProduct.name} (test:${testId} -> prod:${newProduct.id})`);
      } catch (e) {
        console.error(`FAILED to create product "${testProduct.name}":`, e.message);
        idMap.set(testId, testId);
      }
    }
  }

  console.log(`\nProducts matched in prod (${matched.length}):`);
  matched.forEach((m) => console.log(m));
  console.log(`\nProducts created in prod (${created.length}):`);
  created.forEach((c) => console.log(c));

  return idMap;
}

async function migrateRecipe(recipeId, productIdMap) {
  const recipe = await pbTest.collection("recipes").getOne(recipeId);
  console.log(`\n--- Migrating: ${recipe.name} (${recipeId}) ---`);

  let existingRecipe;
  try {
    existingRecipe = await pbProd.collection("recipes").getOne(recipeId);
  } catch {}

  if (existingRecipe) {
    console.log("  Recipe already exists in prod, updating...");
    await pbProd
      .collection("recipes")
      .update(recipeId, stripSystemFields(recipe), { $autoCancel: false });
  } else {
    await pbProd
      .collection("recipes")
      .create(stripSystemFields(recipe), { $autoCancel: false });
    console.log("  Recipe created.");
  }

  const testTags = await pbTest
    .collection("recipe_tags")
    .getFullList({ filter: `recipe='${recipeId}'` });
  for (const tag of testTags) {
    try {
      await pbProd.collection("recipe_tags").getOne(tag.id);
      console.log(`  Tag ${tag.tag} already exists, skipping.`);
    } catch {
      await pbProd
        .collection("recipe_tags")
        .create(stripSystemFields(tag), { $autoCancel: false });
      console.log(`  Tag ${tag.tag} created.`);
    }
  }

  const testNodes = await pbTest
    .collection("recipe_product_nodes")
    .getFullList({ filter: `recipe='${recipeId}'` });

  const nodeIdMap = new Map();

  for (const node of testNodes) {
    const data = stripSystemFields(node);
    data.product = productIdMap.get(node.product) || node.product;

    let existingNode;
    try {
      existingNode = await pbProd
        .collection("recipe_product_nodes")
        .getOne(node.id);
    } catch {}

    if (existingNode) {
      await pbProd
        .collection("recipe_product_nodes")
        .update(node.id, data, { $autoCancel: false });
      nodeIdMap.set(node.id, node.id);
    } else {
      const newNode = await pbProd
        .collection("recipe_product_nodes")
        .create(data, { $autoCancel: false });
      nodeIdMap.set(node.id, newNode.id);
    }
  }
  console.log(`  ${testNodes.length} product nodes migrated.`);

  const testSteps = await pbTest
    .collection("recipe_steps")
    .getFullList({ filter: `recipe='${recipeId}'` });

  const stepIdMap = new Map();

  for (const step of testSteps) {
    const data = stripSystemFields(step);

    let existingStep;
    try {
      existingStep = await pbProd.collection("recipe_steps").getOne(step.id);
    } catch {}

    if (existingStep) {
      await pbProd
        .collection("recipe_steps")
        .update(step.id, data, { $autoCancel: false });
      stepIdMap.set(step.id, step.id);
    } else {
      const newStep = await pbProd
        .collection("recipe_steps")
        .create(data, { $autoCancel: false });
      stepIdMap.set(step.id, newStep.id);
    }
  }
  console.log(`  ${testSteps.length} steps migrated.`);

  const testPtsEdges = await pbTest
    .collection("product_to_step_edges")
    .getFullList({ filter: `recipe='${recipeId}'` });

  for (const edge of testPtsEdges) {
    const data = stripSystemFields(edge);
    data.source = nodeIdMap.get(edge.source) || edge.source;
    data.target = stepIdMap.get(edge.target) || edge.target;

    try {
      await pbProd.collection("product_to_step_edges").getOne(edge.id);
      await pbProd
        .collection("product_to_step_edges")
        .update(edge.id, data, { $autoCancel: false });
    } catch {
      await pbProd
        .collection("product_to_step_edges")
        .create(data, { $autoCancel: false });
    }
  }
  console.log(`  ${testPtsEdges.length} product->step edges migrated.`);

  const testStpEdges = await pbTest
    .collection("step_to_product_edges")
    .getFullList({ filter: `recipe='${recipeId}'` });

  for (const edge of testStpEdges) {
    const data = stripSystemFields(edge);
    data.source = stepIdMap.get(edge.source) || edge.source;
    data.target = nodeIdMap.get(edge.target) || edge.target;

    try {
      await pbProd.collection("step_to_product_edges").getOne(edge.id);
      await pbProd
        .collection("step_to_product_edges")
        .update(edge.id, data, { $autoCancel: false });
    } catch {
      await pbProd
        .collection("step_to_product_edges")
        .create(data, { $autoCancel: false });
    }
  }
  console.log(`  ${testStpEdges.length} step->product edges migrated.`);
}

async function main() {
  console.log("Building product ID map (matching by name, creating new)...\n");
  const productIdMap = await buildProductIdMap();

  for (const recipeId of RECIPE_IDS) {
    await migrateRecipe(recipeId, productIdMap);
  }

  console.log("\nMigration complete!");
}

main().catch(console.error);
