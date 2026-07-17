import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

/**
 * Report + gated-apply script for the `create spaghetti` split (quick task
 * 260716-u4p, REWRITTEN 2026-07-17 against the 4-step all-batch model).
 *
 * ============================================================================
 * WHY THIS SHAPE — none of it is re-derivable from the code alone
 * ============================================================================
 * A direct user interview (2026-07-17) established how meat spaghetti is
 * actually cooked: the spaghetti is boiled on prep day, combined with the
 * sauce, and stored combined. THERE IS NO DAY-OF STEP FOR THIS DISH. All four
 * steps below are `batch`. Anyone re-deriving a `just_in_time` plate step
 * here is repeating the exact misreading this quick task corrected THREE
 * TIMES (see the mis-tag todo's `## Corrected` history) — the dish's name
 * ("spaghetti") suggests day-of boiling; the user's actual workflow does not
 * have one. Ask before modelling the graph.
 *
 * The split's entire value is granularity, not timing: one 8a/15p mega-step
 * cannot express that the 8-minute noodle boil and the 15-minute sauce
 * simmer can run AT THE SAME TIME. Split into four `batch` steps, the
 * scheduler can place them concurrently — but ONLY because prod's
 * `scheduler_config.burner_count` is 2 (verified live 2026-07-17).
 * `resources.ts` case (3) holds a stovetop resource for a step's FULL
 * active+passive window ("a simmering pot still occupies its burner"). Cook
 * spaghetti (2a/8p) and Simmer meat sauce (1a/15p) are both `stovetop` and
 * need two concurrent burners to overlap. AT `burner_count: 1` THIS SPLIT
 * WOULD MAKE THE DISH SLOWER than the mega-step, not faster — if that config
 * value ever changes, re-evaluate whether this split is still worth it.
 *
 * This SUPERSEDES the batch-sauce + `just_in_time`-plate model shipped as
 * `28c9102` and never applied to prod. That script is REWRITTEN, not
 * amended, here. Its stale worksheet (`split-create-spaghetti.{json,md}`,
 * encoding the day-of-plate model) is deleted; this version's worksheet is
 * version-stamped `model: "batch-4step-v2"`, and `--apply` asserts the stamp
 * — a worksheet missing it, or carrying a different value, is REJECTED
 * loudly rather than silently mis-read as this model.
 *
 * ============================================================================
 * The target shape (identical in both recipes; user-confirmed durations)
 * ============================================================================
 *   Cook spaghetti     2a/8p  stovetop  batch   spaghetti noodles dry -> spaghetti noodles cooked (transient)
 *   Cook meat          5a/0p  stovetop  batch   ground beef [stored]  -> ground beef browned (transient)
 *   Simmer meat sauce  1a/15p stovetop  batch   ground beef browned + marinara sauce -> meat sauce (transient)
 *   Combine all        2a/0p  none      batch   spaghetti noodles cooked + meat sauce + parmesan -> meat spaghetti stored [EXISTING]
 *
 * Total moves 8a/15p -> 10a/23p: the mega-step was UNDER-COUNTING active
 * time. Expected and accepted — the win is expressible overlap, not a
 * smaller number.
 *
 * `Combine all` REUSES the existing `create spaghetti` step id — the
 * maximum-edge-preservation choice (planning_findings #7): it keeps BOTH the
 * parmesan input edge AND the terminal `meat spaghetti stored` output edge.
 * Every other reuse choice keeps at most one of those two, and losing the
 * terminal edge would orphan the recipe's stored product.
 *
 * The 3 new products are GLOBAL — created once, shared by both recipes.
 * Every one is `transient` (per the user's ruling on the divergence
 * surfaced in the previous revision — mirrors `mushroom bourguignon
 * [transient]`, NOT `stored`) and MUST carry `canonical_unit`:
 * `lintMissingCanonicalUnit` has no type exemption, and the publish gate is
 * severity-blind (`RecipeEditor.tsx:767`), so omitting it makes BOTH
 * spaghetti recipes unpublishable. This script also bypasses
 * `planGraphWrites`' normalize-at-write boundary (`build-recipe-graph.ts:132`)
 * by writing PocketBase records directly, so it must write already-canonical
 * units itself (`cup`, matching `egg noodles cooked` / `mushrooms browned` /
 * `mushroom bourguignon`).
 *
 * Mirrors `scripts/audit-node-quantities.js`'s gated-write pattern: PB_URL
 * env defaulting to prod, dry-run unless `--apply`, superuser auth via
 * PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD (never printed), fmtError,
 * preflightValidate, `pb.backups.create()` before any mutation, a rollback
 * worksheet, worksheets under `dedup-output/`.
 *
 * UNLIKE the garlic/thyme sweeps, this write CREATES records (3 products, 3
 * steps + 3 nodes + 6 edges PER RECIPE), not just field updates — rollback
 * must DELETE those, children-before-parents (edges -> nodes -> steps ->
 * products), not just revert fields. See `--rollback` / `executeRollback`.
 *
 * Usage:
 *   node scripts/split-create-spaghetti-step.js                 # read-only report
 *   node scripts/split-create-spaghetti-step.js --apply          # write (worksheet must have confirmed:true)
 *   node scripts/split-create-spaghetti-step.js --rollback       # revert a completed --apply
 *   PB_URL=http://192.168.50.95:8091 node scripts/split-create-spaghetti-step.js [--apply|--rollback]
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same convention as audit-node-quantities.js: PB_URL lets this script be
// pointed at test (:8091) for the required rehearsal before the real prod
// run. Default stays prod.
const PB_URL = process.env.PB_URL || "http://192.168.50.95:8090";

const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const DRY_RUN = !APPLY && !ROLLBACK;

const pb = new PocketBase(PB_URL);

const OUTPUT_DIR = path.join(__dirname, "dedup-output");
const WORKSHEET_JSON_PATH = path.join(OUTPUT_DIR, "split-create-spaghetti.json");
const WORKSHEET_MD_PATH = path.join(OUTPUT_DIR, "split-create-spaghetti.md");
const ROLLBACK_PATH = path.join(OUTPUT_DIR, "split-create-spaghetti.rollback.json");

// Version stamp this worksheet is scoped to. `--apply` REJECTS any worksheet
// missing this or carrying a different value — this is what makes the
// deleted, superseded day-of-plate worksheet unusable rather than merely
// gone: if anyone somehow regenerates or hand-restores it without this
// stamp, apply refuses it (planning_findings #6).
const MODEL_VERSION = "batch-4step-v2";

// The two spaghetti recipes this delta is scoped to (planning_findings #5).
// Resolved by id, then the step is located by name and its SHAPE asserted
// before anything is proposed — if prod has moved again (it has once
// already, silently — planning_findings #1), this aborts loudly rather
// than forcing a stale delta.
const RECIPES = [
  { id: "5909e91t6vuet1c", label: "meat spaghetti" },
  { id: "b7jdp83pa09y4o7", label: "meat spaghetti (micah)" },
];

const STEP_NAME = "create spaghetti";
const EXPECTED_STEP_SHAPE = {
  step_type: "assembly",
  timing: "batch",
  active_minutes: 8,
  passive_minutes: 15,
  resource: "stovetop",
};

// Every input product this step is expected to consume, and what happens to
// its product->step edge in the split (planning_findings #7). Any OTHER
// input found aborts the report — this delta is only valid for exactly this
// shape.
//   - retarget: the edge's `target` field is repointed at a NEW step.
//   - preserve: left untouched — it keeps pointing at the reused step id
//     (which is renamed "Combine all" but never loses its identity).
const INPUT_ROLES = {
  "ground beef": { role: "retarget", newStepTempId: "step-cook-meat" },
  "marinara sauce": { role: "retarget", newStepTempId: "step-simmer-sauce" },
  "spaghetti noodles dry": { role: "retarget", newStepTempId: "step-cook-spaghetti" },
  "parmesan cheese": { role: "preserve" },
};

// The 3 new shared transient products (planning_findings #8). `cup` for all
// three, matching `egg noodles cooked` / `mushrooms browned` / `mushroom
// bourguignon` — the closer analog to the mixed-unit prod convention than
// `soba noodles cooked` (`oz`), and the quantity is 0 either way so this is
// low-stakes.
const NEW_PRODUCTS = [
  {
    tempId: "product-spaghetti-cooked",
    name: "spaghetti noodles cooked",
    type: "transient",
    canonical_unit: "cup",
    pantry: false,
    store: "",
  },
  {
    tempId: "product-beef-browned",
    name: "ground beef browned",
    type: "transient",
    canonical_unit: "cup",
    pantry: false,
    store: "",
  },
  {
    tempId: "product-meat-sauce",
    name: "meat sauce",
    type: "transient",
    canonical_unit: "cup",
    pantry: false,
    store: "",
  },
];

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

// ============================================================================
// Report phase (read-only)
// ============================================================================

async function assertNoExistingNewProducts() {
  for (const p of NEW_PRODUCTS) {
    const existing = await pb
      .collection("products")
      .getFullList({ filter: `name="${p.name}"` });
    if (existing.length > 0) {
      throw new Error(
        `A "${p.name}" product already exists (${existing
          .map((x) => x.id)
          .join(", ")}) — this script assumes it is creating this product ` +
          "for the first time. Either the split already ran, or something " +
          "else created it — investigate before proceeding."
      );
    }
  }
}

async function fetchStepByName(recipeId, name) {
  const steps = await pb
    .collection("recipe_steps")
    .getFullList({ filter: `recipe="${recipeId}" && name="${name}"` });
  if (steps.length !== 1) {
    throw new Error(
      `recipe ${recipeId}: expected exactly 1 step named "${name}", found ${steps.length}`
    );
  }
  return steps[0];
}

/**
 * Asserts the located step matches the exact shape this delta was computed
 * against (planning_findings #7). Prod has moved once already, silently
 * (planning_findings #1) — abort rather than propose a delta against a step
 * that has since changed. This is one half of the "assert the chain on
 * dry-run" requirement: the CURRENT (pre-split) chain shape.
 */
