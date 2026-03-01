# Architecture

**Analysis Date:** 2026-03-01

## Pattern Overview

**Overall:** Layered React SPA with service-oriented data layer

**Key Characteristics:**
- React Router-based navigation with layout wrapper
- PocketBase (self-hosted backend) as primary data source
- Separation of concerns: UI layer, data aggregation layer, API/data access layer
- Graph-based recipe representation using ReactFlow visualization
- Meal planning with variant override system for ingredient substitution

## Layers

**Presentation (UI) Layer:**
- Purpose: React components rendering pages, dialogs, forms, and visualizations
- Location: `src/pages/`, `src/components/`
- Contains: Page components (Recipes, WeeklyPlans, Outputs, Inventory), reusable UI components (ProductForm, VariantEditorDialog), output rendering (ShoppingListTab, BatchPrepTab, etc.)
- Depends on: Aggregation layer (for data transformation), API layer (for data fetching), Material-UI for styling
- Used by: App.tsx routing, users navigating the application

**Aggregation/Business Logic Layer:**
- Purpose: Transform raw database records into structured outputs for specific use cases
- Location: `src/lib/aggregation/`, with sub-modules: `builders/`, `utils/`
- Contains:
  - Product, step, and flow builders that construct aggregated data structures
  - Variant override utilities for substituting meal ingredients
  - Filter, sort, and transformation utilities
  - Types for aggregated outputs (AggregatedProduct, AggregatedStep, PullListMeal, etc.)
- Depends on: Types layer for entity definitions
- Used by: Pages (Outputs, WeeklyPlans) for generating shopping lists, batch prep instructions, pull lists, meal containers

**Data Access Layer:**
- Purpose: CRUD operations and database connectivity management
- Location: `src/lib/api.ts`, `src/lib/pocketbase.ts`, `src/lib/db-config.ts`
- Contains:
  - Generic CRUD functions (getAll, getOne, create, update, remove)
  - PocketBase client initialization and management
  - Database environment switching (production/test)
  - Collection name constants
- Depends on: PocketBase SDK, types for record models
- Used by: All pages and components needing data

**Type/Model Layer:**
- Purpose: TypeScript definitions for all domain entities and relationships
- Location: `src/lib/types.ts`
- Contains: Base record interface, registries (Store, Section, ContainerType, Tag), products, recipes, graph components (nodes/edges), weekly plans, meals, inventory
- Depends on: None (foundational)
- Used by: All layers (presentation, aggregation, data access)

**Configuration Layer:**
- Purpose: Application-wide configuration and constants
- Location: `src/constants/`, `src/styles/`
- Contains:
  - Output constants (tab labels, text, errors, styling)
  - Meal planning constants (days, slots, colors)
  - Container type icons
  - Print stylesheets
- Depends on: Types for reference
- Used by: Pages and components for consistent UI/UX

## Data Flow

**Recipe Creation/Editing Flow:**

1. User navigates to `/recipes/:id` or `/recipes/new`
2. RecipeEditor page loads recipe graph (products, steps, edges) from database
3. ReactFlow displays nodes (product/step) and edges visually
4. User adds/modifies/connects nodes
5. On save, RecipeEditor persists all node/edge records to database
6. Recipe graph is stored as normalized records across multiple collections

**Weekly Meal Planning Flow:**

1. User selects or creates a WeeklyPlan
2. User adds PlannedMeals (recipe + slot + day + quantity)
3. System loads recipe graph data for each planned meal
4. User can view/edit MealVariantOverrides (substituting ingredients)
5. Overrides are applied to the recipe graph for output calculation

**Output Generation Flow (Outputs page):**

1. Fetch all WeeklyPlans, PlannedMeals, and their recipes
2. Load recipe graph data (products, steps, edges) with full expansion
3. Build ProductFlowGraph by aggregating products/steps across meals
4. Apply MealVariantOverrides to adjust which products are needed
5. Generate outputs from aggregated graph:
   - ShoppingList (products grouped by store/section)
   - PullLists (products to pull for JIT assembly)
   - BatchPrepList (prep steps for stored products)
   - MealContainers (storage instructions)
   - MicahMeals (ready-to-eat inventory)
