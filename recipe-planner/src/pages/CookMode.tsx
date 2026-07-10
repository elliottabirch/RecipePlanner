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
  Chip,
  Checkbox,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { getAll, getOne, collections } from "../lib/api";
import { applyVariantOverrides, type VariantOverride } from "../lib/aggregation";
import {
  extractStepInputs,
  extractStepOutputs,
} from "../lib/aggregation/builders/step-builder";
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
import { loadSchedulerConfig } from "../lib/scheduler/scheduler-config";
import type { Schedule, StepInstance, WeekGraph } from "../lib/scheduler/types";
import { deriveReadiness } from "../lib/scheduler/readiness";
import {
  runStepLint,
  runWeekLint,
  collectStoredInputConsumptions,
  type LintFinding,
} from "../lib/linter";
import { useCookProgress } from "../hooks/useCookProgress";
import {
  NowNextCard,
  type MergedCutGroup,
} from "../components/cook-mode/NowNextCard";
import type { ReadinessChipState } from "../components/cook-mode/ReadinessChip";
import { WeightsPanel } from "../components/cook-mode/WeightsPanel";
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

/** `minutes-from-t0` -> `H:MM` clock-style offset for the full-schedule list. */
function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
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
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [showWeightsPanel, setShowWeightsPanel] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  // `null` = dialog closed; an array (possibly empty) = linter has run.
  const [lintFindings, setLintFindings] = useState<LintFinding[] | null>(null);

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

  // Clock-ordered schedule: the decoded start times ARE the plan — the cook
  // follows the clock, NOT the GA's internal topological activity list
  // (`schedule.order`). That list exists only so a step running long can be
  // re-timed without re-solving (D-01a.3); because it's topological, a step
  // like the post-smoke bbq assembly is listed early even though its clock time
  // is 20h out. Sorting by start time (tie-broken by activity-list position for
  // stable, deterministic display) restores the real interleaved timeline —
  // active prep packed into the smoke's passive window, bbq assembly last.
  const orderedByTime = useMemo(() => {
    if (!schedule) return [];
    const orderIndex = new Map(
      schedule.order.map((inst, i) => [inst.id, i] as const)
    );
    return [...schedule.order].sort((a, b) => {
      const sa = schedule.starts.get(a.id) ?? 0;
      const sb = schedule.starts.get(b.id) ?? 0;
      return sa - sb || (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
    });
  }, [schedule]);

  // Now/Next walk that same clock order, skipping checked-off steps — so after
  // you load the smoker you move straight to the next timed task rather than
  // waiting out its 20h passive window.
  const visibleOrder = useMemo(
    () => orderedByTime.filter((inst) => !checkedIds.has(inst.id)),
    [orderedByTime, checkedIds]
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
      // A week-wide merged prep node spans several meals — gather and combine
      // each original member's scaled inputs (all the onions to dice, etc.).
      if (instance.mergedMembers) {
        return instance.mergedMembers.flatMap((member) => {
          const memberData = mealKeyedRecipeData.get(member.plannedMealId);
          return memberData
            ? extractStepInputs(member.stepId, memberData, plannedMealQuantityById)
            : [];
        });
      }
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

  // A week-wide merged prep node collapses several recipes' prep of one raw
  // ingredient into a single work block, keyed on the RAW input — so different
  // required cuts (small vs large dice, slices) hide behind one flat quantity.
  // Recover the per-recipe attribution AND the distinct required outputs (the
  // exact products to have ready) by grouping each member on its OUTPUT product
  // (PREP-04 follow-on, user-directed 2026-07-10). Null for ordinary nodes.
  const getMergedBreakdown = useCallback(
    (instance: StepInstance): MergedCutGroup[] | null => {
      if (!instance.mergedMembers) return null;
      const groups = new Map<string, MergedCutGroup>();
      for (const member of instance.mergedMembers) {
        const memberData = mealKeyedRecipeData.get(member.plannedMealId);
        if (!memberData) continue;
        const cut = extractStepOutputs(
          member.stepId,
          memberData,
          plannedMealQuantityById
        )[0];
        const raw = extractStepInputs(
          member.stepId,
          memberData,
          plannedMealQuantityById
        )[0];
        const cutLabel = cut?.productName ?? instance.step.name;
        const cutKey = cut?.productId ?? cutLabel;
        const quantity = raw?.quantity ?? cut?.quantity ?? 0;
        const unit = raw?.unit ?? cut?.unit ?? "";
        let group = groups.get(cutKey);
        if (!group) {
          group = { cutLabel, cutKey, rows: [] };
          groups.set(cutKey, group);
        }
        // Fold repeat (recipe, unit) uses of one cut into a single summed row.
        const existing = group.rows.find(
          (r) => r.recipeName === memberData.recipe.name && r.unit === unit
        );
        if (existing) existing.quantity += quantity;
        else
          group.rows.push({
            recipeName: memberData.recipe.name,
            quantity,
            unit,
          });
      }
      const result = [...groups.values()];
      if (result.length === 0) return null;
      result.forEach((g) =>
        g.rows.sort(
          (a, b) =>
            a.recipeName.localeCompare(b.recipeName) ||
            a.unit.localeCompare(b.unit)
        )
      );
      result.sort((a, b) => a.cutLabel.localeCompare(b.cutLabel));
      // Trim the shared raw-ingredient prefix ("onion (yellow) small-dice" ->
      // "small-dice") so the Cut column stays compact — the card title already
      // names the ingredient. Only when 2+ cuts share a word-boundary prefix,
      // so a lone cut or unrelated names are left intact.
      if (result.length >= 2) {
        let prefix = result
          .map((g) => g.cutLabel)
          .reduce((p, l) => {
            let i = 0;
            while (i < p.length && i < l.length && p[i] === l[i]) i++;
            return p.slice(0, i);
          });
        prefix = prefix.slice(0, prefix.lastIndexOf(" ") + 1);
        if (prefix.length > 2) {
          result.forEach((g) => {
            g.cutLabel = g.cutLabel.slice(prefix.length).trim() || g.cutLabel;
          });
        }
      }
      return result;
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

  // WeightsPanel's "Regenerate Plan" action (PREP-05). Reloads scheduler_config
  // (so a just-saved slider write is picked up even if the debounced write
  // resolved after this tap) and re-invokes the GA with that config's
  // persisted seed — generateSchedule is a pure function of
  // (weekGraph, config), so an unchanged config/weekGraph reproduces a
  // byte-identical schedule (deterministic, D-01a.1). Never touches
  // cook_progress — checked-off steps stay checked through a regenerate,
  // since checkedIds is derived from useCookProgress's own independent state.
  const performRegenerate = useCallback(async () => {
    try {
      setScheduleError(null);
      const freshConfig = await loadSchedulerConfig();
      const configToUse = freshConfig ?? schedulerConfig;
      if (!configToUse) return;
      setSchedulerConfig(configToUse);
      const generated = generateSchedule(weekGraph, configToUse);
      setSchedule(generated);
      setActualCompletions(new Map());
      nowStartRef.current = new Map();
    } catch (err) {
      console.error("Failed to regenerate cook-mode schedule:", err);
      setScheduleError(
        "Couldn't build a schedule for this week. Check the linter for missing step metadata, then try again."
      );
    }
  }, [weekGraph, schedulerConfig]);

  const handleRegenerateClick = useCallback(() => {
    // Destructive-adjacent confirmation only when regenerating would
    // recalculate timing out from under already-checked-off steps
    // (05-UI-SPEC.md copy contract); no checked-off steps -> no confirmation.
    if (checkedIds.size > 0) {
      setRegenerateConfirmOpen(true);
      return;
    }
    performRegenerate();
  }, [checkedIds, performRegenerate]);

  const handleConfirmRegenerate = useCallback(() => {
    setRegenerateConfirmOpen(false);
    performRegenerate();
  }, [performRegenerate]);

  // On-demand linter v2 (PREP-06). Runs the two v2 aggregators against THIS
  // planned week: `runStepLint` over every real authored step (deduped by id —
  // the same recipe planned twice shares step records; synthetic merged-prep
  // nodes are graph-only and never linted), and `runWeekLint` over the week
  // graph plus its derived stored/inventory consumptions (the missing-pull-step
  // rule's cross-recipe input). This is the "linter, run on demand, flags
  // step-metadata and pull-step violations" surface (Phase 5 success criterion
  // 5); the publish-gate wiring of the same rules stays a Phase 6 concern.
  const handleRunLint = useCallback(() => {
    const stepsById = new Map<string, RecipeStep>();
    for (const recipeData of mealKeyedRecipeData.values()) {
      for (const step of recipeData.steps) stepsById.set(step.id, step);
    }
    const includedIds = new Set(weekGraph.nodes.map((node) => node.id));
    const consumptions = collectStoredInputConsumptions(
      mealKeyedRecipeData,
      includedIds
    );
    setLintFindings([
      ...runStepLint([...stepsById.values()]),
      ...runWeekLint(weekGraph, consumptions),
    ]);
  }, [mealKeyedRecipeData, weekGraph]);

  const handleToggleChecked = useCallback(
    (instance: StepInstance) => {
      if (!schedule || !schedulerConfig) return;
      const nextChecked = !checkedIds.has(instance.id);
      cookProgress.setChecked(instance.id, nextChecked);

      setActualCompletions((prev) => {
        const next = new Map(prev);
        if (nextChecked) {
          // A step checked off from the "Now" card has a real anchor -> use the
          // measured elapsed time. A step checked off from the Full Schedule
          // (never surfaced as "Now") has no anchor: fall back to its ESTIMATE
          // (active + passive), not (Date.now() - Date.now()) ≈ 0, which would
          // log a real task as instantaneous and mis-time everything downstream.
          const anchor = nowStartRef.current.get(instance.id);
          const estimate =
            (instance.step.active_minutes ?? 0) +
            (instance.step.passive_minutes ?? 0);
          const elapsedMinutes = anchor
            ? Math.max(0, (Date.now() - anchor) / 60000)
            : estimate;
          next.set(instance.id, elapsedMinutes);
        } else {
          next.delete(instance.id);
        }
        const retimed = retimeSchedule(
          schedule.order,
          next,
          emptyResourceTimeline(),
          schedulerConfig,
          weekGraph.edges
        );
        setSchedule(retimed);
        return next;
      });
    },
    [schedule, schedulerConfig, checkedIds, cookProgress, weekGraph]
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
          <Button
            variant="outlined"
            onClick={() => setShowWeightsPanel((s) => !s)}
          >
            {showWeightsPanel ? "Hide Weights" : "Weights"}
          </Button>
          <Button variant="outlined" onClick={handleRunLint}>
            Check plan
          </Button>
          <Button variant="outlined" onClick={() => navigate("/outputs")}>
            Back to Outputs
          </Button>
        </Box>
      </Box>

      {schedulerConfig && (
        <Collapse in={showWeightsPanel} timeout="auto" unmountOnExit>
          <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Scheduler Weights
            </Typography>
            <WeightsPanel
              config={schedulerConfig}
              onConfigSaved={setSchedulerConfig}
              onRegenerate={handleRegenerateClick}
            />
          </Paper>
        </Collapse>
      )}

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
                mergedBreakdown={getMergedBreakdown(nowInstance)}
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
                mergedBreakdown={getMergedBreakdown(nextInstance)}
                checked={checkedIds.has(nextInstance.id)}
                onToggleChecked={() => handleToggleChecked(nextInstance)}
                statusChip={getStatusChip(nextInstance, false)}
              />
            </Box>
          )}
        </Box>
      )}

      {schedule && (
        <Paper sx={{ mt: 4, p: { xs: 1, md: 2 } }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            px={1}
          >
            <Typography variant="subtitle1" fontWeight="bold">
              Full schedule
              <Typography component="span" color="text.secondary">
                {" "}
                — {orderedByTime.length} steps in order
              </Typography>
            </Typography>
            <Button size="small" onClick={() => setShowAllSteps((s) => !s)}>
              {showAllSteps ? "Hide" : "Show all"}
            </Button>
          </Box>
          <Collapse in={showAllSteps} timeout="auto" unmountOnExit>
            <List dense disablePadding sx={{ mt: 1 }}>
              {orderedByTime.map((inst) => {
                const checked = checkedIds.has(inst.id);
                const start = schedule.starts.get(inst.id) ?? 0;
                const resource = inst.step.resource ?? "none";
                const passive = inst.step.passive_minutes ?? 0;
                const resourceLabel =
                  resource === "oven" && inst.step.oven_temp_f
                    ? `oven ${inst.step.oven_temp_f}°`
                    : resource.replace(/_/g, " ");
                return (
                  <ListItem
                    key={inst.id}
                    disablePadding
                    secondaryAction={
                      resource !== "none" ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={resourceLabel}
                        />
                      ) : undefined
                    }
                  >
                    <ListItemButton
                      divider
                      onClick={() => handleToggleChecked(inst)}
                      sx={{ py: 0.5 }}
                    >
                      <Checkbox
                        edge="start"
                        checked={checked}
                        tabIndex={-1}
                        disableRipple
                      />
                      <Box
                        sx={{
                          minWidth: 44,
                          mr: 1,
                          fontVariantNumeric: "tabular-nums",
                          color: "text.secondary",
                          fontSize: 14,
                        }}
                      >
                        {formatOffset(start)}
                      </Box>
                      <ListItemText
                        primary={inst.step.name}
                        secondary={
                          passive > 0
                            ? `${inst.recipeName} · ${passive}m passive`
                            : inst.recipeName
                        }
                        sx={{
                          textDecoration: checked ? "line-through" : "none",
                          opacity: checked ? 0.55 : 1,
                          pr: 6,
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Collapse>
        </Paper>
      )}

      {/* Regenerate confirmation — only shown when >=1 step is already
          checked off (05-UI-SPEC.md destructive-adjacent confirmation
          copy). Accent green (primary), not error red — nothing is deleted,
          only recomputed; checked-off cook_progress is preserved through a
          regenerate regardless of confirm/cancel. */}
      <Dialog
        open={regenerateConfirmOpen}
        onClose={() => setRegenerateConfirmOpen(false)}
      >
        <DialogTitle>Regenerate Plan?</DialogTitle>
        <DialogContent>
          <Typography>
            Regenerating will keep your checked-off steps but recalculate remaining timing. Continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRegenerate}
            color="primary"
            variant="contained"
          >
            Regenerate
          </Button>
        </DialogActions>
      </Dialog>

      {/* On-demand linter v2 results (PREP-06). `lintFindings === null` means
          the linter hasn't been run; an empty array is the clean "no issues"
          state. */}
      <Dialog
        open={lintFindings !== null}
        onClose={() => setLintFindings(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Plan check</DialogTitle>
        <DialogContent>
          {lintFindings && lintFindings.length === 0 ? (
            <Typography color="text.secondary">
              No step-metadata or pull-step issues found for this week.
            </Typography>
          ) : (
            <List dense disablePadding>
              {lintFindings?.map((finding, i) => (
                <ListItem key={i} disableGutters alignItems="flex-start">
                  <Chip
                    size="small"
                    variant="outlined"
                    color={finding.severity === "error" ? "error" : "warning"}
                    label={finding.severity}
                    sx={{ mr: 1, mt: 0.25 }}
                  />
                  <ListItemText
                    primary={finding.message}
                    secondary={finding.rule}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLintFindings(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
