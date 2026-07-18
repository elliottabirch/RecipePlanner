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
// order the GA (or a prior retime) decided is never permuted; only
// `starts`/`ends` recompute (D-01a.3 "order is authoritative, the clock
// adapts"). 260717-25d: that invariant covers `schedule.order`, not what
// RENDERS — the rendered list comes from `orderedByTime`, which is a
// **frozen display order** (`display-order.ts`) established once at
// generation and never re-sorted by a retime's live `starts`. This page
// builds NO affordance that implies a card's position in the sequence can
// be manually changed; the only way the order changes is an explicit
// Regenerate.
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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import DoneIcon from "@mui/icons-material/Done";
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
import { StepType, ProductType } from "../lib/types";
import type {
  PlannedMealWithRecipe,
  RecipeGraphData,
} from "../lib/aggregation";
import { buildWeekGraph } from "../lib/scheduler/week-graph";
import { collectDayOfWork, formatDayOfSummary } from "../lib/scheduler/day-of-work";
import { generateSchedule } from "../lib/scheduler/genetic";
import { retimeSchedule } from "../lib/scheduler/retime";
import { freezeDisplayOrder, applyDisplayOrder } from "../lib/scheduler/display-order";
import { emptyResourceTimeline } from "../lib/scheduler/resources";
import { loadSchedulerConfig } from "../lib/scheduler/scheduler-config";
import type { Schedule, StepInstance, WeekGraph } from "../lib/scheduler/types";
import { deriveReadiness } from "../lib/scheduler/readiness";
import { deriveConvergence } from "../lib/scheduler/convergence";
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
  type RecipeView,
  type ScaledIngredient,
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
  // The FROZEN display order (260717-25d) — StepInstance ids in the sequence
  // established at generation time. `null` means no schedule yet. Established
  // at BOTH generation sites (`handleGenerateSchedule`, `performRegenerate`)
  // and NEVER touched by `handleToggleChecked` — that is the entire fix for
  // the display-order shuffle. See `display-order.ts` for the sort itself.
  const [displayOrder, setDisplayOrder] = useState<string[] | null>(null);

  // Anchor (epoch ms) for when a StepInstance became the current "now" card —
  // drives both the live passive countdown and the real-elapsed-minutes input
  // to retimeSchedule on check-off. In-memory only for this session; a
  // refresh restarts anchors (checked-off progress itself still restores from
  // cook_progress via useCookProgress, independent of these anchors).
  const nowStartRef = useRef<Map<string, number>>(new Map());
  const [tick, forceTick] = useState(0);
  // Passive windows the cook has finished EARLY (tapped ✓ before the clock ran
  // out) — e.g. a simmer that reduced faster than its estimate. These drop out
  // of `runningWindows` immediately so a phantom timer never keeps blocking a
  // dependent. Session-local like `nowStartRef` (both reset on load/regenerate),
  // since the running-window surface is itself derived from wall-clock anchors
  // that do not survive a reload.
  const [passiveCompletedIds, setPassiveCompletedIds] = useState<Set<string>>(
    new Set()
  );
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

  // Steps blocked by a missing source: they consume a stored/transient input
  // that nothing in the planned week produces and that isn't prior stock (the
  // missing-pull-step finding — e.g. a combine step whose peanut dressing no
  // step makes). Such a step can never become "ready" no matter what the cook
  // checks off, so its chip must say so instead of reading "ready"
  // (unproduced-non-raw-inputs, 260718). Maps consumer StepInstance.id -> the
  // product name(s) it has no source for. Runs the same week lint as the
  // "Check plan" dialog, but continuously so the chip is always honest.
  const blockedInfoById = useMemo(() => {
    const includedIds = new Set(weekGraph.nodes.map((node) => node.id));
    const consumptions = collectStoredInputConsumptions(
      mealKeyedRecipeData,
      includedIds
    );
    const nameByProductId = new Map(
      consumptions.map((c) => [c.productId, c.productName])
    );
    const map = new Map<string, string[]>();
    for (const finding of runWeekLint(weekGraph, consumptions)) {
      if (finding.rule !== "missing-pull-step" || !finding.nodeId) continue;
      const name = finding.productId
        ? nameByProductId.get(finding.productId) ?? finding.productId
        : "an input";
      const list = map.get(finding.nodeId) ?? [];
      list.push(name);
      map.set(finding.nodeId, list);
    }
    return map;
  }, [weekGraph, mealKeyedRecipeData]);

  // The exact complement of week-graph.ts:158's just_in_time exclusion —
  // `mealKeyedRecipeData` already holds every step unfiltered (the loader
  // fetches `recipe_steps` unfiltered above; only `buildWeekGraph` filters
  // them), so this needs no extra fetch. Names the day-of cooking that
  // remains once the prep-day list is exhausted, instead of letting the
  // "All steps complete!" Paper below assert something untrue.
  const dayOfMeals = useMemo(
    () => collectDayOfWork(mealKeyedRecipeData),
    [mealKeyedRecipeData]
  );
  const dayOfSummary = useMemo(() => formatDayOfSummary(dayOfMeals), [dayOfMeals]);

  const stepLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of weekGraph.nodes)
      map.set(node.id, node.displayName ?? node.step.name);
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
  //
  // 260717-25d: this sort now runs ONCE, at generation (`freezeDisplayOrder`,
  // called from `handleGenerateSchedule`/`performRegenerate` below) — NOT on
  // every render. `orderedByTime` just replays that frozen `displayOrder`
  // against the current `schedule.order` via `applyDisplayOrder`, which sorts
  // by frozen INDEX, never by live `schedule.starts`. A retime (check-off)
  // still updates `schedule.starts`/`ends` — the cards' displayed times keep
  // reading those directly below — but the SEQUENCE cannot move until the
  // next explicit Regenerate re-establishes both together.
  const orderedByTime = useMemo(() => {
    if (!schedule || !displayOrder) return [];
    return applyDisplayOrder(schedule, displayOrder);
  }, [schedule, displayOrder]);

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

  // Running passive windows: steps already checked off (active part done) whose
  // simmer/bake timer is still counting down. `getCountdown` reads the same
  // `nowStartRef` anchor + wall clock the now-card uses; anchors survive
  // check-off (the ref is only cleared on load/regenerate), so a checked-off
  // timer is still computable — it just has nowhere to render until now. We walk
  // `orderedByTime` (retains checked steps, unlike `visibleOrder`) and keep the
  // ones whose window hasn't elapsed. Recomputes every second via `tick` so the
  // strip counts down and a window drops the instant it hits 0:00.
  const runningWindows = useMemo(() => {
    void tick; // re-run each 1s forceTick so the wall-clock read stays live
    return orderedByTime
      .filter(
        (inst) =>
          checkedIds.has(inst.id) &&
          (inst.step.passive_minutes ?? 0) > 0 &&
          !passiveCompletedIds.has(inst.id)
      )
      .map((inst) => ({ instance: inst, countdown: getCountdown(inst) }))
      .filter(
        (w): w is { instance: StepInstance; countdown: { text: string; done: boolean } } =>
          w.countdown !== null && !w.countdown.done
      );
  }, [orderedByTime, checkedIds, getCountdown, tick, passiveCompletedIds]);

  // Finish a running passive window early: the timer allotted N minutes but the
  // pot is done now, so mark it complete so it stops blocking later steps. Drops
  // it from `runningWindows` → `runningPassiveSet`, flipping any dependent that
  // was only waiting on this window to "ready".
  const handleCompletePassive = useCallback((stepInstanceId: string) => {
    setPassiveCompletedIds((prev) => {
      const next = new Set(prev);
      next.add(stepInstanceId);
      return next;
    });
  }, []);

  // The set that makes `deriveReadiness` passive-aware: a producer in here is
  // checked but still simmering, so it must NOT yet flip its dependents to
  // "ready". Plus a label lookup so a blocked dependent can read the remaining
  // time ("12:34 left on the simmer") instead of a bare "waiting".
  const runningPassiveSet = useMemo(
    () => new Set(runningWindows.map((w) => w.instance.id)),
    [runningWindows]
  );
  const runningTextById = useMemo(
    () =>
      new Map(runningWindows.map((w) => [w.instance.id, w.countdown.text])),
    [runningWindows]
  );

  const getStatusChip = useCallback(
    (instance: StepInstance, isNowCard: boolean): StatusChip | null => {
      // Blocked wins over every other state: this step consumes something no
      // step in the plan makes, so it can never become ready (260718).
      const blockedNames = blockedInfoById.get(instance.id);
      if (blockedNames && blockedNames.length > 0) {
        return {
          state: "blocked",
          label: `blocked: nothing makes ${blockedNames.join(", ")}`,
        };
      }

      if (instance.step.step_type === StepType.Assembly) {
        const readiness = deriveReadiness(
          instance.id,
          weekGraph,
          checkedIds,
          runningPassiveSet
        );
        if (readiness.state === "waiting") {
          const parts: string[] = [];
          if (readiness.waitingOn.length > 0) {
            const labels = readiness.waitingOn.map(
              (id) => stepLabelById.get(id) ?? id
            );
            parts.push(`waiting on: ${labels.join(", ")}`);
          }
          for (const id of readiness.simmering) {
            const label = stepLabelById.get(id) ?? id;
            const remaining = runningTextById.get(id);
            parts.push(
              remaining ? `${remaining} left on ${label}` : `${label} still cooking`
            );
          }
          return { state: "waiting", label: parts.join(" · ") };
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
    [
      weekGraph,
      checkedIds,
      stepLabelById,
      getCountdown,
      runningPassiveSet,
      runningTextById,
      blockedInfoById,
    ]
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
        const cutLabel =
          cut?.productName ?? instance.displayName ?? instance.step.name;
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
        else {
          // Per-recipe convergence (merged-prep caveat): this recipe's portion
          // of the shared cut has its OWN downstream destination.
          const conv = deriveConvergence(member.stepId, memberData);
          group.rows.push({
            recipeName: memberData.recipe.name,
            quantity,
            unit,
            combinesWith: conv?.combinesWith,
            destination: conv?.destination,
          });
        }
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

  // Downstream convergence for the card (container-convergence-indicator todo):
  // which other ingredients this step's output combines with, and into which
  // container. Intra-recipe walk on the step's own RecipeGraphData; null on
  // week-wide merged-prep nodes (they span several recipes with per-recipe
  // destinations — deferred), which have no `plannedMealId` recipe entry.
  const getConvergence = useCallback(
    (instance: StepInstance) => {
      if (instance.mergedMembers) return null;
      const recipeData = mealKeyedRecipeData.get(instance.plannedMealId);
      if (!recipeData) return null;
      return deriveConvergence(instance.step.id, recipeData);
    },
    [mealKeyedRecipeData]
  );

  // Full-recipe payloads for the card's "view recipe" book button
  // (full-recipe-text-on-cook-mode-card todo): the recipe's prose (Recipe.notes)
  // plus this week's scaled ingredient list (its raw/inventory inputs across all
  // steps, deduped). One view per contributing recipe — an ordinary node yields
  // one; a merged-prep node yields one per distinct recipe it spans (the todo's
  // "offer a list of the contributing recipes" resolution). Empty → no button.
  const buildRecipeView = useCallback(
    (recipeData: RecipeGraphData): RecipeView => {
      const byId = new Map<string, ScaledIngredient>();
      for (const step of recipeData.steps) {
        for (const input of extractStepInputs(
          step.id,
          recipeData,
          plannedMealQuantityById
        )) {
          if (
            input.productType !== ProductType.Raw &&
            input.productType !== ProductType.Inventory
          ) {
            continue;
          }
          const existing = byId.get(input.productId);
          if (existing && existing.unit === input.unit) {
            existing.quantity += input.quantity;
          } else if (!existing) {
            byId.set(input.productId, {
              productName: input.productName,
              quantity: input.quantity,
              unit: input.unit,
            });
          }
        }
      }
      return {
        recipeName: recipeData.recipe.name,
        notes: recipeData.recipe.notes ?? null,
        ingredients: [...byId.values()],
      };
    },
    [plannedMealQuantityById]
  );

  const getRecipeViews = useCallback(
    (instance: StepInstance): RecipeView[] => {
      if (instance.mergedMembers) {
        // One view per distinct recipe this merged prep spans (dedupe by the
        // recipe record id — the same recipe planned twice must not repeat).
        const seen = new Set<string>();
        const views: RecipeView[] = [];
        for (const member of instance.mergedMembers) {
          const memberData = mealKeyedRecipeData.get(member.plannedMealId);
          if (!memberData || seen.has(memberData.recipe.id)) continue;
          seen.add(memberData.recipe.id);
          views.push(buildRecipeView(memberData));
        }
        return views;
      }
      const recipeData = mealKeyedRecipeData.get(instance.plannedMealId);
      return recipeData ? [buildRecipeView(recipeData)] : [];
    },
    [mealKeyedRecipeData, buildRecipeView]
  );

  const handleGenerateSchedule = useCallback(() => {
    if (!schedulerConfig) return;
    try {
      setScheduleError(null);
      const generated = generateSchedule(weekGraph, schedulerConfig);
      setSchedule(generated);
      // Establishment, not a thaw (260717-25d): this button only renders
      // inside the `!schedule` branch below, so it can never fire while a
      // frozen order already exists — freeze alongside the same reset this
      // site already performs for actualCompletions/nowStartRef.
      setDisplayOrder(freezeDisplayOrder(generated));
      setActualCompletions(new Map());
      nowStartRef.current = new Map();
      setPassiveCompletedIds(new Set());
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
      // The ONE real thaw (260717-25d, user decision): re-freezing here in
      // the same assignment as setSchedule collapses "clear + establish"
      // into one step, so there is never a window where `schedule` exists
      // without a matching `displayOrder`. This is the only place the
      // sequence is allowed to change — the confirmation dialog already
      // tells the cook so ("recalculate remaining timing").
      setDisplayOrder(freezeDisplayOrder(generated));
      setActualCompletions(new Map());
      nowStartRef.current = new Map();
      setPassiveCompletedIds(new Set());
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

      if (!nextChecked) {
        // Un-checking re-opens the step: drop any early-complete mark so a fresh
        // passive window can start if it is checked off again.
        setPassiveCompletedIds((prev) => {
          if (!prev.has(instance.id)) return prev;
          const next = new Set(prev);
          next.delete(instance.id);
          return next;
        });
      }

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

      {/* Running-now strip: a checked-off timed step's simmer/bake keeps counting
          here so it can never vanish just because its step was checked off
          (2026-07-17 user report). Persistent + glanceable at the stove; a
          window drops itself the instant its countdown hits 0:00. */}
      {runningWindows.length > 0 && (
        <Paper variant="outlined" sx={{ mb: 3, p: { xs: 1.5, md: 2 } }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <TimerOutlinedIcon fontSize="small" /> Running now
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Tap ✓ to finish a timer early — its later steps unblock right away.
          </Typography>
          <List dense disablePadding>
            {runningWindows.map(({ instance, countdown }) => (
              <ListItem
                key={instance.id}
                disablePadding
                secondaryAction={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 20,
                        fontWeight: 600,
                      }}
                    >
                      {countdown.text}
                    </Box>
                    <IconButton
                      edge="end"
                      color="primary"
                      aria-label={`Finish ${instance.displayName ?? instance.step.name} now`}
                      onClick={() => handleCompletePassive(instance.id)}
                    >
                      <DoneIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={instance.displayName ?? instance.step.name}
                  secondary={instance.recipeName}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
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
      ) : visibleOrder.length === 0 && dayOfMeals.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="subtitle1" fontWeight="bold">
            All steps complete!
          </Typography>
          <Typography color="text.secondary">
            Every prep-day step in this plan has been checked off.
          </Typography>
        </Paper>
      ) : visibleOrder.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "left" }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom textAlign="center">
            Prep day complete.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }} textAlign="center">
            {dayOfSummary}
          </Typography>
          <List dense>
            {dayOfMeals.map((meal) => (
              <ListItem key={meal.plannedMealId} sx={{ display: "block" }}>
                <ListItemText
                  primary={meal.recipeName}
                  secondary={meal.steps.map((step) => step.name).join(", ")}
                />
              </ListItem>
            ))}
          </List>
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
                convergence={getConvergence(nowInstance)}
                recipeViews={getRecipeViews(nowInstance)}
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
                convergence={getConvergence(nextInstance)}
                recipeViews={getRecipeViews(nextInstance)}
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
                        primary={inst.displayName ?? inst.step.name}
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
