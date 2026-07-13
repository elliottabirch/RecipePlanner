/**
 * Seeded genetic-algorithm scheduler (PREP-03, D-01/D-01a/D-06). This is the
 * phase's one genuinely novel module — the user explicitly kept the full GA
 * over a simpler deterministic list-scheduler alternative (D-01), so the
 * three research-flagged risks (D-01a) are first-class, verifiable
 * requirements here, not incidental implementation detail:
 *
 *  1. Cross-operator determinism (D-01a.1): exactly ONE seeded `prando`
 *     instance is created per `scheduleWeek` call and threaded through every
 *     stochastic operator (initial-population generation, tournament
 *     selection, crossover cut-point choice, mutation swap-index choice).
 *     The JS built-in unseeded random function is never used anywhere in
 *     this module — grep-gated (T-05-09a) to guarantee zero uses across
 *     this whole directory. No operation relies on `Array.prototype.sort`
 *     tie-break stability — every sort in this file either sorts on a
 *     naturally-unique key (a StepInstance id string) or an explicit
 *     deterministic tie-break key (priority rank, then id) so ties can
 *     never occur silently. Every shuffle-like pick (the randomized
 *     topological sort below) uses a seeded Fisher–Yates-style "pick and
 *     remove" over an explicitly re-sorted candidate array — never
 *     `Array.prototype.sort(() => rng() - 0.5)`.
 *  2. Hidden hyperparameters (D-01a.2): population size, generation count,
 *     crossover/mutation rates, elitism count, and tournament size are code
 *     constants below (RESEARCH A5 defaults), deliberately OUTSIDE
 *     `SchedulerConfig` — tuning the user-facing weights panel can never
 *     silently change them.
 *  3. Instant recompute-on-check-off (D-01a.3): this module is the *only*
 *     place the GA ever runs. `retime.ts` (Plan 10) re-times the fixed
 *     `Schedule.order` this module returns; it never re-invokes the GA.
 *
 * SSGS decode (05-RESEARCH.md Pattern 4): the standard RCPSP decoding
 * procedure — walk a precedence-respecting activity list once; each
 * activity's start is the earliest instant at/after its precedence bound at
 * which the resource model (resources.ts) says it's feasible. `decodeSSGS`
 * below never produces a schedule that violates a DAG precedence edge or a
 * resource-feasibility constraint, regardless of which valid activity list
 * it is given — every GA-produced chromosome is precedence-valid by
 * construction (randomized topological sort for the initial population,
 * deterministic priority-based repair for crossover/mutation offspring), so
 * this guarantee holds for every individual the GA ever evaluates.
 *
 * Fitness objective (D-06): the PRIMARY term minimizes the active-session
 * span — see `computeActiveSessionSpan` below — NOT `sum(active_minutes)`,
 * which is invariant under any reordering of a fixed step set and therefore
 * cannot be a meaningful optimization target (Pitfall 1). Four secondary
 * terms (chopping consolidation, step grouping, elapsed span, resource
 * pressure) are weighted by `SchedulerConfig.weights` and are user-tunable;
 * the active-session-span term is the one the user cannot zero out via the
 * weights panel in isolation (D-06 confirms it as the intended primary
 * reading of "minimize active/hands-on time").
 */
