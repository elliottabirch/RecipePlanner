// Remove the session's wrongly-structured imported recipes so they can be
// re-imported clean from the corrected import-drafts/*.json files.
//
// Deletes each named recipe's FULL graph — recipe_product_nodes, recipe_steps,
// product_to_step_edges, step_to_product_edges, recipe_tags, then the recipe
// row itself. Leaves the shared `products` (raw/transient/stored) untouched so
// the re-import auto-matches them by name / matchProductId (no duplicates).
//
// Idempotent (a name not found is skipped). Backup-before-mutate. PB_URL selects
// test/prod (prod default).
//   node --env-file=.env.local scripts/remove-wrong-recipes.mjs --dry-run
//   node --env-file=.env.local scripts/remove-wrong-recipes.mjs

import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(PB_URL);
const DRY_RUN = process.argv.includes("--dry-run");

// The recipes imported this session that need re-importing from the corrected
// JSON. Names must match recipes.name exactly.
const RECIPE_NAMES = [
  "Maple-Roasted Butternut Squash",
  "Miso-Butter Glazed Green Beans",
  "Honey-Garlic Roasted Broccolini",
  "Thai Green Curry Shrimp",
  "Harissa Cod with Chickpeas",
  "Peanut Soba Salad with Shrimp",
  "Mediterranean Chickpea & Feta Salad",
  "Pork & Poblano Verde",
];

// Recipe-scoped child collections (all carry a `recipe` relation). Edges first,
// then nodes/steps/tags — products are global and deliberately NOT touched.
const CHILD_COLLECTIONS = [
  "product_to_step_edges",
  "step_to_product_edges",
  "recipe_product_nodes",
  "recipe_steps",
  "recipe_tags",
];

async function main() {
  console.log("=".repeat(72));
  console.log(`REMOVE WRONG RECIPES — ${PB_URL} — ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("=".repeat(72));

  const recipes = await pb.collection("recipes").getFullList();
  const byName = new Map(recipes.map((r) => [r.name, r]));

  // Plan: for each name, count the child rows that would be deleted.
  const plan = [];
  for (const name of RECIPE_NAMES) {
    const r = byName.get(name);
    if (!r) {
      console.log(`  SKIP (not found): "${name}"`);
      continue;
    }
    const counts = {};
    for (const coll of CHILD_COLLECTIONS) {
      counts[coll] = await pb
        .collection(coll)
        .getFullList({ filter: `recipe = "${r.id}"` });
    }
    const summary = CHILD_COLLECTIONS.map((c) => `${c.split("_").slice(-1)}=${counts[c].length}`).join(" ");
    console.log(`  DELETE "${name}" (${r.id}, status=${r.status}) — ${summary}`);
    plan.push({ recipe: r, counts });
  }

  if (plan.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — ${plan.length} recipe(s) would be deleted (+ their graph). No writes.`);
    return;
  }

  await pb.collection("_superusers").authWithPassword(
    process.env.PB_SUPERUSER_EMAIL,
    process.env.PB_SUPERUSER_PASSWORD
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const bk = `pre-remove-wrong-recipes-${stamp}.zip`;
  if (!(await pb.backups.create(bk))) throw new Error("backup failed — aborting");
  console.log(`\nBackup: ${bk}\n`);

  for (const { recipe, counts } of plan) {
    // Children first (edges, then nodes/steps/tags), then the recipe row.
    for (const coll of CHILD_COLLECTIONS) {
      for (const row of counts[coll]) {
        await pb.collection(coll).delete(row.id);
      }
    }
    await pb.collection("recipes").delete(recipe.id);
    console.log(`  Deleted "${recipe.name}" + graph`);
  }

  console.log("\nDONE — re-import the corrected files from import-drafts/.");
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  process.exit(1);
});
