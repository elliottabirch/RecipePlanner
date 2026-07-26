/**
 * Week of 7/27 non-batch swap + batch source_recipe backfill (2026-07-26).
 *
 * Part A — cause: the week-of-7/27 plan (weekly_plan `pux2ogukimdz0nt`) was
 * seeded with the *batch_prep* recipes for two meals, but batch_prep recipes
 * produce stocked/frozen inventory rather than a servable meal in their own
 * right — the week wizard should point Micah's plan at the *served* /
 * finished-product recipes instead. Two more wrinkles found while auditing
 * the plan: `brocolli patty` [7n6eqg67l202v93] was double-booked into BOTH
 * the Micah Greens slot (`l1yx2132mndu2e6`'s sibling, `d7ilk085e3jkvaw`) and
 * the Micah Starch slot (`3m051r9vtpszq2u`) — it should appear exactly once.
 *
 * Fix (operator decisions, 2026-07-26, confirmed via checkpoint):
 *   - `l1yx2132mndu2e6` (Micah, slot 3303a2a07mpi91y): spinach egg bites
 *     (batch) [r07s7n7al8it77m] -> egg bites (served) [63050g2r2f9th3z]
 *   - `d7ilk085e3jkvaw` (Micah Greens, slot vb16t4pw39u6551): Broccoli
 *     Patties (batch) [ut4yb99zw2l51h5] -> brocolli patty [7n6eqg67l202v93]
 *   - `3m051r9vtpszq2u` (Micah Starch, slot 34e41yy5n968eb1): DELETE — the
 *     brocolli-patty duplicate in the Starch slot; the dish now lives once,
 *     in the Greens slot via the update above.
 *
 * Part B — cause: batch_prep recipes stock inventory products (e.g. "spinach
 * egg bites" [inventory]) but many of those products never got
 * `source_recipe` backfilled to point at the batch recipe that produces
 * them, so nothing upstream can trace a stocked product back to its batch.
 *
 * Fix (operator decision, 2026-07-26): for every published batch_prep
 * recipe, walk its step_to_product_edges to find the recipe_product_nodes it
 * outputs, resolve each node's `product`, and for any `type=inventory`
 * product with an empty `source_recipe`, set it to the batch recipe's id.
 * Products already linked to this same recipe are left alone; products
 * linked to a DIFFERENT recipe are reported as conflicts and NOT
 * overwritten; products produced by more than one batch recipe are reported
 * as ambiguous and skipped. Note: step_to_product_edges.target is a
 * recipe_product_node id (step OUTPUT) — not to be confused with
 * product_to_step_edges.source, which is a node id feeding INTO a step
 * (input). Only the former is walked here.
 *
 * No pb.backups.create — superuser auth is not available in this
 * environment. Instead every row this script touches has its full
 * before-state printed so changes are manually revertible from the log.
 *
 * Dry-run unless --apply, per repo convention. Idempotent: updates check the
 * current value before writing and log "already applied"/"already linked"
 * if the target state is already in place; the delete checks for a 404 and
 * logs "already applied" if the row is already gone.
 */
import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const APPLY = process.argv.includes("--apply");
const pb = new PocketBase(PB_URL);

// ---- Part A constants -------------------------------------------------
const WEEKLY_PLAN = "pux2ogukimdz0nt";

const UPDATES = [
  {
    id: "l1yx2132mndu2e6",
    label: "Micah (slot 3303a2a07mpi91y)",
    expectRecipe: "r07s7n7al8it77m",
    expectRecipeName: "spinach egg bites (batch)",
    newRecipe: "63050g2r2f9th3z",
    newRecipeName: "egg bites (served)",
  },
  {
    id: "d7ilk085e3jkvaw",
    label: "Micah Greens (slot vb16t4pw39u6551)",
    expectRecipe: "ut4yb99zw2l51h5",
    expectRecipeName: "Broccoli Patties (batch)",
    newRecipe: "7n6eqg67l202v93",
    newRecipeName: "brocolli patty",
  },
];

const DELETE = {
  id: "3m051r9vtpszq2u",
  label: "Micah Starch (slot 34e41yy5n968eb1)",
  expectRecipe: "7n6eqg67l202v93",
  expectRecipeName: "brocolli patty",
};

