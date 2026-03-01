# Coding Conventions

**Analysis Date:** 2026-03-01

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `CheckableListItem.tsx`, `ProductNode.tsx`)
- Utility modules: camelCase (e.g., `product-utils.ts`, `variant-utils.ts`)
- Page components: PascalCase (e.g., `Recipes.tsx`, `RecipeEditor.tsx`)
- Index files: `index.ts` for barrel exports (e.g., `src/components/outputs/index.ts`)

**Functions:**
- Named exports: camelCase (e.g., `getAll()`, `createProductKey()`, `validateOverrides()`)
- Component functions: PascalCase (e.g., `CheckableListItem()`, `Layout()`)
- Event handlers: camelCase prefixed with "handle" (e.g., `handleDrawerToggle()`, `handleNavClick()`)

**Variables:**
- camelCase for all variables (e.g., `itemKey`, `mealCount`, `filterStates`)
- Constants in UPPER_CASE within modules (e.g., `DRAWER_WIDTH`, `DAYS`, `MEAL_SLOTS`)
- State variables from `useState`: descriptive camelCase (e.g., `dialogOpen`, `searchQuery`, `recipeTags`)

**Types:**
- Interfaces: PascalCase (e.g., `CheckableListItemProps`, `RecipeGraphData`, `VariantOverride`)
- Type aliases: PascalCase (e.g., `FlowNode`, `FlowEdge`, `MealSlot`)
- Enums: PascalCase values (e.g., `ProductType.Raw`, `StorageLocation.Fridge`)

## Code Style

**Formatting:**
- No dedicated formatter detected in config
- Code appears to follow standard TypeScript formatting practices
- JSX inline styles use camelCase property names
- Object literal properties use camelCase (e.g., `itemKey`, `checked`, `onToggle`)

**Linting:**
- Tool: ESLint 9.39.1 with TypeScript support
- Config: `eslint.config.js` (flat config format)
- Key rules:
  - `typescript-eslint` recommended config enabled
  - React hooks rules enforced (eslint-plugin-react-hooks)
  - React refresh rules for hot module replacement
  - No unused variables allowed (TypeScript compiler option `noUnusedLocals: true`)
  - No unused parameters allowed (TypeScript compiler option `noUnusedParameters: true`)

**TypeScript Settings:**
- `target: ES2022` - modern JavaScript features
- `strict: true` - strict type checking enabled
- `noEmit: true` - TypeScript compilation (no output files)
- `jsx: react-jsx` - React 17+ JSX transform
- `moduleResolution: bundler` - supports import extensions

## Import Organization

**Order:**
1. React imports (e.g., `import { useState } from "react"`)
2. Third-party library imports (e.g., Material-UI, React Router, react-to-print)
3. Type imports from third-party (e.g., `import type { Connection, Node } from "@xyflow/react"`)
4. Local imports from `lib/` (e.g., `import { getAll, collections } from "../lib/api"`)
5. Local imports from `types` (e.g., `import type { Recipe, Product } from "../lib/types"`)
6. Local imports from components and other modules (e.g., `import ProductNode from "../components/nodes/ProductNode"`)
7. Style imports (e.g., `import "./index.css"`)

**Example from `src/pages/RecipeEditor.tsx`:**
```typescript
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  // ... more MUI/XYFlow imports
} from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import dagre from "dagre";
import {
  // MUI imports
} from "@mui/material";
import { getAll, getOne, create, update, remove, collections } from "../lib/api";
import type { Recipe, Product, /* more types */ } from "../lib/types";
import ProductNode from "../components/nodes/ProductNode";
```

**Path Aliases:**
- Not detected; uses relative paths throughout (e.g., `../lib/api`, `./DatabaseSwitcher`)

## Error Handling

**Patterns:**
- Try-catch blocks used in async operations (e.g., in `loadItems()` in `Recipes.tsx`)
- Error state managed with `useState<string | null>(error)` then displayed via `<Alert>`
- Loading states with `isLoading` boolean flags prevent operations while fetching
- Success is implicit; errors are explicitly tracked and shown to user

