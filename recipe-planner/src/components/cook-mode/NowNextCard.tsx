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

/** One recipe's contribution to a required cut on a merged prep card. */
export interface MergedCutRow {
  recipeName: string;
  quantity: number;
  unit: string;
}

/** The per-recipe breakdown for ONE distinct required output (cut) of a
 * week-wide merged prep node — e.g. all the recipes wanting "small dice" of
 * the merged raw ingredient. `cutLabel` is the exact product to have ready. */
export interface MergedCutGroup {
  cutLabel: string;
  cutKey: string;
  rows: MergedCutRow[];
}

export interface NowNextCardStatusChip {
  state: ReadinessChipState;
  label: string;
}

export interface NowNextCardProps {
  instance: StepInstance;
  variant: "now" | "next";
  scaledInputs: ScaledIngredient[];
  /** When this card is a week-wide merged prep node, the per-recipe cut
   * breakdown grouped by required output product. Renders a compact table in
   * place of the flat input list so the cook sees which recipe needs which cut
   * and exactly which products to have ready (PREP-04 follow-on,
   * user-directed 2026-07-10). Null/absent for ordinary per-recipe nodes. */
  mergedBreakdown?: MergedCutGroup[] | null;
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
  mergedBreakdown,
  checked,
  onToggleChecked,
  statusChip,
  countdownText,
}: NowNextCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isNow = variant === "now";

  // Merged prep summary for the caption + to switch the detail body to the
  // grouped cut table. `recipeCount` de-dupes a recipe appearing under two cuts.
  const cutCount = mergedBreakdown?.length ?? 0;
  const recipeCount = mergedBreakdown
    ? new Set(mergedBreakdown.flatMap((g) => g.rows.map((r) => r.recipeName))).size
    : 0;

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
            {cutCount > 0
              ? `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"} · ${cutCount} ${
                  cutCount === 1 ? "cut" : "cuts"
                }`
              : instance.recipeName}
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
              {cutCount > 0 ? (
                // Grouped by required cut: the cut (the exact product to have
                // ready) is a full-width section header, so each recipe below
                // it gets the whole card width and reads on one line, with a
                // small right-aligned qty. Answers "which recipe needs which
                // cut" for a merged prep block that would otherwise show one
                // flat quantity.
                <Box>
                  {mergedBreakdown!.map((g) => (
                    <Box key={g.cutKey} sx={{ mb: 1 }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight="bold"
                        sx={{
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          pb: 0.25,
                          mb: 0.25,
                        }}
                      >
                        {g.cutLabel.charAt(0).toUpperCase() + g.cutLabel.slice(1)}
                      </Typography>
                      {g.rows.map((r, ri) => (
                        <Box
                          key={`${g.cutKey}-${ri}`}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 1.5,
                            py: 0.1,
                          }}
                        >
                          <Typography variant="body2">{r.recipeName}</Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {formatQuantity(r.quantity)}
                            {r.unit && r.unit !== "each" ? ` ${r.unit}` : ""}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              ) : (
                scaledInputs.length > 0 && (
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
                )
              )}
              {instance.step.instructions && (
                <Typography variant="body2" sx={{ mt: cutCount > 0 ? 1 : 0.5 }}>
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
