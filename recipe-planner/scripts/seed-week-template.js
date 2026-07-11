// WEEK-03 seed: create the household's single de-facto `week_templates` row
// + its ordered `template_slots` on both PocketBase instances (D-01 — seed
// once via script, no in-app template editor this phase).
//
// The slot set below is the user-confirmed household shape (04-06-PLAN.md
// Task 2 human-action gate): Staples first with prefill_from_last_week=true
// (copy-forward, LRU wizard consumes this — WEEK-03), then dinner/micah
// slots keyed to existing tags. `pool_tags` is match-any by default — a recipe
// carrying ANY of a slot's pool tags is eligible — EXCEPT slots with
// match_all=true (Micah component slots), which require ALL pool tags, and
// exclude_tags, which drop a recipe carrying any listed tag (adult slots
// exclude "micah meal"). See poolForSlot in src/lib/planning/history.ts.
//
// Each pool_tag is referenced by NAME here and resolved to a real `tags`
// collection id at run time. Any referenced tag that does not yet exist is
// AUTO-CREATED on a real run (the names are hardcoded in SLOTS, so there is no
// typo/dangling-pool risk); a --dry-run just reports what it would create.
//
// Idempotent: the template is upserted by `name`; each slot is upserted by
// (template, sort_order) — re-running never duplicates rows (T-04-06d).
//
// Modes (seed-usda.js / backfill-plan-dates.js precedent):
//   --dry-run   read-only: prints the planned template/slot dispositions
//               (including resolved tag ids), makes NO writes.
//   (no flag)   real run: re-prints the same disposition report, then
//               authenticates, takes a pb.backups.create() snapshot
//               (T-04-06c), and applies the upsert.
//
// PB_URL env override lets this same script target test (:8091) instead of
// prod (:8090) — required for the mandatory test-first rehearsal before any
// prod write. PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are read from the
// environment (sourced from gitignored recipe-planner/.env.local by the
// caller, e.g. `node --env-file=.env.local scripts/seed-week-template.js`).

import PocketBase from "pocketbase";

// PB_URL lets this same script be pointed at test (:8091) instead of prod
// (:8090) — required for the mandatory test-first rehearsal before any
// prod write.
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";
const pb = new PocketBase(PB_URL);

const DRY_RUN = process.argv.includes("--dry-run");

const TEMPLATE_NAME = "Standard week";

// User-confirmed household slot shape (04-06-PLAN.md Task 2). Ordered by
// sort_order; Staples is slot #1 with prefill_from_last_week=true so the
// wizard copies it forward from last week (WEEK-03). meal_slot values must
// be members of the planned_meals/template_slots.meal_slot enum
// (breakfast/lunch/dinner/snack/micah) — Pitfall 4.
// Household slot shape (week-wizard Micah/adult split). Two pool refinements
// beyond the original WEEK-03 match-any model:
//   - match_all: recipe must carry EVERY pool_tag. The Micah component slots
//     use it so "Micah Proteins" == protein AND micah meal (an adult protein
//     never leaks in).
//   - exclude_tags: recipe dropped if it carries ANY listed tag. The adult
//     slots exclude "micah meal" so the two pools stay strictly separate.
const SLOTS = [
  {
    sort_order: 0,
    label: "Staples",
    meal_slot: "snack",
    count: 6,
    day: null,
    prefill_from_last_week: true,
    pool_tags: ["staple"],
  },
  {
    sort_order: 1,
    label: "Micah Proteins",
    meal_slot: "micah",
    count: 2,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["protein", "micah meal"],
    match_all: true,
  },
  {
    sort_order: 2,
    label: "Micah Greens",
    meal_slot: "micah",
    count: 1,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["green", "micah meal"],
    match_all: true,
  },
  {
    sort_order: 3,
    label: "Micah Starch",
    meal_slot: "micah",
    count: 1,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["starch", "micah meal"],
    match_all: true,
  },
  {
    sort_order: 4,
    label: "Micah Vegetables",
    meal_slot: "micah",
    count: 2,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["vegetable", "micah meal"],
    match_all: true,
  },
  {
    sort_order: 5,
    label: "Adult Dinners",
    meal_slot: "dinner",
    count: 4,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["pescatarian", "dinner"],
    match_all: true,
    exclude_tags: ["micah meal"],
  },
  {
    sort_order: 6,
    label: "Adult Lunch — pescatarian",
    meal_slot: "lunch",
    count: 1,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["pescatarian", "lunch"],
    match_all: true,
    exclude_tags: ["micah meal"],
  },
  {
    sort_order: 7,
    label: "Adult Lunch — meat",
    meal_slot: "lunch",
    count: 1,
    day: null,
    prefill_from_last_week: false,
    pool_tags: ["meat", "lunch"],
    match_all: true,
    exclude_tags: ["micah meal"],
  },
];

