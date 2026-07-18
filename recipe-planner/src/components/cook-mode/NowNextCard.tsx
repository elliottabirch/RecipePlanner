// Cook-mode now/next step card (PREP-04, 05-UI-SPEC.md Surface 1). Reuses
// StepNode.tsx's exact border/shadow convention verbatim (2px accent border
// + boxShadow 3 for the "now" card, 1px #ccc + no shadow for "next") and the
// 48px check-off touch target from BatchPrepTab.tsx's Checkbox `sx` block.
// Tap-for-detail (MUI Collapse, no dialog) reveals scaled quantities +
// instructions without blocking the check-off control underneath.
import { useState } from "react";
import {
  Box,
  Typography,
  Checkbox,
  Collapse,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
} from "@mui/material";
import { MenuBookOutlined as MenuBookIcon } from "@mui/icons-material";
import type { StepInstance } from "../../lib/scheduler/types";
import type { ConvergenceResult } from "../../lib/scheduler/convergence";
import { ReadinessChip, type ReadinessChipState } from "./ReadinessChip";
import AddNoteButton from "../AddNoteButton";

export interface ScaledIngredient {
  productName: string;
  quantity: number;
  unit: string;
}

/** The full-recipe payload backing the "view recipe" (book) button + dialog
 * (full-recipe-text-on-cook-mode-card todo). Null on merged-prep nodes (no
 * single recipe to show) — the caller omits it exactly as it omits the note
 * affordance there. */
export interface RecipeView {
  recipeName: string;
  /** `Recipe.notes` — the prose recipe. Empty/absent on recipes not yet
   * authored; the dialog then leans on the scaled ingredient list. */
  notes?: string | null;
  /** This week's scaled ingredient list for the whole recipe. */
  ingredients: ScaledIngredient[];
}

/** One recipe's contribution to a required cut on a merged prep card. */
export interface MergedCutRow {
  recipeName: string;
  quantity: number;
  unit: string;
  /** Per-recipe downstream convergence for this contribution (merged nodes
   * span several recipes, so convergence is per-row, not one shared line —
   * see the container-convergence todo's merged-prep caveat). Absent when this
   * recipe's portion converges with nothing. */
  combinesWith?: string[];
  destination?: string;
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
  /** Downstream convergence for this step: the other ingredients it combines
   * with and the shared destination container (container-convergence-indicator
   * todo). Null when the step converges with nothing (or on merged nodes). */
  convergence?: ConvergenceResult | null;
  /** Full-recipe payloads for the "view recipe" book button. One entry for an
   * ordinary node; several for a merged-prep node (one per contributing
   * recipe). Empty/absent → no button (recipe-less node). */
  recipeViews?: RecipeView[] | null;
  checked: boolean;
  onToggleChecked: () => void;
  statusChip?: NowNextCardStatusChip | null;
  /** Live MM:SS remaining, Display size (20px/700) — "now" card passive
   * countdown only; null/undefined when not counting. */
  countdownText?: string | null;
}

