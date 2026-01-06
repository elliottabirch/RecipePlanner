import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from "@mui/material";
import type { PullListMeal } from "../../lib/aggregation";
import { DAYS, MEAL_SLOTS, SLOT_COLORS } from "../../constants/mealPlanning";
import { EmptyState } from "../EmptyState";

interface PullListsTabProps {
  pullLists: PullListMeal[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
}

export function PullListsTab({
  pullLists,
  checkedItems,
  onToggleChecked,
}: PullListsTabProps) {
  if (pullLists.length === 0) {
    return (
      <EmptyState message='No just-in-time meals. Make sure your recipes have assembly steps with timing set to "just_in_time".' />
    );
  }

  return (
    <>
      {pullLists.map((pullList, idx) => {
        const dayLabel =
          DAYS.find((d) => d.value === pullList.day)?.label || pullList.day;
        const slotLabel =
          MEAL_SLOTS.find((s) => s.value === pullList.slot)?.label ||
          pullList.slot;

        return (
          <Card key={idx} variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Chip
                  label={slotLabel}
                  size="small"
                  sx={{
                    backgroundColor: SLOT_COLORS[pullList.slot],
                    color: "white",
                  }}
                />
                <Typography variant="subtitle1" fontWeight="bold">
                  {dayLabel}: {pullList.recipeName}
                </Typography>
              </Box>

              {(["fridge", "freezer", "pantry", "dry"] as const).map(
                (storage) => {
                  const items = pullList.items.filter(
                    (i) => i.fromStorage === storage
                  );
                  if (items.length === 0) return null;

                  return (
                    <Box key={storage} ml={1} mb={1}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        textTransform="uppercase"
                      >
                        From {storage}:
                      </Typography>
                      <List dense disablePadding>
                        {items.map((item, itemIdx) => {
                          const key = `pull-${idx}-${storage}-${itemIdx}`;
                          return (
                            <ListItem key={itemIdx} disablePadding>
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
                                    }}
                                  >
                                    {item.productName}
                                    {item.quantity &&
                                      ` — ${item.quantity} ${item.unit}`}
                                    {item.containerTypeName &&
                                      ` (${item.containerTypeName})`}
                                  </Typography>
                                }
                              />
                            </ListItem>
                          );
                        })}
                      </List>
                    </Box>
                  );
                }
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