function normalizeName(name) {
  return name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Pure resolver logic — no PocketBase, no I/O. Unit-testable directly.
// ---------------------------------------------------------------------------

/**
 * Resolves every pool_tag name referenced by SLOTS against the live `tags`
 * collection. FAILS LOUDLY (throws, listing every missing name) rather than
 * seeding a slot with a dangling/empty pool (T-04-06b) — mirrors
 * seed-usda.js's "never silently proceed on ambiguous/missing data" posture.
 *
 * @param {string[]} requiredTagNames - de-duplicated pool_tag names referenced by SLOTS
 * @param {Map<string, {id: string, name: string}>} tagsByName - normalized-name -> live tag record
 * @returns {Record<string, string>} tag name -> resolved tag id
 */
export function resolveTagIds(requiredTagNames, tagsByName) {
  const missing = [];
  const idsByName = {};
  for (const name of requiredTagNames) {
    const tag = tagsByName.get(normalizeName(name));
    if (!tag) {
      missing.push(name);
    } else {
      idsByName[name] = tag.id;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required tag(s) in the live \`tags\` collection: ${missing
        .map((n) => `"${n}"`)
        .join(", ")} — create these tags first (or adjust the SLOTS config in seed-week-template.js) before seeding.`
    );
  }
  return idsByName;
}

/**
 * @param {object|null} existingTemplate - live week_templates row matching TEMPLATE_NAME, or null
 * @returns {{action: "SKIP_TEMPLATE"|"CREATE_TEMPLATE", id?: string, payload?: object}}
 */
export function planTemplateAction(existingTemplate, templateName) {
  if (existingTemplate) {
    return { action: "SKIP_TEMPLATE", id: existingTemplate.id };
  }
  return { action: "CREATE_TEMPLATE", payload: { name: templateName } };
}

/**
 * Builds the per-slot upsert plan: CREATE_SLOT for a sort_order with no live
 * row yet, UPDATE_SLOT to bring an existing row in sync with SLOTS (idempotent
 * — never creates a duplicate, T-04-06d). `template` id is attached by the
 * caller at apply time (it may not exist yet in a dry-run against a fresh DB).
 *
 * @param {object[]} slotsConfig - SLOTS
 * @param {Map<number, object>} existingSlotsBySortOrder - live template_slots for this template, keyed by sort_order
 * @param {Record<string, string>} tagIdsByName - resolveTagIds() output
 */
export function planSlotActions(slotsConfig, existingSlotsBySortOrder, tagIdsByName) {
  return slotsConfig.map((slot) => {
    const pool_tags = slot.pool_tags.map((name) => tagIdsByName[name]);
    const exclude_tags = (slot.exclude_tags ?? []).map((name) => tagIdsByName[name]);
    const payload = {
      label: slot.label,
      count: slot.count,
      meal_slot: slot.meal_slot,
      day: slot.day ?? null,
      pool_tags,
      exclude_tags,
      match_all: !!slot.match_all,
      sort_order: slot.sort_order,
      prefill_from_last_week: !!slot.prefill_from_last_week,
    };
    const existing = existingSlotsBySortOrder.get(slot.sort_order);
    if (existing) {
      return { action: "UPDATE_SLOT", id: existing.id, payload, slot };
    }
    return { action: "CREATE_SLOT", payload, slot };
  });
}

// ---------------------------------------------------------------------------
// Report rendering (dry-run review artifact, T-04-06c)
// ---------------------------------------------------------------------------

function printReport(templateAction, slotActions, tagIdsByName) {
  console.log(`\nTemplate: "${TEMPLATE_NAME}"`);
  if (templateAction.action === "SKIP_TEMPLATE") {
    console.log(`  SKIP_TEMPLATE — already exists (id: ${templateAction.id})`);
  } else {
    console.log(`  CREATE_TEMPLATE — no existing row named "${TEMPLATE_NAME}"`);
  }

  console.log(`\nResolved pool tags:`);
  for (const [name, id] of Object.entries(tagIdsByName)) {
    console.log(`  "${name}" -> ${id}`);
  }

  console.log(`\nSlots (${slotActions.length}):`);
  console.log(
    "  sort  action        label                       meal_slot  count  all   pool_tags (- exclude_tags)"
  );
  console.log(
    "  ----  ------------  --------------------------  ---------  -----  ----  --------------------------"
  );
  for (const a of slotActions) {
    const p = a.payload;
    const pools = a.slot.pool_tags.join("+");
    const excl = (a.slot.exclude_tags ?? []).length
      ? ` - ${a.slot.exclude_tags.join(",")}`
      : "";
    console.log(
      `  ${String(p.sort_order).padEnd(4)}  ${a.action.padEnd(12)}  ${p.label.padEnd(26)}  ${p.meal_slot.padEnd(9)}  ${String(p.count).padEnd(5)}  ${String(!!p.match_all).padEnd(4)}  ${pools}${excl}`
    );
  }
}

// ---------------------------------------------------------------------------
// PocketBase wiring (T-04-06c backup-before-mutate)
// ---------------------------------------------------------------------------

async function authenticateSuperuser() {
  const email = process.env.PB_SUPERUSER_EMAIL;
  const password = process.env.PB_SUPERUSER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be set in the environment"
    );
  }
  await pb.collection("_superusers").authWithPassword(email, password);
  console.log(`  Authenticated as superuser: ${email}`);
}

