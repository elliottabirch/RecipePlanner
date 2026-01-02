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
  MealSlot,
  Day,
} from "./types";

// ============================================================================
// Types for aggregated outputs
// ============================================================================

export interface AggregatedProduct {
  productId: string;
  productName: string;
  productType: "raw" | "transient" | "stored";
  isPantry: boolean;
  totalQuantity: number;
  unit: string;
  storeName?: string;
  sectionName?: string;
  sources: { recipeName: string; quantity: number; unit: string }[];
}

export interface AggregatedStep {
  stepId: string;
  name: string;
  stepType: "prep" | "assembly";
  timing?: "batch" | "just_in_time";
  recipeName: string;
  inputs: { productName: string; quantity?: number; unit?: string }[];
  outputs: {
    productName: string;
    quantity?: number;
    unit?: string;
    mealDestination?: string;
  }[];
}

export interface StoredItem {
  productName: string;
  storageLocation: "fridge" | "freezer";
  containerTypeName?: string;
  mealDestination?: string;
  quantity?: number;
  unit?: string;
  recipeName: string;
}

export interface PullListItem {
  productName: string;
  quantity?: number;
  unit?: string;
  containerTypeName?: string;
  fromStorage: "fridge" | "freezer" | "pantry";
}

export interface PullListMeal {
  day: Day;
  slot: MealSlot;
  recipeName: string;
  items: PullListItem[];
}

// ============================================================================
// Product Flow Graph - Aggregated data types
// ============================================================================

export interface AggregatedFlowProduct {
  productId: string;
  productName: string;
  productType: "raw" | "transient" | "stored";
  totalQuantity: number;
  unit: string;
  // Track which meals contribute to this product
  mealSources: { recipeName: string; quantity: number; count: number }[];
}

