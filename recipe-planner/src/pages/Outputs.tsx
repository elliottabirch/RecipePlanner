import { useState, useEffect, useMemo } from "react";
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
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
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
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { getAll, collections } from "../lib/api";
import "../styles/printStyles.css";
import {
  groupShoppingList,
  buildPullLists,
  buildProductFlowGraph,
  buildShoppingListFromFlow,
  buildBatchPrepListFromFlow,
  buildStoredItemsListFromFlow,
  buildMealContainersList,
  getReadyToEatInventory,
  checkInventoryStock,
  isRecipePerishable,
  type RecipeGraphData,
  type PlannedMealWithRecipe,
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
} from "../lib/types";
import { getAvailableProviders } from "../lib/listProviders";
import { DAYS, MEAL_SLOTS, SLOT_COLORS } from "../constants/mealPlanning";
import {
  FridgeFreezerTab,
  MealContainersTab,
  MicahMealsTab,
  PullListsTab,
  ShoppingListTab,
  BatchPrepTab,
} from "../components/outputs";

export default function Outputs() {
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

  // Checkbox states
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

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

  // Handle print for batch prep list
  const handlePrint = () => {
    window.print();
  };

  // Handle export to list providers
  const handleExport = async () => {
    const providers = getAvailableProviders();

    // For now, use the first available provider (Clipboard)
    if (providers.length === 0) {
      setExportSnackbar({
        open: true,
        message: "No export providers available",
        severity: "error",
      });
      return;
    }

    const provider = providers[0];
    // Use the filtered list that matches exactly what's visible in the UI
    const result = await provider.export(
      shoppingList,
      filteredShoppingListForExport,
      {
        includeQuantities: true,
        includeStores: true,
        includeSections: true,
        includeRecipes: false,
        groupBy: "store",
        format: "checklist",
        title: "Shopping List",
      }
    );

    setExportSnackbar({
      open: true,
      message: result.message || result.error || "Export completed",
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
      } catch (err) {
        setError("Failed to load plans");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  // Load plan data when selection changes
  useEffect(() => {
    if (!selectedPlanId) return;

    const loadPlanData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        // Load tags to find "micah meal" tag and build tags map
        const tags = await getAll<Tag>(collections.tags);
        const tagsMap = new Map(tags.map((t) => [t.id, t]));
        setTagsById(tagsMap);

        const micahTag = tags.find(
          (t) => t.name.toLowerCase() === "micah meal"
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

        console.log("=== Loaded Planned Meals ===");
        console.log(meals);

        // Load inventory items
        const inventory = await getAll<InventoryItemExpanded>(
          collections.inventoryItems,
          { expand: "product" }
        );
        setInventoryItems(inventory);

        // Get unique recipe IDs
        const recipeIds = [...new Set(meals.map((m) => m.recipe))];
        console.log("Recipe IDs:", recipeIds);

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

        // Load full graph data for each recipe
        const recipeDataMap = new Map<string, RecipeGraphData>();

        for (const recipeId of recipeIds) {
          console.log(`\n=== Loading Recipe ${recipeId} ===`);

          // Load product nodes with nested expansions
          const productNodes = await getAll<RecipeProductNode>(
            collections.recipeProductNodes,
            {
              filter: `recipe="${recipeId}"`,
              expand:
                "product, product.container_type, product.store, product.section",
            }
          );

          const steps = await getAll<RecipeStep>(collections.recipeSteps, {
            filter: `recipe="${recipeId}"`,
          });
          console.log("Steps:", steps);

          const ptsEdges = await getAll<ProductToStepEdge>(
            collections.productToStepEdges,
            {
              filter: `recipe="${recipeId}"`,
            }
          );
          console.log("Product→Step edges:", ptsEdges);

          const stpEdges = await getAll<StepToProductEdge>(
            collections.stepToProductEdges,
            {
              filter: `recipe="${recipeId}"`,
            }
          );
          console.log("Step→Product edges:", stpEdges);

          const recipe = meals.find((m) => m.recipe === recipeId)?.expand
            ?.recipe;
          if (recipe) {
            recipeDataMap.set(recipeId, {
              recipe,
              productNodes: productNodes,
              steps,
              productToStepEdges: ptsEdges,
              stepToProductEdges: stpEdges,
            });
          }
        }

        setRecipeData(recipeDataMap);
        console.log("\n=== Final Recipe Data Map ===");
        console.log(recipeDataMap);
      } catch (err) {
        setError("Failed to load plan data");
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };

    loadPlanData();
  }, [selectedPlanId]);

  // Build the product flow graph as the single source of truth
  const productFlowGraph = useMemo(
    () => buildProductFlowGraph(plannedMeals, recipeData),
    [plannedMeals, recipeData]
  );

  // Derive all other aggregations from the flow graph
  const shoppingList = useMemo(
    () => buildShoppingListFromFlow(productFlowGraph),
    [productFlowGraph]
  );
  const groupedShoppingList = useMemo(
    () => groupShoppingList(shoppingList),
    [shoppingList]
  );

  // Create a filtered version of the shopping list for export
  // Uses the same filtering logic as the UI (lines 637-647)
  const filteredShoppingListForExport = useMemo(() => {
    const filteredByStore = new Map<string, Map<string, typeof shoppingList>>();

    groupedShoppingList.byStore.forEach((sections, storeName) => {
      const filteredSections = new Map<string, typeof shoppingList>();

      sections.forEach((items, sectionName) => {
        // Apply same filtering logic as the UI
        const visibleItems = items.filter((item) => {
          if (item.isPantry) {
            const pantryKey = `pantry-${item.productId}`;
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
  const storedItems = useMemo(
    () => buildStoredItemsListFromFlow(productFlowGraph),
    [productFlowGraph]
  );
  const pullLists = useMemo(
    () => buildPullLists(plannedMeals, recipeData),
    [plannedMeals, recipeData]
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
          background:
            product.productType === "raw"
              ? "#e8f5e9"
              : product.productType === "transient"
              ? "#fff3e0"
              : "#e3f2fd",
          border: "2px solid",
          borderColor:
            product.productType === "raw"
              ? "#4caf50"
              : product.productType === "transient"
              ? "#ff9800"
              : "#2196f3",
          borderRadius: "8px",
          padding: 0,
          width: 220,
        },
      });
    });

    // Create step nodes
    productFlowGraph.steps.forEach((step, stepId) => {
      const recipeInfo = step.recipeSources
        .map((s) => `${s.count}x ${s.stepName} (${s.recipeName})`)
        .join(", ");

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
          background: step.stepType === "prep" ? "#f3e5f5" : "#ffebee",
          border: "2px solid",
          borderColor: step.stepType === "prep" ? "#9c27b0" : "#f44336",
          borderRadius: "8px",
          padding: 0,
          width: 220,
        },
      });
    });

    // Create edges: product → step
    productFlowGraph.productToStepFlows.forEach(({ productId, stepId }) => {
      edges.push({
        id: `e-${productId}-${stepId}`,
        source: `product-${productId}`,
        target: `step-${stepId}`,
        animated: true,
        style: { stroke: "#888" },
      });
    });

    // Create edges: step → product
    productFlowGraph.stepToProductFlows.forEach(({ stepId, productId }) => {
      edges.push({
        id: `e-${stepId}-${productId}`,
        source: `step-${stepId}`,
        target: `product-${productId}`,
        animated: true,
        style: { stroke: "#888" },
      });
    });

    // Use dagre to automatically layout the graph
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 150 });

    // Add nodes to dagre
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 220, height: 120 });
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
          x: nodeWithPosition.x - 110, // Center the node (width/2)
          y: nodeWithPosition.y - 60, // Center the node (height/2)
        },
      };
    });

    return { flowNodes: layoutedNodes, flowEdges: edges };
  }, [productFlowGraph]);

  const toggleChecked = (key: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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
              Outputs
            </Typography>
            <Typography color="text.secondary" gutterBottom>
              Generated shopping lists, prep lists, and calendars
            </Typography>
          </Box>

          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Weekly Plan</InputLabel>
            <Select
              value={selectedPlanId}
              label="Weekly Plan"
              onChange={(e) => setSelectedPlanId(e.target.value)}
            >
              {plans.map((plan) => (
                <MenuItem key={plan.id} value={plan.id}>
                  {plan.name || "Unnamed Plan"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Out-of-Stock Warnings */}
        {stockWarnings.some((w) => !w.inStock) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight="bold">
              ⚠️ Out of Stock Items:
            </Typography>
            {stockWarnings
              .filter((w) => !w.inStock)
              .map((w, i) => (
                <Typography key={i} variant="body2">
                  • {w.recipeName}: {w.productName}
                </Typography>
              ))}
          </Alert>
        )}

        {!selectedPlanId ? (
          <Paper sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">
              Select a weekly plan to generate outputs
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
                <Tab icon={<ShoppingIcon />} label="Shopping List" />
                <Tab icon={<PrepIcon />} label="Batch Prep" />
                <Tab icon={<FridgeIcon />} label="Fridge/Freezer" />
                <Tab icon={<Restaurant />} label="Meal Containers" />
                <Tab icon={<Restaurant />} label="Micah's Meals" />
                <Tab icon={<PullIcon />} label="Pull Lists" />
                <Tab icon={<CalendarIcon />} label="Weekly View" />
                <Tab icon={<FlowIcon />} label="Product Flow" />
              </Tabs>
            </Paper>

            {/* Shopping List Tab */}
            {activeTab === 0 && (
              <Paper sx={{ p: 2 }}>
                <ShoppingListTab
                  groupedShoppingList={groupedShoppingList}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                  onExport={handleExport}
                />
              </Paper>
            )}

            {/* Batch Prep Tab */}
            {activeTab === 1 && (
              <Paper sx={{ p: 2 }} id="batch-prep-list">
                <BatchPrepTab
                  batchPrepSteps={batchPrepSteps}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                  onPrint={handlePrint}
                />
              </Paper>
            )}

            {/* Fridge/Freezer Tab */}
            {activeTab === 2 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Fridge/Freezer Contents After Prep
                </Typography>
                <FridgeFreezerTab
                  storedItems={storedItems}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Meal Containers Tab */}
            {activeTab === 3 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Meal Containers
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Quick reference for which containers belong to which meals
                </Typography>
                <MealContainersTab
                  mealContainers={mealContainers}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Micah's Meals Tab */}
            {activeTab === 4 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Micah's Meals
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  All containers for meals tagged as "Micah Meal"
                </Typography>
                <MicahMealsTab
                  micahMealContainers={micahMealContainers}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Pull Lists Tab */}
            {activeTab === 5 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Just-in-Time Pull Lists
                </Typography>
                <PullListsTab
                  pullLists={pullLists}
                  checkedItems={checkedItems}
                  onToggleChecked={toggleChecked}
                />
              </Paper>
            )}

            {/* Weekly View Tab */}
            {activeTab === 6 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Weekly Calendar
                </Typography>

                {/* Week-spanning Section */}
                <Paper sx={{ p: 2, mb: 3, bgcolor: "grey.50" }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                  >
                    WEEK-SPANNING
                  </Typography>

                  {/* MEALS Section */}
                  <Box mb={2}>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      gutterBottom
                      sx={{ textTransform: "uppercase", fontWeight: "bold" }}
                    >
                      MEALS
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {/* Week-spanning planned meals (not snacks, not batch_prep) */}
                      {plannedMeals
                        .filter(
                          (m) =>
                            !m.day &&
                            m.meal_slot !== "snack" &&
                            m.meal_slot !== "micah"
                        )
                        .filter((m) => {
                          const data = recipeData.get(m.recipe);
                          return data?.recipe.recipe_type !== "batch_prep";
                        })
                        .map((meal) => {
                          const data = recipeData.get(meal.recipe);
                          const isPerishable = data
                            ? isRecipePerishable(data)
                            : false;
                          return (
                            <Chip
                              key={meal.id}
                              label={meal.expand?.recipe?.name || "Unknown"}
                              sx={{
                                backgroundColor: SLOT_COLORS[meal.meal_slot],
                                color: "white",
                                opacity: isPerishable ? 1 : 0.5,
                                fontWeight: isPerishable ? "bold" : "normal",
                              }}
                            />
                          );
                        })}
                      {/* Ready-to-eat inventory meals */}
                      {readyToEat.meals.map((product) => (
                        <Chip
                          key={product.id}
                          label={product.name}
                          sx={{
                            backgroundColor: "#e8f5e9",
                            color: "#2e7d32",
                            border: "1px solid #a5d6a7",
                          }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* SNACKS Section */}
                  <Box>
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      gutterBottom
                      sx={{ textTransform: "uppercase", fontWeight: "bold" }}
                    >
                      SNACKS
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={1}>
                      {/* Week-spanning planned snacks (not batch_prep) */}
                      {plannedMeals
                        .filter((m) => !m.day && m.meal_slot === "snack")
                        .filter((m) => {
                          const data = recipeData.get(m.recipe);
                          return data?.recipe.recipe_type !== "batch_prep";
                        })
                        .map((meal) => {
                          const data = recipeData.get(meal.recipe);
                          const isPerishable = data
                            ? isRecipePerishable(data)
                            : false;
                          return (
                            <Chip
                              key={meal.id}
                              label={meal.expand?.recipe?.name || "Unknown"}
                              size="small"
                              sx={{
                                backgroundColor: SLOT_COLORS[meal.meal_slot],
                                color: "white",
                                opacity: isPerishable ? 1 : 0.5,
                                fontWeight: isPerishable ? "bold" : "normal",
                              }}
                            />
                          );
                        })}
                      {/* Ready-to-eat inventory snacks */}
                      {readyToEat.snacks.map((product) => (
                        <Chip
                          key={product.id}
                          label={product.name}
                          size="small"
                          sx={{
                            backgroundColor: "#f3e5f5",
                            color: "#7b1fa2",
                            border: "1px solid #ce93d8",
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                </Paper>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold", width: 100 }}>
                          Slot
                        </TableCell>
                        {DAYS.map((day) => (
                          <TableCell
                            key={day.value}
                            align="center"
                            sx={{ fontWeight: "bold" }}
                          >
                            {day.label.slice(0, 3)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {MEAL_SLOTS.filter((s) => s.value !== "micah").map(
                        (slot) => (
                          <TableRow key={slot.value}>
                            <TableCell>
                              <Chip
                                label={slot.label}
                                size="small"
                                sx={{
                                  backgroundColor: SLOT_COLORS[slot.value],
                                  color: "white",
                                }}
                              />
                            </TableCell>
                            {DAYS.map((day) => {
                              const meals = plannedMeals.filter(
                                (m) =>
                                  m.day === day.value &&
                                  m.meal_slot === slot.value &&
                                  slot.value !== "micah"
                              );

                              // Filter to only include meal recipes (not batch_prep)
                              const mealRecipes = meals.filter((m) => {
                                const data = recipeData.get(m.recipe);
                                return (
                                  data?.recipe.recipe_type !== "batch_prep"
                                );
                              });

                              return (
                                <TableCell
                                  key={day.value}
                                  sx={{
                                    verticalAlign: "top",
                                    backgroundColor:
                                      mealRecipes.length > 0
                                        ? "action.hover"
                                        : "inherit",
                                    minWidth: 100,
                                    p: 0.5,
                                  }}
                                >
                                  {mealRecipes.map((meal) => {
                                    const isMicah = isMicahMeal(meal);
                                    const data = recipeData.get(meal.recipe);
                                    const isPerishable = data
                                      ? isRecipePerishable(data)
                                      : false;

                                    return (
                                      <Box
                                        key={meal.id}
                                        sx={{
                                          fontSize: "0.75rem",
                                          p: 0.5,
                                          mb: 0.5,
                                          backgroundColor:
                                            SLOT_COLORS[slot.value],
                                          color: "white",
                                          borderRadius: 0.5,
                                          border: isMicah
                                            ? "2px solid #9c27b0"
                                            : "none",
                                          boxShadow: isMicah
                                            ? "0 0 8px rgba(156, 39, 176, 0.6)"
                                            : "none",
                                          opacity: isPerishable ? 1 : 0.6,
                                        }}
                                      >
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color: "inherit",
                                            fontWeight:
                                              isMicah || isPerishable
                                                ? "bold"
                                                : "normal",
                                          }}
                                        >
                                          {isMicah && "⭐ "}
                                          {isPerishable && "🥬 "}
                                          {meal.expand?.recipe?.name || "?"}
                                          {meal.quantity &&
                                            meal.quantity > 1 &&
                                            ` (×${meal.quantity})`}
                                        </Typography>
                                      </Box>
                                    );
                                  })}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Micah meals grouped by tag */}
                {plannedMeals.filter((m) => m.meal_slot === "micah").length >
                  0 && (
                  <Box mt={3}>
                    <Typography
                      variant="subtitle1"
                      fontWeight="bold"
                      gutterBottom
                    >
                      Micah Meals (by tag)
                    </Typography>
                    {(() => {
                      // Group Micah meals by tag
                      const micahMeals = plannedMeals.filter(
                        (m) => m.meal_slot === "micah"
                      );
                      const tagGroups = new Map<
                        string,
                        PlannedMealWithRecipe[]
                      >();

                      micahMeals.forEach((meal) => {
                        const tags = recipeTags.get(meal.recipe) || [];
                        if (tags.length === 0) {
                          // Add to "Untagged" group
                          if (!tagGroups.has("untagged")) {
                            tagGroups.set("untagged", []);
                          }
                          tagGroups.get("untagged")!.push(meal);
                        } else {
                          // Add to each tag group
                          tags.forEach((tagId) => {
                            if (!tagGroups.has(tagId)) {
                              tagGroups.set(tagId, []);
                            }
                            tagGroups.get(tagId)!.push(meal);
                          });
                        }
                      });

                      return Array.from(tagGroups.entries()).map(
                        ([tagId, meals]) => {
                          const tagName =
                            tagId === "untagged"
                              ? "Untagged"
                              : tagsById.get(tagId)?.name || "Unknown Tag";
                          const tagColor =
                            tagId === "untagged"
                              ? "#9e9e9e"
                              : tagsById.get(tagId)?.color || "#00bcd4";

                          return (
                            <Box key={tagId} mb={2}>
                              <Typography
                                variant="subtitle2"
                                color="text.secondary"
                                gutterBottom
                              >
                                {tagName}:
                              </Typography>
                              <Box
                                display="flex"
                                flexWrap="wrap"
                                gap={1}
                                ml={2}
                              >
                                {meals.map((meal) => (
                                  <Chip
                                    key={`${tagId}-${meal.id}`}
                                    label={`${
                                      meal.expand?.recipe?.name || "Unknown"
                                    }${
                                      meal.quantity && meal.quantity > 1
                                        ? ` (×${meal.quantity})`
                                        : ""
                                    }`}
                                    sx={{
                                      backgroundColor: tagColor,
                                      color: "white",
                                    }}
                                  />
                                ))}
                              </Box>
                            </Box>
                          );
                        }
                      );
                    })()}
                  </Box>
                )}
              </Paper>
            )}

            {/* Product Flow Tab */}
            {activeTab === 7 && (
              <Paper
                sx={{
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  flexGrow: 1,
                  minHeight: 0,
                }}
              >
                <Typography variant="h6" gutterBottom>
                  Product Flow Graph
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Shows how products flow through processing steps. Products
                  with the same ID are consolidated with aggregated quantities
                  and meal counts. Steps with the same input/output signature
                  are combined.
                </Typography>

                {flowNodes.length === 0 ? (
                  <Box
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    flexGrow={1}
                  >
                    <Typography color="text.secondary">
                      No product flow data. Make sure your recipes have prep or
                      batch assembly steps.
                    </Typography>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      flexGrow: 1,
                      border: "1px solid #e0e0e0",
                      borderRadius: 1,
                      minHeight: 0,
                    }}
                  >
                    <ReactFlow
                      nodes={flowNodes}
                      edges={flowEdges}
                      fitView
                      attributionPosition="bottom-right"
                    >
                      <Controls />
                      <Background
                        variant={BackgroundVariant.Dots}
                        gap={12}
                        size={1}
                      />
                    </ReactFlow>
                  </Box>
                )}

                {/* Legend */}
                <Box mt={2} display="flex" gap={3} flexWrap="wrap">
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "#e8f5e9",
                        border: "2px solid #4caf50",
                        borderRadius: "4px",
                      }}
                    />
                    <Typography variant="caption">Raw Products</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "#fff3e0",
                        border: "2px solid #ff9800",
                        borderRadius: "4px",
                      }}
                    />
                    <Typography variant="caption">
                      Transient Products
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "#e3f2fd",
                        border: "2px solid #2196f3",
                        borderRadius: "4px",
                      }}
                    />
                    <Typography variant="caption">Stored Products</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "#f3e5f5",
                        border: "2px solid #9c27b0",
                        borderRadius: "4px",
                      }}
                    />
                    <Typography variant="caption">Prep Steps</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        backgroundColor: "#ffebee",
                        border: "2px solid #f44336",
                        borderRadius: "4px",
                      }}
                    />
                    <Typography variant="caption">Assembly Steps</Typography>
                  </Box>
                </Box>
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
      </Box>
    </>
  );
}
