import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Autocomplete,
  TextField,
  Chip,
  Paper,
  Divider,
} from "@mui/material";
import {
  Egg as ProductIcon,
  SwapHoriz as SwapIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import type { Product, MealVariantOverride, RecipeProductNode } from "../lib/types";
import type { RecipeGraphData } from "../lib/aggregation";
import { previewOrphanedNodes } from "../lib/aggregation/utils/variant-utils";
import { ProductType } from "../lib/types";

interface PlannedMealExpanded {
  id: string;
  recipe: string;
  expand?: {
    recipe?: { id: string; name: string };
  };
}

interface MealVariantOverrideExpanded extends MealVariantOverride {
  expand?: {
    original_node?: RecipeProductNode & {
      expand?: { product?: Product };
    };
    replacement_product?: Product;
  };
}

interface VariantEditorDialogProps {
  open: boolean;
  onClose: () => void;
  plannedMeal: PlannedMealExpanded | null;
  recipeData: RecipeGraphData | null;
  existingOverrides: MealVariantOverrideExpanded[];
  products: Product[];
  onSave: (
    mealId: string,
    overrides: { originalNodeId: string; replacementProductId: string }[]
  ) => Promise<void>;
}

interface PendingOverride {
  originalNodeId: string;
  originalNodeName: string;
  replacementProduct: Product | null;
}

const TYPE_COLORS: Record<string, string> = {
  raw: "#4caf50",
  transient: "#ff9800",
  stored: "#2196f3",
  inventory: "#9c27b0",
};

export function VariantEditorDialog({
  open,
  onClose,
  plannedMeal,
  recipeData,
  existingOverrides,
  products,
  onSave,
}: VariantEditorDialogProps) {
  const [pendingOverrides, setPendingOverrides] = useState<Map<string, PendingOverride>>(
    new Map()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialize pending overrides from existing overrides when dialog opens
  useEffect(() => {
    if (open && existingOverrides.length > 0) {
      const initial = new Map<string, PendingOverride>();
      for (const override of existingOverrides) {
        const originalName =
          override.expand?.original_node?.expand?.product?.name || "Unknown";
        initial.set(override.original_node, {
          originalNodeId: override.original_node,
          originalNodeName: originalName,
          replacementProduct: override.expand?.replacement_product || null,
        });
      }
      setPendingOverrides(initial);
    } else if (open) {
      setPendingOverrides(new Map());
    }
  }, [open, existingOverrides]);

  // Reset selection when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedNodeId(null);
    }
  }, [open]);

  // Get replaceable nodes (product nodes that have incoming edges - i.e., outputs of steps)
  const replaceableNodes = useMemo(() => {
    if (!recipeData) return [];

    // Nodes that are outputs of steps (have incoming step->product edges)
    const outputNodeIds = new Set(recipeData.stepToProductEdges.map((e) => e.target));

    return recipeData.productNodes
      .filter((node) => outputNodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        name: node.expand?.product?.name || "Unknown",
        type: node.expand?.product?.type || ProductType.Transient,
        quantity: node.quantity,
        unit: node.unit,
      }));
  }, [recipeData]);

  // Preview what would be orphaned for selected node
  const orphanPreview = useMemo(() => {
    if (!selectedNodeId || !recipeData) return null;
    return previewOrphanedNodes(recipeData, selectedNodeId);
  }, [selectedNodeId, recipeData]);

  // Filter products for replacement (exclude transient, prefer inventory/stored)
  const replacementProducts = useMemo(() => {
    return products
      .filter((p) => p.type !== ProductType.Transient)
      .sort((a, b) => {
        // Prioritize inventory items
        if (a.type === ProductType.Inventory && b.type !== ProductType.Inventory) return -1;
        if (b.type === ProductType.Inventory && a.type !== ProductType.Inventory) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products]);

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNodeId(nodeId);

    // Initialize pending override if not exists
    if (!pendingOverrides.has(nodeId)) {
      const node = replaceableNodes.find((n) => n.id === nodeId);
      if (node) {
        setPendingOverrides((prev) => {
          const next = new Map(prev);
          next.set(nodeId, {
            originalNodeId: nodeId,
            originalNodeName: node.name,
            replacementProduct: null,
          });
          return next;
        });
      }
    }
  };

  const handleReplacementSelect = (product: Product | null) => {
    if (!selectedNodeId) return;

    setPendingOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(selectedNodeId);
      if (existing) {
        next.set(selectedNodeId, { ...existing, replacementProduct: product });
      }
      return next;
    });
  };

  const handleRemoveOverride = (nodeId: string) => {
    setPendingOverrides((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const handleSave = async () => {
    
    if (!plannedMeal) return;

    // Filter to only overrides with a replacement selected
    const validOverrides = Array.from(pendingOverrides.values())
      .filter((o) => o.replacementProduct !== null)
      .map((o) => ({
        originalNodeId: o.originalNodeId,
        replacementProductId: o.replacementProduct!.id,
      }));

    setSaving(true);
    
    try {
      await onSave(plannedMeal.id, validOverrides);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedPendingOverride = selectedNodeId
    ? pendingOverrides.get(selectedNodeId)
    : null;

  const hasChanges = useMemo(() => {
    const currentOverrideIds = new Set(existingOverrides.map((o) => o.original_node));
    const pendingOverrideIds = new Set(
      Array.from(pendingOverrides.values())
        .filter((o) => o.replacementProduct !== null)
        .map((o) => o.originalNodeId)
    );

    if (currentOverrideIds.size !== pendingOverrideIds.size) return true;

    for (const override of existingOverrides) {
      const pending = pendingOverrides.get(override.original_node);
      if (!pending || pending.replacementProduct?.id !== override.replacement_product) {
        return true;
      }
    }

    for (const [nodeId, pending] of pendingOverrides) {
      if (pending.replacementProduct && !currentOverrideIds.has(nodeId)) {
        return true;
      }
    }
    

    return false;
  }, [existingOverrides, pendingOverrides]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Variants: {plannedMeal?.expand?.recipe?.name || "Recipe"}
      </DialogTitle>

      <DialogContent dividers>
        <Box display="flex" gap={2} minHeight={400}>
          {/* Left panel: Node list */}
          <Box flex={1}>
            <Typography variant="subtitle2" gutterBottom>
              Recipe Outputs
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Select an output to replace with an existing item
            </Typography>

            <List dense sx={{ maxHeight: 350, overflow: "auto" }}>
              {replaceableNodes.map((node) => {
                const hasOverride = pendingOverrides.get(node.id)?.replacementProduct !== null;
                const isSelected = selectedNodeId === node.id;

                return (
                  <ListItem key={node.id} disablePadding>
                    <ListItemButton
                      selected={isSelected}
                      onClick={() => handleNodeSelect(node.id)}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <ProductIcon
                          sx={{ color: TYPE_COLORS[node.type] || "#999" }}
                          fontSize="small"
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={node.name}
                        secondary={`${node.quantity || ""} ${node.unit || ""}`.trim() || undefined}
                      />
                      {hasOverride && (
                        <Chip
                          label="Modified"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Right panel: Override editor */}
          <Box flex={1}>
            {selectedNodeId && selectedPendingOverride ? (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Replace "{selectedPendingOverride.originalNodeName}"
                </Typography>

                <Autocomplete
                  options={replacementProducts}
                  value={selectedPendingOverride.replacementProduct}
                  onChange={(_, newValue) => handleReplacementSelect(newValue)}
                  getOptionLabel={(option) => option.name}
                  groupBy={(option) => option.type}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Replacement Product"
                      placeholder="Select a product..."
                      margin="dense"
                      fullWidth
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <ProductIcon
                          sx={{ color: TYPE_COLORS[option.type] || "#999" }}
                          fontSize="small"
                        />
                        {option.name}
                      </Box>
                    </li>
                  )}
                />

                {selectedPendingOverride.replacementProduct && (
                  <Box mt={2}>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleRemoveOverride(selectedNodeId)}
                    >
                      Remove Override
                    </Button>
                  </Box>
                )}

                {/* Orphan preview */}
                {orphanPreview &&
                  (orphanPreview.orphanedProducts.length > 0 ||
                    orphanPreview.orphanedSteps.length > 0) && (
                    <Paper variant="outlined" sx={{ mt: 2, p: 1.5 }}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <WarningIcon color="warning" fontSize="small" />
                        <Typography variant="subtitle2">
                          Nodes that will be removed
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        These upstream nodes will no longer be needed:
                      </Typography>
                      <Box mt={1} display="flex" flexWrap="wrap" gap={0.5}>
                        {orphanPreview.orphanedProducts.map((p) => (
                          <Chip key={p.id} label={p.name} size="small" variant="outlined" />
                        ))}
                        {orphanPreview.orphanedSteps.map((s) => (
                          <Chip
                            key={s.id}
                            label={s.name}
                            size="small"
                            variant="outlined"
                            color="secondary"
                          />
                        ))}
                      </Box>
                    </Paper>
                  )}
              </>
            ) : (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                height="100%"
                color="text.secondary"
              >
                <Typography variant="body2">
                  Select a recipe output to replace
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Current overrides summary */}
        {pendingOverrides.size > 0 && (
          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>
              Current Substitutions
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {Array.from(pendingOverrides.values())
                .filter((o) => o.replacementProduct !== null)
                .map((override) => (
                  <Chip
                    key={override.originalNodeId}
                    icon={<SwapIcon />}
                    label={`${override.originalNodeName} → ${override.replacementProduct!.name}`}
                    onDelete={() => handleRemoveOverride(override.originalNodeId)}
                    variant="outlined"
                    color="primary"
                  />
                ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || !hasChanges}
        >
          {saving ? "Saving..." : "Save Variants"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}