/**
 * List Providers - Export your shopping lists to various destinations
 *
 * Available Providers:
 * - ClipboardProvider: Copy to clipboard (perfect for Google Keep)
 */

export { ClipboardProvider } from "./ClipboardProvider";
export type {
  ListProvider,
  ShoppingListItem,
  GroupedShoppingList,
  ExportOptions,
  ExportResult,
} from "./types";
export { DEFAULT_EXPORT_OPTIONS } from "./types";
export { formatShoppingList } from "./formatters";

// Registry of all available providers
import { ClipboardProvider } from "./ClipboardProvider";
import type { ListProvider } from "./types";

export const ALL_PROVIDERS: ListProvider[] = [
  new ClipboardProvider(),
  // Add more providers here as they're implemented:
  // new GoogleTasksProvider(),
  // new TextFileProvider(),
];

/**
 * Get all available providers (filters out unavailable ones)
 */
export function getAvailableProviders(): ListProvider[] {
  return ALL_PROVIDERS.filter((provider) => provider.isAvailable());
}
