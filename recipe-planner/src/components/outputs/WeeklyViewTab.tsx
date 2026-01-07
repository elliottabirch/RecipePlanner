import { useRef } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Print as PrintIcon } from "@mui/icons-material";
import { useReactToPrint } from "react-to-print";
import type {
  RecipeGraphData,
  PlannedMealWithRecipe,
  MealContainer,
  PullListMeal,
} from "../../lib/aggregation";
import type { Tag, Product } from "../../lib/types";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { MicahMealsByTag } from "./MicahMealsByTag";
import { WeeklyPrintView } from "./WeeklyPrintView";

interface WeeklyViewTabProps {
  plannedMeals: PlannedMealWithRecipe[];
  recipeData: Map<string, RecipeGraphData>;
  recipeTags: Map<string, string[]>;
  tagsById: Map<string, Tag>;
  isMicahMeal: (meal: PlannedMealWithRecipe) => boolean;
  readyToEat: { meals: Product[]; snacks: Product[] };
  micahMealContainers: MealContainer[];
  pullLists: PullListMeal[];
}

export function WeeklyViewTab({
  plannedMeals,
  recipeData,
  recipeTags,
  tagsById,
  isMicahMeal,
  readyToEat,
  micahMealContainers,
  pullLists,
}: WeeklyViewTabProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Weekly Meal Plan",
    pageStyle: `
      @page {
        margin: 0.5in;
      }
    `,
  });

  return (
    <>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">Weekly Calendar</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
          className="no-print"
        >
          Print Weekly View
        </Button>
      </Box>

      <WeeklyCalendar
        plannedMeals={plannedMeals}
        recipeData={recipeData}
        isMicahMeal={isMicahMeal}
        readyToEat={readyToEat}
      />

      <MicahMealsByTag
        plannedMeals={plannedMeals}
        recipeTags={recipeTags}
        tagsById={tagsById}
        mealContainers={micahMealContainers}
      />

      {/* Hidden component for printing */}
      <Box sx={{ display: "none" }}>
        <WeeklyPrintView
          ref={printRef}
          plannedMeals={plannedMeals}
          recipeData={recipeData}
          recipeTags={recipeTags}
          tagsById={tagsById}
          isMicahMeal={isMicahMeal}
          readyToEat={readyToEat}
          micahMealContainers={micahMealContainers}
          pullLists={pullLists}
        />
      </Box>
    </>
  );
}
