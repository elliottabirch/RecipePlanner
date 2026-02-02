# Recipe Import Guide

## Quick Start for Next Agent

**Goal**: Import a recipe into the RecipePlanner database safely through the test environment.

**Prerequisites**: 
- Test database running on port 8091 (already synced with production)
- Recipe provided by user (ingredients + instructions)

**Workflow Summary**:
1. Analyze recipe and create flow diagram → Get user approval
2. Check existing products → Identify what to create vs reference
3. Create import script → Hardcoded to test database
4. Run import on test database → Verify in UI
5. User can manually promote to production if satisfied

---

## Step-by-Step Import Process

### Step 1: Get the Recipe

Ask the user for:
- Recipe name
- Ingredients list (with quantities)
- Step-by-step cooking instructions
- Serving size/yield

**Example Input**:
```
Recipe: White Bean and Tomato Stew
Yield: 4-6 servings

Ingredients:
- ½ cup parsley
- 2 tsp lemon zest
- 20 oz cherry tomatoes
... (etc)

Steps:
1. Heat oven to 425°F...
2. Roast tomatoes...
... (etc)
```

### Step 2: Analyze & Create Flow

1. **Break down the recipe**:
   - Identify raw ingredients
   - Identify prep steps (chop, dice, zest, etc.)
   - Identify cooking steps (roast, sauté, simmer, etc.)
   - Identify intermediate products (chopped X, roasted Y, etc.)
   - Identify final products (stored vs transient)

2. **Create Mermaid flow diagram**:
   - Show all products as nodes
   - Show all steps as nodes
   - Connect with edges (product → step → product)
   - **CRITICAL**: Products NEVER connect directly to products
   - Save to a markdown file (e.g., `recipe-name-flow.md`)

3. **Get user confirmation**:
   - Present the flow diagram
   - Discuss any questions about:
     - Product types (raw/transient/stored/inventory)
     - Step timing (batch vs just_in_time)
     - Any special considerations

**See**: [`white-bean-stew-flow.md`](./white-bean-stew-flow.md) for a complete example

### Step 3: Check Existing Products

Run the product matching scripts to identify what already exists:

```bash
cd recipe-planner

# Check for exact matches
node check-existing-products.js

# Find similar products using patterns
node find-product-matches.js
```

**Output**: `product-check-results.json` with:
- `existing`: Products to reference (with IDs)
- `missing`: Products to create

**Review with user**: Confirm the matching results are correct.

### Step 4: Create Import Script

Create a new file: `recipe-planner/import-[recipe-name].js`

**Important**: ALWAYS hardcode to test database:
```javascript
const pb = new PocketBase("http://192.168.50.95:8091"); // TEST DATABASE ONLY
```

**Script structure**:
```javascript
import PocketBase from "pocketbase";

const pb = new PocketBase("http://192.168.50.95:8091");

// Existing product IDs from Step 3
const existingProducts = {
  parsley: "4a3mv36va1b8725",
  // ... etc
};

async function importRecipe() {
  try {
    // 1. Create recipe
    const recipe = await pb.collection("recipes").create({ ... });
    
    // 2. Create missing products
    const newProduct = await pb.collection("products").create({ ... });
    
    // 3. Create product nodes (recipe instances)
    const node = await pb.collection("recipe_product_nodes").create({ ... });
    
    // 4. Create steps
    const step = await pb.collection("recipe_steps").create({ ... });
    
    // 5. Create edges
    await pb.collection("product_to_step_edges").create({ ... });
    await pb.collection("step_to_product_edges").create({ ... });
    
    console.log("✅ Import complete!");
  } catch (error) {
    console.error("❌ Import failed:", error);
  }
}

importRecipe();
```

**See**: [`recipe-planner/import-white-bean-stew.js`](./recipe-planner/import-white-bean-stew.js) for complete example

### Step 5: Run Import on Test Database

```bash
cd recipe-planner
node import-[recipe-name].js
```

