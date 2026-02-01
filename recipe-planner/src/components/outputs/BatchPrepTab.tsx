import { useRef } from "react";
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
import { useReactToPrint } from "react-to-print";
import type { AggregatedStep } from "../../lib/aggregation";
import { EmptyState } from "../EmptyState";
import {
  UI_TEXT,
  OUTPUT_TAB_LABELS,
  OutputTab,
  getBatchPrepCheckboxKey,
  STEP_TYPE_LABELS,
} from "../../constants/outputs";
import { StepType } from "../../lib/types";
import { BatchPrepPrintView } from "./BatchPrepPrintView";

interface BatchPrepTabProps {
  batchPrepSteps: AggregatedStep[];
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
}

export function BatchPrepTab({
  batchPrepSteps,
  checkedItems,
  onToggleChecked,
}: BatchPrepTabProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Batch Prep List",
    pageStyle: `
      @page {
        margin: 0.5in;
      }
    `,
  });

  if (batchPrepSteps.length === 0) {
    return <EmptyState message={UI_TEXT.noPrepSteps} />;
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
        <Typography variant="h6">
          {OUTPUT_TAB_LABELS[OutputTab.BatchPrep]}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => handlePrint()}
          startIcon={<PrintIcon />}
        >
          {UI_TEXT.printList}
        </Button>
      </Box>

      <List>
        {batchPrepSteps.map((step, idx) => {
          const key = getBatchPrepCheckboxKey(step.stepId);
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
                      label={STEP_TYPE_LABELS[step.stepType]}
                      size="small"
                      sx={{ ml: 1 }}
                      color={
                        step.stepType === StepType.Assembly
                          ? "secondary"
                          : "error"
                      }
                    />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {UI_TEXT.inputsLabel}{" "}
                    {step.inputs.length > 0
                      ? step.inputs
                          .map(
                            (i) =>
                              `${i.productName}${
                                i.quantity ? ` (${i.quantity} ${i.unit})` : ""
                              }`
                          )
                          .join(", ")
                      : UI_TEXT.noneLabel}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {UI_TEXT.outputsLabel}{" "}
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
                      : UI_TEXT.noneLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {UI_TEXT.fromLabel} {step.recipeName}
                  </Typography>
                </Box>
              </Box>
              {idx < batchPrepSteps.length - 1 && <Divider sx={{ mt: 2 }} />}
            </ListItem>
          );
        })}
      </List>

      {/* Hidden print view */}
      <Box sx={{ display: "none" }}>
        <BatchPrepPrintView ref={printRef} batchPrepSteps={batchPrepSteps} />
      </Box>
    </>
  );
}