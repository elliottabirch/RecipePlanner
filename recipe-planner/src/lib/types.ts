import type { Unit, Dimension } from "./units";

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
export enum ProductType {
  Raw = "raw",
  Transient = "transient",
  Stored = "stored",
  Inventory = "inventory",
}

export enum StorageLocation {
  Fridge = "fridge",
  Freezer = "freezer",
  Dry = "dry",
}

export interface Product extends BaseRecord {
  name: string;
  type: ProductType;
  pantry?: boolean;
  track_quantity?: boolean; // For pantry items: show quantities in shopping list
  store?: string; // relation ID
  section?: string; // relation ID
  storage_location?: StorageLocation;
  container_type?: string; // relation ID
  canonical_unit?: Unit;
  dimension?: Dimension;
  // New fields for inventory
  ready_to_eat?: boolean;
  meal_slot?: "snack" | "meal";
  source_recipe?: string; // relation ID to recipes (batch prep that produces this)
  store_bought_product?: string; // relation ID to products (store-bought alternative)
  // Nutrition-ready schema (D-07/REG-04) — nullable, no nutrition UI yet.
  // Only fdc_id is populated at seed time; macros backfill in a later phase.
  fdc_id?: number;
  usda_data_type?: "foundation_food" | "sr_legacy" | "";
  usda_category?: string;
  nutrient_basis_g?: number;
  kcal?: number;
  protein_g?: number;
  fat_g?: number;
  carb_g?: number;
}

// Recipes
export interface Recipe extends BaseRecord {
  name: string;
  notes?: string;
  recipe_type?: "meal" | "batch_prep";
  // Lifecycle (D-03): un-set reads as "" on existing rows — backfilled to
  // "published" by apply-phase6-schema.mjs. Planning surfaces filter
  // `status != "draft"` (fail-open), never `status = "published"`.
  status?: "draft" | "published";
  // Evolution loop (D-10): a draft revision points at the published recipe it
  // revises. Nullable — only draft revisions set it.
  revision_of?: string; // relation ID to recipes
}

export interface RecipeTag extends BaseRecord {
  recipe: string; // relation ID
  tag: string; // relation ID
  expand?: {
    tag?: Tag;
  };
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
  // Evolution loop node correspondence (D-10, Open Q2 option A): a clone node
  // in a draft revision points back at the original published node so the
  // note→revision write-back can update in place (id-stable) rather than
  // recreate. Nullable — only clone nodes set it.
  source_node?: string; // relation ID to recipe_product_nodes
}

export enum StepType {
  Prep = "prep",
  Assembly = "assembly",
}

export enum Timing {
  Batch = "batch",
  JustInTime = "just_in_time",
}