function assertStepShape(step, recipeId) {
  const mismatches = [];
  for (const [field, expected] of Object.entries(EXPECTED_STEP_SHAPE)) {
    if (step[field] !== expected) {
      mismatches.push(
        `${field}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(step[field])}`
      );
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      `recipe ${recipeId} step "${step.name}" (${step.id}) does not match the ` +
        "shape this delta was computed against (assembly/batch/8a/15p/stovetop) " +
        "— prod has moved again (it has once already, silently). Re-derive the " +
        `plan before proceeding; do not force this. Mismatches: ${mismatches.join("; ")}`
    );
  }
}

/** Fetches and classifies this step's product->step input edges by role
 * (retarget vs. preserve), asserting exactly the 4 expected inputs and
 * nothing else — an unexpected input means this recipe's shape has drifted
 * from planning_findings #7 and the delta must be re-derived. */
async function classifyInputs(step) {
  const edges = await pb
    .collection("product_to_step_edges")
    .getFullList({ filter: `target="${step.id}"` });

  const classified = [];
  for (const edge of edges) {
    const node = await pb
      .collection("recipe_product_nodes")
      .getOne(edge.source, { expand: "product" });
    const productName = node.expand?.product?.name ?? "(unknown)";
    const roleEntry = INPUT_ROLES[productName];
    if (!roleEntry) {
      throw new Error(
        `recipe ${step.recipe} step "${step.name}": unexpected input product ` +
          `"${productName}" (node ${node.id}, edge ${edge.id}) — this delta ` +
          "assumes exactly ground beef / marinara sauce / spaghetti noodles dry " +
          "/ parmesan cheese. Prod has moved; re-derive the plan."
      );
    }
    classified.push({ edge, node, productName, ...roleEntry });
  }

  for (const name of Object.keys(INPUT_ROLES)) {
    const count = classified.filter((c) => c.productName === name).length;
    if (count !== 1) {
      throw new Error(
        `recipe ${step.recipe} step "${step.name}": expected exactly 1 input ` +
          `edge for "${name}", found ${count}`
      );
    }
  }

  return {
    retarget: classified.filter((c) => c.role === "retarget"),
    preserve: classified.filter((c) => c.role === "preserve"),
  };
}

