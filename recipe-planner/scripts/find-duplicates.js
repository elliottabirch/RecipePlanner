import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PB_URL lets this same script be pointed at test (:8091) for the D-06 rehearsal
// flow instead of prod (:8090). Default stays prod.
const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";

const pb = new PocketBase(PB_URL);

const OUTPUT_DIR = path.join(__dirname, "dedup-output");

// The four D-07 live-enumerated product-reference collections. Hardcoded here
// (not derived from the pb_schema.json export, per D-07's live-DB enumeration
// rule) — same convention merge-products.js follows.
const REFERENCE_COLLECTIONS = [
  { collection: "recipe_product_nodes", field: "product" },
  { collection: "inventory_items", field: "product" },
  { collection: "products", field: "store_bought_product" },
  { collection: "meal_variant_overrides", field: "replacement_product" },
];

/**
 * Count, per reference collection, how many records point at productId.
 * Queried live against the DB per D-07 — never against the stale schema export.
 */
async function countReferences(productId) {
  const counts = {};
  for (const { collection, field } of REFERENCE_COLLECTIONS) {
    const records = await pb.collection(collection).getFullList({
      filter: `${field} = "${productId}"`,
      fields: "id",
    });
    counts[collection] = records.length;
  }
  return counts;
}

function formatCounts(counts) {
  return REFERENCE_COLLECTIONS.map(
    ({ collection }) => `${collection}=${counts[collection] ?? 0}`
  ).join(", ");
}

async function main() {
  const products = await pb.collection("products").getFullList({ sort: "name" });

  console.log("=".repeat(80));
  console.log("SEARCHING FOR POTENTIAL DUPLICATES");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  // 1. Exact case-insensitive name collisions, grouped.
  console.log("\n--- EXACT NAME COLLISIONS (case-insensitive) ---");
  const nameGroups = new Map();
  products.forEach((p) => {
    const name = p.name.toLowerCase();
    if (!nameGroups.has(name)) nameGroups.set(name, []);
    nameGroups.get(name).push(p);
  });

  // Split collision groups into same-type merge candidates vs cross-type
  // quarantined collisions (D-12 / Pitfall #1: transient/stored same-name
  // pairs are a legitimate pattern — shouldCreateInstances() branches on
  // `type`, so merging across type would silently break instance creation).
  const mergeCandidateClusters = [];
  const crossTypeCollisions = [];

  nameGroups.forEach((items, name) => {
    if (items.length < 2) return;
    const types = new Set(items.map((p) => p.type));
    if (types.size > 1) {
      crossTypeCollisions.push({ name, items });
    } else {
      mergeCandidateClusters.push({ name, items });
    }
  });

  if (mergeCandidateClusters.length === 0) {
    console.log("  No same-type merge candidates found");
  } else {
    mergeCandidateClusters.forEach(({ name, items }) => {
      console.log(`\n"${name}" appears ${items.length} times (same type: ${items[0].type}):`);
      items.forEach((p) => console.log(`  - ${p.name} [${p.type}] (ID: ${p.id})`));
    });
  }

  console.log("\n--- CROSS-TYPE NAME COLLISIONS (NOT dupe candidates) ---");
  if (crossTypeCollisions.length === 0) {
    console.log("  None found");
  } else {
    crossTypeCollisions.forEach(({ name, items }) => {
      console.log(`\n"${name}" appears ${items.length} times across DIFFERENT types (legitimate — quarantined, excluded from merge candidates):`);
      items.forEach((p) => console.log(`  - ${p.name} [${p.type}] (ID: ${p.id})`));
    });
  }

  // 2. Same-type, similar-first-word potential dupes (existing heuristic, kept).
  console.log("\n\n--- POTENTIAL DUPLICATES (same type, similar name) ---");
  const checked = new Set();
  let potentialDupes = 0;

  products.forEach((p1) => {
    products.forEach((p2) => {
      if (p1.id >= p2.id) return;
      if (p1.type !== p2.type) return;

      const key = p1.id + ":" + p2.id;
      if (checked.has(key)) return;
      checked.add(key);

      const n1 = p1.name.toLowerCase().trim();
      const n2 = p2.name.toLowerCase().trim();

      const words1 = n1.split(/\s+/);
      const words2 = n2.split(/\s+/);

      if (words1[0] === words2[0] && words1[0].length > 3) {
        potentialDupes++;
        console.log(`\n  [${p1.type}] Similar first word "${words1[0]}":`);
        console.log(`    - ${p1.name} (ID: ${p1.id})`);
        console.log(`    - ${p2.name} (ID: ${p2.id})`);
      }
    });
  });
  if (potentialDupes === 0) console.log("  None found");

  // 3. Build the D-05 review artifacts: MD context report + JSON decisions skeleton.
  console.log("\n\n--- BUILDING REVIEW ARTIFACTS (D-05) ---");
  console.log("  Computing live reference counts for each merge-candidate cluster...");

  const decisions = [];
  const mdSections = [];

  for (const { name, items } of mergeCandidateClusters) {
    const clusterWithCounts = [];
    for (const p of items) {
      const counts = await countReferences(p.id);
      clusterWithCounts.push({ ...p, refCounts: counts });
    }

    mdSections.push(renderClusterSection(name, clusterWithCounts));

    // Skeleton: one decision entry per non-survivor member. Default survivor
    // is left null for the human to fill in; confirmed defaults to false so
    // merge-products.js never acts on an un-reviewed entry.
    clusterWithCounts.forEach((p) => {
      decisions.push({
        dupeId: p.id,
        survivorId: null,
        confirmed: false,
        name: p.name,
        cluster: clusterWithCounts.map((c) => c.id),
      });
    });
  }

  const crossTypeSections = [];
  for (const { name, items } of crossTypeCollisions) {
    const clusterWithCounts = [];
    for (const p of items) {
      const counts = await countReferences(p.id);
      clusterWithCounts.push({ ...p, refCounts: counts });
    }
    crossTypeSections.push(renderClusterSection(name, clusterWithCounts, true));
  }

  const mdReport = renderMarkdownReport(mdSections, crossTypeSections);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const mdPath = path.join(OUTPUT_DIR, "dedup-report.md");
  const jsonPath = path.join(OUTPUT_DIR, "dedup-decisions.json");

  fs.writeFileSync(mdPath, mdReport, "utf-8");
  fs.writeFileSync(jsonPath, JSON.stringify(decisions, null, 2), "utf-8");

  console.log(`\n  Markdown context report written to: ${mdPath}`);
  console.log(`  JSON decisions skeleton written to:  ${jsonPath}`);
  console.log(`  (${decisions.length} decision entries across ${mergeCandidateClusters.length} same-type clusters; ${crossTypeCollisions.length} cross-type collisions quarantined out)`);
}

