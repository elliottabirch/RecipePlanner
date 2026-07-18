// Apply reviewed recipe notes (recipe-notes-drafts.json) to prod PocketBase.
//
// Safe by construction:
//  - exact-name match against PUBLISHED recipes only (never a draft revision)
//  - writes ONLY when the recipe's notes are currently empty (never clobbers)
//  - dry-run by default: prints what it WOULD do; pass APPLY=1 to write
//
// Usage:
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... node apply-recipe-notes.mjs        # preview
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... APPLY=1 node apply-recipe-notes.mjs # write
import PocketBase from "pocketbase";
import { readFileSync } from "node:fs";

const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";
const APPLY = process.env.APPLY === "1";
// Drafts + .env live at the repo root; this script runs from recipe-planner/
// (where the `pocketbase` dep resolves).
const drafts = JSON.parse(readFileSync(new URL("../recipe-notes-drafts.json", import.meta.url)));

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) throw new Error("set PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD");
  await pb.collection("_superusers").authWithPassword(email, password);

  const recipes = await pb.collection("recipes").getFullList();
  const publishedByName = new Map();
  for (const r of recipes) {
    if ((r.status ?? "published") === "draft") continue;
    publishedByName.set(r.name, r);
  }

  let willWrite = 0, skipNonEmpty = 0, noMatch = 0;
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${Object.keys(drafts).length} drafts\n`);

  for (const [name, notes] of Object.entries(drafts)) {
    const recipe = publishedByName.get(name);
    if (!recipe) {
      console.log(`  ✗ NO MATCH: "${name}"`);
      noMatch++;
      continue;
    }
    if ((recipe.notes ?? "").trim()) {
      console.log(`  ~ SKIP (already has notes): "${name}"`);
      skipNonEmpty++;
      continue;
    }
    if (APPLY) {
      await pb.collection("recipes").update(recipe.id, { notes });
      console.log(`  ✓ WROTE: "${name}" (${notes.length} chars)`);
    } else {
      console.log(`  → would write: "${name}" (${notes.length} chars)`);
    }
    willWrite++;
  }

  console.log(
    `\n${APPLY ? "wrote" : "would write"} ${willWrite} · skipped (non-empty) ${skipNonEmpty} · no-match ${noMatch}`
  );
  if (noMatch > 0) console.log("Fix any NO MATCH names (must equal the recipe name exactly) before applying.");
}

main().catch((e) => { console.error(e); process.exit(1); });