/** Fetches and asserts this step's single output (step->product) edge. */
async function classifyOutput(step) {
  const edges = await pb
    .collection("step_to_product_edges")
    .getFullList({ filter: `source="${step.id}"` });
  if (edges.length !== 1) {
    throw new Error(
      `recipe ${step.recipe} step "${step.name}": expected exactly 1 output edge, found ${edges.length}`
    );
  }
  const edge = edges[0];
  const node = await pb
    .collection("recipe_product_nodes")
    .getOne(edge.target, { expand: "product" });
  return { edge, node, productName: node.expand?.product?.name ?? "(unknown)" };
}

/**
 * Report phase — READ ONLY. Resolves both spaghetti recipes, asserts each
 * one's `create spaghetti` step matches the shape the delta was computed
 * against, then builds the full graph-delta worksheet: `confirmed: false`
 * at the top level, nothing applies until a human flips it AND stamps
 * `model: "batch-4step-v2"` is present.
 */
async function buildReport() {
  console.log("\n--- Building create-spaghetti split report (read-only) ---");
  await assertNoExistingNewProducts();

  const recipeEntries = [];
  for (const target of RECIPES) {
    const recipe = await pb.collection("recipes").getOne(target.id).catch(() => null);
    if (!recipe) {
      throw new Error(`recipe ${target.id} (${target.label}) not found — prod has moved; re-derive the plan.`);
    }
    const step = await fetchStepByName(target.id, STEP_NAME);
    assertStepShape(step, target.id);
    const inputs = await classifyInputs(step);
    const output = await classifyOutput(step);

    console.log(
      `  ${recipe.name} (${target.id}): step ${step.id} verified assembly/batch/8a/15p/stovetop`
    );
    console.log(
      `    pre-split chain OK: beef+marinara+noodles -> "${step.name}" <- parmesan; "${step.name}" -> ${output.productName}`
    );

    const beefEdge = inputs.retarget.find((r) => r.productName === "ground beef");
    const marinaraEdge = inputs.retarget.find((r) => r.productName === "marinara sauce");
    const noodleEdge = inputs.retarget.find((r) => r.productName === "spaghetti noodles dry");
    const parmesanEdge = inputs.preserve.find((r) => r.productName === "parmesan cheese");

    recipeEntries.push({
      recipeId: target.id,
      recipeName: recipe.name,
      // The reused step: renamed "Combine all", narrowed to 2a/0p/none,
      // stays `batch` — never was, and never becomes, day-of work.
      updateStep: {
        stepId: step.id,
        before: {
          name: step.name,
          instructions: step.instructions ?? "",
          active_minutes: step.active_minutes,
          passive_minutes: step.passive_minutes,
          resource: step.resource,
          timing: step.timing,
        },
        after: {
          name: "Combine all",
          instructions:
            "Combine the cooked spaghetti, meat sauce, and parmesan cheese together for storage.",
          active_minutes: 2,
          passive_minutes: 0,
          resource: "none",
          timing: "batch",
        },
      },
      createSteps: [
        {
          tempId: "step-cook-spaghetti",
          name: "Cook spaghetti",
          step_type: "assembly",
          timing: "batch",
          resource: "stovetop",
          active_minutes: 2,
          passive_minutes: 8,
          instructions: "Boil the spaghetti noodles until cooked.",
        },
        {
          tempId: "step-cook-meat",
          name: "Cook meat",
          step_type: "assembly",
          timing: "batch",
          resource: "stovetop",
          active_minutes: 5,
          passive_minutes: 0,
          instructions: "Brown the ground beef.",
        },
        {
          tempId: "step-simmer-sauce",
          name: "Simmer meat sauce",
          step_type: "assembly",
          timing: "batch",
          resource: "stovetop",
          active_minutes: 1,
          passive_minutes: 15,
          instructions:
            "Combine the browned ground beef with the marinara sauce and simmer.",
        },
      ],
      createNodes: [
        { tempId: "node-spaghetti-cooked", product: "product-spaghetti-cooked", quantity: 0, unit: "cup" },
        { tempId: "node-beef-browned", product: "product-beef-browned", quantity: 0, unit: "cup" },
        { tempId: "node-meat-sauce", product: "product-meat-sauce", quantity: 0, unit: "cup" },
      ],
      retargetEdges: [
        {
          edgeId: beefEdge.edge.id,
          collection: "product_to_step_edges",
          field: "target",
          productName: "ground beef",
          before: step.id,
          after: "step-cook-meat",
        },
        {
          edgeId: marinaraEdge.edge.id,
          collection: "product_to_step_edges",
          field: "target",
          productName: "marinara sauce",
          before: step.id,
          after: "step-simmer-sauce",
        },
        {
          edgeId: noodleEdge.edge.id,
          collection: "product_to_step_edges",
          field: "target",
          productName: "spaghetti noodles dry",
          before: step.id,
          after: "step-cook-spaghetti",
        },
      ],
      // The converging chain (planning_findings: "assert the full chain from
      // the EDGE RECORDS"). All 6 are load-bearing — a dropped edge here is
      // the exact silent-edge-drop failure this whole cluster is about.
      //   ground beef -> Cook meat -> ground beef browned -> Simmer meat sauce
      //     -> meat sauce -> Combine all -> meat spaghetti stored
      //   spaghetti noodles dry -> Cook spaghetti -> spaghetti noodles cooked
      //     -> Combine all
      createEdges: [
        {
          collection: "step_to_product_edges",
          source: "step-cook-spaghetti",
          target: "node-spaghetti-cooked",
          loadBearing: true,
          description: 'Cook spaghetti -> spaghetti noodles cooked',
        },
        {
          collection: "step_to_product_edges",
          source: "step-cook-meat",
          target: "node-beef-browned",
          loadBearing: true,
          description: 'Cook meat -> ground beef browned',
        },
        {
          collection: "step_to_product_edges",
          source: "step-simmer-sauce",
          target: "node-meat-sauce",
          loadBearing: true,
          description: 'Simmer meat sauce -> meat sauce',
        },
        {
          collection: "product_to_step_edges",
          source: "node-beef-browned",
          target: "step-simmer-sauce",
          loadBearing: true,
          description: 'ground beef browned -> Simmer meat sauce',
        },
        {
          collection: "product_to_step_edges",
          source: "node-meat-sauce",
          target: "updateStep",
          loadBearing: true,
          description: 'meat sauce -> Combine all',
        },
        {
          collection: "product_to_step_edges",
          source: "node-spaghetti-cooked",
          target: "updateStep",
          loadBearing: true,
          description: 'spaghetti noodles cooked -> Combine all',
        },
      ],
      // Considered and deliberately UNTOUCHED — recorded explicitly so a
      // reviewer can see they were considered, not overlooked
      // (planning_findings #7: reuse-as-Combine preserves two edges where
      // every alternative reuse preserves at most one).
      preserved: [
        {
          edgeId: parmesanEdge.edge.id,
          collection: "product_to_step_edges",
          productName: "parmesan cheese",
          description:
            'parmesan input stays targeting the reused step id (now named ' +
            '"Combine all") — max-edge-preservation reuse choice.',
        },
        {
          edgeId: output.edge.id,
          collection: "step_to_product_edges",
          productName: output.productName,
          description:
            `terminal "${output.productName}" output stays sourced from the ` +
            'reused step id (now "Combine all") — losing this edge would ' +
            "orphan the recipe's stored product.",
        },
      ],
    });
  }

  return {
    model: MODEL_VERSION,
    confirmed: false,
    generatedAt: new Date().toISOString(),
    sourceUrl: PB_URL,
    createProducts: NEW_PRODUCTS,
    recipes: recipeEntries,
  };
}

