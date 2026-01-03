# Make-or-Buy Ingredients - Architectural Design

## Problem Statement

Some ingredients can either be:
1. **Made from scratch** - requires a sub-recipe and shopping for raw ingredients
2. **Purchased from store** - appears as a single item on shopping list

**Example**: Chicken Stock
- Make: Buy bones, vegetables, water → Make stock
- Buy: Buy prepared chicken stock from store

This decision may vary week-to-week based on time, cost, or availability.

---

## Current Architecture Review

From [`decisions.md`](decisions.md:45-48):
> **Recipe Scope**
> - Recipes are self-contained graphs
> - Shared intermediates (e.g., stock used in multiple recipes) are modeled as separate recipes; user manages planning accordingly

**Current approach**: Stock is a separate recipe that can be added to the weekly plan.

**Gap**: No way to model that a product can EITHER be made OR bought, and no UI to choose between them at planning time.

---

## Design Options

### Option 1: Two Separate Products ❌

Create two products: "Chicken Stock (Homemade)" and "Chicken Stock (Store-bought)"

**Pros:**
- Works with existing model
- No code changes needed

**Cons:**
- Product duplication
- Recipes must use specific variant
- Switching preference requires editing all recipes
- Confusing product list

**Verdict:** Too manual and error-prone

---

### Option 2: Product Source Recipe Link ✅ RECOMMENDED

Add optional link from Product to Recipe that produces it.

**Data Model Changes:**

```typescript
// products table
interface Product {
  // ... existing fields
  source_recipe?: string; // relation to recipes (optional)
}
```

**Product Types:**
- **Purchasable Only**: No source_recipe (e.g., "chicken breast")
- **Make-Only**: Has source_recipe, no store/section (e.g., "bechamel sauce")  
- **Make-or-Buy**: Has BOTH source_recipe AND store/section (e.g., "chicken stock")

**Weekly Planning Flow:**

1. User adds recipe to weekly plan
2. System detects products with `source_recipe` set
3. For each make-or-buy product, show decision UI:
   ```
   Chicken Stock (3 cups needed)
   ○ Buy from store
   ○ Make from scratch (adds "Chicken Stock Recipe" to plan)
   ```
4. User's choice is stored per weekly plan
5. Aggregation logic respects the choice:
   - If "Buy": Add to shopping list
   - If "Make": Add source recipe to plan, aggregate its ingredients

---

### Option 3: Planning-Time Substitution

Products stay unchanged, but at planning time you can "substitute" a product with a recipe.

**Cons:**
- More complex UI/UX
- Doesn't model the relationship
- Hard to remember which products have recipes
- No validation that recipe actually produces that product

**Verdict:** Too implicit, error-prone

---

## Recommended Solution: Option 2 Details

### Data Model

#### 1. Add `source_recipe` to products table

```sql
-- In PocketBase schema
products {
  ...existing fields...
  source_recipe: relation -> recipes (optional)
}
```

#### 2. Add make-or-buy decisions to weekly plans

```sql
planned_meal_product_decisions {
  id: auto
  weekly_plan: relation -> weekly_plans
  product: relation -> products
  decision: select(make | buy)
}
```

This stores the user's choice per product per weekly plan.

---

### Recipe Authoring Workflow

**Adding a make-or-buy product:**

1. Author creates recipe "Chicken Stock Recipe"
   - Inputs: bones, onion, carrot, water (all raw)
   - Outputs: chicken stock (stored, 6 cups)

2. Author creates/edits product "Chicken Stock"
   - Type: raw (because it CAN be purchased)
   - Pantry: true (check before buying)
   - Store: Costco
   - Section: Pantry
   - **Source Recipe**: → Chicken Stock Recipe ← NEW FIELD

3. Use "Chicken Stock" in other recipes
   - Add as raw ingredient input
   - System knows it can be made or bought

---

### Weekly Planning Workflow

#### Scenario: User planning "Risotto" recipe that needs 2 cups chicken stock

**Step 1: Add Risotto to weekly plan**
- System detects "Chicken Stock" has `source_recipe` set
- Shows make-or-buy decision UI

**Step 2: User chooses**

**Option A: Buy**
```
☑ Buy from store
  → Adds "Chicken Stock (2 cups)" to pantry check list
```

**Option B: Make**
```
☑ Make from scratch
  → Adds "Chicken Stock Recipe" to plan
  → Aggregates ingredients from that recipe to shopping list
  → Tracks that this recipe produces stock for Risotto
```

**Step 3: Shopping list generated**
- If "Buy": Shows "Chicken Stock" in pantry check
- If "Make": Shows bones, onion, carrot, etc. with quantities

---

### UI Design

#### Product Form (Add/Edit)

```
┌─────────────────────────────────────────┐
│ Edit Product: Chicken Stock             │
├─────────────────────────────────────────┤
│ Name: [Chicken Stock_____________]      │
│                                          │
│ Type: [Raw ▼]                           │
│                                          │
│ ☑ Pantry item                           │
│                                          │
│ Store: [Costco ▼]                       │
│ Section: [Pantry ▼]                     │
│                                          │
│ ┌────────────────────────────────────┐ │
│ │ 🔧 Can Be Made From Scratch        │ │
│ │                                     │ │
│ │ Source Recipe:                      │ │
│ │ [Chicken Stock Recipe ▼]           │ │
│ │                                     │ │
│ │ When this product is used in a     │ │
│ │ weekly plan, you'll be asked       │ │
│ │ whether to make or buy it.         │ │
│ └────────────────────────────────────┘ │
│                                          │
│           [Cancel]  [Save]               │
└─────────────────────────────────────────┘
```

