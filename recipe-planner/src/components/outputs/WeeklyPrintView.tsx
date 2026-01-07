import { forwardRef } from "react";
import { Box } from "@mui/material";
import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
  MealContainer,
  PullListMeal,
} from "../../lib/aggregation";
import type { Tag, Product } from "../../lib/types";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { MicahMealsByTag } from "./MicahMealsByTag";
import { PullListPrintView } from "./PullListPrintView";

interface WeeklyPrintViewProps {
  plannedMeals: PlannedMealWithRecipe[];
  recipeData: Map<string, RecipeGraphData>;
  recipeTags: Map<string, string[]>;
  tagsById: Map<string, Tag>;
  isMicahMeal: (meal: PlannedMealWithRecipe) => boolean;
  readyToEat: { meals: Product[]; snacks: Product[] };
  micahMealContainers: MealContainer[];
  pullLists: PullListMeal[];
}

export const WeeklyPrintView = forwardRef<HTMLDivElement, WeeklyPrintViewProps>(
  (
    {
      plannedMeals,
      recipeData,
      recipeTags,
      tagsById,
      isMicahMeal,
      readyToEat,
      micahMealContainers,
      pullLists,
    },
    ref
  ) => {
    return (
      <div ref={ref}>
        {/* PAGE 1: Landscape - Weekly Calendar with Week-Spanning Meals */}
        <Box className="print-page print-landscape" sx={{ p: 3 }}>
          <WeeklyCalendar
            plannedMeals={plannedMeals}
            recipeData={recipeData}
            isMicahMeal={isMicahMeal}
            readyToEat={readyToEat}
          />
        </Box>

        {/* PAGE 2: Landscape - Micah's Meals by Tag */}
        <Box
          className="print-page print-landscape"
          sx={{ p: 3, maxWidth: "100%", boxSizing: "border-box" }}
        >
          <Box sx={{ maxWidth: "100%", overflow: "hidden" }}>
            <MicahMealsByTag
              plannedMeals={plannedMeals}
              recipeTags={recipeTags}
              tagsById={tagsById}
              mealContainers={micahMealContainers}
            />
          </Box>
        </Box>

        {/* PAGE 3: Portrait - Pull Lists for Just-in-Time Assembly */}
        <Box
          className="print-page print-landscape"
          sx={{ p: 2, maxWidth: "100%", boxSizing: "border-box" }}
        >
          <PullListPrintView pullLists={pullLists} />
        </Box>
      </div>
    );
  }
);

WeeklyPrintView.displayName = "WeeklyPrintView";
