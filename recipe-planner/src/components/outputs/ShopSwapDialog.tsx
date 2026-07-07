import { useEffect, useMemo, useState } from "react";
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
  ListItemText,
  Checkbox,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Autocomplete,
  Divider,
} from "@mui/material";
import { Egg as ProductIcon } from "@mui/icons-material";
import type { Product } from "../../lib/types";
import { ProductType } from "../../lib/types";
import type {
  PlannedMealWithRecipe,
  RecipeGraphData,
} from "../../lib/aggregation";
import {
  getMealNodeTargetsForProduct,
  type SwapTarget,
} from "../../lib/shopping-mapping";
import { UNIT_DIMENSIONS, type Unit } from "../../lib/units";
import { QuickCreateProductDialog } from "./QuickCreateProductDialog";
import { searchProducts } from "../../lib/search/product-search";

const UNIT_OPTIONS = Object.keys(UNIT_DIMENSIONS) as Unit[];

const TYPE_COLORS: Record<string, string> = {
  raw: "#4caf50",
  transient: "#ff9800",
  stored: "#2196f3",
  inventory: "#9c27b0",
};

/** Per checked meal, everything the parent needs to write/extend overrides. */
export interface SwapSaveEntry {
  plannedMealId: string;
  /** All recipe_product_node IDs within this meal referencing the swapped product (D-07 fan-out). */
  nodeIds: string[];
  replacementProductId: string;
  quantity: number | null;
  unit: string | null;
}

interface MealRowState {
  checked: boolean;
  quantity: string;
  unit: Unit | "";
}

interface ShopSwapDialogProps {
  open: boolean;
  onClose: () => void;
  /** The shopping line's current product being swapped. */
  product: Product | null;
  plannedMeals: PlannedMealWithRecipe[];
  recipeData: Map<string, RecipeGraphData>;
  /** Full product catalog for the replacement Autocomplete. */
  products: Product[];
  onSave: (entries: SwapSaveEntry[]) => Promise<void>;
}

/**
 * Mid-shop swap dialog (D-07/D-08/D-09, SHOP-03/SHOP-05). Lists this week's
 * meals that use `product` (via `getMealNodeTargetsForProduct`), pre-fills
 * each meal's quantity/unit from the original node, and lets the shopper
 * pick (or inline-create) a replacement product. Saving hands the parent
 * one `SwapSaveEntry` per checked meal.
 */
