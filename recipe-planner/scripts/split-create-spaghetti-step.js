import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";

/**
 * Report + gated-apply script for the `create spaghetti` split (quick task
 * 260716-u4p). `create spaghetti` (8a/15p, assembly/batch, stovetop) was
 * retagged `batch` WHOLESALE rather than split, so the app schedules
 * boiling noodles, plating and parmesan for Saturday — invisible became
 * wrongly-scheduled, not fixed. This script splits it into a `batch` sauce
 * step (reused step id, renamed) plus a NEW `just_in_time` plate step, in
 * BOTH spaghetti recipes, sharing one new `meat sauce` product.
 *
 * Mirrors `scripts/audit-node-quantities.js`'s gated-write pattern: PB_URL
 * env defaulting to prod, dry-run unless `--apply`, superuser auth via
 * PB_SUPERUSER_EMAIL/PB_SUPERUSER_PASSWORD (never printed), fmtError,
 * preflightValidate, `pb.backups.create()` before any mutation, a rollback
 * worksheet, worksheets under `dedup-output/`.
 *
 * UNLIKE the garlic/thyme sweeps, this write CREATES records (a product, 2
 * steps, 2 nodes, 4 edges per the full split), not just field updates —
 * rollback must DELETE those, not only revert fields. See `--rollback`
 * below, and the module doc on `executeRollback` for the children-before-
 * parents delete order this requires.
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

// The two spaghetti recipes this delta is scoped to (planning_findings #4).
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
// its product->step edge in the split. Any OTHER input found aborts the
// report — this delta is only valid for exactly this shape.
const INPUT_ROLES = {
  "ground beef": "keep",
  "marinara sauce": "keep",
  "spaghetti noodles dry": "retarget",
  "parmesan cheese": "retarget",
};

const NEW_PRODUCT_NAME = "meat sauce";
// Mirrors tahini sauce (7263w152yj3fher): stored/cup/fridge/large-ramekin.
// See planning_findings #5 — this diverges from the bourguignon reference,
// which models its own make-ahead sauce as transient. Surfaced as a
// judgement call in the worksheet for human confirmation, not resolved here.
const LARGE_RAMEKIN_CONTAINER_TYPE_ID = "b387fv2f026m2up";

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

async function assertNoExistingMeatSauceProduct() {
  const existing = await pb
    .collection("products")
    .getFullList({ filter: `name="${NEW_PRODUCT_NAME}"` });
  if (existing.length > 0) {
    throw new Error(
      `A "${NEW_PRODUCT_NAME}" product already exists (${existing
        .map((p) => p.id)
        .join(", ")}) — this script assumes it is creating this product for ` +
        "the first time. Either the split already ran, or something else " +
        "created it — investigate before proceeding."
    );
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
 * against (planning_findings #4). Prod has moved once already, silently
 * (planning_findings #1) — abort rather than propose a delta against a step
 * that has since changed.
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
 * (keep vs. retarget), asserting exactly the 4 expected inputs and nothing
 * else — an unexpected input means this recipe's shape has drifted from
 * planning_findings #4 and the delta must be re-derived. */
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
    const role = INPUT_ROLES[productName];
    if (!role) {
      throw new Error(
        `recipe ${step.recipe} step "${step.name}": unexpected input product ` +
          `"${productName}" (node ${node.id}, edge ${edge.id}) — this delta ` +
          "assumes exactly ground beef / marinara sauce / spaghetti noodles dry " +
          "/ parmesan cheese. Prod has moved; re-derive the plan."
      );
    }
    classified.push({ edge, node, productName, role });
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
    keep: classified.filter((c) => c.role === "keep"),
    retarget: classified.filter((c) => c.role === "retarget"),
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
 * at the top level, nothing applies until a human flips it.
 */
