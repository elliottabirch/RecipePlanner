/**
 * Text File Provider - Downloads shopping list as a .txt file
 */

import DownloadIcon from "@mui/icons-material/Download";
import type {
  ListProvider,
  ShoppingListItem,
  GroupedShoppingList,
  ExportOptions,
  ExportResult,
} from "./types";
import { DEFAULT_EXPORT_OPTIONS } from "./types";
import { formatShoppingList } from "./formatters";

export class TextFileProvider implements ListProvider {
  id = "text-file";
  name = "Download as Text File";
  description = "Download shopping list as a .txt file";
  icon = (<DownloadIcon />);

  isAvailable(): boolean {
    // File download is available in all browsers
    return true;
  }

  async export(
    items: ShoppingListItem[],
    grouped: GroupedShoppingList,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    try {
      // Merge with defaults
      const mergedOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };

      // Format the shopping list
      const formattedText = formatShoppingList(grouped, mergedOptions);

      // Create blob and download
      const blob = new Blob([formattedText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename with date
      const date = new Date().toISOString().split("T")[0];
      const filename = `shopping-list-${date}.txt`;
      link.download = filename;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);

      return {
        success: true,
        message: `Shopping list downloaded as ${filename}`,
      };
    } catch (error) {
      console.error("Text file export failed:", error);
      return {
        success: false,
        error: "Failed to download file.",
      };
    }
  }
}
