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
import { getAll, getOne, create, remove, collections } from "../lib/api";
import {
  buildRecipeGraph,
  type NormalizedGraph,
} from "../lib/import/build-recipe-graph";
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
import { UNIT_DIMENSIONS, type Unit } from "../lib/units";
import ProductNode, {
  type ProductNodeData,
  type ProductNodeType,
} from "../components/nodes/ProductNode";
import StepNode, {
  type StepNodeData,
  type StepNodeType,
} from "../components/nodes/StepNode";
import ProductForm, { useProductForm } from "../components/ProductForm";
import { searchProducts } from "../lib/search/product-search";

const nodeTypes = {
  product: ProductNode,
  step: StepNode,
};

// Step-metadata authoring vocab (Phase 5 Plan 03, D-05). prep_action reuses
// the Phase-1 controlled prep-verb list verbatim (lib/linter/rules/prep-words.ts).
const PREP_ACTION_OPTIONS = [
  "sliced",
  "diced",
  "minced",
  "chopped",
  "grated",
  "shredded",
] as const;

type ResourceValue = NonNullable<RecipeStep["resource"]>;

const RESOURCE_OPTIONS: ResourceValue[] = [
  "oven",
  "stovetop",
  "blender",
  "food_processor",
  "instant_pot",
  "microwave",
  "sous_vide",
  "smoker",
  "none",
];

const RESOURCE_LABELS: Record<ResourceValue, string> = {
  oven: "Oven",
  stovetop: "Stovetop",
  blender: "Blender",
  food_processor: "Food Processor",
  instant_pot: "Instant Pot",
  microwave: "Microwave",
  sous_vide: "Sous Vide",
  smoker: "Smoker",
  none: "None",
};

type FlowNode = ProductNodeType | StepNodeType;
type FlowEdge = Edge;

