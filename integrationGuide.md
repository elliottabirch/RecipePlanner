# Recipe Variants Integration Guide

This document covers all changes needed to integrate the variants feature into the existing codebase. Follow these sections in order.

---

## 1. Add Collection Reference

**File:** `src/lib/api.ts`

Add `mealVariantOverrides` to the `collections` object:

```typescript
export const collections = {
  // ... existing collections ...
  mealVariantOverrides: "meal_variant_overrides",
} as const;
```

---

## 2. Add TypeScript Interfaces

**File:** `src/lib/types.ts`

Add at the end of the file:

```typescript
// Meal Variant Overrides
export interface MealVariantOverride extends BaseRecord {
  planned_meal: string; // relation ID
  original_node: string; // relation ID (recipe_product_node being replaced)
  replacement_product: string; // relation ID (product to use instead)
}

export interface MealVariantOverrideExpanded extends MealVariantOverride {
  expand?: {
    planned_meal?: PlannedMeal;
    original_node?: RecipeProductNode & {
      expand?: { product?: Product };
    };
    replacement_product?: Product;
  };
}
```

---

## 3. Add Meal-Keyed Type

**File:** `src/lib/aggregation/types.ts`

Add this new type for the refactored data structure:

```typescript
/**
 * Recipe graph data keyed by planned meal ID.
 * This allows the same recipe to have different effective graphs
 * for different planned meals (when variants are applied).
 */
export type MealKeyedRecipeData = Map<string, RecipeGraphData>;
```

---

## 4. Update buildProductFlowGraph Signature

**File:** `src/lib/aggregation.ts`

### 4.1 Add Exports

Add these exports for the variant utilities:

```typescript
export {
  applyVariantOverrides,
  validateOverrides,
  previewOrphanedNodes,
  findOrphanedNodes,
  type VariantOverride,
  type OverrideValidation,
  type OverrideValidationResult,
} from "./aggregation/utils/variant-utils";
```

### 4.2 Update Function

Change the lookup inside `buildProductFlowGraph`:

```typescript
// BEFORE:
const data = recipeData.get(meal.recipe);

// AFTER:
const data = recipeData.get(meal.id);
```

> **Breaking Change:** `recipeData` is now keyed by `plannedMeal.id`, not `recipe.id`. This allows variants to apply different graphs per meal instance.

---

## 5. Integrate into WeeklyPlans.tsx

**File:** `src/pages/WeeklyPlans.tsx`

### 5.1 Add Imports

```typescript
import { VariantsList } from "../components/VariantsList";
import { VariantEditorDialog } from "../components/VariantEditorDialog";
import type { 
  MealVariantOverride, 
  MealVariantOverrideExpanded, 
  Product,
  RecipeProductNode,
  RecipeStep,
  ProductToStepEdge,
  StepToProductEdge,
} from "../lib/types";
import type { RecipeGraphData } from "../lib/aggregation";
```

### 5.2 Add State Variables

```typescript
const [variantOverrides, setVariantOverrides] = useState<MealVariantOverrideExpanded[]>([]);
const [variantEditorOpen, setVariantEditorOpen] = useState(false);
const [editingMealId, setEditingMealId] = useState<string | null>(null);
const [products, setProducts] = useState<Product[]>([]);
const [recipeData, setRecipeData] = useState<Map<string, RecipeGraphData>>(new Map());
```

### 5.3 Add Data Loading Functions

```typescript
// Load products (call in useEffect on mount)
const loadProducts = async () => {
  const productsData = await getAll<Product>(collections.products, { sort: "name" });
  setProducts(productsData);
};

// Load recipe data for all recipes in the plan
const loadRecipeData = async (meals: PlannedMealExpanded[]) => {
  const recipeIds = [...new Set(meals.map((m) => m.recipe))];
  const recipeDataMap = new Map<string, RecipeGraphData>();

  for (const recipeId of recipeIds) {
    const [productNodes, steps, ptsEdges, stpEdges] = await Promise.all([
      getAll<RecipeProductNode>(collections.recipeProductNodes, {
        filter: `recipe="${recipeId}"`,
        expand: "product",
      }),
      getAll<RecipeStep>(collections.recipeSteps, {
        filter: `recipe="${recipeId}"`,
      }),
      getAll<ProductToStepEdge>(collections.productToStepEdges, {
        filter: `recipe="${recipeId}"`,
      }),
      getAll<StepToProductEdge>(collections.stepToProductEdges, {
        filter: `recipe="${recipeId}"`,
      }),
    ]);

    const recipe = meals.find((m) => m.recipe === recipeId)?.expand?.recipe;
    if (recipe) {
      recipeDataMap.set(recipeId, {
        recipe,
        productNodes,
        steps,
        productToStepEdges: ptsEdges,
        stepToProductEdges: stpEdges,
      });
    }
  }

  setRecipeData(recipeDataMap);
};

// Load variant overrides
const loadVariantOverrides = async () => {
  if (!selectedPlan || plannedMeals.length === 0) {
    setVariantOverrides([]);
    return;
  }

  const mealIds = plannedMeals.map((m) => m.id);
  const filter = mealIds.map((id) => `planned_meal="${id}"`).join(" || ");

  const overrides = await getAll<MealVariantOverrideExpanded>(
    collections.mealVariantOverrides,
    {
      filter,
      expand: "planned_meal,original_node,original_node.product,replacement_product",
    }
  );

  setVariantOverrides(overrides);
};
```

