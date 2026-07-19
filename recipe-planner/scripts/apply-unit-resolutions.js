import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this script be pointed at test (:8091) for rehearsal; default
// stays prod. Same convention as merge-products.js / normalize-node-units.js.
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";

// Safety default: dry-run unless --apply is explicitly passed — this is the
// last write step of the Plan 08 supervised prod run, applying the
// human-confirmed unit-resolutions worksheet (D-08 entry condition from
// 01-07-SUMMARY.md: nothing left to the linter).
const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

const pb = new PocketBase(PB_URL);

const OUTPUT_DIR = path.join(__dirname, "dedup-output");
const WORKSHEET_PATH =
  process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) ||
  path.join(OUTPUT_DIR, "unit-resolutions.json");

const ENUM_TOKENS = new Set([
  "tsp", "tbsp", "fl_oz", "cup", "pint", "qt", "gal", "ml", "l",
  "g", "kg", "oz", "lb", "each",
]);

const UNIT_DIMENSIONS = {
  tsp: "volume", tbsp: "volume", fl_oz: "volume", cup: "volume",
  pint: "volume", qt: "volume", gal: "volume", ml: "volume", l: "volume",
  g: "mass", kg: "mass", oz: "mass", lb: "mass",
  each: "count",
};

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
    throw new Error(
      "PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD must be set in the environment"
    );
  }
  await pb.collection("_superusers").authWithPassword(email, password);
  // Never print the credential values themselves (Plan 08 entry condition).
  console.log("  Authenticated as superuser");
}

function loadWorksheet(worksheetPath) {
  const raw = fs.readFileSync(worksheetPath, "utf-8");
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc.node_units)) {
    throw new Error(`${worksheetPath}: missing node_units array`);
  }
  if (!Array.isArray(doc.canonical_units_ambiguous)) {
    throw new Error(`${worksheetPath}: missing canonical_units_ambiguous array`);
  }
  if (!Array.isArray(doc.canonical_units_null)) {
    throw new Error(`${worksheetPath}: missing canonical_units_null array`);
  }
  return doc;
}

/**
 * Validate every confirmed row before any mutation, matching the
 * pre-flight-then-mutate shape of merge-products.js: node_units'
 * resolved_unit must be an enum token or "" (clear); canonical_units rows'
 * canonical_unit must be an enum token, and dimension must match
 * UNIT_DIMENSIONS[canonical_unit] (they must never drift — CONTEXT.md
 * "Claude's Discretion").
 */
function preflightValidate(doc) {
  console.log("\n--- Pre-flight validation ---");
  const errors = [];

  const confirmedNodeUnits = doc.node_units.filter((r) => r.confirmed === true);
  for (const row of confirmedNodeUnits) {
    if (row.resolved_unit !== "" && !ENUM_TOKENS.has(row.resolved_unit)) {
      errors.push(
        `node_units nodeId ${row.nodeId}: resolved_unit "${row.resolved_unit}" is not an enum token or ""`
      );
    }
  }

  const confirmedCanonical = [
    ...doc.canonical_units_ambiguous.filter((r) => r.confirmed === true),
    ...doc.canonical_units_null.filter((r) => r.confirmed === true),
  ];
  for (const row of confirmedCanonical) {
    if (!ENUM_TOKENS.has(row.canonical_unit)) {
      errors.push(
        `canonical_units productId ${row.productId} (${row.name}): canonical_unit "${row.canonical_unit}" is not a valid enum token`
      );
      continue;
    }
    const expectedDimension = UNIT_DIMENSIONS[row.canonical_unit];
    if (row.dimension !== expectedDimension) {
      errors.push(
        `canonical_units productId ${row.productId} (${row.name}): dimension "${row.dimension}" does not match canonical_unit "${row.canonical_unit}" (expected "${expectedDimension}")`
      );
    }
  }

  if (errors.length > 0) {
    console.error("\n  Pre-flight validation FAILED:");
    errors.forEach((e) => console.error(`    - ${e}`));
    throw new Error(`Pre-flight validation failed with ${errors.length} error(s) — aborting before any mutation`);
  }

  console.log(
    `  ${confirmedNodeUnits.length} confirmed node_units row(s), ${confirmedCanonical.length} confirmed canonical_units row(s) — all valid`
  );
  return { confirmedNodeUnits, confirmedCanonical };
}

async function applyNodeUnits(confirmedNodeUnits) {
  console.log("\n--- Applying node_units resolutions (recipe_product_nodes.unit) ---");
  let updated = 0;
  let skippedUnchanged = 0;
  let failed = 0;

  for (const row of confirmedNodeUnits) {
    if (DRY_RUN) {
      console.log(
        `  [dry-run] node ${row.nodeId}: "${row.raw}" -> "${row.resolved_unit}"`
      );
      continue;
    }
    try {
      await pb
        .collection("recipe_product_nodes")
        .update(row.nodeId, { unit: row.resolved_unit });
      updated++;
    } catch (e) {
      failed++;
      console.error(`    ⚠️  update recipe_product_nodes/${row.nodeId} failed: ${fmtError(e)}`);
    }
  }

  if (!DRY_RUN) {
    console.log(`  Updated: ${updated}/${confirmedNodeUnits.length}${failed ? ` (${failed} failed)` : ""}`);
  }
  if (failed > 0) {
    throw new Error(`${failed} node_units update(s) failed — see errors above`);
  }
  return { updated, skippedUnchanged, failed };
}

async function applyCanonicalUnits(confirmedCanonical) {
  console.log("\n--- Applying canonical_units resolutions (products.canonical_unit + dimension) ---");
  let updated = 0;
  let failed = 0;

  for (const row of confirmedCanonical) {
    if (DRY_RUN) {
      console.log(
        `  [dry-run] product ${row.productId} (${row.name}): canonical_unit="${row.canonical_unit}", dimension="${row.dimension}"`
      );
      continue;
    }
    try {
      await pb.collection("products").update(row.productId, {
        canonical_unit: row.canonical_unit,
        dimension: row.dimension,
      });
      updated++;
    } catch (e) {
      failed++;
      console.error(`    ⚠️  update products/${row.productId} failed: ${fmtError(e)}`);
    }
  }

  if (!DRY_RUN) {
    console.log(`  Updated: ${updated}/${confirmedCanonical.length}${failed ? ` (${failed} failed)` : ""}`);
  }
  if (failed > 0) {
    throw new Error(`${failed} canonical_units update(s) failed — see errors above`);
  }
  return { updated, failed };
}

async function main() {
  console.log("=".repeat(80));
  console.log("APPLY UNIT RESOLUTIONS — confirmed human worksheet");
  console.log(`Target: ${PB_URL}`);
  console.log(`Worksheet: ${WORKSHEET_PATH}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no writes — pass --apply to mutate)" : "APPLY (writing changes)"}`
  );
  console.log("=".repeat(80));

  const doc = loadWorksheet(WORKSHEET_PATH);
  const { confirmedNodeUnits, confirmedCanonical } = preflightValidate(doc);

  if (confirmedNodeUnits.length === 0 && confirmedCanonical.length === 0) {
    console.log("\nNo confirmed rows found — nothing to do.");
    return;
  }

  if (!DRY_RUN) {
    await authenticateSuperuser();
  }

  await applyNodeUnits(confirmedNodeUnits);
  await applyCanonicalUnits(confirmedCanonical);

  console.log("\n" + "=".repeat(80));
  console.log(DRY_RUN ? "DRY RUN COMPLETE — re-run with --apply to write" : "✅ APPLY COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("\n❌ APPLY UNIT RESOLUTIONS FAILED:", fmtError(e));
  process.exit(1);
});
