// WEEK-01 backfill: give every existing `weekly_plans` record a non-null
// `start_date` before the field is tightened to required (04-05-PLAN.md).
//
// resolvePlanDate(plan, index, baseMonday) is a PURE function (no
// PocketBase, no I/O) implementing the phase-doc §3.6 / 04-RESEARCH
// Open-Question-1 algorithm:
//   - `plan.name` matching "Week of <Month> <Day>, <Year>" parses that
//     calendar date and rounds BACK to the Monday of that week (never
//     forward).
//   - Otherwise falls back to `baseMonday` minus `index * 7` days — the
//     caller sorts the live plan list descending by `created` (ties broken
//     by `id` ascending) and passes each plan's position in that order as
//     `index` (0 = most recently created plan among those needing a
//     fallback date, gets the most recent/base Monday; older plans get
//     progressively earlier Mondays).
// Unit-tested directly in backfill-plan-dates.test.js (04-01 Wave-0 RED
// scaffold) — no live DB required for the resolver itself.
//
// `main()` is thin PocketBase wiring, modeled on seed-usda.js:
//   - PB_URL env override (default prod :8090, override to :8091 for test)
//   - `--dry-run` — report only, zero writes
//   - `pb.backups.create()` before any mutation (abort if unconfirmed)
//   - PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD from the environment
//     (sourced from gitignored recipe-planner/.env.local by the caller)
//
// Does NOT tighten start_date to required — that is the separate
// human-action Task 3 (admin-UI schema edit + pb_schema.json re-mirror).

import PocketBase from "pocketbase";

// PB_URL lets this same script be pointed at test (:8091) instead of prod
// (:8090) — required for the mandatory test-first rehearsal before any
// prod write.
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";
const pb = new PocketBase(PB_URL);

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Pure resolver logic — no PocketBase, no I/O. Unit-tested directly.
// ---------------------------------------------------------------------------

const WEEK_OF_RE = /Week of\s+([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/i;

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthIndexFromName(name) {
  const abbrev = name.trim().toLowerCase().slice(0, 3);
  return MONTH_NAMES.findIndex((m) => m.startsWith(abbrev));
}

function toISODateString(date) {
  return date.toISOString().slice(0, 10);
}

/** Rounds a UTC date BACK to the Monday of its week (never forward). */
function mondayOfWeekUTC(date) {
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);
  return monday;
}

/**
 * Resolves a single weekly_plans record's backfilled start_date.
 *
 * @param {{id: string, name?: string|null, created?: string}} plan
 * @param {number} index - position of this plan among the caller's
 *   descending-by-created (id-asc tie-break) sort of records needing the
 *   fallback path; 0 = most recent.
 * @param {string} baseMonday - anchor Monday, "YYYY-MM-DD", used as the
 *   index-0 fallback date.
 * @returns {string} ISO date string "YYYY-MM-DD".
 */
export function resolvePlanDate(plan, index, baseMonday) {
  const name = plan?.name;
  if (name) {
    const match = WEEK_OF_RE.exec(name);
    if (match) {
      const [, monthName, day, year] = match;
      const monthIdx = monthIndexFromName(monthName);
      if (monthIdx !== -1) {
        const parsed = new Date(Date.UTC(Number(year), monthIdx, Number(day)));
        if (!Number.isNaN(parsed.getTime())) {
          return toISODateString(mondayOfWeekUTC(parsed));
        }
      }
    }
  }

  const [by, bm, bd] = baseMonday.split("-").map(Number);
  const base = new Date(Date.UTC(by, bm - 1, bd));
  base.setUTCDate(base.getUTCDate() - index * 7);
  return toISODateString(base);
}

/** Today's Monday (UTC), used as the fallback path's base anchor in main(). */
function currentMondayISO() {
  const now = new Date();
  const utcToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return toISODateString(mondayOfWeekUTC(utcToday));
}

// ---------------------------------------------------------------------------
// Report rendering (dry-run review artifact)
// ---------------------------------------------------------------------------

function buildDispositions(undatedPlans, baseMonday) {
  return undatedPlans.map((plan, index) => {
    const resolvedDate = resolvePlanDate(plan, index, baseMonday);
    const matchedParse = WEEK_OF_RE.test(plan.name || "");
    return {
      id: plan.id,
      name: plan.name || "(no name)",
      created: plan.created,
      index,
      disposition: matchedParse ? "matched-parse" : "assigned-fallback",
      resolvedDate,
    };
  });
}

function printDispositionReport(dispositions) {
  const matched = dispositions.filter((d) => d.disposition === "matched-parse");
  const assigned = dispositions.filter((d) => d.disposition === "assigned-fallback");

  console.log(`\n  ${dispositions.length} plan(s) currently missing start_date:`);
  console.log(`    matched-parse ("Week of ..." name): ${matched.length}`);
  console.log(`    assigned-fallback (descending Monday): ${assigned.length}`);
  console.log("");
  console.log("  id                        name                            disposition        resolvedDate");
  console.log("  ------------------------  ------------------------------  -----------------  ------------");
  for (const d of dispositions) {
    console.log(
      `  ${d.id.padEnd(26)}${d.name.slice(0, 30).padEnd(32)}${d.disposition.padEnd(19)}${d.resolvedDate}`
    );
  }
}

// ---------------------------------------------------------------------------
// PocketBase wiring
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

/** Backup-before-mutate, per the seed-usda.js/merge-products.js precedent. */
async function backupBeforeBackfill() {
  console.log("\n--- Creating pre-backfill backup ---");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-backfill-plan-dates-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error(
      "pb.backups.create() did not confirm success — aborting before any mutation"
    );
  }
  console.log(`  Backup created: ${basename}`);
  return basename;
}

