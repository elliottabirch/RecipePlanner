import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

/**
 * Report + gated-apply audit for recipe_product_nodes.quantity corrections.
 *
 * Built for the garlic over-pull (quick 260716-rpp), then generalized when
 * thyme turned out to be a second instance of the same class: a sub-unit
 * alias (`clove`, `cube`, `sprig`, …) collapsing into `each` alongside a
 * different denomination of the same product, so the two merge 1:1. Expect
 * a third — hence one parameterized safety implementation rather than a
 * copy per ingredient.
 *
 * Usage:
 *   node scripts/audit-node-quantities.js --match garlic --evidence 'clove|cube'
 *   node scripts/audit-node-quantities.js --match '^thyme' --evidence 'sprig|bunch|package' --apply
 *
 *   --match <regex>     product-name pattern, case-insensitive (required)
 *   --evidence <regex>  prose to mine from the owning recipe's steps, to
 *                       recover authoring intent the unit field lost
 *   --label <slug>      output filename prefix (default: slug of --match)
 *   --apply             actually write (default is a dry run)
 *
 * Worksheets land at dedup-output/<label>-node-quantities.{json,md} and the
 * rollback at <label>-node-quantities.rollback.json. `--label garlic`
 * therefore still resolves the original garlic worksheet paths.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this script be pointed at test (:8091) for the D-06 rehearsal
// flow (against a fresh sync-to-test.js copy of prod) before the real prod
// run. Default stays prod. Same convention as merge-products.js /
// normalize-node-units.js / apply-unit-resolutions.js.
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";

// Safety default: dry-run unless --apply is explicitly passed (D-08 safety
// net — never mutate prod data silently).
const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return v;
}

const MATCH_RAW = argValue("--match");
if (!MATCH_RAW) {
  throw new Error(
    "--match <regex> is required (product-name pattern, e.g. --match garlic). " +
      "Refusing to audit every product by default."
  );
}
// Build the regexes eagerly so a bad pattern fails before any network call.
let MATCH_RE, EVIDENCE_RE;
try {
  MATCH_RE = new RegExp(MATCH_RAW, "i");
} catch (e) {
  throw new Error(`--match "${MATCH_RAW}" is not a valid regex: ${e.message}`);
}
const EVIDENCE_RAW = argValue("--evidence");
try {
  EVIDENCE_RE = EVIDENCE_RAW ? new RegExp(EVIDENCE_RAW, "i") : null;
} catch (e) {
  throw new Error(`--evidence "${EVIDENCE_RAW}" is not a valid regex: ${e.message}`);
}

const LABEL = (argValue("--label") ?? MATCH_RAW)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "audit";

const pb = new PocketBase(PB_URL);

const OUTPUT_DIR = path.join(__dirname, "dedup-output");
const WORKSHEET_JSON_PATH = path.join(OUTPUT_DIR, `${LABEL}-node-quantities.json`);
const WORKSHEET_MD_PATH = path.join(OUTPUT_DIR, `${LABEL}-node-quantities.md`);
const ROLLBACK_PATH = path.join(OUTPUT_DIR, `${LABEL}-node-quantities.rollback.json`);

const EVIDENCE_MAX_LEN = 200;

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
  // Never print the credential values themselves.
  console.log("  Authenticated as superuser");
}

function truncate(text) {
  if (text.length <= EVIDENCE_MAX_LEN) return text;
  return `${text.slice(0, EVIDENCE_MAX_LEN)}…`;
}

/**
 * Report phase — READ ONLY. Fetches every product matching --match, every
 * recipe_product_node against those products, and recovers authoring
 * evidence matching --evidence from the owning recipe's steps. That prose
 * matters because the raw unit string is gone from the DB the moment it
 * normalizes (`clove` -> `each`), leaving step text as the only surviving
 * record of what the author meant.
 *
 * proposedQuantity is seeded EQUAL to currentQuantity and confirmed is
 * seeded false for every row — this script never auto-proposes a
 * correction (D-08: never guess). A human fills in proposedQuantity and
 * flips confirmed using the evidence column + the recipe itself.
 */
