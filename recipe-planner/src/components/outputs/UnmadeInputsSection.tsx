import { Box, Typography, Button, List, ListItem, ListItemText } from "@mui/material";
import {
  AddCircleOutline as AddIcon,
  ShoppingCart as CartIcon,
  ErrorOutline as ErrorIcon,
} from "@mui/icons-material";
import type { ManualShoppingItem } from "./ShoppingListTab";

/**
 * A consumed input that no step in the planned week produces and that isn't
 * prior stock — the `missing-pull-step` finding for a stored/transient product
 * (e.g. a peanut dressing the plan never makes). Enriched in Outputs.tsx with
 * the product's make (`source_recipe`) and buy (`store_bought_product`)
 * relations so the shopping list can answer the cook's real question: "should I
 * have made it or bought it?" (unproduced-non-raw-inputs, 260718).
 */
export interface UnmadeInput {
  productId: string;
  productName: string;
  /** Names of the planned recipes that consume it. */
  usedInRecipeNames: string[];
  sourceRecipeId?: string;
  sourceRecipeName?: string;
  storeBoughtProductId?: string;
  storeBoughtProductName?: string;
  storeBoughtStoreName?: string;
  storeBoughtSectionName?: string;
}

interface UnmadeInputsSectionProps {
  unmadeInputs: UnmadeInput[];
  onAddRecipeToPlan: (recipeId: string) => void;
  onAddToShoppingList: (item: ManualShoppingItem) => void;
}

/**
 * Plan/shop-time surface for consumed-but-unmade inputs. Parallels
 * `OutOfStockSection` (which handles the inventory case) — same make/buy/neither
 * resolution shape, so the two read as one family. When neither relation is set,
 * the item is unmakeable AND unbuyable as authored: that itself is the finding,
 * and the recipe data needs fixing.
 */
export function UnmadeInputsSection({
  unmadeInputs,
  onAddRecipeToPlan,
  onAddToShoppingList,
}: UnmadeInputsSectionProps) {
  if (unmadeInputs.length === 0) return null;

  return (
    <Box mb={3}>
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        Nothing makes these — decide make or buy
      </Typography>
      <List dense>
        {unmadeInputs.map((item) => {
          const hasSourceRecipe = !!item.sourceRecipeId;
          const hasStoreBought = !!item.storeBoughtProductId;
          const hasNoResolution = !hasSourceRecipe && !hasStoreBought;

          return (
            <ListItem
              key={item.productId}
              sx={{
                backgroundColor: hasNoResolution ? "#ffebee" : "#fff8e1",
                borderRadius: 1,
                mb: 1,
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <ListItemText
                primary={item.productName}
                secondary={
                  item.usedInRecipeNames.length > 0
                    ? `Used in: ${item.usedInRecipeNames.join(", ")}`
                    : undefined
                }
              />
              <Box display="flex" gap={1} mt={0.5} alignItems="center" flexWrap="wrap">
                {hasSourceRecipe && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => onAddRecipeToPlan(item.sourceRecipeId!)}
                  >
                    Make it: {item.sourceRecipeName}
                  </Button>
                )}
                {hasStoreBought && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<CartIcon />}
                    onClick={() =>
                      onAddToShoppingList({
                        productId: item.storeBoughtProductId!,
                        productName: item.storeBoughtProductName!,
                        storeName: item.storeBoughtStoreName,
                        sectionName: item.storeBoughtSectionName,
                      })
                    }
                  >
                    Buy it: {item.storeBoughtProductName}
                  </Button>
                )}
                {hasNoResolution && (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <ErrorIcon sx={{ color: "error.main", fontSize: "1.1rem" }} />
                    <Typography variant="body2" color="error.main" sx={{ py: 0.5 }}>
                      No make or buy source set — fix this recipe before relying on it.
                    </Typography>
                  </Box>
                )}
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
