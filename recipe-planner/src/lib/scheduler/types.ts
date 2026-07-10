/**
 * Prep-day scheduler shared type vocabulary (PREP-03/04/05). These types
 * describe the GA scheduler's per-instance step nodes, resource-feasibility
 * timeline, and the decoded Schedule — never the aggregation module's
 * signature-merged `AggregatedFlowStep` batch view (see D-01a Pitfall 3:
 * that merge collapses two planned instances of the same recipe's step into
 * one node, which would make the scheduler lose per-meal precedence and
 * double-book resources).
 *
 * Determinism contract (D-01a): every stochastic GA operator (init,
 * selection, crossover, mutation) threads through exactly ONE seeded PRNG
 * (`prando`) — never `Math.random`, never engine-dependent `Array.sort`
 * stability. Shuffles use a seeded Fisher–Yates
 * (`prando.nextInt(0, i)` swap index), and every tie-break uses an explicit
 * deterministic key (never implicit sort stability). GA hyperparameters
 * (population, generations, crossover/mutation rates) are fixed code
 * constants in `genetic.ts`, deliberately kept OUTSIDE `SchedulerConfig`'s
 * user-tunable `weights` (D-01a.2/A5) so tuning the weights panel can never
 * silently change the hyperparameters.
 *
 * Resource model (D-05): the implicit singleton "cook" resource is busy only
 * during a step's `active_minutes` window (never `passive_minutes`) — this
 * is what lets one step's passive window absorb another step's active work,
 * which is the entire point of the D-06 objective below. Oven capacity is
 * `rack_slots`-metered AND same-temperature-only (Pitfall 2); stovetop is
 * `burner_count`-metered; blender/food_processor/instant_pot are singleton
 * (capacity 1) appliances.
 *
 * GA objective (D-06): the primary fitness term minimizes the
 * active-session span — `max(activeEnd) - min(activeStart)` across all
 * scheduled step instances — NOT `sum(active_minutes)`, which is invariant
 * under any reordering and therefore cannot be the objective (Pitfall 1).
 */
import type { RecipeStep, SchedulerConfig } from "../types";

/**
 * Per-instance step node. `id` is the stable, collision-proof key
 * `${plannedMealId}::${step.id}` — this exact format is also the
 * `cook_progress.step_instance` key and the `useCookProgress` filter key
 * (see PLAN key_links). Never merge two planned instances of the same
 * recipe's step into one node (Pitfall 3) — each planned meal gets its own
 * StepInstance even when the underlying `step` record is identical.
 */
export interface StepInstance {
  /** `${plannedMealId}::${step.id}` */
  id: string;
  plannedMealId: string;
  step: RecipeStep;
  recipeName: string;
}

/** A precedence edge: `from` must finish before `to` may start. */
export interface WeekGraphEdge {
  /** predecessor StepInstance.id */
  from: string;
  /** successor StepInstance.id */
  to: string;
}

/**
 * The merged week-wide DAG the GA schedules over. Built directly from
 * `MealKeyedRecipeData` (never from the aggregation module's signature-merged
 * `AggregatedFlowStep`s — see Pitfall 3). Cross-recipe edges connect a
 * stored/inventory output instance to every matching consuming input
 * instance in another planned meal (fan-in AND-semantics, A4: a consumer
 * waits on ALL matching producers, not just one).
 */
export interface WeekGraph {
  nodes: StepInstance[];
  edges: WeekGraphEdge[];
}

/**
 * A decoded schedule: `order` is the GA's authoritative activity-list
 * permutation (topologically valid), `starts`/`ends` are the SSGS-decoded
 * offsets in minutes, keyed by `StepInstance.id`. Per D-01a.3 ("order is
 * authoritative, the clock adapts"), cook-mode check-off never reorders
 * `order` — only `retime.ts` recomputes `starts`/`ends`.
 */
export interface Schedule {
  order: StepInstance[];
  starts: Map<string, number>;
  ends: Map<string, number>;
}

/**
 * Rolling occupancy state consumed by the SSGS decoder's feasibility check
 * (`resources.ts#isFeasibleAt`). All windows are `[start, end)` minute
 * offsets from t=0 of the schedule.
 */
export interface ResourceTimeline {
  /** The implicit singleton "cook" — busy only during a step's active window. */
  cookBusy: Array<{ start: number; end: number }>;
  /** Oven usage windows; same-temp-only overlap, metered by `rack_slots`. */
  ovenUsage: Array<{
    start: number;
    end: number;
    tempF: number;
    rackSlots: number;
  }>;
  /** Stovetop burner usage windows; metered by `scheduler_config.burner_count`. */
  activeBurners: Array<{ start: number; end: number }>;
  /** Singleton appliances (capacity 1 each). */
  singletonAppliances: Record<
    SingletonAppliance,
    Array<{ start: number; end: number }>
  >;
}

/** Kitchen appliances modeled as capacity-1 singletons (D-05). */
export type SingletonAppliance =
  | "blender"
  | "food_processor"
  | "instant_pot"
  | "microwave"
  | "sous_vide";

/**
 * Re-exported so scheduler modules import the config/weights shape from a
 * single place. The authoritative definition lives in `lib/types.ts`
 * (Plan 01, D-04) — this is a type-only re-export, not a redefinition.
 */
export type { SchedulerConfig };