async function buildReport() {
  console.log(
    `\n--- Building ${LABEL} node-quantity report (read-only) ---`
  );

  const allProducts = await pb.collection("products").getFullList();
  const matchedProducts = allProducts.filter((p) => MATCH_RE.test(p.name));
  const matchedProductIds = new Set(matchedProducts.map((p) => p.id));
  const productById = new Map(matchedProducts.map((p) => [p.id, p]));

  console.log(
    `  Products matching /${MATCH_RE.source}/i: ${matchedProducts.map((p) => `${p.name} (${p.id})`).join(", ") || "(none found)"}`
  );
  if (matchedProducts.length === 0) {
    throw new Error(
      `No product name matches /${MATCH_RE.source}/i — refusing to write an empty worksheet. Check the --match pattern.`
    );
  }

  const allNodes = await pb
    .collection("recipe_product_nodes")
    .getFullList({ expand: "recipe" });
  const matchedNodes = allNodes.filter((n) => matchedProductIds.has(n.product));

  const allSteps = await pb.collection("recipe_steps").getFullList();
  const stepsByRecipe = new Map();
  for (const s of allSteps) {
    if (!stepsByRecipe.has(s.recipe)) stepsByRecipe.set(s.recipe, []);
    stepsByRecipe.get(s.recipe).push(s);
  }

  const rows = matchedNodes.map((node) => {
    const product = productById.get(node.product);
    const recipe = node.expand?.recipe;
    const recipeSteps = stepsByRecipe.get(node.recipe) || [];
    const mentions = EVIDENCE_RE
      ? recipeSteps
          .flatMap((s) => [s.name, s.instructions])
          .filter(Boolean)
          .filter((text) => EVIDENCE_RE.test(text))
          .map((text) => truncate(text.trim()))
      : [];
    const evidence =
      mentions.length > 0
        ? mentions.join(" | ")
        : EVIDENCE_RE
          ? `(no /${EVIDENCE_RE.source}/i mention found in recipe steps)`
          : "(no --evidence pattern given)";

    const currentQuantity = node.quantity ?? 0;
    const currentUnit = node.unit ?? "";

    return {
      nodeId: node.id,
      recipeName: recipe?.name ?? "(unknown)",
      recipeStatus: recipe?.status ?? "(unknown)",
      productId: node.product,
      productName: product?.name ?? "(unknown)",
      productType: product?.type ?? "(unknown)",
      currentQuantity,
      currentUnit,
      // D-08: never guessed. Human fills these in via the checkpoint.
      proposedQuantity: currentQuantity,
      evidence,
      confirmed: false,
    };
  });

  rows.sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      a.recipeName.localeCompare(b.recipeName)
  );

  console.log(
    `  Found ${rows.length} node(s) across ${matchedProducts.length} matched product(s)`
  );
  return rows;
}

