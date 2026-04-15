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
    // Always available - we have a fallback for non-HTTPS contexts
    return typeof document !== "undefined";
  }

  private async copyToClipboard(text: string): Promise<void> {
    // Prefer the modern Clipboard API (requires HTTPS or localhost)
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback for non-secure contexts (e.g., HTTP on LAN)
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async export(
    _items: ShoppingListItem[],
    grouped: GroupedShoppingList,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    try {
      // Use Google Keep optimized format:
      // - Simple tab-delimited structure
      // - Store name, then items indented with tabs
      // - No pantry items
      const mergedOptions: ExportOptions = {
        ...DEFAULT_EXPORT_OPTIONS,
        ...options,
        format: "plain" as const, // Will use formatForGoogleKeep as default
        includeStores: true,
        includeSections: false, // No sections for simplicity
        includeRecipes: false,
        includeQuantities: true,
      };

      // Format the shopping list
      const formattedText = formatShoppingList(grouped, mergedOptions);

      // Copy to clipboard
      await this.copyToClipboard(formattedText);

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