#### Weekly Planning - Make or Buy Dialog

```
┌─────────────────────────────────────────┐
│ Make or Buy Decision                     │
├─────────────────────────────────────────┤
│ You need Chicken Stock (2 cups)         │
│                                          │
│ ○ Buy from store                         │
│   └─ Check pantry first                  │
│   └─ Buy if needed (Costco, Pantry)     │
│                                          │
│ ● Make from scratch                      │
│   └─ Adds "Chicken Stock Recipe"         │
│   └─ Shop for: bones, onion, carrot      │
│   └─ Yields 6 cups (enough for 3 meals) │
│                                          │
│ Apply this choice to all recipes using  │
│ chicken stock this week? [Yes] [No]     │
│                                          │
│           [Cancel]  [Confirm]            │
└─────────────────────────────────────────┘
```

#### Weekly Plan View - Shows Decisions

```
┌─────────────────────────────────────────┐
│ Weekly Plan: March 15-21                │
├─────────────────────────────────────────┤
│ Meals:                                   │
│ □ Risotto                                │
│ □ Chicken Noodle Soup                    │
│ □ Gravy and Mashed Potatoes             │
│                                          │
│ Make-or-Buy Decisions:                   │
│ • Chicken Stock (6 cups needed)          │
│   ✓ Make from scratch                    │
│   Used in: Risotto, Soup, Gravy         │
│   [Change Decision]                      │
│                                          │
│           [Generate Lists]                │
└─────────────────────────────────────────┘
```

---

### Aggregation Logic Changes

```typescript
function buildShoppingList(
  plannedMeals: PlannedMeal[],
  makeOrBuyDecisions: Map<string, 'make' | 'buy'>,
  recipeData: Map<string, RecipeGraphData>
): AggregatedProduct[] {
  
  // 1. Expand plans based on decisions
  const expandedPlans: PlannedMeal[] = [];
  
  plannedMeals.forEach(meal => {
    // Check if this meal uses any make-or-buy products
    const makeOrBuyProducts = findMakeOrBuyProducts(meal, recipeData);
    
    makeOrBuyProducts.forEach(product => {
      const decision = makeOrBuyDecisions.get(product.id);
      
      if (decision === 'make' && product.source_recipe) {
        // Add the source recipe to expanded plans
        expandedPlans.push({
          recipe: product.source_recipe,
          quantity: calculateQuantityNeeded(product, meal),
          // ... other fields
        });
      }
    });
    
    // Always add the original meal
    expandedPlans.push(meal);
  });
  
  // 2. Build shopping list from expanded plans
  // (Same logic as before, but with expanded plan list)
  return aggregateIngredients(expandedPlans, recipeData);
}
```

---

### Benefits

✅ **Flexible**: Choose make vs buy week-by-week
✅ **Realistic**: Models real-world decision making  
✅ **Reusable**: Stock recipe can be used by multiple meals
✅ **Smart Aggregation**: If making stock, aggregates all sub-ingredients
✅ **Scalable**: Works for any make-or-buy ingredient (pizza dough, pasta, sauce, etc.)

---

### Potential Issues & Solutions

#### Issue 1: Quantity Mismatch
**Problem**: Recipe makes 6 cups, you only need 2 cups

**Solution**: 
- Show yield in decision UI: "Yields 6 cups (enough for 3 uses)"
- System tracks: "Making stock for Risotto (2 cups), Soup (3 cups), have 1 cup extra"
- Allow manual quantity adjustment

#### Issue 2: Forgetting to Decide
**Problem**: User adds meal but doesn't make decision

**Solution**:
- Default to "buy" (safer, simpler)
- Show warning: "⚠️ Chicken Stock can be made - click to decide"
- Block "Generate Lists" until all decisions made

#### Issue 3: Recipe Output Doesn't Match Product
**Problem**: Source recipe outputs "Chicken Stock (stored)" but recipe uses "Chicken Stock (raw)"

**Solution**:
- Validation: Source recipe MUST output a product with matching name
- Editor shows warning if mismatch
- Type can differ (output stored, use raw) - that's ok

#### Issue 4: Circular Dependencies
**Problem**: Recipe A makes Product X using Recipe B, which makes Product Y using Recipe A

**Solution**:
- Validate no circular source_recipe chains
- Show error in product form if cycle detected
- Max depth limit (e.g., 3 levels deep)

---

## Alternative: Simplified Approach

If the full solution feels too complex initially, start with:

### Phase 1: Manual Recipe Addition
- Create stock as separate recipe (current approach)
- User manually adds "Chicken Stock Recipe" to weekly plan if they want to make it
- No special make-or-buy logic

### Phase 2: Add Source Recipe Link (Read-only)
- Add `source_recipe` field to products
- Show in product view: "Can be made using: Chicken Stock Recipe"
- No automated behavior yet

### Phase 3: Add Decision UI
- Implement make-or-buy dialog
- Automated recipe expansion based on decision

This allows incremental implementation while validating the concept.

---

## Recommendation

**Implement Option 2** with phased rollout:
1. Start with data model changes (`source_recipe` field)
2. Update product form to allow linking recipes
3. Show informational UI ("This can be made")
4. Add make-or-buy decision dialog
5. Update aggregation logic to expand source recipes

This provides maximum flexibility while maintaining your current clean architecture.
