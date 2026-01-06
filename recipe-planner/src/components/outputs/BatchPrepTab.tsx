import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  Checkbox,
  Divider,
  Chip,
} from "@mui/material";
import { Print as PrintIcon } from "@mui/icons-material";
import type { AggregatedStep } from "../../lib/aggregation";
import { EmptyState } from "../EmptyState";

interface BatchPrepTabProps {
  batchPrepSteps: AggregatedStep[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
  onPrint: () => void;
}

export function BatchPrepTab({
  batchPrepSteps,
  checkedItems,
  onToggleChecked,
  onPrint,
}: BatchPrepTabProps) {
  if (batchPrepSteps.length === 0) {
    return (
      <EmptyState message="No prep steps. Make sure your recipes have prep or batch assembly steps." />
    );
  }

  return (
    <>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
        className="no-print"
      >
        <Typography variant="h6">Batch Prep List</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={onPrint}
          startIcon={<PrintIcon />}
        >
          Print
        </Button>
      </Box>

      <List>
        {batchPrepSteps.map((step, idx) => {
          const key = `prep-${step.stepId}`;
          return (
            <ListItem
              key={step.stepId}
              disablePadding
              sx={{ mb: 2, display: "block" }}
            >
              <Box display="flex" alignItems="flex-start">
                <Checkbox
                  checked={checkedItems.has(key)}
                  onChange={() => onToggleChecked(key)}
                  sx={{ mt: -0.5 }}
                />
                <Box flex={1}>
                  <Typography
                    fontWeight="medium"
                    sx={{
                      textDecoration: checkedItems.has(key)
                        ? "line-through"
                        : "none",
                    }}
                  >
                    {step.name}
                    <Chip
                      label={step.stepType}
                      size="small"
                      sx={{ ml: 1 }}
                      color={step.stepType === "prep" ? "secondary" : "error"}
                    />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Inputs:{" "}
                    {step.inputs.length > 0
                      ? step.inputs
                          .map(
                            (i) =>
                              `${i.productName}${
                                i.quantity ? ` (${i.quantity} ${i.unit})` : ""
                              }`
                          )
                          .join(", ")
                      : "None"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Outputs:{" "}
                    {step.outputs.length > 0
                      ? step.outputs
                          .map(
                            (o) =>
                              `${o.productName}${
                                o.quantity ? ` (${o.quantity} ${o.unit})` : ""
                              }${
                                o.mealDestination
                                  ? ` → ${o.mealDestination}`
                                  : ""
                              }`
                          )
                          .join(", ")
                      : "None"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    From: {step.recipeName}
                  </Typography>
                </Box>
              </Box>
              {idx < batchPrepSteps.length - 1 && <Divider sx={{ mt: 2 }} />}
            </ListItem>
          );
        })}
      </List>
    </>
  );
}