function renderClusterSection(name, clusterWithCounts, isCrossType = false) {
  const lines = [];
  lines.push(`### "${name}"${isCrossType ? " (cross-type — NOT a merge candidate)" : ""}`);
  lines.push("");
  lines.push("| ID | Name | Type | " + REFERENCE_COLLECTIONS.map((r) => r.collection).join(" | ") + " |");
  lines.push("|" + "---|".repeat(3 + REFERENCE_COLLECTIONS.length));
  clusterWithCounts.forEach((p) => {
    const counts = REFERENCE_COLLECTIONS.map((r) => p.refCounts[r.collection] ?? 0).join(" | ");
    lines.push(`| ${p.id} | ${p.name} | ${p.type} | ${counts} |`);
  });
  lines.push("");
  return lines.join("\n");
}

function renderMarkdownReport(mdSections, crossTypeSections) {
  const lines = [];
  lines.push("# Product Dedup Review Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: ${PB_URL}`);
  lines.push("");
  lines.push(
    "Edit the companion `dedup-decisions.json` file: set `survivorId` to the " +
      "ID that should survive the merge and `confirmed: true` for each entry " +
      "you approve. `merge-products.js` reads ONLY that JSON file and ignores " +
      "everything else."
  );
  lines.push("");
  lines.push("## Merge Candidate Clusters (same type)");
  lines.push("");
  if (mdSections.length === 0) {
    lines.push("None found.");
  } else {
    lines.push(...mdSections);
  }
  lines.push("");
  lines.push("## Cross-Type Name Collisions (NOT dupe candidates)");
  lines.push("");
  lines.push(
    "These share a case-insensitive name but have DIFFERENT `type` values " +
      "(e.g. a `transient` intermediate and a `stored` terminal product). " +
      "This is a legitimate, intentional pattern (D-12) — merging them would " +
      "corrupt `shouldCreateInstances()` branching. They are excluded from " +
      "the JSON decisions skeleton."
  );
  lines.push("");
  if (crossTypeSections.length === 0) {
    lines.push("None found.");
  } else {
    lines.push(...crossTypeSections);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