**Expected output**:
```
================================================================================
IMPORTING: Recipe Name
================================================================================

📝 Creating recipe...
✓ Recipe created: [ID]

🛒 Creating missing products...
✓ Created: [product names with IDs]

📦 Creating product nodes...
✓ Created N product nodes

⚙️  Creating recipe steps...
✓ Created N steps

🔗 Creating edges...
✓ Created N edges

================================================================================
✨ IMPORT COMPLETE!
================================================================================
```

### Step 6: Verify in UI

1. **Start frontend** (if not already running):
   ```bash
   cd recipe-planner
   npm run dev
   ```

2. **Switch to TEST database**:
   - Look for green "TEST" chip in top-right corner of AppBar
   - If showing "PROD" (red), click it and select "Test Database"

3. **Navigate to Recipes**:
   - Click "Recipes" in sidebar
   - Find your newly imported recipe
   - Click to open and verify all components

4. **Check the flow** (if visual editor available):
   - Verify all products appear
   - Verify all steps appear
   - Verify edges connect correctly

### Step 7: Report Results

Tell the user:
- ✅ Recipe successfully imported to TEST database
- Recipe ID and statistics
- How to view it in the UI
- That they can manually promote to production if satisfied

---

## Database Schema Fundamentals

### Core Collections

1. **`recipes`** - Recipe metadata
   - `name`: Recipe name
   - `notes`: Optional notes
   - `recipe_type`: "meal" or "batch_prep"

2. **`products`** - All ingredients and outputs
   - `name`: Product name
   - `type`: "raw" | "transient" | "stored" | "inventory"
   - `pantry`: Boolean - simple ingredients not meaningfully tracked
   - Other fields: storage_location, container_type, etc.

3. **`recipe_product_nodes`** - Product instances in a recipe
   - `recipe`: Recipe ID
   - `product`: Product ID (reference)
   - `quantity`: Amount
   - `unit`: Measurement unit
   - `position_x`, `position_y`: Visual editor coordinates (optional)

4. **`recipe_steps`** - Processing steps
   - `recipe`: Recipe ID
   - `name`: Step description
   - `step_type`: "prep" | "assembly"
   - `timing`: "batch" | "just_in_time"
   - `position_x`, `position_y`: Visual editor coordinates (optional)

5. **`product_to_step_edges`** - Products flowing INTO steps
   - `recipe`: Recipe ID
   - `source`: Product node ID
   - `target`: Step ID

6. **`step_to_product_edges`** - Products created BY steps
   - `recipe`: Recipe ID
   - `source`: Step ID
   - `target`: Product node ID

### Product Types Explained

- **`raw`**: Base ingredients purchased as-is
  - Examples: "lemon", "onion (yellow)", "cherry tomatoes"
  - Use lowercase, descriptors in parentheses

- **`raw` + `pantry: true`**: Simple ingredients not meaningfully tracked
  - Examples: "olive oil", "salt", "pepper", "red pepper flakes"
  - Won't show quantities in shopping lists

- **`inventory`**: Compound items tracked in inventory system
  - Examples: "vegetable stock", "frozen garlic cubes", "chicken stock"
  - May have their own recipes or be purchased pre-made

- **`transient`**: Intermediate products during cooking OR final served dishes
  - Examples: "parsley chopped", "tomato cherry roasted", "bean mixture"
  - Not stored, used immediately or served

- **`stored`**: Products made ahead and stored
  - Examples: "lemon-parsley mixture", "white bean tomato stew base"
  - Batch prepped, refrigerated/frozen for later use

### Step Types & Timing

**Step Types:**
- **`prep`**: Preparatory work
  - Examples: "Chop parsley", "Dice onion", "Rinse beans"
  
- **`assembly`**: Putting components together
  - Examples: "Combine stew base", "Serve with topping"

**Timing:**
- **`batch`**: Made ahead and stored
  - Use when the product gets stored for later
  
- **`just_in_time`** (JIT): Performed at serving time
  - Use ONLY for final assembly steps that happen when serving
  - Example: Adding a fresh topping to a stored stew

**Important**: If the WHOLE recipe is batch prepped and stored, use `batch` timing for ALL steps except the final serving step.

---

## Product Naming Conventions

### Base Ingredients (raw)

