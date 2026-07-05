import { forwardRef } from "react";
import { Box, Typography, Divider } from "@mui/material";
import type { AggregatedStep } from "../../lib/aggregation";
import { StepType, ProductType, StorageLocation } from "../../lib/types";

interface BatchPrepPrintViewProps {
  batchPrepSteps: AggregatedStep[];
}

interface AggregatedInput {
  productName: string;
  totalQuantity: number;
  unit: string;
  storageLocation: StorageLocation | "pantry";
}

interface GroupedSteps {
  inputProduct: string;
  steps: AggregatedStep[];
}

/**
 * Storage location display order and labels
 */
const STORAGE_LOCATION_ORDER: (StorageLocation | "pantry")[] = [
  StorageLocation.Fridge,
  StorageLocation.Freezer,
  StorageLocation.Dry,
  "pantry",
];

const STORAGE_LOCATION_LABELS: Record<StorageLocation | "pantry", string> = {
  [StorageLocation.Fridge]: "Fridge",
  [StorageLocation.Freezer]: "Freezer",
  [StorageLocation.Dry]: "Dry Storage",
  pantry: "Pantry",
};

/**
 * Aggregate all inputs across all steps into a single pull list
 * Only includes raw products (ingredients to pull from storage)
 */
function aggregateInputs(steps: AggregatedStep[]): AggregatedInput[] {
  const inputMap = new Map<string, AggregatedInput>();

  steps.forEach((step) => {
    step.inputs.forEach((input) => {
      // Only include raw products - these are items we need to pull from storage
      if (input.productType !== ProductType.Raw) return;

      const key = `${input.productName}|${input.unit || ""}`;
      const existing = inputMap.get(key);

      if (existing) {
        existing.totalQuantity += input.quantity || 0;
      } else {
        inputMap.set(key, {
          productName: input.productName,
          totalQuantity: input.quantity || 0,
          unit: input.unit || "",
          storageLocation: input.storageLocation,
        });
      }
    });
  });

  return Array.from(inputMap.values()).sort((a, b) =>
    a.productName.localeCompare(b.productName)
  );
}

/**
 * Group inputs by storage location
 */
function groupInputsByLocation(
  inputs: AggregatedInput[]
): Map<StorageLocation | "pantry", AggregatedInput[]> {
  const grouped = new Map<StorageLocation | "pantry", AggregatedInput[]>();

  inputs.forEach((input) => {
    const location = input.storageLocation;
    const existing = grouped.get(location);

    if (existing) {
      existing.push(input);
    } else {
      grouped.set(location, [input]);
    }
  });

  return grouped;
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
  const groupedPullList = groupInputsByLocation(pullList);
  const groupedPrep = groupStepsByInput(prepSteps);
  const groupedAssembly = groupStepsByInput(assemblySteps);

  return (
    <div ref={ref}>
      {/* PAGE 1: Pull List */}
      <Box className="print-page print-portrait" sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: "bold", mb: 2 }}>
          Batch Prep — Pull List
        </Typography>

        {STORAGE_LOCATION_ORDER.map((location) => {
          const items = groupedPullList.get(location);
          if (!items || items.length === 0) return null;

          return (
            <Box key={location} sx={{ mb: 2 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: "bold",
                  color: "#555",
                  textTransform: "uppercase",
                  fontSize: "0.75rem",
                  mb: 0.5,
                  pb: 0.25,
                  borderBottom: "1px solid #ddd",
                }}
              >
                {STORAGE_LOCATION_LABELS[location]}
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 0.5,
                }}
              >
                {items.map((item, idx) => (
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
          );
        })}
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