export interface RecipeStep extends BaseRecord {
  recipe: string; // relation ID
  name: string;
  step_type: StepType;
  timing?: Timing;
  position_x?: number;
  position_y?: number;
  // Prep-day engine metadata (D-05 full resource model). All additive +
  // nullable so the existing 185 steps validate unchanged; backfilled
  // offline (PREP-02), editable in RecipeEditor thereafter.
  active_minutes?: number;
  passive_minutes?: number;
  instructions?: string;
  prep_action?: string;
  resource?: "oven" | "stovetop" | "blender" | "food_processor" | "instant_pot" | "microwave" | "sous_vide" | "smoker" | "none";
  oven_temp_f?: number;
  rack_slots?: number;
  // Evolution loop step correspondence (D-10, mirrors source_node on
  // recipe_product_nodes): a clone step in a draft revision points back at the
  // original published step so a full-graph write-back can update steps in
  // place (id-stable) rather than churn ids. Nullable — only clone steps set it.
  source_node?: string; // relation ID to recipe_steps
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
  start_date?: string; // ISO date string; nullable until 04-05 backfill+tighten
  people_multiplier?: number; // absent/undefined => treat as 1 (see aggregation call sites)
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "micah";
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface PlannedMeal extends BaseRecord {
  weekly_plan: string; // relation ID
  recipe: string; // relation ID
  meal_slot: MealSlot;
  day?: Day;
  quantity?: number;
  template_slot?: string; // relation ID to template_slots, nullable
}

// Week Templates (WEEK-03) — tag-based rotation-pool slots; no in-app editor
// this phase (D-01), created/edited via PocketBase admin UI on both instances.
export interface WeekTemplate extends BaseRecord {
  name: string;
}

export interface TemplateSlot extends BaseRecord {
  template: string; // relation ID to week_templates
  label: string;
  count: number;
  meal_slot: MealSlot; // REQUIRED — must match planned_meals.meal_slot's required flag
  day?: Day;
  pool_tags: string[]; // relation IDs to tags, match-any
  sort_order?: number;
  prefill_from_last_week?: boolean;
}

// Inventory
export interface InventoryItem extends BaseRecord {
  product: string; // relation ID
  in_stock: boolean;
  notes?: string;
}

export interface InventoryItemExpanded extends InventoryItem {
  expand?: {
    product?: Product & {
      expand?: {
        source_recipe?: Recipe;
        store_bought_product?: Product & {
          expand?: {
            store?: Store;
            section?: Section;
          };
        };
      };
    };
  };
}

// Recipe Queue
export interface RecipeQueueItem extends BaseRecord {
  recipe: string;
  sort_order?: number;
}

export interface RecipeQueueItemExpanded extends RecipeQueueItem {
  expand?: {
    recipe?: Recipe;
  };
}

// Recipe Notes (D-09) — one-tap notes captured from cook mode / calendar /
// recipe card. Pending queue = status="pending"; the agent pass drains these
// into draft revisions and sets draft_revision to the produced draft (D-10).
export interface RecipeNote extends BaseRecord {
  recipe: string; // relation ID to recipes
  text: string;
  status?: "pending" | "applied" | "dismissed";
  source_surface?: "cook_mode" | "calendar" | "recipe_card";
  draft_revision?: string; // relation ID to recipes (the draft this note produced)
}

export interface RecipeNoteExpanded extends RecipeNote {
  expand?: {
    recipe?: Recipe;
  };
}

// Expanded types (with relations populated)
export interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
    source_recipe?: Recipe;
    store_bought_product?: Product;
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

export interface MealVariantOverride extends BaseRecord {
  planned_meal: string; // relation ID
  original_node: string; // relation ID (recipe_product_node being replaced)
  replacement_product: string; // relation ID (product to use instead)
  quantity?: number | null;
  unit?: Unit | null;
}

export interface MealVariantOverrideExpanded extends MealVariantOverride {
  expand?: {
    planned_meal?: PlannedMeal;
    original_node?: RecipeProductNode & {
      expand?: { product?: Product };
    };
    replacement_product?: Product;
  };
}

// Shopping State — per-weekly-plan persisted list state (checked/have-N/resolution)
export interface ShoppingState extends BaseRecord {
  weekly_plan: string; // relation ID
  line_key: string;
  checked: boolean;
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip" | null;
}

// Cook-mode check-off progress (D-03). Mirrors ShoppingState's per-plan
// persisted-state shape, keyed by (weekly_plan, step_instance) instead of
// (weekly_plan, line_key) — cook_progress has no have-N/resolution concept.
export interface CookProgress extends BaseRecord {
  weekly_plan: string; // relation ID
  step_instance: string;
  checked: boolean;
  checked_at: string | null;
}

// Scheduler configuration (D-04) — singleton record (no weekly_plan
// relation), shared across devices. Read by both the weights panel and the
// GA scheduler.
export interface SchedulerConfig extends BaseRecord {
  seed: number;
  weights: {
    active: number;
    chopping: number;
    grouping: number;
    elapsed: number;
    resource_pressure: number;
  };
  burner_count: number;
  oven_rack_slots: number;
  appliances: string[];
}

