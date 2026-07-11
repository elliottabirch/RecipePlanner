---
name: recipe-import
description: Import recipes into the RecipePlanner database. Use when user provides a recipe (ingredients + instructions) to add to the system. Analyzes the recipe into products + steps, reuses existing products, and EMITS the import-page JSON contract (a `{name + hints}` recipe graph) for the user to paste into the in-app /import page — which lands it as a draft directly in prod. Triggers on "import this recipe", "add a new recipe", or when the user provides recipe content to add.
---

# Recipe Import

Turn a recipe (ingredients + instructions) into the **import-page JSON contract** the
in-app `/import` page accepts. You do the analysis — product reuse, step/timing
conventions, store/section discipline — and hand the user a single JSON object to paste.
The page validates it (never blocks), lands it as a **draft directly in prod**, and
redirects into the RecipeEditor for review/edit. Publishing (the only hard gate) happens
there later.

**This skill emits JSON. It does not generate import scripts, does not touch the test
database, and does not migrate anything to prod.** The old `import-*.js` / `migrate-*.js`
test→prod ritual is retired (IMP-03) — landing and review now happen entirely on the
`/import` page.

## Prerequisites

- Recipe provided by user (name, ingredients, instructions, yield).
- Read access to the product registry to reuse existing products (query prod directly —
  see Step 3). This is READ-ONLY; you never write to the DB from this skill.

## Workflow

1. **Get recipe** — Ask for name, ingredients, instructions, yield, and whether it's a
   `meal` or a `batch_prep`.
2. **Analyze into a graph** — Break the recipe into products (raw / transient / stored /
   inventory) and steps (prep / assembly); sketch the `Product → Step → Product` flow.
3. **Check existing products** — Query the registry to reuse products (avoid near-dupes),
   and capture `store`/`section` for any genuinely new non-pantry product.
4. **Emit the import JSON** — Produce the D-01 `{name + hints}` contract: recipe metadata,
   product lines, steps with full Phase-5 metadata, and `ref`-based edges. Show it to the
   user and confirm.
5. **Hand off to the /import page** — Tell the user to paste the JSON into `/import`. It
   lands a draft and drops them into RecipeEditor. You are done — no scripts run.

## Step 1: Analyze Recipe

Break the recipe down:
- **Raw ingredients** (purchased items).
- **Prep steps** (chop, dice, slice, zest, mince — physical processing of raw produce).
- **Assembly steps** (roast, saute, simmer, mix, combine — cooking/combining).
- **Intermediate products** (chopped X, roasted Y) — `transient`.
- **Final products** — `stored` (made ahead, refrigerated) vs `transient` (served now).

## Step 2: Sketch the Flow (Product → Step → Product)

**Critical rule**: Products NEVER connect directly to products. Always
`Product → Step → Product`. A quick Mermaid sketch is a useful thinking tool (optional,
not part of the emitted JSON):

```mermaid
graph TD
    P1[Parsley<br/>RAW] --> S1[Chop parsley<br/>PREP]
    S1 --> T1[Parsley chopped<br/>TRANSIENT]
```

Every edge in the sketch becomes a `{from, to}` entry in the JSON `edges` array, using the
product/step `ref`s (see Step 4).

## Step 3: Check Existing Products (read-only)

Reuse existing products aggressively — the biggest source of import mess is minting
near-duplicate products. Query the **prod** registry directly (read-only) for each
ingredient you expect to need. Run from inside `recipe-planner/` (its `node_modules`):

```javascript
// One-shot inline node script — READ ONLY. Run from recipe-planner/.
import PocketBase from "pocketbase";
async function main() {
  const pb = new PocketBase("http://192.168.50.95:8090"); // prod, read-only
  const products = await pb.collection("products").getFullList({ sort: "name" });
  for (const term of ["tomato", "onion", "garlic", "paprika"]) {
    console.log(`\n=== ${term} ===`);
    products
      .filter((p) => p.name.toLowerCase().includes(term))
      .forEach((p) => console.log(`  ${p.name} [${p.type}] pantry=${p.pantry} id=${p.id}`));
  }
}
main().catch((e) => console.error("ERROR:", e.message, e.status, e.url));
```

Review matches with the user. When you find an existing product, put its id in the product
line's `matchProductId` hint so the import page auto-links it instead of creating a dupe.

Common reuse opportunities you might miss:
- `crushed red pepper` and `red pepper flakes` are the **same product**.
- An existing transient like `onion (yellow) small-dice` is usually fine for "minced
  onion" — don't create near-duplicates.
