import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
import type {
  Recipe,
  Product,
  RecipeProductNode,
  RecipeStep,
  RecipeTag,
  ProductToStepEdge,
  StepToProductEdge,
  Tag,
} from "../lib/types";
import ProductNode, {
  type ProductNodeData,
  type ProductNodeType,
} from "../components/nodes/ProductNode";
import StepNode, {
  type StepNodeData,
  type StepNodeType,
} from "../components/nodes/StepNode";

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

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  // Lookup data
  const [products, setProducts] = useState<Product[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);

  // Add product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState<number | "">("");
  const [productUnit, setProductUnit] = useState("");
  const [productMealDestination, setProductMealDestination] = useState("");

  // Add step dialog
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepName, setStepName] = useState("");
  const [stepType, setStepType] = useState<"prep" | "assembly">("prep");
  const [stepTiming, setStepTiming] = useState<"batch" | "just_in_time">(
    "batch"
  );

  // Track database IDs for nodes/edges
  const [nodeDbIds, setNodeDbIds] = useState<Record<string, string>>({});

  // Selected node for deletion
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  const loadLookupData = async () => {
    try {
      const [productsData, tagsData] = await Promise.all([
        getAll<Product>(collections.products, { sort: "name" }),
        getAll<Tag>(collections.tags, { sort: "name" }),
      ]);
      setProducts(productsData);
      setAllTags(tagsData);
    } catch (err) {
      console.error("Failed to load lookup data:", err);
    }
  };

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
          position: { x: pn.position_x || 0, y: pn.position_y || 0 },
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
          position: { x: step.position_x || 0, y: step.position_y || 0 },
          data: {
            label: step.name,
            stepType: step.step_type,
            timing: step.timing,
          },
        } as StepNodeType);
      });

      setNodes(flowNodes);
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

  const handleAddProduct = () => {
    if (!selectedProduct) return;

    const nodeId = `product-temp-${Date.now()}`;
    const newNode: ProductNodeType = {
      id: nodeId,
      type: "product",
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        label: selectedProduct.name,
        productId: selectedProduct.id,
        productType: selectedProduct.type,
        quantity: productQuantity || undefined,
        unit: productUnit || undefined,
        mealDestination: productMealDestination || undefined,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setProductDialogOpen(false);
    setSelectedProduct(null);
    setProductQuantity("");
    setProductUnit("");
    setProductMealDestination("");
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
    setStepType("prep");
    setStepTiming("batch");
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
        });
        recipeId = newRecipe.id;
      } else {
        await update(collections.recipes, id!, {
          name: name.trim(),
          notes: notes.trim() || undefined,
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
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteNode}
            >
              Delete Node
            </Button>
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
          onEdgeDoubleClick={(event, current_edge) => {
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
        onClose={() => setProductDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Product Node</DialogTitle>
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
              label="Quantity"
              type="number"
              value={productQuantity}
              onChange={(e) =>
                setProductQuantity(e.target.value ? Number(e.target.value) : "")
              }
              size="small"
              sx={{ width: 120 }}
            />
            <TextField
              label="Unit"
              value={productUnit}
              onChange={(e) => setProductUnit(e.target.value)}
              size="small"
              sx={{ width: 120 }}
              placeholder="cups, lbs, etc."
            />
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
          <Button onClick={() => setProductDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddProduct}
            variant="contained"
            disabled={!selectedProduct}
          >
            Add
          </Button>
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
              onChange={(e) =>
                setStepType(e.target.value as "prep" | "assembly")
              }
            >
              <MenuItem value="prep">Prep (raw ingredients only)</MenuItem>
              <MenuItem value="assembly">Assembly</MenuItem>
            </Select>
          </FormControl>

          {stepType === "assembly" && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Timing</InputLabel>
              <Select
                value={stepTiming}
                label="Timing"
                onChange={(e) =>
                  setStepTiming(e.target.value as "batch" | "just_in_time")
                }
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
    </Box>
  );
}
