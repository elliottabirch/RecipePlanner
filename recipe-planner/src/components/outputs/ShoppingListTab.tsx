import { Box, Typography, Button, List } from "@mui/material";
import { ContentCopy as ContentCopyIcon } from "@mui/icons-material";
import type { AggregatedProduct } from "../../lib/aggregation";
import { CheckableListItem } from "../CheckableListItem";
import { EmptyState } from "../EmptyState";

interface GroupedShoppingList {
  byStore: Map<string, Map<string, AggregatedProduct[]>>;
  pantryItems: AggregatedProduct[];
}

interface ShoppingListTabProps {
  groupedShoppingList: GroupedShoppingList;
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
  onExport: () => void;
}

export function ShoppingListTab({
  groupedShoppingList,
  checkedItems,
  onToggleChecked,
  onExport,
}: ShoppingListTabProps) {
  const hasItems =
    groupedShoppingList.byStore.size > 0 ||
    groupedShoppingList.pantryItems.length > 0;

  if (!hasItems) {
    return (
      <EmptyState message="No items to shop for. Make sure your recipes have raw product nodes connected to steps." />
    );
  }

  return (
    <>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">Shopping List</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={onExport}
          startIcon={<ContentCopyIcon />}
        >
          Copy to Clipboard
        </Button>
      </Box>

      {/* Items by Store/Section */}
      {Array.from(groupedShoppingList.byStore.entries()).map(
        ([storeName, sections]) => (
          <Box key={storeName} mb={3}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {storeName}
            </Typography>
            {Array.from(sections.entries()).map(([sectionName, items]) => {
              // Filter out pantry items checked in the pantry section
              const visibleItems = items.filter((item) => {
                if (item.isPantry) {
                  const pantryKey = `pantry-${item.productId}`;
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
                      const key = `shop-${item.productId}`;
                      const primary = `${item.productName} — ${item.totalQuantity} ${item.unit}`;
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
            Pantry Check
          </Typography>
          <List dense>
            {groupedShoppingList.pantryItems.map((item) => {
              const key = `pantry-${item.productId}`;
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