function renderMarkdown(worksheet) {
  const lines = [
    "# `create spaghetti` Split — Graph Delta Worksheet",
    "",
    `Model: **${worksheet.model}** — an unstamped or differently-stamped ` +
      "worksheet is the deleted, superseded day-of-plate model and `--apply` " +
      "will reject it.",
    `Generated: ${worksheet.generatedAt}`,
    `Source: ${worksheet.sourceUrl}`,
    "",
    `**confirmed: ${worksheet.confirmed}** — nothing applies until this is ` +
      "`true` in the JSON worksheet AND `--apply` is passed.",
    "",
    "## Why this shape (read before confirming)",
    "",
    "The user cooks the spaghetti on prep day and stores the dish combined " +
      "(interview 2026-07-17) — **there is no day-of work for this dish.** " +
      "All four steps below are `batch`. The split's only value is " +
      "granularity: one 8a/15p mega-step cannot express the 8-minute noodle " +
      "boil overlapping the 15-minute sauce simmer; four `batch` steps can, " +
      "and ONLY because `scheduler_config.burner_count` is 2 in prod — at " +
      "`burner_count: 1` this split would make the dish slower, not faster.",
    "",
    "Two things to note, not decide: total active time goes 8a -> 10a (the " +
      "mega-step was under-counting, expected); `Combine all` is proposed " +
      "`resource: none` — if you actually combine in the pot on a burner, " +
      "say so.",
    "",
    "## Shared products (created once, 3 total)",
    "",
    "| Field | " + worksheet.createProducts.map((p) => p.name).join(" | ") + " |",
    "|---|" + worksheet.createProducts.map(() => "---").join("|") + "|",
    "| type | " + worksheet.createProducts.map((p) => p.type).join(" | ") + " |",
    "| canonical_unit | " + worksheet.createProducts.map((p) => p.canonical_unit).join(" | ") + " |",
    "| pantry | " + worksheet.createProducts.map((p) => p.pantry).join(" | ") + " |",
    "",
  ];

  for (const r of worksheet.recipes) {
    lines.push(`## ${r.recipeName} (${r.recipeId})`, "");

    lines.push("### Step: reused (RENAME to Combine all, narrowed to 2a/0p/none)", "");
    lines.push("| Field | Before | After |");
    lines.push("|---|---|---|");
    for (const field of ["name", "instructions", "active_minutes", "passive_minutes", "resource", "timing"]) {
      lines.push(`| ${field} | ${r.updateStep.before[field]} | ${r.updateStep.after[field]} |`);
    }
    lines.push("");

    lines.push("### Steps: NEW (3, all `batch` — no day-of work for this dish)", "");
    for (const s of r.createSteps) {
      lines.push(
        `- **${s.name}** — ${s.step_type}/${s.timing}, ${s.active_minutes}a/${s.passive_minutes}p, resource: ${s.resource}`
      );
      lines.push(`  - ${s.instructions}`);
    }
    lines.push("");

    lines.push("### Nodes: NEW (3, this recipe, canonical `cup`)", "");
    for (const n of r.createNodes) {
      lines.push(`- ${n.product}: quantity ${n.quantity}, unit ${n.unit}`);
    }
    lines.push("");

    lines.push("### Edges retargeted (existing edge, `target` field changed)", "");
    lines.push("| Edge id | Product | Before -> After |");
    lines.push("|---|---|---|");
    for (const re of r.retargetEdges) {
      lines.push(`| ${re.edgeId} | ${re.productName} | ${re.before} -> ${re.after} |`);
    }
    lines.push("");

    lines.push("### Edges created (6, all load-bearing — the converging chain)", "");
    for (const ce of r.createEdges) {
      lines.push(`- ${ce.description}${ce.loadBearing ? " **[LOAD-BEARING]**" : ""}`);
    }
    lines.push("");

    lines.push("### Preserved — considered, deliberately untouched", "");
    for (const p of r.preserved) {
      lines.push(`- ${p.productName} (edge ${p.edgeId}): ${p.description}`);
    }
    lines.push("");
  }

  lines.push(
    "## Converging chain diagram (per recipe, identical structure)",
    "",
    "```",
    "ground beef [stored] --> Cook meat --> ground beef browned --> Simmer meat sauce",
    "                                                                       |",
    "                                                                       v",
    "marinara sauce [inventory] ------------------------------------> (consumed here)",
    "                                                                       |",
    "                                                                       v",
    "                                                                  meat sauce --> Combine all --> meat spaghetti stored [existing]",
    "                                                                                      ^",
    "                                                                                      |",
    "spaghetti noodles dry [inventory] --> Cook spaghetti --> spaghetti noodles cooked ----+",
    "                                                                                      ^",
    "                                                                                      |",
    "parmesan cheese [inventory] ---------------------------------------------------------+ (preserved, unchanged)",
    "```",
    ""
  );

  return lines.join("\n");
}

