# Refined Slot-Based Recipes - Multi-Unit Architecture

## Key Refinements

Based on feedback, the architecture is simplified:

1. ✅ **Multi-unit outputs** - Products can express quantity in multiple units (4 cups = 2 Micah servings)
2. ✅ **Dynamic filtering** - Slots filter available products by unit match (no manual product lists)
3. ✅ **Unit conversions** - System calculates partial usage and leftovers
4. ✅ **Simpler model** - No "allowed_products" complexity

---

## Core Concept: Multi-Unit Product Outputs

A recipe output can specify **multiple equivalent units**:

```typescript
Product Output: "Salmon"
Units:
  - 4 cups
  - 2 Micah servings
  - 1 recipe yield

Conversion relationships:
  4 cups = 2 Micah servings = 1 recipe yield
  Therefore: 1 Micah serving = 2 cups = 0.5 recipe yield
```

**Why this matters:**

- Slot needs 1 Micah serving → Use half the Salmon recipe (2 cups left)
- Another recipe needs 2 cups → Perfect! Use the leftover Salmon
- Enables flexible unit usage across different contexts

---

## Data Model (Simplified)

### 1. Units Registry

```typescript
// Collection: units
interface Unit {
  id: string;
  name: string; // "cup", "Micah serving", "Adult portion"
  type: "standard" | "custom";
  abbreviation?: string; // "c", "MS", "AP"
}
```

**Examples:**

- Standard: cup, lb, oz, tbsp, each
- Custom: Micah serving, Adult portion, Muffin, Popsicle

### 2. Product Unit Expressions (NEW)

```typescript
// Collection: product_unit_expressions
interface ProductUnitExpression {
  id: string;
  product_node: string; // relation to recipe_product_nodes
  unit: string; // relation to units
  quantity: number;
  is_primary: boolean; // One unit is "primary" for display
}
```

**Example: Salmon Recipe Output**

```
Product Node: "Salmon" (from Salmon recipe)
Unit Expressions:
  1. unit="cup", quantity=4, is_primary=true
  2. unit="Micah serving", quantity=2, is_primary=false
  3. unit="recipe yield", quantity=1, is_primary=false
```

**Usage:**

- All three expressions are **equivalent**
- 4 cups = 2 Micah servings = 1 recipe yield
- System can convert between them

### 3. Recipe Slots (SIMPLIFIED)

```typescript
// Collection: recipe_slots
interface RecipeSlot {
  id: string;
  recipe: string; // relation to recipes (template type)
  slot_name: string; // "Protein", "Vegetable", "Fruit"
  slot_order: number;

  required_unit: string; // relation to units
  // e.g., "Micah serving" - slots filter products by this

  quantity_per_instance: number; // Per template instance
  // e.g., 1 (need 1 Micah serving per split dish)
}
```

**Removed:**

- ❌ `allowed_products` - System filters automatically by unit match

### 4. Existing Collections (UNCHANGED)

- `recipes` - No changes needed
- `recipe_product_nodes` - Keep as is, unit expressions link to these
- `recipe_slots` - Simplified as shown above
- `slot_allocations` - No changes needed

---

## How It Works

### Scenario: Creating Salmon Recipe

```
Recipe: "Salmon for Micah"
Steps:
  1. Prep → Cook → Portion
Outputs:
  Product Node: "Salmon" (stored)
    Unit Expressions:
      • 4 cups (primary)
      • 2 Micah servings
      • 1 recipe yield
```

**Recipe Editor UI:**

```
┌────────────────────────────────────────┐
│ Output: Salmon                         │
├────────────────────────────────────────┤
│ Unit Expressions:                      │
│                                        │
│ ● 4 [cup ▼] (primary display unit)    │
│   2 [Micah serving ▼]                  │
│   1 [recipe yield ▼]                   │
│                                        │
│ These are equivalent quantities.       │
│ 4 cups = 2 Micah servings = 1 yield   │
│                                        │
│ [+ Add Unit Expression]                │
└────────────────────────────────────────┘
```

### Scenario: Creating Split Dish Template

