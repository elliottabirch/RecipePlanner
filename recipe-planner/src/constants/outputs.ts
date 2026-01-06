/**
 * Constants for the Outputs page and related components
 * This file centralizes all hard-coded strings, colors, and configuration values
 * to ensure consistency across the application.
 */

import type { ProductType, StepType, StorageLocation } from "../lib/types";

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

export enum OutputTab {
  ShoppingList = 0,
  BatchPrep = 1,
  FridgeFreezer = 2,
  MealContainers = 3,
  MicahMeals = 4,
  PullLists = 5,
  WeeklyView = 6,
  ProductFlow = 7,
}

export const OUTPUT_TAB_LABELS: Record<OutputTab, string> = {
  [OutputTab.ShoppingList]: "Shopping List",
  [OutputTab.BatchPrep]: "Batch Prep",
  [OutputTab.FridgeFreezer]: "Fridge/Freezer",
  [OutputTab.MealContainers]: "Meal Containers",
  [OutputTab.MicahMeals]: "Micah's Meals",
  [OutputTab.PullLists]: "Pull Lists",
  [OutputTab.WeeklyView]: "Weekly View",
  [OutputTab.ProductFlow]: "Product Flow",
} as const;

// ============================================================================
// VISUAL STYLING
// ============================================================================

export interface NodeStyle {
  background: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  width: number;
}

/**
 * Color scheme for product nodes based on product type
 */
export const PRODUCT_NODE_COLORS: Record<
  ProductType,
  { background: string; border: string }
> = {
  raw: {
    background: "#e8f5e9",
    border: "#4caf50",
  },
  transient: {
    background: "#fff3e0",
    border: "#ff9800",
  },
  stored: {
    background: "#e3f2fd",
    border: "#2196f3",
  },
  inventory: {
    background: "#f5f5f5",
    border: "#9e9e9e",
  },
} as const;

/**
 * Color scheme for step nodes based on step type
 */
export const STEP_NODE_COLORS: Record<
  StepType,
  { background: string; border: string }
> = {
  prep: {
    background: "#f3e5f5",
    border: "#9c27b0",
  },
  assembly: {
    background: "#ffebee",
    border: "#f44336",
  },
} as const;

/**
 * Common node styling constants
 */
export const NODE_STYLE = {
  borderWidth: 2,
  borderRadius: 8,
  width: 220,
  height: 120,
  padding: 0,
} as const;

/**
 * Edge styling constants
 */
export const EDGE_STYLE = {
  stroke: "#888",
  animated: true,
} as const;

// ============================================================================
// FLOW GRAPH LAYOUT
// ============================================================================

/**
 * Configuration for dagre graph layout algorithm
 */
export const GRAPH_LAYOUT_CONFIG = {
  rankdir: "LR" as const, // Left to right
  nodesep: 80, // Vertical separation between nodes
  ranksep: 150, // Horizontal separation between ranks
} as const;

// ============================================================================
// UI TEXT AND MESSAGES
// ============================================================================

export const UI_TEXT = {
  // Page titles and descriptions
  pageTitle: "Outputs",
  pageDescription: "Generated shopping lists, prep lists, and calendars",

  // Form labels
  weeklyPlanLabel: "Weekly Plan",
  unnamedPlan: "Unnamed Plan",

  // Section titles
  shoppingListTitle: "Shopping List",
  fridgeFreezerTitle: "Fridge/Freezer Contents After Prep",
  mealContainersTitle: "Meal Containers",
  mealContainersDescription:
    "Quick reference for which containers belong to which meals",
  micahMealsTitle: "Micah's Meals",
  micahMealsDescription: 'All containers for meals tagged as "Micah Meal"',
  pullListsTitle: "Just-in-Time Pull Lists",
  pantryCheckTitle: "Pantry Check",

  // Button labels
  copyToClipboard: "Copy to Clipboard",
  printList: "Print List",

  // Batch prep labels
  inputsLabel: "Inputs:",
  outputsLabel: "Outputs:",
  fromLabel: "From:",
  noneLabel: "None",

  // Empty states
  selectPlanPrompt: "Select a weekly plan to generate outputs",
  noShoppingItems:
    "No items to shop for. Make sure your recipes have raw product nodes connected to steps.",
  noPrepSteps:
    "No prep steps. Make sure your recipes have prep or batch assembly steps.",
  noStoredItems:
    "No stored items. Make sure your recipes have stored product nodes as outputs from steps.",
  noMealContainers:
    "No meal containers. Make sure your recipes have stored products with meal destinations specified.",
  noJustInTimeMeals:
    'No just-in-time meals. Make sure your recipes have assembly steps with timing set to "just_in_time".',
  noProductFlow:
    "No product flow data. Make sure your recipes have prep or batch assembly steps.",

  // Warnings
  outOfStockWarning: "⚠️ Out of Stock Items:",

  // Export
  exportSuccess: "Export completed",
} as const;