async function buildReport() {
  console.log("\n--- Building create-spaghetti split report (read-only) ---");
  await assertNoExistingMeatSauceProduct();

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

    const noodleEdge = inputs.retarget.find((r) => r.productName === "spaghetti noodles dry");
    const parmesanEdge = inputs.retarget.find((r) => r.productName === "parmesan cheese");

    recipeEntries.push({
      recipeId: target.id,
      recipeName: recipe.name,
      updateStep: {
        stepId: step.id,
        before: {
          name: step.name,
          instructions: step.instructions ?? "",
          active_minutes: step.active_minutes,
          passive_minutes: step.passive_minutes,
          timing: step.timing,
        },
        after: {
          name: "Simmer meat sauce",
          instructions:
            "Brown the ground beef, then combine with the marinara sauce and simmer.",
          active_minutes: 6,
          passive_minutes: 15,
          timing: "batch",
        },
      },
      createStep: {
        tempId: "new-plate-step",
        name: "Boil spaghetti and plate",
        step_type: "assembly",
        timing: "just_in_time",
        resource: "stovetop",
        active_minutes: 2,
        passive_minutes: 8,
        instructions:
          "Boil the spaghetti noodles, plate with the meat sauce, and top with parmesan.",
      },
      createNode: {
        tempId: "new-sauce-node",
        product: "meat-sauce-product", // resolved to the real product id on apply
        quantity: 0,
        unit: "cup", // canonical, matching createProduct.canonical_unit (planning_findings #6)
      },
      retargetEdges: [
        {
          edgeId: noodleEdge.edge.id,
          collection: "product_to_step_edges",
          field: "target",
          productName: "spaghetti noodles dry",
          before: step.id,
          after: "new-plate-step",
        },
        {
          edgeId: parmesanEdge.edge.id,
          collection: "product_to_step_edges",
          field: "target",
          productName: "parmesan cheese",
          before: step.id,
          after: "new-plate-step",
        },
        {
          edgeId: output.edge.id,
          collection: "step_to_product_edges",
          field: "source",
          productName: output.productName,
          before: step.id,
          after: "new-plate-step",
        },
      ],
      createEdges: [
        {
          collection: "step_to_product_edges",
          source: "updateStep",
          target: "new-sauce-node",
          loadBearing: false,
          description: '"Simmer meat sauce" -> meat sauce node',
        },
        {
          collection: "product_to_step_edges",
          source: "new-sauce-node",
          target: "new-plate-step",
          loadBearing: true,
          description:
            'meat sauce node -> "Boil spaghetti and plate" (LOAD-BEARING: without ' +
            "this edge the plate step has no dependency on its sauce — the exact " +
            "silent-edge-drop failure this whole cluster is about)",
        },
      ],
      keptInputs: inputs.keep.map((k) => ({ edgeId: k.edge.id, productName: k.productName })),
    });
  }

  return {
    confirmed: false,
    generatedAt: new Date().toISOString(),
    sourceUrl: PB_URL,
    // D-08: surfaced explicitly, not resolved silently. A human rules on
    // both at the checkpoint before flipping `confirmed`.
    judgementCalls: {
      durationApportionment: {
        description:
          "The source is one 8a/15p step; the data cannot say how it divides. " +
          "Proposed sauce 6a/15p + plate 2a/8p, mirroring bourguignon's " +
          "Cook egg noodles (2a/8p). Change it in updateStep.after / createStep " +
          "if you disagree.",
        proposal: {
          sauce: { active_minutes: 6, passive_minutes: 15 },
          plate: { active_minutes: 2, passive_minutes: 8 },
        },
      },
      meatSauceProductType: {
        description:
          "Proposed `stored` (per the todo's wording and the tahini sauce " +
          "precedent: stored/cup/fridge/large-ramekin). Diverges from the " +
          "bourguignon reference, which models its own make-ahead sauce as " +
          "`transient`. `stored` is the more capable choice: week-graph.ts pass " +
          "(3) only fans in cross-recipe edges for stored/inventory, so a stored " +
          "sauce could later be produced once and consumed by both spaghetti " +
          "recipes. determineStorageLocation returns Fridge either way.",
        proposal: "stored",
        alternative:
          "transient (bourguignon's own make-ahead sauce models this way — " +
          "arguably a mis-model, since a transient reads as a within-session " +
          "intermediate while this sauce sits in the fridge for days)",
      },
    },
    createProduct: {
      tempId: "meat-sauce-product",
      name: NEW_PRODUCT_NAME,
      type: "stored",
      canonical_unit: "cup",
      storage_location: "fridge",
      container_type: LARGE_RAMEKIN_CONTAINER_TYPE_ID,
      pantry: false,
      store: "",
    },
    recipes: recipeEntries,
  };
}