- A recipe asking for "garlic" should typically pull from `garlic cubes (frozen)`
  (inventory) via a **`Pull out garlic cubes` assembly step** (not a prep step) producing
  `garlic cube (pulled)` (transient). This applies to any tracked inventory ingredient.
- Distinct varieties (e.g. `paprika smoked` vs `paprika`) should stay separate products.

### Store + section hints (REQUIRED for every new non-pantry product)

Every genuinely NEW `raw`, `inventory`, or `stored` product the user actually buys
(`pantry: false`) **must** carry `store` (and, where applicable, `section`) hints in its
product line. These power shopping-list grouping; a product with no store/section quietly
falls out of the list and gets missed at the store (this was the `chives` / `crema` /
`ancho chile` bug in the creamy-tomato-soup import — don't repeat it).

Procedure for a new product:
1. Ask the user (or infer, then confirm) which store sells it and which department/aisle.
2. Look up the ids in the `stores` and `sections` collections (one inline read query, same
   pattern as above), and pass them as `store` / `section` hints on the product line.
   (If you leave the hint as a plain name string, the import page's inline resolution step
   will prompt the user to pick — but resolving it up front is cleaner.)

Rules of thumb:
- **Safeway products**: almost always have a section (`produce`, `dairy`, `meat`,
  `bakery`, `frozen`, `baking supplies`, `international`, `prepared meals`). Don't leave
  section blank for a Safeway item.
- **Online products** (Amazon / specialty): `section` typically left blank — see
  `garam masala`, `kasuri methi`, `parchment paper`. Store still required.
- **Costco / Trader Joes**: store required; section optional and usually omitted.
- **`pantry: true` products**: store/section can be omitted — not in the active list.

Sanity check before emitting: list every product line that will create a NEW product and
confirm each has a `store` hint.

## Step 4: Emit the Import JSON (the D-01 contract)

Produce a single JSON object with `recipe`, `products`, `steps`, and `edges`. This is the
exact contract the `/import` page's `validateImportJson` accepts (it never throws — any
problem is surfaced inline for the user to fix; it can never produce a partial write).

### Shape

```json
{
  "recipe": {
    "name": "Creamy Tomato Soup",
    "notes": "optional human-facing blurb",
    "recipe_type": "batch_prep",
    "status": "draft"
  },
  "tags": [],
  "products": [
    {
      "ref": "product-1",
      "name": "onion (yellow)",
      "unit": "cup",
      "quantity": 0.5,
      "matchProductId": "10x87sv01ut8xa7"
    },
    {
      "ref": "product-2",
      "name": "ancho chile",
      "unit": "each",
      "quantity": 2,
      "productType": "raw",
      "pantry": false,
      "store": "STORE_ID_OR_NAME",
      "section": "SECTION_ID_OR_NAME"
    },
    { "ref": "product-3", "name": "onion diced", "unit": "cup" }
  ],
  "steps": [
    {
      "ref": "step-1",
      "name": "Dice onion",
      "step_type": "prep",
      "timing": "batch",
      "active_minutes": 5,
      "passive_minutes": 0,
      "prep_action": "dice",
      "instructions": "Small-dice the yellow onion."
    }
  ],
  "edges": [
    { "from": "product-1", "to": "step-1" },
    { "from": "step-1", "to": "product-3" }
  ]
}
```

### Rules

- **`ref`s** follow the `product-*` / `step-*` convention (mirrors RecipeEditor's local
  node ids, so the import id-remap ports unchanged). Every product and step needs a unique
  `ref`. If you omit `ref`, the validator assigns `product-<n>` / `step-<n>` by position —
  but assign them explicitly so your edges are readable.
- **Product lines** require `name` + `unit`. Put `quantity` on raw inputs and stored
  outputs; transient/intermediate nodes usually omit quantity.
- **Hints** (all optional): `matchProductId` (reuse an existing product by id — strongly
  preferred over creating a dupe), `productType` (`raw` | `transient` | `stored` |
  `inventory`), `pantry` (bool), `fdcId` (USDA FDC id), `store`, `section`.
- **Steps** require `name` + `step_type` (`prep` | `assembly`). Carry the full Phase-5
  metadata where known: `timing` (`batch` | `just_in_time`), `active_minutes`,
  `passive_minutes`, `instructions`, `prep_action`, `resource`, `oven_temp_f`,
  `rack_slots`. (See references/schema.md for the enum values and field meanings.)
- **Edges** are `{ "from": ref, "to": ref }`. Direction is inferred from the ref prefix:
  `product-* → step-*` is an input; `step-* → product-*` is an output. NEVER
  `product → product`.
