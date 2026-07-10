// GA weights tuning panel (PREP-05, D-06, 05-UI-SPEC.md Surface 2). 5 MUI
// Sliders (0-10 integer) for the user-tunable fitness weights read by
// scheduler/genetic.ts's `fitness()`. "active" is listed FIRST and defaults
// higher than the other four (D-06's primary objective — minimize
// active/hands-on time — surfaced both in default value and slider order,
// not via a separate visual treatment per UI-SPEC). Slider drags update the
// displayed value live but never write or regenerate; only `onChangeCommitted`
// (release) schedules a debounced write to scheduler_config (T-05-12a: never
// a write per drag tick). "Regenerate Plan" mirrors BatchPrepTab.tsx's
// full-width primary Button treatment — it is the only trigger that
// recomputes the schedule (no live preview, per UI-SPEC).
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography, Slider, Button } from "@mui/material";
import type { SchedulerConfig } from "../../lib/types";
import { saveSchedulerConfig } from "../../lib/scheduler/scheduler-config";

type WeightKey = keyof SchedulerConfig["weights"];

interface WeightSliderDef {
  key: WeightKey;
  label: string;
}

// Order matters: active first (D-06 primary objective leads the panel).
const WEIGHT_SLIDERS: WeightSliderDef[] = [
  { key: "active", label: "Active time" },
  { key: "chopping", label: "Chopping consolidation" },
  { key: "grouping", label: "Step grouping" },
  { key: "elapsed", label: "Elapsed time" },
  { key: "resource_pressure", label: "Resource pressure" },
];

/** Coalesces rapid successive releases (e.g. adjusting several sliders in
 * quick succession) into a single scheduler_config write, per T-05-12a. */
const WRITE_DEBOUNCE_MS = 500;

export interface WeightsPanelProps {
  config: SchedulerConfig;
  /** Fires once a debounced write to scheduler_config resolves, so the
   * parent's own copy of the singleton (used by "Regenerate Plan") stays in
   * sync without waiting for a full reload. */
  onConfigSaved: (config: SchedulerConfig) => void;
  onRegenerate: () => void;
}

export function WeightsPanel({
  config,
  onConfigSaved,
  onRegenerate,
}: WeightsPanelProps) {
  const [weights, setWeights] = useState(config.weights);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configIdRef = useRef(config.id);
  configIdRef.current = config.id;

  // Stay in sync when the parent hands us a fresher config (e.g. after
  // CookMode's own reload-before-regenerate, or a cross-device change).
  useEffect(() => {
    setWeights(config.weights);
  }, [config.weights]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const persist = useCallback(
    (nextWeights: SchedulerConfig["weights"]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveSchedulerConfig(configIdRef.current, { weights: nextWeights })
          .then(onConfigSaved)
          .catch((err) => {
            console.error("Failed to save scheduler weights:", err);
          });
      }, WRITE_DEBOUNCE_MS);
    },
    [onConfigSaved]
  );

  const handleDrag = useCallback(
    (key: WeightKey) => (_event: Event, value: number | number[]) => {
      // Live drag feedback only — never a write, never a regenerate (UI-SPEC
      // "No live preview").
      const numeric = Array.isArray(value) ? value[0] : value;
      setWeights((prev) => ({ ...prev, [key]: numeric }));
    },
    []
  );

  const handleRelease = useCallback(
    (key: WeightKey) =>
      (_event: React.SyntheticEvent | Event, value: number | number[]) => {
        const numeric = Array.isArray(value) ? value[0] : value;
        const nextWeights = { ...weights, [key]: numeric };
        setWeights(nextWeights);
        persist(nextWeights);
      },
    [weights, persist]
  );

  return (
    <Box>
      {WEIGHT_SLIDERS.map(({ key, label }) => (
        <Box key={key} sx={{ mb: 3 }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="baseline"
            mb={0.5}
          >
            <Typography variant="body2">{label}</Typography>
            <Typography variant="subtitle1" fontWeight="bold">
              {weights[key]}
            </Typography>
          </Box>
          <Slider
            value={weights[key]}
            onChange={handleDrag(key)}
            onChangeCommitted={handleRelease(key)}
            min={0}
            max={10}
            step={1}
            marks
            aria-label={label}
            sx={{
              // 48px touch-target minimum (UI-SPEC spacing exception) — MUI's
              // default thumb is smaller, so the thumb is sized up directly.
              "& .MuiSlider-thumb": {
                width: 48,
                height: 48,
              },
            }}
          />
        </Box>
      ))}
      <Button
        variant="contained"
        color="primary"
        fullWidth
        onClick={onRegenerate}
        sx={{ minHeight: 48 }}
      >
        Regenerate Plan
      </Button>
    </Box>
  );
}
