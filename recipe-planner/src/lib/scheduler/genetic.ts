/**
 * Seeded genetic-algorithm scheduler (PREP-03, D-01/D-01a/D-06). This is the
 * phase's one genuinely novel module — the user explicitly kept the full GA
 * over a simpler deterministic list-scheduler alternative (D-01), so the
 * three research-flagged risks (D-01a) are first-class, verifiable
 * requirements here, not incidental implementation detail. This file will
 * grow a full seeded evolutionary loop (Task 2); this pass (Task 1) lands
 * the SSGS decode and the D-06 fitness function it evaluates against, plus
 * a single-chromosome `scheduleWeek` so the module has one concrete,
 * already-feasible entry point to build the GA loop around.
 *
 * SSGS decode (05-RESEARCH.md Pattern 4): the standard RCPSP decoding
 * procedure — walk a precedence-respecting activity list once; each
 * activity's start is the earliest instant at/after its precedence bound at
 * which the resource model (resources.ts) says it's feasible. `decodeSSGS`
 * below never produces a schedule that violates a DAG precedence edge or a
 * resource-feasibility constraint, regardless of which valid activity list
 * it is given.
 *
 * Fitness objective (D-06): the PRIMARY term minimizes the active-session
 * span — see `computeActiveSessionSpan` below — NOT `sum(active_minutes)`,
 * which is invariant under any reordering of a fixed step set and therefore
 * cannot be a meaningful optimization target (Pitfall 1). Four secondary
 * terms (chopping consolidation, step grouping, elapsed span, resource
 * pressure) are weighted by `SchedulerConfig.weights` and are user-tunable.
 *
 * Determinism (D-01a.1, threaded through even this single-chromosome pass):
 * the one stochastic operation this pass needs — picking a valid activity
 * list to decode — uses a seeded `prando` instance, never the JS built-in
 * unseeded random function, and never relies on `Array.prototype.sort`
 * tie-break stability (every sort here uses an explicit, naturally-unique
 * key). Task 2 threads this same seeded instance through every additional
 * GA operator (selection, crossover, mutation).
 */
import Prando from "prando";
import {
  emptyResourceTimeline,
  isFeasibleAt,
  nextCandidateTime,
  occupyResources,
  type ResourceCapacityConfig,
} from "./resources";
import type {
  Schedule,
  SchedulerConfig,
  StepInstance,
  WeekGraph,
} from "./types";

// ---------------------------------------------------------------------------
// Graph indexing — precomputed once per `scheduleWeek` call.
// ---------------------------------------------------------------------------

interface GraphIndex {
  /** StepInstance.id -> ids of every predecessor (edge.from where edge.to === id). */
  predecessors: Map<string, string[]>;
  /** StepInstance.id -> ids of every successor (edge.to where edge.from === id). */
  successors: Map<string, string[]>;
  /** StepInstance.id -> count of unresolved predecessors (baseline, from edges). */
  indegree: Map<string, number>;
}

function buildGraphIndex(weekGraph: WeekGraph): GraphIndex {
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of weekGraph.nodes) {
    predecessors.set(node.id, []);
    successors.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of weekGraph.edges) {
    predecessors.get(edge.to)?.push(edge.from);
    successors.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  return { predecessors, successors, indegree };
}

/**
 * Generate ONE random-but-precedence-valid activity list: a randomized
 * topological sort (05-RESEARCH.md Pattern 4 recommendation (b)) — at each
 * step, uniformly-at-random (via the seeded `rng`) pick among the
 * currently-available (no unresolved predecessors) nodes.
 *
 * The `available` candidate list is explicitly re-sorted by id (a unique
 * key) after every pick so the PRNG's index draw always maps onto the same
 * canonical ordering of the same candidate *set*, independent of
 * `weekGraph.nodes` array order — a seeded-Fisher–Yates-style "pick and
 * remove from an explicitly keyed list" pattern (D-01a.1), never
 * `Array.prototype.sort(() => rng() - 0.5)`.
 */
