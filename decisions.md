# Meal Planner App — Design Decisions

## Overview

A meal planning app focused on batch prep workflows. The core problem: given a list of planned meals for the week, generate aggregated shopping lists, batch prep task lists, and clear outputs of what ends up stored for the week.

---

## Step Model

### Prep Steps

- Manually flagged as prep
- **Inputs:** raw ingredients only
- **Outputs:** transient (flows to assembly) and/or stored (fridge/freezer container with size)
- Aggregated across recipes by input/output product-ID signature (see Step Aggregation below), not by name
- Allocation displayed so user knows where each portion goes

### Assembly Steps

- Default step type (anything not flagged as prep)
- **Inputs:** raw ingredients, transient products, outputs from prior assembly steps
- **Outputs:** transient or stored
- Flagged as **batch** or **just-in-time**
  - Batch assembly happens after all prep, on prep day
  - Just-in-time assembly happens at serve time; excluded from batch prep list

---

## Other Decisions

### Ingredient Handling

- Ingredients specify quantity + unit at recipe authoring time. `src/lib/units.ts`
  provides a within-dimension conversion layer (Phase 1 data hygiene, DATA-01/DATA-02):
  mismatched-but-compatible units (e.g. `cup` vs `tbsp`) convert and merge correctly;
  cross-dimension mismatches (e.g. volume vs mass) are never guessed — the recipe
  linter flags them instead
- Ingredients are raw purchasable items; preparation is handled by prep steps

### Shopping List

- Pantry items (bought in bulk) are listed separately for manual verification; not auto-added to shopping list

### Step Aggregation

- Steps merge across recipes when their sorted input-product-ID + output-product-ID
  signature matches (`createStepSignature`, `step-utils.ts:20-27`) — not by exact
  string match on the step name
- Step names are collected across every merged source for display only; they never
  affect whether steps merge, so differently-named steps with the same
  inputs/outputs still aggregate together

### Container Type Granularity (Revisit Trigger)

- Container type stays **product-level only** (`products.container_type`) — Phase 1
  data hygiene deliberately did not add a per-node `container_type` relation, since no
  current recipe data demonstrates the need and manual two-database schema edits are a
  standing risk to minimize
- Revisit trigger: add a per-node `recipe_product_nodes.container_type` relation
  if/when a real recipe needs to store the *same* stored product in *different*
  containers across recipes. This is a deliberate, deferred future decision — not an
  implicit gap in the data model

### Recipe Scope

- Recipes are self-contained graphs
- Shared intermediates (e.g., stock used in multiple recipes) are modeled as separate recipes; user manages planning accordingly

### Collaboration