6. Display in tabs with print views available

**State Management:**
- Page-level state managed with useState (local to component)
- Shared reference data (products, recipes, tags) fetched and cached per page
- No global state manager (Redux/Zustand)—data flows down, events bubble up
- Database-driven: single source of truth is PocketBase

## Key Abstractions

**RecipeGraphData:**
- Purpose: Represents a complete recipe with all its graph components (nodes and edges)
- Examples: `src/lib/aggregation/types.ts`, used in `src/pages/Outputs.tsx`, `src/pages/WeeklyPlans.tsx`
- Pattern: Strongly typed struct combining Recipe with arrays of nodes, steps, and edges; supports PocketBase relation expansion

**AggregatedProduct / AggregatedStep:**
- Purpose: Transform individual recipe components into aggregated totals across multiple meals
- Examples: `src/lib/aggregation/types.ts`
- Pattern: Accumulate products/steps by ID, combining quantities and sources from multiple recipes

**VariantOverride / MealVariantOverride:**
- Purpose: Allow substituting products in a planned meal without modifying the recipe
- Examples: `src/lib/aggregation/utils/variant-utils.ts` (validation and preview logic)
- Pattern: Maps a planned meal + original product node to a replacement product; validated before aggregation

**ProductFlowGraph:**
- Purpose: Complete aggregated view of all products and steps across a meal plan with their connections
- Examples: `src/lib/aggregation/types.ts`, constructed in `src/pages/Outputs.tsx`
- Pattern: Map-based graph (products map, steps map, edge lists) for efficient lookup

**DbEnvironment:**
- Purpose: Manage switching between production and test databases
- Examples: `src/lib/db-config.ts`
- Pattern: localStorage-backed enum selector; page reload triggers reinitialization of PocketBase client

## Entry Points

**App.tsx:**
- Location: `src/App.tsx`
- Triggers: Browser navigation via BrowserRouter
- Responsibilities: Define routing structure, apply Material-UI theme, render Layout wrapper

**Layout.tsx:**
- Location: `src/components/Layout.tsx`
- Triggers: All routes (nested under <Route path="/" element={<Layout />}>)
- Responsibilities: Render navigation drawer, AppBar, theme provider context; render page outlet

**Page Components:**
- Recipes (`src/pages/Recipes.tsx`): List recipes, create/delete, filter by tags
- RecipeEditor (`src/pages/RecipeEditor.tsx`): Graph editing for recipe (products/steps/edges)
- WeeklyPlans (`src/pages/WeeklyPlans.tsx`): Create plans, assign meals to slots/days, manage variant overrides
- Outputs (`src/pages/Outputs.tsx`): Aggregate and display shopping lists, pull lists, batch prep, meal containers
- Inventory (`src/pages/Inventory.tsx`): Track in-stock ready-to-eat items
- Registries: Manage products, stores, sections, containers, tags

**main.tsx:**
- Location: `src/main.tsx`
- Triggers: Browser loads application
- Responsibilities: Mount React app to DOM with strict mode

## Error Handling

**Strategy:** Try-catch blocks with user-facing error messages in Alert components

**Patterns:**
- CRUD operations wrapped in try-catch, error state stored in component state
- Error message displayed in Alert component at top of page
- Loading states prevent double-submission (saving flag)
- No error logging to external service (errors displayed inline only)

## Cross-Cutting Concerns

**Logging:** No centralized logging; console.log used during development (no production logging detected)

**Validation:**
- Input validation in form components (required fields, type checks)
- Variant override validation in `src/lib/aggregation/utils/variant-utils.ts` (orphan node detection)
- PocketBase schema validation on backend (not enforced client-side)

**Authentication:** Not implemented (self-hosted, trusted network assumed); no auth layer present

**Database Switching:**
- Managed via DatabaseSwitcher component in Layout
- Environment persisted to localStorage
- Page reload triggers PocketBase reinitialization

---

*Architecture analysis: 2026-03-01*
