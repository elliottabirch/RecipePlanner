// Cook-mode now/next step card (PREP-04, 05-UI-SPEC.md Surface 1). Reuses
// StepNode.tsx's exact border/shadow convention verbatim (2px accent border
// + boxShadow 3 for the "now" card, 1px #ccc + no shadow for "next") and the
// 48px check-off touch target from BatchPrepTab.tsx's Checkbox `sx` block.
// Tap-for-detail (MUI Collapse, no dialog) reveals scaled quantities +
// instructions without blocking the check-off control underneath.
import { useState } from "react";
import { Box, Typography, Checkbox, Collapse } from "@mui/material";
import type { StepInstance } from "../../lib/scheduler/types";
import { ReadinessChip, type ReadinessChipState } from "./ReadinessChip";

export interface ScaledIngredient {
  productName: string;
  quantity: number;
  unit: string;
}

export interface NowNextCardStatusChip {
  state: ReadinessChipState;
  label: string;
}

export interface NowNextCardProps {
  instance: StepInstance;
  variant: "now" | "next";
  scaledInputs: ScaledIngredient[];
  checked: boolean;
  onToggleChecked: () => void;
  statusChip?: NowNextCardStatusChip | null;
  /** Live MM:SS remaining, Display size (20px/700) — "now" card passive
   * countdown only; null/undefined when not counting. */
  countdownText?: string | null;
}

function formatQuantity(q: number): number {
  // Avoid noisy floating-point tails from scaleQuantity's peopleMultiplier
  // math (e.g. 1.5 * 0.3333) without rounding to whole units.
  return Math.round(q * 100) / 100;
}

export function NowNextCard({
  instance,
  variant,
  scaledInputs,
  checked,
  onToggleChecked,
  statusChip,
  countdownText,
}: NowNextCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isNow = variant === "now";

  return (
    <Box
      sx={{
        backgroundColor: "white",
        border: isNow ? "2px solid" : "1px solid #ccc",
        borderColor: isNow ? "primary.main" : "#ccc",
        borderRadius: 2,
        padding: 3, // 24px — the phase-specific spacing exception (UI-SPEC)
        boxShadow: isNow ? 3 : 0,
      }}
    >
      <Box display="flex" alignItems="flex-start" gap={1}>
        <Checkbox
          checked={checked}
          onChange={onToggleChecked}
          size="medium"
          sx={{ mt: -0.5, p: 1.5, minWidth: 48, minHeight: 48 }}
        />
        <Box
          flex={1}
          onClick={() => setExpanded((e) => !e)}
          sx={{ cursor: "pointer" }}
        >
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            gap={1}
            flexWrap="wrap"
          >
            <Typography variant="subtitle1" fontWeight="bold">
              {instance.step.name}
            </Typography>
            {statusChip && (
              <ReadinessChip state={statusChip.state} label={statusChip.label} />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {instance.recipeName}
          </Typography>

          {countdownText && (
            <Typography
              variant="h6"
              fontWeight="bold"
              sx={{ color: "secondary.main", mt: 1 }}
            >
              {countdownText}
            </Typography>
          )}

          <Collapse in={expanded}>
            <Box mt={1}>
              {scaledInputs.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {scaledInputs
                    .map(
                      (i) =>
                        `${i.productName}${
                          i.quantity
                            ? ` (${formatQuantity(i.quantity)} ${i.unit})`
                            : ""
                        }`
                    )
                    .join(", ")}
                </Typography>
              )}
              {instance.step.instructions && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {instance.step.instructions}
                </Typography>
              )}
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
}
