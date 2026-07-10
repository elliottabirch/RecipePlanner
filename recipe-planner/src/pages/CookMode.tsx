// Interactive tablet cook mode (PREP-04, D-01a.3, D-03). Supersedes
// BatchPrepTab.tsx's interactive checklist role as the prep-day surface
// (BatchPrepTab.tsx itself is kept, unmodified, for its print stylesheet —
// Topic 1). Loads this weekly plan's meal-keyed recipe data independently
// (mirrors Outputs.tsx's own loadPlanData effect, including variant-override
// application, so a full tablet refresh — the persistence check in the
// human-verify checkpoint — restores state from PocketBase rather than
// relying on in-memory router state), builds the week-graph, and lets the
// cook generate a schedule, check off steps, and watch readiness/countdowns
// update. Check-off always calls `retimeSchedule` — the fixed activity-list
// order the GA (or a prior retime) decided is never permuted; only the
// displayed times/countdowns recompute (D-01a.3 "order is authoritative, the
// clock adapts"). This page builds NO affordance that implies a card's
// position in the sequence can be manually changed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Alert,
} from "@mui/material";
import { getAll, getOne, collections } from "../lib/api";
import { applyVariantOverrides, type VariantOverride } from "../lib/aggregation";
import { extractStepInputs } from "../lib/aggregation/builders/step-builder";
import type {
  WeeklyPlan,
  RecipeProductNode,
  RecipeStep,
  ProductToStepEdge,
  StepToProductEdge,
  MealVariantOverrideExpanded,
  SchedulerConfig,
} from "../lib/types";
import { StepType } from "../lib/types";
import type {
  PlannedMealWithRecipe,
  RecipeGraphData,
} from "../lib/aggregation";
import { buildWeekGraph } from "../lib/scheduler/week-graph";
import { generateSchedule } from "../lib/scheduler/genetic";
import { retimeSchedule } from "../lib/scheduler/retime";
import { emptyResourceTimeline } from "../lib/scheduler/resources";
import type { Schedule, StepInstance, WeekGraph } from "../lib/scheduler/types";
import { deriveReadiness } from "../lib/scheduler/readiness";
import { useCookProgress } from "../hooks/useCookProgress";
import { NowNextCard } from "../components/cook-mode/NowNextCard";
import type { ReadinessChipState } from "../components/cook-mode/ReadinessChip";
import { SyncIndicator } from "../components/outputs";

/** Fallback used only if `scheduler_config`'s seeded singleton (05-01) is
 * somehow missing from this PocketBase instance — keeps the page usable
 * instead of crashing (Rule 2: correctness/robustness, not a feature). */
function fallbackSchedulerConfig(): SchedulerConfig {
  return {
    id: "fallback-scheduler-config",
    created: "",
    updated: "",
    collectionId: "scheduler_config",
    collectionName: "scheduler_config",
    seed: 1,
    weights: { active: 8, chopping: 3, grouping: 3, elapsed: 4, resource_pressure: 3 },
    burner_count: 2,
    oven_rack_slots: 2,
    appliances: [],
  };
}

interface StatusChip {
  state: ReadinessChipState;
  label: string;
}

