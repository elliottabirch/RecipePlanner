import { Box, Typography, List } from "@mui/material";
import type { StoredItem } from "../../lib/aggregation";
import { CheckableListItem } from "../CheckableListItem";
import { EmptyState } from "../EmptyState";

interface FridgeFreezerTabProps {
  storedItems: StoredItem[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
}

export function FridgeFreezerTab({
  storedItems,
  checkedItems,
  onToggleChecked,
}: FridgeFreezerTabProps) {
  if (storedItems.length === 0) {
    return (
      <EmptyState message="No stored items. Make sure your recipes have stored product nodes as outputs from steps." />
    );
  }

  return (
    <>
      {(["fridge", "freezer", "dry"] as const).map((location) => {
        const items = storedItems.filter((i) => i.storageLocation === location);
        if (items.length === 0) return null;

        return (
          <Box key={location} mb={3}>
            <Typography
              variant="subtitle1"
              fontWeight="bold"
              textTransform="uppercase"
              gutterBottom
            >
              {location === "dry" ? "Dry Storage" : location}
            </Typography>
            <List dense>
              {items.map((item, idx) => {
                const key = `stored-${location}-${idx}`;
                const primary = (
                  <>
                    {item.productName}
                    {item.quantity && ` — ${item.quantity} ${item.unit}`}
                  </>
                );
                const secondary = (
                  <>
                    {item.containerTypeName &&
                      `Container: ${item.containerTypeName}`}
                    {item.containerTypeName && item.mealDestination && " • "}
                    {item.mealDestination && `For: ${item.mealDestination}`}
                    {(item.containerTypeName || item.mealDestination) && " • "}
                    From: {item.recipeName}
                  </>
                );

                return (
                  <CheckableListItem
                    key={key}
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
    </>
  );
}