function renderMarkdown(worksheet) {
  const lines = [
    "# `create spaghetti` Split — Graph Delta Worksheet",
    "",
    `Generated: ${worksheet.generatedAt}`,
    `Source: ${worksheet.sourceUrl}`,
    "",
    `**confirmed: ${worksheet.confirmed}** — nothing applies until this is ` +
      "`true` in the JSON worksheet AND `--apply` is passed.",
    "",
    "## Judgement calls — read these before confirming",
    "",
    "### 1. Duration apportionment",
    worksheet.judgementCalls.durationApportionment.description,
    `Proposal: sauce ${worksheet.judgementCalls.durationApportionment.proposal.sauce.active_minutes}a/` +
      `${worksheet.judgementCalls.durationApportionment.proposal.sauce.passive_minutes}p, plate ` +
      `${worksheet.judgementCalls.durationApportionment.proposal.plate.active_minutes}a/` +
      `${worksheet.judgementCalls.durationApportionment.proposal.plate.passive_minutes}p`,
    "",
    "### 2. `meat sauce` product type",
    worksheet.judgementCalls.meatSauceProductType.description,
    `Proposal: ${worksheet.judgementCalls.meatSauceProductType.proposal}`,
    `Alternative: ${worksheet.judgementCalls.meatSauceProductType.alternative}`,
    "",
    "## Shared product (created once)",
    "",
    `| Field | Value |`,
    `|---|---|`,
    ...Object.entries(worksheet.createProduct)
      .filter(([k]) => k !== "tempId")
      .map(([k, v]) => `| ${k} | ${v} |`),
    "",
  ];

  for (const r of worksheet.recipes) {
    lines.push(`## ${r.recipeName} (${r.recipeId})`, "");
    lines.push("### Step: reused (RENAME + narrow)", "");
    lines.push("| Field | Before | After |");
    lines.push("|---|---|---|");
    for (const field of ["name", "instructions", "active_minutes", "passive_minutes", "timing"]) {
      lines.push(
        `| ${field} | ${r.updateStep.before[field]} | ${r.updateStep.after[field]} |`
      );
    }
    lines.push("");

    lines.push("### Step: NEW (day-of plate step)", "");
    lines.push(
      `- **${r.createStep.name}** — ${r.createStep.step_type}/${r.createStep.timing}, ` +
        `${r.createStep.active_minutes}a/${r.createStep.passive_minutes}p, resource: ${r.createStep.resource}`
    );
    lines.push(`  - ${r.createStep.instructions}`, "");

    lines.push("### Node: NEW (meat sauce, this recipe)", "");
    lines.push(`- quantity ${r.createNode.quantity}, unit ${r.createNode.unit}`, "");

    lines.push("### Edges retargeted (existing edge, field changed)", "");
    lines.push("| Edge id | Collection | Field | Product | Before -> After |");
    lines.push("|---|---|---|---|---|");
    for (const re of r.retargetEdges) {
      lines.push(
        `| ${re.edgeId} | ${re.collection} | ${re.field} | ${re.productName} | ${re.before} -> [new plate step] |`
      );
    }
    lines.push("");

    lines.push("### Edges created", "");
    for (const ce of r.createEdges) {
      lines.push(`- ${ce.description}${ce.loadBearing ? " **[LOAD-BEARING]**" : ""}`);
    }
    lines.push("");

    lines.push("### Inputs kept unchanged (for reference)", "");
    for (const k of r.keptInputs) {
      lines.push(`- ${k.productName} (edge ${k.edgeId})`);
    }
    lines.push("");
  }

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
    for (const field of ["name", "instructions", "active_minutes", "passive_minutes", "timing"]) {
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
  }

  const existingProduct = await pb
    .collection("products")
    .getFullList({ filter: `name="${worksheet.createProduct.name}"` });
  if (existingProduct.length > 0) {
    throw new Error(
      `DRIFT: a "${worksheet.createProduct.name}" product already exists ` +
        `(${existingProduct.map((p) => p.id).join(", ")}) — either this split ` +
        "already ran, or something else created it. Investigate before proceeding."
    );
  }

  console.log("  No drift detected — live state matches every recorded 'before' value.");
}