- Not real-time collaborative; goal is clear output for household communication (what's in the fridge, what meals are planned)

---

## Recipe Data Model

### Recipe

- **Name**
- **Notes** (optional)
- **Tags** (e.g., breakfast, dinner)
- **Graph** of product and step nodes

### Product Node

- **Name** (key for aggregation)
- **Type:** raw, transient, or stored
- **Quantity + unit**
- If raw: **pantry flag** (global per ingredient name, not per-recipe)
- If stored: **storage location** (fridge/freezer), **container size**
- **Edges:** to steps, to other products (allocation), or terminal (final output)

### Step Node

- **Name** (display label only — aggregation key is the input/output product-ID
  signature, see Step Aggregation)
- **Type:** prep or assembly
- If assembly: **batch or just-in-time** flag
- **Inputs:** edges from products (raw or transient)
- **Outputs:** edges to products

### Aggregation

- Aggregation is computed automatically from planned recipes
- Matching keys: products aggregate by product identity; steps aggregate by their
  sorted input-product-ID + output-product-ID signature (see Step Aggregation above),
  not by step name
- User is responsible for consistent naming and compatible units across recipes
- Step names are display-only labels collected from every merged source; they do not
  gate whether steps merge — only the input/output signature does

---

## Global Registries

Defined globally, referenced by ingredients and recipes.

### Stores

- User-defined list (e.g., Costco, Safeway, Trader Joe's)

### Sections

- User-defined list (e.g., produce, dairy, meat, frozen)
- Sections are universal across stores

### Ingredients

- **Name** (key for aggregation)
- **Pantry flag** (if true, appears on pantry check list instead of shopping list)
- **Store** (required, selected from store list)
- **Section** (required, selected from section list)

Ingredients must be defined before use in recipes. When authoring a recipe, user selects from existing ingredients or creates a new one with all required fields.

### Container Types

- User-defined list (e.g., 1qt rectangular, 1 pint container, divided container, tupperware, 9x13 pan, mason jar)
- Selected when authoring distribution steps in recipes

---

## Shopping List Logic

Generated from aggregated raw products in the weekly plan.

### Output Structure

- Grouped by **store**, then by **section** within each store
- Non-pantry items show name and aggregated quantity
- Pantry items listed separately as a **name-only checklist** (no quantities)

### Example Output

```
## Costco
### Produce
- Onion (5 each)
- Carrot (2 lbs)

### Meat
- Chicken thighs (3 lbs)

## Safeway
### Dairy
- Greek yogurt (32 oz)

---

## Pantry Check
- Salt
- Olive oil
- Flour
```

---

## Storage Types

Color-coded to communicate how to retrieve/prepare the meal:

- **Fridge bulk** (🔵) — portion from bulk container(s), may combine multiple, no cooking
- **Fridge portioned** (🟢) — pre-portioned, grab and heat/eat
- **Freezer portioned** (🟣) — pre-portioned, frozen, grab and heat
- **Time-of-service** (🔴) — requires cooking at serve time

---

## Output Views

### Weekly View

Calendar grid format, printable. Days as columns, meal slots as rows.

**Structure:**

- **Snacks row** at top — list of available snacks for the week
- **Breakfast row** — week-spanning cards and/or day-specific cards
- **Lunch row** — week-spanning cards and/or day-specific cards
- **Dinner row** — week-spanning cards and/or day-specific cards

**Card types:**

- **Week-spanning** — for pooled meals (grab-and-go, baby split dishes, bulk fridge items)
- **Day-specific** — for meals assigned to specific days (adult dinners)

**Card detail:**

- Color coded by storage type
- Meal name
- Component list with container type/size for each

Example card:

```
🔵 Veggie bowl
   • salmon (1qt rectangular)
   • rice (1qt rectangular)
   • roasted veggies (1qt square)
   • tahini sauce (1 pint jar)
```

### Monthly View

Compressed view for pattern/variety tracking, printable.

**Structure:**

- Baby meals shown for each week (track nutritional variety)
- Snacks + weekly pooled meals combined into summary line per week
- Day-specific meals shown (adult dinners)

---

## Batch Prep List

Three-phase flat list, printable. User determines order within each phase.

### Phases

1. **Raw Processing** — prep steps, outputs always transient
2. **Cooking** — batch assembly steps involving transformation, outputs always transient
3. **Final Distribution** — portioning into containers, outputs always stored

Every stored product has a distribution step, even if 1:1 pass-through. This ensures the model handles one-to-many distributions consistently.

### Step Format

```
[ ] Inputs → Action → Output (quantity, storage)
```

### Example

```
RAW PROCESSING
[ ] onion (3 each) → dice → diced onion (3 cups, transient)
[ ] carrot (2 each) → dice → diced carrot (2 cups, transient)

COOKING
[ ] diced onion (1 cup), diced carrot (1 cup), bones, water → simmer 2hr, strain → stock (1 qt, transient)
[ ] diced onion (1 cup), tomatoes (2 cups) → combine → salsa (1 pint, transient)

FINAL DISTRIBUTION
[ ] stock (1 qt) → portion → stock (1qt container, fridge)
[ ] salsa (1 pint) → portion → salsa (1 pint container, fridge)
[ ] diced onion (1 cup) → portion → diced onion (1 pint container, fridge)
```

---

## Open Questions

(None remaining — ready to build)

---

## Tech Stack

### Architecture

- Self-hosted on local Linux machine
- Single user, no authentication required
- Accessible on local network for household viewing

### Frontend

- **React** — mature ecosystem, familiar
- **React Flow** — node-based graph editor for recipe DAGs

### Backend/Database

- **PocketBase** — single Go binary, SQLite-backed, auto-generates REST API
- Define collections (tables), get CRUD endpoints automatically
- Admin UI for data management

---

## Database Schema

### Global Registries

```
stores
- id (auto)
- name (text, required)

sections
- id (auto)
- name (text, required)

container_types
- id (auto)
- name (text, required)

tags
- id (auto)
- name (text, required)
- color (text — hex code)
```

### Products

Global products. Type determines which fields are relevant.

```
products
- id (auto)
- name (text, required, unique)
- type (select: raw/transient/stored)
- pantry (boolean, default false — raw only)
- store (relation → stores, nullable — raw only)
- section (relation → sections, nullable — raw only)
- storage_location (select: fridge/freezer, nullable — stored only)
- container_type (relation → container_types, nullable — stored only)
```

### Recipes

```
recipes
- id (auto)
- name (text, required)
- notes (text, optional)

recipe_tags
- id (auto)
- recipe (relation → recipes)
- tag (relation → tags)
```

### Recipe Graph Nodes

```
recipe_product_nodes
- id (auto)
- recipe (relation → recipes)
- product (relation → products)
- quantity (number)
- unit (text)
- meal_destination (text, optional — for stored outputs, e.g., "stir fry")
- position_x (number)
- position_y (number)

recipe_steps
- id (auto)
- recipe (relation → recipes)
- name (text, required)
- step_type (select: prep/assembly)
- timing (select: batch/just_in_time, nullable — assembly only)
- position_x (number)
- position_y (number)
```

### Recipe Graph Edges

```
product_to_step_edges
- id (auto)
- recipe (relation → recipes)
- source (relation → recipe_product_nodes)
- target (relation → recipe_steps)

step_to_product_edges
- id (auto)
- recipe (relation → recipes)
- source (relation → recipe_steps)
- target (relation → recipe_product_nodes)
```

### Weekly Plans

```
weekly_plans
- id (auto)
- name (text, optional)

planned_meals
- id (auto)
- weekly_plan (relation → weekly_plans)
- recipe (relation → recipes)
- meal_slot (select: breakfast/lunch/dinner/snack)
- day (select: mon/tue/wed/thu/fri/sat/sun, nullable — null for week-spanning)
- quantity (number, optional)
```

---

## Just-in-Time Pull List

Per-meal list for time-of-service meals (🔴). Lists what to retrieve from storage before cooking — not preparation steps.

### Distribution Rule

Every stored product is portioned for exactly one meal during distribution. No shared containers across meals. Container labels include meal destination.

### Format

```
[DAY] [MEAL SLOT]: [Meal Name]

FROM FRIDGE:
[ ] item (meal label) — quantity — container type

FROM FREEZER:
[ ] item (meal label) — quantity — container type

FROM PANTRY:
[ ] item
[ ] item
```

### Example

```
WEDNESDAY DINNER: Stir Fry

FROM FRIDGE:
[ ] diced onion (stir fry) — 1 cup — 1 pint container
[ ] cubed chicken (stir fry) — 1 lb — 1qt rectangular
[ ] sliced peppers (stir fry) — 1 cup — 1 pint container

FROM PANTRY:
[ ] soy sauce
[ ] sesame oil
[ ] cornstarch
```

---

## Fridge/Freezer Contents After Prep

Checklist to verify all stored outputs are complete at end of prep. Organized by storage location, with container tally.

### Format

```
FRIDGE
[ ] item — container type — for end meal
...

FREEZER
[ ] item — container type — for end meal
...

CONTAINER TALLY
- Nx container type
- Nx container type
...
```

### Example

```
FRIDGE
[ ] stock — 1qt rectangular — for risotto
[ ] salsa — 1 pint container — for taco night
[ ] diced onion — 1 pint container — for stir fry
[ ] baby breakfast split dish — 7x divided container — for baby breakfast
[ ] chicken rice bowl — 5x tupperware — grab-and-go lunch

FREEZER
[ ] lasagna — 2x 9x13 pan — for Sunday dinner
[ ] meatballs — 1qt rectangular — for spaghetti night

CONTAINER TALLY
- 2x 1qt rectangular
- 2x 1 pint container
- 7x divided container
- 5x tupperware
- 2x 9x13 pan
```
