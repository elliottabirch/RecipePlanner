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

interface MicahMealsTabProps {
  micahMealContainers: MealContainer[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
}

export function MicahMealsTab({
  micahMealContainers,
  checkedItems,
  onToggleChecked,
}: MicahMealsTabProps) {
  if (micahMealContainers.length === 0) {
    return (
      <EmptyState message='No Micah meals found. Tag recipes with "Micah Meal" to see them here.' />
    );
  }

  return (
    <>
      {micahMealContainers.map((meal, idx) => (
        <Card
          key={idx}
          variant="outlined"
          sx={{ mb: 2, borderColor: "#9c27b0", borderWidth: 2 }}
        >
          <CardContent>
            <Typography variant="h6" gutterBottom color="primary">
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
                    {containers.map((container, containerIdx) => {
                      const key = `micah-container-${idx}-${location}-${containerIdx}`;
                      return (
                        <ListItem
                          key={containerIdx}
                          disablePadding
                          sx={{ ml: 2 }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Checkbox
                              edge="start"
                              checked={checkedItems.has(key)}
                              onChange={() => onToggleChecked(key)}
                              size="small"
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
                                  fontWeight: "bold",
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
