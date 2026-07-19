// Idempotent seed insert/backfill resolver (Phase 3 Plan 04, D-01..D-04,
// REG-01, T-03-07/08/09). Extends find-duplicates.js's PocketBase-client +
// report conventions (03-PATTERNS.md).
//
// Reads scripts/data/usda-seed.json (built by `build-usda-seed.js --full-seed`)
// and resolves each row against the live registry:
//   - exact case-insensitive name match (scoped to `type = "raw"`, per
//     Pitfall 2 — the unique index is composite (name COLLATE NOCASE, type))
//     with an empty fdc_id -> BACKFILL (required, seeds the re-run join key)
//   - exact match that already has an fdc_id -> SKIP (no-op, never merges
//     further)
//   - a conservative fuzzy near-match (tight ~0.2 threshold, distinct from
//     the UI search-surface's 0.35 threshold) -> SKIP_REVIEW, NEVER
//     auto-inserted or auto-merged (D-03)
//   - a genuine miss -> INSERT a new `raw` product
//   - a same-name product of a DIFFERENT type does NOT block the insert —
//     it's flagged as a cross-type collision review item only (mirrors
//     find-duplicates.js's crossTypeCollisions quarantine)
//
// `resolveSeedRow` is a PURE function (no PocketBase, no I/O) so the four
// behaviors above are unit-testable without a live DB — see
// seed-usda.test.js. `main()` wires it to a real PocketBase instance.
//
// Modes:
//   --dry-run       read-only: builds + writes the report, makes NO writes.
//   --backup-only   authenticates + takes a pb.backups.create() snapshot of
//                   whatever PB_URL points at, then exits — no seed
//                   processing. Used to take the mandatory prod backup
//                   ahead of (and independently from) the real apply run,
//                   per the plan's backup-before-mutate gate (T-03-07).
//   (no flag)       real run: builds the report, takes a backup, then
//                   applies INSERT/BACKFILL actions against PB_URL.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";
import Fuse from "fuse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this same script be pointed at test (:8091) instead of prod
// (:8090) — required for the mandatory test-first rehearsal before any
// prod write.
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const pb = new PocketBase(PB_URL);

const DRY_RUN = process.argv.includes("--dry-run");
const BACKUP_ONLY = process.argv.includes("--backup-only");

const SEED_PATH = path.join(__dirname, "data", "usda-seed.json");
const OUTPUT_DIR = path.join(__dirname, "seed-output");

// Tight hard-dedup threshold for the JOIN/backfill decision — distinct from
// src/lib/search/product-search.ts's 0.35 interactive search-ranking
// threshold. A near-match here is review-worthy, never auto-actionable.
const NEAR_MATCH_THRESHOLD = 0.2;

