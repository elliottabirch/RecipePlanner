import type {
  Recipe,
  Product,
  RecipeProductNode,
  RecipeStep,
  ProductToStepEdge,
  StepToProductEdge,
  PlannedMeal,
  Store,
  Section,
  ContainerType,
  ProductType,
  StorageLocation,
  MealSlot,
  Day,
  StepType,
  Timing,
} from "../types";

// ============================================================================
// Aggregation Type Definitions
// ============================================================================

/**
 * Recipe product node with fully expanded relations
 */
export type ExpandedProductNode = RecipeProductNode & {
  expand?: {
    product?: Product & {
      expand?: {
        store?: Store;
        section?: Section;
        container_type?: ContainerType;
      };
    };
  };
};

/**
 * Input data structure: Recipe with all its graph components
 */
export interface RecipeGraphData {
  recipe: Recipe;
  productNodes: ExpandedProductNode[];
  steps: RecipeStep[];
  productToStepEdges: ProductToStepEdge[];
  stepToProductEdges: StepToProductEdge[];
}

/**
 * Recipe graph data keyed by planned meal ID.
 * This allows the same recipe to have different effective graphs
 * for different planned meals (when variants are applied).
 */
export type MealKeyedRecipeData = Map<string, RecipeGraphData>;

/**
 * Planned meal with expanded recipe data
 */
export interface PlannedMealWithRecipe extends PlannedMeal {
  expand?: { recipe?: Recipe };
}

/**
 * Aggregated product in the flow graph
 */
export interface AggregatedFlowProduct {
  productId: string;
  productName: string;
  productType: ProductType;
  totalQuantity: number;
  unit: string;
  mealSources: { recipeName: string; quantity: number; count: number }[];
  isPantry?: boolean;
  trackQuantity?: boolean;
  storeName?: string;
  sectionName?: string;
  storageLocation?: StorageLocation;
}

/**
 * Aggregated step in the flow graph
 */
export interface AggregatedFlowStep {
  stepId: string;
  stepNames: string[];
  stepType: StepType;
  recipeSources: { recipeName: string; stepName: string; count: number }[];
  inputs: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }[];
  outputs: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
  }[];
}

/**
 * Complete product flow graph data
 */
export interface ProductFlowGraphData {
  products: Map<string, AggregatedFlowProduct>;
  steps: Map<string, AggregatedFlowStep>;
  productToStepFlows: { productId: string; stepId: string }[];
  stepToProductFlows: { stepId: string; productId: string }[];
}

/**
 * Aggregated product for shopping list
 */
export interface AggregatedProduct {
  productId: string;
  productName: string;
  productType: ProductType;
  isPantry: boolean;
  trackQuantity?: boolean;
  totalQuantity: number;
  unit: string;
  storeName?: string;
  sectionName?: string;
  sources: { recipeName: string; quantity: number; unit: string }[];
}

/**
 * Aggregated step for batch prep list
 */
export interface AggregatedStep {
  stepId: string;
  name: string;
  stepType: StepType;
  timing?: Timing;
  recipeName: string;
  inputs: { productName: string; quantity?: number; unit?: string }[];
  outputs: {
    productName: string;
    quantity?: number;
    unit?: string;
    mealDestination?: string;
  }[];
}

/**
 * Stored item in fridge/freezer
 */
export interface StoredItem {
  productName: string;
  storageLocation: StorageLocation;
  containerTypeName?: string;
  mealDestination?: string;
  quantity?: number;
  unit?: string;
  recipeName: string;
}

/**
 * Pull list item for JIT assembly
 */
export interface PullListItem {
  productName: string;
  quantity?: number;
  unit?: string;
  containerTypeName?: string;
  fromStorage: StorageLocation | "pantry";
}

/**
 * Pull list for a specific meal
 */
export interface PullListMeal {
  day: Day;
  slot: MealSlot;
  recipeName: string;
  items: PullListItem[];
}

/**
 * Meal containers grouped by recipe
 */
export interface MealContainer {
  recipeName: string;
  containers: {
    productName: string;
    containerTypeName?: string;
    storageLocation: StorageLocation;
    quantity?: number;
    unit?: string;
  }[];
}