/** Backup-before-mutate, per the seed-usda.js/backfill-plan-dates.js precedent. */
async function backupBeforeSeed() {
  console.log("\n--- Creating pre-seed backup ---");
  // PocketBase backup names must match ^[a-z0-9_-]+\.zip$ (lowercase, .zip).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-seed-week-template-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error("pb.backups.create() did not confirm success — aborting before any mutation");
  }
  console.log(`  Backup created: ${basename}`);
  return basename;
}

async function main() {
  console.log("=".repeat(80));
  console.log("SEED WEEK TEMPLATE — week_templates + template_slots (WEEK-03)");
  console.log(`Target: ${PB_URL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writing changes)"}`);
  console.log("=".repeat(80));

  const allTags = await pb.collection("tags").getFullList();
  const tagsByName = new Map(allTags.map((t) => [normalizeName(t.name), t]));
  const requiredTagNames = [
    ...new Set(SLOTS.flatMap((s) => [...s.pool_tags, ...(s.exclude_tags ?? [])])),
  ];
  const missingTagNames = requiredTagNames.filter(
    (n) => !tagsByName.has(normalizeName(n))
  );

  // Auto-create any missing required tags. The tag names are hardcoded in SLOTS
  // (not user input), so a missing name is simply a new pool tag the household
  // hasn't created yet — there is no typo/dangling-pool risk that the old
  // fail-loud guard (T-04-06b) was protecting against. Auth + backup happen up
  // front here because creating tags is itself a mutation.
  let authed = false;
  let backedUp = false;
  if (missingTagNames.length > 0 && !DRY_RUN) {
    console.log(`\nMissing required tag(s) — will create: ${missingTagNames.join(", ")}`);
    await authenticateSuperuser();
    authed = true;
    await backupBeforeSeed();
    backedUp = true;
    console.log("\n--- Creating missing tags ---");
    for (const name of missingTagNames) {
      const createdTag = await pb.collection("tags").create({ name });
      tagsByName.set(normalizeName(name), createdTag);
      console.log(`  Created tag "${name}" (${createdTag.id})`);
    }
  }

  // After creation nothing is missing. In a dry-run that still has missing tags,
  // show a "(to-create)" placeholder id so the disposition report renders.
  const tagIdsByName =
    missingTagNames.length > 0 && DRY_RUN
      ? Object.fromEntries(
          requiredTagNames.map((n) => [
            n,
            tagsByName.get(normalizeName(n))?.id ?? "(to-create)",
          ])
        )
      : resolveTagIds(requiredTagNames, tagsByName);

  const existingTemplate = await pb
    .collection("week_templates")
    .getFirstListItem(`name = "${TEMPLATE_NAME}"`)
    .catch(() => null);
  const templateAction = planTemplateAction(existingTemplate, TEMPLATE_NAME);

  let existingSlotsBySortOrder = new Map();
  if (existingTemplate) {
    const existingSlots = await pb
      .collection("template_slots")
      .getFullList({ filter: `template = "${existingTemplate.id}"` });
    existingSlotsBySortOrder = new Map(existingSlots.map((s) => [s.sort_order, s]));
  }

  const slotActions = planSlotActions(SLOTS, existingSlotsBySortOrder, tagIdsByName);

  printReport(templateAction, slotActions, tagIdsByName);

  if (DRY_RUN) {
    if (missingTagNames.length > 0) {
      console.log(
        `\nNOTE: ${missingTagNames.length} tag(s) will be created on apply: ${missingTagNames.join(", ")}`
      );
    }
    console.log("\nDRY RUN — no PocketBase writes performed. Re-run without --dry-run to apply.");
    return;
  }

  if (!authed) await authenticateSuperuser();
  if (!backedUp) await backupBeforeSeed();

  console.log("\n--- Applying template + slot upserts ---");

  let templateId = existingTemplate?.id;
  if (templateAction.action === "CREATE_TEMPLATE") {
    const created = await pb.collection("week_templates").create(templateAction.payload);
    templateId = created.id;
    console.log(`  Created week_templates "${TEMPLATE_NAME}" (${templateId})`);
  } else {
    console.log(`  week_templates "${TEMPLATE_NAME}" already exists (${templateId}) — no-op (idempotent)`);
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const a of slotActions) {
    try {
      const payload = { ...a.payload, template: templateId };
      if (a.action === "CREATE_SLOT") {
        await pb.collection("template_slots").create(payload);
        created++;
      } else {
        await pb.collection("template_slots").update(a.id, payload);
        updated++;
      }
    } catch (e) {
      failed++;
      console.error(`  ⚠️  ${a.action} failed for slot "${a.slot.label}": ${e.message}`);
    }
  }
  console.log(`\n  Slots created: ${created}, updated: ${updated}, failed: ${failed}`);
  if (failed > 0) {
    throw new Error(`${failed} slot write(s) failed — see log above; template may be partially seeded`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SEED COMPLETE");
  console.log("=".repeat(80));
}

// Guard the entrypoint so this module can be `import`ed (for the pure
// resolveTagIds/planTemplateAction/planSlotActions exports) without
// connecting to PocketBase or running main() as a side effect of import.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error("ERROR:", e.message, e.status, e.url);
    if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
    process.exit(1);
  });
}