export default function CookMode() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [mealKeyedRecipeData, setMealKeyedRecipeData] = useState<
    Map<string, RecipeGraphData>
  >(new Map());
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig | null>(
    null
  );

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  // Only the setter is used directly — every read goes through the
  // functional updater form (see handleToggleChecked/handleGenerateSchedule)
  // so retimeSchedule always sees the latest map even across rapid taps.
  const [, setActualCompletions] = useState<Map<string, number>>(new Map());

  // Anchor (epoch ms) for when a StepInstance became the current "now" card —
  // drives both the live passive countdown and the real-elapsed-minutes input
  // to retimeSchedule on check-off. In-memory only for this session; a
  // refresh restarts anchors (checked-off progress itself still restores from
  // cook_progress via useCookProgress, independent of these anchors).
  const nowStartRef = useRef<Map<string, number>>(new Map());
  const [, forceTick] = useState(0);

  const cookProgress = useCookProgress(planId ?? "");

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [planData, meals, configs] = await Promise.all([
          getOne<WeeklyPlan>(collections.weeklyPlans, planId),
          getAll<PlannedMealWithRecipe>(collections.plannedMeals, {
            filter: `weekly_plan="${planId}"`,
            expand: "recipe",
          }),
          getAll<SchedulerConfig>(collections.schedulerConfig),
        ]);
        if (cancelled) return;

        setPlan(planData);
        setSchedulerConfig(configs[0] ?? fallbackSchedulerConfig());

        const mealIds = meals.map((m) => m.id);
        let overrides: MealVariantOverrideExpanded[] = [];
        if (mealIds.length > 0) {
          const filter = mealIds.map((id) => `planned_meal="${id}"`).join(" || ");
          overrides = await getAll<MealVariantOverrideExpanded>(
            collections.mealVariantOverrides,
            { filter, expand: "original_node.product,replacement_product" }
          );
        }
        if (cancelled) return;

        const overridesByMeal = new Map<string, VariantOverride[]>();
        for (const override of overrides) {
          const mealId = override.planned_meal;
          if (!overridesByMeal.has(mealId)) overridesByMeal.set(mealId, []);
          if (override.expand?.replacement_product) {
            overridesByMeal.get(mealId)!.push({
              originalNodeId: override.original_node,
              replacementProduct: override.expand.replacement_product,
              quantity: override.quantity ?? null,
              unit: override.unit ?? null,
            });
          }
        }

        const recipeIds = [...new Set(meals.map((m) => m.recipe))];
        const baseRecipeData = new Map<string, RecipeGraphData>();
        for (const recipeId of recipeIds) {
          const [productNodes, steps, ptsEdges, stpEdges] = await Promise.all([
            getAll<RecipeProductNode>(collections.recipeProductNodes, {
              filter: `recipe="${recipeId}"`,
              expand:
                "product, product.container_type, product.store, product.section",
            }),
            getAll<RecipeStep>(collections.recipeSteps, {
              filter: `recipe="${recipeId}"`,
            }),
            getAll<ProductToStepEdge>(collections.productToStepEdges, {
              filter: `recipe="${recipeId}"`,
            }),
            getAll<StepToProductEdge>(collections.stepToProductEdges, {
              filter: `recipe="${recipeId}"`,
            }),
          ]);
          const recipe = meals.find((m) => m.recipe === recipeId)?.expand?.recipe;
          if (recipe) {
            baseRecipeData.set(recipeId, {
              recipe,
              productNodes,
              steps,
              productToStepEdges: ptsEdges,
              stepToProductEdges: stpEdges,
            });
          }
        }
        if (cancelled) return;

        const keyedData = new Map<string, RecipeGraphData>();
        for (const meal of meals) {
          const baseData = baseRecipeData.get(meal.recipe);
          if (!baseData) continue;
          const mealOverrides = overridesByMeal.get(meal.id) || [];
          keyedData.set(
            meal.id,
            mealOverrides.length > 0
              ? applyVariantOverrides(baseData, mealOverrides)
              : baseData
          );
        }
        setMealKeyedRecipeData(keyedData);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load cook-mode data:", err);
          setLoadError("Failed to load this week's cook-mode data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const rawPeopleMultiplier = plan?.people_multiplier;
  const peopleMultiplier =
    typeof rawPeopleMultiplier === "number" && rawPeopleMultiplier > 0
      ? rawPeopleMultiplier
      : 1;

  const plannedMealQuantityById = useMemo(() => {
    // Reconstructed from mealKeyedRecipeData's keys — the meal-quantity
    // multiplier itself isn't preserved on RecipeGraphData, but every meal
    // in cook mode is treated at its planned quantity (default 1) times the
    // plan-wide people_multiplier, matching Outputs.tsx's own mealCount math.
    return peopleMultiplier;
  }, [peopleMultiplier]);

  const weekGraph: WeekGraph = useMemo(
    () => buildWeekGraph(mealKeyedRecipeData),
    [mealKeyedRecipeData]
  );

  const stepLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of weekGraph.nodes) map.set(node.id, node.step.name);
    return map;
  }, [weekGraph]);

  const checkedIds = useMemo(() => {
    const set = new Set<string>();
    cookProgress.state.forEach((entry, key) => {
      if (entry.checked) set.add(key);
    });
    return set;
  }, [cookProgress.state]);

  const visibleOrder = useMemo(
    () => (schedule ? schedule.order.filter((inst) => !checkedIds.has(inst.id)) : []),
    [schedule, checkedIds]
  );
  const nowInstance = visibleOrder[0];
  const nextInstance = visibleOrder[1];

  // Record the "now" transition anchor the instant a step becomes current —
  // this is both the passive-countdown start and the real-elapsed-minutes
  // basis for retimeSchedule on check-off.
  useEffect(() => {
    if (nowInstance && !nowStartRef.current.has(nowInstance.id)) {
      nowStartRef.current.set(nowInstance.id, Date.now());
    }
  }, [nowInstance]);

  const getCountdown = useCallback(
    (instance: StepInstance): { text: string; done: boolean } | null => {
      const passiveMinutes = instance.step.passive_minutes ?? 0;
      if (passiveMinutes <= 0) return null;
      const anchor = nowStartRef.current.get(instance.id);
      if (!anchor) return null;
      const totalSeconds = passiveMinutes * 60;
      const elapsedSeconds = Math.floor((Date.now() - anchor) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsedSeconds);
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      return { text: `${mm}:${ss}`, done: remaining <= 0 };
    },
    []
  );

  const getStatusChip = useCallback(
    (instance: StepInstance, isNowCard: boolean): StatusChip | null => {
      if (instance.step.step_type === StepType.Assembly) {
        const readiness = deriveReadiness(instance.id, weekGraph, checkedIds);
        if (readiness.state === "waiting") {
          const labels = readiness.waitingOn.map(
            (id) => stepLabelById.get(id) ?? id
          );
          return { state: "waiting", label: `waiting on: ${labels.join(", ")}` };
        }
      }

      const passiveMinutes = instance.step.passive_minutes ?? 0;
      if (passiveMinutes > 0) {
        if (isNowCard) {
          const countdown = getCountdown(instance);
          if (countdown && !countdown.done) return null; // live digits shown instead
          return { state: "ready", label: "Ready" };
        }
        return { state: "passive", label: `${passiveMinutes}m passive` };
      }

      if (instance.step.step_type === StepType.Assembly) {
        return { state: "ready", label: "Ready" };
      }
      return null;
    },
    [weekGraph, checkedIds, stepLabelById, getCountdown]
  );

  const getScaledInputs = useCallback(
    (instance: StepInstance) => {
      const recipeData = mealKeyedRecipeData.get(instance.plannedMealId);
      if (!recipeData) return [];
      // Meal-instance-scoped scaling (never the batch signature-merge path,
      // per 05-PATTERNS.md "AVOID" note) — plannedMealQuantityById already
      // folds in the plan-wide people_multiplier; per-meal `quantity` isn't
      // retained on RecipeGraphData, so this mirrors Outputs.tsx's own
      // mealCount default of 1 planned unit times the people multiplier.
      return extractStepInputs(
        instance.step.id,
        recipeData,
        plannedMealQuantityById
      );
    },
    [mealKeyedRecipeData, plannedMealQuantityById]
  );

  const handleGenerateSchedule = useCallback(() => {
    if (!schedulerConfig) return;
    try {
      setScheduleError(null);
      const generated = generateSchedule(weekGraph, schedulerConfig);
      setSchedule(generated);
      setActualCompletions(new Map());
      nowStartRef.current = new Map();
    } catch (err) {
      console.error("Failed to generate cook-mode schedule:", err);
      setScheduleError(
        "Couldn't build a schedule for this week. Check the linter for missing step metadata, then try again."
      );
    }
  }, [weekGraph, schedulerConfig]);

  const handleToggleChecked = useCallback(
    (instance: StepInstance) => {
      if (!schedule || !schedulerConfig) return;
      const nextChecked = !checkedIds.has(instance.id);
      cookProgress.setChecked(instance.id, nextChecked);

      setActualCompletions((prev) => {
        const next = new Map(prev);
        if (nextChecked) {
          const anchor = nowStartRef.current.get(instance.id) ?? Date.now();
          const elapsedMinutes = Math.max(0, (Date.now() - anchor) / 60000);
          next.set(instance.id, elapsedMinutes);
        } else {
          next.delete(instance.id);
        }
        const retimed = retimeSchedule(
          schedule.order,
          next,
          emptyResourceTimeline(),
          schedulerConfig
        );
        setSchedule(retimed);
        return next;
      });
    },
    [schedule, schedulerConfig, checkedIds, cookProgress]
  );

  if (!planId) {
    return (
      <Box p={4}>
        <Alert severity="error">No weekly plan selected.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box p={4}>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        flexWrap="wrap"
        gap={1}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Cook Mode
          </Typography>
          <Typography color="text.secondary">
            {plan?.name || "Unnamed plan"}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <SyncIndicator
            pendingCount={cookProgress.pendingCount}
            failed={cookProgress.failed}
          />
          <Button variant="outlined" onClick={() => navigate("/outputs")}>
            Back to Outputs
          </Button>
        </Box>
      </Box>

      {scheduleError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {scheduleError}
        </Alert>
      )}

      {!schedule ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            No prep schedule yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Generate a schedule from this week&apos;s planned meals to start
            cook mode.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={handleGenerateSchedule}
            sx={{ minHeight: 48 }}
          >
            Generate Prep Schedule
          </Button>
        </Paper>
      ) : visibleOrder.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="subtitle1" fontWeight="bold">
            All steps complete!
          </Typography>
          <Typography color="text.secondary">
            Every prep-day step in this plan has been checked off.
          </Typography>
        </Paper>
      ) : (
        <Box
          display="flex"
          flexDirection="column"
          gap={4}
          sx={{
            // Side-by-side on landscape tablets (MUI md breakpoint), stacked
            // on portrait — no new breakpoint token, reuses MUI defaults.
            "@media (min-width:900px)": {
              flexDirection: "row",
              alignItems: "flex-start",
            },
          }}
        >
          <Box flex={1} width="100%">
            <Typography variant="overline" color="text.secondary">
              Now
            </Typography>
            {nowInstance && (
              <NowNextCard
                instance={nowInstance}
                variant="now"
                scaledInputs={getScaledInputs(nowInstance)}
                checked={checkedIds.has(nowInstance.id)}
                onToggleChecked={() => handleToggleChecked(nowInstance)}
                statusChip={getStatusChip(nowInstance, true)}
                countdownText={getCountdown(nowInstance)?.text ?? null}
              />
            )}
          </Box>
          {nextInstance && (
            <Box flex={1} width="100%">
              <Typography variant="overline" color="text.secondary">
                Next
              </Typography>
              <NowNextCard
                instance={nextInstance}
                variant="next"
                scaledInputs={getScaledInputs(nextInstance)}
                checked={checkedIds.has(nextInstance.id)}
                onToggleChecked={() => handleToggleChecked(nextInstance)}
                statusChip={getStatusChip(nextInstance, false)}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
