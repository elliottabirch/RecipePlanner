import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";
import { normalizeUnit } from "../src/lib/units.ts";

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
const REPORT_PATH = path.join(OUTPUT_DIR, "normalize-node-units-unresolved.md");

// Container-type strings observed on `stored`-type product nodes (full
// 445-record recipe_product_nodes.unit disposition table in
// 01-RESEARCH.md "Common Pitfalls #2"). These overload the `unit` field
// with container-type semantics (phase-doc §3.3/§4.5) rather than a real
// measurement unit — CLEAR them to empty, never alias them to a unit.
// Matched case-insensitively, trimmed.
const CONTAINER_STRINGS = new Set([
  "quart restaurant",
  "half-quart restaurant",
  "vacuum sealed bag",
  "vacuum sealed bags",
  "original packaging",
  "tupperware",
  "package",
  "packages",
  "large ramekin",
  "bag",
  "bags",
  "small container",
  "quart containers",
  "container",
]);

function fmtError(e) {
  const parts = [e.message, e.status && `status=${e.status}`].filter(Boolean);
  if (e.response?.data && Object.keys(e.response.data).length) {
    parts.push(`data=${JSON.stringify(e.response.data)}`);
  }
  return parts.join(" ");
}

async function main() {
  console.log("=".repeat(80));
  console.log("NORMALIZE NODE UNITS");
  console.log(`Target: ${PB_URL}`);
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN (no writes — pass --apply to mutate)" : "APPLY (writing changes)"}`
  );
  console.log("=".repeat(80));

  const products = await pb
    .collection("products")
    .getFullList({ fields: "id,type" });
  const productTypeById = new Map(products.map((p) => [p.id, p.type]));

  const nodes = await pb.collection("recipe_product_nodes").getFullList();

  let aliased = 0;
  let clearedContainer = 0;
  let unchanged = 0;
  let emptyCount = 0;
  let updated = 0;
  let failed = 0;
  const unresolved = [];

  for (const node of nodes) {
    const raw = (node.unit ?? "").trim();
    if (raw === "") {
      emptyCount++;
      continue;
    }

    const productType = productTypeById.get(node.product);
    const lowered = raw.toLowerCase();
    const canonical = normalizeUnit(raw);

    let nextUnit;
    let action;

    if (canonical) {
      if (canonical === raw) {
        unchanged++;
        continue;
      }
      nextUnit = canonical;
      action = "alias";
    } else if (CONTAINER_STRINGS.has(lowered) && productType === "stored") {
      nextUnit = "";
      action = "clear-container";
    } else {
      // Matches neither an enum token, an alias, nor a recognized
      // container-type string on a stored node. Per D-08, this is NEVER
      // guessed — report it for manual resolution instead.
      unresolved.push({
        nodeId: node.id,
        recipe: node.recipe,
        product: node.product,
        productType: productType ?? "(unknown)",
        raw: node.unit,
      });
      continue;
    }

    if (action === "alias") aliased++;
    if (action === "clear-container") clearedContainer++;

    if (DRY_RUN) {
      console.log(
        `  [dry-run] node ${node.id}: "${node.unit}" -> "${nextUnit}" (${action})`
      );
      continue;
    }

    try {
      await pb
        .collection("recipe_product_nodes")
        .update(node.id, { unit: nextUnit });
      updated++;
    } catch (e) {
      failed++;
      if (failed <= 5) {
        console.log(
          `    ⚠️  update recipe_product_nodes/${node.id} failed: ${fmtError(e)}`
        );
      }
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`  Total nodes: ${nodes.length}`);
  console.log(`  Empty (no-op): ${emptyCount}`);
  console.log(`  Already canonical: ${unchanged}`);
  console.log(`  Alias-normalized: ${aliased}`);
  console.log(`  Container strings cleared (stored nodes): ${clearedContainer}`);
  console.log(`  Unresolved (needs manual resolution): ${unresolved.length}`);
  if (!DRY_RUN) {
    console.log(`  Written: ${updated}${failed ? ` (${failed} failed)` : ""}`);
  }

  if (unresolved.length > 0) {
    console.log(
      "\n--- UNRESOLVED VALUES (D-08: never guessed, needs manual resolution) ---"
    );
    unresolved.forEach((u) => {
      console.log(
        `  node ${u.nodeId} (product ${u.product}, type ${u.productType}): "${u.raw}"`
      );
    });

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const reportLines = [
      "# normalize-node-units.js — Unresolved Values Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Source: ${PB_URL}`,
      "",
      "These recipe_product_nodes.unit values matched neither an enum token, a",
      "known alias, nor a recognized container-type string on a stored node.",
      "Per D-08, they are never guessed — resolve manually (edit the recipe in",
      "the app, or update the record directly) before re-running this script.",
      "",
      "| Node ID | Recipe | Product | Product Type | Raw Value |",
      "|---------|--------|---------|--------------|-----------|",
      ...unresolved.map(
        (u) =>
          `| ${u.nodeId} | ${u.recipe} | ${u.product} | ${u.productType} | \`${u.raw}\` |`
      ),
      "",
    ];
    fs.writeFileSync(REPORT_PATH, reportLines.join("\n"), "utf-8");
    console.log(`\n  Unresolved report written to: ${REPORT_PATH}`);
  }

  if (failed > 0) {
    throw new Error(`${failed} node update(s) failed — see errors above`);
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
