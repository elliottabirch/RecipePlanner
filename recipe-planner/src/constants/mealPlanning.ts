import type { Day, MealSlot } from "../lib/types";

export const DAYS: { value: Day; label: string }[] = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "micah", label: "Micah Meal" },
];

export const SLOT_COLORS: Record<MealSlot, string> = {
  breakfast: "#ff9800",
  lunch: "#4caf50",
  dinner: "#2196f3",
  snack: "#9c27b0",
  micah: "#00bcd4",
};
