import { useMemo } from "react";
import { Box, Typography, Button, List } from "@mui/material";
import { ContentCopy as ContentCopyIcon } from "@mui/icons-material";
import type { AggregatedProduct, InventoryStockWarning, RecipeGraphData, PlannedMealWithRecipe } from "../../lib/aggregation";
import { CheckableListItem } from "../CheckableListItem";
import { EmptyState } from "../EmptyState";
import { OutOfStockSection } from "./OutOfStockSection";
import {
  UI_TEXT,
  getPantryCheckboxKey,
  getShoppingCheckboxKey,
} from "../../constants/outputs";

interface GroupedShoppingList {
  byStore: Map<string, Map<string, AggregatedProduct[]>>;
  pantryItems: AggregatedProduct[];
}

export interface ManualShoppingItem {
  productId: string;
  productName: string;
  storeName?: string;
  sectionName?: string;
}

const UNCATEGORIZED_STORE = "Other";
const UNCATEGORIZED_SECTION = "Uncategorized";

function mergeManualItemsIntoGroups(
  byStore: Map<string, Map<string, AggregatedProduct[]>>,
  manualItems: ManualShoppingItem[]
): Map<string, Map<string, AggregatedProduct[]>> {
  if (manualItems.length === 0) return byStore;

  const merged = new Map(
    Array.from(byStore.entries()).map(([store, sections]) => [
      store,
      new Map(
        Array.from(sections.entries()).map(([section, items]) => [
          section,
          [...items],
        ])
      ),
    ])
  );

  for (const item of manualItems) {
    const storeName = item.storeName || UNCATEGORIZED_STORE;
    const sectionName = item.sectionName || UNCATEGORIZED_SECTION;

    if (!merged.has(storeName)) {
      merged.set(storeName, new Map());
    }
    const sections = merged.get(storeName)!;
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)!.push({
      productId: `manual-${item.productId}`,
      productName: item.productName,
      productType: "raw" as AggregatedProduct["productType"],
      isPantry: false,
      totalQuantity: 1,
      unit: "",
      sources: [{ recipeName: "Store-bought", quantity: 1, unit: "" }],
    });
  }

  return merged;
}

interface ShoppingListTabProps {
  groupedShoppingList: GroupedShoppingList;
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
  onExport: () => void;
  stockWarnings?: InventoryStockWarning[];
  plannedMeals?: PlannedMealWithRecipe[];
  recipeData?: Map<string, RecipeGraphData>;
  onAddRecipeToPlan?: (recipeId: string) => void;
  onAddToShoppingList?: (item: ManualShoppingItem) => void;
  manualShoppingItems?: ManualShoppingItem[];
}

export function ShoppingListTab({
  groupedShoppingList,
  checkedItems,
  onToggleChecked,
  onExport,
  stockWarnings,
  plannedMeals,
  recipeData,
  onAddRecipeToPlan,
  onAddToShoppingList,
  manualShoppingItems,
}: ShoppingListTabProps) {
  const hasOutOfStock = stockWarnings?.some((w) => !w.inStock) ?? false;

  const mergedByStore = useMemo(
    () =>
      mergeManualItemsIntoGroups(
        groupedShoppingList.byStore,
        manualShoppingItems || []
      ),
    [groupedShoppingList.byStore, manualShoppingItems]
  );

  const hasItems =
    mergedByStore.size > 0 ||
    groupedShoppingList.pantryItems.length > 0 ||
    hasOutOfStock;

  if (!hasItems) {
    return <EmptyState message={UI_TEXT.noShoppingItems} />;
  }

  return (
    <>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">{UI_TEXT.shoppingListTitle}</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={onExport}
          startIcon={<ContentCopyIcon />}
        >
          {UI_TEXT.copyToClipboard}
        </Button>
      </Box>

      {/* Out of Stock Inventory Items */}
      {hasOutOfStock &&
        stockWarnings &&
        plannedMeals &&
        recipeData &&
        onAddRecipeToPlan &&
        onAddToShoppingList && (
          <OutOfStockSection
            stockWarnings={stockWarnings}
            plannedMeals={plannedMeals}
            recipeData={recipeData}
            onAddRecipeToPlan={onAddRecipeToPlan}
            onAddToShoppingList={onAddToShoppingList}
          />
        )}

      {/* Items by Store/Section */}
      {Array.from(mergedByStore.entries()).map(
        ([storeName, sections]) => (
          <Box key={storeName} mb={3}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {storeName}
            </Typography>
            {Array.from(sections.entries()).map(([sectionName, items]) => {
              const visibleItems = items.filter((item) => {
                if (item.isPantry) {
                  const pantryKey = getPantryCheckboxKey(item.productId);
                  return !checkedItems.has(pantryKey);
                }
                return true;
              });

              if (visibleItems.length === 0) return null;

              return (
                <Box key={sectionName} ml={2} mb={2}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    gutterBottom
                  >
                    {sectionName}
                  </Typography>
                  <List dense>
                    {visibleItems.map((item) => {
                      const key = getShoppingCheckboxKey(item.productId);
                      const primary = item.totalQuantity && item.unit
                        ? `${item.productName} — ${item.totalQuantity} ${item.unit}`
                        : item.productName;
                      const secondary = item.sources
                        .map((s) => s.recipeName)
                        .join(", ");

                      return (
                        <CheckableListItem
                          key={item.productId}
                          itemKey={key}
                          checked={checkedItems.has(key)}
                          onToggle={onToggleChecked}
                          primary={primary}
                          secondary={secondary}
                          disablePadding
                        />
                      );
                    })}
                  </List>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* Pantry Check Section */}
      {groupedShoppingList.pantryItems.length > 0 && (
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            {UI_TEXT.pantryCheckTitle}
          </Typography>
          <List dense>
            {groupedShoppingList.pantryItems.map((item) => {
              const key = getPantryCheckboxKey(item.productId);
              const showQuantity = item.trackQuantity;
              const primary = showQuantity
                ? `${item.productName} — ${item.totalQuantity} ${item.unit}`
                : item.productName;
              const secondary = showQuantity
                ? item.sources.map((s) => s.recipeName).join(", ")
                : undefined;

              return (
                <CheckableListItem
                  key={item.productId}
                  itemKey={key}
                  checked={checkedItems.has(key)}
                  onToggle={onToggleChecked}
                  primary={primary}
                  secondary={secondary}
                  disablePadding
                />
              );
            })}
          </List>
        </Box>
      )}
    </>
  );
}
