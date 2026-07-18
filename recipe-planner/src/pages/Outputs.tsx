import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
} from "@mui/material";
import {
  ShoppingCart as ShoppingIcon,
  Kitchen as PrepIcon,
  KitchenOutlined as FridgeIcon,
  Restaurant,
  Restaurant as PullIcon,
  CalendarMonth as CalendarIcon,
  AccountTree as FlowIcon,
} from "@mui/icons-material";
import { Position, type Node, type Edge } from "@xyflow/react";
import dagre from "dagre";
import { getAll, create, remove, collections } from "../lib/api";
import "../styles/printStyles.css";
import {
  groupShoppingList,
  buildPullLists,
  buildProductFlowGraph,
  buildShoppingListFromFlow,
  buildBatchPrepListFromFlow,
  buildWeekPullList,
  buildStoredItemsListFromFlow,
  buildMealContainersList,
  getReadyToEatInventory,
  checkInventoryStock,
  applyVariantOverrides,
  type AggregatedProduct,
  type RecipeGraphData,
  type PlannedMealWithRecipe,
  type VariantOverride,
} from "../lib/aggregation";
import type {
  WeeklyPlan,
  RecipeProductNode,
  RecipeStep,
  ProductToStepEdge,
  StepToProductEdge,
  RecipeTag,
  Tag,
  InventoryItemExpanded,
  MealVariantOverrideExpanded,
  ProductExpanded,
} from "../lib/types";
import type { Unit } from "../lib/units";
import { getAvailableProviders } from "../lib/listProviders";
import { useShoppingState } from "../hooks/useShoppingState";
import {
  overlayShoppingItem,
  filterForExport,
  type OverlaidShoppingItem,
} from "../lib/shopping-overlay";
import {
  FridgeFreezerTab,
  MealContainersTab,
  MicahMealsTab,
  PullListsTab,
  ShoppingListTab,
  BatchPrepTab,
  WeeklyViewTab,
  ProductFlowTab,
  SyncIndicator,
  ShopSwapDialog,
  type SwapSaveEntry,
} from "../components/outputs";
import {
  OutputTab,
  OUTPUT_TAB_LABELS,
  UI_TEXT,
  ERROR_MESSAGES,
  WellKnownTag,
  findWellKnownTag,
  DEFAULT_EXPORT_OPTIONS,
  getPantryCheckboxKey,
  getShoppingCheckboxKey,
  PRODUCT_NODE_COLORS,
  STEP_NODE_COLORS,
  NODE_STYLE,
  EDGE_STYLE,
  GRAPH_LAYOUT_CONFIG,
} from "../constants/outputs";

