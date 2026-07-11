# RecipePlanner Database Schema

Reference for the collections the recipe-import skill targets. The import skill does NOT
write to these collections directly — it emits the D-01 `{name + hints}` JSON contract and
the in-app `/import` page builds the graph. This doc maps the JSON fields to the underlying
schema so you emit correct values.

## Database URLs

- **Production**: `http://192.168.50.95:8090` — where imports land (as drafts, via the
  /import page).
- **Test**: `http://192.168.50.95:8091` — schema/code changes only. **No longer used for
  recipe imports** (the test→prod migration ritual is retired, IMP-03).

The import skill only ever reads prod (product-registry lookups, Step 3). It never writes.

## Core Collections for Recipe Import

### recipes
- name: text (required)
- notes: text — human-facing card blurb (NOT agent/change notes; those live in
  `recipe_notes`)
- recipe_type: select — "meal" | "batch_prep"
- **status: select — "draft" | "published"** (lifecycle, Phase 6 / D-03). Un-set reads as
  `""` on legacy rows and was backfilled to `"published"`. Imports land as **"draft"**;
  drafts are excluded from weekly planning but visible + badged in the recipe list.
  Publishing (RecipeEditor "Publish" button → recipe linter) is the only hard gate.
- revision_of: relation (recipes) — set only on draft revisions produced by the evolution
  loop (D-10); points at the published recipe being revised. Not set by import.

JSON mapping: `recipe.name`, `recipe.notes`, `recipe.recipe_type`, `recipe.status`.

### products
Global product registry (shared across recipes).
- name: text (required)
- type: select (required) — "raw" | "transient" | "stored" | "inventory"
- pantry: bool — simple ingredients not tracked in shopping lists
- store: relation
- section: relation
- storage_location: select — "fridge" | "freezer" | "dry"
- container_type: relation
- track_quantity: bool
- ready_to_eat: bool
- meal_slot: select — "snack" | "meal"
- source_recipe: relation (recipes) — the batch-prep recipe that produces this product
- Nutrition-ready fields (nullable, mostly unpopulated): fdc_id, usda_data_type,
  usda_category, nutrient_basis_g, kcal, protein_g, fat_g, carb_g. **`protein_g`/`kcal`
  are 0/null across the registry** — no macro data exists yet (relevant to
  /suggest-recipes' soft macro heuristic, D-08).

JSON mapping (product LINE hints): `name`, `unit`, `quantity` are required/primary; hints
`matchProductId` (reuse existing product by id), `productType` (→ `type`), `pantry`,
`fdcId` (→ `fdc_id`), `store`, `section`. If `matchProductId` is set, the import page links
the existing product instead of creating one.

### recipe_product_nodes
Product instances within a specific recipe (a product line becomes one of these).
- recipe: relation (required)
- product: relation (required)
- quantity: number
- unit: text
- meal_destination: text
- position_x: number
- position_y: number
- source_node: relation (recipe_product_nodes) — evolution-loop clone correspondence
  (D-10); not set by import.

JSON mapping: `quantity`/`unit` come from the product line; `product` is resolved from
`matchProductId` (or created from the `name` + hints).

### recipe_steps
- recipe: relation (required)
- name: text (required)
- step_type: select (required) — "prep" | "assembly"
- timing: select — "batch" | "just_in_time"
- position_x: number
- position_y: number

**Phase-5 prep-day metadata (all additive + nullable — earlier steps validate unchanged):**
- **active_minutes: number** — hands-on minutes (drives active-prep time in
  /suggest-recipes; lower = better).
- **passive_minutes: number** — unattended minutes (oven/simmer time; NOT counted as
  active).
- **instructions: text** — free-text step instructions.
- **prep_action: select** — the knife/prep action, PAST-TENSE, one of exactly:
  **"sliced" | "diced" | "minced" | "chopped" | "grated" | "shredded"**. NOT free text —
  a present-tense verb ("dice", "chop") or any other value is a HARD reject (PB 400
  "Failed to create record."), unlike `timing`/`resource` which soft-normalize. Leave it
  unset (omit the key) for a non-knife step (cook/toast/pull/simmer/serve).
- **resource: select** — "oven" | "stovetop" | "blender" | "food_processor" |
  "instant_pot" | "microwave" | "sous_vide" | "smoker" | "none". Unknown values normalize
  to undefined + a warning at import (never a hard reject).
- **step_type: select (required)** — "prep" | "assembly". **timing: select** — "batch" |
  "just_in_time". Both are selects: `step_type` and any non-normalized select value that
  PB rejects hard-fail the whole import. Only `timing`/`resource` are soft-normalized.
- **oven_temp_f: number** — oven temperature in Fahrenheit (when resource = oven).
- **rack_slots: number** — oven rack slots the step occupies (prep-day scheduling).

JSON mapping (step object): `name`, `step_type`, `timing`, `active_minutes`,
`passive_minutes`, `instructions`, `prep_action`, `resource`, `oven_temp_f`, `rack_slots`.

### product_to_step_edges
Products flowing INTO steps.
- recipe: relation (required)
- source: relation (required) — recipe_product_node ID
- target: relation (required) — recipe_step ID

JSON mapping: an edge `{ from: "product-*", to: "step-*" }`.

### step_to_product_edges
Products created BY steps.
- recipe: relation (required)
- source: relation (required) — recipe_step ID
- target: relation (required) — recipe_product_node ID

JSON mapping: an edge `{ from: "step-*", to: "product-*" }`.

## Supporting Collections

### stores
- name: text (required)

### sections
- name: text (required)

### container_types
- name: text (required)

### tags
- name: text (required)
- color: text

JSON mapping: `recipe.tags` is an array of tag ids.

### recipe_tags
- recipe: relation (required)
- tag: relation (required)

### weekly_plans
- name: text
- start_date: date (nullable on legacy rows)
- people_multiplier: number (absent → treat as 1)

### planned_meals
- weekly_plan: relation (required)
- recipe: relation (required)
- meal_slot: select (required) — "breakfast" | "lunch" | "dinner" | "snack" | "micah"
- day: select — "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
- quantity: number

### recipe_notes
Evolution-loop notes (Phase 6 / D-09) — `recipe` relation, `text`, `status`
(pending/applied/dismissed), `source_surface`, `created`. Not written by import; listed
here for completeness.

### inventory_items
- product: relation (required)
- in_stock: bool (required)
- notes: text

## The D-01 Import JSON Contract (summary)

```json
{
  "recipe": { "name": "…", "notes": "…", "recipe_type": "meal|batch_prep", "status": "draft" },
  "tags": ["<tag-id>"],
  "products": [
    { "ref": "product-1", "name": "…", "unit": "…", "quantity": 0,
      "matchProductId": "…", "productType": "raw|transient|stored|inventory",
      "pantry": false, "fdcId": 0, "store": "…", "section": "…" }
  ],
  "steps": [
    { "ref": "step-1", "name": "…", "step_type": "prep|assembly", "timing": "batch|just_in_time",
      "active_minutes": 0, "passive_minutes": 0, "instructions": "…", "prep_action": "…",
      "resource": "oven|stovetop|blender|food_processor|instant_pot|microwave|sous_vide|smoker|none",
      "oven_temp_f": 0, "rack_slots": 0 }
  ],
  "edges": [ { "from": "product-1", "to": "step-1" }, { "from": "step-1", "to": "product-2" } ]
}
```

Required: `recipe.name`; each product line's `name` + `unit`; each step's `name` +
`step_type`; each edge's `from` + `to` resolving to a declared `ref`. Everything else is
optional. The validator never throws — problems surface inline for the user to fix.
