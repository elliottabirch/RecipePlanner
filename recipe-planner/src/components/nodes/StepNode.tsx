import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Box, Typography, Chip } from "@mui/material";
import { PlayArrow as StepIcon } from "@mui/icons-material";
import { StepType, Timing } from "../../lib/types";

export interface StepNodeData extends Record<string, unknown> {
  label: string;
  stepType: StepType;
  timing?: Timing;
  // Prep-day engine authoring metadata (D-05, Phase 5 Plan 03). Additive +
  // optional so existing nodes without this data still render unchanged.
  active_minutes?: number;
  passive_minutes?: number;
  instructions?: string;
  prep_action?: string;
  resource?:
    | "oven"
    | "stovetop"
    | "blender"
    | "food_processor"
    | "instant_pot"
    | "none";
  oven_temp_f?: number;
  rack_slots?: number;
}

export type StepNodeType = Node<StepNodeData, "step">;

const STEP_TYPE_COLORS: Record<StepType, string> = {
  [StepType.Prep]: "#9c27b0",
  [StepType.Assembly]: "#f44336",
};

const TIMING_LABELS: Record<Timing, string> = {
  [Timing.Batch]: "Batch",
  [Timing.JustInTime]: "Just-in-time",
};

function StepNode({ data, selected }: NodeProps<StepNodeType>) {
  // Duration metadata chip label (Phase 5 Plan 03) — omits a side that is
  // null/0 gracefully; renders nothing if neither duration is populated.
  const durationLabel = [
    data.active_minutes ? `${data.active_minutes}m active` : null,
    data.passive_minutes ? `${data.passive_minutes}m passive` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <Box
      sx={{
        backgroundColor: "white",
        border: selected ? "2px solid #1976d2" : "1px solid #ccc",
        borderRadius: 2,
        padding: 1.5,
        minWidth: 150,
        boxShadow: selected ? 3 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={true} />

      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
        <StepIcon
          sx={{ fontSize: 18, color: STEP_TYPE_COLORS[data.stepType] }}
        />
        <Typography variant="subtitle2" fontWeight="bold">
          {data.label}
        </Typography>
      </Box>

      <Box display="flex" gap={0.5} flexWrap="wrap">
        <Chip
          label={data.stepType}
          size="small"
          sx={{
            backgroundColor: STEP_TYPE_COLORS[data.stepType],
            color: "white",
            fontSize: "0.7rem",
            height: 20,
          }}
        />

        {data.stepType === StepType.Assembly && data.timing && (
          <Chip
            label={TIMING_LABELS[data.timing]}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.7rem",
              height: 20,
            }}
          />
        )}

        {durationLabel && (
          <Chip
            label={durationLabel}
            size="small"
            variant="outlined"
            sx={{
              fontSize: "0.7rem",
              height: 20,
            }}
          />
        )}
      </Box>

      <Handle type="source" position={Position.Right} isConnectable={true} />
    </Box>
  );
}

export default memo(StepNode);
