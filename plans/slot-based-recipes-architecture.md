# Slot-Based Recipes with Custom Units - Unified Architecture

## Problem Statement

Need to support **compositional recipes** where:

1. **Template recipes** have **slots** that need to be filled (e.g., "Split Dish" with Protein/Veg/Fruit slots)
2. **Component recipes** produce outputs in **custom units** (e.g., "Salmon → 7 Micah servings")
3. **Planning-time allocation** matches component outputs to template slots
4. **Validation** warns about insufficient or excess food
5. **Integration** with make-or-buy decisions

**Example Use Case: Infant Split Dishes**

- Split Dish template (7 needed for the week)

  - Slot 1: Protein (1 Micah serving each)
  - Slot 2: Vegetable (1 Micah serving each)
  - Slot 3: Fruit (1 Micah serving each)

- Component recipes:
  - Salmon recipe → 7 Micah servings of Salmon
  - Sweet Potato recipe → 10 Micah servings of Sweet Potatoes
  - Blackberry recipe → 7 Micah servings of Blackberries

---

## Core Concepts

### 1. Custom Units

Units can be **standard** (cups, lbs, oz) or **custom** (Micah servings, Adult portions).

**Use cases:**

- Portion control: "1 Micah serving" = specific amount for infant
- Meal counting: "3 Adult servings" = serves 3 people
- Custom packaging: "1 popsicle", "1 muffin"

### 2. Template Recipes (Slot-Based)

Recipes that define a **structure to be filled** rather than specific ingredients.

**Characteristics:**

- Has **slots** instead of specific product inputs
- Each slot specifies: name, allowed products, unit requirement
- Outputs a **composed product** (the assembled split dish)

### 3. Component Recipes

Regular recipes that produce outputs in **custom units** that can fill slots.

**Characteristics:**

- Standard recipe graph (inputs → steps → outputs)
- Outputs specify custom units matching slot requirements
- Can be used standalone OR to fill template slots

### 4. Slot Allocation

At **weekly planning time**, system tracks:

- Which component recipes fill which template slots
- Total supply vs. demand for each slot
- Warnings for under/over production

---

## Data Model

### 1. Units Registry (NEW)

```typescript
// New collection: units
interface Unit {
  id: string;
  name: string; // "Micah serving", "Adult portion", "cup", "lb"
  type: "custom" | "standard";
  description?: string; // "Single meal portion for infant Micah"
}
```

**Standard units:** Built-in (cups, lbs, etc.) - type = 'standard'
**Custom units:** User-defined (Micah servings) - type = 'custom'

### 2. Recipe Types (ENHANCED)

```typescript
interface Recipe {
  // ... existing fields
  recipe_type: "standard" | "template" | "component";
}
```

- **standard**: Regular recipe (current behavior)
- **template**: Has slots to be filled
- **component**: Produces outputs for filling slots (but is also a regular recipe)

### 3. Recipe Slots (NEW)

```typescript
// New collection: recipe_slots
interface RecipeSlot {
  id: string;
  recipe: string; // relation to recipes (must be template type)
  slot_name: string; // "Protein", "Vegetable", "Fruit"
  slot_order: number; // Display order

  // What can fill this slot?
  allowed_products: string[]; // relation to products (multiple)
  // e.g., Protein slot allows: [Salmon, Chicken, Beef]

  required_unit: string; // relation to units
  // e.g., "Micah serving"

  quantity_per_instance: number; // How much per template instance
  // e.g., 1 (need 1 Micah serving per split dish)
}
```

**Example: Split Dish Template**

```
Recipe: "Split Dish" (type=template)
Slots:
  1. slot_name="Protein", allowed_products=[Salmon, Chicken], required_unit="Micah serving", quantity=1
  2. slot_name="Vegetable", allowed_products=[Sweet Potato, Broccoli], required_unit="Micah serving", quantity=1
  3. slot_name="Fruit", allowed_products=[Blackberries, Blueberries], required_unit="Micah serving", quantity=1
```

### 4. Product Nodes with Units (ENHANCED)

```typescript
interface RecipeProductNode {
  // ... existing fields
  unit: string; // relation to units (instead of free text)
  // Now references units registry
}
```

This allows products to specify outputs in custom units:

- "Salmon" recipe outputs "7 Micah servings"
- "Sweet Potato" recipe outputs "10 Micah servings"

### 5. Slot Allocations (NEW)

```typescript
// New collection: slot_allocations
interface SlotAllocation {
  id: string;
  weekly_plan: string; // relation to weekly_plans
  template_meal: string; // relation to planned_meals (the template)
  slot: string; // relation to recipe_slots

  // What fills this slot?
  component_meal: string; // relation to planned_meals (the component recipe)
  component_product: string; // relation to products (specific output)

  quantity_allocated: number; // How much of component goes to this slot
}
```

This tracks **at planning time** which component recipes fill which template slots.

**Example:**

```
Weekly Plan: "March 15-21"
Template: Split Dish (quantity=7)
Allocations:
  - slot="Protein", component_meal="Salmon Recipe", quantity_allocated=7
  - slot="Vegetable", component_meal="Sweet Potato Recipe", quantity_allocated=7
  - slot="Fruit", component_meal="Blackberry Recipe", quantity_allocated=7
```

---

## Unified Flow

### Phase 1: Recipe Authoring

#### Creating a Template Recipe

```
1. Create recipe "Split Dish"
2. Set recipe_type = "template"
3. Add slots:
   - Protein slot (Micah servings, 1 per dish)
   - Vegetable slot (Micah servings, 1 per dish)
   - Fruit slot (Micah servings, 1 per dish)
4. Define allowed products per slot
5. Output: "Split Dish" (stored, in divided containers)
```

**Graph Structure:**

```
[SLOTS] → [Assembly Step] → [Split Dish Output]

Slots are special input nodes that need to be filled at planning time
```

#### Creating a Component Recipe

```
1. Create recipe "Salmon for Micah"
2. Set recipe_type = "component" (optional flag, really it's just a standard recipe)
3. Inputs: Raw salmon, seasonings
4. Steps: Prep → Cook → Portion
5. Output: "Salmon" (stored, 7 Micah servings, in containers)
```

**Key:** Output specifies **custom unit** "Micah servings"

### Phase 2: Weekly Planning

#### Step 1: Add Template to Plan

```
User: Add "Split Dish" x7 to weekly plan
System: Detects this is a template recipe
System: Shows slot allocation UI
```

#### Step 2: Slot Allocation UI

```
┌────────────────────────────────────────────────────────┐
│ Fill Slots for: Split Dish (7 dishes)                  │
├────────────────────────────────────────────────────────┤
│                                                         │
│ Slot 1: Protein (need 7 Micah servings)                │
│ ○ Use existing component recipe:                        │
│   [Salmon for Micah ▼] (produces 7 servings) ✓         │
│ ○ Add to shopping list (buy prepared)                   │
│                                                         │
│ Slot 2: Vegetable (need 7 Micah servings)              │
│ ○ Use existing component recipe:                        │
│   [Sweet Potato for Micah ▼] (produces 10 servings)    │
│   ⚠️ Will have 3 extra servings                        │
│ ○ Add to shopping list (buy prepared)                   │
│                                                         │
│ Slot 3: Fruit (need 7 Micah servings)                  │
│ ○ Use existing component recipe:                        │
│   [Blackberries for Micah ▼] (produces 7 servings) ✓   │
│ ○ Add to shopping list (buy prepared)                   │
│                                                         │
│ Status: ⚠️ 3 extra Sweet Potato servings                │
│                                                         │
│                     [Cancel]  [Confirm Allocations]     │
└────────────────────────────────────────────────────────┘
```

**User can:**

- Choose component recipe for each slot
- See quantity match/mismatch warnings
- Choose to buy prepared items instead

**System creates:**

- Allocations for each slot
- Adds component recipes to weekly plan
- Tracks dependencies

#### Step 3: Shopping List Generation

**With Allocations:**

```
Split Dish (7) needs:
  - Salmon recipe → needs raw salmon
  - Sweet Potato recipe → needs sweet potatoes
  - Blackberry recipe → needs blackberries

Shopping List:
  • Raw salmon (1 lb)
  • Sweet potatoes (2 lbs)
  • Fresh blackberries (2 pints)
```

**Without Allocations (Buy prepared):**

