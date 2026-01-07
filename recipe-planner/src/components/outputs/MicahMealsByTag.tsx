import { Box, Typography, Chip, Tooltip, Paper } from "@mui/material";
import type { ReactElement } from "react";
import type {
  PlannedMealWithRecipe,
  MealContainer,
} from "../../lib/aggregation";
import type { Tag } from "../../lib/types";
import {
  getContainerIcon,
  CONTAINER_LEGEND_ITEMS,
} from "../../constants/containerIcons";

interface MicahMealsByTagProps {
  plannedMeals: PlannedMealWithRecipe[];
  recipeTags: Map<string, string[]>;
  tagsById: Map<string, Tag>;
  mealContainers: MealContainer[];
}

export function MicahMealsByTag({
  plannedMeals,
  recipeTags,
  tagsById,
  mealContainers,
}: MicahMealsByTagProps) {
  const micahMeals = plannedMeals.filter((m) => m.meal_slot === "micah");

  if (micahMeals.length === 0) {
    return null;
  }

  // Create a map of recipe name to meal containers
  const containersByRecipe = new Map<string, MealContainer>();
  mealContainers.forEach((container) => {
    containersByRecipe.set(container.recipeName, container);
  });

  // Group Micah meals by tag
  const tagGroups = new Map<string, PlannedMealWithRecipe[]>();

  micahMeals.forEach((meal) => {
    const tags = recipeTags.get(meal.recipe) || [];
    if (tags.length === 0) {
      // Add to "Untagged" group
      if (!tagGroups.has("untagged")) {
        tagGroups.set("untagged", []);
      }
      tagGroups.get("untagged")!.push(meal);
    } else {
      // Add to each tag group
      tags.forEach((tagId) => {
        if (!tagGroups.has(tagId)) {
          tagGroups.set(tagId, []);
        }
        tagGroups.get(tagId)!.push(meal);
      });
    }
  });

  return (
    <Box mt={3}>
      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
        Micah Meals (by tag)
      </Typography>

      {/* Container Icon Legend */}
      <Paper
        elevation={0}
        sx={{
          p: 1,
          mb: 1.5,
          backgroundColor: "#f5f5f5",
          border: "1px solid #e0e0e0",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <Typography
            variant="caption"
            sx={{ fontWeight: "bold", fontSize: "0.7rem" }}
          >
            Icons:
          </Typography>
          {CONTAINER_LEGEND_ITEMS.map((item, idx) => (
            <Box key={idx} display="flex" alignItems="center" gap={0.3}>
              <Box
                display="flex"
                alignItems="center"
                sx={{ fontSize: "0.8rem" }}
              >
                {item.icon}
              </Box>
              <Typography variant="caption" sx={{ fontSize: "0.65rem" }}>
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      {Array.from(tagGroups.entries()).map(([tagId, meals]) => {
        const tagName =
          tagId === "untagged"
            ? "Untagged"
            : tagsById.get(tagId)?.name || "Unknown Tag";
        const tagColor =
          tagId === "untagged"
            ? "#9e9e9e"
            : tagsById.get(tagId)?.color || "#00bcd4";

        return (
          <Box key={tagId} mb={2}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {tagName}:
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1} ml={2}>
              {meals.map((meal) => {
                const recipeName = meal.expand?.recipe?.name || "Unknown";
                const mealContainer = containersByRecipe.get(recipeName);

                // Collect all container icons (one per container instance)
                const containerIcons: Array<{
                  icon: ReactElement;
                  label: string;
                }> = [];
                if (mealContainer) {
                  mealContainer.containers.forEach((container) => {
                    const iconInfo = getContainerIcon(
                      container.containerTypeName
                    );
                    // Add one icon per quantity of this container
                    const quantity = container.quantity || 1;
                    for (let i = 0; i < quantity; i++) {
                      containerIcons.push(iconInfo);
                    }
                  });
                }

                return (
                  <Chip
                    key={`${tagId}-${meal.id}`}
                    label={
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <span>
                          {recipeName}
                          {meal.quantity && meal.quantity > 1
                            ? ` (×${meal.quantity})`
                            : ""}
                        </span>
                        {containerIcons.length > 0 && (
                          <Box display="flex" gap={0.25} ml={0.5}>
                            {containerIcons.map((containerIcon, idx) => (
                              <Tooltip
                                key={idx}
                                title={containerIcon.label}
                                arrow
                              >
                                <Box
                                  display="flex"
                                  alignItems="center"
                                  sx={{ opacity: 0.9 }}
                                >
                                  {containerIcon.icon}
                                </Box>
                              </Tooltip>
                            ))}
                          </Box>
                        )}
                      </Box>
                    }
                    sx={{
                      backgroundColor: tagColor,
                      color: "white",
                    }}
                  />
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
