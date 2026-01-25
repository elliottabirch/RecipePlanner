import { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  ArrowForward as ArrowIcon,
} from "@mui/icons-material";
import type { PlannedMeal, MealVariantOverride, Product, RecipeProductNode, Day, MealSlot } from "../lib/types";
import type { RecipeGraphData } from "../lib/aggregation";
import { DAYS, MEAL_SLOTS } from "../constants/mealPlanning";

interface MealVariantOverrideExpanded extends MealVariantOverride {
  expand?: {
    planned_meal?: PlannedMeal;
    original_node?: RecipeProductNode & {
      expand?: { product?: Product };
    };
    replacement_product?: Product;
  };
}

interface PlannedMealExpanded extends PlannedMeal {
  expand?: {
    recipe?: { id: string; name: string };
  };
}

interface VariantsListProps {
  plannedMeals: PlannedMealExpanded[];
  overrides: MealVariantOverrideExpanded[];
  recipeData: Map<string, RecipeGraphData>;
  onEdit: (mealId: string) => void;
  onDeleteOverride: (overrideId: string) => Promise<void>;
}

interface MealWithOverrides {
  meal: PlannedMealExpanded;
  overrides: MealVariantOverrideExpanded[];
  hasInvalidOverrides: boolean;
}

function formatMealLocation(day?: Day, slot?: MealSlot): string {
  const dayLabel = day ? DAYS.find((d) => d.value === day)?.label : "Week-spanning";
  const slotLabel = slot ? MEAL_SLOTS.find((s) => s.value === slot)?.label : "";
  return `${dayLabel}${slotLabel ? ` ${slotLabel}` : ""}`;
}

export function VariantsList({
  plannedMeals,
  overrides,
  recipeData,
  onEdit,
  onDeleteOverride,
}: VariantsListProps) {
  const [expanded, setExpanded] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [overrideToDelete, setOverrideToDelete] = useState<MealVariantOverrideExpanded | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Group overrides by planned meal
  const mealsWithOverrides: MealWithOverrides[] = [];
  const overridesByMeal = new Map<string, MealVariantOverrideExpanded[]>();

  for (const override of overrides) {
    const mealId = override.planned_meal;
    if (!overridesByMeal.has(mealId)) {
      overridesByMeal.set(mealId, []);
    }
    overridesByMeal.get(mealId)!.push(override);
  }

  for (const [mealId, mealOverrides] of overridesByMeal) {
    const meal = plannedMeals.find((m) => m.id === mealId);
    if (!meal) continue;

    // Check if any overrides are invalid (original node no longer exists)
    const recipeGraphData = recipeData.get(meal.recipe);
    const hasInvalidOverrides = mealOverrides.some((o) => {
      if (!recipeGraphData) return true;
      return !recipeGraphData.productNodes.some((n) => n.id === o.original_node);
    });

    mealsWithOverrides.push({
      meal,
      overrides: mealOverrides,
      hasInvalidOverrides,
    });
  }

  if (mealsWithOverrides.length === 0) {
    return null;
  }

  const handleDeleteClick = (override: MealVariantOverrideExpanded) => {
    setOverrideToDelete(override);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!overrideToDelete) return;
    setDeleting(true);
    try {
      await onDeleteOverride(overrideToDelete.id);
      setDeleteDialogOpen(false);
      setOverrideToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Paper sx={{ p: 2, mt: 2 }}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{ cursor: "pointer" }}
          onClick={() => setExpanded(!expanded)}
        >
          <Typography variant="subtitle1" fontWeight="bold">
            Variants ({mealsWithOverrides.length})
          </Typography>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Collapse in={expanded}>
          <List dense sx={{ mt: 1 }}>
            {mealsWithOverrides.map(({ meal, overrides: mealOverrides, hasInvalidOverrides }) => (
              <Paper
                key={meal.id}
                variant="outlined"
                sx={{
                  mb: 1,
                  p: 1.5,
                  backgroundColor: hasInvalidOverrides ? "error.50" : "grey.50",
                  borderColor: hasInvalidOverrides ? "error.main" : "grey.300",
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                  <Box display="flex" alignItems="center" gap={1}>
                    {hasInvalidOverrides && (
                      <Tooltip title="Some overrides reference nodes that no longer exist">
                        <WarningIcon color="error" fontSize="small" />
                      </Tooltip>
                    )}
                    <Typography variant="body2" fontWeight="bold">
                      {meal.expand?.recipe?.name || "Unknown Recipe"}
                    </Typography>
                    <Chip
                      label={formatMealLocation(meal.day, meal.meal_slot)}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  <Box>
                    <Tooltip title="Edit variants">
                      <IconButton size="small" onClick={() => onEdit(meal.id)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                {mealOverrides.map((override) => {
                  const recipeGraphData = recipeData.get(meal.recipe);
                  const originalNodeExists = recipeGraphData?.productNodes.some(
                    (n) => n.id === override.original_node
                  );
                  const originalName =
                    override.expand?.original_node?.expand?.product?.name || "Unknown";
                  const replacementName =
                    override.expand?.replacement_product?.name || "Unknown";

                  return (
                    <ListItem
                      key={override.id}
                      sx={{
                        py: 0.5,
                        px: 1,
                        backgroundColor: !originalNodeExists ? "error.100" : "transparent",
                        borderRadius: 1,
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: !originalNodeExists ? "line-through" : "none",
                                color: !originalNodeExists ? "error.main" : "text.primary",
                              }}
                            >
                              {originalName}
                            </Typography>
                            <ArrowIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="primary">
                              {replacementName}
                            </Typography>
                            {!originalNodeExists && (
                              <Chip
                                label="Invalid"
                                size="small"
                                color="error"
                                sx={{ height: 20, fontSize: "0.7rem" }}
                              />
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="Remove this override">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteClick(override)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </Paper>
            ))}
          </List>
        </Collapse>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Remove Override?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the ingredient substitution. The original recipe ingredient will be
            used instead.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}