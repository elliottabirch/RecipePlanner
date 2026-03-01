# Codebase Concerns

**Analysis Date:** 2026-03-01

## Tech Debt

**Large Page Components with Excessive State:**
- Issue: `RecipeEditor.tsx` (1313 lines), `WeeklyPlans.tsx` (1023 lines), and `Outputs.tsx` (827 lines) manage 30+ state variables each using useState, making state coordination difficult
- Files: `src/pages/RecipeEditor.tsx`, `src/pages/WeeklyPlans.tsx`, `src/pages/Outputs.tsx`
- Impact: Difficult to maintain, high risk of state synchronization bugs, poor reusability. Complex pages become a dumping ground for related logic
- Fix approach: Extract state management into custom hooks or context providers. Break large pages into smaller composable components with focused responsibilities. Consider using a state management library for complex cross-component state

**Debug Logging in Production Code:**
- Issue: `console.log()` statements left in variant override logic at lines 190, 200, 215 of `variant-utils.ts`. Also scattered `console.error()` calls throughout codebase without structured error logging
- Files: `src/lib/aggregation/utils/variant-utils.ts`, `src/components/SimpleRegistry.tsx`, `src/pages/registries/Products.tsx`, and others
- Impact: Pollutes console output, may reveal internal implementation details, makes it harder to spot genuine errors in logs
- Fix approach: Remove debug logs or replace with structured logger that respects environment (silent in production). Use error boundaries or centralized error handling instead of scattered console.error calls

**Loose Type Safety with Non-null Assertions:**
- Issue: Frequent use of non-null assertion operator (`!`) without proper nullability handling: `document.getElementById('root')!` (main.tsx:6), multiple `.get()!` calls on Maps in VariantsList and MicahMealsByTag
- Files: `src/main.tsx`, `src/components/VariantsList.tsx`, `src/components/outputs/MicahMealsByTag.tsx`, `src/components/VariantEditorDialog.tsx`
- Impact: Runtime crashes if Map lookups fail, defeats TypeScript's type safety benefits, makes code brittle to refactoring
- Fix approach: Replace assertions with proper null checks or use helper functions that safely access Maps. Add type guards for critical DOM operations

**Database Connection Reload on Switch:**
- Issue: `switchDatabase()` in `src/lib/pocketbase.ts` performs a full page reload (`window.location.reload()`) to switch between production/test databases
- Files: `src/lib/pocketbase.ts` (lines 23-35)
- Impact: User loses current UI state, form data, and unsaved work. Poor user experience for frequently switching contexts
- Fix approach: Implement in-memory PocketBase client switching without reload. Provide warning dialog before switch. Save/restore local state using sessionStorage

**Complex Graph Transformation Logic:**
- Issue: `applyVariantOverrides()` in `variant-utils.ts` performs complex node replacement and orphan detection (lines 174-276) with limited test coverage apparent
- Files: `src/lib/aggregation/utils/variant-utils.ts`, `src/components/VariantsList.tsx` (uses the logic)
- Impact: Risk of incorrect graph mutations, orphaned edges not properly cleaned up, variant replacements may silently fail or produce incorrect meals
- Fix approach: Add comprehensive unit tests for graph traversal logic. Extract into separate pure functions with thorough property-based testing

**Unstructured Error Handling:**
- Issue: Try-catch blocks that only set generic error messages ("Failed to load items", "Failed to save item") without capturing error details
- Files: `src/components/SimpleRegistry.tsx`, `src/pages/registries/Tags.tsx`, `src/pages/registries/Products.tsx`, `src/pages/WeeklyPlans.tsx`
- Impact: Difficult to debug failures, users see unhelpful messages, no distinction between network errors, validation errors, and server errors
- Fix approach: Create error handling utility that categorizes error types and provides user-friendly messages. Log structured error data for debugging

## Known Bugs

**Variant Override Orphaned Nodes Not Fully Cleaned:**
- Symptoms: After replacing a recipe product node with a variant, some upstream preparation steps may still remain in the generated meal graph but won't be executed
- Files: `src/lib/aggregation/utils/variant-utils.ts` (findOrphanedNodes function), `src/lib/aggregation/builders/`
- Trigger: Replace a product node used by multiple preparation steps, some of which only feed into other steps
- Workaround: Manually verify meal graph after applying variants in Outputs tab

**Map Get Assertions May Crash on Data Inconsistency:**
- Symptoms: Application crashes with "Cannot read property 'xxx' of undefined" when variant data becomes inconsistent
- Files: `src/components/VariantsList.tsx` (lines 87-90, 155), `src/components/outputs/MicahMealsByTag.tsx` (lines 45-55)
- Trigger: When planned meal is deleted but variant override still references it, or recipe is modified removing referenced nodes
- Workaround: Clear variant overrides manually before deleting meals

## Security Considerations

**Hardcoded Database URLs in Client:**
- Risk: Database URLs are hardcoded in `src/lib/db-config.ts` as fallback (`http://192.168.50.95:8090`, `http://192.168.50.95:8091`), exposing internal IP addresses
- Files: `src/lib/db-config.ts` (lines 16-17)
- Current mitigation: Only loads fallback if environment variables are not set; defaults to test database
- Recommendations: Use `.env.local` or deployment-specific environment configuration. Never commit default URLs. Document safe defaults. For production, ensure network isolation of database server

