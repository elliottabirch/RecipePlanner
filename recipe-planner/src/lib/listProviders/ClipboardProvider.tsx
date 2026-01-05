/**
 * Clipboard Provider - Copies formatted shopping list to clipboard
 * Perfect for pasting into Google Keep, Notes apps, etc.
 */

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type {
  ListProvider,
  ShoppingListItem,
  GroupedShoppingList,
  ExportOptions,
  ExportResult,
} from "./types";
import { DEFAULT_EXPORT_OPTIONS } from "./types";
import { formatShoppingList } from "./formatters";

export class ClipboardProvider implements ListProvider {
  id = "clipboard";
  name = "Copy to Clipboard";
  description = "Copy formatted list to clipboard for pasting into Google Keep";
  icon = (<ContentCopyIcon />);

  isAvailable(): boolean {
    // Clipboard API is available in most modern browsers
    return typeof navigator !== "undefined" && !!navigator.clipboard;
  }

  async export(
    items: ShoppingListItem[],
    grouped: GroupedShoppingList,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    try {
      // Use Google Keep optimized format:
      // - Simple tab-delimited structure
      // - Store name, then items indented with tabs
      // - No pantry items
      const mergedOptions = {
        ...DEFAULT_EXPORT_OPTIONS,
        ...options,
        format: "plain", // Will use formatForGoogleKeep as default
        includeStores: true,
        includeSections: false, // No sections for simplicity
        includeRecipes: false,
        includeQuantities: true,
      };

      // Format the shopping list
      const formattedText = formatShoppingList(grouped, mergedOptions);

      // Copy to clipboard
      await navigator.clipboard.writeText(formattedText);

      return {
        success: true,
        message:
          "Shopping list copied! Paste into Google Keep to create checkboxes.",
      };
    } catch (error) {
      console.error("Clipboard export failed:", error);
      return {
        success: false,
        error:
          "Failed to copy to clipboard. Please check your browser permissions.",
      };
    }
  }
}
