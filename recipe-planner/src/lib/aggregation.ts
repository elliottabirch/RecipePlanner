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
  InventoryItemExpanded,
} from "./types";

// ============================================================================
// Types for aggregated outputs
// ============================================================================

export interface AggregatedProduct {
  productId: string;
  productName: string;
  productType: "raw" | "transient" | "stored" | "inventory";
  isPantry: boolean;
  trackQuantity?: boolean;
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
  storageLocation: "fridge" | "freezer" | "dry";
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
  fromStorage: "fridge" | "freezer" | "pantry" | "dry";
}

export interface PullListMeal {
  day: Day;
  slot: MealSlot;
  recipeName: string;
  items: PullListItem[];
}

export interface MealContainer {
  recipeName: string;
  containers: {
    productName: string;
    containerTypeName?: string;
    storageLocation: "fridge" | "freezer" | "dry";
    quantity?: number;
    unit?: string;
  }[];
}

// ============================================================================
// Product Flow Graph - Aggregated data types
// ============================================================================

export interface AggregatedFlowProduct {
  productId: string;
  productName: string;
  productType: "raw" | "transient" | "stored" | "inventory";
  totalQuantity: number;
  unit: string;
  // Track which meals contribute to this product
  mealSources: { recipeName: string; quantity: number; count: number }[];
  // Additional metadata for raw products
  isPantry?: boolean;
  trackQuantity?: boolean;
  storeName?: string;
  sectionName?: string;
  storageLocation?: "fridge" | "freezer" | "dry";
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
 * Groups shopping list by store, then by section.
 * Pantry items appear in BOTH their store/section groups AND the separate pantry list.
 */
export function groupShoppingList(items: AggregatedProduct[]): {
  byStore: Map<string, Map<string, AggregatedProduct[]>>;
  pantryItems: AggregatedProduct[];
} {
  const byStore = new Map<string, Map<string, AggregatedProduct[]>>();
  const pantryItems: AggregatedProduct[] = [];

  items.forEach((item) => {
    // Add pantry items to the separate pantry list
    if (item.isPantry) {
      pantryItems.push(item);
    }

    // Add ALL items (including pantry) to their store/section groups
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

  plannedMeals.forEach((meal) => {
    // Skip week-spanning meals (no specific day)
    if (!meal.day) {
      return;
    }

    const data = recipeDataMap.get(meal.recipe);
    if (!data) {
      return;
    }

    const recipeName = data.recipe.name;

    // Find JIT assembly steps
    const jitSteps = data.steps.filter(
      (s) => s.step_type === "assembly" && s.timing === "just_in_time"
    );

    if (jitSteps.length === 0) {
      return;
    }

    const items: PullListItem[] = [];

    jitSteps.forEach((step) => {
      // Find inputs to this step
      const inputEdges = data.productToStepEdges.filter(
        (e) => e.target === step.id
      );

      inputEdges.forEach((e) => {
        const node = data.productNodes.find((n) => n.id === e.source);
        const product = node?.expand?.product;

        if (!product) {
          return;
        }

        // Determine where to pull from
        let fromStorage: "fridge" | "freezer" | "pantry" | "dry";
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

    // Track all product nodes in this recipe
    data.productNodes.forEach((node) => {
      const product = node.expand?.product;
      if (!product) return;

      const quantity = node.quantity || 0;

      // For stored products, create separate nodes for each instance
      // For raw/transient products, aggregate them
      if (product.type === "stored") {
        // quantity = number of containers per meal
        const numContainers = quantity || 1;
        const totalInstances = numContainers * mealCount;

        // Create a separate node for each container instance
        for (let i = 0; i < totalInstances; i++) {
          const productKey = `${product.id}-${
            node.meal_destination || "unnamed"
          }-${plannedMeal.id}-${i}`;
          products.set(productKey, {
            productId: productKey,
            productName: node.meal_destination
              ? `${product.name} (${node.meal_destination}) #${i + 1}`
              : `${product.name} #${i + 1}`,
            productType: product.type,
            totalQuantity: 1, // Each instance represents 1 container
            unit: node.unit || "",
            mealSources: [{ recipeName, quantity: 1, count: 1 }],
            storageLocation: product.storage_location,
          });
        }
      } else {
        // Aggregate raw and transient products
        const productKey = product.id;
        const totalQuantity = quantity * mealCount;

        const existing = products.get(productKey);
        if (existing) {
          existing.totalQuantity += totalQuantity;
          const existingSource = existing.mealSources.find(
            (s) => s.recipeName === recipeName
          );
          if (existingSource) {
            existingSource.count += mealCount;
            existingSource.quantity += totalQuantity;
          } else {
            existing.mealSources.push({
              recipeName,
              quantity: totalQuantity,
              count: mealCount,
            });
          }
        } else {
          products.set(productKey, {
            productId: productKey,
            productName: product.name,
            productType: product.type,
            totalQuantity: totalQuantity,
            unit: node.unit || "",
            mealSources: [
              { recipeName, quantity: totalQuantity, count: mealCount },
            ],
            isPantry: product.pantry,
            trackQuantity: product.track_quantity,
            storeName: product.expand?.store?.name,
            sectionName: product.expand?.section?.name,
          });
        }
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
        const inputNode = data.productNodes.find(
          (n) => n.expand?.product?.id === input.productId
        );
        const inputProduct = inputNode?.expand?.product;

        if (inputProduct?.type === "stored") {
          // For stored products, create edges to all container instances
          const numContainers = inputNode?.quantity || 1;
          const totalInstances = numContainers * mealCount;
          for (let i = 0; i < totalInstances; i++) {
            const inputKey = `${input.productId}-${
              inputNode?.meal_destination || "unnamed"
            }-${plannedMeal.id}-${i}`;
            if (
              !productToStepFlows.find(
                (f) => f.productId === inputKey && f.stepId === stepId
              )
            ) {
              productToStepFlows.push({ productId: inputKey, stepId });
            }
          }
        } else {
          // For raw/transient products, use the aggregated key
          const inputKey = input.productId;
          if (
            !productToStepFlows.find(
              (f) => f.productId === inputKey && f.stepId === stepId
            )
          ) {
            productToStepFlows.push({ productId: inputKey, stepId });
          }
        }
      });

      // Track flows: step → products
      outputs.forEach((output) => {
        const outputNode = data.productNodes.find(
          (n) => n.expand?.product?.id === output.productId
        );
        const outputProduct = outputNode?.expand?.product;

        if (outputProduct?.type === "stored") {
          // For stored products, create edges from step to all container instances
          const numContainers = outputNode?.quantity || 1;
          const totalInstances = numContainers * mealCount;
          for (let i = 0; i < totalInstances; i++) {
            const outputKey = `${output.productId}-${
              outputNode?.meal_destination || "unnamed"
            }-${plannedMeal.id}-${i}`;
            if (
              !stepToProductFlows.find(
                (f) => f.stepId === stepId && f.productId === outputKey
              )
            ) {
              stepToProductFlows.push({ stepId, productId: outputKey });
            }
          }
        } else {
          // For raw/transient products, use the aggregated key
          const outputKey = output.productId;
          if (
            !stepToProductFlows.find(
              (f) => f.stepId === stepId && f.productId === outputKey
            )
          ) {
            stepToProductFlows.push({ stepId, productId: outputKey });
          }
        }
      });
    });
  });

  return {
    products,
    steps,
    productToStepFlows,
    stepToProductFlows,
  };
}

/**
 * Build shopping list from the product flow graph
 * Only includes raw products (ingredients to buy)
 */
export function buildShoppingListFromFlow(
  flowGraph: ProductFlowGraphData
): AggregatedProduct[] {
  const shoppingItems: AggregatedProduct[] = [];

  flowGraph.products.forEach((product) => {
    if (product.productType === "raw") {
      shoppingItems.push({
        productId: product.productId,
        productName: product.productName,
        productType: product.productType,
        isPantry: product.isPantry || false,
        trackQuantity: product.trackQuantity,
        totalQuantity: product.totalQuantity,
        unit: product.unit,
        storeName: product.storeName,
        sectionName: product.sectionName,
        sources: product.mealSources.map((s) => ({
          recipeName: s.recipeName,
          quantity: s.quantity,
          unit: product.unit,
        })),
      });
    }
  });

  return shoppingItems;
}

/**
 * Build batch prep list from the product flow graph
 * Includes all prep and batch assembly steps
 * Excludes steps where outputs have container type "original packaging"
 * Sorted by: 1) step type (prep first, then assembly), 2) input products (alphabetically)
 */
export function buildBatchPrepListFromFlow(
  flowGraph: ProductFlowGraphData,
  recipeData: Map<string, RecipeGraphData>
): AggregatedStep[] {
  const prepSteps: AggregatedStep[] = [];

  // Helper to check if any output has "original packaging" container type
  const hasOriginalPackagingOutput = (step: AggregatedFlowStep): boolean => {
    // For each output product, check if it has "original packaging" container type
    for (const output of step.outputs) {
      // Check in all recipes that use this step
      for (const [, data] of recipeData) {
        const productNode = data.productNodes.find(
          (n) => n.expand?.product?.id === output.productId
        );
        if (productNode) {
          const containerTypeName =
            productNode.expand?.product?.expand?.container_type?.name;
          if (
            containerTypeName?.toLowerCase() === "original packaging" ||
            containerTypeName?.toLowerCase() === "original-packaging"
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  flowGraph.steps.forEach((step) => {
    // Skip steps with "original packaging" outputs
    if (hasOriginalPackagingOutput(step)) {
      return;
    }

    // Use the first step name as the primary name
    const primaryStepName = step.stepNames[0];

    prepSteps.push({
      stepId: step.stepId,
      name:
        step.stepNames.length > 1
          ? `${primaryStepName} (+ ${step.stepNames.length - 1} variants)`
          : primaryStepName,
      stepType: step.stepType,
      timing: step.stepType === "assembly" ? "batch" : undefined,
      recipeName: step.recipeSources
        .map((s) => `${s.count}x ${s.recipeName}`)
        .join(", "),
      inputs: step.inputs.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unit: i.unit,
      })),
      outputs: step.outputs.map((o) => ({
        productName: o.productName,
        quantity: o.quantity,
        unit: o.unit,
      })),
    });
  });

  // Sort the prep steps:
  // 1. First by step type: "prep" comes before "assembly"
  // 2. Then by output product type: non-stored outputs before stored outputs
  // 3. Finally by input products (alphabetically by first input)
  prepSteps.sort((a, b) => {
    // Primary sort: step type (prep before assembly)
    if (a.stepType !== b.stepType) {
      return a.stepType === "prep" ? -1 : 1;
    }

    // Secondary sort: by output product type (non-stored before stored)
    // Check if step outputs contain stored products
    const aHasStoredOutput = flowGraph.steps
      .get(a.stepId)
      ?.outputs.some((output) => {
        const product = flowGraph.products.get(output.productId);
        return product?.productType === "stored";
      });
    const bHasStoredOutput = flowGraph.steps
      .get(b.stepId)
      ?.outputs.some((output) => {
        const product = flowGraph.products.get(output.productId);
        return product?.productType === "stored";
      });

    if (aHasStoredOutput !== bHasStoredOutput) {
      return aHasStoredOutput ? 1 : -1; // Stored outputs come last
    }

    // Tertiary sort: by first input product name (alphabetically)
    const aFirstInput = a.inputs[0]?.productName || "";
    const bFirstInput = b.inputs[0]?.productName || "";
    return aFirstInput.localeCompare(bFirstInput);
  });

  return prepSteps;
}

/**
 * Build stored items list from the product flow graph
 * Only includes stored products (outputs that go to fridge/freezer)
 */
export function buildStoredItemsListFromFlow(
  flowGraph: ProductFlowGraphData
): StoredItem[] {
  const storedItems: StoredItem[] = [];

  flowGraph.products.forEach((product) => {
    if (product.productType === "stored") {
      // Extract meal destination from product name if it's in parentheses
      const mealDestMatch = product.productName.match(/\(([^)]+)\)$/);
      const mealDestination = mealDestMatch ? mealDestMatch[1] : undefined;
      const cleanName = product.productName.replace(/\s*\([^)]+\)$/, "");

      storedItems.push({
        productName: cleanName,
        storageLocation: product.storageLocation || "fridge",
        mealDestination,
        quantity: product.totalQuantity,
        unit: product.unit,
        recipeName: product.mealSources.map((s) => s.recipeName).join(", "),
        containerTypeName: product.unit, // unit is now the container type
      });
    }
  });

  return storedItems;
}

/**
 * Build meal containers list - groups stored items by parent recipe
 * This helps users quickly find which containers belong to which recipes/meals
 */
export function buildMealContainersList(
  flowGraph: ProductFlowGraphData
): MealContainer[] {
  // Track unique product types within each recipe to aggregate properly
  const recipeProductMap = new Map<
    string,
    Map<
      string,
      {
        productName: string;
        containerTypeName?: string;
        storageLocation: "fridge" | "freezer" | "dry";
        quantity: number;
      }
    >
  >();

  flowGraph.products.forEach((product) => {
    if (product.productType === "stored") {
      // Group by recipe name (parent recipe)
      product.mealSources.forEach((source) => {
        const recipeName = source.recipeName;
        const cleanName = product.productName.replace(
          /\s*\([^)]+\)\s*#\d+/,
          ""
        );

        if (!recipeProductMap.has(recipeName)) {
          recipeProductMap.set(recipeName, new Map());
        }

        const productsInRecipe = recipeProductMap.get(recipeName)!;
        const productKey = `${cleanName}-${product.storageLocation}-${product.unit}`;

        if (productsInRecipe.has(productKey)) {
          // Aggregate quantity for same product
          const existing = productsInRecipe.get(productKey)!;
          existing.quantity += product.totalQuantity;
        } else {
          // Add new product
          productsInRecipe.set(productKey, {
            productName: cleanName,
            containerTypeName: product.unit, // unit is the container type
            storageLocation: product.storageLocation || "fridge",
            quantity: product.totalQuantity,
          });
        }
      });
    }
  });

  // Convert map to array format
  const result: MealContainer[] = [];
  recipeProductMap.forEach((productsMap, recipeName) => {
    result.push({
      recipeName,
      containers: Array.from(productsMap.values()),
    });
  });

  return result.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

/**
 * Get ready-to-eat inventory items grouped by meal slot
 */
export function getReadyToEatInventory(
  inventoryItems: InventoryItemExpanded[]
): { meals: Product[]; snacks: Product[] } {
  const meals: Product[] = [];
  const snacks: Product[] = [];

  inventoryItems.forEach((item) => {
    const product = item.expand?.product;
    if (!product || !item.in_stock || !product.ready_to_eat) {
      return;
    }

    if (product.meal_slot === "meal") {
      meals.push(product);
    } else if (product.meal_slot === "snack") {
      snacks.push(product);
    }
  });

  return { meals, snacks };
}

/**
 * Check stock status for inventory products used in recipes
 */
export function checkInventoryStock(
  recipeDataMap: Map<string, RecipeGraphData>,
  inventoryItems: InventoryItemExpanded[]
): {
  recipeId: string;
  recipeName: string;
  productName: string;
  inStock: boolean;
}[] {
  const warnings: {
    recipeId: string;
    recipeName: string;
    productName: string;
    inStock: boolean;
  }[] = [];

  // Create a map of product IDs to stock status
  const stockMap = new Map<string, boolean>();
  inventoryItems.forEach((item) => {
    if (item.expand?.product) {
      stockMap.set(item.product, item.in_stock);
    }
  });

  recipeDataMap.forEach((data) => {
    data.productNodes.forEach((node) => {
      const product = node.expand?.product;
      if (product?.type === "inventory") {
        const inStock = stockMap.get(product.id) ?? false;
        warnings.push({
          recipeId: data.recipe.id,
          recipeName: data.recipe.name,
          productName: product.name,
          inStock,
        });
      }
    });
  });

  return warnings;
}

/**
 * Determine if a recipe is perishable (has raw product inputs)
 */
export function isRecipePerishable(data: RecipeGraphData): boolean {
  return data.productNodes.some((node) => {
    const product = node.expand?.product;
    return product?.type === "raw";
  });
}