**No Input Validation on Recipe/Product Names:**
- Risk: User input for recipe names, product names, etc. is passed directly to PocketBase without validation, could potentially cause injection attacks or data corruption
- Files: `src/components/SimpleRegistry.tsx` (line 94), `src/components/ProductForm.tsx`, `src/pages/Recipes.tsx`
- Current mitigation: None visible - relies on PocketBase for validation
- Recommendations: Add client-side validation for length, characters, and format. Validate on server as well. Sanitize user input before display

**PocketBase Auto-cancellation Disabled:**
- Risk: `pb.autoCancellation(false)` in `src/lib/pocketbase.ts` (line 9) disables request cancellation, which could allow overlapping requests causing race conditions or data inconsistency
- Files: `src/lib/pocketbase.ts` (line 9), `src/lib/pocketbase.ts` (line 51)
- Current mitigation: None visible
- Recommendations: Document why auto-cancellation is disabled. If still needed, implement explicit request deduplication. Consider enabling auto-cancellation and handling race conditions properly

## Performance Bottlenecks

**Full Recipe Graph Recompilation on Every Data Change:**
- Problem: `loadRecipeData()` in `src/pages/WeeklyPlans.tsx` and `src/pages/Outputs.tsx` rebuilds entire recipe graph data structures on any change to planned meals, even when unrelated recipes are modified
- Files: `src/pages/WeeklyPlans.tsx`, `src/pages/Outputs.tsx`, `src/lib/aggregation.ts`
- Cause: No memoization of recipe data by meal ID. All recipes reprocessed on every change
- Improvement path: Implement memoization of individual recipe graph computations. Only rebuild affected recipes. Use useMemo with proper dependency arrays

**Unoptimized Array Filtering in Output Tabs:**
- Problem: Shopping list, batch prep, and other output tabs perform multiple nested .filter().map() operations on product arrays on every render (155+ array operations across components)
- Files: `src/components/outputs/ShoppingListTab.tsx`, `src/components/outputs/BatchPrepTab.tsx`, `src/components/outputs/PullListsTab.tsx`, and others
- Cause: Filtering happens in render phase with no memoization. Same filtering logic duplicated across components
- Improvement path: Extract filtering into useMemo hooks. Create reusable filtered list selectors. Consider virtualizing long lists with react-window

**Complex Dagre Layout Recalculation:**
- Problem: Auto-layout in `RecipeEditor.tsx` uses dagre library with complex graph calculations on every node/edge change, but re-runs even for non-layout-affecting changes
- Files: `src/pages/RecipeEditor.tsx` (lines 174-203 in applyAutoLayout)
- Cause: Layout applied eagerly without checking if node/edge topology actually changed
- Improvement path: Memoize layout results based on graph structure. Only recalculate when topology changes, not position/property updates

## Fragile Areas

**React Flow Graph Sync Logic:**
- Files: `src/pages/RecipeEditor.tsx` (node/edge state management), `src/lib/aggregation/builders/`
- Why fragile: Complex bidirectional sync between React Flow visual representation and database models. Changes to node data must be manually propagated to edges and stored data. Easy to miss updates
- Safe modification: Always update both nodes AND related edges when modifying graph. Write snapshot tests for complex graph operations. Use visual regression testing
- Test coverage: Basic CRUD operations tested implicitly through UI, but no unit tests for graph transformation logic

**Product-Step Edge Mapping in Aggregation:**
- Files: `src/lib/aggregation.ts`, `src/lib/aggregation/builders/product-builder.ts`, `src/lib/aggregation/builders/flow-builder.ts`
- Why fragile: Complex logic determines which products feed which steps and vice versa. Multiple builder functions coordinate edge creation. Easy to miss an edge or create duplicate edges
- Safe modification: Add comprehensive property-based tests. Verify graph invariants: no orphaned nodes, proper edge connectivity, expected terminal outputs
- Test coverage: No visible unit tests for builder logic

**Variant Override Application to Recipe Data:**
- Files: `src/lib/aggregation/utils/variant-utils.ts`, `src/components/VariantEditorDialog.tsx`, `src/components/VariantsList.tsx`
- Why fragile: Node replacement logic must handle cascading updates across multiple edge types. Orphan detection uses complex graph traversal. One wrong condition can silently produce incorrect meals
- Safe modification: Add integration tests that apply variants to actual recipe data and verify output is correct. Add UI tests that visually confirm variant changes produce expected outputs
- Test coverage: No unit tests visible for variant logic

**Database Model Expansion Chain:**
- Files: Throughout codebase where `expand: "..."` is used in API calls
- Why fragile: Code assumes specific expand chains exist (e.g., `meal.expand?.recipe?.recipe_type`). If PocketBase schema changes, silent null propagation could break features
- Safe modification: Create type-safe expand helpers that validate expansion paths at compile time. Add runtime checks for critical expansions
- Test coverage: Depends on actual database state; no fixture-based testing apparent

