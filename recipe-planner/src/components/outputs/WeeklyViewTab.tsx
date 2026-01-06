import {
  Box,
  Typography,
  Paper,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
} from "../../lib/aggregation";
import { isRecipePerishable } from "../../lib/aggregation";
import type { Tag, Product } from "../../lib/types";
import { DAYS, MEAL_SLOTS, SLOT_COLORS } from "../../constants/mealPlanning";

interface WeeklyViewTabProps {
  plannedMeals: PlannedMealWithRecipe[];
  recipeData: Map<string, RecipeGraphData>;
  recipeTags: Map<string, string[]>;
  tagsById: Map<string, Tag>;
  isMicahMeal: (meal: PlannedMealWithRecipe) => boolean;
  readyToEat: { meals: Product[]; snacks: Product[] };
}

export function WeeklyViewTab({
  plannedMeals,
  recipeData,
  recipeTags,
  tagsById,
  isMicahMeal,
  readyToEat,
}: WeeklyViewTabProps) {
  return (
    <>
      <Typography variant="h6" gutterBottom>
        Weekly Calendar
      </Typography>

      {/* Week-spanning Section */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: "grey.50" }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: "bold" }}>
          WEEK-SPANNING
        </Typography>

        {/* MEALS Section */}
        <Box mb={2}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ textTransform: "uppercase", fontWeight: "bold" }}
          >
            MEALS
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {/* Week-spanning planned meals (not snacks, not batch_prep) */}
            {plannedMeals
              .filter(
                (m) =>
                  !m.day && m.meal_slot !== "snack" && m.meal_slot !== "micah"
              )
              .filter((m) => {
                const data = recipeData.get(m.recipe);
                return data?.recipe.recipe_type !== "batch_prep";
              })
              .map((meal) => {
                const data = recipeData.get(meal.recipe);
                const isPerishable = data ? isRecipePerishable(data) : false;
                return (
                  <Chip
                    key={meal.id}
                    label={meal.expand?.recipe?.name || "Unknown"}
                    sx={{
                      backgroundColor: SLOT_COLORS[meal.meal_slot],
                      color: "white",
                      opacity: isPerishable ? 1 : 0.5,
                      fontWeight: isPerishable ? "bold" : "normal",
                    }}
                  />
                );
              })}
            {/* Ready-to-eat inventory meals */}
            {readyToEat.meals.map((product) => (
              <Chip
                key={product.id}
                label={product.name}
                sx={{
                  backgroundColor: "#e8f5e9",
                  color: "#2e7d32",
                  border: "1px solid #a5d6a7",
                }}
              />
            ))}
          </Box>
        </Box>

        {/* SNACKS Section */}
        <Box>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
            sx={{ textTransform: "uppercase", fontWeight: "bold" }}
          >
            SNACKS
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {/* Week-spanning planned snacks (not batch_prep) */}
            {plannedMeals
              .filter((m) => !m.day && m.meal_slot === "snack")
              .filter((m) => {
                const data = recipeData.get(m.recipe);
                return data?.recipe.recipe_type !== "batch_prep";
              })
              .map((meal) => {
                const data = recipeData.get(meal.recipe);
                const isPerishable = data ? isRecipePerishable(data) : false;
                return (
                  <Chip
                    key={meal.id}
                    label={meal.expand?.recipe?.name || "Unknown"}
                    size="small"
                    sx={{
                      backgroundColor: SLOT_COLORS[meal.meal_slot],
                      color: "white",
                      opacity: isPerishable ? 1 : 0.5,
                      fontWeight: isPerishable ? "bold" : "normal",
                    }}
                  />
                );
              })}
            {/* Ready-to-eat inventory snacks */}
            {readyToEat.snacks.map((product) => (
              <Chip
                key={product.id}
                label={product.name}
                size="small"
                sx={{
                  backgroundColor: "#f3e5f5",
                  color: "#7b1fa2",
                  border: "1px solid #ce93d8",
                }}
              />
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Day Grid */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold", width: 100 }}>
                Slot
              </TableCell>
              {DAYS.map((day) => (
                <TableCell
                  key={day.value}
                  align="center"
                  sx={{ fontWeight: "bold" }}
                >
                  {day.label.slice(0, 3)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {MEAL_SLOTS.filter((s) => s.value !== "micah").map((slot) => (
              <TableRow key={slot.value}>
                <TableCell>
                  <Chip
                    label={slot.label}
                    size="small"
                    sx={{
                      backgroundColor: SLOT_COLORS[slot.value],
                      color: "white",
                    }}
                  />
                </TableCell>
                {DAYS.map((day) => {
                  const meals = plannedMeals.filter(
                    (m) =>
                      m.day === day.value &&
                      m.meal_slot === slot.value &&
                      slot.value !== "micah"
                  );

                  // Filter to only include meal recipes (not batch_prep)
                  const mealRecipes = meals.filter((m) => {
                    const data = recipeData.get(m.recipe);
                    return data?.recipe.recipe_type !== "batch_prep";
                  });

                  return (
                    <TableCell
                      key={day.value}
                      sx={{
                        verticalAlign: "top",
                        backgroundColor:
                          mealRecipes.length > 0 ? "action.hover" : "inherit",
                        minWidth: 100,
                        p: 0.5,
                      }}
                    >
                      {mealRecipes.map((meal) => {
                        const isMicah = isMicahMeal(meal);
                        const data = recipeData.get(meal.recipe);
                        const isPerishable = data
                          ? isRecipePerishable(data)
                          : false;

                        return (
                          <Box
                            key={meal.id}
                            sx={{
                              fontSize: "0.75rem",
                              p: 0.5,
                              mb: 0.5,
                              backgroundColor: SLOT_COLORS[slot.value],
                              color: "white",
                              borderRadius: 0.5,
                              border: isMicah ? "2px solid #9c27b0" : "none",
                              boxShadow: isMicah
                                ? "0 0 8px rgba(156, 39, 176, 0.6)"
                                : "none",
                              opacity: isPerishable ? 1 : 0.6,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: "inherit",
                                fontWeight:
                                  isMicah || isPerishable ? "bold" : "normal",
                              }}
                            >
                              {isMicah && "⭐ "}
                              {isPerishable && "🥬 "}
                              {meal.expand?.recipe?.name || "?"}
                              {meal.quantity &&
                                meal.quantity > 1 &&
                                ` (×${meal.quantity})`}
                            </Typography>
                          </Box>
                        );
                      })}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Micah meals grouped by tag */}
      {plannedMeals.filter((m) => m.meal_slot === "micah").length > 0 && (
        <Box mt={3}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Micah Meals (by tag)
          </Typography>
          {(() => {
            // Group Micah meals by tag
            const micahMeals = plannedMeals.filter(
              (m) => m.meal_slot === "micah"
            );
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

            return Array.from(tagGroups.entries()).map(([tagId, meals]) => {
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
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    gutterBottom
                  >
                    {tagName}:
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={1} ml={2}>
                    {meals.map((meal) => (
                      <Chip
                        key={`${tagId}-${meal.id}`}
                        label={`${meal.expand?.recipe?.name || "Unknown"}${
                          meal.quantity && meal.quantity > 1
                            ? ` (×${meal.quantity})`
                            : ""
                        }`}
                        sx={{
                          backgroundColor: tagColor,
                          color: "white",
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            });
          })()}
        </Box>
      )}
    </>
  );
}