async function main() {
  console.log("=".repeat(80));
  console.log("BACKFILL PLAN DATES — weekly_plans.start_date");
  console.log(`Target: ${PB_URL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writing changes)"}`);
  console.log("=".repeat(80));

  const allPlans = await pb.collection("weekly_plans").getFullList();
  console.log(`\nLoaded ${allPlans.length} weekly_plans record(s) from ${PB_URL}`);

  const undated = allPlans.filter((p) => !p.start_date);
  const alreadyDated = allPlans.length - undated.length;
  console.log(`  Already dated: ${alreadyDated}`);
  console.log(`  Missing start_date: ${undated.length}`);

  if (undated.length === 0) {
    console.log("\nNothing to backfill — every weekly_plans record already has a start_date.");
    return;
  }

  // Caller-side sort contract: descending by `created`, ties broken by `id`
  // ascending — matches backfill-plan-dates.test.js's exact sort.
  const sortedUndated = [...undated].sort((a, b) => {
    if (a.created !== b.created) return a.created < b.created ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  const baseMonday = currentMondayISO();
  console.log(`  Base Monday (fallback anchor, this week): ${baseMonday}`);

  const dispositions = buildDispositions(sortedUndated, baseMonday);
  printDispositionReport(dispositions);

  if (DRY_RUN) {
    console.log(
      "\nDRY RUN — no PocketBase writes performed. Re-run without --dry-run to apply."
    );
    return;
  }

  await authenticateSuperuser();
  await backupBeforeBackfill();

  console.log("\n--- Applying start_date backfill ---");
  let updated = 0;
  let failed = 0;
  for (const d of dispositions) {
    try {
      await pb.collection("weekly_plans").update(d.id, { start_date: d.resolvedDate });
      updated++;
    } catch (e) {
      failed++;
      console.error(`  ⚠️  update failed for "${d.name}" (${d.id}): ${e.message}`);
    }
  }
  console.log(`\n  Updated: ${updated}, Failed: ${failed}`);
  if (failed > 0) {
    throw new Error(
      `${failed} update(s) failed — see log above; some weekly_plans records may still be undated`
    );
  }

  console.log("\n" + "=".repeat(80));
  console.log("BACKFILL COMPLETE — every weekly_plans record now has a start_date");
  console.log("=".repeat(80));
}

// Guard the entrypoint so this module can be `import`ed by
// backfill-plan-dates.test.js (for the pure resolvePlanDate export) without
// connecting to PocketBase or running main() as a side effect of import.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error("ERROR:", e.message, e.status, e.url);
    if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
    process.exit(1);
  });
}