function randomizedTopologicalOrder(
  weekGraph: WeekGraph,
  graphIndex: GraphIndex,
  rng: Prando
): string[] {
  const remainingIndegree = new Map(graphIndex.indegree);
  const available = weekGraph.nodes
    .filter((node) => (remainingIndegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort();

  const result: string[] = [];
  while (available.length > 0) {
    const idx = rng.nextInt(0, available.length - 1);
    const picked = available[idx];
    available.splice(idx, 1);
    result.push(picked);

    for (const successor of graphIndex.successors.get(picked) ?? []) {
      const newIndegree = (remainingIndegree.get(successor) ?? 0) - 1;
      remainingIndegree.set(successor, newIndegree);
      if (newIndegree === 0) {
        available.push(successor);
      }
    }
    available.sort();
  }
  return result;
}

// ---------------------------------------------------------------------------
// SSGS decode.
// ---------------------------------------------------------------------------

function decodeSSGS(
  activityListIds: string[],
  weekGraph: WeekGraph,
  graphIndex: GraphIndex,
  capacityConfig: ResourceCapacityConfig
): Schedule {
  const nodeById = new Map(weekGraph.nodes.map((node) => [node.id, node]));
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const timeline = emptyResourceTimeline();
  const order: StepInstance[] = [];

  for (const id of activityListIds) {
    const instance = nodeById.get(id);
    if (!instance) continue;

    const predecessorIds = graphIndex.predecessors.get(id) ?? [];
    const precedenceBound = predecessorIds.reduce(
      (bound, predId) => Math.max(bound, ends.get(predId) ?? 0),
      0
    );

    let candidate = precedenceBound;
    while (!isFeasibleAt(candidate, instance.step, timeline, capacityConfig)) {
      candidate = nextCandidateTime(candidate, timeline);
    }

    const active = instance.step.active_minutes ?? 0;
    const passive = instance.step.passive_minutes ?? 0;
    const end = candidate + active + passive;

    starts.set(id, candidate);
    ends.set(id, end);
    occupyResources(timeline, instance.step, candidate, end);
    order.push(instance);
  }

  return { order, starts, ends };
}

// ---------------------------------------------------------------------------
// Fitness (D-06). PRIMARY term: active-session span. Four secondary,
// user-tunable terms read from `config.weights`.
// ---------------------------------------------------------------------------

/**
 * D-06 primary objective / Pitfall-1-safe formalization of "minimize
 * active/hands-on time": the span from the schedule's earliest step start
 * to the latest step's own fully-decoded finish (`Schedule.ends`, which
 * already encodes that step's own active-then-passive resource window —
 * see `resources.ts`/Pattern 2). This is deliberately NOT
 * `sum(active_minutes)` — that sum is a constant for any fixed set of
 * planned steps and is invariant under reordering (Pitfall 1), so it cannot
 * be a meaningful GA objective. A well-packed schedule (later steps'
 * active bursts absorbed into earlier steps' passive windows) pulls every
 * instance's own finish earlier, shrinking this span; a fully-serialized
 * schedule (each step waiting for the prior step's entire resource window)
 * maximizes it.
 */
export function computeActiveSessionSpan(schedule: Schedule): number {
  if (schedule.order.length === 0) return 0;

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const instance of schedule.order) {
    const start = schedule.starts.get(instance.id) ?? 0;
    const end = schedule.ends.get(instance.id) ?? start;
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd - minStart;
}

/** Secondary "elapsed time" weight: the schedule's literal wall-clock
 * makespan (first start to last finish, including any unattended passive
 * tail). Independently weighted from the primary span so the user can dial
 * each to taste (D-06/CONTEXT "elapsed time is secondary"). */
function computeElapsedSpan(schedule: Schedule): number {
  return computeActiveSessionSpan(schedule);
}

/** Count adjacent-pair "breaks" in `schedule.order` where `keyFn` differs —
 * a lower count means more of that key's instances were scheduled next to
 * each other (better consolidation/grouping). Used for both the chopping
 * (shared `prep_action`) and grouping (shared `plannedMealId`, per A3's
 * "shared recipe/meal adjacency" default) secondary terms. */
function countAdjacencyBreaks(
  schedule: Schedule,
  keyFn: (instance: StepInstance) => string | undefined
): number {
  let breaks = 0;
  for (let i = 1; i < schedule.order.length; i++) {
    if (keyFn(schedule.order[i - 1]) !== keyFn(schedule.order[i])) {
      breaks++;
    }
  }
  return breaks;
}

/** Secondary "resource pressure" weight: the peak number of concurrently
 * open resource windows (oven/stovetop/appliance — `resource !== "none"`)
 * at any instant, via a sweep line over each instance's own
 * `[start, end)` footprint. Because the implicit cook resource always
 * serializes ACTIVE windows (enforced structurally by `decodeSSGS` via
 * `resources.ts`, regardless of fitness weights), only the passive/resource
 * tails can overlap — this term rewards orderings that spread that overlap
 * out rather than stacking many appliances open at once. */
function computeResourcePressure(schedule: Schedule): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const instance of schedule.order) {
    const resource = instance.step.resource ?? "none";
    if (resource === "none") continue;
    const start = schedule.starts.get(instance.id) ?? 0;
    const end = schedule.ends.get(instance.id) ?? start;
    events.push({ t: start, delta: 1 });
    events.push({ t: end, delta: -1 });
  }
  // Explicit deterministic ordering: time ascending, then delta ascending
  // (ends before starts at the same instant, matching the half-open
  // interval semantics `resources.ts#overlaps` uses) — never sort-stability.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let concurrent = 0;
  let peak = 0;
  for (const event of events) {
    concurrent += event.delta;
    if (concurrent > peak) peak = concurrent;
  }
  return peak;
}