console.log("=".repeat(78));
console.log(`Week 7/27 non-batch swap + source_recipe backfill — ${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"}`);
console.log(`Target: ${PB_URL}`);
console.log("=".repeat(78));

let failures = 0;

// ---- Part A: preflight reads + guards ----------------------------------
console.log("\n### PART A — week 7/27 swap (planned_meals)");

const updatePlans = [];
for (const u of UPDATES) {
  const before = await pb.collection("planned_meals").getOne(u.id);
  console.log(`\n  BEFORE ${u.id} (${u.label}): ${JSON.stringify(before)}`);
  if (before.recipe === u.newRecipe) {
    console.log(`  already applied — recipe already = ${u.newRecipeName} [${u.newRecipe}]`);
    updatePlans.push({ ...u, before, status: "already-applied" });
  } else if (before.recipe === u.expectRecipe) {
    console.log(`  will UPDATE recipe: ${u.expectRecipeName} [${u.expectRecipe}] -> ${u.newRecipeName} [${u.newRecipe}]`);
    updatePlans.push({ ...u, before, status: "pending" });
  } else {
    console.log(
      `  REFUSED: expected recipe ${u.expectRecipeName} [${u.expectRecipe}] or already-applied ${u.newRecipe}, ` +
        `found ${before.recipe} instead. Not touching this row.`
    );
    updatePlans.push({ ...u, before, status: "refused" });
    failures++;
  }
}

let deletePlan;
{
  let before = null;
  let found = true;
  try {
    before = await pb.collection("planned_meals").getOne(DELETE.id);
  } catch (err) {
    if (err?.status === 404) {
      found = false;
    } else {
      throw err;
    }
  }

  if (!found) {
    console.log(`\n  BEFORE ${DELETE.id} (${DELETE.label}): not found (404)`);
    console.log(`  already applied — row already gone`);
    deletePlan = { status: "already-applied" };
  } else {
    console.log(`\n  BEFORE ${DELETE.id} (${DELETE.label}): ${JSON.stringify(before)}`);
    if (before.recipe !== DELETE.expectRecipe) {
      console.log(
        `  REFUSED: expected recipe ${DELETE.expectRecipeName} [${DELETE.expectRecipe}], found ${before.recipe}. ` +
          `Not deleting this row.`
      );
      deletePlan = { status: "refused", before };
      failures++;
    } else {
      const overrides = await pb
        .collection("meal_variant_overrides")
        .getFullList({ filter: `planned_meal = "${DELETE.id}"` });
      if (overrides.length) {
        console.log(
          `  REFUSED: ${overrides.length} meal_variant_overrides row(s) reference this planned_meal — ` +
            `refusing to delete an override target:`
        );
        for (const o of overrides) {
          console.log(`    override [${o.id}] original_node=${o.original_node} replacement_product=${o.replacement_product}`);
        }
        deletePlan = { status: "refused", before };
        failures++;
      } else {
        console.log(`  no meal_variant_overrides reference this row — safe to delete`);
        console.log(`  will DELETE (references ${DELETE.expectRecipeName} [${DELETE.expectRecipe}], the Starch-slot duplicate)`);
        deletePlan = { status: "pending", before };
      }
    }
  }
}

// ---- Part B: preflight computation -------------------------------------
console.log("\n### PART B — source_recipe backfill (batch_prep products)");

const batchRecipes = await pb
  .collection("recipes")
  .getFullList({ filter: `recipe_type = "batch_prep" && status = "published"` });
console.log(`\n  ${batchRecipes.length} published batch_prep recipe(s):`);
for (const r of batchRecipes) console.log(`    ${r.name} [${r.id}]`);

// producer map: productId -> [{ recipeId, recipeName }]
const producerMap = new Map();

