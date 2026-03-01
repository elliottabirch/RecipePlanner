# Codebase Structure

**Analysis Date:** 2026-03-01

## Directory Layout

```
recipe-planner/
├── public/                          # Static assets
├── src/
│   ├── assets/                      # Image and media files
│   ├── components/                  # Reusable React components
│   │   ├── nodes/                   # ReactFlow node components (ProductNode, StepNode)
│   │   └── outputs/                 # Tab components for output displays
│   ├── constants/                   # Application constants and configuration
│   ├── lib/                         # Core business logic and data access
│   │   ├── aggregation/             # Data transformation and aggregation
│   │   │   ├── builders/            # Product, step, and flow builders
│   │   │   └── utils/               # Filter, sort, transform utilities
│   │   └── listProviders/           # (undocumented)
│   ├── pages/                       # Page-level components (routing targets)
│   │   └── registries/              # Registry management pages (products, stores, etc.)
│   ├── styles/                      # Global and component-specific CSS
│   ├── App.tsx                      # Root routing component
│   ├── App.css                      # Root component styles
│   ├── index.css                    # Global styles
│   └── main.tsx                     # React app entry point
├── scripts/                         # Build and utility scripts
├── tsconfig.json                    # TypeScript project references
├── tsconfig.app.json                # TypeScript app config
├── tsconfig.node.json               # TypeScript node config
├── vite.config.ts                   # Vite build configuration
├── package.json                     # Dependencies and scripts
└── eslint.config.js                 # ESLint configuration
```

## Directory Purposes

**public/:**
- Purpose: Static files served without processing (favicon, manifest, etc.)
- Contains: HTML entry point, static images

**src/assets/:**
- Purpose: Application images and icons used in components
- Contains: PNG, SVG files referenced by components

**src/components/:**
- Purpose: Reusable React components for UI building blocks
- Contains:
  - Layout.tsx (navigation wrapper)
  - ProductForm.tsx (multi-step product editor with variants)
  - SimpleRegistry.tsx (generic CRUD table component)
  - VariantsList.tsx, VariantEditorDialog.tsx (meal variant management)
  - DatabaseSwitcher.tsx (environment selector)
  - CheckableListItem.tsx, EmptyState.tsx, FilterChip.tsx, FilterGroup.tsx (small utilities)
  - nodes/ (ReactFlow custom node types)
  - outputs/ (specialized components for displaying aggregated data)

**src/components/nodes/:**
- Purpose: Custom node components for ReactFlow recipe graph visualization
- Contains:
  - ProductNode.tsx (represents recipe products)
  - StepNode.tsx (represents recipe processing steps)

**src/components/outputs/:**
- Purpose: Tab content components and print views for output generation
- Contains:
  - ShoppingListTab.tsx, PullListsTab.tsx, BatchPrepTab.tsx (list generators)
  - MealContainersTab.tsx, MicahMealsTab.tsx (container and inventory displays)
  - WeeklyViewTab.tsx, ProductFlowTab.tsx (graph and calendar views)
  - FridgeFreezerTab.tsx (storage location display)
  - *PrintView.tsx components (print-optimized layouts)
  - index.ts (barrel export of all components)

**src/constants/:**
- Purpose: Application-wide configuration constants
- Contains:
  - outputs.ts (UI labels, error messages, node/edge colors, export options)
  - mealPlanning.ts (days of week, meal slots, slot colors)
  - containerIcons.tsx (icon mappings for container types)

**src/lib/:**
- Purpose: Core business logic, data access, and aggregation
- Contains:
  - api.ts (generic CRUD operations, collection names)
  - pocketbase.ts (PocketBase client initialization and switching)
  - db-config.ts (database URL configuration and environment switching)
  - types.ts (all TypeScript domain types)
  - aggregation.ts (main aggregation exports and functions)
  - aggregation/ (detailed aggregation implementations)
  - listProviders/ (undocumented utility)

**src/lib/aggregation/:**
- Purpose: Transform raw recipe and meal data into outputs (shopping lists, prep instructions, etc.)
- Contains:
  - types.ts (aggregated data structures)
  - index.ts (barrel exports)
  - builders/ (construct aggregated graphs from database records)
  - utils/ (filter, sort, validate, transform data)
  - Key exports: AggregatedProduct, AggregatedStep, PullListMeal, MealContainer, ProductFlowGraph

**src/lib/aggregation/builders/:**
- Purpose: Build aggregated structures from raw database records
- Key files:
  - product-builder.ts: Processes recipe product nodes into aggregated products
  - step-builder.ts: Aggregates recipe steps
  - flow-builder.ts: Creates connections between products and steps

**src/lib/aggregation/utils/:**
- Purpose: Utilities for filtering, sorting, and transforming aggregated data
- Key files:
  - variant-utils.ts: Apply and validate meal variant overrides
  - filter-utils.ts: Group by store/section, check packaging
  - sort-utils.ts: Sort pull lists and prep steps
  - product-utils.ts: Extract storage location and meal destination
  - step-utils.ts: Identify just-in-time steps
  - constants.ts: Magic strings and enums