- **Format**: `[ingredient name]` or `[ingredient] ([variant])`
- **Rules**:
  - Use lowercase
  - Specific descriptors in parentheses
  - No "the" or "a"

**Examples**:
- ✅ `lemon`
- ✅ `onion (yellow)`
- ✅ `onion (red)`
- ✅ `tomato cherry`
- ❌ `yellow onion` (descriptors go in parentheses)
- ❌ `Lemon` (use lowercase)

### Transient Products

- **Format**: `[base ingredient] [action]`
- **Rules**:
  - Action comes AFTER the noun
  - Use past tense for completed actions
  - Match the base ingredient name

**Examples**:
- ✅ `parsley chopped`
- ✅ `onion (yellow) small-dice`
- ✅ `tomato cherry roasted`
- ✅ `garlic cube (pulled)`
- ❌ `chopped parsley` (action should be after noun)
- ❌ `diced onions` (be specific: which onion type?)

### Stored Products

- **Format**: `[description]` (descriptive of what it is)
- **Rules**:
  - Clear indication it's a prepared component
  - Can include "stored" suffix if needed for clarity

**Examples**:
- ✅ `lemon-parsley mixture`
- ✅ `white bean tomato stew base`
- ✅ `onion (yellow) small dice stored`
- ✅ `caramelized onions batch`

### Inventory Products

- **Format**: `[compound product name]`
- **Rules**:
  - Names indicate they're trackable items
  - May have associated recipes themselves

**Examples**:
- ✅ `vegetable stock`
- ✅ `frozen garlic cubes`
- ✅ `chicken stock`
- ✅ `garlic cubes (frozen)`

---

## Product Matching Strategy

### Tools Available

1. **`check-existing-products.js`**: Exact name matching
2. **`find-product-matches.js`**: Pattern-based fuzzy search

### Search Patterns

```javascript
// For a specific ingredient type (e.g., tomatoes)
allProducts.filter(p => p.name.toLowerCase().includes("tomato"))

// For prep variations (e.g., diced onions)
allProducts.filter(p => 
  p.name.toLowerCase().includes("onion") && 
  p.name.toLowerCase().includes("dice")
)

// For stock/broth
allProducts.filter(p => 
  p.name.toLowerCase().includes("stock") || 
  p.name.toLowerCase().includes("broth")
)
```

### Matching Guidelines

1. **Check existing first**: Always run product matching before creating new products
2. **Similar is good enough**: "tomato cherry" matches for "cherry tomatoes"
3. **Respect type differences**: Don't match "onion (raw)" with "onion diced (transient)"
4. **When in doubt, ask**: Confirm with user if a match is appropriate

### Special Cases

- **Salt & Pepper**: Usually pantry items, may not be tracked at all
- **Oil**: Check for "olive oil", "vegetable oil", etc. - might be pantry
- **Stock/Broth**: These are inventory items (compound products)
- **Frozen items**: Usually inventory (e.g., "frozen garlic cubes")

---

## Import Script Code Patterns

### Pattern 1: Create Recipe

```javascript
const recipe = await pb.collection("recipes").create({
  name: "Recipe Name Here",
  recipe_type: "meal", // or "batch_prep"
  notes: "Optional notes about servings, etc."
});
console.log(`✓ Recipe created: ${recipe.id}`);
```

### Pattern 2: Create Products

```javascript
// Create a new product
const product = await pb.collection("products").create({
  name: "product name",
  type: "raw", // or "transient", "stored", "inventory"
  pantry: true // optional, for pantry items
});
console.log(`✓ Created: ${product.name} (${product.id})`);
```

### Pattern 3: Create Product Nodes

```javascript
// With quantity
const node = await pb.collection("recipe_product_nodes").create({
  recipe: recipe.id,
  product: productId, // existing or newly created
  quantity: 0.5,
  unit: "cup"
});

// Without quantity (for intermediates)
const node2 = await pb.collection("recipe_product_nodes").create({
  recipe: recipe.id,
  product: productId
});
```

### Pattern 4: Create Steps

