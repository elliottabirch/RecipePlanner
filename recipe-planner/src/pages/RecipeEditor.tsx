import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Autocomplete,
  Divider,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  Save as SaveIcon,
  Egg as ProductIcon,
  PlayArrow as StepIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import {
  getAll,
  getOne,
  create,
  update,
  remove,
  collections,
} from "../lib/api";
import {
  StepType,
  Timing,
  type Recipe,
  type Product,
  type ProductExpanded,
  type RecipeProductNode,
  type RecipeStep,
  type RecipeTag,
  type ProductToStepEdge,
  type StepToProductEdge,
  type Tag,
  type Store,
  type Section,
  type ContainerType,
} from "../lib/types";
import ProductNode, {
  type ProductNodeData,
  type ProductNodeType,
} from "../components/nodes/ProductNode";
import StepNode, {
  type StepNodeData,
  type StepNodeType,
} from "../components/nodes/StepNode";
import ProductForm, { useProductForm } from "../components/ProductForm";

const nodeTypes = {
  product: ProductNode,
  step: StepNode,
};

type FlowNode = ProductNodeType | StepNodeType;
type FlowEdge = Edge;

export default function RecipeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [recipeType, setRecipeType] = useState<"meal" | "batch_prep">("meal");

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  // Lookup data
  const [products, setProducts] = useState<ProductExpanded[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);

  // Add product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState<number | "">("");
  const [productUnit, setProductUnit] = useState("");
  const [productMealDestination, setProductMealDestination] = useState("");

  // Inline product creation
  const [creatingProduct, setCreatingProduct] = useState(false);
  const productForm = useProductForm();
  const [creatingProductLoading, setCreatingProductLoading] = useState(false);

  // Edit product dialog
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // Add step dialog
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepName, setStepName] = useState("");
  const [stepType, setStepType] = useState<StepType>(StepType.Prep);
  const [stepTiming, setStepTiming] = useState<Timing>(Timing.Batch);

  // Edit step dialog
  const [editStepDialogOpen, setEditStepDialogOpen] = useState(false);

  // Track database IDs for nodes/edges
  const [nodeDbIds, setNodeDbIds] = useState<Record<string, string>>({});

  // Selected node for deletion
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  const loadLookupData = async () => {
    try {
      const [
        productsData,
        tagsData,
        storesData,
        sectionsData,
        containerTypesData,
      ] = await Promise.all([
        getAll<Product>(collections.products, {
          sort: "name",
          expand: "container_type",
        }),
        getAll<Tag>(collections.tags, { sort: "name" }),
        getAll<Store>(collections.stores, { sort: "name" }),
        getAll<Section>(collections.sections, { sort: "name" }),
        getAll<ContainerType>(collections.containerTypes, { sort: "name" }),
      ]);
      setProducts(productsData);
      setAllTags(tagsData);
      setStores(storesData);
      setSections(sectionsData);
      setContainerTypes(containerTypesData);
    } catch (err) {
      console.error("Failed to load lookup data:", err);
    }
  };

  // Auto-layout function using dagre
  const applyAutoLayout = useCallback(
    (nodes: FlowNode[], edges: FlowEdge[]) => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 150 });

      // Add nodes to dagre
      nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 180, height: 100 });
      });

      // Add edges to dagre
      edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      // Calculate layout
      dagre.layout(dagreGraph);

      // Apply positions from dagre to nodes
      return nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
          ...node,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          position: {
            x: nodeWithPosition.x - 90,
            y: nodeWithPosition.y - 50,
          },
        };
      });
    },
    []
  );

  const loadRecipe = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const [
        recipeData,
        productNodes,
        steps,
        productToStepEdges,
        stepToProductEdges,
        recipeTags,
      ] = await Promise.all([
        getOne<Recipe>(collections.recipes, id),
        getAll<RecipeProductNode>(collections.recipeProductNodes, {
          filter: `recipe="${id}"`,
          expand: "product",
        }),
        getAll<RecipeStep>(collections.recipeSteps, {
          filter: `recipe="${id}"`,
        }),
        getAll<ProductToStepEdge>(collections.productToStepEdges, {
          filter: `recipe="${id}"`,
        }),
        getAll<StepToProductEdge>(collections.stepToProductEdges, {
          filter: `recipe="${id}"`,
        }),
        getAll<RecipeTag & { expand?: { tag?: Tag } }>(collections.recipeTags, {
          filter: `recipe="${id}"`,
          expand: "tag",
        }),
      ]);

      setRecipe(recipeData);
      setName(recipeData.name);
      setNotes(recipeData.notes || "");
      setRecipeType(recipeData.recipe_type || "meal");

      // Set selected tags
      const tags = recipeTags
        .filter((rt) => rt.expand?.tag)
        .map((rt) => rt.expand!.tag!);
      setSelectedTags(tags);

      // Convert to React Flow nodes
      const flowNodes: FlowNode[] = [];
      const dbIds: Record<string, string> = {};

      productNodes.forEach((pn) => {
        const nodeId = `product-${pn.id}`;
        dbIds[nodeId] = pn.id;
        const productData = (
          pn as RecipeProductNode & { expand?: { product?: Product } }
        ).expand?.product;
        flowNodes.push({
          id: nodeId,
          type: "product",
          position: { x: 0, y: 0 }, // Will be set by dagre
          data: {
            label: productData?.name || "Unknown Product",
            productId: pn.product,
            productType: productData?.type || "raw",
            quantity: pn.quantity,
            unit: pn.unit,
            mealDestination: pn.meal_destination,
          },
        } as ProductNodeType);
      });

      steps.forEach((step) => {
        const nodeId = `step-${step.id}`;
        dbIds[nodeId] = step.id;
        flowNodes.push({
          id: nodeId,
          type: "step",
          position: { x: 0, y: 0 }, // Will be set by dagre
          data: {
            label: step.name,
            stepType: step.step_type,
            timing: step.timing,
          },
        } as StepNodeType);
      });

      setNodeDbIds(dbIds);

      // Convert to React Flow edges
      const flowEdges: FlowEdge[] = [];

      productToStepEdges.forEach((e) => {
        const edgeId = `e-product-${e.source}-step-${e.target}`;
        flowEdges.push({
          id: edgeId,
          source: `product-${e.source}`,
          target: `step-${e.target}`,
        });
      });

      stepToProductEdges.forEach((e) => {
        const edgeId = `e-step-${e.source}-product-${e.target}`;
        flowEdges.push({
          id: edgeId,
          source: `step-${e.source}`,
          target: `product-${e.target}`,
        });
      });

      // Apply auto-layout
      const layoutedNodes = applyAutoLayout(flowNodes, flowEdges);
      setNodes(layoutedNodes);
      setEdges(flowEdges);
    } catch (err) {
      setError("Failed to load recipe");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookupData();
    if (!isNew) {
      loadRecipe();
    }
  }, [id]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as FlowNode);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleEditNode = () => {
    if (!selectedNode) return;

    if (selectedNode.type === "product") {
      const data = selectedNode.data as ProductNodeData;
      const product = products.find((p) => p.id === data.productId);

      if (product) {
        setSelectedProduct(product);
        setProductQuantity(data.quantity || "");
        setProductUnit(data.unit || "");
        setProductMealDestination(data.mealDestination || "");
        setEditingNodeId(selectedNode.id);
        setEditProductDialogOpen(true);
      }
    } else if (selectedNode.type === "step") {
      const data = selectedNode.data as StepNodeData;
      setStepName(data.label);
      setStepType(data.stepType);
      setStepTiming(data.timing || Timing.Batch);
      setEditingNodeId(selectedNode.id);
      setEditStepDialogOpen(true);
    }
  };

  const handleSaveEditedProduct = () => {
    if (!selectedProduct || !editingNodeId) return;

    // For stored products, find the container type name from the expanded product
    const productWithExpand = products.find((p) => p.id === selectedProduct.id);
    const containerTypeName = productWithExpand?.expand?.container_type?.name;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === editingNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              label: selectedProduct.name,
              productId: selectedProduct.id,
              productType: selectedProduct.type,
              quantity: productQuantity || undefined,
              unit:
                selectedProduct.type === "stored"
                  ? containerTypeName
                  : productUnit || undefined,
              mealDestination: productMealDestination || undefined,
            },
          } as FlowNode;
        }
        return node;
      })
    );

    setEditProductDialogOpen(false);
    setEditingNodeId(null);
    setSelectedProduct(null);
    setProductQuantity("");
    setProductUnit("");
    setProductMealDestination("");
    setSelectedNode(null);
  };

  const handleSaveEditedStep = () => {
    if (!stepName.trim() || !editingNodeId) return;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === editingNodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              label: stepName.trim(),
              stepType: stepType,
              timing: stepType === "assembly" ? stepTiming : undefined,
            },
          } as FlowNode;
        }
        return node;
      })
    );

    setEditStepDialogOpen(false);
    setEditingNodeId(null);
    setStepName("");
    setStepType(StepType.Prep);
    setStepTiming(Timing.Batch);
    setSelectedNode(null);
  };

  const handleCreateProduct = async () => {
    if (!productForm.isValid()) return;

    try {
      setCreatingProductLoading(true);
      const data = productForm.getProductData();
      const newProduct = await create<Product>(collections.products, data);

      // Refresh products and select the new one
      await loadLookupData();
      setSelectedProduct(newProduct);
      setCreatingProduct(false);
      productForm.resetForm();
    } catch (err) {
      console.error("Failed to create product:", err);
      setError("Failed to create product");
    } finally {
      setCreatingProductLoading(false);
    }
  };

  const handleAddProduct = () => {
    if (!selectedProduct) return;

    const nodeId = `product-temp-${Date.now()}`;

    // For stored products, find the container type name from the expanded product
    const productWithExpand = products.find((p) => p.id === selectedProduct.id);
    const containerTypeName = productWithExpand?.expand?.container_type?.name;

    const newNode: ProductNodeType = {
      id: nodeId,
      type: "product",
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        label: selectedProduct.name,
        productId: selectedProduct.id,
        productType: selectedProduct.type,
        quantity: productQuantity || undefined,
        unit:
          selectedProduct.type === "stored"
            ? containerTypeName
            : productUnit || undefined,
        mealDestination: productMealDestination || undefined,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setProductDialogOpen(false);
    setSelectedProduct(null);
    setProductQuantity("");
    setProductUnit("");
    setProductMealDestination("");
    setCreatingProduct(false);
    productForm.resetForm();
  };

  const handleAddStep = () => {
    if (!stepName.trim()) return;

    const nodeId = `step-temp-${Date.now()}`;
    const newNode: StepNodeType = {
      id: nodeId,
      type: "step",
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        label: stepName.trim(),
        stepType: stepType,
        timing: stepType === "assembly" ? stepTiming : undefined,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setStepDialogOpen(false);
    setStepName("");
    setStepType(StepType.Prep);
    setStepTiming(Timing.Batch);
  };

  const handleDeleteNode = async () => {
    if (!selectedNode) return;

    const dbId = nodeDbIds[selectedNode.id];
    if (dbId) {
      try {
        if (selectedNode.type === "product") {
          await remove(collections.recipeProductNodes, dbId);
        } else {
          await remove(collections.recipeSteps, dbId);
        }
      } catch (err) {
        console.error("Failed to delete node:", err);
      }
    }

    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
      )
    );
    setSelectedNode(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      setSaving(true);
      setError(null);

      let recipeId = id;

      // Create or update recipe
      if (isNew) {
        const newRecipe = await create<Recipe>(collections.recipes, {
          name: name.trim(),
          notes: notes.trim() || undefined,
          recipe_type: recipeType,
        });
        recipeId = newRecipe.id;
      } else {
        await update(collections.recipes, id!, {
          name: name.trim(),
          notes: notes.trim() || undefined,
          recipe_type: recipeType,
        });
      }

      // Handle tags
      // First, delete existing recipe tags
      if (!isNew) {
        const existingTags = await getAll<RecipeTag>(collections.recipeTags, {
          filter: `recipe="${recipeId}"`,
        });
        await Promise.all(
          existingTags.map((rt) => remove(collections.recipeTags, rt.id))
        );
      }

      // Create new recipe tags
      await Promise.all(
        selectedTags.map((tag) =>
          create(collections.recipeTags, {
            recipe: recipeId,
            tag: tag.id,
          })
        )
      );

      // Save nodes
      const newNodeDbIds: Record<string, string> = { ...nodeDbIds };

      for (const node of nodes) {
        const existingDbId = nodeDbIds[node.id];

        if (node.type === "product") {
          const data = node.data as ProductNodeData;
          const nodeData = {
            recipe: recipeId,
            product: data.productId,
            quantity: data.quantity,
            unit: data.unit,
            meal_destination: data.mealDestination,
            position_x: node.position.x,
            position_y: node.position.y,
          };

          if (existingDbId) {
            await update(
              collections.recipeProductNodes,
              existingDbId,
              nodeData
            );
          } else {
            const created = await create<RecipeProductNode>(
              collections.recipeProductNodes,
              nodeData
            );
            newNodeDbIds[node.id] = created.id;
          }
        } else if (node.type === "step") {
          const data = node.data as StepNodeData;
          const nodeData = {
            recipe: recipeId,
            name: data.label,
            step_type: data.stepType,
            timing: data.timing,
            position_x: node.position.x,
            position_y: node.position.y,
          };

          if (existingDbId) {
            await update(collections.recipeSteps, existingDbId, nodeData);
          } else {
            const created = await create<RecipeStep>(
              collections.recipeSteps,
              nodeData
            );
            newNodeDbIds[node.id] = created.id;
          }
        }
      }

      setNodeDbIds(newNodeDbIds);

      // Delete old edges and create new ones
      if (!isNew) {
        const [oldPtsEdges, oldStpEdges] = await Promise.all([
          getAll<ProductToStepEdge>(collections.productToStepEdges, {
            filter: `recipe="${recipeId}"`,
          }),
          getAll<StepToProductEdge>(collections.stepToProductEdges, {
            filter: `recipe="${recipeId}"`,
          }),
        ]);

        await Promise.all([
          ...oldPtsEdges.map((e) =>
            remove(collections.productToStepEdges, e.id)
          ),
          ...oldStpEdges.map((e) =>
            remove(collections.stepToProductEdges, e.id)
          ),
        ]);
      }

      // Create edges
      for (const edge of edges) {
        const sourceType = edge.source.startsWith("product")
          ? "product"
          : "step";
        const targetType = edge.target.startsWith("product")
          ? "product"
          : "step";

        const sourceDbId = newNodeDbIds[edge.source];
        const targetDbId = newNodeDbIds[edge.target];

        if (!sourceDbId || !targetDbId) continue;

        if (sourceType === "product" && targetType === "step") {
          await create(collections.productToStepEdges, {
            recipe: recipeId,
            source: sourceDbId,
            target: targetDbId,
          });
        } else if (sourceType === "step" && targetType === "product") {
          await create(collections.stepToProductEdges, {
            recipe: recipeId,
            source: sourceDbId,
            target: targetDbId,
          });
        }
      }

      if (isNew) {
        navigate(`/recipes/${recipeId}`, { replace: true });
      }
    } catch (err) {
      setError("Failed to save recipe");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "calc(100vh - 112px)",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "100%",
      }}
    >
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate("/recipes")}>
            <BackIcon />
          </IconButton>

          <TextField
            label="Recipe Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            sx={{ width: 300 }}
          />

          <Autocomplete
            multiple
            options={allTags}
            value={selectedTags}
            onChange={(_, newValue) => setSelectedTags(newValue)}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => (
              <TextField {...params} label="Tags" size="small" />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option.id}
                  label={option.name}
                  size="small"
                  sx={{ backgroundColor: option.color, color: "white" }}
                />
              ))
            }
            sx={{ width: 300 }}
          />

          <FormControl size="small" sx={{ width: 180 }}>
            <InputLabel>Recipe Type</InputLabel>
            <Select
              value={recipeType}
              label="Recipe Type"
              onChange={(e) =>
                setRecipeType(e.target.value as "meal" | "batch_prep")
              }
            >
              <MenuItem value="meal">Meal Recipe</MenuItem>
              <MenuItem value="batch_prep">Batch Prep</MenuItem>
            </Select>
          </FormControl>

          <Box flexGrow={1} />

          <Button
            variant="outlined"
            startIcon={<ProductIcon />}
            onClick={() => setProductDialogOpen(true)}
          >
            Add Product
          </Button>

          <Button
            variant="outlined"
            startIcon={<StepIcon />}
            onClick={() => setStepDialogOpen(true)}
          >
            Add Step
          </Button>

          {selectedNode && (
            <>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleEditNode}
              >
                Edit Node
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteNode}
              >
                Delete Node
              </Button>
            </>
          )}

          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Notes field */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
          fullWidth
          size="small"
        />
      </Paper>

      {/* Graph */}
      <Paper sx={{ flexGrow: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeDoubleClick={(_, current_edge) => {
            setEdges(edges.filter((edge) => edge.id !== current_edge.id));
          }}
          nodeTypes={nodeTypes}
          fitView
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </Paper>

      {/* Add Product Dialog */}
      <Dialog
        open={productDialogOpen}
        onClose={() => {
          setProductDialogOpen(false);
          setCreatingProduct(false);
          productForm.resetForm();
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Product Node</DialogTitle>
        <DialogContent>
          {!creatingProduct ? (
            <>
              <Box display="flex" gap={1} mb={2} mt={1}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => setCreatingProduct(true)}
                  sx={{ textTransform: "none" }}
                >
                  + Create New Product
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }}>or select existing</Divider>
              <Autocomplete
                options={products}
                value={selectedProduct}
                onChange={(_, newValue) => setSelectedProduct(newValue)}
                getOptionLabel={(option) => option.name}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Product"
                    margin="dense"
                    fullWidth
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={option.type}
                        size="small"
                        sx={{
                          backgroundColor:
                            option.type === "raw"
                              ? "#4caf50"
                              : option.type === "transient"
                              ? "#ff9800"
                              : "#2196f3",
                          color: "white",
                          fontSize: "0.7rem",
                        }}
                      />
                      {option.name}
                    </Box>
                  </li>
                )}
              />

              {selectedProduct && (
                <>
                  <Box display="flex" gap={2} mt={2}>
                    <TextField
                      label={
                        selectedProduct.type === "stored"
                          ? "Number of Containers"
                          : "Quantity"
                      }
                      type="number"
                      value={productQuantity}
                      onChange={(e) =>
                        setProductQuantity(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      size="small"
                      sx={{
                        width: selectedProduct.type === "stored" ? 200 : 120,
                      }}
                      helperText={
                        selectedProduct.type === "stored"
                          ? "How many containers to create"
                          : undefined
                      }
                    />
                    {selectedProduct.type !== "stored" && (
                      <TextField
                        label="Unit"
                        value={productUnit}
                        onChange={(e) => setProductUnit(e.target.value)}
                        size="small"
                        sx={{ width: 120 }}
                        placeholder="cups, lbs, etc."
                      />
                    )}
                  </Box>

                  {selectedProduct.type === "stored" && (
                    <TextField
                      label="Meal Destination"
                      value={productMealDestination}
                      onChange={(e) =>
                        setProductMealDestination(e.target.value)
                      }
                      fullWidth
                      margin="dense"
                      size="small"
                      placeholder="e.g., stir fry, salad"
                      helperText="Which meal this container goes to"
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <Box>
              <Typography
                variant="subtitle2"
                gutterBottom
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mt: 1,
                  mb: 2,
                }}
              >
                📦 Create New Product
              </Typography>

              <ProductForm
                stores={stores}
                sections={sections}
                containerTypes={containerTypes}
                form={productForm}
              />

              <Button
                onClick={handleCreateProduct}
                variant="contained"
                fullWidth
                disabled={!productForm.isValid() || creatingProductLoading}
                sx={{ mb: 2, mt: 2 }}
              >
                {creatingProductLoading ? "Creating..." : "Create Product"}
              </Button>

              <Button
                onClick={() => {
                  setCreatingProduct(false);
                  productForm.resetForm();
                }}
                fullWidth
                disabled={creatingProductLoading}
              >
                ← Back to Select Product
              </Button>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setProductDialogOpen(false);
              setCreatingProduct(false);
              productForm.resetForm();
            }}
          >
            Cancel
          </Button>
          {!creatingProduct && (
            <Button
              onClick={handleAddProduct}
              variant="contained"
              disabled={!selectedProduct}
            >
              Add to Recipe
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Add Step Dialog */}
      <Dialog
        open={stepDialogOpen}
        onClose={() => setStepDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Step Node</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Step Name"
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
            fullWidth
            margin="dense"
            placeholder="e.g., Dice onions, Sauté vegetables"
          />

          <FormControl fullWidth margin="dense">
            <InputLabel>Step Type</InputLabel>
            <Select
              value={stepType}
              label="Step Type"
              onChange={(e) => setStepType(e.target.value as StepType)}
            >
              <MenuItem value={StepType.Prep}>Prep (raw ingredients only)</MenuItem>
              <MenuItem value={StepType.Assembly}>Assembly</MenuItem>
            </Select>
          </FormControl>

          {stepType === "assembly" && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Timing</InputLabel>
              <Select
                value={stepTiming}
                label="Timing"
                onChange={(e) => setStepTiming(e.target.value as Timing)}
              >
                <MenuItem value="batch">Batch (prep day)</MenuItem>
                <MenuItem value="just_in_time">
                  Just-in-time (serve time)
                </MenuItem>
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddStep}
            variant="contained"
            disabled={!stepName.trim()}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog
        open={editProductDialogOpen}
        onClose={() => {
          setEditProductDialogOpen(false);
          setEditingNodeId(null);
          setSelectedProduct(null);
          setProductQuantity("");
          setProductUnit("");
          setProductMealDestination("");
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Product Node</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={products}
            value={selectedProduct}
            onChange={(_, newValue) => setSelectedProduct(newValue)}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => (
              <TextField {...params} label="Product" margin="dense" fullWidth />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip
                    label={option.type}
                    size="small"
                    sx={{
                      backgroundColor:
                        option.type === "raw"
                          ? "#4caf50"
                          : option.type === "transient"
                          ? "#ff9800"
                          : "#2196f3",
                      color: "white",
                      fontSize: "0.7rem",
                    }}
                  />
                  {option.name}
                </Box>
              </li>
            )}
          />

          <Box display="flex" gap={2} mt={2}>
            <TextField
              label={
                selectedProduct?.type === "stored"
                  ? "Number of Containers"
                  : "Quantity"
              }
              type="number"
              value={productQuantity}
              onChange={(e) =>
                setProductQuantity(e.target.value ? Number(e.target.value) : "")
              }
              size="small"
              sx={{ width: selectedProduct?.type === "stored" ? 200 : 120 }}
              helperText={
                selectedProduct?.type === "stored"
                  ? "How many containers to create"
                  : undefined
              }
            />
            {selectedProduct?.type !== "stored" && (
              <TextField
                label="Unit"
                value={productUnit}
                onChange={(e) => setProductUnit(e.target.value)}
                size="small"
                sx={{ width: 120 }}
                placeholder="cups, lbs, etc."
              />
            )}
          </Box>

          {selectedProduct?.type === "stored" && (
            <TextField
              label="Meal Destination"
              value={productMealDestination}
              onChange={(e) => setProductMealDestination(e.target.value)}
              fullWidth
              margin="dense"
              size="small"
              placeholder="e.g., stir fry, salad"
              helperText="Which meal this container goes to"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditProductDialogOpen(false);
              setEditingNodeId(null);
              setSelectedProduct(null);
              setProductQuantity("");
              setProductUnit("");
              setProductMealDestination("");
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEditedProduct}
            variant="contained"
            disabled={!selectedProduct}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Step Dialog */}
      <Dialog
        open={editStepDialogOpen}
        onClose={() => {
          setEditStepDialogOpen(false);
          setEditingNodeId(null);
          setStepName("");
          setStepType(StepType.Prep);
          setStepTiming(Timing.Batch);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Step Node</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Step Name"
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
            fullWidth
            margin="dense"
            placeholder="e.g., Dice onions, Sauté vegetables"
          />

          <FormControl fullWidth margin="dense">
            <InputLabel>Step Type</InputLabel>
            <Select
              value={stepType}
              label="Step Type"
              onChange={(e) => setStepType(e.target.value as StepType)}
            >
              <MenuItem value={StepType.Prep}>Prep (raw ingredients only)</MenuItem>
              <MenuItem value={StepType.Assembly}>Assembly</MenuItem>
            </Select>
          </FormControl>

          {stepType === "assembly" && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Timing</InputLabel>
              <Select
                value={stepTiming}
                label="Timing"
                onChange={(e) => setStepTiming(e.target.value as Timing)}
              >
                <MenuItem value="batch">Batch (prep day)</MenuItem>
                <MenuItem value="just_in_time">
                  Just-in-time (serve time)
                </MenuItem>
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditStepDialogOpen(false);
              setEditingNodeId(null);
              setStepName("");
              setStepType(StepType.Prep);
              setStepTiming(Timing.Batch);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEditedStep}
            variant="contained"
            disabled={!stepName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