function renderMarkdown(rows) {
  const lines = [
    `# Node Quantity Audit — ${LABEL}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Source: ${PB_URL}`,
    "",
    `${rows.length} node(s) matching /${MATCH_RE.source}/i. Every row seeds \`confirmed: false\` and`,
    "`proposedQuantity === currentQuantity` — nothing here is auto-proposed",
    "(D-08). Fill in `proposedQuantity` and flip `confirmed: true` in the JSON",
    "worksheet only for rows you have personally decided, using the Evidence",
    "column and the recipe itself where ambiguous.",
    "",
  ];

  const byProduct = new Map();
  for (const row of rows) {
    const key = `${row.productName} (${row.productId})`;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(row);
  }

  for (const [productKey, productRows] of byProduct) {
    lines.push(`## ${productKey}`, "");
    lines.push(
      "| Node ID | Recipe | Status | Current Qty | Unit | Proposed Qty | Confirmed | Evidence |"
    );
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const r of productRows) {
      lines.push(
        `| ${r.nodeId} | ${r.recipeName} | ${r.recipeStatus} | ${r.currentQuantity} | ${r.currentUnit || "(empty)"} | ${r.proposedQuantity} | ${r.confirmed} | ${r.evidence.replace(/\|/g, "\\|")} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Pre-flight validate every confirmed row before any mutation (mirrors
 * apply-unit-resolutions.js's preflightValidate): proposedQuantity must be
 * a finite number >= 0. Aborts the whole run if any confirmed row is
 * malformed — before any write, dry-run or apply.
 */
function preflightValidate(confirmedRows) {
  console.log("\n--- Pre-flight validation ---");
  const errors = [];
  for (const row of confirmedRows) {
    const q = row.proposedQuantity;
    if (typeof q !== "number" || !Number.isFinite(q) || q < 0) {
      errors.push(
        `node ${row.nodeId} (${row.productName} / ${row.recipeName}): proposedQuantity "${row.proposedQuantity}" is not a finite number >= 0`
      );
    }
  }
  if (errors.length > 0) {
    console.error("\n  Pre-flight validation FAILED:");
    errors.forEach((e) => console.error(`    - ${e}`));
    throw new Error(
      `Pre-flight validation failed with ${errors.length} error(s) — aborting before any mutation`
    );
  }
  console.log(`  ${confirmedRows.length} confirmed row(s) passed pre-flight validation`);
}

/**
 * D-06.2: snapshot before any mutation, same convention as
 * merge-products.js's backupBeforeMerge.
 */
async function backupBeforeApply() {
  console.log("\n--- Creating pre-apply backup ---");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-${LABEL}-quantities-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error(
      "pb.backups.create() did not confirm success — aborting before any mutation"
    );
  }
  console.log(`  Backup created: ${basename}`);
  return basename;
}

/**
 * Written BEFORE the first write, capturing every touched node's BEFORE
 * {nodeId, quantity, unit} so a bad sweep can be reversed without needing
 * the PB backup restore.
 */
function writeRollbackWorksheet(confirmedToApply) {
  const rollback = confirmedToApply.map((r) => ({
    nodeId: r.nodeId,
    quantity: r.currentQuantity,
    unit: r.currentUnit,
  }));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(ROLLBACK_PATH, JSON.stringify(rollback, null, 2));
  console.log(
    `  Rollback worksheet written: ${ROLLBACK_PATH} (${rollback.length} node(s))`
  );
}

/**
 * Only `quantity` is ever written; never `unit`, never a delete.
 */
async function applyConfirmedRows(confirmedToApply) {
  console.log(
    "\n--- Applying confirmed quantity corrections (recipe_product_nodes.quantity) ---"
  );
  let updated = 0;
  let failed = 0;
  for (const row of confirmedToApply) {
    try {
      await pb
        .collection("recipe_product_nodes")
        .update(row.nodeId, { quantity: row.proposedQuantity });
      updated++;
      console.log(
        `  node ${row.nodeId}: ${row.currentQuantity} -> ${row.proposedQuantity} OK`
      );
    } catch (e) {
      failed++;
      console.error(
        `    ⚠️  update recipe_product_nodes/${row.nodeId} failed: ${fmtError(e)}`
      );
    }
  }
  console.log(
    `  Updated: ${updated}/${confirmedToApply.length}${failed ? ` (${failed} failed)` : ""}`
  );
  if (failed > 0) {
    throw new Error(
      `${failed} quantity update(s) failed — see errors above; the pre-apply backup and rollback worksheet are available to recover the successfully-applied rows if needed`
    );
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log(`AUDIT NODE QUANTITIES — ${LABEL}`);
  console.log(`Target: ${PB_URL}`);
  console.log(`Worksheet: ${WORKSHEET_JSON_PATH}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no writes — pass --apply to mutate)" : "APPLY (writing changes)"}`
  );
  console.log("=".repeat(80));

  const worksheetExists = fs.existsSync(WORKSHEET_JSON_PATH);

  if (APPLY && !worksheetExists) {
    throw new Error(
      `--apply requires an existing worksheet at ${WORKSHEET_JSON_PATH} — run without --apply first to generate the read-only report, get it human-confirmed, then re-run with --apply.`
    );
  }

  let rows;
  if (worksheetExists) {
    console.log(`\nLoading existing worksheet: ${WORKSHEET_JSON_PATH}`);
    rows = JSON.parse(fs.readFileSync(WORKSHEET_JSON_PATH, "utf-8"));
    if (!Array.isArray(rows)) {
      throw new Error(`${WORKSHEET_JSON_PATH}: expected a top-level array of rows`);
    }
  } else {
    rows = await buildReport();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(WORKSHEET_JSON_PATH, JSON.stringify(rows, null, 2));
    fs.writeFileSync(WORKSHEET_MD_PATH, renderMarkdown(rows));
    console.log(`\n  Worksheet written: ${WORKSHEET_JSON_PATH} (${rows.length} rows)`);
    console.log(`  Markdown report written: ${WORKSHEET_MD_PATH}`);
  }

  const confirmedRows = rows.filter((r) => r.confirmed === true);
  preflightValidate(confirmedRows);

  const toApply = confirmedRows.filter(
    (r) => r.proposedQuantity !== r.currentQuantity
  );
  const noOpConfirmed = confirmedRows.length - toApply.length;

  console.log(`\n  Total rows: ${rows.length}`);
  console.log(
    `  Confirmed rows: ${confirmedRows.length} (${toApply.length} change quantity, ${noOpConfirmed} no-op)`
  );

  if (toApply.length === 0) {
    console.log(
      "\nNo confirmed quantity changes to apply. Worksheet rows all seed confirmed:false until a human reviews and confirms them."
    );
    return;
  }

  console.log(`\n--- ${DRY_RUN ? "[dry-run] " : ""}Confirmed quantity changes ---`);
  for (const row of toApply) {
    console.log(
      `  node ${row.nodeId}: qty ${row.currentQuantity} -> ${row.proposedQuantity}  [${row.productName} / ${row.recipeName}]`
    );
  }

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run with --apply to write these changes.");
    return;
  }

  await authenticateSuperuser();
  const backupId = await backupBeforeApply();
  writeRollbackWorksheet(toApply);
  console.log(`\n  Backup id: ${backupId}`);
  await applyConfirmedRows(toApply);

  console.log("\n" + "=".repeat(80));
  console.log("✅ APPLY COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error(`\n❌ AUDIT NODE QUANTITIES (${LABEL}) FAILED:`, fmtError(e));
  process.exit(1);
});