function normalizeName(name) {
  return name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Pure resolver logic — no PocketBase, no I/O. Unit-tested directly.
// ---------------------------------------------------------------------------

/**
 * Builds a fuse.js-backed near-match function over the live `raw` products,
 * filtered to the tight NEAR_MATCH_THRESHOLD. Returns an array of
 * {product, score} for any hit tighter than the threshold (empty if none).
 */
export function buildNearMatchFn(existingRaw) {
  const fuse = new Fuse(existingRaw, {
    keys: ["name"],
    includeScore: true,
    ignoreLocation: true,
  });

  return function nearMatchFn(row) {
    return fuse
      .search(row.name)
      .filter((r) => r.score !== undefined && r.score < NEAR_MATCH_THRESHOLD)
      .map((r) => ({ product: r.item, score: r.score }));
  };
}

/**
 * Resolves a single seed row against the existing registry.
 *
 * @param {object} row - a usda-seed.json row: {name, storeId, sectionId,
 *   fdc_id, usda_data_type, usda_category, canonical_unit, dimension}
 * @param {Map<string, object>} existingRawByName - normalized-name -> the
 *   single existing `type = "raw"` product with that name (Pitfall 2 scope)
 * @param {(row: object) => Array<{product: object, score: number}>} nearMatchFn
 * @param {Map<string, object[]>} [existingAllByName] - normalized-name -> ALL
 *   existing products (any type) with that name; used only to flag
 *   cross-type collisions, never to block the raw insert (D-12 precedent)
 * @returns {{action: "BACKFILL"|"SKIP"|"SKIP_REVIEW"|"INSERT", row: object,
 *   existing?: object, patch?: object, nearMatches?: object[],
 *   payload?: object, crossTypeCollision?: object[]}}
 */
export function resolveSeedRow(row, existingRawByName, nearMatchFn, existingAllByName) {
  const key = normalizeName(row.name);
  const exact = existingRawByName.get(key);

  let result;
  if (exact) {
    if (!exact.fdc_id) {
      // D-03: mandatory backfill on empty fdc_id — required, not optional,
      // since it seeds the re-run join key. Never auto-merge beyond this.
      result = {
        action: "BACKFILL",
        row,
        existing: exact,
        patch: {
          fdc_id: row.fdc_id,
          usda_data_type: row.usda_data_type,
          usda_category: row.usda_category,
        },
      };
    } else {
      result = { action: "SKIP", row, existing: exact };
    }
  } else {
    const nearMatches = nearMatchFn ? nearMatchFn(row) : [];
    if (nearMatches.length > 0) {
      // Conservative posture (D-03): never "INSERT" or "MERGE" on a fuzzy
      // near-match, however tight — always defer to human review.
      result = { action: "SKIP_REVIEW", row, nearMatches };
    } else {
      result = {
        action: "INSERT",
        row,
        payload: {
          name: row.name,
          type: "raw",
          store: row.storeId ?? undefined,
          section: row.sectionId ?? undefined,
          fdc_id: row.fdc_id ?? undefined,
          usda_data_type: row.usda_data_type || undefined,
          usda_category: row.usda_category ?? undefined,
          canonical_unit: row.canonical_unit ?? undefined,
          dimension: row.dimension ?? undefined,
        },
      };
    }
  }

  // Cross-type name collision: a soft review flag, NEVER a hard block —
  // the composite (name, type) unique index means a same-name `stored`/
  // `transient`/`inventory` product does not conflict with a `raw` insert
  // (Pitfall 2 / D-12 precedent from Phase 1's find-duplicates.js).
  if (existingAllByName) {
    const crossTypeMatches = (existingAllByName.get(key) || []).filter(
      (p) => p.type !== "raw"
    );
    if (crossTypeMatches.length > 0) {
      result.crossTypeCollision = crossTypeMatches;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report rendering (dry-run review artifact, T-03-07)
// ---------------------------------------------------------------------------

function tallyResults(results) {
  const tally = { INSERT: 0, BACKFILL: 0, SKIP: 0, SKIP_REVIEW: 0 };
  for (const r of results) tally[r.action]++;
  return tally;
}

function renderReportMarkdown(results, tally, crossTypeFlags) {
  const lines = [];
  lines.push("# USDA Seed Dry-Run Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Target: ${PB_URL}`);
  lines.push("");
  lines.push(
    "This report reflects the CURRENT state of the target DB above — re-run against a different PB_URL to review a different environment (e.g. test :8091 vs prod :8090)."
  );
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total seed rows: ${results.length}`);
  lines.push(`- INSERT (genuine miss, new raw product): ${tally.INSERT}`);
  lines.push(`- BACKFILL (exact match, empty fdc_id populated): ${tally.BACKFILL}`);
  lines.push(`- SKIP (exact match, already has fdc_id — no-op): ${tally.SKIP}`);
  lines.push(`- SKIP_REVIEW (conservative near-match — NEVER auto-merged): ${tally.SKIP_REVIEW}`);
  lines.push(`- Cross-type name collisions flagged (does not block insert): ${crossTypeFlags.length}`);
  const withFdc = results.filter(
    (r) => r.action === "INSERT" && r.payload?.fdc_id
  ).length;
  lines.push(
    `- Of the ${tally.INSERT} INSERTs, ${withFdc} carry a matched fdc_id (the rest seed with fdc_id = null, a valid D-02 state)`
  );
  lines.push("");

  lines.push("## SKIP_REVIEW — conservative near-matches (human review required)");
  lines.push("");
  lines.push(
    "None of these are auto-merged or auto-inserted. Confirm none are true duplicates that should instead backfill the existing product manually."
  );
  lines.push("");
  const reviewRows = results.filter((r) => r.action === "SKIP_REVIEW");
  if (reviewRows.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| Seed name | Near-match (existing raw) | Score |");
    lines.push("|-----------|----------------------------|-------|");
    for (const r of reviewRows) {
      for (const nm of r.nearMatches) {
        lines.push(
          `| ${r.row.name} | ${nm.product.name} (ID: ${nm.product.id}) | ${nm.score.toFixed(3)} |`
        );
      }
    }
  }
  lines.push("");

  lines.push("## Cross-Type Name Collisions (NOT dupe candidates, review only)");
  lines.push("");
  lines.push(
    "These share a case-insensitive name with the seed row but the existing product has a DIFFERENT `type` (e.g. `stored`/`transient`/`inventory`). The composite `(name, type)` unique index means this does NOT block the raw insert (Pitfall 2) — listed here for awareness only, mirroring Phase 1's find-duplicates.js quarantine."
  );
  lines.push("");
  if (crossTypeFlags.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| Seed name | Seed action | Existing (different type) |");
    lines.push("|-----------|-------------|----------------------------|");
    for (const r of crossTypeFlags) {
      const existingDesc = r.crossTypeCollision
        .map((p) => `${p.name} [${p.type}] (ID: ${p.id})`)
        .join(", ");
      lines.push(`| ${r.row.name} | ${r.action} | ${existingDesc} |`);
    }
  }
  lines.push("");

  lines.push("## BACKFILL — exact match, empty fdc_id populated");
  lines.push("");
  const backfillRows = results.filter((r) => r.action === "BACKFILL");
  if (backfillRows.length === 0) {
    lines.push("None found.");
  } else {
    lines.push("| Existing product | fdc_id (backfilled) | usda_data_type |");
    lines.push("|-------------------|----------------------|-----------------|");
    for (const r of backfillRows) {
      lines.push(
        `| ${r.existing.name} (ID: ${r.existing.id}) | ${r.patch.fdc_id ?? "—"} | ${r.patch.usda_data_type || "—"} |`
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

function buildReportArtifacts(results) {
  const tally = tallyResults(results);
  const crossTypeFlags = results.filter((r) => r.crossTypeCollision);
  const md = renderReportMarkdown(results, tally, crossTypeFlags);
  const json = {
    generated: new Date().toISOString(),
    target: PB_URL,
    tally,
    crossTypeCollisionCount: crossTypeFlags.length,
    results: results.map((r) => ({
      name: r.row.name,
      action: r.action,
      existingId: r.existing?.id,
      nearMatches: r.nearMatches?.map((nm) => ({
        name: nm.product.name,
        id: nm.product.id,
        score: nm.score,
      })),
      crossTypeCollision: r.crossTypeCollision?.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
      })),
    })),
  };
  return { md, json, tally, crossTypeFlags };
}

// ---------------------------------------------------------------------------
// PocketBase wiring (T-03-07 backup-before-mutate)
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

/**
 * D-06.2/T-03-07 precedent (merge-products.js): snapshot the target DB via
 * PocketBase's built-in backup service before any mutation.
 */
async function backupBeforeSeed() {
  console.log("\n--- Creating pre-seed backup ---");
  // PocketBase backup names must match ^[a-z0-9_-]+\.zip$ (lowercase, .zip).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-seed-usda-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error("pb.backups.create() did not confirm success — aborting before any mutation");
  }
  console.log(`  Backup created: ${basename}`);
  return basename;
}

async function main() {
  console.log("=".repeat(80));
  console.log("SEED USDA — idempotent dedup/backfill/insert resolver");
  console.log(`Target: ${PB_URL}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no writes)" : BACKUP_ONLY ? "BACKUP ONLY (no seed processing)" : "APPLY (writing changes)"}`
  );
  console.log("=".repeat(80));

  if (BACKUP_ONLY) {
    await authenticateSuperuser();
    await backupBeforeSeed();
    console.log("\nBackup-only run complete — no seed rows were processed, no products touched.");
    return;
  }

  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(
      `${SEED_PATH} not found — run \`node scripts/build-usda-seed.js --full-seed\` first`
    );
  }
  const seedRows = JSON.parse(fs.readFileSync(SEED_PATH, "utf-8"));
  console.log(`\nLoaded ${seedRows.length} seed rows from ${SEED_PATH}`);

  const allProducts = await pb.collection("products").getFullList();
  // Hard-dedup scope: type="raw" only (121 records) — the unique index is
  // composite (name COLLATE NOCASE, type), NOT a bare name index (Pitfall 2).
  const existingRaw = allProducts.filter((p) => p.type === "raw");
  const existingRawByName = new Map(
    existingRaw.map((p) => [normalizeName(p.name), p])
  );
  const existingAllByName = new Map();
  for (const p of allProducts) {
    const key = normalizeName(p.name);
    if (!existingAllByName.has(key)) existingAllByName.set(key, []);
    existingAllByName.get(key).push(p);
  }
  console.log(
    `  ${allProducts.length} total products loaded (${existingRaw.length} type="raw")`
  );

  const nearMatchFn = buildNearMatchFn(existingRaw);

  const results = seedRows.map((row) =>
    resolveSeedRow(row, existingRawByName, nearMatchFn, existingAllByName)
  );

  const { md, json, tally, crossTypeFlags } = buildReportArtifacts(results);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "seed-report.md"), md, "utf-8");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "seed-report.json"),
    JSON.stringify(json, null, 2),
    "utf-8"
  );
  console.log(`\nWrote dry-run report to ${OUTPUT_DIR}/seed-report.md (+ .json)`);
  console.log(
    `  INSERT: ${tally.INSERT}, BACKFILL: ${tally.BACKFILL}, SKIP: ${tally.SKIP}, SKIP_REVIEW: ${tally.SKIP_REVIEW}`
  );
  console.log(`  Cross-type collisions flagged: ${crossTypeFlags.length}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no PocketBase writes performed. Re-run without --dry-run to apply.");
    return;
  }

  await authenticateSuperuser();
  await backupBeforeSeed();

  console.log("\n--- Applying INSERT/BACKFILL actions ---");
  let inserted = 0;
  let backfilled = 0;
  let failed = 0;
  for (const r of results) {
    try {
      if (r.action === "INSERT") {
        await pb.collection("products").create(r.payload);
        inserted++;
      } else if (r.action === "BACKFILL") {
        await pb.collection("products").update(r.existing.id, r.patch);
        backfilled++;
      }
      // SKIP / SKIP_REVIEW: no write, by design.
    } catch (e) {
      failed++;
      console.error(`  ⚠️  ${r.action} failed for "${r.row.name}": ${e.message}`);
    }
  }
  console.log(`\n  Inserted: ${inserted}, Backfilled: ${backfilled}, Failed: ${failed}`);
  if (failed > 0) {
    throw new Error(`${failed} write(s) failed — see log above; registry may be partially seeded`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("SEED COMPLETE");
  console.log("=".repeat(80));
}

// Guard the entrypoint so this module can be `import`ed by seed-usda.test.js
// (for the pure resolveSeedRow/buildNearMatchFn exports) without connecting
// to PocketBase or running main() as a side effect of import.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((e) => {
    console.error("ERROR:", e.message, e.status, e.url);
    if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
    process.exit(1);
  });
}