// ============================================================================
// Drift check — re-verifies live state against the worksheet's recorded
// "before" values. Runs on every reload of an existing worksheet (both dry
// run and --apply): "if the script aborts on drift, stop — prod has moved
// again and the delta must be re-derived, not forced."
// ============================================================================

async function verifyNoDrift(worksheet) {
  console.log(
    "\n--- Verifying live state matches the worksheet's recorded 'before' snapshot ---"
  );

  if (worksheet.model !== MODEL_VERSION) {
    throw new Error(
      `Worksheet model mismatch: expected "${MODEL_VERSION}", found ` +
        `${JSON.stringify(worksheet.model)}. This is either the deleted, ` +
        "superseded day-of-plate worksheet or an unrecognized model — " +
        "regenerate the report (delete the worksheet files and re-run " +
        "without --apply) rather than forcing an unstamped or mismatched one."
    );
  }

  for (const r of worksheet.recipes) {
    const step = await pb
      .collection("recipe_steps")
      .getOne(r.updateStep.stepId)
      .catch(() => null);
    if (!step) {
      throw new Error(
        `DRIFT: step ${r.updateStep.stepId} (recipe ${r.recipeId}) no longer exists.`
      );
    }
    const before = r.updateStep.before;
    const mismatches = [];
    for (const field of ["name", "instructions", "active_minutes", "passive_minutes", "resource", "timing"]) {
      const liveValue = field === "instructions" ? step.instructions ?? "" : step[field];
      if (liveValue !== before[field]) {
        mismatches.push(`${field}: recorded ${JSON.stringify(before[field])}, live ${JSON.stringify(liveValue)}`);
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `DRIFT on step ${step.id} (recipe ${r.recipeId}) — prod has moved since ` +
          `this worksheet was generated. Re-derive, do not force. Mismatches: ${mismatches.join("; ")}`
      );
    }

    for (const re of r.retargetEdges) {
      const edge = await pb.collection(re.collection).getOne(re.edgeId).catch(() => null);
      if (!edge) {
        throw new Error(`DRIFT: edge ${re.edgeId} (${re.collection}) no longer exists.`);
      }
      if (edge[re.field] !== re.before) {
        throw new Error(
          `DRIFT on edge ${re.edgeId} (${re.collection}.${re.field}): recorded ` +
            `before=${JSON.stringify(re.before)}, live=${JSON.stringify(edge[re.field])}. Re-derive, do not force.`
        );
      }
    }

    for (const p of r.preserved) {
      const edge = await pb.collection(p.collection).getOne(p.edgeId).catch(() => null);
      if (!edge) {
        throw new Error(
          `DRIFT: preserved edge ${p.edgeId} (${p.collection}) for ${p.productName} no longer exists.`
        );
      }
    }
  }

  for (const p of worksheet.createProducts) {
    const existing = await pb.collection("products").getFullList({ filter: `name="${p.name}"` });
    if (existing.length > 0) {
      throw new Error(
        `DRIFT: a "${p.name}" product already exists (${existing.map((x) => x.id).join(", ")}) ` +
          "— either this split already ran, or something else created it. Investigate before proceeding."
      );
    }
  }

  console.log("  No drift detected — live state matches every recorded 'before' value.");
}

// ============================================================================
// Pre-flight validation (mirrors audit-node-quantities.js's preflightValidate)
// ============================================================================

function preflightValidate(worksheet) {
  console.log("\n--- Pre-flight validation ---");
  const errors = [];

  if (worksheet.model !== MODEL_VERSION) {
    errors.push(
      `worksheet.model must be "${MODEL_VERSION}", found ${JSON.stringify(worksheet.model)} ` +
        "— refusing to apply a worksheet that isn't stamped for this model"
    );
  }
  if (worksheet.confirmed !== true) {
    errors.push("top-level confirmed must be true before --apply");
  }

  const products = worksheet.createProducts ?? [];
  if (products.length !== 3) {
    errors.push(`expected 3 new transient products, found ${products.length}`);
  }
  for (const p of products) {
    if (p.type !== "transient") {
      errors.push(`${p.name}: must be type "transient" per the user's ruling`);
    }
    if (!p.canonical_unit) {
      // Omitting this makes both spaghetti recipes unpublishable —
      // lintMissingCanonicalUnit has no type exemption (planning_findings #8).
      errors.push(
        `${p.name}: canonical_unit is required — omitting it makes both ` +
          "spaghetti recipes unpublishable"
      );
    }
  }

  for (const r of worksheet.recipes ?? []) {
    for (const field of ["updateStep", "createSteps", "createNodes", "retargetEdges", "createEdges", "preserved"]) {
      if (!r[field]) errors.push(`recipe ${r.recipeId}: missing ${field}`);
    }
    if (r.updateStep?.after?.name !== "Combine all") {
      errors.push(`recipe ${r.recipeId}: reused step must become "Combine all"`);
    }
    const allTimedSteps = [...(r.createSteps ?? []), r.updateStep?.after].filter(Boolean);
    for (const s of allTimedSteps) {
      if (s.timing !== "batch") {
        errors.push(
          `recipe ${r.recipeId}: "${s.name}" must be timing "batch" — there is no day-of work for this dish`
        );
      }
    }
    if ((r.createSteps ?? []).length !== 3) {
      errors.push(`recipe ${r.recipeId}: expected 3 new steps, found ${(r.createSteps ?? []).length}`);
    }
    if ((r.retargetEdges ?? []).length !== 3) {
      errors.push(`recipe ${r.recipeId}: expected 3 retargeted edges, found ${(r.retargetEdges ?? []).length}`);
    }
    if ((r.createEdges ?? []).length !== 6) {
      errors.push(`recipe ${r.recipeId}: expected 6 new edges, found ${(r.createEdges ?? []).length}`);
    }
    if ((r.createEdges ?? []).some((e) => !e.loadBearing)) {
      errors.push(`recipe ${r.recipeId}: every new edge in the converging chain must be marked loadBearing`);
    }
    if ((r.preserved ?? []).length !== 2) {
      errors.push(`recipe ${r.recipeId}: expected 2 preserved edges (parmesan input + stored output), found ${(r.preserved ?? []).length}`);
    }

    const durations = [
      ["updateStep.after.active_minutes", r.updateStep?.after?.active_minutes],
      ["updateStep.after.passive_minutes", r.updateStep?.after?.passive_minutes],
      ...(r.createSteps ?? []).flatMap((s) => [
        [`createSteps[${s.name}].active_minutes`, s.active_minutes],
        [`createSteps[${s.name}].passive_minutes`, s.passive_minutes],
      ]),
    ];
    for (const [label, value] of durations) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`recipe ${r.recipeId}: ${label} is not a finite number >= 0 (${JSON.stringify(value)})`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("\n  Pre-flight validation FAILED:");
    errors.forEach((e) => console.error(`    - ${e}`));
    throw new Error(`Pre-flight validation failed with ${errors.length} error(s) — aborting before any mutation`);
  }
  console.log("  Worksheet passed pre-flight validation");
}