// ============================================================================
// Pre-flight validation (mirrors audit-node-quantities.js's preflightValidate)
// ============================================================================

function preflightValidate(worksheet) {
  console.log("\n--- Pre-flight validation ---");
  const errors = [];

  if (worksheet.confirmed !== true) {
    errors.push("top-level confirmed must be true before --apply");
  }
  if (!worksheet.createProduct?.canonical_unit) {
    // Omitting this makes both spaghetti recipes unpublishable —
    // lintMissingCanonicalUnit has no type exemption (planning_findings #5).
    errors.push(
      "createProduct.canonical_unit is required — omitting it makes both " +
        "spaghetti recipes unpublishable"
    );
  }

  for (const r of worksheet.recipes ?? []) {
    for (const field of ["updateStep", "createStep", "createNode", "retargetEdges", "createEdges"]) {
      if (!r[field]) errors.push(`recipe ${r.recipeId}: missing ${field}`);
    }
    const durations = [
      ["updateStep.after.active_minutes", r.updateStep?.after?.active_minutes],
      ["updateStep.after.passive_minutes", r.updateStep?.after?.passive_minutes],
      ["createStep.active_minutes", r.createStep?.active_minutes],
      ["createStep.passive_minutes", r.createStep?.passive_minutes],
    ];
    for (const [label, value] of durations) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`recipe ${r.recipeId}: ${label} is not a finite number >= 0 (${JSON.stringify(value)})`);
      }
    }
    if (!(r.createEdges ?? []).some((e) => e.loadBearing)) {
      errors.push(
        `recipe ${r.recipeId}: no createEdges entry is marked loadBearing — ` +
          "the sauce->plate edge must be present and marked"
      );
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
 * Writes in dependency order: product -> step -> node -> edges (per recipe).
 * The rollback worksheet is written to disk incrementally, after EVERY
 * successful create/update — so if the run dies partway, whatever landed is
 * still fully recoverable, not just whatever the script intended to do.
 */
async function applyWorksheet(worksheet, backupId) {
  const rollback = {
    backupId,
    appliedAt: new Date().toISOString(),
    // Deletes must run children -> parents: edges, then nodes, then steps,
    // then the product (planning_findings: "rollback must cover CREATES").
    createdEdges: [],
    createdNodes: [],
    createdSteps: [],
    createdProduct: null,
    // Reverts: restore these BEFORE values (not deletes).
    updatedSteps: [],
    retargetedEdges: [],
  };
  writeRollback(rollback); // skeleton on disk before the first real write

  console.log("\n--- Applying: create shared meat sauce product ---");
  const product = await pb.collection("products").create({
    name: worksheet.createProduct.name,
    type: worksheet.createProduct.type,
    canonical_unit: worksheet.createProduct.canonical_unit,
    storage_location: worksheet.createProduct.storage_location,
    container_type: worksheet.createProduct.container_type,
    pantry: worksheet.createProduct.pantry,
    store: worksheet.createProduct.store,
  });
  rollback.createdProduct = { collection: "products", id: product.id };
  writeRollback(rollback);
  console.log(`  meat sauce product created: ${product.id}`);

  for (const r of worksheet.recipes) {
    console.log(`\n--- Applying: ${r.recipeName} (${r.recipeId}) ---`);

    const stepBefore = await pb.collection("recipe_steps").getOne(r.updateStep.stepId);
    await pb.collection("recipe_steps").update(r.updateStep.stepId, r.updateStep.after);
    rollback.updatedSteps.push({
      stepId: r.updateStep.stepId,
      before: {
        name: stepBefore.name,
        instructions: stepBefore.instructions ?? "",
        active_minutes: stepBefore.active_minutes,
        passive_minutes: stepBefore.passive_minutes,
        timing: stepBefore.timing,
      },
    });
    writeRollback(rollback);
    console.log(`  step ${r.updateStep.stepId} renamed -> "${r.updateStep.after.name}"`);

    const newStep = await pb.collection("recipe_steps").create({
      recipe: r.recipeId,
      name: r.createStep.name,
      step_type: r.createStep.step_type,
      timing: r.createStep.timing,
      resource: r.createStep.resource,
      active_minutes: r.createStep.active_minutes,
      passive_minutes: r.createStep.passive_minutes,
      instructions: r.createStep.instructions,
    });
    rollback.createdSteps.push({ collection: "recipe_steps", id: newStep.id });
    writeRollback(rollback);
    console.log(`  new step created: ${newStep.id} "${newStep.name}"`);

    const newNode = await pb.collection("recipe_product_nodes").create({
      recipe: r.recipeId,
      product: product.id,
      quantity: r.createNode.quantity,
      unit: r.createNode.unit,
    });
    rollback.createdNodes.push({ collection: "recipe_product_nodes", id: newNode.id });
    writeRollback(rollback);
    console.log(`  new meat-sauce node created: ${newNode.id}`);

    for (const re of r.retargetEdges) {
      const edgeBefore = await pb.collection(re.collection).getOne(re.edgeId);
      await pb.collection(re.collection).update(re.edgeId, { [re.field]: newStep.id });
      rollback.retargetedEdges.push({
        edgeId: re.edgeId,
        collection: re.collection,
        field: re.field,
        before: edgeBefore[re.field],
      });
      writeRollback(rollback);
      console.log(
        `  edge ${re.edgeId} (${re.collection}.${re.field}) retargeted -> ${newStep.id} [${re.productName}]`
      );
    }

    const sauceToNodeEdge = await pb.collection("step_to_product_edges").create({
      recipe: r.recipeId,
      source: r.updateStep.stepId,
      target: newNode.id,
    });
    rollback.createdEdges.push({ collection: "step_to_product_edges", id: sauceToNodeEdge.id });
    writeRollback(rollback);
    console.log(`  new edge: "${r.updateStep.after.name}" -> meat sauce node (${sauceToNodeEdge.id})`);

    const nodeToPlateEdge = await pb.collection("product_to_step_edges").create({
      recipe: r.recipeId,
      source: newNode.id,
      target: newStep.id,
    });
    rollback.createdEdges.push({ collection: "product_to_step_edges", id: nodeToPlateEdge.id });
    writeRollback(rollback);
    console.log(
      `  new edge (LOAD-BEARING): meat sauce node -> "${newStep.name}" (${nodeToPlateEdge.id})`
    );
  }

  console.log(`\n  Rollback worksheet: ${ROLLBACK_PATH}`);
  return rollback;
}

// ============================================================================
// Rollback — deletes created records children-before-parents (edges -> nodes
// -> steps -> product), same constraint sync-to-test.js documents for
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

  if (rollback.createdProduct) {
    await pb.collection(rollback.createdProduct.collection).delete(rollback.createdProduct.id);
    console.log(
      `  deleted created product ${rollback.createdProduct.collection}/${rollback.createdProduct.id}`
    );
  }

  console.log("\n✅ ROLLBACK COMPLETE — graph restored to its pre-split shape.");
}