function formatIngredient(i: ScaledIngredient): string {
  const qty =
    i.quantity && i.unit && i.unit !== "each"
      ? ` (${formatQuantity(i.quantity)} ${i.unit})`
      : i.quantity
        ? ` (${formatQuantity(i.quantity)})`
        : "";
  return `${i.productName}${qty}`;
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
  convergence,
  recipeViews,
  checked,
  onToggleChecked,
  statusChip,
  countdownText,
}: NowNextCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
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
            <Box display="flex" alignItems="center" gap={0.5}>
              {statusChip && (
                <ReadinessChip
                  state={statusChip.state}
                  label={statusChip.label}
                />
              )}
              {/* Week-wide merged-prep nodes carry a synthetic step with an
                  empty `recipe` (spans multiple recipes — a note has no single
                  target), so omit the note affordance there (06 UAT #1). */}
              {/* Read the whole recipe from the card (full-recipe-text todo).
                  A merged-prep node lists each contributing recipe in the
                  dialog; a recipe-less node passes no views → no button. */}
              {recipeViews && recipeViews.length > 0 && (
                <Tooltip title="View full recipe">
                  <IconButton
                    size="small"
                    aria-label="View full recipe"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecipeOpen(true);
                    }}
                    sx={{ minWidth: 44, minHeight: 44 }}
                  >
                    <MenuBookIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {instance.step.recipe && (
                <AddNoteButton
                  recipeId={instance.step.recipe}
                  sourceSurface="cook_mode"
                  size="small"
                />
              )}
            </Box>
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
              {/* Downstream convergence: what this ingredient ends up combined
                  with, and into which container (container-convergence todo).
                  Placed first — it is the "where does my work go" context the
                  cook is asking for. */}
              {convergence && convergence.combinesWith.length > 0 && (
                <Typography
                  variant="body2"
                  sx={{
                    mb: 1,
                    px: 1,
                    py: 0.5,
                    borderLeft: "3px solid",
                    borderColor: "primary.main",
                    backgroundColor: "action.hover",
                    borderRadius: 0.5,
                  }}
                >
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    Combines with:
                  </Box>{" "}
                  {convergence.combinesWith.join(", ")}
                  {convergence.destination ? ` → ${convergence.destination}` : ""}
                </Typography>
              )}
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
                        <Box key={`${g.cutKey}-${ri}`} sx={{ py: 0.1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "baseline",
                              gap: 1.5,
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
                          {/* Per-recipe convergence: this recipe's cucumber
                              ends up here (merged-prep caveat — destinations
                              differ per recipe). */}
                          {r.combinesWith && r.combinesWith.length > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", pl: 1 }}
                            >
                              ↳ with {r.combinesWith.join(", ")}
                              {r.destination ? ` → ${r.destination}` : ""}
                            </Typography>
                          )}
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

      {/* Full recipe reader (full-recipe-text-on-cook-mode-card todo): the
          whole recipe in one place — prose (Recipe.notes) when authored, plus
          this week's scaled ingredient list, which the graph always has. A
          merged-prep node stacks every contributing recipe (title per section);
          an ordinary node shows the single recipe's name as the title. */}
      {recipeViews && recipeViews.length > 0 && (
        <Dialog
          open={recipeOpen}
          onClose={() => setRecipeOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {recipeViews.length === 1
              ? recipeViews[0].recipeName
              : "Recipes in this prep"}
          </DialogTitle>
          <DialogContent dividers>
            {recipeViews.map((view, vi) => (
              <Box key={vi} sx={{ mb: vi < recipeViews.length - 1 ? 3 : 0 }}>
                {recipeViews.length > 1 && (
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {view.recipeName}
                  </Typography>
                )}
                {view.notes && view.notes.trim() ? (
                  <Typography
                    variant="body1"
                    sx={{ whiteSpace: "pre-wrap", mb: view.ingredients.length ? 2 : 0 }}
                  >
                    {view.notes.trim()}
                  </Typography>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: view.ingredients.length ? 2 : 0 }}
                  >
                    No written recipe yet — showing this week&apos;s ingredients.
                  </Typography>
                )}
                {view.ingredients.length > 0 && (
                  <>
                    {view.notes && view.notes.trim() && <Divider sx={{ mb: 2 }} />}
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                      Ingredients (this week)
                    </Typography>
                    <Box component="ul" sx={{ m: 0, pl: 3 }}>
                      {view.ingredients.map((i, idx) => (
                        <Typography component="li" variant="body2" key={idx}>
                          {formatIngredient(i)}
                        </Typography>
                      ))}
                    </Box>
                  </>
                )}
                {recipeViews.length > 1 && vi < recipeViews.length - 1 && (
                  <Divider sx={{ mt: 3 }} />
                )}
              </Box>
            ))}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRecipeOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