```javascript
const step = await pb.collection("recipe_steps").create({
  recipe: recipe.id,
  name: "Descriptive step name",
  step_type: "prep", // or "assembly"
  timing: "batch" // or "just_in_time"
});
```

### Pattern 5: Create Edges

```javascript
// Product → Step
await pb.collection("product_to_step_edges").create({
  recipe: recipe.id,
  source: productNode.id,
  target: step.id
});

// Step → Product
await pb.collection("step_to_product_edges").create({
  recipe: recipe.id,
  source: step.id,
  target: productNode.id
});
```

### Pattern 6: Multi-Input Step

```javascript
// When a step has multiple ingredients
await pb.collection("product_to_step_edges").create({
  recipe: recipe.id,
  source: node_ingredient1.id,
  target: step_cook.id
});
await pb.collection("product_to_step_edges").create({
  recipe: recipe.id,
  source: node_ingredient2.id,
  target: step_cook.id
});
await pb.collection("product_to_step_edges").create({
  recipe: recipe.id,
  source: node_ingredient3.id,
  target: step_cook.id
});

// Then the output
await pb.collection("step_to_product_edges").create({
  recipe: recipe.id,
  source: step_cook.id,
  target: node_output.id
});
```

---

## Common Recipe Patterns

### Pattern 1: Simple Ingredient Prep

```
[Raw Ingredient] → [Prep Step] → [Transient Prepped]
```

**Example**: 
```
[Parsley] → [Chop parsley] → [Parsley chopped]
```

**Code**:
```javascript
// Ingredient node
const node_parsley = await pb.collection("recipe_product_nodes").create({
  recipe: recipe.id,
  product: existingProducts.parsley,
  quantity: 0.5,
  unit: "cup"
});

// Prep step
const step_chop = await pb.collection("recipe_steps").create({
  recipe: recipe.id,
  name: "Chop parsley",
  step_type: "prep",
  timing: "batch"
});

// Output node
const node_chopped = await pb.collection("recipe_product_nodes").create({
  recipe: recipe.id,
  product: existingProducts.parsleyChopped
});

// Edges
await pb.collection("product_to_step_edges").create({
  recipe: recipe.id,
  source: node_parsley.id,
  target: step_chop.id
});
await pb.collection("step_to_product_edges").create({
  recipe: recipe.id,
  source: step_chop.id,
  target: node_chopped.id
});
```

### Pattern 2: Multi-Ingredient Cooking

```
[Ingredient A]──┐
[Ingredient B]──┼→ [Cook Step] → [Output]
[Ingredient C]──┘
```

**Example**:
```
[Diced onion]───┐
[Garlic cube]───┼→ [Sauté aromatics] → [Sautéed aromatics]
[Pepper flakes]─┘
```

### Pattern 3: Inventory Pull

```
[Inventory Item] → [Pull Step] → [Transient] → [Use Step] → [Output]
```

**Example**:
```
[Frozen garlic cubes] → [Pull cube] → [Garlic cube] → [Sauté] → [Aromatics]
```

### Pattern 4: Batch + JIT Assembly

```
[Stored Component A]──┐
[Stored Component B]──┼→ [JIT Assembly] → [Served Dish]
```

**Example**:
```
[Stew base]─────────┐
[Lemon-parsley mix]─┼→ [Serve with topping] → [Plated stew]
                     (just_in_time)
```

---

## Test Database Environment

### Overview

The system has two databases:
- **Production**: `http://192.168.50.95:8090` (port 8090)
- **Test**: `http://192.168.50.95:8091` (port 8091)

### Database Switcher UI

Located in the **top-right corner** of the AppBar:

- **🔴 RED chip "PROD"**: Currently viewing production database
- **🟢 GREEN chip "TEST"**: Currently viewing test database

**To switch**:
1. Click the colored chip
2. Select database from dropdown
3. Confirm if switching to production (safety feature)
4. Page reloads automatically

**Selection persists** across browser sessions (localStorage).

### Safety Features

1. **All import scripts hardcoded to test database**: No way to accidentally import to production
2. **Visual indicators**: Always clear which database you're viewing
3. **Confirmation dialogs**: Required when switching to production
4. **Separate data**: Test and production are completely isolated

