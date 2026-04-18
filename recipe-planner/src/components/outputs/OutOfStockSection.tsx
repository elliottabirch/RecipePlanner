import { Box, Typography, Button, List, ListItem, ListItemText } from "@mui/material";
import {
  CheckCircle as CheckIcon,
  AddCircleOutline as AddIcon,
  ShoppingCart as CartIcon,
} from "@mui/icons-material";
import type { InventoryStockWarning } from "../../lib/aggregation";
import type { RecipeGraphData, PlannedMealWithRecipe } from "../../lib/aggregation";
import { ProductType } from "../../lib/types";
import { UI_TEXT } from "../../constants/outputs";

interface OutOfStockSectionProps {
  stockWarnings: InventoryStockWarning[];
  plannedMeals: PlannedMealWithRecipe[];
  recipeData: Map<string, RecipeGraphData>;
  onAddRecipeToPlan: (recipeId: string) => void;
  onAddToShoppingList: (productId: string, productName: string) => void;
}

/**
 * Determines if an out-of-stock inventory item is already handled by checking
 * whether its source recipe (or any batch_prep recipe that produces it) is
 * already in the weekly plan.
 */
function isItemHandled(
  item: InventoryStockWarning,
  plannedMeals: PlannedMealWithRecipe[],
  recipeData: Map<string, RecipeGraphData>
): { handled: boolean; handledByRecipeName?: string } {
  const plannedRecipeIds = new Set(plannedMeals.map((m) => m.recipe));

  // Direct check: sourceRecipeId is in this week's plan
  if (item.sourceRecipeId && plannedRecipeIds.has(item.sourceRecipeId)) {
    return { handled: true, handledByRecipeName: item.sourceRecipeName };
  }

  // Runtime cross-reference: check if any planned batch_prep recipe's product
  // nodes contain the inventory product
  for (const meal of plannedMeals) {
    const recipe = meal.expand?.recipe;
    if (recipe?.recipe_type !== "batch_prep") continue;

    const data = recipeData.get(meal.id);
    if (!data) continue;

    for (const node of data.productNodes) {
      const product = node.expand?.product;
      if (product?.id === item.productId && product?.type === ProductType.Inventory) {
        return { handled: true, handledByRecipeName: recipe.name };
      }
    }
  }

  return { handled: false };
}

export function OutOfStockSection({
  stockWarnings,
  plannedMeals,
  recipeData,
  onAddRecipeToPlan,
  onAddToShoppingList,
}: OutOfStockSectionProps) {
  const outOfStockItems = stockWarnings.filter((w) => !w.inStock);

  // Deduplicate by productId (same product can appear in multiple recipes)
  const uniqueItems = Array.from(
    outOfStockItems
      .reduce((map, item) => {
        if (!map.has(item.productId)) {
          map.set(item.productId, item);
        }
        return map;
      }, new Map<string, InventoryStockWarning>())
      .values()
  );

  if (uniqueItems.length === 0) return null;

  return (
    <Box mb={3}>
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        {UI_TEXT.outOfStockSectionTitle}
      </Typography>
      <List dense>
        {uniqueItems.map((item) => {
          const { handled, handledByRecipeName } = isItemHandled(
            item,
            plannedMeals,
            recipeData
          );

          const usedInRecipes = outOfStockItems
            .filter((w) => w.productId === item.productId)
            .map((w) => w.recipeName);

          if (handled) {
            return (
              <ListItem
                key={item.productId}
                sx={{
                  backgroundColor: "#e8f5e9",
                  borderRadius: 1,
                  mb: 1,
                }}
              >
                <CheckIcon
                  sx={{ color: "#4caf50", mr: 1, fontSize: "1.2rem" }}
                />
                <ListItemText
                  primary={item.productName}
                  secondary={`${UI_TEXT.outOfStockHandled} (${handledByRecipeName})`}
                />
              </ListItem>
            );
          }

          const hasSourceRecipe = !!item.sourceRecipeId;
          const hasStoreBought = !!item.storeBoughtProductId;
          const hasNoResolution = !hasSourceRecipe && !hasStoreBought;

          return (
            <ListItem
              key={item.productId}
              sx={{
                backgroundColor: "#fff8e1",
                borderRadius: 1,
                mb: 1,
                flexDirection: "column",
                alignItems: "flex-start",
              }}
            >
              <ListItemText
                primary={item.productName}
                secondary={`Used in: ${usedInRecipes.join(", ")}`}
              />
              <Box display="flex" gap={1} mt={0.5}>
                {hasSourceRecipe && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => onAddRecipeToPlan(item.sourceRecipeId!)}
                  >
                    {UI_TEXT.outOfStockAddRecipe}: {item.sourceRecipeName}
                  </Button>
                )}
                {hasStoreBought && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<CartIcon />}
                    onClick={() =>
                      onAddToShoppingList(
                        item.storeBoughtProductId!,
                        item.storeBoughtProductName!
                      )
                    }
                  >
                    {UI_TEXT.outOfStockAddToShoppingList}: {item.storeBoughtProductName}
                  </Button>
                )}
                {hasNoResolution && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                    {UI_TEXT.outOfStockNoResolution}
                  </Typography>
                )}
              </Box>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