// ============================================================================
// Backup + apply
// ============================================================================

async function backupBeforeApply() {
  console.log("\n--- Creating pre-apply backup ---");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const basename = `pre-split-create-spaghetti-${stamp}.zip`;
  const ok = await pb.backups.create(basename);
  if (!ok) {
    throw new Error("pb.backups.create() did not confirm success — aborting before any mutation");
  }
  console.log(`  Backup created: ${basename}`);
  return basename;
}

function writeRollback(rollback) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(ROLLBACK_PATH, JSON.stringify(rollback, null, 2));
}

/**
 * Writes in dependency order: products (global) -> per recipe: step update ->
 * new steps -> new nodes -> retargeted edges -> new edges. The rollback
 * worksheet is written to disk incrementally, after EVERY successful
 * create/update — so if the run dies partway, whatever landed is still fully
 * recoverable, not just whatever the script intended to do.
 */
async function applyWorksheet(worksheet, backupId) {
  const rollback = {
    backupId,
    appliedAt: new Date().toISOString(),
    model: MODEL_VERSION,
    // Deletes must run children -> parents: edges, then nodes, then steps,
    // then products (planning_findings: "rollback must cover CREATES").
    createdEdges: [],
    createdNodes: [],
    createdSteps: [],
    createdProducts: [],
    // Reverts: restore these BEFORE values (not deletes).
    updatedSteps: [],
    retargetedEdges: [],
  };
  writeRollback(rollback); // skeleton on disk before the first real write

  console.log("\n--- Applying: create shared products (global, once) ---");
  const productIdByTempId = {};
  for (const p of worksheet.createProducts) {
    const created = await pb.collection("products").create({
      name: p.name,
      type: p.type,
      canonical_unit: p.canonical_unit,
      pantry: p.pantry,
      store: p.store ?? "",
    });
    productIdByTempId[p.tempId] = created.id;
    rollback.createdProducts.push({ collection: "products", id: created.id });
    writeRollback(rollback);
    console.log(`  product created: ${created.id} "${created.name}"`);
  }

  for (const r of worksheet.recipes) {
    console.log(`\n--- Applying: ${r.recipeName} (${r.recipeId}) ---`);

    // Resolves a tempId reference to its real record id. "updateStep" is a
    // special sentinel meaning "the reused step" (its id never changes —
    // only its fields do).
    const stepIdByTempId = { updateStep: r.updateStep.stepId };
    const nodeIdByTempId = {};

    const stepBefore = await pb.collection("recipe_steps").getOne(r.updateStep.stepId);
    await pb.collection("recipe_steps").update(r.updateStep.stepId, r.updateStep.after);
    rollback.updatedSteps.push({
      stepId: r.updateStep.stepId,
      before: {
        name: stepBefore.name,
        instructions: stepBefore.instructions ?? "",
        active_minutes: stepBefore.active_minutes,
        passive_minutes: stepBefore.passive_minutes,
        resource: stepBefore.resource,
        timing: stepBefore.timing,
      },
    });
    writeRollback(rollback);
    console.log(`  step ${r.updateStep.stepId} renamed -> "${r.updateStep.after.name}"`);

    for (const s of r.createSteps) {
      const newStep = await pb.collection("recipe_steps").create({
        recipe: r.recipeId,
        name: s.name,
        step_type: s.step_type,
        timing: s.timing,
        resource: s.resource,
        active_minutes: s.active_minutes,
        passive_minutes: s.passive_minutes,
        instructions: s.instructions,
      });
      stepIdByTempId[s.tempId] = newStep.id;
      rollback.createdSteps.push({ collection: "recipe_steps", id: newStep.id });
      writeRollback(rollback);
      console.log(`  new step created: ${newStep.id} "${newStep.name}"`);
    }

    for (const n of r.createNodes) {
      const productId = productIdByTempId[n.product];
      const newNode = await pb.collection("recipe_product_nodes").create({
        recipe: r.recipeId,
        product: productId,
        quantity: n.quantity,
        unit: n.unit,
      });
      nodeIdByTempId[n.tempId] = newNode.id;
      rollback.createdNodes.push({ collection: "recipe_product_nodes", id: newNode.id });
      writeRollback(rollback);
      console.log(`  new node created: ${newNode.id} (product ${productId}, ${n.quantity} ${n.unit})`);
    }

    for (const re of r.retargetEdges) {
      const edgeBefore = await pb.collection(re.collection).getOne(re.edgeId);
      const newTargetId = stepIdByTempId[re.after];
      await pb.collection(re.collection).update(re.edgeId, { [re.field]: newTargetId });
      rollback.retargetedEdges.push({
        edgeId: re.edgeId,
        collection: re.collection,
        field: re.field,
        before: edgeBefore[re.field],
      });
      writeRollback(rollback);
      console.log(
        `  edge ${re.edgeId} (${re.collection}.${re.field}) retargeted -> ${newTargetId} [${re.productName}]`
      );
    }

    for (const ce of r.createEdges) {
      const sourceId = ce.source in nodeIdByTempId ? nodeIdByTempId[ce.source] : stepIdByTempId[ce.source];
      const targetId = ce.target in nodeIdByTempId ? nodeIdByTempId[ce.target] : stepIdByTempId[ce.target];
      if (!sourceId || !targetId) {
        throw new Error(
          `Cannot resolve edge ${ce.description}: source=${ce.source}->${sourceId}, target=${ce.target}->${targetId}`
        );
      }
      const newEdge = await pb.collection(ce.collection).create({
        recipe: r.recipeId,
        source: sourceId,
        target: targetId,
      });
      rollback.createdEdges.push({ collection: ce.collection, id: newEdge.id });
      writeRollback(rollback);
      console.log(`  new edge (LOAD-BEARING): ${ce.description} (${newEdge.id})`);
    }

    await assertFullChainFromLiveEdges(r, { stepIdByTempId, nodeIdByTempId, productIdByTempId });
  }

  console.log(`\n  Rollback worksheet: ${ROLLBACK_PATH}`);
  return rollback;
}

