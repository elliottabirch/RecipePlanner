import { forwardRef } from "react";
import { Box, Typography, Divider } from "@mui/material";
import type { AggregatedStep } from "../../lib/aggregation";
import { StepType } from "../../lib/types";

interface BatchPrepPrintViewProps {
  batchPrepSteps: AggregatedStep[];
}

interface AggregatedInput {
  productName: string;
  totalQuantity: number;
  unit: string;
}

interface GroupedSteps {
  inputProduct: string;
  steps: AggregatedStep[];
}

/**
 * Aggregate all inputs across all steps into a single pull list
 */
function aggregateInputs(steps: AggregatedStep[]): AggregatedInput[] {
  const inputMap = new Map<string, AggregatedInput>();

  steps.forEach((step) => {
    step.inputs.forEach((input) => {
      const key = `${input.productName}|${input.unit || ""}`;
      const existing = inputMap.get(key);

      if (existing) {
        existing.totalQuantity += input.quantity || 0;
      } else {
        inputMap.set(key, {
          productName: input.productName,
          totalQuantity: input.quantity || 0,
          unit: input.unit || "",
        });
      }
    });
  });

  return Array.from(inputMap.values()).sort((a, b) =>
    a.productName.localeCompare(b.productName)
  );
}

/**
 * Group steps by their primary input product
 */
function groupStepsByInput(steps: AggregatedStep[]): GroupedSteps[] {
  const groups = new Map<string, AggregatedStep[]>();

  steps.forEach((step) => {
    const primaryInput = step.inputs[0]?.productName || "No Input";
    const existing = groups.get(primaryInput);

    if (existing) {
      existing.push(step);
    } else {
      groups.set(primaryInput, [step]);
    }
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inputProduct, steps]) => ({ inputProduct, steps }));
}

/**
 * Format quantity with unit
 */
function formatQuantity(quantity?: number, unit?: string): string {
  if (!quantity) return "";
  return unit ? `${quantity} ${unit}` : `${quantity}`;
}

export const BatchPrepPrintView = forwardRef<
  HTMLDivElement,
  BatchPrepPrintViewProps
>(({ batchPrepSteps }, ref) => {
  const prepSteps = batchPrepSteps.filter((s) => s.stepType === StepType.Prep);
  const assemblySteps = batchPrepSteps.filter(
    (s) => s.stepType === StepType.Assembly
  );

  const pullList = aggregateInputs(batchPrepSteps);
  const groupedPrep = groupStepsByInput(prepSteps);
  const groupedAssembly = groupStepsByInput(assemblySteps);

  return (
    <div ref={ref}>
      {/* PAGE 1: Pull List */}
      <Box className="print-page print-portrait" sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: "bold", mb: 2 }}>
          Batch Prep — Pull List
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0.5,
          }}
        >
          {pullList.map((item, idx) => (
            <Box
              key={idx}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 0.25,
              }}
            >
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  border: "1.5px solid #666",
                  borderRadius: 0.5,
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                <strong>{item.productName}</strong>
                {item.totalQuantity > 0 && (
                  <span style={{ color: "#666", marginLeft: 4 }}>
                    ({formatQuantity(item.totalQuantity, item.unit)})
                  </span>
                )}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* PAGE 2+: Prep & Assembly Steps */}
      <Box className="print-page print-portrait" sx={{ p: 2 }}>
        {/* PREP Section */}
        {groupedPrep.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: "bold",
                mb: 1.5,
                pb: 0.5,
                borderBottom: "2px solid #333",
              }}
            >
              Prep
            </Typography>

            {groupedPrep.map((group, groupIdx) => (
              <Box key={groupIdx} sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: "bold",
                    color: "#555",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    mb: 0.5,
                  }}
                >
                  {group.inputProduct}
                </Typography>

                {group.steps.map((step) => (
                  <Box
                    key={step.stepId}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      py: 0.5,
                      pl: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        border: "1.5px solid #666",
                        borderRadius: 0.5,
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        {step.name}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: "0.75rem",
                            color: "#666",
                            ml: 1,
                          }}
                        >
                          ({step.recipeName})
                        </Typography>
                      </Typography>

                      <Typography
                        variant="caption"
                        sx={{ color: "#666", display: "block" }}
                      >
                        {step.inputs
                          .map(
                            (i) =>
                              `${i.productName}${i.quantity ? ` (${formatQuantity(i.quantity, i.unit)})` : ""}`
                          )
                          .join(", ")}
                        {" → "}
                        {step.outputs
                          .map(
                            (o) =>
                              `${o.productName}${o.quantity ? ` (${formatQuantity(o.quantity, o.unit)})` : ""}`
                          )
                          .join(", ")}
                      </Typography>
                    </Box>
                  </Box>
                ))}

                {groupIdx < groupedPrep.length - 1 && (
                  <Divider sx={{ mt: 1, borderStyle: "dashed" }} />
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* ASSEMBLY Section */}
        {groupedAssembly.length > 0 && (
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: "bold",
                mb: 1.5,
                pb: 0.5,
                borderBottom: "2px solid #333",
              }}
            >
              Assembly
            </Typography>

            {groupedAssembly.map((group, groupIdx) => (
              <Box key={groupIdx} sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: "bold",
                    color: "#555",
                    textTransform: "uppercase",
                    fontSize: "0.75rem",
                    mb: 0.5,
                  }}
                >
                  {group.inputProduct}
                </Typography>

                {group.steps.map((step) => (
                  <Box
                    key={step.stepId}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1,
                      py: 0.5,
                      pl: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        border: "1.5px solid #666",
                        borderRadius: 0.5,
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        {step.name}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: "0.75rem",
                            color: "#666",
                            ml: 1,
                          }}
                        >
                          ({step.recipeName})
                        </Typography>
                      </Typography>

                      <Typography
                        variant="caption"
                        sx={{ color: "#666", display: "block" }}
                      >
                        {step.inputs
                          .map(
                            (i) =>
                              `${i.productName}${i.quantity ? ` (${formatQuantity(i.quantity, i.unit)})` : ""}`
                          )
                          .join(", ")}
                        {" → "}
                        {step.outputs
                          .map(
                            (o) =>
                              `${o.productName}${o.quantity ? ` (${formatQuantity(o.quantity, o.unit)})` : ""}`
                          )
                          .join(", ")}
                      </Typography>
                    </Box>
                  </Box>
                ))}

                {groupIdx < groupedAssembly.length - 1 && (
                  <Divider sx={{ mt: 1, borderStyle: "dashed" }} />
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </div>
  );
});

BatchPrepPrintView.displayName = "BatchPrepPrintView";