**Example from `src/pages/Recipes.tsx`:**
```typescript
const loadItems = async () => {
  try {
    setLoading(true);
    setError(null);

    const [recipes, recipeTagsData, tags] = await Promise.all([
      getAll<Recipe>(collections.recipes, { sort: "name" }),
      getAll<RecipeTag>(collections.recipeTags, { expand: "tag" }),
      getAll<Tag>(collections.tags, { sort: "name" }),
    ]);

    setItems(recipes);
  } catch (err) {
    setError((err as Error).message || "Failed to load items");
  } finally {
    setLoading(false);
  }
};
```

## Logging

**Framework:** console - no dedicated logging library used

**Patterns:**
- Debug output only when explicitly needed
- No comprehensive logging infrastructure visible
- Errors displayed via Material-UI `<Alert>` components to users

## Comments

**When to Comment:**
- Documentation-style comments for function purpose and behavior
- JSDoc-style comments for complex functions (e.g., in `src/lib/aggregation/utils/variant-utils.ts`)

**JSDoc/TSDoc:**
- Used for utility functions and complex logic
- Includes parameter descriptions and return type documentation

**Example from `src/lib/aggregation/builders/flow-builder.ts`:**
```typescript
/**
 * Create product-to-step flow connections for a single step
 * Returns array of flow connections
 */
export function createProductToStepFlows(
  step: AggregatedFlowStep,
  plannedMeal: PlannedMealWithRecipe,
  recipeData: RecipeGraphData,
  mealCount: number
): { productId: string; stepId: string }[] {
```

## Function Design

**Size:**
- Generally compact functions (20-50 lines common)
- Longer files break into separate functions or utility modules
- Largest files (`RecipeEditor.tsx` ~1313 lines) contain multiple logical sections for complex UI

**Parameters:**
- Typed parameters with explicit types
- Object destructuring for props (React components)
- Generic type parameters for reusable API functions

**Return Values:**
- Explicit return types on all functions (enforced by strict TypeScript)
- Async functions return Promises with typed content
- Handlers return void

**Example from `src/lib/api.ts`:**
```typescript
export async function getAll<T extends RecordModel>(
  collection: string,
  options?: { expand?: string; sort?: string; filter?: string }
): Promise<T[]> {
  const records = await pb.collection(collection).getFullList<T>({
    expand: options?.expand,
    sort: options?.sort,
    filter: options?.filter,
  });
  return records;
}
```

## Module Design

**Exports:**
- Named exports for utility functions (e.g., `export function getAll()`, `export async function create()`)
- Named exports for components (e.g., `export function CheckableListItem()`)
- Default exports for page components and main App (e.g., `export default function Layout()`)
- Type exports using `export type` for interfaces (e.g., `export type FlowNode = ProductNodeType | StepNodeType`)

**Barrel Files:**
- Used in `src/components/outputs/index.ts` to re-export all tab components
- Simplifies imports: `import { FridgeFreezerTab } from "../components/outputs"` instead of full path

**Example from `src/lib/aggregation/index.ts`:**
```typescript
// Types
export * from "./types.js";

// Constants
export * from "./utils/constants";

// Product utilities
export * from "./utils/product-utils";

// Step utilities
export * from "./utils/step-utils";

// Filtering and grouping utilities
export * from "./utils/filter-utils";

// Sorting utilities
export * from "./utils/sort-utils";
```

## React Patterns

**Hooks:**
- `useState` for component state (e.g., `[items, setItems] = useState<Recipe[]>([])`)
- `useEffect` for side effects and data loading
- `useCallback` for memoized event handlers (sparingly used, e.g., in `RecipeEditor.tsx`)
- React Router hooks: `useParams()`, `useNavigate()`, `useLocation()`
- Custom hooks extracted when logic is reusable (e.g., `useProductForm()` in `ProductForm.tsx`)

**Component Structure:**
- Functional components with explicit `Props` interfaces
- State declaration at top of component
- Event handler definitions before render logic
- Conditional rendering with ternary operators or `{condition && <Component />}`

## Type Safety

**Strict Mode:** Enabled via TypeScript compiler options
- All functions have explicit parameter and return types
- No `any` type used (enforced by linter)
- Interface definitions in `src/lib/types.ts` for all data structures
- Expanded type variants (e.g., `ProductExpanded`) for relation population from PocketBase

---

*Convention analysis: 2026-03-01*