import Prando from "prando";
import {
  emptyResourceTimeline,
  isFeasibleAt,
  nextCandidateTime,
  occupyResources,
  stepResource,
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

/**
 * Deterministically repair an arbitrary permutation of the same id set into
 * a valid topological order, treating the permutation as a priority list:
 * repeatedly pick, among the currently-available nodes, whichever appears
 * earliest in `priorityIds`. No PRNG draws — this is the trivial,
 * fully-deterministic repair 05-RESEARCH.md's D-01a.1 recommendation (a)
 * describes for crossover/mutation offspring, using an explicit rank key
 * (never sort-stability) as the tie-break.
 */
function repairToTopologicalOrder(
  priorityIds: string[],
  weekGraph: WeekGraph,
  graphIndex: GraphIndex
): string[] {
  const rank = new Map<string, number>();
  priorityIds.forEach((id, i) => rank.set(id, i));

  const remainingIndegree = new Map(graphIndex.indegree);
  const available = weekGraph.nodes
    .filter((node) => (remainingIndegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  const result: string[] = [];
  while (available.length > 0) {
    available.sort(
      (a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0) || a.localeCompare(b)
    );
    const picked = available.shift() as string;
    result.push(picked);

    for (const successor of graphIndex.successors.get(picked) ?? []) {
      const newIndegree = (remainingIndegree.get(successor) ?? 0) - 1;
      remainingIndegree.set(successor, newIndegree);
      if (newIndegree === 0) {
        available.push(successor);
      }
    }
  }
  return result;
}

/** Explicit deterministic comparator for two chromosomes — used as a
 * tie-break key everywhere fitness values are equal, never relying on
 * `Array.prototype.sort` stability (D-01a.1). */
function compareChromosomes(a: string[], b: string[]): number {
  return a.join("").localeCompare(b.join(""));
}

// ---------------------------------------------------------------------------
// GA operators — selection, crossover, mutation. All PRNG draws come from
// the ONE `rng` instance threaded in from `scheduleWeek`.
// ---------------------------------------------------------------------------

interface EvaluatedIndividual {
  chromosome: string[];
  schedule: Schedule;
  fit: number;
}

/** Tournament-selection sample size — not named in RESEARCH.md's A5 list, so
 * chosen as a conventional small-instance default; a fixed code constant
 * outside `SchedulerConfig`, per D-01a.2's intent. */
const TOURNAMENT_SIZE = 3;

function tournamentSelect(
  evaluated: EvaluatedIndividual[],
  rng: Prando
): string[] {
  let winner: EvaluatedIndividual | null = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const idx = rng.nextInt(0, evaluated.length - 1);
    const candidate = evaluated[idx];
    if (
      winner === null ||
      candidate.fit < winner.fit ||
      (candidate.fit === winner.fit &&
        compareChromosomes(candidate.chromosome, winner.chromosome) < 0)
    ) {
      winner = candidate;
    }
  }
  return (winner as EvaluatedIndividual).chromosome.slice();
}

/**
 * Order crossover (OX1): copy a randomly-chosen contiguous segment from
 * `parentA` verbatim, fill the remaining positions with `parentB`'s ids (in
 * `parentB`'s relative order, skipping ids already placed), producing a
 * full permutation of the same id set. This raw OX1 child generally is NOT
 * a valid topological order, so it is immediately repaired (D-01a.1
 * recommendation (a)) by treating it as a priority list.
 */
function orderCrossover(
  parentA: string[],
  parentB: string[],
  rng: Prando,
  weekGraph: WeekGraph,
  graphIndex: GraphIndex
): string[] {
  const n = parentA.length;
  if (n < 2) return parentA.slice();

  const cut1 = rng.nextInt(0, n - 2);
  const cut2 = rng.nextInt(cut1 + 1, n - 1);

  const segment = parentA.slice(cut1, cut2 + 1);
  const segmentSet = new Set(segment);
  const remainder = parentB.filter((id) => !segmentSet.has(id));

  const child = new Array<string>(n);
  for (let i = cut1; i <= cut2; i++) {
    child[i] = segment[i - cut1];
  }
  let ptr = 0;
  for (let offset = 0; offset < n; offset++) {
    const pos = (cut2 + 1 + offset) % n;
    if (pos >= cut1 && pos <= cut2) continue;
    child[pos] = remainder[ptr];
    ptr++;
  }

  return repairToTopologicalOrder(child, weekGraph, graphIndex);
}

/**
 * Swap mutation: swap two randomly-chosen positions (PRNG-drawn indices),
 * then repair back to a valid topological order (the swap alone can easily
 * violate precedence).
 */
function swapMutate(
  chromosome: string[],
  rng: Prando,
  weekGraph: WeekGraph,
  graphIndex: GraphIndex
): string[] {
  const n = chromosome.length;
  if (n < 2) return chromosome;

  const i = rng.nextInt(0, n - 1);
  const j = rng.nextInt(0, n - 1);
  const mutated = chromosome.slice();
  const tmp = mutated[i];
  mutated[i] = mutated[j];
  mutated[j] = tmp;

  return repairToTopologicalOrder(mutated, weekGraph, graphIndex);
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
    const resource = stepResource(instance.step);
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
// GA hyperparameters (D-01a.2/A5) — fixed code constants, OUTSIDE
// SchedulerConfig. These are RESEARCH.md's recommended small-RCPSP-instance
// defaults; retune here (never via `scheduler_config`) if real-world
// schedules look poor.
// ---------------------------------------------------------------------------
const POPULATION_SIZE = 60;
const GENERATIONS = 150;
const CROSSOVER_RATE = 0.85;
const MUTATION_RATE = 0.15;
const ELITISM = 2;

// ---------------------------------------------------------------------------
// The GA loop.
// ---------------------------------------------------------------------------

/**
 * Run the seeded GA over `weekGraph` and return the best `Schedule` found.
 * Deterministic: identical `(weekGraph, config)` — in particular identical
 * `config.seed` and `config.weights` — always produces a byte-identical
 * `Schedule` (D-01a.1), since exactly one `Prando` instance is created here
 * and threaded through every stochastic operator above (initial population,
 * tournament selection, crossover, mutation).
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

  const decode = (chromosome: string[]): Schedule =>
    decodeSSGS(chromosome, weekGraph, graphIndex, capacityConfig);

  let population: string[][] = [];
  for (let i = 0; i < POPULATION_SIZE; i++) {
    population.push(randomizedTopologicalOrder(weekGraph, graphIndex, rng));
  }

  let bestSchedule = decode(population[0]);
  let bestFitness = fitness(bestSchedule, config);

  for (let generation = 0; generation < GENERATIONS; generation++) {
    const evaluated: EvaluatedIndividual[] = population.map((chromosome) => {
      const schedule = decode(chromosome);
      return { chromosome, schedule, fit: fitness(schedule, config) };
    });
    evaluated.sort(
      (a, b) => a.fit - b.fit || compareChromosomes(a.chromosome, b.chromosome)
    );

    if (evaluated[0].fit < bestFitness) {
      bestFitness = evaluated[0].fit;
      bestSchedule = evaluated[0].schedule;
    }

    const nextPopulation: string[][] = [];
    for (let e = 0; e < ELITISM && e < evaluated.length; e++) {
      nextPopulation.push(evaluated[e].chromosome);
    }

    while (nextPopulation.length < POPULATION_SIZE) {
      const parentA = tournamentSelect(evaluated, rng);
      const parentB = tournamentSelect(evaluated, rng);

      let child =
        rng.next() < CROSSOVER_RATE
          ? orderCrossover(parentA, parentB, rng, weekGraph, graphIndex)
          : parentA.slice();

      if (rng.next() < MUTATION_RATE) {
        child = swapMutate(child, rng, weekGraph, graphIndex);
      }

      nextPopulation.push(child);
    }
    population = nextPopulation;
  }

  return bestSchedule;
}

/** Alias matching 05-09-PLAN.md's `generateSchedule(weekGraph, config)`
 * naming — `scheduleWeek` is the canonical export (matches genetic.test.ts's
 * import contract); both names resolve to the identical function. */
export const generateSchedule = scheduleWeek;
