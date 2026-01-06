// Base record type from PocketBase
export interface BaseRecord {
  id: string;
  created: string;
  updated: string;
  collectionId: string;
  collectionName: string;
}

// Global Registries
export interface Store extends BaseRecord {
  name: string;
}

export interface Section extends BaseRecord {
  name: string;
}

export interface ContainerType extends BaseRecord {
  name: string;
}

export interface Tag extends BaseRecord {
  name: string;
  color?: string;
}

// Products
export type ProductType = "raw" | "transient" | "stored" | "inventory";
export type StorageLocation = "fridge" | "freezer" | "dry";

export interface Product extends BaseRecord {
  name: string;
  type: ProductType;
  pantry?: boolean;
  track_quantity?: boolean; // For pantry items: show quantities in shopping list
  store?: string; // relation ID
  section?: string; // relation ID
  storage_location?: StorageLocation;
  container_type?: string; // relation ID
  // New fields for inventory
  ready_to_eat?: boolean;
  meal_slot?: "snack" | "meal";
}

// Recipes
export interface Recipe extends BaseRecord {
  name: string;
  notes?: string;
  recipe_type?: "meal" | "batch_prep";
}

export interface RecipeTag extends BaseRecord {
  recipe: string; // relation ID
  tag: string; // relation ID
}

// Recipe Graph Nodes
export interface RecipeProductNode extends BaseRecord {
  recipe: string; // relation ID
  product: string; // relation ID
  quantity?: number;
  unit?: string;
  meal_destination?: string;
  position_x?: number;
  position_y?: number;
}

export type StepType = "prep" | "assembly";
export type Timing = "batch" | "just_in_time";

export interface RecipeStep extends BaseRecord {
  recipe: string; // relation ID
  name: string;
  step_type: StepType;
  timing?: Timing;
  position_x?: number;
  position_y?: number;
}

// Recipe Graph Edges
export interface ProductToStepEdge extends BaseRecord {
  recipe: string; // relation ID
  source: string; // relation ID to recipe_product_nodes
  target: string; // relation ID to recipe_steps
}

export interface StepToProductEdge extends BaseRecord {
  recipe: string; // relation ID
  source: string; // relation ID to recipe_steps
  target: string; // relation ID to recipe_product_nodes
}

// Weekly Plans
export interface WeeklyPlan extends BaseRecord {
  name?: string;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "micah";
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface PlannedMeal extends BaseRecord {
  weekly_plan: string; // relation ID
  recipe: string; // relation ID
  meal_slot: MealSlot;
  day?: Day;
  quantity?: number;
}

// Inventory
export interface InventoryItem extends BaseRecord {
  product: string; // relation ID
  in_stock: boolean;
  notes?: string;
}

export interface InventoryItemExpanded extends InventoryItem {
  expand?: {
    product?: Product;
  };
}

// Expanded types (with relations populated)
export interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
  };
}

export interface RecipeProductNodeExpanded extends RecipeProductNode {
  expand?: {
    product?: Product;
  };
}

export interface PlannedMealExpanded extends PlannedMeal {
  expand?: {
    recipe?: Recipe;
    weekly_plan?: WeeklyPlan;
  };
}
