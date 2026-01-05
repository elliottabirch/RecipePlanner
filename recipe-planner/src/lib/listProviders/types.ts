/**
 * List Provider System - Modular architecture for exporting shopping lists
 * to various destinations (clipboard, file, API services, etc.)
 */

import { type ReactNode } from "react";

// Core shopping list item structure
export interface ShoppingListItem {
  productId: string;
  productName: string;
  totalQuantity: number;
  unit: string;
  storeName?: string;
  sectionName?: string;
  isPantry?: boolean;
  trackQuantity?: boolean;
  sources: {
    recipeName: string;
    quantity: number;
  }[];
}

// Grouped shopping list structure
export interface GroupedShoppingList {
  byStore: Map<string, Map<string, ShoppingListItem[]>>;
  pantryItems: ShoppingListItem[];
}

// Export options for customizing output
export interface ExportOptions {
  includeQuantities?: boolean;
  includeStores?: boolean;
  includeSections?: boolean;
  includeRecipes?: boolean;
  groupBy?: "store" | "section" | "none";
  format?: "plain" | "markdown" | "checklist";
  title?: string;
}

// Result from an export operation
export interface ExportResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Base interface that all list providers must implement
 */
export interface ListProvider {
  // Unique identifier for this provider
  id: string;

  // Display name shown to users
  name: string;

  // Description of what this provider does
  description: string;

  // Icon component to show in UI
  icon: ReactNode;

  // Check if this provider is available/configured
  isAvailable(): boolean;

  // Export the shopping list
  export(
    items: ShoppingListItem[],
    grouped: GroupedShoppingList,
    options?: ExportOptions
  ): Promise<ExportResult>;

  // Optional: Get configuration UI if provider needs setup
  getConfigUI?(): ReactNode;
}

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeQuantities: true,
  includeStores: true,
  includeSections: true,
  includeRecipes: false,
  groupBy: "store",
  format: "checklist",
  title: "Shopping List",
};