export interface AggregatedFlowStep {
  stepId: string; // Unique ID based on input/output signature
  stepNames: string[]; // All step names that match this signature
  stepType: "prep" | "assembly";
  // Track which recipes use this step
  recipeSources: { recipeName: string; stepName: string; count: number }[];
  // Inputs and outputs with aggregated quantities
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

export interface ProductFlowGraphData {
  products: Map<string, AggregatedFlowProduct>;
  steps: Map<string, AggregatedFlowStep>;
  // Track which products flow into which steps (using stepId)
  productToStepFlows: { productId: string; stepId: string }[];
  // Track which steps output which products (using stepId)
  stepToProductFlows: { stepId: string; productId: string }[];
}

// ============================================================================
// Input types (data loaded from PocketBase)
// ============================================================================

export interface RecipeGraphData {
  recipe: Recipe;
  productNodes: (RecipeProductNode & {
    expand?: {
      product?: Product & {
        expand?: {
          store?: Store;
          section?: Section;
          container_type?: ContainerType;
        };
      };
    };
  })[];
  steps: RecipeStep[];
  productToStepEdges: ProductToStepEdge[];
  stepToProductEdges: StepToProductEdge[];
}

export interface PlannedMealWithRecipe extends PlannedMeal {
  expand?: { recipe?: Recipe };
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Builds a shopping list from all recipes in the plan.
 *
 * Logic:
 * 1. For each recipe, find all product nodes that are INPUTS (have edges going TO steps)
 * 2. Filter to only RAW products (ingredients to buy)
 * 3. Aggregate quantities by product ID
 * 4. Group by store and section
 */
// function to add scalar to a recipe node if it appears multiple times in the week
const combineSameRecipes = (plannedMeals: PlannedMealWithRecipe[]) => {
  return Object.values(
    plannedMeals.reduce((uniqueRecipes, plannedMeal) => {
      const uniqueRecipe = uniqueRecipes[plannedMeal.recipe];
      if (uniqueRecipe) {
        uniqueRecipe.quantity += plannedMeal.quantity;
      } else {
        uniqueRecipes[plannedMeal.recipe] = { ...plannedMeal };
      }
      return uniqueRecipes;
    }, {})
  );
};

const assembleRecipeTree = (
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
) => {};

export function buildShoppingList(
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): AggregatedProduct[] {
  const aggregated = new Map<string, AggregatedProduct>();
  console.log("=== Building Shopping List ===");
  console.log(combineSameRecipes(plannedMeals));
  console.log(`Processing ${plannedMeals.length} recipes`);

  plannedMeals.forEach((plannedMeal, recipeId) => {
    const data = recipeData.get(plannedMeal.recipe);
    if (data) {
      const recipeName = data.recipe.name;
      console.log(`\nRecipe: ${recipeName}`);
      console.log(`  Product nodes: ${data.productNodes.length}`);
      console.log(`  Steps: ${data.steps.length}`);
      console.log(`  Product→Step edges: ${data.productToStepEdges.length}`);
      console.log(`  Step→Product edges: ${data.stepToProductEdges.length}`);

      // Build set of product node IDs that are inputs (source of product_to_step edges)
      const inputNodeIds = new Set(
        data.productToStepEdges.map((e) => e.source)
      );
      console.log(`  Input node IDs: ${Array.from(inputNodeIds).join(", ")}`);

      data.productNodes.forEach((node) => {
        console.log(`  Checking node ${node.id}:`);
        console.log(`    - Is input: ${inputNodeIds.has(node.id)}`);
        console.log(`    - Product expanded: ${!!node.expand?.product}`);

        // Skip if this node is not an input (not connected to any step as source)
        if (!inputNodeIds.has(node.id)) {
          console.log(`    - SKIPPED: Not an input node`);
          return;
        }

        const product = node.expand?.product;
        if (!product) {
          console.log(`    - SKIPPED: No product expansion`);
          return;
        }

        console.log(`    - Product: ${product.name}, type: ${product.type}`);

        // Only include raw products in shopping list
        if (product.type !== "raw") {
          console.log(`    - SKIPPED: Not a raw product`);
          return;
        }

        const key = product.id;
        const existing = aggregated.get(key);

        if (existing) {
          existing.totalQuantity += node.quantity || 0;
          existing.sources.push({
            recipeName,
            quantity: node.quantity || 0,
            unit: node.unit || "",
          });
          console.log(`    - ADDED to existing: ${product.name}`);
        } else {
          aggregated.set(key, {
            productId: product.id,
            productName: product.name,
            productType: product.type,
            isPantry: product.pantry || false,
            totalQuantity: node.quantity || 0,
            unit: node.unit || "",
            storeName: product.expand?.store?.name,
            sectionName: product.expand?.section?.name,
            sources: [
              {
                recipeName,
                quantity: node.quantity || 0,
                unit: node.unit || "",
              },
            ],
          });
          console.log(`    - CREATED new entry: ${product.name}`);
        }
      });
    }
  });

  const result = Array.from(aggregated.values());
  console.log(`\nShopping list total: ${result.length} items`);
  return result;
}

/**
 * Groups shopping list by store, then by section.
 */
export function groupShoppingList(items: AggregatedProduct[]): {
  byStore: Map<string, Map<string, AggregatedProduct[]>>;
  pantryItems: AggregatedProduct[];
} {
  const byStore = new Map<string, Map<string, AggregatedProduct[]>>();
  const pantryItems: AggregatedProduct[] = [];

  items.forEach((item) => {
    if (item.isPantry) {
      pantryItems.push(item);
      return;
    }

    const storeName = item.storeName || "Other";
    const sectionName = item.sectionName || "Other";

    if (!byStore.has(storeName)) {
      byStore.set(storeName, new Map());
    }
    const storeMap = byStore.get(storeName)!;

    if (!storeMap.has(sectionName)) {
      storeMap.set(sectionName, []);
    }
    storeMap.get(sectionName)!.push(item);
  });

  return { byStore, pantryItems };
}

/**
 * Builds list of batch prep steps.
 *
 * Logic:
 * 1. Collect all prep steps (step_type === 'prep')
 * 2. Collect all batch assembly steps (step_type === 'assembly' && timing === 'batch')
 * 3. For each step, find inputs (products with edges TO this step)
 * 4. For each step, find outputs (products with edges FROM this step)
 */
export function buildBatchPrepList(
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): AggregatedStep[] {
  const steps: AggregatedStep[] = [];

  console.log("=== Building Batch Prep List ===");

  plannedMeals.forEach((plannedMeal) => {
    const data = recipeData.get(plannedMeal.recipe);
    if (data) {
      const recipeName = data.recipe.name;

      const aggregatedPrepSteps = {};
      data.steps.forEach((step) => {
        // Only include prep steps and batch assembly steps

        const isPrepStep = step.step_type === "prep";
        const isAssemblyStep =
          step.step_type === "assembly" && step.timing === "batch";
        if (!isPrepStep && !isAssemblyStep) {
          return;
        }

        console.log(
          `\nStep: ${step.name} (${step.step_type}/${step.timing || "n/a"})`
        );
        if (isPrepStep) {
          const inputEdges = data.productToStepEdges.filter(
            (e) => e.target === step.id
          );
          const inputs = inputEdges.map((e) => {
            const node = data.productNodes.find((n) => n.id === e.source);
            return {
              productName: node?.expand?.product?.name || "Unknown",
              quantity: node?.quantity,
              unit: node?.unit,
              id: node?.expand?.product?.id,
            };
          });
          console.log(
            `  Inputs: ${inputs.map((i) => i.productName).join(", ")}`
          );

          // Find outputs: products where there's an edge step→product
          const outputEdges = data.stepToProductEdges.filter(
            (e) => e.source === step.id
          );
          const outputs = outputEdges.map((e) => {
            const node = data.productNodes.find((n) => n.id === e.target);
            return {
              productName: node?.expand?.product?.name || "Unknown",
              quantity: node?.quantity,
              unit: node?.unit,
              mealDestination: node?.meal_destination,
              id: node?.id,
            };
          });
          console.log(
            `  Outputs: ${outputs.map((o) => o.productName).join(", ")}`
          );

          const aggregateProductQuantities = (aggregatedInputs, input) => {
            const savedInput = aggregatedInputs[input.id as string];
            if (savedInput) {
              aggregatedInputs.quantity = input.quantity + savedInput.quantity;
            } else {
              aggregatedInputs[input.id as string] = input;
            }

            return aggregatedInputs;
          };

          inputs.reduce(aggregateProductQuantities, {});
        }

        if (isAssemblyStep) {
          // Find inputs: products where there's an edge product→step
          const inputEdges = data.productToStepEdges.filter(
            (e) => e.target === step.id
          );
          const inputs = inputEdges.map((e) => {
            const node = data.productNodes.find((n) => n.id === e.source);
            return {
              productName: node?.expand?.product?.name || "Unknown",
              quantity: node?.quantity,
              unit: node?.unit,
            };
          });
          console.log(
            `  Inputs: ${inputs.map((i) => i.productName).join(", ")}`
          );

          // Find outputs: products where there's an edge step→product
          const outputEdges = data.stepToProductEdges.filter(
            (e) => e.source === step.id
          );
          const outputs = outputEdges.map((e) => {
            const node = data.productNodes.find((n) => n.id === e.target);
            return {
              productName: node?.expand?.product?.name || "Unknown",
              quantity: node?.quantity,
              unit: node?.unit,
              mealDestination: node?.meal_destination,
            };
          });
          console.log(
            `  Outputs: ${outputs.map((o) => o.productName).join(", ")}`
          );

          steps.push({
            stepId: step.id,
            name: step.name,
            stepType: step.step_type,
            timing: step.timing,
            recipeName,
            inputs,
            outputs,
          });
        }
      });
    }
  });

  console.log(`\nBatch prep total: ${steps.length} steps`);
  return steps;
}

/**
 * Builds list of items that will be stored in fridge/freezer after prep.
 *
 * Logic:
 * 1. Find all product nodes that are OUTPUTS (have edges coming FROM steps)
 * 2. Filter to only STORED products
 */
export function buildStoredItemsList(
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): StoredItem[] {
  const items: StoredItem[] = [];

  console.log("=== Building Stored Items List ===");

  plannedMeals.forEach((plannedMeal) => {
    const data = recipeData.get(plannedMeal.recipe);
    if (data) {
      const recipeName = data.recipe.name;

      // Build set of product node IDs that are outputs (target of step_to_product edges)
      const outputNodeIds = new Set(
        data.stepToProductEdges.map((e) => e.target)
      );
      console.log(`\nRecipe: ${recipeName}`);
      console.log(`  Output node IDs: ${Array.from(outputNodeIds).join(", ")}`);

      data.productNodes.forEach((node) => {
        // Skip if not an output
        if (!outputNodeIds.has(node.id)) {
          return;
        }

        const product = node.expand?.product;
        if (!product) {
          console.log(`  Node ${node.id}: No product expansion`);
          return;
        }

        console.log(
          `  Node ${node.id}: ${product.name}, type: ${product.type}`
        );

        // Only include stored products
        if (product.type !== "stored") {
          return;
        }

        items.push({
          productName: product.name,
          storageLocation: product.storage_location || "fridge",
          containerTypeName: product.expand?.container_type?.name,
          mealDestination: node.meal_destination,
          quantity: node.quantity,
          unit: node.unit,
          recipeName,
        });
        console.log(`    - ADDED: ${product.name}`);
      });
    }
  });

  console.log(`\nStored items total: ${items.length}`);
  return items;
}

/**
 * Builds pull lists for just-in-time meals.
 *
 * Logic:
 * 1. Find planned meals that have a specific day (not week-spanning)
 * 2. For each meal's recipe, check if it has JIT assembly steps
 * 3. For JIT steps, list inputs that need to be pulled from storage
 */
export function buildPullLists(
  plannedMeals: PlannedMealWithRecipe[],
  recipeDataMap: Map<string, RecipeGraphData>
): PullListMeal[] {
  const lists: PullListMeal[] = [];

  console.log("=== Building Pull Lists ===");
  console.log(`Planned meals: ${plannedMeals.length}`);

  plannedMeals.forEach((meal) => {
    // Skip week-spanning meals (no specific day)
    if (!meal.day) {
      console.log(`Skipping meal ${meal.id}: no specific day`);
      return;
    }

    const data = recipeDataMap.get(meal.recipe);
    if (!data) {
      console.log(`Skipping meal ${meal.id}: no recipe data`);
      return;
    }

    const recipeName = data.recipe.name;
    console.log(`\nMeal: ${recipeName} (${meal.day} ${meal.meal_slot})`);

    // Find JIT assembly steps
    const jitSteps = data.steps.filter(
      (s) => s.step_type === "assembly" && s.timing === "just_in_time"
    );
    console.log(`  JIT steps: ${jitSteps.length}`);

    if (jitSteps.length === 0) {
      return;
    }

    const items: PullListItem[] = [];

    jitSteps.forEach((step) => {
      console.log(`  Step: ${step.name}`);

      // Find inputs to this step
      const inputEdges = data.productToStepEdges.filter(
        (e) => e.target === step.id
      );

      inputEdges.forEach((e) => {
        const node = data.productNodes.find((n) => n.id === e.source);
        const product = node?.expand?.product;

        if (!product) {
          console.log(`    Input node ${e.source}: no product expansion`);
          return;
        }

        console.log(`    Input: ${product.name} (${product.type})`);

        // Determine where to pull from
        let fromStorage: "fridge" | "freezer" | "pantry";
        if (product.type === "stored") {
          fromStorage = product.storage_location || "fridge";
        } else if (product.type === "raw" && product.pantry) {
          fromStorage = "pantry";
        } else if (product.type === "raw") {
          fromStorage = "fridge"; // Fresh raw ingredients assumed in fridge
        } else {
          // Transient products shouldn't be inputs to JIT steps normally
          fromStorage = "fridge";
        }

        items.push({
          productName: product.name,
          quantity: node?.quantity,
          unit: node?.unit,
          containerTypeName: product.expand?.container_type?.name,
          fromStorage,
        });
      });
    });

    if (items.length > 0) {
      lists.push({
        day: meal.day,
        slot: meal.meal_slot,
        recipeName,
        items,
      });
    }
  });

  // Sort by day then slot
  const dayOrder: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const slotOrder: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

  lists.sort((a, b) => {
    const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot);
  });

