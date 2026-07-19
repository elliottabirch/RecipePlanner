// E1 migration — promote `recipe_steps.prep_action` to the widened controlled
// vocabulary and backfill it on knife-prep / pull / process steps so the app can
// derive step titles ("dice onion", "pull garlic cubes") instead of showing
// authored free-text names. See `.planning/notes/E1-derived-step-labels-
// proposal.md` (LOCKED DECISIONS) and `src/lib/prep-actions.ts` (the runtime
// single source of truth — the key list below is the offline mirror of it).
//
// Three phases per APPLY run (all idempotent):
//   1. WIDEN  the prep_action select to (new keys ∪ legacy state words), so
//      mid-migration writes are always valid.
//   2. MIGRATE step rows: legacy state value (diced→dice) OR infer the key from
//      the step name's leading verb. Compound/instructional names are skipped
//      (left authored). Only writes when the key actually changes.
//   3. NARROW the select to just the new keys, after verifying no row still
//      holds a legacy value.
//
// PB_URL selects test (:8091) vs prod (:8090, default) — rehearse on test first.
//   node --env-file=.env.local scripts/apply-e1-prep-actions.mjs --dry-run
//   PB_URL=http://127.0.0.1:8091 node --env-file=.env.local scripts/apply-e1-prep-actions.mjs
//   node --env-file=.env.local scripts/apply-e1-prep-actions.mjs

import PocketBase from "pocketbase";

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(PB_URL);
const DRY_RUN = process.argv.includes("--dry-run");

// Mirror of src/lib/prep-actions.ts PREP_ACTION_KEYS (offline copy — the TS
// module is the runtime source of truth; keep these in sync).
const KEYS = [
  "dice", "small_dice", "large_dice", "fine_dice", "brunoise", "slice",
  "thin_slice", "chiffonade", "chop", "mince", "shred", "grate", "halve",
  "quarter", "zest", "juice", "trim", "peel", "process", "pull",
];

// Legacy Phase-5 state-form values → new key.
const LEGACY = {
  diced: "dice", sliced: "slice", minced: "mince",
  chopped: "chop", grated: "grate", shredded: "shred",
};
const LEGACY_VALUES = Object.keys(LEGACY);

// Ordered leading-verb → key inference (most specific first). Applied only to
// single-action names — compound names (§ COMPOUND_RE) are skipped.
const NAME_RULES = [
  [/^(small[\s-]?dice|smal dice)/, "small_dice"],
  [/^large[\s-]?dice/, "large_dice"],
  [/^fine[\s-]?dice/, "fine_dice"],
  [/^brunoise/, "brunoise"],
  [/^dice/, "dice"],
  [/^(thinly slice|thin[\s-]?slice)/, "thin_slice"],
  [/^slice/, "slice"],
  [/^chiffonn?ade/, "chiffonade"],
  [/^chop/, "chop"],
  [/^mince/, "mince"],
  [/^shred/, "shred"],
  [/^grate/, "grate"],
  [/^halve/, "halve"],
  [/^quarter/, "quarter"],
  [/^zest/, "zest"],
  [/^(juice|squeeze)/, "juice"],
  [/^trim/, "trim"],
  [/^peel/, "peel"],
  [/^(process|break down|break)/, "process"],
  [/^(pull|take)/, "pull"],
];

// Compound / instructional names — leave authored (multi-ingredient or
// multi-action prose the derived label would mangle).
const COMPOUND_RE = /[,/]| & | and /i;

/**
 * Target `prep_action` for a step:
 *   - a KEY string  → set it,
 *   - ""            → CLEAR a stale coarse legacy tag (name gave no cut signal),
 *   - null          → leave unchanged (no action, or already correct).
 *
 * NAME-FIRST precedence (critical): the authored name is a more accurate signal
 * than the stored value, because the Phase-5 field only had 6 coarse options, so
 * a "brunoise"/"chiffonade"/"zest"/"quarter"/"halve" step was mis-tagged
 * minced/shredded/grated/chopped/sliced. We infer from the name when it carries
 * a cut verb; the stored legacy value is used only to CLEAR a straggler whose
 * name gives no cut signal (so no invalid legacy value survives the narrow).
 */