### Workflow

```
1. Create import script (test DB)
2. Run import → Test Database
3. Switch UI to TEST
4. Verify recipe looks good
5. User manually promotes to production if satisfied
```

---

## Verification Checklist

After importing, verify:

- [ ] Recipe appears in Recipes list
- [ ] Recipe name is correct
- [ ] All expected products are present
- [ ] All steps are present
- [ ] Steps are in logical order
- [ ] Edges connect correctly (no orphaned nodes)
- [ ] Quantities and units are correct
- [ ] Product types are appropriate (raw/transient/stored/inventory)
- [ ] Step timing is correct (batch vs JIT)

---

## Troubleshooting

### Issue: "Product not found"
**Solution**: Run product matching scripts first. Check for naming variations (plural, parentheses, etc.)

### Issue: "Collection not found" or "Something went wrong"
**Solution**: Database may not be initialized with schema. Ensure test database has same schema as production.

### Issue: "Failed to create edge"
**Solution**: 
- Check that source and target IDs are valid
- Edges must be created AFTER nodes
- Verify you're using correct edge collection (product_to_step vs step_to_product)

### Issue: "Too many transient products"
**Solution**: Consider if some should be stored. Merge similar transient products where logical.

### Issue: Import script fails partway through
**Solution**: 
- Note the last successfully created ID
- Check error message for specific issue
- May need to manually delete partial import and try again
- Cascade delete on recipes should clean up related records

### Issue: Can't see recipe in UI
**Solution**:
- Confirm you're viewing the TEST database (green chip)
- Refresh the page
- Check browser console for errors

---

## File Structure Reference

```
/recipe-planner/
  check-existing-products.js       # Check for existing products
  find-product-matches.js          # Pattern-based product search
  product-check-results.json       # Output from product matching
  import-white-bean-stew.js        # Example import script
  sync-to-test.js                  # Sync production → test (if needed)
  src/
    lib/
      db-config.ts                 # Database URLs and environment config
      pocketbase.ts                # PocketBase client with switching support
    components/
      DatabaseSwitcher.tsx         # UI component for switching databases
      Layout.tsx                   # Main layout (includes DatabaseSwitcher)
/
  white-bean-stew-flow.md          # Example: Flow visualization
  RECIPE-IMPORT-GUIDE.md           # This guide
  pb_schema.json                   # Database schema reference
```

---

## Complete Example

See the **White Bean and Tomato Stew** import for a complete working example:

- **Flow diagram**: [`white-bean-stew-flow.md`](./white-bean-stew-flow.md)
- **Product matching results**: `recipe-planner/product-check-results.json`
- **Import script**: [`recipe-planner/import-white-bean-stew.js`](./recipe-planner/import-white-bean-stew.js)

**Stats from example**:
- 23 total products (9 existing + 12 created + 2 stored outputs)
- 11 steps (5 prep + 5 batch cooking + 1 JIT assembly)
- 32 edges
- Recipe ID: `3949g3912g5x188` (in test database)

---

## Quick Reference Commands

```bash
# Check for existing products
cd recipe-planner
node check-existing-products.js

# Find product matches with patterns
node find-product-matches.js

# Run import (always goes to test database)
node import-[recipe-name].js

# Start frontend to verify
npm run dev

# Sync production to test (if needed)
npm run sync-to-test
```

---

## Best Practices Summary

1. **Always analyze first**: Create flow diagram before coding
2. **Check existing products**: Reuse before creating new
3. **Use consistent naming**: Follow the naming conventions
4. **Hardcode test database**: Never risk production
5. **Verify in UI**: Always check the import visually
6. **Document as you go**: Update flow diagram if changes occur
7. **Products never connect directly**: Always use step edges
8. **Be specific with timing**: Batch vs JIT matters for planning

---

## Questions?

For additional help:
- [`integrationGuide.md`](./integrationGuide.md) - API details
- [`decisions.md`](./decisions.md) - Architecture decisions
- Schema files: `pb_schema.json`, `pb_schema_updated.json`
- Test database plans: `plans/test-database-environment.md`