/**
 * Storage location display names
 */
export const STORAGE_LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  dry: "Dry Storage",
} as const;

/**
 * Step type display names
 */
export const STEP_TYPE_LABELS: Record<StepType, string> = {
  prep: "Prep",
  assembly: "Assembly",
} as const;

export const ERROR_MESSAGES = {
  failedToLoadPlans: "Failed to load plans",
  failedToLoadPlanData: "Failed to load plan data",
  noExportProviders: "No export providers available",
} as const;

// ============================================================================
// WELL-KNOWN TAGS
// ============================================================================

/**
 * Enum for well-known tags that have special meaning in the application.
 * These tags are created by users in the database, but the application
 * looks for them by name to provide special functionality.
 */
export enum WellKnownTag {
  MicahMeal = "MICAH_MEAL",
}

/**
 * Canonical names used to look up well-known tags in the database.
 * These should match the lowercase tag names in the database.
 */
export const WELL_KNOWN_TAG_LOOKUP_NAMES: Record<WellKnownTag, string> = {
  [WellKnownTag.MicahMeal]: "micah meal",
} as const;

/**
 * Display names for well-known tags (used in UI)
 */
export const WELL_KNOWN_TAG_DISPLAY_NAMES: Record<WellKnownTag, string> = {
  [WellKnownTag.MicahMeal]: "Micah Meal",
} as const;

/**
 * Helper function to find a well-known tag by comparing tag names (case-insensitive)
 */
export function findWellKnownTag(
  tagName: string,
  wellKnownTag: WellKnownTag
): boolean {
  const lookupName = WELL_KNOWN_TAG_LOOKUP_NAMES[wellKnownTag];
  return tagName.toLowerCase() === lookupName.toLowerCase();
}

// ============================================================================
// EXPORT CONFIGURATION
// ============================================================================

export const DEFAULT_EXPORT_OPTIONS = {
  includeQuantities: true,
  includeStores: true,
  includeSections: true,
  includeRecipes: false,
  groupBy: "store" as const,
  format: "checklist" as const,
  title: "Shopping List",
} as const;

// ============================================================================
// CHECKBOX KEY PREFIXES
// ============================================================================

/**
 * Prefixes used to generate unique keys for checkbox items
 */
export const CHECKBOX_KEY_PREFIXES = {
  pantry: "pantry-",
  shoppingItem: "shop-",
  batchPrep: "batch-",
  stored: "stored-",
  pullList: "pull-",
  container: "container-",
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the node style for a product type
 */
export function getProductNodeStyle(productType: ProductType): NodeStyle {
  const colors = PRODUCT_NODE_COLORS[productType];
  return {
    background: colors.background,
    borderColor: colors.border,
    borderWidth: NODE_STYLE.borderWidth,
    borderRadius: NODE_STYLE.borderRadius,
    width: NODE_STYLE.width,
  };
}

/**
 * Get the node style for a step type
 */
export function getStepNodeStyle(stepType: StepType): NodeStyle {
  const colors = STEP_NODE_COLORS[stepType];
  return {
    background: colors.background,
    borderColor: colors.border,
    borderWidth: NODE_STYLE.borderWidth,
    borderRadius: NODE_STYLE.borderRadius,
    width: NODE_STYLE.width,
  };
}

/**
 * Generate a checkbox key for a pantry item
 */
export function getPantryCheckboxKey(productId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.pantry}${productId}`;
}

/**
 * Generate a checkbox key for a shopping item
 */
export function getShoppingCheckboxKey(productId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.shoppingItem}${productId}`;
}

/**
 * Generate a checkbox key for a batch prep step
 */
export function getBatchPrepCheckboxKey(stepId: string): string {
  return `${CHECKBOX_KEY_PREFIXES.batchPrep}${stepId}`;
}

/**
 * Generate a checkbox key for a stored item
 */
export function getStoredCheckboxKey(
  location: StorageLocation,
  index: number
): string {
  return `${CHECKBOX_KEY_PREFIXES.stored}${location}-${index}`;
}

/**
 * Generate a checkbox key for a pull list item
 */
export function getPullListCheckboxKey(
  day: string,
  meal: string,
  index: number
): string {
  return `${CHECKBOX_KEY_PREFIXES.pullList}${day}-${meal}-${index}`;
}

/**
 * Generate a checkbox key for a meal container
 */
export function getContainerCheckboxKey(index: number): string {
  return `${CHECKBOX_KEY_PREFIXES.container}${index}`;
}