  console.log(`\nPull lists total: ${lists.length}`);
  return lists;
}

/**
 * Builds aggregated product flow graph for the weekly plan.
 *
 * Logic:
 * 1. Aggregate all products across all recipes by product ID
 * 2. Track which meals contribute to each product (with meal counts)
 * 3. Aggregate steps by their input/output product signature (not by name)
 * 4. For each step, show aggregated inputs and outputs
 * 5. Build flow connections: products → steps → products
 */
export function buildProductFlowGraph(
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): ProductFlowGraphData {
  const products = new Map<string, AggregatedFlowProduct>();
  const steps = new Map<string, AggregatedFlowStep>();
  const productToStepFlows: { productId: string; stepId: string }[] = [];
  const stepToProductFlows: { stepId: string; productId: string }[] = [];

  console.log("=== Building Product Flow Graph ===");

  // Helper to create step signature from input/output product IDs
  const createStepSignature = (
    inputIds: string[],
    outputIds: string[]
  ): string => {
    const sortedInputs = [...inputIds].sort().join(",");
    const sortedOutputs = [...outputIds].sort().join(",");
    return `${sortedInputs}=>${sortedOutputs}`;
  };

  // Process each planned meal
  plannedMeals.forEach((plannedMeal) => {
    const data = recipeData.get(plannedMeal.recipe);
    if (!data) return;

    const recipeName = data.recipe.name;
    const mealCount = plannedMeal.quantity || 1;

    console.log(`\nProcessing: ${recipeName} (x${mealCount})`);

    // Track all product nodes in this recipe
    data.productNodes.forEach((node) => {
      const product = node.expand?.product;
      if (!product) return;

      const productId = product.id;
      const quantity = (node.quantity || 0) * mealCount;

      // Aggregate product by ID
      const existing = products.get(productId);
      if (existing) {
        existing.totalQuantity += quantity;
        // Check if this recipe is already in sources
        const existingSource = existing.mealSources.find(
          (s) => s.recipeName === recipeName
        );
        if (existingSource) {
          existingSource.count += mealCount;
          existingSource.quantity += quantity;
        } else {
          existing.mealSources.push({ recipeName, quantity, count: mealCount });
        }
      } else {
        products.set(productId, {
          productId,
          productName: product.name,
          productType: product.type,
          totalQuantity: quantity,
          unit: node.unit || "",
          mealSources: [{ recipeName, quantity, count: mealCount }],
        });
      }
    });

    // Process steps
    data.steps.forEach((step) => {
      // Only include prep and batch assembly steps (not JIT)
      const isPrepStep = step.step_type === "prep";
      const isBatchAssembly =
        step.step_type === "assembly" && step.timing === "batch";

      if (!isPrepStep && !isBatchAssembly) return;

      const stepName = step.name;

      // Find inputs to this step
      const inputEdges = data.productToStepEdges.filter(
        (e) => e.target === step.id
      );
      const inputs = inputEdges
        .map((e) => {
          const node = data.productNodes.find((n) => n.id === e.source);
          const product = node?.expand?.product;
          return {
            productId: product?.id || "",
            productName: product?.name || "Unknown",
            quantity: (node?.quantity || 0) * mealCount,
            unit: node?.unit || "",
          };
        })
        .filter((i) => i.productId);

      // Find outputs from this step
      const outputEdges = data.stepToProductEdges.filter(
        (e) => e.source === step.id
      );
      const outputs = outputEdges
        .map((e) => {
          const node = data.productNodes.find((n) => n.id === e.target);
          const product = node?.expand?.product;
          return {
            productId: product?.id || "",
            productName: product?.name || "Unknown",
            quantity: (node?.quantity || 0) * mealCount,
            unit: node?.unit || "",
          };
        })
        .filter((o) => o.productId);

      // Create step signature based on input/output products
      const inputProductIds = inputs.map((i) => i.productId);
      const outputProductIds = outputs.map((o) => o.productId);
      const stepId = createStepSignature(inputProductIds, outputProductIds);

      // Aggregate step by signature
      const existing = steps.get(stepId);
      if (existing) {
        // Add step name if not already included
        if (!existing.stepNames.includes(stepName)) {
          existing.stepNames.push(stepName);
        }

        // Update recipe sources
        const existingSource = existing.recipeSources.find(
          (s) => s.recipeName === recipeName && s.stepName === stepName
        );
        if (existingSource) {
          existingSource.count += mealCount;
        } else {
          existing.recipeSources.push({
            recipeName,
            stepName,
            count: mealCount,
          });
        }

        // Aggregate inputs
        inputs.forEach((input) => {
          const existingInput = existing.inputs.find(
            (i) => i.productId === input.productId
          );
          if (existingInput) {
            existingInput.quantity += input.quantity;
          } else {
            existing.inputs.push({ ...input });
          }
        });

        // Aggregate outputs
        outputs.forEach((output) => {
          const existingOutput = existing.outputs.find(
            (o) => o.productId === output.productId
          );
          if (existingOutput) {
            existingOutput.quantity += output.quantity;
          } else {
            existing.outputs.push({ ...output });
          }
        });
      } else {
        steps.set(stepId, {
          stepId,
          stepNames: [stepName],
          stepType: step.step_type,
          recipeSources: [{ recipeName, stepName, count: mealCount }],
          inputs: inputs.map((i) => ({ ...i })),
          outputs: outputs.map((o) => ({ ...o })),
        });
      }

      // Track flows: products → step
      inputs.forEach((input) => {
        if (
          !productToStepFlows.find(
            (f) => f.productId === input.productId && f.stepId === stepId
          )
        ) {
          productToStepFlows.push({ productId: input.productId, stepId });
        }
      });

      // Track flows: step → products
      outputs.forEach((output) => {
        if (
          !stepToProductFlows.find(
            (f) => f.stepId === stepId && f.productId === output.productId
          )
        ) {
          stepToProductFlows.push({ stepId, productId: output.productId });
        }
      });
    });
  });

  console.log(`\nFlow graph: ${products.size} products, ${steps.size} steps`);
  console.log(
    `Flows: ${productToStepFlows.length} product→step, ${stepToProductFlows.length} step→product`
  );

  return {
    products,
    steps,
    productToStepFlows,
    stepToProductFlows,
  };
}
