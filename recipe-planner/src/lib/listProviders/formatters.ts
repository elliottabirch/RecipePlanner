/**
 * Utility functions for formatting shopping lists in various formats
 */

import type { GroupedShoppingList, ExportOptions } from "./types";

/**
 * Format a shopping list for Google Keep (hierarchical tab-delimited format)
 * - No pantry items (filters out isPantry: true items)
 * - Store → Section → Items hierarchy
 * - One item per line
 */
export function formatForGoogleKeep(
  grouped: GroupedShoppingList,
  options: ExportOptions
): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(options.title);
    lines.push("");
  }

  // Format: Store → Section → Items
  grouped.byStore.forEach((sections, storeName) => {
    let storeHasItems = false;

    // Check if store has any non-pantry items
    const sectionsWithItems = new Map<
      string,
      Array<{ productName: string; quantity: string }>
    >();

    sections.forEach((items, sectionName) => {
      const nonPantryItems = items.filter((item) => !item.isPantry);
      if (nonPantryItems.length > 0) {
        storeHasItems = true;
        sectionsWithItems.set(
          sectionName,
          nonPantryItems.map((item) => ({
            productName: item.productName,
            quantity: options.includeQuantities
              ? ` — ${item.totalQuantity} ${item.unit}`
              : "",
          }))
        );
      }
    });

    // Only output store if it has items
    if (storeHasItems) {
      // Level 0: Store name (no tabs)
      if (options.includeStores) {
        lines.push(storeName);
      }

      // Level 1: Section names and items
      sectionsWithItems.forEach((items, sectionName) => {
        // Section as subtitle (indented once)
        if (options.includeSections) {
          lines.push(`\t${sectionName}`);
        }

        // Level 2: Items (indented twice)
        items.forEach((item) => {
          lines.push(`\t\t${item.productName}${item.quantity}`);
        });
      });

      lines.push(""); // Blank line between stores
    }
  });

  return lines.join("\n");
}

/**
 * Format a shopping list as plain text
 */
export function formatAsPlainText(
  grouped: GroupedShoppingList,
  options: ExportOptions
): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(options.title);
    lines.push("=".repeat(options.title.length));
    lines.push("");
  }

  // Format by store and section
  if (options.groupBy === "store") {
    grouped.byStore.forEach((sections, storeName) => {
      if (options.includeStores) {
        lines.push(storeName.toUpperCase());
        lines.push("");
      }

      sections.forEach((items, sectionName) => {
        if (options.includeSections) {
          lines.push(`  ${sectionName}:`);
        }

        items.forEach((item) => {
          const quantity = options.includeQuantities
            ? ` — ${item.totalQuantity} ${item.unit}`
            : "";
          const recipes = options.includeRecipes
            ? ` (${item.sources.map((s) => s.recipeName).join(", ")})`
            : "";
          lines.push(`    • ${item.productName}${quantity}${recipes}`);
        });

        lines.push("");
      });
    });
  }

  // Pantry items
  if (grouped.pantryItems.length > 0) {
    lines.push("PANTRY CHECK");
    lines.push("");
    grouped.pantryItems.forEach((item) => {
      const quantity =
        options.includeQuantities && item.trackQuantity
          ? ` — ${item.totalQuantity} ${item.unit}`
          : "";
      lines.push(`  • ${item.productName}${quantity}`);
    });
  }

  return lines.join("\n");
}

/**
 * Format a shopping list as markdown
 */
export function formatAsMarkdown(
  grouped: GroupedShoppingList,
  options: ExportOptions
): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(`# ${options.title}`);
    lines.push("");
  }

  // Format by store and section
  if (options.groupBy === "store") {
    grouped.byStore.forEach((sections, storeName) => {
      if (options.includeStores) {
        lines.push(`## ${storeName}`);
        lines.push("");
      }

      sections.forEach((items, sectionName) => {
        if (options.includeSections) {
          lines.push(`### ${sectionName}`);
          lines.push("");
        }

        items.forEach((item) => {
          const quantity = options.includeQuantities
            ? ` — **${item.totalQuantity} ${item.unit}**`
            : "";
          const recipes = options.includeRecipes
            ? ` *(${item.sources.map((s) => s.recipeName).join(", ")})*`
            : "";
          lines.push(`- ${item.productName}${quantity}${recipes}`);
        });

        lines.push("");
      });
    });
  }

  // Pantry items
  if (grouped.pantryItems.length > 0) {
    lines.push("## Pantry Check");
    lines.push("");
    grouped.pantryItems.forEach((item) => {
      const quantity =
        options.includeQuantities && item.trackQuantity
          ? ` — **${item.totalQuantity} ${item.unit}**`
          : "";
      lines.push(`- ${item.productName}${quantity}`);
    });
  }

  return lines.join("\n");
}

/**
 * Format a shopping list as a checklist (□ unchecked boxes)
 */
export function formatAsChecklist(
  grouped: GroupedShoppingList,
  options: ExportOptions
): string {
  const lines: string[] = [];

  if (options.title) {
    lines.push(options.title);
    lines.push("=".repeat(options.title.length));
    lines.push("");
  }

  // Format by store and section
  if (options.groupBy === "store") {
    grouped.byStore.forEach((sections, storeName) => {
      if (options.includeStores) {
        lines.push(storeName.toUpperCase());
        lines.push("");
      }

      sections.forEach((items, sectionName) => {
        if (options.includeSections) {
          lines.push(`  ${sectionName}:`);
        }

        items.forEach((item) => {
          const quantity = options.includeQuantities
            ? ` — ${item.totalQuantity} ${item.unit}`
            : "";
          const recipes = options.includeRecipes
            ? ` (${item.sources.map((s) => s.recipeName).join(", ")})`
            : "";
          lines.push(`    ☐ ${item.productName}${quantity}${recipes}`);
        });

        lines.push("");
      });
    });
  }

  // Pantry items
  if (grouped.pantryItems.length > 0) {
    lines.push("PANTRY CHECK");
    lines.push("");
    grouped.pantryItems.forEach((item) => {
      const quantity =
        options.includeQuantities && item.trackQuantity
          ? ` — ${item.totalQuantity} ${item.unit}`
          : "";
      lines.push(`  ☐ ${item.productName}${quantity}`);
    });
  }

  return lines.join("\n");
}

/**
 * Main formatter function that dispatches to the appropriate formatter
 */
export function formatShoppingList(
  grouped: GroupedShoppingList,
  options: ExportOptions
): string {
  switch (options.format) {
    case "markdown":
      return formatAsMarkdown(grouped, options);
    case "checklist":
      return formatAsChecklist(grouped, options);
    case "plain":
      return formatAsPlainText(grouped, options);
    default:
      // Default to Google Keep format
      return formatForGoogleKeep(grouped, options);
  }
}
