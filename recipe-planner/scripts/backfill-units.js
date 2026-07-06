import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";
import { normalizeUnit, getDimension } from "../src/lib/units.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this script be pointed at test (:8091) for the D-06 rehearsal
// flow (against a fresh sync-to-test.js copy of prod) before the real prod
// run. Default stays prod.
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";

// Safety default: dry-run unless --apply is explicitly passed (D-08 safety
// net — never mutate prod data silently).
const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

const pb = new PocketBase(PB_URL);

const OUTPUT_DIR = path.join(__dirname, "dedup-output");
const REPORT_PATH = path.join(OUTPUT_DIR, "backfill-units-review.md");

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function main() {
  console.log("=".repeat(80));
  console.log("BACKFILL PRODUCT canonical_unit / dimension");
  console.log(`Target: ${PB_URL}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no writes — pass --apply to mutate)" : "APPLY (writing changes)"}`
  );
  console.log("=".repeat(80));

  const products = await pb.collection("products").getFullList({
    fields: "id,name,type,canonical_unit,dimension",
  });
  const nodes = await pb.collection("recipe_product_nodes").getFullList({
    fields: "product,unit",
  });

  const rawUnitsByProduct = new Map();
  for (const node of nodes) {
    if (!node.product) continue;
    const list = rawUnitsByProduct.get(node.product) ?? [];
    list.push(node.unit);
    rawUnitsByProduct.set(node.product, list);
  }

  let alreadySet = 0;
  let setCount = 0;
  let ambiguousDimension = 0;
  let noUsableUnits = 0;
  let updated = 0;
  let failed = 0;

  const ambiguousDetails = [];
  const noDataDetails = [];

  for (const product of products) {
    // Idempotent: never clobber an already-backfilled or manually-set
    // canonical_unit. Re-running this script after a partial run is safe.
    if (product.canonical_unit) {
      alreadySet++;
      continue;
    }

    const rawUnits = rawUnitsByProduct.get(product.id) ?? [];

    // Same normalization pass as normalize-node-units.js: only enum tokens
    // and known aliases contribute usable signal. Container-type strings
    // and genuinely unresolved junk carry no unit information here — they
    // neither count toward nor block dimension inference on their own;
    // if they are the ONLY values present, the product falls through to
    // "no usable units" below (never guessed, per D-08).
    const unitFrequency = new Map(); // canonical unit -> occurrence count
    const dimensionsSeen = new Set();

    for (const raw of rawUnits) {
      const trimmed = (raw ?? "").trim();
      if (trimmed === "") continue;
      const canonical = normalizeUnit(trimmed);
      if (!canonical) continue; // unresolved/junk/container string — no signal
      dimensionsSeen.add(getDimension(canonical));
      unitFrequency.set(canonical, (unitFrequency.get(canonical) ?? 0) + 1);
    }

    if (dimensionsSeen.size === 0) {
      noUsableUnits++;
      noDataDetails.push({ id: product.id, name: product.name, type: product.type });
      continue;
    }

    if (dimensionsSeen.size > 1) {
      // Genuinely ambiguous — this product's node history spans more than
      // one dimension (e.g. seen as both `each` and `g`). D-08: never
      // guess; leave both fields null for linter rule 4 to surface.
      ambiguousDimension++;
      ambiguousDetails.push({
        id: product.id,
        name: product.name,
        type: product.type,
        dimensions: [...dimensionsSeen].sort(),
      });
      continue;
    }

    // Exactly one dimension in play — pick the most-frequently-used
    // normalized unit as canonical. Deterministic tie-break: highest
    // occurrence count first, then alphabetical — independent of node
    // fetch order (mirrors the determinism requirement behind D-10).
    const ranked = [...unitFrequency.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    const canonicalUnit = ranked[0][0];
    // dimension is ALWAYS derived from canonical_unit, never set
    // independently, so the two fields can never drift (CONTEXT.md
    // "Claude's Discretion").
    const dimension = getDimension(canonicalUnit);

    setCount++;

    if (DRY_RUN) {
      console.log(
        `  [dry-run] ${product.name} (${product.id}): canonical_unit="${canonicalUnit}", dimension="${dimension}"`
      );
      continue;
    }

    try {
      await pb
        .collection("products")
        .update(product.id, { canonical_unit: canonicalUnit, dimension });
      updated++;
    } catch (e) {
      failed++;
      if (failed <= 5) {
        console.log(`    ⚠️  update products/${product.id} failed: ${fmtError(e)}`);
      }
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`  Total products: ${products.length}`);
  console.log(`  Already had canonical_unit (skipped): ${alreadySet}`);
  console.log(`  Unambiguous — canonical_unit/dimension inferred: ${setCount}`);
  console.log(`  Left null — no usable node units: ${noUsableUnits}`);
  console.log(`  Left null — ambiguous (spans multiple dimensions): ${ambiguousDimension}`);
  if (!DRY_RUN) {
    console.log(`  Written: ${updated}${failed ? ` (${failed} failed)` : ""}`);
  }

  if (ambiguousDetails.length > 0 || noDataDetails.length > 0) {
    console.log(
      "\n--- PRODUCTS LEFT NULL FOR MANUAL REVIEW (D-08: never guessed) ---"
    );
    ambiguousDetails.forEach((p) => {
      console.log(
        `  [ambiguous] ${p.name} (${p.id}, type ${p.type}): spans dimensions [${p.dimensions.join(", ")}]`
      );
    });
    noDataDetails.forEach((p) => {
      console.log(`  [no data] ${p.name} (${p.id}, type ${p.type}): no usable node units`);
    });

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const reportLines = [
      "# backfill-units.js — Manual Review Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Source: ${PB_URL}`,
      "",
      "Products left with `canonical_unit`/`dimension` null because their",
      "recipe_product_nodes.unit history is genuinely ambiguous or empty.",
      "Per D-08 these are never guessed — linter rule 4 (Plan 04) surfaces",
      "them on an ongoing basis; this report is a one-time snapshot for the",
      "Plan 08 supervised run.",
      "",
      "## Ambiguous (spans multiple dimensions)",
      "",
      "| Product ID | Name | Type | Dimensions Seen |",
      "|------------|------|------|------------------|",
      ...ambiguousDetails.map(
        (p) => `| ${p.id} | ${p.name} | ${p.type} | ${p.dimensions.join(", ")} |`
      ),
      "",
      "## No usable node units",
      "",
      "| Product ID | Name | Type |",
      "|------------|------|------|",
      ...noDataDetails.map((p) => `| ${p.id} | ${p.name} | ${p.type} |`),
      "",
    ];
    fs.writeFileSync(REPORT_PATH, reportLines.join("\n"), "utf-8");
    console.log(`\n  Review report written to: ${REPORT_PATH}`);
  }

  if (failed > 0) {
    throw new Error(`${failed} product update(s) failed — see errors above`);
  }

  console.log(
    DRY_RUN
      ? "\nDry run complete. Re-run with --apply to write these changes."
      : "\nApply complete."
  );
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
