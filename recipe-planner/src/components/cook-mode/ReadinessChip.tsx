// Cook-mode readiness/state chip (PREP-04, 05-UI-SPEC.md Surface 1 + Color
// section). Reuses StepNode.tsx's exact Timing-chip `sx` block verbatim
// (size="small", fontSize 0.7rem, height 20) — no new visual style
// introduced. Three binary/discrete states, never a blended "partially
// ready" state (AND-semantics, RESEARCH A4):
//  - "waiting"  -> outlined, text.secondary (gray) — assembly step blocked
//    on one or more un-checked upstream producers.
//  - "ready"    -> filled, accent green (primary.main) — every upstream
//    producer checked off, OR a passive step's countdown hit zero. The one
//    legitimate non-CTA accent use (UI-SPEC Color section).
//  - "passive"  -> filled, secondary.main (orange) — a passive step not yet
//    counting down on this card (e.g. the "next" card preview); the live
//    MM:SS digit readout itself is rendered separately at Display size by
//    NowNextCard, never inside this chip.
//  - "blocked"  -> filled, error.main (red) — the step consumes an input that
//    NOTHING in the planned week produces and that isn't prior stock, so it can
//    never become ready (unproduced-non-raw-inputs, 260718). Distinct from
//    "waiting", which resolves once you check the producer off; a blocked step
//    stays blocked until the plan/recipe data is fixed.
import { Chip } from "@mui/material";

export type ReadinessChipState = "waiting" | "ready" | "passive" | "blocked";

export interface ReadinessChipProps {
  state: ReadinessChipState;
  /** "waiting" -> "waiting on: X, Y"; "ready" -> "Ready"; "passive" -> e.g. "15m passive"; "blocked" -> "blocked: nothing makes X". */
  label: string;
}

export function ReadinessChip({ state, label }: ReadinessChipProps) {
  if (state === "blocked") {
    return (
      <Chip
        label={label}
        size="small"
        variant="filled"
        sx={{
          fontSize: "0.7rem",
          height: 20,
          backgroundColor: "error.main",
          color: "white",
        }}
      />
    );
  }

  if (state === "ready") {
    return (
      <Chip
        label={label}
        size="small"
        variant="filled"
        sx={{
          fontSize: "0.7rem",
          height: 20,
          backgroundColor: "primary.main",
          color: "white",
        }}
      />
    );
  }

  if (state === "passive") {
    return (
      <Chip
        label={label}
        size="small"
        variant="filled"
        sx={{
          fontSize: "0.7rem",
          height: 20,
          backgroundColor: "secondary.main",
          color: "white",
        }}
      />
    );
  }

  // "waiting" — outlined, text.secondary, matching StepNode.tsx's Timing chip.
  return (
    <Chip
      label={label}
      size="small"
      variant="outlined"
      sx={{
        fontSize: "0.7rem",
        height: 20,
        color: "text.secondary",
      }}
    />
  );
}