**src/pages/:**
- Purpose: Full-page components for main user workflows
- Contains:
  - Recipes.tsx: Browse, create, filter recipes
  - RecipeEditor.tsx: Edit recipe graph (products, steps, connections)
  - WeeklyPlans.tsx: Create plans, assign meals, manage variant overrides
  - Outputs.tsx: Master page for aggregation and display (all output tabs)
  - Inventory.tsx: Track ready-to-eat items
  - registries/ (manage reference data: Products, Stores, Sections, ContainerTypes, Tags)

**src/pages/registries/:**
- Purpose: CRUD interfaces for reference data
- Contains:
  - Products.tsx (complex product form with variants)
  - Stores.tsx, Sections.tsx, ContainerTypes.tsx, Tags.tsx (simple registries)

**src/styles/:**
- Purpose: Global and theme-specific CSS
- Contains:
  - printStyles.css (media queries and styles for print output)
  - App.css, index.css (layout and component styling)

**scripts/:**
- Purpose: Utility scripts for build and maintenance
- Contains:
  - sync-to-test.js (synchronizes data between environments)

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React app initialization, mounts App to DOM
- `src/App.tsx`: Root routing component with React Router
- `src/components/Layout.tsx`: Navigation and theme wrapper, outlet for routes

**Configuration:**
- `vite.config.ts`: Build tool configuration
- `tsconfig.json`: TypeScript compiler options and project references
- `package.json`: Dependencies, build scripts, package metadata
- `src/lib/db-config.ts`: Database environment URLs and persistence

**Core Logic:**
- `src/lib/types.ts`: All domain entity definitions
- `src/lib/api.ts`: Generic CRUD interface to PocketBase
- `src/lib/aggregation/`: Data transformation pipeline
- `src/lib/pocketbase.ts`: Database client management

**Testing & Examples:**
- `examples/`: Directory with sample recipes (used by developers)

## Naming Conventions

**Files:**
- Page components: PascalCase (e.g., `Recipes.tsx`, `RecipeEditor.tsx`)
- Utility/library files: camelCase (e.g., `api.ts`, `aggregation.ts`)
- Constants: UPPER_SNAKE_CASE (within exports, e.g., `MEAL_SLOTS`)
- Dialogs/Forms: PascalCase with suffix (e.g., `VariantEditorDialog.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useProductForm`)

**Directories:**
- Feature/page directories: lowercase plural (e.g., `pages`, `components`, `registries`)
- Logical groupings: lowercase (e.g., `nodes`, `outputs`, `builders`, `utils`)

**Imports:**
- Absolute imports via `@` alias (configured in vite.config.ts for `@mui/styled-engine`)
- Relative imports for local modules: `../lib/types`, `../../components`

**TypeScript Naming:**
- Types/Interfaces: PascalCase (e.g., `Product`, `Recipe`, `AggregatedProduct`)
- Enums: PascalCase (e.g., `ProductType`, `StepType`, `Timing`)
- Type variables: Single capital letters or PascalCase (e.g., `T extends RecordModel`)

## Where to Add New Code

**New Feature (e.g., Budget Tracking):**
- Primary code: `src/pages/Budget.tsx` or new subdirectory under `src/pages/budget/`
- Types: Add to `src/lib/types.ts`
- Constants: Add to new or existing file in `src/constants/`
- Tests: If tests added, place alongside component files

**New Component/Module:**
- Reusable UI component: `src/components/NewComponent.tsx`
- Specialized output component: `src/components/outputs/NewOutputTab.tsx`
- Aggregation utility: `src/lib/aggregation/utils/new-utils.ts`
- Custom ReactFlow node: `src/components/nodes/CustomNode.tsx`

**Utilities:**
- Shared helpers: `src/lib/aggregation/utils/`
- Type definitions: Always in `src/lib/types.ts`
- Constants: Organize in `src/constants/` by domain (outputs.ts, mealPlanning.ts, etc.)

**Database/API:**
- New collection operations: Add to `collections` constant in `src/lib/api.ts`
- New CRUD helpers: Add to `src/lib/api.ts` (generic functions already support new collections)
- Database environment config: Add to `src/lib/db-config.ts`

## Special Directories

**.claude/:**
- Purpose: GSD (Generative Software Development) skills and reference data
- Generated: Yes (by GSD orchestrator)
- Committed: Yes (includes skill definitions)
- Content: Prompt definitions and markdown references for AI-guided development

**.planning/:**
- Purpose: GSD planning and codebase documentation
- Generated: Yes (by GSD orchestrator via `/gsd:map-codebase`)
- Committed: Yes (analysis documents)
- Content: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, etc.

**examples/:**
- Purpose: Sample recipe data and meal plans for development/testing
- Generated: Partially (synced from production/test databases)
- Committed: Yes
- Content: Example recipes with full graph structures in JSON/YAML formats

**node_modules/:**
- Purpose: npm package dependencies
- Generated: Yes (via npm install)
- Committed: No (.gitignored)

---

*Structure analysis: 2026-03-01*