/**
 * Weighted-sum fitness. Lower is better. The PRIMARY term
 * (`weights.active * computeActiveSessionSpan`) is D-06's locked reading of
 * "minimize active/hands-on time"; the other four terms are secondary and
 * fully user-tunable (including zeroable) via `scheduler_config.weights`.
 */
export function fitness(schedule: Schedule, config: SchedulerConfig): number {
  const { weights } = config;
  const activeSpan = computeActiveSessionSpan(schedule);
  const elapsedSpan = computeElapsedSpan(schedule);
  const choppingBreaks = countAdjacencyBreaks(
    schedule,
    (instance) => instance.step.prep_action
  );
  const groupingBreaks = countAdjacencyBreaks(
    schedule,
    (instance) => instance.plannedMealId
  );
  const resourcePressure = computeResourcePressure(schedule);

  return (
    weights.active * activeSpan +
    weights.elapsed * elapsedSpan +
    weights.chopping * choppingBreaks +
    weights.grouping * groupingBreaks +
    weights.resource_pressure * resourcePressure
  );
}

// ---------------------------------------------------------------------------
// Entry point (single-chromosome pass — Task 2 replaces the body with a
// full seeded evolutionary loop over this same decode/fitness pair).
// ---------------------------------------------------------------------------

/**
 * Decode ONE seeded, precedence-valid activity list for `weekGraph` and
 * return its SSGS-decoded `Schedule`. Deterministic: identical
 * `(weekGraph, config.seed)` always produces the same activity list (one
 * seeded `Prando` instance, no other stochastic input), and `decodeSSGS`
 * is itself a pure function of that list plus the resource model.
 */
export function scheduleWeek(
  weekGraph: WeekGraph,
  config: SchedulerConfig
): Schedule {
  if (weekGraph.nodes.length === 0) {
    return { order: [], starts: new Map(), ends: new Map() };
  }

  const rng = new Prando(config.seed);
  const graphIndex = buildGraphIndex(weekGraph);
  const capacityConfig: ResourceCapacityConfig = {
    ovenRackSlots: config.oven_rack_slots,
    burnerCount: config.burner_count,
  };

  const chromosome = randomizedTopologicalOrder(weekGraph, graphIndex, rng);
  return decodeSSGS(chromosome, weekGraph, graphIndex, capacityConfig);
}