### 5.4 Add useEffect Calls

```typescript
// Load products on mount
useEffect(() => {
  loadProducts();
}, []);

// Load recipe data when planned meals change
useEffect(() => {
  if (plannedMeals.length > 0) {
    loadRecipeData(plannedMeals);
  }
}, [plannedMeals]);

// Load variant overrides when planned meals change
useEffect(() => {
  loadVariantOverrides();
}, [plannedMeals]);
```

### 5.5 Add Handler Functions

```typescript
const handleEditVariants = (mealId: string) => {
  setEditingMealId(mealId);
  setVariantEditorOpen(true);
};

const handleSaveVariants = async (
  mealId: string,
  overrides: { originalNodeId: string; replacementProductId: string }[]
) => {
  // Delete existing overrides for this meal
  const existingForMeal = variantOverrides.filter((o) => o.planned_meal === mealId);
  await Promise.all(
    existingForMeal.map((o) => remove(collections.mealVariantOverrides, o.id))
  );

  // Create new overrides
  await Promise.all(
    overrides.map((o) =>
      create(collections.mealVariantOverrides, {
        planned_meal: mealId,
        original_node: o.originalNodeId,
        replacement_product: o.replacementProductId,
      })
    )
  );

  // Reload
  await loadVariantOverrides();
};

const handleDeleteOverride = async (overrideId: string) => {
  await remove(collections.mealVariantOverrides, overrideId);
  await loadVariantOverrides();
};
```

### 5.6 Add JSX Components

After the plan selector `<Paper>` component, add the variants list:

```tsx
<VariantsList
  plannedMeals={plannedMeals}
  overrides={variantOverrides}
  recipeData={recipeData}
  onEdit={handleEditVariants}
  onDeleteOverride={handleDeleteOverride}
/>
```

Add the editor dialog (before closing `</Box>` of the component):

```tsx
<VariantEditorDialog
  open={variantEditorOpen}
  onClose={() => {
    setVariantEditorOpen(false);
    setEditingMealId(null);
  }}
  plannedMeal={plannedMeals.find((m) => m.id === editingMealId) || null}
  recipeData={
    editingMealId
      ? recipeData.get(
          plannedMeals.find((m) => m.id === editingMealId)?.recipe || ""
        ) || null
      : null
  }
  existingOverrides={variantOverrides.filter((o) => o.planned_meal === editingMealId)}
  products={products}
  onSave={handleSaveVariants}
/>
```

---

## 6. Refactor Outputs.tsx for Meal-Keyed Data

**File:** `src/pages/Outputs.tsx`

This is the most significant change. The `recipeData` map changes from being keyed by `recipe.id` to being keyed by `meal.id`.

### 6.1 Add Imports

```typescript
import type { MealVariantOverrideExpanded } from "../lib/types";
import { 
  applyVariantOverrides, 
  type VariantOverride 
} from "../lib/aggregation/utils/variant-utils";
```

### 6.2 Add State

```typescript
const [variantOverrides, setVariantOverrides] = useState<MealVariantOverrideExpanded[]>([]);
```

### 6.3 Replace the loadPlanData useEffect