```
Recipe: "Split Dish" (template type)
Slots:
  1. Protein (unit=Micah serving, qty=1)
  2. Vegetable (unit=Micah serving, qty=1)
  3. Fruit (unit=Micah serving, qty=1)
Output:
  Split Dish (stored, in divided containers)
```

### Scenario: Weekly Planning - Slot Allocation

**User adds Split Dish x7 to weekly plan**

**System shows allocation UI:**

```
┌──────────────────────────────────────────────────────┐
│ Fill Slots for: Split Dish (7 dishes)                │
├──────────────────────────────────────────────────────┤
│                                                       │
│ Slot 1: Protein (need 7 Micah servings)             │
│                                                       │
│ Available recipes that output "Micah serving":       │
│ ○ Salmon for Micah (2 Micah servings per recipe)    │
│   └─ Need 3.5 recipes → Make 4x = 8 servings         │
│   └─ Will have 1 Micah serving (2 cups) left over   │
│                                                       │
│ ○ Chicken for Micah (3 Micah servings per recipe)   │
│   └─ Need 2.33 recipes → Make 3x = 9 servings        │
│   └─ Will have 2 Micah servings (4 cups) left over  │
│                                                       │
│ ○ Buy prepared (add to shopping list)                │
│                                                       │
│ [Select: Salmon for Micah]                           │
│                                                       │
├──────────────────────────────────────────────────────┤
│ Slot 2: Vegetable (need 7 Micah servings)           │
│ ...                                                   │
└──────────────────────────────────────────────────────┘
```

**Key behaviors:**

1. System automatically finds recipes with "Micah serving" outputs
2. Calculates how many times to make each recipe
3. Shows leftover amounts in BOTH units (Micah servings AND cups)
4. No manual product list management needed

---

## Unit Conversion Logic

### Conversion System

```typescript
interface UnitConversion {
  // Given a product with multiple unit expressions,
  // convert from one unit to another

  fromQuantity: number;
  fromUnit: string;
  toUnit: string;
  // Returns: toQuantity
}

function convertUnits(
  productNode: RecipeProductNode,
  fromQty: number,
  fromUnit: string,
  toUnit: string
): number {
  // Find unit expressions for this product node
  const expressions = getUnitExpressions(productNode);

  // Find the two units
  const fromExpr = expressions.find((e) => e.unit === fromUnit);
  const toExpr = expressions.find((e) => e.unit === toUnit);

  if (!fromExpr || !toExpr) {
    throw new Error("Unit not found for this product");
  }

  // Calculate conversion ratio
  // Example: 4 cups = 2 Micah servings
  // From 1 Micah serving to cups: (1 / 2) * 4 = 2 cups
  const ratio = toExpr.quantity / fromExpr.quantity;
  return fromQty * ratio;
}
```

### Example Calculations

**Recipe outputs: 4 cups = 2 Micah servings**

Convert 1 Micah serving to cups:

```
ratio = 4 cups / 2 Micah servings = 2 cups per Micah serving
1 Micah serving * 2 = 2 cups
```

Convert 3 cups to Micah servings:

```
ratio = 2 Micah servings / 4 cups = 0.5 Micah servings per cup
3 cups * 0.5 = 1.5 Micah servings
```

---

## Slot Filtering Logic

```typescript
function getCompatibleRecipes(
  slot: RecipeSlot,
  allRecipes: Recipe[]
): Recipe[] {
  const requiredUnit = slot.required_unit;

  return allRecipes.filter((recipe) => {
    // Get all product nodes (outputs) from this recipe
    const outputs = getRecipeOutputs(recipe);

    // Check if ANY output has an expression in the required unit
    return outputs.some((output) => {
      const expressions = getUnitExpressions(output);
      return expressions.some((expr) => expr.unit === requiredUnit);
    });
  });
}
```

**Example:**

```
Slot requires: "Micah serving"

Recipe A outputs:
  • Salmon: 4 cups, 2 Micah servings ✓ (has Micah serving)

Recipe B outputs:
  • Pasta: 6 cups, 4 Adult portions ✗ (no Micah serving)

Recipe C outputs:
  • Sweet Potato: 2 lbs, 5 Micah servings ✓ (has Micah serving)

Compatible recipes: A, C
```

---

## Leftover Tracking