```
Split Dish (7) needs:
  - Protein (buy prepared): 7 Micah servings
  - Vegetable (buy prepared): 7 Micah servings
  - Fruit (buy prepared): 7 Micah servings

Pantry Check:
  • Prepared salmon portions (check freezer)
  • Prepared sweet potato portions (check freezer)
  • Fresh blackberries (check fridge)
```

---

## Integration with Make-or-Buy

The two features work together naturally:

### Scenario: Chicken Stock in Component Recipe

```
Component Recipe: "Chicken Noodle Soup for Micah"
├─ Inputs:
│  ├─ Chicken (raw)
│  ├─ Noodles (raw)
│  └─ Chicken Stock (raw, make-or-buy) ← DECISION POINT
├─ Steps: Cook
└─ Output: Soup (10 Micah servings)

Template Recipe: "Split Dish"
└─ Slot: Protein (needs 7 Micah servings)
    └─ Filled by: Chicken Noodle Soup (10 servings, 3 extra)
```

**Planning Flow:**

1. User allocates Soup to Protein slot
2. System adds Soup recipe to plan
3. System detects Stock has `source_recipe`
4. **Make-or-buy dialog** appears for Stock
5. User chooses make/buy
6. If make: Add Stock recipe ingredients to shopping list
7. If buy: Add Stock to pantry check

---

## Validation & Warnings

### 1. Insufficient Supply

```
❌ ERROR: Split Dish (7) - Protein slot
   Need: 7 Micah servings
   Have: 5 Micah servings (from Salmon recipe)
   Missing: 2 Micah servings

   Actions:
   - Increase Salmon recipe quantity
   - Add another component recipe
   - Buy 2 prepared servings
```

### 2. Excess Supply

```
⚠️ WARNING: Split Dish (7) - Vegetable slot
   Need: 7 Micah servings
   Have: 10 Micah servings (from Sweet Potato recipe)
   Extra: 3 Micah servings

   Actions:
   - Reduce Sweet Potato recipe quantity
   - Plan another meal using extras
   - Freeze extras for next week
```

### 3. Unallocated Slots

```
❌ ERROR: Split Dish (7) - Fruit slot
   Status: Not allocated
   Need: 7 Micah servings

   Actions:
   - Select a component recipe
   - Buy prepared fruit
```

### 4. Unit Mismatch

```
❌ ERROR: Cannot allocate "Salmon" to Vegetable slot
   Slot requires: Micah serving
   Recipe outputs: cups

   Units must match!
```

---

## Data Model Summary

```
graph TD
    A[Weekly Plan] -->|has many| B[Planned Meals]
    B -->|references| C[Recipe]
    C -->|type: template| D[Recipe Slots]
    D -->|specifies| E[Allowed Products]
    D -->|specifies| F[Required Unit]

    A -->|has many| G[Slot Allocations]
    G -->|references| D
    G -->|filled by| B
    G -->|specific product| E

    C -->|type: component| H[Product Nodes]
    H -->|uses| F
    H -->|can be| I[Make-or-Buy Product]
    I -->|optionally links to| J[Source Recipe]

    F[Unit] -->|type| K{Standard or Custom}
```

### New Collections

1. **units**: Define standard and custom units
2. **recipe_slots**: Define slots in template recipes
3. **slot_allocations**: Track which components fill which slots per weekly plan

### Enhanced Collections

1. **recipes**: Add `recipe_type` field
2. **recipe_product_nodes**: Change `unit` from text to relation
3. **products**: Add `source_recipe` for make-or-buy

---

## UI Mockups

### Recipe Editor - Template Mode

```
┌─────────────────────────────────────────────────────────┐
│ Recipe: Split Dish                  [Template Recipe ▼] │
├─────────────────────────────────────────────────────────┤
│ Graph View:                                              │
│                                                          │
│  [PROTEIN SLOT]                                          │
│    ↓                                                     │
│  [VEGETABLE SLOT] → [Assemble] → [Split Dish (stored)]  │
│    ↓                                                     │
│  [FRUIT SLOT]                                            │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ Slot Configuration:                                      │
│                                                          │
│ Slot 1: Protein                                          │
│ • Allowed: [Salmon, Chicken, Beef] [Edit]               │
│ • Unit: [Micah serving ▼]                                │
│ • Quantity per dish: [1]                                 │
│                                                          │
│ Slot 2: Vegetable                                        │
│ • Allowed: [Sweet Potato, Broccoli, Carrots] [Edit]     │
│ • Unit: [Micah serving ▼]                                │
│ • Quantity per dish: [1]                                 │
│                                                          │
│ [+ Add Slot]                                             │
└─────────────────────────────────────────────────────────┘
```

