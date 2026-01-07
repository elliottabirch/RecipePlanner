import { Box, Typography, Chip } from "@mui/material";
import type { PullListMeal } from "../../lib/aggregation";
import { DAYS, MEAL_SLOTS } from "../../constants/mealPlanning";
import { getContainerIcon } from "../../constants/containerIcons";

// Storage location color scheme for chip backgrounds
const STORAGE_COLORS = {
  fridge: "#E3F2FD", // Light blue for fridge
  freezer: "#B3E5FC", // Lighter blue for freezer
  pantry: "#FFF9C4", // Light yellow for pantry
  dry: "#F5F5F5", // Light gray for dry storage
} as const;

interface PullListPrintViewProps {
  pullLists: PullListMeal[];
}

export function PullListPrintView({ pullLists }: PullListPrintViewProps) {
  if (pullLists.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography color="text.secondary" variant="body2">
          No just-in-time meals scheduled
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 2, fontWeight: "bold" }}>
        Pull Lists - Just-in-Time Assembly
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 1.5,
          mb: 2,
        }}
      >
        {pullLists.map((pullList, idx) => {
          const dayLabel =
            DAYS.find((d) => d.value === pullList.day)?.label || pullList.day;
          const slotLabel =
            MEAL_SLOTS.find((s) => s.value === pullList.slot)?.label ||
            pullList.slot;

          return (
            <Box
              key={idx}
              sx={{
                border: "1px solid #e0e0e0",
                borderRadius: 1,
                p: 1,
                backgroundColor: "#fafafa",
              }}
            >
              {/* Meal Header */}
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: "bold",
                  mb: 0.5,
                  fontSize: "0.85rem",
                }}
              >
                {dayLabel} {slotLabel}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mb: 1,
                  fontSize: "0.8rem",
                  color: "text.secondary",
                }}
              >
                {pullList.recipeName}
              </Typography>

              {/* Items grouped by storage */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {(["fridge", "freezer", "pantry", "dry"] as const).map(
                  (storage) => {
                    const items = pullList.items.filter(
                      (i) => i.fromStorage === storage
                    );
                    if (items.length === 0) return null;

                    return (
                      <Box key={storage}>
                        {items.map((item, itemIdx) => {
                          const { icon } = getContainerIcon(
                            item.containerTypeName
                          );

                          return (
                            <Chip
                              key={itemIdx}
                              icon={icon}
                              label={
                                <>
                                  <strong>{item.productName}</strong>
                                  {item.quantity &&
                                    ` — ${item.quantity} ${item.unit}`}
                                </>
                              }
                              size="small"
                              sx={{
                                backgroundColor: STORAGE_COLORS[storage],
                                border: "1px solid #ccc",
                                mb: 0.5,
                                mr: 0.5,
                                height: "auto",
                                minHeight: "24px",
                                "& .MuiChip-label": {
                                  display: "block",
                                  whiteSpace: "normal",
                                  padding: "4px 8px",
                                  fontSize: "0.75rem",
                                },
                                "& .MuiChip-icon": {
                                  marginLeft: "4px",
                                },
                              }}
                            />
                          );
                        })}
                      </Box>
                    );
                  }
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Box
        sx={{
          mt: 2,
          pt: 1,
          borderTop: "1px solid #e0e0e0",
          display: "flex",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: "bold", mr: 1 }}>
          Storage Locations:
        </Typography>
        {Object.entries(STORAGE_COLORS).map(([location, color]) => (
          <Box key={location} sx={{ display: "flex", alignItems: "center" }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                backgroundColor: color,
                border: "1px solid #ccc",
                borderRadius: 0.5,
                mr: 0.5,
              }}
            />
            <Typography variant="caption" sx={{ textTransform: "capitalize" }}>
              {location}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