## Scaling Limits

**In-Memory State for Large Meal Plans:**
- Current capacity: Handles weekly plans with multiple meals and variant overrides without apparent lag up to ~50+ meals per week
- Limit: React re-renders entire week on any state change. Memory consumption grows linearly with planned meals, recipes, and variant overrides
- Scaling path: Implement pagination or virtual scrolling. Use context with selectors to prevent unnecessary re-renders. Consider server-side filtering

**Graph Complexity for Complex Recipes:**
- Current capacity: Can handle recipes with ~20-30 products and steps smoothly in RecipeEditor
- Limit: Dagre layout computation becomes noticeable with 50+ nodes. React Flow rendering slows with many edges
- Scaling path: Implement level-of-detail rendering. Collapse sub-graphs. Use web workers for layout computation. Implement incremental graph updates

## Dependencies at Risk

**React 19 with Limited TypeScript Support:**
- Risk: React 19 is very recent (2025). May have edge cases with TypeScript inference and React Flow integration
- Impact: Potential type errors in future updates, incompatibility with older library versions
- Migration plan: Pin React to 19.2.0 until thoroughly tested. Monitor React Flow compatibility. Have fallback plan to downgrade to React 18 if critical bugs found

**PocketBase SDK Tight Coupling:**
- Risk: PocketBase client directly imported throughout codebase. Switching databases or backends requires rewriting API layer across many files
- Impact: Vendor lock-in. Hard to test without real PocketBase instance. Can't easily implement alternative storage
- Migration plan: Already partially addressed with `src/lib/pocketbase.ts` abstraction, but API functions still use concrete PocketBase types. Create adapter pattern for storage layer

**Dagre Graph Library Deprecation Risk:**
- Risk: Dagre (0.8.5) hasn't been updated since 2017. No longer actively maintained
- Impact: No bug fixes for graph layout issues. May have performance problems with modern browsers
- Migration plan: Evaluate alternatives like ELK (Eclipse Layout Kernel) or Cytoscape. Plan migration if Dagre causes problems

## Missing Critical Features

**No Undo/Redo System:**
- Problem: Users can lose data by accidentally deleting recipes, products, or meal plans. No way to recover
- Blocks: Can't confidently make bulk edits to recipe data
- Recommendation: Implement undo/redo using immer for immutable updates or by storing edit history

**No Batch Import/Export:**
- Problem: Recipes must be created one at a time through UI. No way to bulk import from external formats
- Blocks: Can't efficiently port existing recipes from other systems or backups
- Recommendation: Add JSON import/export for recipes and meal plans

**No Role-Based Access Control:**
- Problem: Everyone with access can modify all data. No audit trail
- Blocks: Can't share read-only access. Can't track who made changes
- Recommendation: Implement PocketBase authorization rules and add audit logging

**No Real-Time Sync:**
- Problem: Multiple users editing same data will overwrite each other's changes
- Blocks: Can't collaborate on meal planning
- Recommendation: Implement optimistic updates with conflict resolution or use PocketBase realtime features

## Test Coverage Gaps

**Graph Building Logic Untested:**
- What's not tested: `processRecipeProducts()`, `processRecipeSteps()`, edge creation functions in builders
- Files: `src/lib/aggregation/builders/product-builder.ts`, `src/lib/aggregation/builders/step-builder.ts`, `src/lib/aggregation/builders/flow-builder.ts`
- Risk: Incorrect graph transformations go unnoticed. Variant overrides apply to wrong nodes. Pull lists missing items
- Priority: High - these are critical business logic functions

**Variant Override Logic Untested:**
- What's not tested: `findOrphanedNodes()`, `applyVariantOverrides()`, edge cleanup
- Files: `src/lib/aggregation/utils/variant-utils.ts`
- Risk: Variant replacements silently produce incorrect meal graphs. Orphaned preparation steps remain in graph
- Priority: High - variant feature is customer-facing

**Aggregation Utilities Untested:**
- What's not tested: Filter functions, sort functions, product storage location determination
- Files: `src/lib/aggregation/utils/filter-utils.ts`, `src/lib/aggregation/utils/sort-utils.ts`, `src/lib/aggregation/utils/product-utils.ts`
- Risk: Shopping lists sorted incorrectly, products grouped by wrong store, storage locations misidentified
- Priority: High - affects all output lists

**Component Integration Untested:**
- What's not tested: VariantsList, VariantEditorDialog, ProductForm, large page components
- Files: `src/components/VariantsList.tsx`, `src/components/VariantEditorDialog.tsx`, `src/components/ProductForm.tsx`
- Risk: UI crashes when data is inconsistent, form validation doesn't work, dialogs don't properly save data
- Priority: Medium - some functionality tested implicitly through manual QA

**E2E User Workflows Untested:**
- What's not tested: Complete workflows like "create recipe -> plan meal -> generate shopping list"
- Risk: Cross-component integration bugs go unnoticed. Breaking changes to API signatures affect entire workflow
- Priority: Medium - critical workflows should have E2E tests

---

*Concerns audit: 2026-03-01*