/**
 * Post-apply chain assertion (both rehearsal and real apply). Walks the
 * chain from the RECIPE'S ACTUAL EDGE RECORDS — not from the worksheet's
 * intentions — and fails loudly if any hop is missing. This is the
 * highest-risk part of the whole task: a 4-step converging graph has six
 * new edges (plus 3 retargets) where the old 2-step model had two, and a
 * dropped edge here is the exact silent-edge-drop failure this cluster is
 * about.
 */
async function assertFullChainFromLiveEdges(r, ids) {
  console.log(`  --- asserting full converging chain from live edge records (${r.recipeId}) ---`);

  async function assertProductToStep(sourceNodeId, targetStepId, label) {
    const edges = await pb
      .collection("product_to_step_edges")
      .getFullList({ filter: `source="${sourceNodeId}" && target="${targetStepId}"` });
    if (edges.length !== 1) {
      throw new Error(`CHAIN BROKEN: expected exactly 1 product->step edge for ${label}, found ${edges.length}`);
    }
  }
  async function assertStepToProduct(sourceStepId, targetNodeId, label) {
    const edges = await pb
      .collection("step_to_product_edges")
      .getFullList({ filter: `source="${sourceStepId}" && target="${targetNodeId}"` });
    if (edges.length !== 1) {
      throw new Error(`CHAIN BROKEN: expected exactly 1 step->product edge for ${label}, found ${edges.length}`);
    }
  }

  const cookSpaghettiId = ids.stepIdByTempId["step-cook-spaghetti"];
  const cookMeatId = ids.stepIdByTempId["step-cook-meat"];
  const simmerId = ids.stepIdByTempId["step-simmer-sauce"];
  const combineId = ids.stepIdByTempId["updateStep"];
  const nodeSpaghettiCooked = ids.nodeIdByTempId["node-spaghetti-cooked"];
  const nodeBeefBrowned = ids.nodeIdByTempId["node-beef-browned"];
  const nodeMeatSauce = ids.nodeIdByTempId["node-meat-sauce"];

  // Meat chain: ground beef -> Cook meat -> ground beef browned -> Simmer
  // meat sauce -> meat sauce -> Combine all -> meat spaghetti stored
  const beefRetarget = r.retargetEdges.find((e) => e.productName === "ground beef");
  const marinaraRetarget = r.retargetEdges.find((e) => e.productName === "marinara sauce");
  const noodleRetarget = r.retargetEdges.find((e) => e.productName === "spaghetti noodles dry");
  const beefEdge = await pb.collection("product_to_step_edges").getOne(beefRetarget.edgeId);
  if (beefEdge.target !== cookMeatId) throw new Error("CHAIN BROKEN: ground beef edge did not retarget to Cook meat");
  await assertStepToProduct(cookMeatId, nodeBeefBrowned, "Cook meat -> ground beef browned");
  await assertProductToStep(nodeBeefBrowned, simmerId, "ground beef browned -> Simmer meat sauce");
  const marinaraEdge = await pb.collection("product_to_step_edges").getOne(marinaraRetarget.edgeId);
  if (marinaraEdge.target !== simmerId) throw new Error("CHAIN BROKEN: marinara edge did not retarget to Simmer meat sauce");
  await assertStepToProduct(simmerId, nodeMeatSauce, "Simmer meat sauce -> meat sauce");
  await assertProductToStep(nodeMeatSauce, combineId, "meat sauce -> Combine all");

  // Spaghetti chain: spaghetti noodles dry -> Cook spaghetti -> spaghetti
  // noodles cooked -> Combine all
  const noodleEdge = await pb.collection("product_to_step_edges").getOne(noodleRetarget.edgeId);
  if (noodleEdge.target !== cookSpaghettiId) throw new Error("CHAIN BROKEN: noodle edge did not retarget to Cook spaghetti");
  await assertStepToProduct(cookSpaghettiId, nodeSpaghettiCooked, "Cook spaghetti -> spaghetti noodles cooked");
  await assertProductToStep(nodeSpaghettiCooked, combineId, "spaghetti noodles cooked -> Combine all");

  // Preserved edges: parmesan input + terminal stored output, both still
  // targeting/sourced-from the reused (now "Combine all") step id.
  for (const p of r.preserved) {
    const edge = await pb.collection(p.collection).getOne(p.edgeId);
    const stillIntact = p.collection === "product_to_step_edges" ? edge.target === combineId : edge.source === combineId;
    if (!stillIntact) {
      throw new Error(`CHAIN BROKEN: preserved edge for ${p.productName} no longer references Combine all`);
    }
  }

  console.log("  Full converging chain verified intact from live edge records.");
}