### Weekly Plan - Allocation View

```
┌─────────────────────────────────────────────────────────┐
│ Weekly Plan: March 15-21                                 │
├─────────────────────────────────────────────────────────┤
│ Regular Meals:                                           │
│ ☑ Risotto (Wed dinner)                                   │
│ ☑ Pasta (Thu dinner)                                     │
│                                                          │
│ Template Meals:                                          │
│ ☑ Split Dish (7 dishes, Mon-Sun lunch)                   │
│   ├─ Protein: Salmon Recipe (7/7 servings) ✓            │
│   ├─ Vegetable: Sweet Potato Recipe (10/7) ⚠️ +3 extra   │
│   └─ Fruit: Blackberry Recipe (7/7 servings) ✓          │
│                                                          │
│ Component Recipes Added:                                 │
│ • Salmon for Micah → 7 servings                          │
│   └─ Chicken Stock (make-or-buy): Making from scratch   │
│ • Sweet Potato for Micah → 10 servings ⚠️                 │
│ • Blackberry for Micah → 7 servings                      │
│                                                          │
│ Warnings:                                                │
│ ⚠️ 3 extra Sweet Potato servings - plan to use or freeze │
│                                                          │
│                [Edit Allocations]  [Generate Lists]       │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Custom Units

- Add units registry
- Update product nodes to use unit relations
- UI for managing custom units

### Phase 2: Template Recipes

- Add recipe_type field
- Add recipe_slots collection
- Recipe editor support for creating template recipes
- Slot configuration UI

### Phase 3: Slot Allocation

- Add slot_allocations collection
- Allocation UI in weekly planning
- Validation logic (sufficient/excess warnings)

### Phase 4: Make-or-Buy Integration

- Add source_recipe to products
- Make-or-buy decision UI
- Combine with slot allocation flow

### Phase 5: Aggregation Logic

- Update shopping list generation to handle:
  - Template expansions
  - Component recipe ingredients
  - Make-or-buy decisions
  - Allocation tracking

---

## Benefits

✅ **Flexible Meal Planning**: Mix template and standard recipes
✅ **Portion Control**: Custom units for specific dietary needs
✅ **Batch Cooking**: Make 10 servings, use 7 now, freeze 3
✅ **Validation**: Know exactly if you have too much/too little
✅ **Reusability**: Component recipes work standalone or in templates
✅ **Integration**: Works seamlessly with make-or-buy decisions

---

## Example Complete Flow

**Goal**: Plan split dishes for infant for the week

1. **Setup (once)**

   - Create custom unit: "Micah serving"
   - Create template: "Split Dish" with 3 slots
   - Create components: Salmon, Sweet Potato, Blackberry recipes (each outputs in Micah servings)

2. **Weekly Planning**

   - Add Split Dish x7 to plan
   - System shows allocation UI
   - Select Salmon → Protein slot (7/7 ✓)
   - Select Sweet Potato → Vegetable slot (10/7 ⚠️ +3)
   - Select Blackberries → Fruit slot (7/7 ✓)
   - Salmon recipe uses Stock → Make-or-buy decision → Choose "Make"
   - Confirm allocations

3. **Generated Lists**

   - **Shopping list**: Raw ingredients for Salmon, Sweet Potato, Blackberries, Stock
   - **Batch prep**: Includes Stock recipe, Salmon recipe, Sweet Potato recipe, Blackberry recipe
   - **Storage output**: 7 split dishes + 3 extra Sweet Potato portions
   - **Warnings**: "3 extra Sweet Potato servings - freeze for next week"

4. **Execution**
   - Follow batch prep list
   - Assemble 7 split dishes
   - Freeze 3 extra Sweet Potato portions

---

## Recommendation

Implement in phases, starting with:

1. Custom units (foundational)
2. Template recipes with slots
3. Allocation UI
4. Make-or-buy integration

This creates a powerful, flexible system for complex meal planning scenarios while maintaining clean architecture.