function targetKey(step) {
  const cur = (step.prep_action || "").trim();
  const name = (step.name || "").trim().toLowerCase();
  if (!COMPOUND_RE.test(name)) {
    for (const [re, key] of NAME_RULES) if (re.test(name)) return key;
  }
  if (KEYS.includes(cur)) return cur; // already a valid key — idempotent
  if (LEGACY[cur]) return ""; // stale coarse tag, no name signal — clear it
  return null; // no action word anywhere — leave authored
}

async function setSelectValues(values, phaseLabel) {
  const collection = await pb.collections.getOne("recipe_steps");
  const fields = collection.fields ?? collection.schema ?? [];
  const field = fields.find((f) => f.name === "prep_action");
  if (!field) throw new Error("prep_action field not found on recipe_steps");
  console.log(`  ${phaseLabel}: prep_action values [${field.values.join(", ")}]`);
  console.log(`             -> [${values.join(", ")}]`);
  if (DRY_RUN) return;
  const merged = fields.map((f) =>
    f.name === "prep_action" ? { ...f, values } : f
  );
  await pb.collections.update(collection.id, { fields: merged });
}

async function main() {
  console.log("=".repeat(72));
  console.log(`E1 PREP-ACTION MIGRATION — ${PB_URL} — ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("=".repeat(72));

  // Auth up front: reading/writing collection SCHEMA (setSelectValues) needs
  // superuser even in dry-run. Record reads are public, but the schema read is
  // not — so authenticate regardless of dry/apply.
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`\nAuthenticated as ${email}`);

  const steps = await pb.collection("recipe_steps").getFullList();
  console.log(`Loaded ${steps.length} recipe_steps.`);

  // Plan the data migration.
  const plan = [];
  const unmapped = [];
  for (const step of steps) {
    const target = targetKey(step);
    const cur = (step.prep_action || "").trim();
    if (target === null) {
      if (!cur) unmapped.push(step); // no action, stays authored
      continue;
    }
    if (cur === target) continue; // idempotent no-op
    plan.push({ id: step.id, name: step.name, from: cur || "(none)", to: target });
  }

  console.log(`\nData migration plan: ${plan.length} step(s) to update.`);
  for (const p of plan) {
    console.log(`  "${p.name}"  ${p.from} -> ${p.to || "(clear)"}`);
  }
  console.log(`\n${unmapped.length} actionless step(s) left authored (cook/assembly/instructional). Sample:`);
  for (const s of unmapped.slice(0, 12)) console.log(`  "${s.name}"`);
  if (unmapped.length > 12) console.log(`  ... +${unmapped.length - 12} more`);

  // Phase 1: widen select (keys ∪ legacy) so migration writes validate.
  console.log("\n--- Phase 1: widen select ---");
  await setSelectValues([...KEYS, ...LEGACY_VALUES], "WIDEN");

  // Phase 2: migrate rows.
  console.log("\n--- Phase 2: migrate step rows ---");
  if (DRY_RUN) {
    console.log("  DRY RUN — no writes.");
  } else {
    let n = 0;
    for (const p of plan) {
      await pb.collection("recipe_steps").update(p.id, { prep_action: p.to });
      n++;
    }
    console.log(`  Updated ${n} step(s).`);
  }

  // Phase 3: narrow select to keys only, after verifying no legacy remains.
  console.log("\n--- Phase 3: narrow select to final keys ---");
  if (DRY_RUN) {
    console.log("  DRY RUN — would narrow to [" + KEYS.join(", ") + "] after verify.");
  } else {
    const after = await pb.collection("recipe_steps").getFullList();
    const stillLegacy = after.filter((s) => LEGACY[(s.prep_action || "").trim()]);
    if (stillLegacy.length > 0) {
      console.log(`  ⚠️  ${stillLegacy.length} row(s) still hold a legacy value — leaving select widened (not narrowing). Investigate:`);
      for (const s of stillLegacy.slice(0, 10)) console.log(`     "${s.name}" = ${s.prep_action}`);
    } else {
      await setSelectValues(KEYS, "NARROW");
      console.log("  Narrowed to final keys.");
    }
  }

  console.log("\nDone." + (DRY_RUN ? " (dry run — re-run without --dry-run to apply)" : ""));
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