export function ShopSwapDialog({
  open,
  onClose,
  product,
  plannedMeals,
  recipeData,
  products,
  onSave,
}: ShopSwapDialogProps) {
  const [mealState, setMealState] = useState<Map<string, MealRowState>>(
    new Map()
  );
  const [replacementProduct, setReplacementProduct] = useState<Product | null>(
    null
  );
  // Tracks the replacement-product Autocomplete's free-text input so
  // noOptionsText can render the dynamic "No products match ..." copy.
  const [replacementSearchInput, setReplacementSearchInput] = useState("");
  const [extraProducts, setExtraProducts] = useState<Product[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetsByMeal = useMemo(() => {
    const map = new Map<string, SwapTarget[]>();
    if (!product) return map;
    const targets = getMealNodeTargetsForProduct(
      product.id,
      plannedMeals,
      recipeData
    );
    for (const target of targets) {
      const list = map.get(target.plannedMealId) ?? [];
      list.push(target);
      map.set(target.plannedMealId, list);
    }
    return map;
  }, [product, plannedMeals, recipeData]);

  // Seed the per-meal checklist + pre-filled quantity/unit (D-07) whenever
  // the dialog opens (possibly for a new product).
  useEffect(() => {
    if (!open) return;
    const initial = new Map<string, MealRowState>();
    targetsByMeal.forEach((targets, mealId) => {
      const first = targets[0];
      initial.set(mealId, {
        checked: false,
        quantity: first?.quantity != null ? String(first.quantity) : "",
        unit: (first?.unit as Unit) ?? "",
      });
    });
    setMealState(initial);
    setReplacementProduct(null);
    setExtraProducts([]);
  }, [open, targetsByMeal]);

  // Reuse VariantEditorDialog's exact filter+sort shape (Don't-Hand-Roll) —
  // extended with any product(s) quick-created during this session so the
  // newly created product appears (and stays selected) in the Autocomplete.
  const replacementProducts = useMemo(() => {
    return [...products, ...extraProducts]
      .filter((p) => p.type !== ProductType.Transient)
      .sort((a, b) => {
        if (a.type === ProductType.Inventory && b.type !== ProductType.Inventory)
          return -1;
        if (b.type === ProductType.Inventory && a.type !== ProductType.Inventory)
          return 1;
        return a.name.localeCompare(b.name);
      });
  }, [products, extraProducts]);

  const toggleMealChecked = (mealId: string) => {
    setMealState((prev) => {
      const existing = prev.get(mealId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(mealId, { ...existing, checked: !existing.checked });
      return next;
    });
  };

  const updateMealQuantity = (mealId: string, quantity: string) => {
    setMealState((prev) => {
      const existing = prev.get(mealId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(mealId, { ...existing, quantity });
      return next;
    });
  };

  const updateMealUnit = (mealId: string, unit: Unit) => {
    setMealState((prev) => {
      const existing = prev.get(mealId);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(mealId, { ...existing, unit });
      return next;
    });
  };

  const checkedMealCount = Array.from(mealState.values()).filter(
    (row) => row.checked
  ).length;
  const canSave = checkedMealCount > 0 && replacementProduct !== null;

  const handleSave = async () => {
    if (!canSave || !replacementProduct) return;

    const entries: SwapSaveEntry[] = [];
    mealState.forEach((row, mealId) => {
      if (!row.checked) return;
      const targets = targetsByMeal.get(mealId) ?? [];
      if (targets.length === 0) return;

      // Coerce blank/non-numeric/negative input to null (T-02-16) — null
      // means "inherit the original node's quantity" (D-07/D-09), a safe
      // fallback rather than writing a bad number.
      const parsed = row.quantity.trim() === "" ? null : Number(row.quantity);
      const quantity =
        parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

      entries.push({
        plannedMealId: mealId,
        nodeIds: targets.map((t) => t.nodeId),
        replacementProductId: replacementProduct.id,
        quantity,
        unit: row.unit || null,
      });
    });

    setSaving(true);
    try {
      await onSave(entries);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 20, fontWeight: 600 }}>
          Swap {product?.name ?? ""}
        </DialogTitle>
        <DialogContent dividers>
          {targetsByMeal.size === 0 ? (
            <Box textAlign="center" py={3}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                No meals need this yet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This product isn't used in any of this week's planned meals.
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Meals using {product?.name}
              </Typography>
              <List dense>
                {Array.from(targetsByMeal.entries()).map(([mealId, targets]) => {
                  const row = mealState.get(mealId);
                  if (!row) return null;
                  return (
                    <ListItem
                      key={mealId}
                      disableGutters
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <Checkbox
                        size="medium"
                        checked={row.checked}
                        onChange={() => toggleMealChecked(mealId)}
                        sx={{ minWidth: 48, minHeight: 48 }}
                      />
                      <ListItemText
                        primary={targets[0].recipeName}
                        primaryTypographyProps={{ variant: "body1" }}
                      />
                      <TextField
                        type="number"
                        size="small"
                        value={row.quantity}
                        onChange={(e) => updateMealQuantity(mealId, e.target.value)}
                        disabled={!row.checked}
                        inputProps={{ min: 0 }}
                        sx={{ width: 80 }}
                      />
                      <FormControl
                        size="small"
                        sx={{ width: 100 }}
                        disabled={!row.checked}
                      >
                        <Select
                          value={row.unit}
                          onChange={(e) =>
                            updateMealUnit(mealId, e.target.value as Unit)
                          }
                          displayEmpty
                        >
                          <MenuItem value="">
                            <em>—</em>
                          </MenuItem>
                          {UNIT_OPTIONS.map((u) => (
                            <MenuItem key={u} value={u}>
                              {u}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </ListItem>
                  );
                })}
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Replace with
              </Typography>
              <Autocomplete
                options={replacementProducts}
                value={replacementProduct}
                onChange={(_, newValue) => setReplacementProduct(newValue)}
                getOptionLabel={(option) => option.name}
                groupBy={(option) => option.type}
                filterOptions={(options, { inputValue }) =>
                  searchProducts(inputValue, options)
                }
                noOptionsText={
                  replacementSearchInput
                    ? `No products match "${replacementSearchInput}"`
                    : "No options"
                }
                onInputChange={(_, newInputValue) =>
                  setReplacementSearchInput(newInputValue)
                }
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
              <Button
                size="small"
                onClick={() => setQuickCreateOpen(true)}
                sx={{ mt: 1, minHeight: 48 }}
              >
                + Create new product
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving || !canSave}
            sx={{ minHeight: 48 }}
          >
            {saving ? "Saving..." : "Save Swap"}
          </Button>
        </DialogActions>
      </Dialog>

      <QuickCreateProductDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(created) => {
          // D-08: return the newly created product straight into this
          // Autocomplete, keeping the shopper inside the swap flow.
          setExtraProducts((prev) => [...prev, created]);
          setReplacementProduct(created);
          setQuickCreateOpen(false);
        }}
      />
    </>
  );
}
