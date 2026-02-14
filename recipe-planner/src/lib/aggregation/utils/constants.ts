import { StorageLocation, type Day, type MealSlot } from "../../types";

// ============================================================================
// Constants for aggregation operations
// ============================================================================

/**
 * All possible storage locations
 * Type-checked to ensure it matches StorageLocation enum
 */
export const STORAGE_LOCATIONS: readonly StorageLocation[] = [
  StorageLocation.Fridge,
  StorageLocation.Freezer,
  StorageLocation.Dry,
] as const;

/**
 * Days of the week in order
 */
export const DAY_ORDER: readonly Day[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/**
 * Meal slots in priority order
 */
export const SLOT_ORDER: readonly MealSlot[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "micah",
] as const;

/**
 * Store sections in shopping order
 */
export const SECTION_ORDER: readonly string[] = [
  "produce",
  "bakery",
  "dairy",
  "frozen",
  "baking supplies",
  "international",
  "meat",
] as const;
