import PocketBase from "pocketbase";
import { runLint } from "../src/lib/linter/index.ts";

// PB_URL lets this same script be pointed at test (:8091) instead of prod
// (:8090). Default stays prod.
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";

const pb = new PocketBase(PB_URL);

async function main() {
  console.log("=".repeat(80));
  console.log("RUNNING RECIPE LINTER");
  console.log(`Target: ${PB_URL}`);
  console.log("=".repeat(80));

  const products = await pb.collection("products").getFullList({
    sort: "name",
    expand: "store,section,container_type",
  });

  // The cross-dimension rule needs each product's recipe_product_nodes unit
  // values — fetch them separately and group by product id, same approach
  // as the Products.tsx "Lint" handler (both surfaces call the same
  // runLint() core, but neither duplicates the node-fetch/group logic —
  // it's plumbing, not rule logic).
  const nodes = await pb.collection("recipe_product_nodes").getFullList();
  const nodesByProduct = new Map();
  for (const node of nodes) {
    if (!node.product) continue;
    const list = nodesByProduct.get(node.product) ?? [];
    list.push({ unit: node.unit });
    nodesByProduct.set(node.product, list);
  }

  const enriched = products.map((p) => ({
    ...p,
    nodes: nodesByProduct.get(p.id) ?? [],
  }));

  const findings = runLint(enriched);

  if (findings.length === 0) {
    console.log("\nNo issues found — all products are clean.");
    return;
  }

  const byRule = new Map();
  for (const finding of findings) {
    const list = byRule.get(finding.rule) ?? [];
    list.push(finding);
    byRule.set(finding.rule, list);
  }

  for (const [rule, ruleFindings] of byRule) {
    console.log(`\n--- ${rule} (${ruleFindings.length}) ---`);
    for (const f of ruleFindings) {
      console.log(`  [${f.severity}] ${f.message}`);
    }
  }

  console.log(`\nTotal findings: ${findings.length}`);
}

main().catch((e) => {
  console.error("ERROR:", e.message, e.status, e.url);
  if (e.response?.data) console.error("response:", JSON.stringify(e.response.data, null, 2));
  process.exit(1);
});
