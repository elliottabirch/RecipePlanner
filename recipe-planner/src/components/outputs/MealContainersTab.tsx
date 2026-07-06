import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from "@mui/material";
import type { MealContainer } from "../../lib/aggregation";
import { EmptyState } from "../EmptyState";
import { getContainerCheckboxKey } from "../../constants/outputs";

interface MealContainersTabProps {
  mealContainers: MealContainer[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
}

export function MealContainersTab({
  mealContainers,
  checkedItems,
  onToggleChecked,
}: MealContainersTabProps) {
  if (mealContainers.length === 0) {
    return (
      <EmptyState message="No meal containers. Make sure your recipes have stored products with meal destinations specified." />
    );
  }

  return (
    <>
      {mealContainers.map((meal, idx) => (
        <Card key={idx} variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {meal.recipeName}
            </Typography>

            {/* Group by storage location */}
            {(["fridge", "freezer", "dry"] as const).map((location) => {
              const containers = meal.containers.filter(
                (c) => c.storageLocation === location
              );
              if (containers.length === 0) return null;

              return (
                <Box key={location} mb={2}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    textTransform="uppercase"
                    gutterBottom
                  >
                    In {location}:
                  </Typography>
                  <List dense disablePadding>
                    {containers.map((container) => {
                      const key = getContainerCheckboxKey(container.lineId);
                      return (
                        <ListItem
                          key={key}
                          disablePadding
                          sx={{ ml: 2, mb: 1 }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 48,
                              minHeight: 48,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Checkbox
                              edge="start"
                              checked={checkedItems.has(key)}
                              onChange={() => onToggleChecked(key)}
                              size="medium"
                              sx={{ p: 1.5 }}
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Typography
                                variant="body2"
                                sx={{
                                  textDecoration: checkedItems.has(key)
                                    ? "line-through"
                                    : "none",
                                }}
                              >
                                {container.quantity &&
                                  `${container.quantity}× `}
                                {container.productName}
                                {container.containerTypeName &&
                                  ` (${container.containerTypeName})`}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