export default function Outputs() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Loaded data
  const [plannedMeals, setPlannedMeals] = useState<PlannedMealWithRecipe[]>([]);
  const [recipeData, setRecipeData] = useState<Map<string, RecipeGraphData>>(
    new Map()
  );
  const [recipeTags, setRecipeTags] = useState<Map<string, string[]>>(
    new Map()
  );
  const [tagsById, setTagsById] = useState<Map<string, Tag>>(new Map());
  const [micahMealTagId, setMicahMealTagId] = useState<string>("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItemExpanded[]>(
    []
  );
  // Full product catalog (with source_recipe expanded for make-it gating,
  // D-10) — feeds ShopSwapDialog's replacement Autocomplete and the make-it
  // eligibility check. Loaded once; quick-created products are threaded
  // into the swap dialog's own local state instead (D-08), not refetched
  // here.
  const [products, setProducts] = useState<ProductExpanded[]>([]);
  // Raw override records for the currently loaded plan (kept alongside the
  // derived overridesByMeal map below) so the swap-save handler can scope
  // its delete+recreate to only the node(s) a swap actually touches.
  const [variantOverrides, setVariantOverrides] = useState<
    MealVariantOverrideExpanded[]
  >([]);

  // Refresh counter to trigger data reload after mutations
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Manual shopping items added from out-of-stock resolution
  const [manualShoppingItems, setManualShoppingItems] = useState<
    { productId: string; productName: string; storeName?: string; sectionName?: string }[]
  >([]);

  // Persisted checkbox/have-N/resolution state (D-03) — replaces the former
  // in-memory checkedItems Set + toggleChecked. All six tabs still receive a
  // Set<string>/toggle-fn pair via the adapter below, so their prop surface
  // is unchanged.
  // setResolution is consumed by the make-it confirm handler below and by
  // 02-09's resolution-chip un-resolve action. setHaveQuantity is consumed
  // by 02-09's ShoppingListTab have-N stepper wiring.
  const {
    state: shoppingState,
    setChecked,
    setHaveQuantity,
    setResolution,
    pendingCount,
    failed,
  } = useShoppingState(selectedPlanId);

  // Set<string> view derived from the hook's Map — feeds every tab's
  // checkedItems prop unchanged.
  const checkedItems = useMemo(() => {
    const set = new Set<string>();
    shoppingState.forEach((entry, key) => {
      if (entry.checked) set.add(key);
    });
    return set;
  }, [shoppingState]);

  // Export state
  const [exportSnackbar, setExportSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  // Handle export to list providers
  const handleExport = async () => {
    const providers = getAvailableProviders();

    // For now, use the first available provider (Clipboard)
    if (providers.length === 0) {
      setExportSnackbar({
        open: true,
        message: ERROR_MESSAGES.noExportProviders,
        severity: "error",
      });
      return;
    }

    const provider = providers[0];
    // Use the filtered list that matches exactly what's visible in the UI
    const result = await provider.export(
      shoppingList,
      filteredShoppingListForExport,
      DEFAULT_EXPORT_OPTIONS
    );

    setExportSnackbar({
      open: true,
      message: result.message || result.error || UI_TEXT.exportSuccess,
      severity: result.success ? "success" : "error",
    });
  };

  // Load plans on mount
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const plansData = await getAll<WeeklyPlan>(collections.weeklyPlans);
        setPlans(plansData);
        if (plansData.length > 0) {
          setSelectedPlanId(plansData[0].id);
        }
      } catch {
        setError(ERROR_MESSAGES.failedToLoadPlans);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  // Load the full product catalog once, with source_recipe expanded (D-10
  // make-it gating) — independent of the selected plan.
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const productsData = await getAll<ProductExpanded>(
          collections.products,
          { expand: "source_recipe" }
        );
        setProducts(productsData);
      } catch (err) {
        // Non-fatal: swap/make-it affordances simply degrade (empty picker,
        // make-it never eligible) if this fails; the rest of the page works.
        console.error("Failed to load products for swap/make-it:", err);
      }
    };
    loadProducts();
  }, []);

  // Load plan data when selection changes
  useEffect(() => {
    if (!selectedPlanId) return;

    const loadPlanData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        // Load tags to find well-known tags and build tags map
        const tags = await getAll<Tag>(collections.tags);
        const tagsMap = new Map(tags.map((t) => [t.id, t]));
        setTagsById(tagsMap);

        const micahTag = tags.find((t) =>
          findWellKnownTag(t.name, WellKnownTag.MicahMeal)
        );
        if (micahTag) {
          setMicahMealTagId(micahTag.id);
        }

        // Load planned meals with recipe expansion
        const meals = await getAll<PlannedMealWithRecipe>(
          collections.plannedMeals,
          {
            filter: `weekly_plan="${selectedPlanId}"`,
            expand: "recipe",
          }
        );
        setPlannedMeals(meals);

        // Load inventory items with nested expansion for resolution info
        const inventory = await getAll<InventoryItemExpanded>(
          collections.inventoryItems,
          { expand: "product,product.source_recipe,product.store_bought_product,product.store_bought_product.store,product.store_bought_product.section" }
        );
        setInventoryItems(inventory);

        // Load variant overrides for all meals in this plan
        const mealIds = meals.map((m) => m.id);
        let overrides: MealVariantOverrideExpanded[] = [];
        if (mealIds.length > 0) {
          const filter = mealIds.map((id) => `planned_meal="${id}"`).join(" || ");
          overrides = await getAll<MealVariantOverrideExpanded>(
            collections.mealVariantOverrides,
            {
              filter,
              expand: "original_node.product,replacement_product",
            }
          );
        }
        // Kept alongside the derived map below so the swap-save handler
        // (this plan) can scope its delete+recreate to the touched node(s).
        setVariantOverrides(overrides);

        // Build override map by meal ID
        const overridesByMeal = new Map<string, VariantOverride[]>();
        for (const override of overrides) {
          const mealId = override.planned_meal;
          if (!overridesByMeal.has(mealId)) {
            overridesByMeal.set(mealId, []);
          }
          if (override.expand?.replacement_product) {
            overridesByMeal.get(mealId)!.push({
              originalNodeId: override.original_node,
              replacementProduct: override.expand.replacement_product,
              // D-09 item 10c: forward the substitute quantity/unit off the
              // raw MealVariantOverride record so applyVariantOverrides'
              // inherit-when-null (02-02) can re-derive the swapped line.
              quantity: override.quantity ?? null,
              unit: override.unit ?? null,
            });
          }
        }

        // Get unique recipe IDs
        const recipeIds = [...new Set(meals.map((m) => m.recipe))];

        // Load recipe tags for all recipes
        const allRecipeTags = await getAll<RecipeTag>(collections.recipeTags, {
          expand: "tag",
        });
        const recipeTagsMap = new Map<string, string[]>();
        allRecipeTags.forEach((rt) => {
          if (!recipeTagsMap.has(rt.recipe)) {
            recipeTagsMap.set(rt.recipe, []);
          }
          recipeTagsMap.get(rt.recipe)!.push(rt.tag);
        });
        setRecipeTags(recipeTagsMap);

        // Load base recipe data by recipe ID
        const baseRecipeData = new Map<string, RecipeGraphData>();

        for (const recipeId of recipeIds) {
          const [productNodes, steps, ptsEdges, stpEdges] = await Promise.all([
            getAll<RecipeProductNode>(collections.recipeProductNodes, {
              filter: `recipe="${recipeId}"`,
              expand:
                "product, product.container_type, product.store, product.section",
            }),
            getAll<RecipeStep>(collections.recipeSteps, {
              filter: `recipe="${recipeId}"`,
            }),
            getAll<ProductToStepEdge>(collections.productToStepEdges, {
              filter: `recipe="${recipeId}"`,
            }),
            getAll<StepToProductEdge>(collections.stepToProductEdges, {
              filter: `recipe="${recipeId}"`,
            }),
          ]);

          const recipe = meals.find((m) => m.recipe === recipeId)?.expand?.recipe;
          if (recipe) {
            baseRecipeData.set(recipeId, {
              recipe,
              productNodes,
              steps,
              productToStepEdges: ptsEdges,
              stepToProductEdges: stpEdges,
            });
          }
        }

        // Create meal-keyed data with variants applied
        const mealKeyedRecipeData = new Map<string, RecipeGraphData>();

        for (const meal of meals) {
          const baseData = baseRecipeData.get(meal.recipe);
          if (!baseData) continue;

          const mealOverrides = overridesByMeal.get(meal.id) || [];

          if (mealOverrides.length > 0) {
            // Apply overrides to create variant graph
            const variantData = applyVariantOverrides(baseData, mealOverrides);
            mealKeyedRecipeData.set(meal.id, variantData);
          } else {
            // No overrides - use base data
            mealKeyedRecipeData.set(meal.id, baseData);
          }
        }

        setRecipeData(mealKeyedRecipeData);
      } catch {
        setError(ERROR_MESSAGES.failedToLoadPlanData);
      } finally {
        setLoadingData(false);
      }
    };

    loadPlanData();
  }, [selectedPlanId, refreshCounter]);

  // Selected plan + its people-multiplier (absent => 1, per WEEK-02)
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId]
  );
  // Treat a stored 0/negative/absent multiplier as unset ⇒ 1 (matches the
  // "nullable/absent ⇒ 1" semantic; a stored 0 must not zero every output).
  const rawPeopleMultiplier = selectedPlan?.people_multiplier;
  const peopleMultiplier =
    typeof rawPeopleMultiplier === "number" && rawPeopleMultiplier > 0
      ? rawPeopleMultiplier
      : 1;

  // Build the product flow graph as the single source of truth
  const productFlowGraph = useMemo(
    () => buildProductFlowGraph(plannedMeals, recipeData, peopleMultiplier),
    [plannedMeals, recipeData, peopleMultiplier]
  );

  // Derive all other aggregations from the flow graph
  const shoppingList = useMemo(
    () => buildShoppingListFromFlow(productFlowGraph),
    [productFlowGraph]
  );
  // Overlay each shopping-list line with its persisted have-N/resolution
  // state (D-02/D-04/D-05) — one more link in the useMemo derive chain, no
  // separate propagation path (02-PATTERNS "useMemo-derived pipeline").
  const overlaidShoppingList = useMemo<OverlaidShoppingItem[]>(
    () => shoppingList.map((item) => overlayShoppingItem(item, shoppingState)),
    [shoppingList, shoppingState]
  );

  const groupedShoppingList = useMemo(() => {
    // groupShoppingList's signature is typed for AggregatedProduct[]; the
    // overlaid items are a strict superset (OverlaidShoppingItem extends
    // AggregatedProduct), so this cast reflects the actual runtime shape
    // without lying about it — the visible list carries have-N/resolution
    // fields through to ShoppingListTab (consumed starting in 02-09).
    return groupShoppingList(overlaidShoppingList) as {
      byStore: Map<string, Map<string, OverlaidShoppingItem[]>>;
      pantryItems: OverlaidShoppingItem[];
    };
  }, [overlaidShoppingList]);

  // Create a filtered version of the shopping list for export (D-06): the
  // export excludes every resolved line (make/skip/have-complete) via
  // filterForExport, not just pantry-checked ones as before — the on-screen
  // groupedShoppingList above still shows resolved lines dimmed/struck
  // (D-05); only the export path drops them.
  const filteredShoppingListForExport = useMemo(() => {
    const filteredByStore = new Map<string, Map<string, OverlaidShoppingItem[]>>();

    groupedShoppingList.byStore.forEach((sections, storeName) => {
      const filteredSections = new Map<string, OverlaidShoppingItem[]>();

      sections.forEach((items, sectionName) => {
        const visibleItems = filterForExport(items).filter((item) => {
          if (item.isPantry) {
            const pantryKey = getPantryCheckboxKey(item.productId);
            return !checkedItems.has(pantryKey);
          }
          return true;
        });

        if (visibleItems.length > 0) {
          filteredSections.set(sectionName, visibleItems);
        }
      });

      if (filteredSections.size > 0) {
        filteredByStore.set(storeName, filteredSections);
      }
    });

    return {
      byStore: filteredByStore,
      pantryItems: [], // Don't include the separate pantry check section
    };
  }, [groupedShoppingList, checkedItems]);
  const batchPrepSteps = useMemo(
    () => buildBatchPrepListFromFlow(productFlowGraph, recipeData),
    [productFlowGraph, recipeData]
  );
  const weekPullList = useMemo(
    () => buildWeekPullList(productFlowGraph),
    [productFlowGraph]
  );
  const storedItems = useMemo(
    () => buildStoredItemsListFromFlow(productFlowGraph),
    [productFlowGraph]
  );
  const pullLists = useMemo(
    () => buildPullLists(plannedMeals, recipeData, peopleMultiplier),
    [plannedMeals, recipeData, peopleMultiplier]
  );
  const mealContainers = useMemo(
    () => buildMealContainersList(productFlowGraph),
    [productFlowGraph]
  );

  // Inventory-based computed values
  const readyToEat = useMemo(
    () => getReadyToEatInventory(inventoryItems),
    [inventoryItems]
  );

  const stockWarnings = useMemo(
    () => checkInventoryStock(recipeData, inventoryItems),
    [recipeData, inventoryItems]
  );

  // Filter containers for Micah meals
  const micahMealContainers = useMemo(() => {
    if (!micahMealTagId) return [];
    return mealContainers.filter((meal) => {
      // Find the recipe ID from planned meals
      const plannedMeal = plannedMeals.find(
        (pm) => pm.expand?.recipe?.name === meal.recipeName
      );
      if (!plannedMeal) return false;

      // Check if this recipe has the micah meal tag
      const tags = recipeTags.get(plannedMeal.recipe) || [];
      return tags.includes(micahMealTagId);
    });
  }, [mealContainers, micahMealTagId, recipeTags, plannedMeals]);

  // Check if a planned meal is a Micah meal
  const isMicahMeal = (meal: PlannedMealWithRecipe) => {
    if (!micahMealTagId) return false;
    const tags = recipeTags.get(meal.recipe) || [];
    return tags.includes(micahMealTagId);
  };

  // Build ReactFlow nodes and edges from the flow graph with dagre layout
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Create product nodes
    productFlowGraph.products.forEach((product, productId) => {
      const mealInfo = product.mealSources
        .map((s) => `${s.count}x ${s.recipeName}`)
        .join(", ");

      const colors = PRODUCT_NODE_COLORS[product.productType];

      nodes.push({
        id: `product-${productId}`,
        type: "default",
        position: { x: 0, y: 0 }, // Will be set by dagre
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div style={{ textAlign: "center", padding: "8px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                {product.productName}
              </div>
              <div style={{ fontSize: "0.85em", color: "#666" }}>
                {product.totalQuantity} {product.unit}
              </div>
              <div
                style={{ fontSize: "0.75em", color: "#999", maxWidth: "200px" }}
              >
                {mealInfo}
              </div>
            </div>
          ),
        },
        style: {
          background: colors.background,
          border: `${NODE_STYLE.borderWidth}px solid`,
          borderColor: colors.border,
          borderRadius: `${NODE_STYLE.borderRadius}px`,
          padding: NODE_STYLE.padding,
          width: NODE_STYLE.width,
        },
      });
    });

    // Create step nodes
    productFlowGraph.steps.forEach((step, stepId) => {
      const recipeInfo = step.recipeSources
        .map((s) => `${s.count}x ${s.stepName} (${s.recipeName})`)
        .join(", ");

      const colors = STEP_NODE_COLORS[step.stepType];

      nodes.push({
        id: `step-${stepId}`,
        type: "default",
        position: { x: 0, y: 0 }, // Will be set by dagre
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div style={{ textAlign: "center", padding: "8px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                {step.stepNames.join(" / ")}
              </div>
              <div
                style={{ fontSize: "0.75em", color: "#999", maxWidth: "200px" }}
              >
                {recipeInfo}
              </div>
            </div>
          ),
        },
        style: {
          background: colors.background,
          border: `${NODE_STYLE.borderWidth}px solid`,
          borderColor: colors.border,
          borderRadius: `${NODE_STYLE.borderRadius}px`,
          padding: NODE_STYLE.padding,
          width: NODE_STYLE.width,
        },
      });
    });

    // Create edges: product → step
    productFlowGraph.productToStepFlows.forEach(({ productId, stepId }) => {
      edges.push({
        id: `e-${productId}-${stepId}`,
        source: `product-${productId}`,
        target: `step-${stepId}`,
        animated: EDGE_STYLE.animated,
        style: { stroke: EDGE_STYLE.stroke },
      });
    });

    // Create edges: step → product
    productFlowGraph.stepToProductFlows.forEach(({ stepId, productId }) => {
      edges.push({
        id: `e-${stepId}-${productId}`,
        source: `step-${stepId}`,
        target: `product-${productId}`,
        animated: EDGE_STYLE.animated,
        style: { stroke: EDGE_STYLE.stroke },
      });
    });

    // Use dagre to automatically layout the graph
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph(GRAPH_LAYOUT_CONFIG);

    // Add nodes to dagre
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, {
        width: NODE_STYLE.width,
        height: NODE_STYLE.height,
      });
    });

    // Add edges to dagre
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    // Calculate layout
    dagre.layout(dagreGraph);

    // Apply positions from dagre to nodes
    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - NODE_STYLE.width / 2,
          y: nodeWithPosition.y - NODE_STYLE.height / 2,
        },
      };
    });

    return { flowNodes: layoutedNodes, flowEdges: edges };
  }, [productFlowGraph]);

  // Handler: add a batch prep recipe to the weekly plan
  const handleAddRecipeToPlan = async (recipeId: string) => {
    if (!selectedPlanId) return;
    try {
      await create(collections.plannedMeals, {
        weekly_plan: selectedPlanId,
        recipe: recipeId,
        meal_slot: "snack",
        quantity: 1,
      });
      setRefreshCounter((c) => c + 1);
    } catch {
      setError("Failed to add recipe to plan");
    }
  };

  // Handler: add a store-bought product to the manual shopping list
  const handleAddToShoppingList = (item: {
    productId: string;
    productName: string;
    storeName?: string;
    sectionName?: string;
  }) => {
    setManualShoppingItems((prev) => {
      if (prev.some((existing) => existing.productId === item.productId))
        return prev;
      return [...prev, item];
    });
  };

  const toggleChecked = useCallback(
    (key: string) => {
      const current = shoppingState.get(key)?.checked ?? false;
      setChecked(key, !current);
    },
    [shoppingState, setChecked]
  );

  // Lookup map for the swap dialog + make-it gating (D-10).
  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  // --- Mid-shop swap (SHOP-03/05, D-07/D-08/D-09) ---------------------------

  const [swapProductId, setSwapProductId] = useState<string | null>(null);
  const swapProduct = swapProductId ? productsById.get(swapProductId) ?? null : null;

  const handleOpenSwap = useCallback((item: AggregatedProduct) => {
    setSwapProductId(item.productId);
  }, []);

  const handleCloseSwap = useCallback(() => {
    setSwapProductId(null);
  }, []);

  const handleSwapSave = useCallback(
    async (entries: SwapSaveEntry[]) => {
      await Promise.all(
        entries.map(async (entry) => {
          // Scoped delete+recreate (WeeklyPlans.handleSaveVariants shape,
          // D-09) — only the override(s) for the node(s) THIS swap touches
          // are replaced, not every override for the whole meal, so an
          // unrelated product's planning-time swap in the same meal
          // survives (Rule 1: WeeklyPlans' meal-wide delete would silently
          // destroy those unrelated overrides if copied verbatim here).
          const existingForNodes = variantOverrides.filter(
            (o) =>
              o.planned_meal === entry.plannedMealId &&
              entry.nodeIds.includes(o.original_node)
          );
          await Promise.all(
            existingForNodes.map((o) =>
              remove(collections.mealVariantOverrides, o.id)
            )
          );
          await Promise.all(
            entry.nodeIds.map((nodeId) =>
              create(collections.mealVariantOverrides, {
                planned_meal: entry.plannedMealId,
                original_node: nodeId,
                replacement_product: entry.replacementProductId,
                quantity: entry.quantity,
                unit: entry.unit as Unit | null,
              })
            )
          );
        })
      );
      // Bump refreshCounter — the existing load-and-derive pipeline re-runs
      // and every output (shopping/prep/pull/containers) re-derives with no
      // separate propagation step.
      setRefreshCounter((c) => c + 1);
    },
    [variantOverrides]
  );

  // --- Make-it-at-home (SHOP-04, D-10/D-11) ---------------------------------

  const canMakeIt = useCallback(
    (productId: string) => !!productsById.get(productId)?.source_recipe,
    [productsById]
  );

  const [makeItTarget, setMakeItTarget] = useState<{
    lineId: string;
    productId: string;
    productName: string;
    sourceRecipeId: string;
    sourceRecipeName: string;
  } | null>(null);

  const handleOpenMakeIt = useCallback(
    (item: AggregatedProduct) => {
      const product = productsById.get(item.productId);
      // D-10 guard — should be unreachable since the eligible control is
      // hidden entirely when there's no source_recipe (02-09).
      if (!product?.source_recipe) return;
      setMakeItTarget({
        lineId: item.lineId,
        productId: item.productId,
        productName: product.name,
        sourceRecipeId: product.source_recipe,
        sourceRecipeName: product.expand?.source_recipe?.name ?? "the recipe",
      });
    },
    [productsById]
  );

  const handleCloseMakeIt = useCallback(() => setMakeItTarget(null), []);

  // Confirm-first (D-11) — never wired directly to handleAddRecipeToPlan
  // like OutOfStockSection (02-RESEARCH Pitfall 4).
  const handleConfirmMakeIt = useCallback(async () => {
    if (!makeItTarget) return;
    await handleAddRecipeToPlan(makeItTarget.sourceRecipeId);
    setResolution(getShoppingCheckboxKey(makeItTarget.lineId), "make");
    setMakeItTarget(null);
  }, [makeItTarget, setResolution]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 112px)",
          width: "100%",
          maxWidth: "100%",
        }}
        className="print-container"
      >
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
          flexShrink={0}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              {UI_TEXT.pageTitle}
            </Typography>
            <Typography color="text.secondary" gutterBottom>
              {UI_TEXT.pageDescription}
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <SyncIndicator pendingCount={pendingCount} failed={failed} />
            {selectedPlanId && (
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate(`/cook-mode/${selectedPlanId}`)}
                sx={{ minHeight: 48 }}
              >
                Start Cook Mode
              </Button>
            )}
            {peopleMultiplier !== 1 && (
              <Chip
                size="small"
                label={`×${peopleMultiplier} servings`}
                sx={{ backgroundColor: "secondary.main", color: "white" }}
              />
            )}
            <FormControl sx={{ minWidth: 250 }}>
              <InputLabel>{UI_TEXT.weeklyPlanLabel}</InputLabel>
              <Select
                value={selectedPlanId}
                label={UI_TEXT.weeklyPlanLabel}
                onChange={(e) => setSelectedPlanId(e.target.value)}
              >
                {plans.map((plan) => (
                  <MenuItem key={plan.id} value={plan.id}>
                    {plan.name || UI_TEXT.unnamedPlan}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Out-of-Stock Warning Banner */}
        {stockWarnings.some((w) => !w.inStock) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              {UI_TEXT.outOfStockWarning}
            </Typography>
          </Alert>
        )}

        {!selectedPlanId ? (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              {UI_TEXT.selectPlanPrompt}
            </Typography>
          </Paper>
        ) : loadingData ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Paper sx={{ mb: 2 }}>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
                <Tab
                  icon={<ShoppingIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.ShoppingList]}
                />
                <Tab
                  icon={<PrepIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.BatchPrep]}
                />
                <Tab
                  icon={<FridgeIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.FridgeFreezer]}
                />
                <Tab
                  icon={<Restaurant />}
                  label={OUTPUT_TAB_LABELS[OutputTab.MealContainers]}
                />
                <Tab
                  icon={<Restaurant />}
                  label={OUTPUT_TAB_LABELS[OutputTab.MicahMeals]}
                />
                <Tab
                  icon={<PullIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.PullLists]}
                />
                <Tab
                  icon={<CalendarIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.WeeklyView]}
                />
                <Tab
                  icon={<FlowIcon />}
                  label={OUTPUT_TAB_LABELS[OutputTab.ProductFlow]}
                />
              </Tabs>
            </Paper>

            {/* Shopping List Tab */}
            {activeTab === OutputTab.ShoppingList && (
              <Paper sx={{ p: 2 }}>
                <ShoppingListTab
                  groupedShoppingList={groupedShoppingList}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                  onExport={handleExport}
                  stockWarnings={stockWarnings}
                  plannedMeals={plannedMeals}
                  recipeData={recipeData}
                  onAddRecipeToPlan={handleAddRecipeToPlan}
                  onAddToShoppingList={handleAddToShoppingList}
                  manualShoppingItems={manualShoppingItems}
                  onSwap={handleOpenSwap}
                  onMakeIt={handleOpenMakeIt}
                  canMakeIt={canMakeIt}
                  onSetHaveQuantity={setHaveQuantity}
                  onSetResolution={setResolution}
                />
              </Paper>
            )}

            {/* Batch Prep Tab */}
            {activeTab === OutputTab.BatchPrep && (
              <Paper sx={{ p: 2 }} id="batch-prep-list">
                <BatchPrepTab
                  batchPrepSteps={batchPrepSteps}
                  weekPullList={weekPullList}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Fridge/Freezer Tab */}
            {activeTab === OutputTab.FridgeFreezer && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {UI_TEXT.fridgeFreezerTitle}
                </Typography>
                <FridgeFreezerTab
                  storedItems={storedItems}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Meal Containers Tab */}
            {activeTab === OutputTab.MealContainers && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {UI_TEXT.mealContainersTitle}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {UI_TEXT.mealContainersDescription}
                </Typography>
                <MealContainersTab
                  mealContainers={mealContainers}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Micah's Meals Tab */}
            {activeTab === OutputTab.MicahMeals && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {UI_TEXT.micahMealsTitle}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {UI_TEXT.micahMealsDescription}
                </Typography>
                <MicahMealsTab
                  micahMealContainers={micahMealContainers}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Pull Lists Tab */}
            {activeTab === OutputTab.PullLists && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {UI_TEXT.pullListsTitle}
                </Typography>
                <PullListsTab
                  pullLists={pullLists}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Weekly View Tab */}
            {activeTab === OutputTab.WeeklyView && (
              <Paper sx={{ p: 2 }}>
                <WeeklyViewTab
                  plannedMeals={plannedMeals}
                  recipeData={recipeData}
                  recipeTags={recipeTags}
                  tagsById={tagsById}
                  isMicahMeal={isMicahMeal}
                  readyToEat={readyToEat}
                  micahMealContainers={micahMealContainers}
                  pullLists={pullLists}
                />
              </Paper>
            )}

            {/* Product Flow Tab */}
            {activeTab === OutputTab.ProductFlow && (
              <Paper
                sx={{
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  flexGrow: 1,
                  minHeight: 0,
                }}
              >
                <ProductFlowTab flowNodes={flowNodes} flowEdges={flowEdges} />
              </Paper>
            )}
          </>
        )}

        {/* Export Feedback Snackbar */}
        <Snackbar
          open={exportSnackbar.open}
          autoHideDuration={4000}
          onClose={() => setExportSnackbar({ ...exportSnackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() =>
              setExportSnackbar({ ...exportSnackbar, open: false })
            }
            severity={exportSnackbar.severity}
            sx={{ width: "100%" }}
          >
            {exportSnackbar.message}
          </Alert>
        </Snackbar>

        {/* Mid-shop swap dialog (SHOP-03/05, D-07/D-08/D-09) */}
        <ShopSwapDialog
          open={swapProductId !== null}
          onClose={handleCloseSwap}
          product={swapProduct}
          plannedMeals={plannedMeals}
          recipeData={recipeData}
          products={products}
          onSave={handleSwapSave}
        />

        {/* Make-it confirm-first dialog (SHOP-04, D-11) */}
        <Dialog
          open={makeItTarget !== null}
          onClose={handleCloseMakeIt}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ fontSize: 20, fontWeight: 600 }}>
            Make it instead of buying?
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1">
              Add {makeItTarget?.sourceRecipeName} to this week and make it
              instead of buying {makeItTarget?.productName}?
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseMakeIt}>Cancel</Button>
            <Button
              onClick={handleConfirmMakeIt}
              variant="contained"
              sx={{ minHeight: 48 }}
            >
              Add to This Week
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  );
}
