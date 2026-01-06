import type { StorageLocation, Day, MealSlot } from "../../types";

// ============================================================================
// Constants for aggregation operations
// ============================================================================

/**
 * All possible storage locations
 * Type-checked to ensure it matches StorageLocation type
 */
export const STORAGE_LOCATIONS: readonly StorageLocation[] = [
  "fridge",
  "freezer",
  "dry",
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