- **`recipe.status`**: set `"draft"` (the import page lands drafts). It's the default even
  if omitted.
- Unknown `timing`/`resource` enum values are normalized to `undefined` with a warning by
  the validator — not a hard error. Prefer the documented enum values.

Show the JSON to the user and confirm before handing off. This is the confirm-before-write
step (nothing has been written yet — the page writes on paste).

## Step 5: Hand off to the /import page

Tell the user:

> Paste this JSON into the **/import** page in the app and submit. It will validate the
> graph, land it as a **draft** directly in prod, and drop you into the recipe editor for
> review. Any unmatched products get an inline resolution prompt (pick existing / quick-
> create / USDA) before the draft finishes landing. When you're happy, hit **Publish** in
> the editor — that's the only step that runs the linter.

You are done. Do not run any import or migration script.

## Product Types

| Type | Description | Examples |
|------|-------------|----------|
| `raw` | Base ingredients | lemon, onion (yellow) |
| `raw` + `pantry: true` | Simple untracked items | olive oil, salt, pepper |
| `inventory` | Compound tracked items | vegetable stock, frozen garlic cubes |
| `transient` | Intermediate or served | parsley chopped, bean mixture |
| `stored` | Made ahead, refrigerated | white bean stew base |

## Naming Conventions

**Raw**: `[ingredient]` or `[ingredient] ([variant])` — lowercase
- `lemon`, `onion (yellow)`, `tomato cherry`

**Transient**: `[ingredient] [action]` — action after noun, past tense
- `parsley chopped`, `tomato cherry roasted`

**Stored**: Descriptive of the prepared component
- `lemon-parsley mixture`, `white bean stew base`

## Step Types

- **`prep`**: Physical processing of raw fruits and vegetables into broken-down variants
  (chopping, dicing, slicing, zesting, mincing). Transforms a raw ingredient into a
  transient "prepped" product.
- **`assembly`**: Cooking or combining prepped ingredients, inventory items, and pantry
  items into intermediate or final products (roasting, sauteing, simmering, mixing,
  tossing with dressing).

## Step Timing

- **`batch`**: Made ahead on prep day. Use for all prep steps and assembly steps that
  create stored products.
- **`just_in_time`**: Performed at serving time. Use for final assembly steps and anything
  that must be done fresh (dressing a salad, warming bread).

## Database Reference

See [references/schema.md](references/schema.md) for collection details, field types, and
the Phase-5 `recipe_steps` metadata fields (`active_minutes`, `passive_minutes`,
`instructions`, `prep_action`, `resource`, `oven_temp_f`, `rack_slots`) and the
`recipes.status` lifecycle field.

## Common Gotchas

- **Emit JSON, not a script.** The deliverable is the D-01 contract for the /import page.
  If you catch yourself writing `pb.collection(...).create(...)` to land a recipe, stop —
  that path is retired. The only DB access this skill makes is the READ-ONLY product
  lookup in Step 3.
- **Reuse products via `matchProductId`.** When Step 3 finds an existing product, always
  put its id in the line's `matchProductId` hint. Bare `name`-only lines force the import
  page to match/create, risking a near-duplicate.
- **Store/section on every new non-pantry product** — omit them and the product drops out
  of the shopping list.
- **Top-level `await` + pocketbase errors** (for the Step 3 read query): an unhandled
  rejection prints the entire pocketbase ESM bundle (~20K chars of minified code). Always
  wrap the read in `async function main()` + `main().catch((e) => console.error("ERROR:",
  e.message, e.status, e.url))`.
- **Node module resolution**: the Step 3 read script must live inside `recipe-planner/`
  (alongside its `node_modules`) or it fails with `ERR_MODULE_NOT_FOUND`.

## Maintenance Scripts (registry-hygiene, still useful)

- `scripts/find-product-matches.js` — quick category-bucketed product list; supplement
  with direct reads (Step 3).
- `scripts/find-duplicates.js` — exact + near-duplicate detection across products.

The old per-recipe `import-*.js` and `migrate-*.js` scripts, and the `sync-to-test.js` /
`compare-product-ids.js` promote-ritual helpers, are no longer part of the import flow
(the test DB is for schema/code changes only now). Do not create new ones.

## Example

See `examples/white-bean-stew/` for a complete flow-diagram example,
`examples/mushroom-shawarma-pitas/` for a meal-with-stored-component pattern, and
`examples/creamy-tomato-soup/` for an inventory-as-ingredient (frozen garlic cubes)
pattern. Translate the flow diagram into the JSON `products`/`steps`/`edges` arrays as
shown in Step 4.
