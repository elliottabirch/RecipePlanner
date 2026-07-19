// Staples setup — make the household's standing weekly staples pickable via a
// dedicated `staple` tag. Staple set (all whole RECIPES; milk is an ingredient
// inside the coffee recipe, not a standalone staple):
//   coffee, fruit, eggs, cottage cheese, plain yogurt, ripple
//
// Idempotent. Steps (each existence-checks before mutating):
//   1. Ensure a `staple` tag exists.
//   2. Match each staple to an existing PUBLISHED recipe by name (the wizard
//      pool excludes drafts). The script NEVER invents recipes — a missing
//      staple is a hard error — EXCEPT names flagged createIfMissing (ripple,
//      a new store-bought item), created as a minimal published batch_prep row.
//   3. Ensure each staple recipe carries the `staple` tag (recipe_tags join).
//   4. Repoint the Staples template_slot: pool_tags = [staple], count = N.
//
// PB_URL selects test (:8091) vs prod (:8090, default). PB_SUPERUSER_EMAIL /
// PB_SUPERUSER_PASSWORD from the environment (via --env-file=.env.local).
//   node --env-file=.env.local scripts/setup-staples.mjs --dry-run
//   node --env-file=.env.local scripts/setup-staples.mjs

import PocketBase from "pocketbase";

const DB_URLS = {
  production: "http://127.0.0.1:8090",
  test: "http://127.0.0.1:8091",
};
const PB_URL = process.env.PB_URL || DB_URLS.production;
const pb = new PocketBase(PB_URL);
const DRY_RUN = process.argv.includes("--dry-run");

const STAPLE_TAG = "staple";
// Exact existing recipe names. `createIfMissing` is the ONLY case where a
// recipe may be created — everything else must already exist or the run fails.
const STAPLE_RECIPES = [
  { name: "coffee" },
  { name: "fruit" },
  { name: "eggs" },
  { name: "cottage cheese" },
  { name: "plain yogurt" },
  { name: "ripple", createIfMissing: true }, // new store-bought fake milk (temporary)
];

const norm = (s) => s.trim().toLowerCase();

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function authenticateSuperuser() {
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) {
    throw new Error("PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be set in the environment");
  }
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`  Authenticated as superuser: ${email}`);
}

async function backupBeforeSetup() {
  console.log("\n--- Creating pre-setup backup ---");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-setup-staples-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) throw new Error("pb.backups.create() did not confirm success — aborting before any mutation");
  console.log(`  Backup created: ${basename}`);
}

async function main() {
  console.log("=".repeat(80));
  console.log("SETUP STAPLES — staple tag + recipes + Staples slot repoint");
  console.log(`Target: ${PB_URL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writing changes)"}`);
  console.log("=".repeat(80));

  // --- Read current state (read-only, safe in dry-run) ---
  const allTags = await pb.collection("tags").getFullList();
  const stapleTag = allTags.find((t) => norm(t.name) === STAPLE_TAG);

  const allRecipes = await pb.collection("recipes").getFullList();
  const recipeByName = new Map(allRecipes.map((r) => [norm(r.name), r]));

  const staplesSlot = await pb
    .collection("template_slots")
    .getFirstListItem("prefill_from_last_week=true")
    .catch(() => null);
  if (!staplesSlot) throw new Error("No Staples slot (prefill_from_last_week=true) found — seed the template first");

  // --- Plan (printed in both modes) ---
  console.log(`\nStaple tag "${STAPLE_TAG}": ${stapleTag ? `exists (${stapleTag.id})` : "WILL CREATE"}`);
  console.log(`\nStaple recipes (${STAPLE_RECIPES.length}):`);
  const missingRequired = [];
  for (const s of STAPLE_RECIPES) {
    const r = recipeByName.get(norm(s.name));
    if (r) {
      const pub = r.status === "published" ? `published (${r.id})` : `${r.status} (${r.id}) — WILL PUBLISH`;
      console.log(`  "${s.name}": ${pub}`);
    } else if (s.createIfMissing) {
      console.log(`  "${s.name}": WILL CREATE (published batch_prep)`);
    } else {
      console.log(`  "${s.name}": MISSING — no such recipe (will NOT be created)`);
      missingRequired.push(s.name);
    }
  }
  console.log(
    `\nStaples slot (${staplesSlot.id}): count ${staplesSlot.count} -> ${STAPLE_RECIPES.length}, pool_tags -> [${STAPLE_TAG}]`
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `Refusing to proceed: ${missingRequired.length} staple(s) have no matching recipe and are not create-eligible: ${missingRequired
        .map((n) => `"${n}"`)
        .join(", ")}. Fix the name in STAPLE_RECIPES (or create the recipe in-app) and re-run.`
    );
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes performed. Re-run without --dry-run to apply.");
    return;
  }

  // --- Apply ---
  await authenticateSuperuser();
  await backupBeforeSetup();

  // 1. staple tag
  let tag = stapleTag;
  if (!tag) {
    tag = await pb.collection("tags").create({ name: STAPLE_TAG });
    console.log(`\n  Created tag "${STAPLE_TAG}" (${tag.id})`);
  }

  // 2 + 3. ensure recipes exist (published) and are tagged staple
  console.log("\n--- Ensuring staple recipes + tags ---");
  for (const s of STAPLE_RECIPES) {
    let recipe = recipeByName.get(norm(s.name));
    if (!recipe) {
      // Only reachable for createIfMissing names (others already threw above).
      recipe = await pb.collection("recipes").create({
        name: s.name,
        status: "published",
        recipe_type: "batch_prep",
      });
      console.log(`  Created recipe "${s.name}" (${recipe.id})`);
    } else if (recipe.status !== "published") {
      recipe = await pb.collection("recipes").update(recipe.id, { status: "published" });
      console.log(`  Published existing recipe "${s.name}" (${recipe.id})`);
    } else {
      console.log(`  Recipe "${s.name}" already published (${recipe.id})`);
    }

    const existingJoin = await pb
      .collection("recipe_tags")
      .getFirstListItem(`recipe="${recipe.id}" && tag="${tag.id}"`)
      .catch(() => null);
    if (!existingJoin) {
      await pb.collection("recipe_tags").create({ recipe: recipe.id, tag: tag.id });
      console.log(`    tagged "${s.name}" -> ${STAPLE_TAG}`);
    } else {
      console.log(`    "${s.name}" already tagged ${STAPLE_TAG}`);
    }
  }

  // 4. repoint the Staples slot
  await pb.collection("template_slots").update(staplesSlot.id, {
    pool_tags: [tag.id],
    count: STAPLE_RECIPES.length,
  });
  console.log(`\n  Staples slot repointed: pool_tags=[${STAPLE_TAG}], count=${STAPLE_RECIPES.length}`);

  console.log("\n" + "=".repeat(80));
  console.log("STAPLES SETUP COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("ERROR:", fmtError(e));
  process.exit(1);
});