### Scenario: Using Partial Recipes

**Setup:**

```
Recipe: "Salmon for Micah" makes:
  • 4 cups
  • 2 Micah servings

Split Dish needs:
  • 1 Micah serving per dish
  • 7 dishes total = 7 Micah servings
```

**Calculation:**

```
Need: 7 Micah servings
Recipe makes: 2 Micah servings each
Recipes needed: 7 / 2 = 3.5 recipes

Options:
1. Make 4 recipes (8 Micah servings)
   Leftover: 1 Micah serving = 2 cups

2. Make 3 recipes (6 Micah servings)
   Short: 1 Micah serving = 2 cups
   (User must buy or make more)
```

**System recommends:**

```
⚠️ Recommended: Make 4x Salmon for Micah
   • Provides 8 Micah servings (4 cups each = 16 cups total)
   • Uses 7 Micah servings for Split Dishes
   • Leftover: 1 Micah serving (2 cups)

💡 Suggestions for leftover:
   • Freeze for next week
   • Add to another meal
   • Snack portions
```

---

## Migration: Adding Units to Existing Recipes

### Phase 1: Create Custom Units

```
1. Create unit: "Micah serving"
2. Create unit: "Adult portion"
3. Keep standard units: cup, lb, oz, etc.
```

### Phase 2: Update Recipe Outputs

For each recipe, add unit expressions to outputs:

**Example: Existing recipe "Salmon"**

```
Current state:
  Output: Salmon, 4 cups

New state:
  Output: Salmon
    Expressions:
      • 4 cups (primary)
      • 2 Micah servings (new)
      • 1 recipe yield (new)
```

**UI Workflow:**

```
1. Open recipe "Salmon for Micah"
2. Click on output product node
3. See current: "4 cups"
4. Click "Add Unit Expression"
5. Select unit: "Micah serving"
6. Enter quantity: 2
7. System calculates: 4 cups = 2 Micah servings
8. Save
```

### Phase 3: Mark Primary Unit

Each product should have one primary unit for display:

- Shopping lists show primary unit
- Recipe displays show primary unit
- Other units are for conversion only

---

## Complete Example Flow

### Setup (One-Time)

**1. Create custom unit:**

```
Unit: "Micah serving"
Type: custom
Description: "Single meal portion for infant Micah (~2 oz or 1/4 cup)"
```

**2. Create component recipes:**

**Salmon Recipe:**

```
Inputs: Raw salmon (1 lb), seasonings
Steps: Prep → Bake → Portion
Output: Salmon (stored)
  • 4 cups (primary)
  • 2 Micah servings
```

**Sweet Potato Recipe:**

```
Inputs: Sweet potatoes (2 lbs)
Steps: Roast → Mash → Portion
Output: Sweet Potato Mash (stored)
  • 5 cups (primary)
  • 10 Micah servings
```

**Blackberry Recipe:**

```
Inputs: Blackberries (2 pints)
Steps: Wash → Puree → Portion
Output: Blackberry Puree (stored)
  • 3 cups (primary)
  • 7 Micah servings
```

**3. Create template:**

```
Recipe: "Split Dish" (template type)
Slots:
  1. Protein (unit=Micah serving, qty=1)
  2. Vegetable (unit=Micah serving, qty=1)
  3. Fruit (unit=Micah serving, qty=1)
Output: Split Dish (7x divided containers)
```

### Weekly Planning

**1. Add template to plan:**

```
User: Add "Split Dish" x7
System: Shows slot allocation UI
```

**2. Fill Protein slot:**

```
Need: 7 Micah servings

Compatible recipes (have "Micah serving" output):
• Salmon (2 MS per recipe) - Need 4x, leftover 1 MS (2 cups)
• Chicken (3 MS per recipe) - Need 3x, leftover 2 MS (4 cups)

User selects: Salmon 4x
```

**3. Fill Vegetable slot:**

```
Need: 7 Micah servings

Compatible recipes:
• Sweet Potato (10 MS per recipe) - Need 1x, leftover 3 MS (1.5 cups)
• Broccoli (8 MS per recipe) - Need 1x, leftover 1 MS (0.5 cups)

User selects: Sweet Potato 1x
```