// ============================================================================
// main
// ============================================================================

async function main() {
  console.log("=".repeat(80));
  console.log("SPLIT CREATE-SPAGHETTI STEP");
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

  console.log(`\n--- ${APPLY ? "" : "[dry-run] "}Planned graph delta ---`);
  for (const r of worksheet.recipes) {
    console.log(`  ${r.recipeName} (${r.recipeId}):`);
    console.log(
      `    UPDATE step ${r.updateStep.stepId}: "${r.updateStep.before.name}" -> ` +
        `"${r.updateStep.after.name}" (${r.updateStep.after.active_minutes}a/` +
        `${r.updateStep.after.passive_minutes}p, ${r.updateStep.after.timing})`
    );
    console.log(
      `    CREATE step: "${r.createStep.name}" (${r.createStep.active_minutes}a/` +
        `${r.createStep.passive_minutes}p, ${r.createStep.timing})`
    );
    console.log(`    CREATE node: meat sauce (qty ${r.createNode.quantity} ${r.createNode.unit})`);
    for (const re of r.retargetEdges) {
      console.log(`    RETARGET edge ${re.edgeId} (${re.productName}) -> new plate step`);
    }
    for (const ce of r.createEdges) {
      console.log(`    CREATE edge: ${ce.description}`);
    }
  }
  console.log(
    `  CREATE product: ${worksheet.createProduct.name} ` +
      `(type=${worksheet.createProduct.type}, canonical_unit=${worksheet.createProduct.canonical_unit})`
  );

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