// ============================================================================
// Rollback — deletes created records children-before-parents (edges -> nodes
// -> steps -> products), same constraint sync-to-test.js documents for
// PocketBase relation deletes. Reverts (retargeted edges, renamed steps) run
// FIRST, so no created record is still referenced when it is deleted.
// ============================================================================

async function executeRollback() {
  if (!fs.existsSync(ROLLBACK_PATH)) {
    throw new Error(`No rollback worksheet found at ${ROLLBACK_PATH} — nothing to roll back.`);
  }
  const rollback = JSON.parse(fs.readFileSync(ROLLBACK_PATH, "utf-8"));
  console.log(`\n--- Rolling back split-create-spaghetti (backup id was: ${rollback.backupId}) ---`);

  await authenticateSuperuser();

  for (const re of rollback.retargetedEdges ?? []) {
    await pb.collection(re.collection).update(re.edgeId, { [re.field]: re.before });
    console.log(`  reverted edge ${re.edgeId} (${re.collection}.${re.field}) -> ${re.before}`);
  }

  for (const us of rollback.updatedSteps ?? []) {
    await pb.collection("recipe_steps").update(us.stepId, us.before);
    console.log(`  reverted step ${us.stepId} -> "${us.before.name}"`);
  }

  for (const e of rollback.createdEdges ?? []) {
    await pb.collection(e.collection).delete(e.id);
    console.log(`  deleted created edge ${e.collection}/${e.id}`);
  }

  for (const n of rollback.createdNodes ?? []) {
    await pb.collection(n.collection).delete(n.id);
    console.log(`  deleted created node ${n.collection}/${n.id}`);
  }

  for (const s of rollback.createdSteps ?? []) {
    await pb.collection(s.collection).delete(s.id);
    console.log(`  deleted created step ${s.collection}/${s.id}`);
  }

  for (const p of rollback.createdProducts ?? []) {
    await pb.collection(p.collection).delete(p.id);
    console.log(`  deleted created product ${p.collection}/${p.id}`);
  }

  console.log("\n✅ ROLLBACK COMPLETE — graph restored to its pre-split shape.");
}

// ============================================================================
// main
// ============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("SPLIT CREATE-SPAGHETTI STEP (4-step all-batch model)");
  console.log(`Target: ${PB_URL}`);
  console.log(`Worksheet: ${WORKSHEET_JSON_PATH}`);
  console.log(
    `Mode: ${
      ROLLBACK
        ? "ROLLBACK"
        : APPLY
          ? "APPLY (writing changes)"
          : "DRY RUN (no writes — pass --apply to mutate, --rollback to revert)"
    }`
  );
  console.log("=".repeat(80));

  if (ROLLBACK) {
    await executeRollback();
    return;
  }

  const worksheetExists = fs.existsSync(WORKSHEET_JSON_PATH);
  if (APPLY && !worksheetExists) {
    throw new Error(
      `--apply requires an existing worksheet at ${WORKSHEET_JSON_PATH} — run ` +
        "without --apply first to generate the read-only report, get it " +
        "human-confirmed, then re-run with --apply."
    );
  }

  let worksheet;
  if (worksheetExists) {
    console.log(`\nLoading existing worksheet: ${WORKSHEET_JSON_PATH}`);
    worksheet = JSON.parse(fs.readFileSync(WORKSHEET_JSON_PATH, "utf-8"));
    await verifyNoDrift(worksheet);
  } else {
    worksheet = await buildReport();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(WORKSHEET_JSON_PATH, JSON.stringify(worksheet, null, 2));
    fs.writeFileSync(WORKSHEET_MD_PATH, renderMarkdown(worksheet));
    console.log(`\n  Worksheet written: ${WORKSHEET_JSON_PATH}`);
    console.log(`  Markdown report written: ${WORKSHEET_MD_PATH}`);
  }

  console.log(`\n--- ${APPLY ? "" : "[dry-run] "}Planned graph delta (model: ${worksheet.model}) ---`);
  console.log(`  CREATE ${worksheet.createProducts.length} shared products: ${worksheet.createProducts.map((p) => p.name).join(", ")}`);
  for (const r of worksheet.recipes) {
    console.log(`  ${r.recipeName} (${r.recipeId}):`);
    console.log(
      `    UPDATE step ${r.updateStep.stepId}: "${r.updateStep.before.name}" -> ` +
        `"${r.updateStep.after.name}" (${r.updateStep.after.active_minutes}a/` +
        `${r.updateStep.after.passive_minutes}p, resource=${r.updateStep.after.resource}, ${r.updateStep.after.timing})`
    );
    for (const s of r.createSteps) {
      console.log(`    CREATE step: "${s.name}" (${s.active_minutes}a/${s.passive_minutes}p, ${s.timing}, ${s.resource})`);
    }
    console.log(`    CREATE ${r.createNodes.length} nodes for the new products (qty 0, unit cup)`);
    for (const re of r.retargetEdges) {
      console.log(`    RETARGET edge ${re.edgeId} (${re.productName}) -> ${re.after}`);
    }
    for (const ce of r.createEdges) {
      console.log(`    CREATE edge: ${ce.description}`);
    }
    for (const p of r.preserved) {
      console.log(`    PRESERVE: ${p.productName} — ${p.description}`);
    }
  }

  if (!APPLY) {
    console.log(`\n  confirmed: ${worksheet.confirmed}`);
    console.log(
      "\nDry run complete. Set confirmed:true in the worksheet, then re-run with --apply to write these changes."
    );
    return;
  }

  preflightValidate(worksheet);
  await authenticateSuperuser();
  const backupId = await backupBeforeApply();
  console.log(`\n  Backup id: ${backupId}`);
  await applyWorksheet(worksheet, backupId);

  console.log("\n" + "=".repeat(80));
  console.log("✅ APPLY COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("\n❌ SPLIT CREATE-SPAGHETTI STEP FAILED:", fmtError(e));
  process.exit(1);
});