**4. Fill Fruit slot:**

```
Need: 7 Micah servings

Compatible recipes:
• Blackberry (7 MS per recipe) - Need 1x, perfect! ✓
• Blueberry (10 MS per recipe) - Need 1x, leftover 3 MS (2 cups)

User selects: Blackberry 1x
```

**5. System adds to plan:**

```
Weekly Plan now includes:
• Split Dish x7 (template)
• Salmon for Micah x4
• Sweet Potato for Micah x1
• Blackberry for Micah x1

Leftovers:
• 1 Micah serving Salmon (2 cups) - Freeze or use elsewhere
• 3 Micah servings Sweet Potato (1.5 cups) - Freeze or use elsewhere
```

**6. Shopping list generated:**

```
From Salmon x4:
  • Raw salmon: 4 lbs
  • Seasonings: as needed

From Sweet Potato x1:
  • Sweet potatoes: 2 lbs

From Blackberry x1:
  • Fresh blackberries: 2 pints
```

---

## Batch Prep List

```
RAW PROCESSING
□ Raw salmon (4 lbs) → prep → prepped salmon (4 lbs)
□ Sweet potatoes (2 lbs) → peel, cube → cubed sweet potato (2 lbs)
□ Blackberries (2 pints) → wash → washed blackberries (2 pints)

COOKING
□ Prepped salmon (4 lbs) → bake → cooked salmon (4 portions)
□ Cubed sweet potato (2 lbs) → roast, mash → sweet potato mash (1 batch)
□ Washed blackberries (2 pints) → puree → blackberry puree (1 batch)

PORTIONING
□ Cooked salmon → portion → Salmon containers (4x)
  └─ Label: "Salmon - 4 cups (2 MS ea)"
□ Sweet potato mash → portion → Sweet Potato containers (1x)
  └─ Label: "Sweet Potato - 5 cups (10 MS total)"
□ Blackberry puree → portion → Blackberry containers (1x)
  └─ Label: "Blackberry - 3 cups (7 MS total)"

ASSEMBLY
□ Assemble Split Dishes:
  - Get Salmon (need 7 MS = 14 cups = 3.5 containers)
  - Get Sweet Potato (need 7 MS = 3.5 cups = 0.7 containers)
  - Get Blackberry (need 7 MS = 3 cups = 1 container)
  - Fill 7 divided containers (1 MS each slot)

LEFTOVERS
□ Label and freeze:
  - Salmon: 1 MS (2 cups) in 1 container
  - Sweet Potato: 3 MS (1.5 cups) in 1 container
```

---

## Benefits of Multi-Unit Approach

✅ **Flexible unit usage** - Same recipe works in different contexts
✅ **Automatic filtering** - No manual product lists per slot
✅ **Conversion tracking** - Know exactly how much is left in any unit
✅ **Batch efficiency** - Make once, use in multiple ways
✅ **Gradual adoption** - Add units to recipes as needed
✅ **Universal approach** - Works for infant portions, adult servings, batch cooking

---

## Implementation Plan

### Phase 1: Units Infrastructure

1. Create `units` collection
2. Seed with standard units (cup, lb, oz, each, etc.)
3. UI for adding custom units
4. Add "Micah serving" as first custom unit

### Phase 2: Multi-Unit Expressions

1. Create `product_unit_expressions` collection
2. Update recipe editor to support multiple units per output
3. Set one unit as "primary" for display
4. Migration tool to convert existing single-unit outputs

### Phase 3: Template Recipes

1. Add `recipe_type` field to recipes
2. Create `recipe_slots` collection
3. Recipe editor support for template mode
4. Slot configuration UI

### Phase 4: Slot Allocation

1. Create `slot_allocations` collection
2. Build allocation UI with unit-based filtering
3. Implement conversion logic
4. Add leftover calculations and warnings

### Phase 5: Aggregation Updates

1. Update shopping list to handle template expansions
2. Update batch prep list to show multi-unit portions
3. Add leftover tracking to outputs view

---

## Recommendation

Start with **Phase 1** (Units Infrastructure) to establish foundation, then add unit expressions to existing recipes before building template functionality. This allows gradual migration and validates the approach before complex features.