// Enum-bound options for the node unit Select (DATA-03) — sourced from
// units.ts so free-text unit entry is no longer possible.
const UNIT_OPTIONS = Object.keys(UNIT_DIMENSIONS) as Unit[];

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
  // Tracks the Autocomplete's current free-text input (shared by both the
  // Add and Edit Product Node dialogs, only one open at a time) so
  // noOptionsText can render the dynamic "No products match ..." copy.
  const [productSearchInput, setProductSearchInput] = useState("");

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

  // Step-metadata authoring fields (Phase 5 Plan 03, D-05). Shared by the
  // Edit Step dialog; not used by the Add Step dialog (backfilled/authored
  // via edit after creation).
  const [stepActiveMinutes, setStepActiveMinutes] = useState<number | "">("");
  const [stepPassiveMinutes, setStepPassiveMinutes] = useState<number | "">(
    ""
  );
  const [stepInstructions, setStepInstructions] = useState("");
  const [stepPrepAction, setStepPrepAction] = useState("");
  const [stepResource, setStepResource] = useState<ResourceValue>("none");
  const [stepOvenTempF, setStepOvenTempF] = useState<number | "">("");
  const [stepRackSlots, setStepRackSlots] = useState<number | "">(1);
  const [ovenTempError, setOvenTempError] = useState(false);

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
            // Load the Phase-5 step-metadata fields (Plan 03/05) so the Edit
            // Step dialog shows saved/backfilled values AND handleSave writes
            // them back instead of clobbering the DB with undefined. Empty
            // strings (PocketBase's default for un-set text/select) normalize
            // to undefined so the dialog's `?? "none"` fallbacks work.
            active_minutes: step.active_minutes,
            passive_minutes: step.passive_minutes,
            instructions: step.instructions || undefined,
            prep_action: step.prep_action || undefined,
            resource: step.resource || undefined,
            oven_temp_f: step.oven_temp_f,
            rack_slots: step.rack_slots,
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
      setStepActiveMinutes(data.active_minutes ?? "");
      setStepPassiveMinutes(data.passive_minutes ?? "");
      setStepInstructions(data.instructions ?? "");
      setStepPrepAction(data.prep_action ?? "");
      setStepResource(data.resource ?? "none");
      setStepOvenTempF(data.oven_temp_f ?? "");
      setStepRackSlots(data.rack_slots ?? 1);
      setOvenTempError(false);
      setEditingNodeId(selectedNode.id);
      setEditStepDialogOpen(true);
    }
  };

  const handleSaveEditedProduct = () => {
    if (!selectedProduct || !editingNodeId) return;

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
              // Node unit is measurement-only; container type is sourced
              // from products.container_type downstream (D-01) and is
              // never written into unit, regardless of product type.
              unit: productUnit || undefined,
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

    // Oven temperature is required when resource === "oven" (D-05) — block
    // save and surface the inline field error rather than silently dropping
    // an incomplete oven step.
    if (stepResource === "oven" && stepOvenTempF === "") {
      setOvenTempError(true);
      return;
    }
    setOvenTempError(false);

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
              active_minutes:
                stepActiveMinutes === "" ? undefined : stepActiveMinutes,
              passive_minutes:
                stepPassiveMinutes === "" ? undefined : stepPassiveMinutes,
              instructions: stepInstructions.trim() || undefined,
              prep_action:
                stepType === StepType.Prep
                  ? stepPrepAction || undefined
                  : undefined,
              resource: stepResource,
              oven_temp_f:
                stepResource === "oven"
                  ? stepOvenTempF === ""
                    ? undefined
                    : stepOvenTempF
                  : undefined,
              rack_slots: stepRackSlots === "" ? undefined : stepRackSlots,
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
    setStepActiveMinutes("");
    setStepPassiveMinutes("");
    setStepInstructions("");
    setStepPrepAction("");
    setStepResource("none");
    setStepOvenTempF("");
    setStepRackSlots(1);
    setOvenTempError(false);
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

    const newNode: ProductNodeType = {
      id: nodeId,
      type: "product",
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: {
        label: selectedProduct.name,
        productId: selectedProduct.id,
        productType: selectedProduct.type,
        quantity: productQuantity || undefined,
        // Node unit is measurement-only; container type is sourced from
        // products.container_type downstream (D-01) and is never written
        // into unit, regardless of product type.
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

      // Build a NormalizedGraph from the current ReactFlow state and delegate
      // ALL recipe + node + step + edge writes to the shared buildRecipeGraph
      // spine — the ONE graph-write path (Plan 06-04, D-01/D-05). node.id is
      // the `product-*` / `step-*` ref; nodeDbIds is the remapSeed so existing
      // nodes update in place. Open Q1: the hand-authored New-Recipe create
      // path sets status="published" explicitly (only import/evolution set
      // draft). unit coerces to "" (PocketBase's own empty default) to satisfy
      // the required NormalizedProductNode.unit — round-trip identical.
      const graph: NormalizedGraph = {
        recipe: {
          name: name.trim(),
          notes: notes.trim() || undefined,
          recipe_type: recipeType,
          ...(isNew ? { status: "published" as const } : {}),
        },
        tagIds: selectedTags.map((t) => t.id),
        productNodes: nodes
          .filter((n): n is ProductNodeType => n.type === "product")
          .map((n) => {
            const data = n.data as ProductNodeData;
            return {
              ref: n.id,
              name: data.label,
              unit: data.unit ?? "",
              quantity: data.quantity,
              matchProductId: data.productId,
              mealDestination: data.mealDestination,
            };
          }),
        steps: nodes
          .filter((n): n is StepNodeType => n.type === "step")
          .map((n) => {
            const data = n.data as StepNodeData;
            return {
              ref: n.id,
              name: data.label,
              step_type: data.stepType as "prep" | "assembly",
              timing: data.timing as "batch" | "just_in_time" | undefined,
              active_minutes: data.active_minutes,
              passive_minutes: data.passive_minutes,
              instructions: data.instructions,
              prep_action: data.prep_action,
              resource: data.resource,
              oven_temp_f: data.oven_temp_f,
              rack_slots: data.rack_slots,
            };
          }),
        edges: edges.map((e) => ({ from: e.source, to: e.target })),
      };

      const { recipeId, nodeDbIds: newNodeDbIds } = await buildRecipeGraph(
        graph,
        {
          recipeId: isNew ? undefined : id!,
          remapSeed: nodeDbIds,
        }
      );

      // Tags stay in the editor (not part of the node/edge spine): delete the
      // existing recipe_tags then recreate from the current selection.
      if (!isNew) {
        const existingTags = await getAll<RecipeTag>(collections.recipeTags, {
          filter: `recipe="${recipeId}"`,
        });
        await Promise.all(
          existingTags.map((rt) => remove(collections.recipeTags, rt.id))
        );
      }
      await Promise.all(
        selectedTags.map((tag) =>
          create(collections.recipeTags, {
            recipe: recipeId,
            tag: tag.id,
          })
        )
      );

      setNodeDbIds(newNodeDbIds);

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
                filterOptions={(options, { inputValue }) =>
                  searchProducts(inputValue, options)
                }
                noOptionsText={
                  productSearchInput
                    ? `No products match "${productSearchInput}"`
                    : "No options"
                }
                onInputChange={(_, newInputValue) =>
                  setProductSearchInput(newInputValue)
                }
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
                      <FormControl size="small" sx={{ width: 120 }}>
                        <InputLabel>Unit</InputLabel>
                        <Select
                          value={productUnit}
                          label="Unit"
                          onChange={(e) => setProductUnit(e.target.value)}
                        >
                          <MenuItem value="">
                            <em>None</em>
                          </MenuItem>
                          {UNIT_OPTIONS.map((u) => (
                            <MenuItem key={u} value={u}>
                              {u}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
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
                existingProducts={products}
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
            filterOptions={(options, { inputValue }) =>
              searchProducts(inputValue, options)
            }
            noOptionsText={
              productSearchInput
                ? `No products match "${productSearchInput}"`
                : "No options"
            }
            onInputChange={(_, newInputValue) =>
              setProductSearchInput(newInputValue)
            }
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
              <FormControl size="small" sx={{ width: 120 }}>
                <InputLabel>Unit</InputLabel>
                <Select
                  value={productUnit}
                  label="Unit"
                  onChange={(e) => setProductUnit(e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {UNIT_OPTIONS.map((u) => (
                    <MenuItem key={u} value={u}>
                      {u}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
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
          setStepActiveMinutes("");
          setStepPassiveMinutes("");
          setStepInstructions("");
          setStepPrepAction("");
          setStepResource("none");
          setStepOvenTempF("");
          setStepRackSlots(1);
          setOvenTempError(false);
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

          <TextField
            label="Active minutes"
            type="number"
            value={stepActiveMinutes}
            onChange={(e) =>
              setStepActiveMinutes(
                e.target.value ? Number(e.target.value) : ""
              )
            }
            fullWidth
            margin="dense"
          />

          <TextField
            label="Passive minutes"
            type="number"
            value={stepPassiveMinutes}
            onChange={(e) =>
              setStepPassiveMinutes(
                e.target.value ? Number(e.target.value) : ""
              )
            }
            fullWidth
            margin="dense"
          />

          <TextField
            label="Instructions"
            value={stepInstructions}
            onChange={(e) => setStepInstructions(e.target.value)}
            multiline
            rows={3}
            fullWidth
            margin="dense"
          />

          {stepType === StepType.Prep && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Prep action</InputLabel>
              <Select
                value={stepPrepAction}
                label="Prep action"
                onChange={(e) => setStepPrepAction(e.target.value)}
              >
                {PREP_ACTION_OPTIONS.map((verb) => (
                  <MenuItem key={verb} value={verb}>
                    {verb.charAt(0).toUpperCase() + verb.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl fullWidth margin="dense">
            <InputLabel>Resource</InputLabel>
            <Select
              value={stepResource}
              label="Resource"
              onChange={(e) => {
                const value = e.target.value as ResourceValue;
                setStepResource(value);
                if (value !== "oven") {
                  setOvenTempError(false);
                }
              }}
            >
              {RESOURCE_OPTIONS.map((r) => (
                <MenuItem key={r} value={r}>
                  {RESOURCE_LABELS[r]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {stepResource === "oven" && (
            <TextField
              label="Oven temperature (°F)"
              type="number"
              value={stepOvenTempF}
              onChange={(e) => {
                setStepOvenTempF(e.target.value ? Number(e.target.value) : "");
                setOvenTempError(false);
              }}
              fullWidth
              margin="dense"
              error={ovenTempError}
              helperText={
                ovenTempError
                  ? "Oven temperature is required for oven steps."
                  : undefined
              }
            />
          )}

          {stepResource === "oven" && (
            <TextField
              label="Rack slots"
              type="number"
              value={stepRackSlots}
              onChange={(e) =>
                setStepRackSlots(e.target.value ? Number(e.target.value) : "")
              }
              fullWidth
              margin="dense"
            />
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
              setStepActiveMinutes("");
              setStepPassiveMinutes("");
              setStepInstructions("");
              setStepPrepAction("");
              setStepResource("none");
              setStepOvenTempF("");
              setStepRackSlots(1);
              setOvenTempError(false);
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
