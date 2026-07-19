// One-off lint cleanup for the Micah veg/green drafts.
//   1. Set canonical_unit on existing products that had none (missing-canonical-unit
//      rule): honey=tbsp, green beans=lb, miso paste=tbsp, broccolini=lb.
//   2. Fix the already-imported "Honey-Garlic Roasted Broccolini" draft's garlic
//      node: garlic minced canonical is `each`, so a `tbsp` node is cross-dimension —
//      change it to `each` (3 cloves). (prep-words on garlic minced is a longstanding
//      registry choice — garlic minced is a raw pantry ingredient in 5 other recipes —
//      and is intentionally left as-is.)
//
// Idempotent, backup-before-mutate. PB_URL selects test/prod (prod default).
//   node --env-file=.env.local scripts/fix-lint-canonical-units.mjs --dry-run
//   node --env-file=.env.local scripts/fix-lint-canonical-units.mjs

import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(PB_URL);
const DRY_RUN = process.argv.includes("--dry-run");

// product name -> canonical_unit to set (only applied when currently null/empty)
const CANONICAL = {
  honey: "tbsp",
  "green beans": "lb",
  "miso paste": "tbsp",
  broccolini: "lb",
};

const norm = (s) => s.trim().toLowerCase();

async function main() {
  console.log("=".repeat(72));
  console.log(`FIX LINT CANONICAL UNITS — ${PB_URL} — ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("=".repeat(72));

  const products = await pb.collection("products").getFullList();
  const byName = new Map(products.map((p) => [norm(p.name), p]));

  // Plan canonical_unit sets.
  const canonPlan = [];
  for (const [name, unit] of Object.entries(CANONICAL)) {
    const p = byName.get(norm(name));
    if (!p) { console.log(`  ⚠️  "${name}" not found — skipping`); continue; }
    if (p.canonical_unit) {
      console.log(`  "${name}": already canonical=${p.canonical_unit} — skip`);
    } else {
      console.log(`  "${name}": canonical (null) -> ${unit}`);
      canonPlan.push({ id: p.id, name, unit });
    }
  }

  // Plan the broccolini garlic node fix.
  const recipe = await pb
    .collection("recipes")
    .getFirstListItem('name = "Honey-Garlic Roasted Broccolini"')
    .catch(() => null);
  let garlicNode = null;
  if (recipe) {
    const garlic = byName.get("garlic minced");
    const nodes = await pb
      .collection("recipe_product_nodes")
      .getFullList({ filter: `recipe="${recipe.id}"` });
    garlicNode = nodes.find((n) => n.product === garlic?.id) || null;
    if (garlicNode) {
      const needs = garlicNode.unit !== "each" || garlicNode.quantity !== 3;
      console.log(
        `\n  broccolini draft garlic node ${garlicNode.id}: ${garlicNode.quantity} ${garlicNode.unit}` +
          (needs ? " -> 3 each" : " — already 3 each, skip")
      );
      if (!needs) garlicNode = null;
    } else {
      console.log("\n  broccolini draft: no garlic minced node found — skip");
    }
  } else {
    console.log('\n  "Honey-Garlic Roasted Broccolini" not imported — skipping node fix');
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes. Re-run without --dry-run to apply.");
    return;
  }

  if (canonPlan.length === 0 && !garlicNode) {
    console.log("\nNothing to do (idempotent no-op).");
    return;
  }

  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`\n  Authenticated as ${email}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const backup = `pre-fix-lint-${stamp}.zip`;
  if (!(await pb.backups.create(backup))) throw new Error("backup failed — aborting");
  console.log(`  Backup: ${backup}\n`);

  for (const c of canonPlan) {
    await pb.collection("products").update(c.id, { canonical_unit: c.unit });
    console.log(`  set ${c.name}.canonical_unit = ${c.unit}`);
  }
  if (garlicNode) {
    await pb
      .collection("recipe_product_nodes")
      .update(garlicNode.id, { unit: "each", quantity: 3 });
    console.log(`  fixed garlic node -> 3 each`);
  }
  console.log("\nDONE.");
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  process.exit(1);
});