```typescript
useEffect(() => {
  const loadPlanData = async () => {
    if (!selectedPlanId) return;

    try {
      setLoadingData(true);

      // Load planned meals
      const meals = await getAll<PlannedMealWithRecipe>(
        collections.plannedMeals,
        {
          filter: `weekly_plan="${selectedPlanId}"`,
          expand: "recipe",
        }
      );
      setPlannedMeals(meals);

      // Load variant overrides for all meals in this plan
      const mealIds = meals.map((m) => m.id);
      let overrides: MealVariantOverrideExpanded[] = [];
      if (mealIds.length > 0) {
        const filter = mealIds.map((id) => `planned_meal="${id}"`).join(" || ");
        overrides = await getAll<MealVariantOverrideExpanded>(
          collections.mealVariantOverrides,
          {
            filter,
            expand: "original_node.product,replacement_product",
          }
        );
      }
      setVariantOverrides(overrides);

      // Build override map by meal ID
      const overridesByMeal = new Map<string, VariantOverride[]>();
      for (const override of overrides) {
        const mealId = override.planned_meal;
        if (!overridesByMeal.has(mealId)) {
          overridesByMeal.set(mealId, []);
        }
        if (override.expand?.replacement_product) {
          overridesByMeal.get(mealId)!.push({
            originalNodeId: override.original_node,
            replacementProduct: override.expand.replacement_product,
          });
        }
      }

      // Load base recipe data by recipe ID
      const recipeIds = [...new Set(meals.map((m) => m.recipe))];
      const baseRecipeData = new Map<string, RecipeGraphData>();

      for (const recipeId of recipeIds) {
        const [productNodes, steps, ptsEdges, stpEdges] = await Promise.all([
          getAll<RecipeProductNode>(collections.recipeProductNodes, {
            filter: `recipe="${recipeId}"`,
            expand: "product, product.container_type, product.store, product.section",
          }),
          getAll<RecipeStep>(collections.recipeSteps, {
            filter: `recipe="${recipeId}"`,
          }),
          getAll<ProductToStepEdge>(collections.productToStepEdges, {
            filter: `recipe="${recipeId}"`,
          }),
          getAll<StepToProductEdge>(collections.stepToProductEdges, {
            filter: `recipe="${recipeId}"`,
          }),
        ]);

        const recipe = meals.find((m) => m.recipe === recipeId)?.expand?.recipe;
        if (recipe) {
          baseRecipeData.set(recipeId, {
            recipe,
            productNodes,
            steps,
            productToStepEdges: ptsEdges,
            stepToProductEdges: stpEdges,
          });
        }
      }

      // Create meal-keyed data with variants applied
      const mealKeyedRecipeData = new Map<string, RecipeGraphData>();

      for (const meal of meals) {
        const baseData = baseRecipeData.get(meal.recipe);
        if (!baseData) continue;

        const mealOverrides = overridesByMeal.get(meal.id) || [];

        if (mealOverrides.length > 0) {
          // Apply overrides to create variant graph
          const variantData = applyVariantOverrides(baseData, mealOverrides);
          mealKeyedRecipeData.set(meal.id, variantData);
        } else {
          // No overrides - use base data
          mealKeyedRecipeData.set(meal.id, baseData);
        }
      }

      setRecipeData(mealKeyedRecipeData);

      // ... rest of existing code (loading tags, inventory, etc.)

    } catch {
      setError(ERROR_MESSAGES.failedToLoadPlanData);
    } finally {
      setLoadingData(false);
    }
  };

  loadPlanData();
}, [selectedPlanId]);
```

---

## 7. Update All recipeData Consumers

After the refactor, `recipeData` is keyed by `meal.id` instead of `recipe.id`. 

### Find and Replace Pattern

Search for all instances of:
```typescript
recipeData.get(meal.recipe)
// or
recipeData.get(m.recipe)
// or similar patterns
```

Replace with:
```typescript
recipeData.get(meal.id)
// or
recipeData.get(m.id)
```

### Common Locations to Check

- `buildPullLists` calls
- `isMicahMeal` function
- Weekly calendar rendering
- Meal containers filtering
- Any component that receives `recipeData` as a prop

---

## 8. File Placement Summary

| File | Location |
|------|----------|
| `types-additions.ts` | Merge contents into `src/lib/types.ts` |
| `variant-utils.ts` | `src/lib/aggregation/utils/variant-utils.ts` |
| `VariantsList.tsx` | `src/components/VariantsList.tsx` |
| `VariantEditorDialog.tsx` | `src/components/VariantEditorDialog.tsx` |

---

## 9. Testing Checklist

- [ ] Create a weekly plan with a recipe
- [ ] Open variant editor for a planned meal
- [ ] Select a product node and assign a replacement
- [ ] Verify orphan preview shows correct nodes
- [ ] Save variant and verify it appears in variants list
- [ ] Check Outputs page — shopping list should exclude orphaned ingredients
- [ ] Check Outputs page — batch prep should exclude orphaned steps  
- [ ] Delete the original recipe product node — verify invalid state shows
- [ ] Delete the variant override — verify meal reverts to original
- [ ] Delete planned meal — verify cascade deletes overrides