for (const recipe of batchRecipes) {
  const edges = await pb
    .collection("step_to_product_edges")
    .getFullList({ filter: `recipe = "${recipe.id}"` });
  const nodeIds = [...new Set(edges.map((e) => e.target))];
  for (const nodeId of nodeIds) {
    let node;
    try {
      node = await pb.collection("recipe_product_nodes").getOne(nodeId);
    } catch (err) {
      if (err?.status === 404) continue; // dangling edge target, ignore
      throw err;
    }
    if (!node.product) continue;
    const list = producerMap.get(node.product) ?? [];
    if (!list.some((p) => p.recipeId === recipe.id)) {
      list.push({ recipeId: recipe.id, recipeName: recipe.name });
    }
    producerMap.set(node.product, list);
  }
}

const disposition = []; // { productId, productName, action, detail }
const backfillPlans = []; // { productId, before, recipeId, recipeName }

for (const [productId, producers] of producerMap) {
  const product = await pb.collection("products").getOne(productId);
  if (product.type !== "inventory") {
    disposition.push({ productId, productName: product.name, action: "skip (not inventory)", detail: `type=${product.type}` });
    continue;
  }
  if (producers.length > 1) {
    disposition.push({
      productId,
      productName: product.name,
      action: "AMBIGUOUS — skip",
      detail: `produced by ${producers.length} batch recipes: ${producers.map((p) => `${p.recipeName} [${p.recipeId}]`).join(", ")}`,
    });
    continue;
  }
  const { recipeId, recipeName } = producers[0];
  if (product.source_recipe === recipeId) {
    disposition.push({ productId, productName: product.name, action: "already linked", detail: `-> ${recipeName} [${recipeId}]` });
    continue;
  }
  if (product.source_recipe && product.source_recipe !== recipeId) {
    disposition.push({
      productId,
      productName: product.name,
      action: "CONFLICT — skip",
      detail: `source_recipe already = ${product.source_recipe}, would-be ${recipeName} [${recipeId}]`,
    });
    continue;
  }
  disposition.push({ productId, productName: product.name, action: "LINK", detail: `-> ${recipeName} [${recipeId}]` });
  backfillPlans.push({ productId, productName: product.name, before: product, recipeId, recipeName });
}

console.log(`\n  disposition table (${disposition.length} candidate product(s)):`);
console.log(`  ${"product".padEnd(34)} ${"id".padEnd(16)} ${"action".padEnd(20)} detail`);
for (const d of disposition) {
  console.log(`  ${d.productName.padEnd(34)} ${d.productId.padEnd(16)} ${d.action.padEnd(20)} ${d.detail}`);
}

const conflicts = disposition.filter((d) => d.action.startsWith("CONFLICT"));
const ambiguous = disposition.filter((d) => d.action.startsWith("AMBIGUOUS"));

// ---- PLAN summary --------------------------------------------------------
console.log("\n### PLAN");
console.log(`  Part A: ${updatePlans.filter((u) => u.status === "pending").length} update(s), ${deletePlan.status === "pending" ? 1 : 0} delete(s)`);
for (const u of updatePlans) {
  console.log(`    UPDATE ${u.id} (${u.label}): ${u.status}`);
}
console.log(`    DELETE ${DELETE.id} (${DELETE.label}): ${deletePlan.status}`);
console.log(`  Part B: ${backfillPlans.length} product(s) to link, ${conflicts.length} conflict(s), ${ambiguous.length} ambiguous`);

if (failures > 0) {
  console.log(`\nREFUSED: ${failures} precondition guard(s) failed above. No writes will be made. Fix data or investigate by hand.`);
  process.exit(1);
}

if (!APPLY) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

// ---- apply ---------------------------------------------------------------
console.log("\n### APPLYING");

for (const u of updatePlans) {
  if (u.status !== "pending") continue;
  const updated = await pb.collection("planned_meals").update(u.id, { recipe: u.newRecipe });
  console.log(`  UPDATED ${u.id}: recipe -> ${u.newRecipeName} [${u.newRecipe}]`);
}

if (deletePlan.status === "pending") {
  await pb.collection("planned_meals").delete(DELETE.id);
  console.log(`  DELETED ${DELETE.id} (${DELETE.label})`);
}

for (const b of backfillPlans) {
  await pb.collection("products").update(b.productId, { source_recipe: b.recipeId });
  console.log(`  LINKED product "${b.productName}" [${b.productId}] source_recipe -> ${b.recipeName} [${b.recipeId}]`);
}

console.log("\nApplied.");
