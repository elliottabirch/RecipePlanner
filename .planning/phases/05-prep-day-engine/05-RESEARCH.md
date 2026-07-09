# Phase 5: Prep-Day Engine - Research

**Researched:** 2026-07-09
**Domain:** Deterministic genetic-algorithm scheduling (RCPSP-style) + resource-constrained cook-mode UI + offline AI-assisted data backfill, all inside an existing React/TypeScript/PocketBase app
**Confidence:** MEDIUM (codebase facts HIGH; GA fitness/weight semantics and a few resource-timing rules are under-specified by the decision record and are flagged ASSUMED for planner/user confirmation)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scheduler algorithm**
- **D-01:** Keep the full seeded genetic algorithm exactly as the decision record (`plans/workflow-redesign.md` Topic 4) locks it — GA over the merged week-graph, fitness = weighted sum (active-time primary), subject to DAG precedence + resource constraints. User explicitly retained the GA after being shown research recommending a simpler deterministic list-scheduler for home scale (~10-40 step-instances). The ADR is unchanged.
- **D-01a (research-surfaced constraints the planner MUST address):** because the GA was kept despite the simpler alternative, the plan must explicitly solve the three risks the research flagged, or the GA becomes a determinism/perf liability:
  1. Cross-operator determinism — thread ONE seeded PRNG (not `Math.random`, not engine-dependent sort stability) through every stochastic operator (init, selection, crossover, mutation) so `(seed, weights, plan)` → byte-identical schedule across JS engines. (candidate dep: `prando`.)
  2. Hidden hyperparameters — population size, generations, mutation/crossover rates sit *outside* the exposed weights panel. Decide fixed defaults and document them; they must not silently change schedule output.
  3. Instant recompute-on-check-off — per-tap re-evolution risks the "feels instant on tablet" bar (PREP-04/AC5). Plan must bound GA cost or use a cheaper recompute path on check-off (e.g. re-time the fixed order rather than re-evolve — order is authoritative, clock adapts).
  - Documented upgrade/fallback path if the GA underperforms or can't hit the instant bar: seeded beam / multi-start SSGS, then a deterministic priority list scheduler. Not adopted now; recorded so it isn't re-derived later.

**Day-before prep horizon (the open seed) — CUT from Phase 5**
- **D-02:** Dropped entirely, not merely deferred. No `lead_time_minutes` field, no night-before checklist, no "tonight-for-tomorrow" cook-mode card. AC8 is removed. The scalar-vs-absolute-horizon question is moot. Still in scope: the linter v2 rule "stored/inventory input consumed by an assembly step with no preceding pull/thaw/make step" (the chicken-stock failure) — that catches the *missing step*, independent of lead time. `recipe_steps` gets NO `lead_time_minutes` column.

**Persistence**
- **D-03:** Cook-mode check-off progress → new `cook_progress` PocketBase collection, keyed by `(weekly_plan, step_instance)`, reusing Phase-2's `createSyncQueue` + optimistic-hook pattern (mirror `useShoppingState`, do NOT overload the `shopping_state` collection — different domain/keys). Cross-device, survives tablet refresh/sleep. Add to `collections` in `recipe-planner/src/lib/api.ts`.
- **D-04:** Scheduler config → new `scheduler_config` PocketBase collection (singleton / single JSON record): `{ seed, weights{active, chopping, grouping, elapsed, resource_pressure}, burner_count, oven_rack_slots, appliances[] }`. Shared across devices — tuning weights on the tablet persists to the laptop. Read by both the weights panel and the GA.

**Resource model**
- **D-05:** Full resource model. `recipe_steps` gains the Proposed §3.1 fields:
  - `resource` select enum: `oven` / `stovetop` / `blender` / `food_processor` / `instant_pot` / `none`
  - `oven_temp_f` (number, required when `resource = oven`) → drives the temperature-conflict rule (two different-temp oven steps cannot overlap)
  - `rack_slots` (number, default 1)
  - Stovetop modeled with a configurable burner count, default 4; singleton appliances (blender/food_processor/instant_pot) capacity 1 each.
  - Backfill infers `resource` / `oven_temp_f` / `rack_slots` from `prep_action` + step name (same offline draft pass as the core fields), editable afterward in the authoring UI, required at import for new recipes (linter-enforced). This resolves §7's "infer vs. require" in favor of infer-during-backfill. Without populated tags AC4 is untestable.

### Claude's Discretion
- **Backfill delivery surface:** in-app review page (`recipe-planner/src/pages/StepBackfill.tsx`) that consumes offline-drafted JSON (the `recipe-import` skill pattern — no runtime in-app LLM call), renders draft-vs-current per step, writes only on approval, idempotent on re-run. This follows the decision record's Phase-6 in-app direction; a `scripts/` variant is the documented fallback. Not separately discussed — following the record.
- **Core step-metadata schema** (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`) is locked by the record; `prep_action` enum values reuse Phase-1's controlled prep-verb list (one vocabulary).

### Deferred Ideas (OUT OF SCOPE)
- **Day-before prep horizon** (`lead_time_minutes`, night-before checklist, PREP-F1) — CUT from the product for now, not just this phase (D-02): the household has no pre-prep tasks. Revisit only if that changes.
- **Simpler scheduler** (deterministic list / beam-search) — documented fallback if the retained GA can't hit determinism or the instant-recompute bar (D-01/D-01a). Not in scope now.
- **Multi-cook scheduling, density/cross-dimension conversion, nutrition-aware sequencing** — out of scope by design.
- `swap-aware-prep-naming.md` todo — adjacent, not folded into Phase 5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PREP-01 | Recipe steps carry `active_minutes`, `passive_minutes`, `instructions`, and a controlled `prep_action` vocabulary | Schema section: exact current `recipe_steps` fields verified from `pb_schema.json`; two authoring-UI touchpoints located and line-cited in `RecipeEditor.tsx`; `StepNode.tsx` extension point identified; `prep_action` vocabulary source confirmed as the 6-verb list in `lib/linter/rules/prep-words.ts` |
| PREP-02 | The 185 existing steps are backfilled via an AI-assisted offline pass, reviewed in batches | `recipe-import` skill pattern read in full; offline-draft-JSON → in-app review → approve-to-write flow specified; idempotency rule (only touch steps still missing fields) specified |
| PREP-03 | A seeded, deterministic GA scheduler orders the merged week-graph with a resource model (oven racks + temperature, burners, singleton appliances) | Week-graph builder design (per-instance nodes, NOT the `step-utils.ts` signature-merge); SSGS decode algorithm; resource-feasibility model including the implicit singleton "cook" resource; PRNG determinism approach (`prando`, verified OK on package-legitimacy gate); fixed hyperparameter defaults recommended |
| PREP-04 | Interactive tablet cook mode shows now/next cards, readiness states, scaled quantities + instructions, and recomputes on check-off | Cheap re-time-not-re-evolve recompute path specified; readiness-state derivation from upstream check-off specified; `useCookProgress` hook designed as a direct `useShoppingState`/`sync-queue.ts` analog |
| PREP-05 | User can tune scheduler weights in-app and regenerate the plan | `scheduler_config` singleton collection design; weights panel re-run contract (same seed unless reseeded) |
| PREP-06 | Linter v2 flags the 3 step-metadata/pull-step rules on demand | Phase-1 linter v1 architecture read in full (`runLint` aggregator + pure rule-function pattern in `lib/linter/`); 3 new rule stubs specified following the identical pattern |
</phase_requirements>

## Summary

Phase 5 is architecturally straightforward on the data/UI side — it follows patterns Phases 1, 2, and 4 already established in this codebase (additive nullable PocketBase fields, a pure-function linter-rule pattern, an optimistic `createSyncQueue`-backed persistence hook) — but concentrates real algorithmic risk in one module: the seeded genetic-algorithm scheduler (PREP-03). The user explicitly kept the GA after being shown a simpler alternative, so the plan must treat GA determinism, fixed hyperparameters, and a cheap check-off recompute path as first-class, verifiable requirements, not incidental implementation detail.

The two hardest technical unknowns this research resolves are: (1) how to guarantee byte-identical GA output across JS engines — thread one seeded PRNG (`prando`, verified legitimate) through every stochastic operator and never rely on `Array.prototype.sort` stability, always breaking ties on an explicit deterministic key; and (2) what "minimize active time" concretely means as a fitness term, given that the *sum* of active minutes across a fixed set of steps cannot change with reordering — the only interpretation that is both non-trivial and consistent with the record's separate "elapsed time is secondary" weight is that the primary objective compresses the **active-session span** (first active step start → last active step finish) by packing active bursts into other steps' passive windows, while "elapsed time" separately measures the literal start-to-finish including any unattended tail. This reading is not spelled out in the decision record and is flagged `[ASSUMED]` — the planner should surface it to the user as a locked interpretation before implementation, since a wrong reading silently produces a "working" scheduler that optimizes the wrong thing.

A second load-bearing but unstated modeling detail: the record's "one cook assumed... which is precisely why active-time minimization is the objective rather than a resource" implies an **implicit singleton "cook" resource** that is occupied only during each step's `active_minutes` segment (never during `passive_minutes`) — this is what allows one step's passive window to "absorb" another step's active work. This must be modeled explicitly in the SSGS resource-feasibility check alongside the oven/stovetop/appliance model, or the scheduler will produce schedules the cook cannot physically execute (two simultaneous "active" steps).

The codebase groundwork is otherwise clean: `RecipeGraphData`/`MealKeyedRecipeData` already expose the pre-aggregation, per-recipe DAG structure the week-graph builder needs (`recipe-planner/src/lib/aggregation/types.ts`); the aggregation module's existing signature-merge (`recipe-planner/src/lib/aggregation/utils/step-utils.ts:createStepSignature`) is confirmed as the thing to *avoid* — the "chopping consolidation" weight exists precisely because the scheduler works on per-instance steps and achieves consolidation via schedule adjacency, not via graph-level merging (this resolves an apparent tension in the decision record and should be called out to the implementer). PocketBase schema changes are all additive/nullable and validate on both the `:8091` test and `:8090` prod instances (both confirmed reachable). The offline-backfill flow has a direct precedent in `.claude/skills/recipe-import/SKILL.md`'s draft-then-review pattern; no runtime LLM client is introduced.

**Primary recommendation:** Build the scheduler as three independently testable pure modules (`week-graph.ts`, `resources.ts`, `genetic.ts`) operating on per-instance step nodes; adopt `prando` as the single PRNG source threaded through every GA operator; fix GA hyperparameters (population, generations, rates) as code constants outside `scheduler_config`; implement check-off recompute as an O(n) re-timing pass over the GA's already-decided order, never a re-run of the GA itself.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Step metadata authoring (PREP-01) | Frontend (React page: `RecipeEditor.tsx`) | Database (PocketBase schema) | Existing Edit Step dialog + `handleSave`/`handleSaveEditedStep` pattern; pure UI + persistence, no server logic |
| AI backfill review (PREP-02) | Frontend (new `StepBackfill.tsx` page) | — (offline, out-of-runtime) | Draft JSON produced entirely outside the running app (Claude Code, offline); the app only reads/reviews/writes — no backend or LLM-infra tier involved |
| Week-graph builder (PREP-03) | Frontend library (`lib/scheduler/week-graph.ts`) | Database (read-only, via existing `getAll`/`api.ts`) | Pure function over already-fetched `MealKeyedRecipeData`; no new backend logic |
| Resource model (PREP-03) | Frontend library (`lib/scheduler/resources.ts`) | — | Pure constraint-checking function, consumed by the GA decoder; no persistence of its own (capacity config comes from `scheduler_config`) |
| GA scheduler (PREP-03) | Frontend library (`lib/scheduler/genetic.ts`) | Database (`scheduler_config` read, schedule not itself persisted — recomputed on demand) | Runs client-side in the browser/tablet; deterministic given `(seed, weights, plan)`, so no server-side computation or caching is required |
| Cook mode UI (PREP-04) | Frontend (new page/route) | Database (`cook_progress` collection via `useCookProgress`) | Mirrors Phase-2's `useShoppingState` tier split exactly |
| Weights panel + regenerate (PREP-05) | Frontend (new panel component) | Database (`scheduler_config` singleton) | Simple form-over-collection; regenerate button re-invokes the pure GA function client-side |
| Linter v2 (PREP-06) | Frontend library (`lib/linter/rules/*.ts`) | Database (read-only) | Extends the existing pure-rule-function pattern; surfaced via the same on-demand UI Phase 1 built |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `prando` | npm | ~5 yrs (published 2021-05, last modified 2022-06, current v6.0.1) | 63.4K/wk | github.com/zeh/prando | OK | Approved — recommended seeded-PRNG dependency for GA determinism (D-01a.1) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

No other new runtime dependency is needed for this phase. `prando`'s API (constructor `new Prando(seed?: number|string)`, `next(min,max)` float, `nextInt(min,max)` int inclusive-inclusive, `nextArrayItem`, `nextBoolean`, `reset()`, `skip(n)`) is confirmed from the project README `[CITED: github.com/zeh/prando]`. It has **no built-in array-shuffle method** — the README explicitly warns that repeated `nextArrayItem` calls do not guarantee non-repeating selection, and recommends implementing a shuffle transform. **Action for the planner:** implement a seeded Fisher–Yates shuffle using `prando.nextInt(0, i)` for the swap index at each step — do not attempt to `Array.prototype.sort(() => rng.next() - 0.5)` (a common but statistically-biased anti-pattern, and also not a safe determinism boundary since it invokes the comparator a variable, engine-dependent number of times).

**Alternative considered:** `seedrandom` (OK verdict, 7M/wk downloads, github.com/davidbau/seedrandom) — a more general seeded-RNG-as-`Math.random`-replacement library. `prando` is recommended over it because its typed `nextInt`/`next` API removes an entire class of "did I remember to floor/round correctly" bugs that a raw `[0,1)` float generator invites; either is legitimate.

**Installation:**
```bash
npm install prando
```

**Version verification:** `npm view prando version` → `6.0.1` (verified 2026-07-09; no `postinstall` script present).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prando` | ^6.0.1 | Single seeded PRNG threaded through GA init/selection/crossover/mutation | Purpose-built for exactly this determinism requirement; typed int/float/array helpers avoid ad-hoc `Math.random`-replacement bugs `[VERIFIED: npm registry]` |

### Supporting
No other new libraries are required. The scheduler, resource model, and week-graph builder are all pure TypeScript over data already available via the existing `pocketbase` client (`^0.26.5`, already a dependency) and `lib/aggregation` module. Cook mode and the weights panel reuse the existing MUI (`^7.3.6`) + React (`^19.2.0`) stack already in `package.json`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Full GA (D-01, locked) | Deterministic priority-list scheduler (single-pass SSGS over a fixed priority order, no evolution) | Simpler, trivially deterministic, near-instant; the documented fallback if the GA can't hit the instant-recompute bar. Not adopted now per explicit user decision. |
| Full GA (D-01, locked) | Seeded beam search / multi-start SSGS | Middle ground — some exploration without a full evolutionary loop; documented fallback, not adopted. |
| `prando` | Hand-rolled `mulberry32` (a ~5-line inline seeded PRNG, no dependency) | Slightly less code-weight, zero dependency, but reinvents a solved, tiny problem and loses the typed helper API; `prando` is small (no transitive deps) and OK-verified, so the dependency-avoidance argument is weak here `[CITED: multiple JS-PRNG sources]` |
| `prando`'s `nextArrayItem` in a loop | A hand-rolled seeded Fisher–Yates using `prando.nextInt` | Recommended — `nextArrayItem` is explicitly documented as non-shuffle-safe |

## Architecture Patterns

### System Architecture Diagram

```
WeeklyPlans.tsx (existing)
        |
        | plannedMeals[] for the week
        v
lib/aggregation.ts: buildMealKeyedRecipeData()  (existing, reused as-is)
        |
        | MealKeyedRecipeData: Map<plannedMealId, RecipeGraphData>
        v
lib/scheduler/week-graph.ts  [NEW]
  - flattens each RecipeGraphData's per-recipe DAG into PER-INSTANCE
    step nodes, keyed `${plannedMealId}::${step.id}`
  - adds cross-recipe precedence edges: stored/inventory OUTPUT
    product ID === consuming INPUT product ID in another planned meal
  - edge cases: producer absent -> input becomes a graph SOURCE (no
    edge, ready at t=0); multiple producers -> fan-in edges from
    every matching producer instance (conservative: consumer waits
    on ALL of them -- see Open Questions)
        |
        | WeekGraph { nodes: StepInstance[], edges: Edge[] }
        v
lib/scheduler/resources.ts  [NEW]
  - pure feasibility-check functions consumed by the GA decoder:
    isResourceFeasible(candidateStart, stepInstance, timeline, config)
  - models: implicit singleton "cook" resource (busy only during
    active_minutes), oven (rack_slots capacity + same-temp-only
    overlap rule), stovetop (burner_count capacity), singleton
    appliances (blender/food_processor/instant_pot, capacity 1 each)
        |
        v
lib/scheduler/genetic.ts  [NEW]
  - chromosome: activity-list permutation of step-instance IDs
    (respecting a topological pre-filter, see Pattern 1)
  - decode: Serial Schedule Generation Scheme (SSGS) using
    resources.ts for feasibility -> concrete start/end offsets
  - seeded PRNG (prando) threads through init population, tournament
    selection, order-crossover (OX1), swap mutation
  - fitness = weighted sum over scheduler_config.weights
    {active, chopping, grouping, elapsed, resource_pressure}
        |
        | Schedule { order: StepInstance[], starts: Map<id, minutes>,
        |            ends: Map<id, minutes> }
        v
   +----+----------------------------+
   |                                 |
   v                                 v
CookMode.tsx [NEW]              WeightsPanel.tsx [NEW]
  - now/next cards                 - sliders bound to
  - on check-off: DOES NOT           scheduler_config.weights
    re-run genetic.ts; calls        - "Regenerate plan" button
    a cheap re-time pass over        re-invokes genetic.ts with
    the FIXED `order` (see            same seed unless reseeded
    Pattern 3) using actual
    completion timestamps
  - readiness state derived from
    upstream-instance check-off
    in cook_progress
  - useCookProgress() hook
    (mirrors useShoppingState +
    sync-queue.ts) persists
    check-off state per
    (weekly_plan, step_instance)
        |
        v
   cook_progress collection (PocketBase, NEW)
```

### Recommended Project Structure
```
recipe-planner/src/lib/scheduler/
├── week-graph.ts       # builds per-instance WeekGraph from MealKeyedRecipeData
├── week-graph.test.ts
├── resources.ts        # resource-feasibility pure functions + implicit cook resource
├── resources.test.ts
├── genetic.ts           # seeded GA: init/select/crossover/mutate + SSGS decode + fitness
├── genetic.test.ts      # includes the D-01a.1 determinism regression test (see below)
├── retime.ts            # cheap check-off recompute: re-times a FIXED order given
│                        # actual completion timestamps (Pattern 3)
├── retime.test.ts
└── types.ts             # StepInstance, WeekGraph, Schedule, SchedulerConfig types
recipe-planner/src/hooks/
└── useCookProgress.ts   # createSyncQueue-backed hook, mirrors useShoppingState.ts
recipe-planner/src/pages/
├── StepBackfill.tsx     # offline-draft-JSON review/approve page (PREP-02)
└── CookMode.tsx         # new prep-day route, supersedes BatchPrepTab.tsx
recipe-planner/src/components/
├── cook-mode/
│   ├── NowNextCard.tsx
│   ├── ReadinessChip.tsx
│   └── WeightsPanel.tsx
recipe-planner/src/lib/linter/rules/
├── missing-pull-step.ts     # PREP-06 rule (a)
├── missing-durations.ts     # PREP-06 rule (b)
└── missing-prep-action.ts   # PREP-06 rule (c)
```

### Pattern 1: Week-graph builder — per-instance nodes, not the signature-merge

**What:** Build the scheduler's DAG directly from `MealKeyedRecipeData` (the pre-aggregation map of `plannedMealId -> RecipeGraphData`), producing one node per `(plannedMealId, recipe_step.id)` pair. **Do not** route through `recipe-planner/src/lib/aggregation/utils/step-utils.ts`'s `createStepSignature`/`addOrMergeStep`, which intentionally merges identical steps across meals into one aggregated batch-list entry (`recipe-planner/src/lib/aggregation/builders/step-builder.ts:97-187`) — that merge is correct for the flat batch-prep list (Topic 1) but would make the scheduler lose per-meal precedence edges and double-count resource usage.

**When to use:** Always, for the scheduler. The signature-merge stays exactly as-is for `BatchPrepTab.tsx`'s print view (kept per Topic 1) — do not touch `step-utils.ts`.

**Why this resolves an apparent tension:** the decision record's "chopping consolidation" weight only makes sense if the scheduler sees *multiple separate* step instances that could be scheduled adjacently — if the graph pre-merged identical dice-onion steps from two meals into one aggregate node (as the batch list does), there would be nothing left for the consolidation weight to reward. Per-instance nodes + a scheduling-adjacency reward is how "consolidation" is actually achieved.

**Example:**
```typescript
// Source: derived from recipe-planner/src/lib/aggregation/types.ts (RecipeGraphData,
// MealKeyedRecipeData) — this project's own existing types, read directly.
import type { MealKeyedRecipeData, RecipeGraphData } from "../aggregation/types";
import type { RecipeStep } from "../types";

export interface StepInstance {
  /** `${plannedMealId}::${step.id}` — stable, collision-proof per-instance key */
  id: string;
  plannedMealId: string;
  step: RecipeStep;
  recipeName: string;
}

export interface WeekGraphEdge {
  /** predecessor must finish before successor may start */
  from: string; // StepInstance.id
  to: string;   // StepInstance.id
}

export interface WeekGraph {
  nodes: StepInstance[];
  edges: WeekGraphEdge[];
}

export function buildWeekGraph(mealData: MealKeyedRecipeData): WeekGraph {
  const nodes: StepInstance[] = [];
  // (1) per-meal intra-recipe edges from productToStepEdges/stepToProductEdges
  // (2) cross-recipe edges: for every consuming input node's product ID, find
  //     ALL producing output nodes (across every OTHER planned meal) whose
  //     product ID matches and whose product.type is 'stored' | 'inventory';
  //     if none found, leave the input as a graph source (no edge) --
  //     "producer absent" is a linter concern (PREP-06 rule a), not a
  //     graph-builder error. If multiple producers match, fan in an edge
  //     from EVERY one (conservative default -- see Open Questions).
  // ... (full precedence-edge derivation omitted for brevity; both edge
  // cases above must have an explicit unit test per the Verification
  // Protocol.)
  return { nodes, edges: [] };
}
```

### Pattern 2: Resource-feasibility model as an SSGS constraint check

**What:** A pure function the GA's decoder calls once per candidate step, given the partial schedule built so far.

**When to use:** Inside the Serial Schedule Generation Scheme decode step (see Pattern 4).

**The implicit "cook" resource (critical, not explicit in the decision record — `[ASSUMED]`, flag to user):** exactly one cook exists, so no two step instances' `active_minutes` windows may overlap in the final schedule, regardless of what physical resource (if any) they use. A step's `passive_minutes` window does NOT occupy the cook — this is what lets one step's passive window "absorb" another step's active work, which is the entire point of the primary objective. **Assumed ordering within a single step:** `active_minutes` occurs first, `passive_minutes` second (you do the active work, then it goes in the oven/simmers/rests) — i.e. a step instance's timeline is `[start, start+active)` = cook-busy + resource-busy, `[start+active, start+active+passive)` = resource-busy only (oven/stovetop/appliance steps) or nothing-busy (resource = `none`, e.g. "let dough rest on the counter" — blocks only downstream precedence, not any resource).

```typescript
// Source: this project's design (no external citation — original synthesis
// of the decision record's resource-model prose into a checkable function).
export interface ResourceTimeline {
  cookBusy: Array<{ start: number; end: number }>;
  ovenUsage: Array<{ start: number; end: number; tempF: number; rackSlots: number }>;
  burnerCount: number; // from scheduler_config
  activeBurners: Array<{ start: number; end: number }>;
  singletonAppliances: Record<"blender" | "food_processor" | "instant_pot",
    Array<{ start: number; end: number }>>;
}

export function isFeasibleAt(
  candidateStart: number,
  step: { active: number; passive: number; resource: string; ovenTempF?: number; rackSlots: number },
  timeline: ResourceTimeline,
  config: { ovenRackSlots: number; burnerCount: number }
): boolean {
  const activeEnd = candidateStart + step.active;
  const resourceEnd = activeEnd + step.passive;

  // (1) cook is single-threaded during the active window only
  if (timeline.cookBusy.some((w) => overlaps(candidateStart, activeEnd, w.start, w.end))) {
    return false;
  }

  // (2) oven: same-temp-only overlap + rack-slot capacity across [start, resourceEnd)
  if (step.resource === "oven") {
    const overlapping = timeline.ovenUsage.filter((u) =>
      overlaps(candidateStart, resourceEnd, u.start, u.end)
    );
    if (overlapping.some((u) => u.tempF !== step.ovenTempF)) return false;
    const totalRackSlots = overlapping.reduce((s, u) => s + u.rackSlots, 0) + step.rackSlots;
    if (totalRackSlots > config.ovenRackSlots) return false;
  }

  // (3) stovetop: burner-count capacity across [start, resourceEnd)
  if (step.resource === "stovetop") {
    const concurrent = timeline.activeBurners.filter((b) =>
      overlaps(candidateStart, resourceEnd, b.start, b.end)
    ).length;
    if (concurrent + 1 > config.burnerCount) return false;
  }

  // (4) singleton appliances: capacity 1
  if (step.resource === "blender" || step.resource === "food_processor" || step.resource === "instant_pot") {
    const busy = timeline.singletonAppliances[step.resource];
    if (busy.some((w) => overlaps(candidateStart, resourceEnd, w.start, w.end))) return false;
  }

  return true;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
```

### Pattern 3: Cheap check-off recompute — re-time, don't re-evolve (D-01a.3)

**What:** On check-off, the GA's decided **order** is treated as authoritative and is never recomputed. Only the *clock* (start/end offsets) is recomputed, using actual completion timestamps in place of the GA's estimated durations for already-checked steps, and the resource model in place of estimates for not-yet-started steps.

**When to use:** Every check-off event in cook mode. This is the mechanism that satisfies "instant" (PREP-04/AC5) — it's an O(n) forward sweep over an already-fixed array, not a GA run.

```typescript
// Source: this project's design, directly implementing the decision record's
// "order is authoritative, clock adapts" principle (plans/workflow-redesign.md
// Topic 4) as a concrete algorithm.
export function retimeSchedule(
  fixedOrder: StepInstance[],
  actualCompletions: Map<string, number>, // stepInstanceId -> actual elapsed minutes
  resourceModel: ResourceTimeline,
  config: SchedulerConfig
): Schedule {
  // Walk fixedOrder once. For each step: if actualCompletions has an entry,
  // use the REAL clock time already elapsed for its resource/cook occupancy
  // (the cook ran 5 min late -> shift every downstream candidate start by the
  // same delta, same as a critical-path recompute). If not yet started, use
  // its estimated active/passive minutes and the Pattern-2 feasibility check
  // against the now-shifted timeline. This never permutes fixedOrder.
  throw new Error("implementation elided — see pattern description above");
}
```

### Pattern 4: Serial Schedule Generation Scheme (SSGS) decode

**What:** Standard RCPSP decoding procedure: given a chromosome (an activity-list permutation respecting precedence — i.e., a topological order), walk the list once; for each activity, its start time is the earliest time at or after its precedence-bound (max end-time of all predecessors already scheduled) at which `isFeasibleAt` (Pattern 2) succeeds. This produces an "active schedule" (no activity can start earlier without delaying another) — the standard optimality-preserving decode for GA-over-RCPSP `[CITED: RCPSP GA literature]`.

**When to use:** Every fitness evaluation during the GA's run (population init + every generation).

```typescript
// Source: standard SSGS pseudocode, adapted — see
// https://www.researchgate.net/publication/335586632 ("Pseudo code of Serial
// Schedule Generation Scheme") [CITED, MEDIUM confidence — paraphrased, not
// copied from a proprietary source]
export function decodeSSGS(
  activityList: StepInstance[], // must already respect a topological pre-filter
  weekGraph: WeekGraph,
  config: SchedulerConfig
): Schedule {
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  const timeline = emptyResourceTimeline(config);

  for (const instance of activityList) {
    const precedenceBound = Math.max(
      0,
      ...predecessorsOf(instance, weekGraph).map((p) => ends.get(p.id) ?? 0)
    );
    let candidate = precedenceBound;
    while (!isFeasibleAt(candidate, instance.step, timeline, config)) {
      candidate = nextCandidateTime(candidate, timeline); // advance to next resource-free instant
    }
    starts.set(instance.id, candidate);
    const end = candidate + instance.step.active_minutes + (instance.step.passive_minutes ?? 0);
    ends.set(instance.id, end);
    occupyResources(timeline, instance.step, candidate, end);
  }

  return { order: activityList, starts, ends };
}
```

**Producing a valid activity list from a raw GA chromosome:** a random permutation will usually violate precedence. The standard fix (used by essentially all activity-list GA implementations) is either (a) repair the chromosome to a valid topological order after crossover/mutation, or (b) generate the initial population and every offspring via a precedence-respecting randomized topological sort (at each step, pick uniformly-at-random, via the seeded PRNG, among the currently-available/no-predecessors-pending nodes) rather than shuffling a flat list and repairing after the fact. **Recommendation:** use (b) — it guarantees every chromosome the GA ever touches is precedence-valid by construction, so crossover (order crossover / OX1) only needs to preserve relative order of a segment and can be repaired trivially by re-running the randomized-topological-sort tie-break for any resulting duplicates/gaps.

### Anti-Patterns to Avoid
- **`Array.prototype.sort(() => rng() - 0.5)` for shuffling:** statistically biased (does not produce a uniform permutation) regardless of RNG quality, and its exact output additionally depends on the engine's sort algorithm and comparator call count — never use this for anything requiring determinism or fairness. Use a seeded Fisher–Yates instead.
- **Relying on `Array.prototype.sort` stability as a determinism guarantee:** modern engines (post-ES2019) do guarantee a stable sort, but the safer, engine-version-independent pattern is to never depend on tie-break-via-stability at all — always include an explicit deterministic tie-break key (e.g. append the item's stable id) in the comparator so ties never occur.
- **Re-running the GA on every check-off:** violates D-01a.3 and the "feels instant" bar even though a single GA run over ~10-40 step-instances is likely fast in absolute terms (see Common Pitfalls) — the *order* must never change mid-cook, only clock estimates, or the tablet UI will feel unstable (explicitly called out as a risk in the phase doc).
- **Routing the scheduler through `step-utils.ts`'s signature-merge:** loses per-meal precedence and double-books resources (see Pattern 1).
- **Using `Math.random()` anywhere in `lib/scheduler/`:** breaks the entire determinism contract; ESLint has no built-in rule for this — recommend a code-review checklist item / grep-based CI check (`grep -rn "Math.random" src/lib/scheduler/`) rather than relying on manual review.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded, engine-independent PRNG | A custom `Math.random`-seeding shim | `prando` (verified OK) | JS has no native seedable RNG; a hand-rolled xorshift/mulberry32 is *possible* (small, well-known algorithms exist) but reinvents a solved problem and adds a maintenance/review burden for zero benefit given `prando` is tiny, dependency-free, and OK-verified |
| Optimistic cross-device persistence with retry/backoff | A bespoke fetch-and-retry wrapper for `cook_progress` | `createSyncQueue` (`recipe-planner/src/lib/sync-queue.ts`, already built and tested in Phase 2) | Already handles coalescing, exponential backoff, retry-exhaustion tracking, and has a `sync-queue.test.ts` regression suite; `useShoppingState.ts` is the exact hook shape to mirror for `useCookProgress` |
| RCPSP-style scheduling decode | An ad-hoc greedy "just sort by earliest-deadline" heuristic | The Serial Schedule Generation Scheme (Pattern 4) | SSGS is the standard, well-studied decode that provably produces an "active" (non-improvable) schedule from any precedence-respecting activity list; ad-hoc heuristics have no such guarantee and are a common source of "why did it schedule this so badly" bug reports |

**Key insight:** every piece of this phase that *isn't* the GA itself has a near-exact precedent already merged into this codebase (Phase 1's linter-rule pattern, Phase 2's sync-queue/optimistic-hook pattern, Phase 4's `scaleQuantity`/`peopleMultiplier` pattern for scaled quantities in cook mode). Treat the GA module as the one genuinely novel piece and everything else as "copy the sibling pattern."

## Common Pitfalls

### Pitfall 1: "Minimize active time" is not a directly computable quantity
**What goes wrong:** An implementer takes the phrase literally and tries to minimize `sum(active_minutes)` across the schedule — but that sum is a constant for a fixed set of planned steps; no permutation changes it, so the "primary objective" appears to do nothing and the GA looks broken or its fitness landscape looks flat on that term.
**Why it happens:** The decision record's prose ("minimize active/hands-on time... elapsed time is secondary") sounds like two different measurements of total duration, but only one of them (elapsed span, start-to-finish) actually varies with ordering; the other needs a different formalization to be meaningful.
**How to avoid:** Formalize "active time" as the **active-session span** — `max(activeEnd) - min(activeStart)` across all step instances, i.e. how long the cook's hands are required to be engaged in total, including any idle gaps between active bursts caused by waiting on precedence/resources. A well-packed schedule minimizes this by overlapping active bursts with other steps' passive windows. This is `[ASSUMED]` — confirm with the user before implementation, since it changes what "primary objective" concretely optimizes.
**Warning signs:** Fitness function has a term that evaluates identically across every candidate schedule in the population.

### Pitfall 2: Oven temperature-conflict rule needs a shared, single "current temp" model, not a per-step lock
**What goes wrong:** Modeling the oven as a plain capacity resource (like a burner) allows two DIFFERENT temperatures to be "scheduled" concurrently as long as rack-slot capacity permits, which is physically wrong — an oven has one temperature at a time.
**Why it happens:** The natural first implementation treats `rack_slots` as the only constraint and forgets the temp-conflict rule is a *separate, harder* constraint (same-temp steps may share the oven up to rack capacity; different-temp steps may never overlap regardless of rack capacity).
**How to avoid:** Check temp-equality across ALL currently-overlapping oven usages before checking rack-slot capacity (see Pattern 2's `isFeasibleAt` — the temp check short-circuits before the capacity sum).
**Warning signs:** A test with two different-temp bakes scheduled concurrently passes when it shouldn't (AC4's explicit acceptance scenario — "two steps at different oven temps are flagged as non-overlapping").

### Pitfall 3: Signature-merged step aggregation silently breaks per-instance scheduling if reused
**What goes wrong:** Reusing `processRecipeSteps`/`AggregatedFlowStep` (the existing batch-list builder) for the scheduler seems like a shortcut (it's already built and tested) but its `addOrMergeStep` (`recipe-planner/src/lib/aggregation/builders/step-builder.ts:97-187`) merges identical steps across different planned meals into ONE node, summing quantities. A scheduler over these merged nodes loses the information needed to schedule the same recipe's two instances (e.g. planned twice in a week) as separate resource-consuming, separately-timed activities.
**Why it happens:** It's the only existing aggregation entry point that already resolves product-node relations, so it's tempting to reuse.
**How to avoid:** Build the week-graph from the raw `MealKeyedRecipeData`/`RecipeGraphData` structures directly (Pattern 1), never from `AggregatedFlowStep`.
**Warning signs:** A plan with the same recipe planned twice in one week produces only one scheduled instance of its steps instead of two.

### Pitfall 4: 185-step backfill produces plausible-but-wrong duration/resource estimates
**What goes wrong:** AI-drafted `active_minutes`/`passive_minutes`/`resource`/`oven_temp_f` are estimates, not measurements; a bad estimate produces a schedule that looks correct (no crash, no obviously wrong ordering) but is subtly miscalibrated (e.g. a 45-minute braise mis-tagged as `passive_minutes: 15`).
**Why it happens:** Inherent to any AI-assisted drafting of numeric estimates without ground-truth timing data.
**How to avoid:** The review gate (PREP-02) is human, and durations remain editable after backfill (in the RecipeEditor and, per the phase doc, in cook mode itself). This is an accepted, documented residual risk, not something to "solve" — the mitigation is the review UX being good enough that corrections are easy to make, not a data-quality guarantee up front.
**Warning signs:** None automatable — this is a data-quality risk that surfaces only through actual household use over subsequent weeks.

### Pitfall 5: GA performance at this scale is not actually a bottleneck — the *check-off UX* discipline is
**What goes wrong:** Teams sometimes over-engineer GA performance (caching, web workers, incremental fitness) for a "genetic algorithm," assuming it's inherently slow.
**Why it happens:** GA is associated with large-scale optimization problems; the instinctive reaction is to treat it as expensive.
**How to avoid:** At ~10-40 step-instances (the documented household scale), even population=60 × generations=150 with an O(n log n)-ish SSGS decode per individual is on the order of low hundreds of thousands of primitive operations total — comfortably sub-100ms in a browser, no web worker needed. The actual risk D-01a.3 identifies is **UX discipline** (never re-run the GA on check-off), not raw GA compute cost. Don't spend planning budget on GA performance optimization; spend it on the retime-not-re-evolve architectural boundary (Pattern 3).
**Warning signs:** A plan task that says "optimize GA performance" without first establishing that the naive implementation is actually too slow (it likely won't be, at this scale).

## Code Examples

### PocketBase schema addition pattern (matches Phase 1's additive-nullable precedent)
```typescript
// Source: recipe-planner/pb_schema.json (this project's own file, read directly)
// Current recipe_steps schema (collection pbc_1735492817), verified 2026-07-09:
// fields: id, recipe (relation, required), name (text, required),
// step_type (select: prep|assembly, required), timing (select: batch|
// just_in_time, optional), position_x (number), position_y (number).
// New fields to add (all additive + nullable, matching the Phase-1
// precedent of zero-data-rewrite migrations):
//   active_minutes: number, nullable
//   passive_minutes: number, nullable
//   instructions: text, nullable
//   prep_action: select (nullable) — values sourced verbatim from
//     recipe-planner/src/lib/linter/rules/prep-words.ts PREP_VERBS:
//     ["sliced","diced","minced","chopped","grated","shredded"]
//   resource: select (nullable) — "oven"|"stovetop"|"blender"|
//     "food_processor"|"instant_pot"|"none"
//   oven_temp_f: number, nullable
//   rack_slots: number, nullable, default 1
```

### `useCookProgress` — direct analog of `useShoppingState`
```typescript
// Source: recipe-planner/src/hooks/useShoppingState.ts (this project's own
// file, read in full) — mirror its exact shape for cook_progress. Key
// differences: keyed by (weekly_plan, step_instance) not (weekly_plan,
// line_key); writable fields are { checked, checked_at } rather than
// { checked, have_quantity, resolution } (cook_progress has no have-N or
// resolution concept). The query-then-branch upsert (getAll by
// (weekly_plan, step_instance) filter -> update-or-create) and the
// createSyncQueue wiring pattern carry over unchanged.
export function useCookProgress(weeklyPlanId: string) {
  // ... identical structural shape to useShoppingState.ts:40-175, with
  // ShoppingStateEntry -> CookProgressEntry { recordId, checked, checked_at }
  // and collections.shoppingState -> collections.cookProgress
}
```

### Linter v2 rule pattern (matches Phase 1's pure-rule-function shape exactly)
```typescript
// Source: recipe-planner/src/lib/linter/rules/missing-store-section.ts and
// prep-words.ts (this project's own files, read in full) — the pattern to
// follow verbatim for the 3 new rules.
import type { LintFinding } from "../index";
// missing-durations.ts
export function lintMissingDurations(steps: LinterStepExpanded[]): LintFinding[] {
  return steps
    .filter((s) => s.active_minutes == null && s.passive_minutes == null)
    .map((s) => ({
      severity: "error" as const,
      rule: "missing-durations",
      message: `${s.name}: has neither active_minutes nor passive_minutes`,
      // nodeId/recipeId per the existing LintFinding shape
    }));
}
// missing-prep-action.ts: filter step_type === "prep" && prep_action == null
// missing-pull-step.ts: the chicken-stock rule — for every assembly step
// consuming a stored/inventory input, verify some OTHER step in the same
// recipe (or, if scoped week-wide, the week graph) produces that product
// via a step whose prep_action/name indicates pull/thaw/make. Flag if none
// found. (Scope — single-recipe vs week-graph — is an Open Question below.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Flat, unordered `BatchPrepTab.tsx` checklist with in-memory `checkedItems` Set | Ordered, resource-aware, persisted cook-mode timeline | This phase | Replaces the entire prep-day UX; `BatchPrepTab.tsx`'s print stylesheet is explicitly kept for the batch-prep print view (Topic 1), only its interactive checklist role is superseded |
| `recipe_steps` with no timing/instruction/resource metadata | Full metadata schema, backfilled via offline AI draft + human review | This phase | Makes steps first-class scheduling units; nothing schedulable existed before this |

**Deprecated/outdated:** none — this is greenfield scheduling logic added to an existing app, not a migration off a prior scheduler.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Minimize active time" = minimize the active-session span (first active start -> last active finish), not `sum(active_minutes)` (which is invariant under reordering) | Summary, Pitfall 1 | If the user actually meant something else (e.g. total elapsed makespan, or literal sum which would make the term a no-op), the GA's primary fitness term optimizes the wrong thing and the "why does changing this weight do nothing" bug surfaces late |
| A2 | Within a single step, `active_minutes` occurs before `passive_minutes` (cook does the active work, then the resource runs passively) — this ordering is not stated anywhere in the decision record or phase doc | Pattern 2 | If some steps are actually passive-then-active (e.g. "let dough rest, then knead" — passive first), the implicit-cook-resource feasibility check would be wrong for those steps specifically; likely rare in practice but not universally true |
| A3 | "Step grouping" (the 4th `scheduler_config.weights` key) rewards grouping steps by shared recipe/meal in the active-order sequence, distinct from "chopping consolidation" (which groups by shared `prep_action`) | Architecture Patterns, Don't Hand-Roll | If "step grouping" was meant to mean something else (e.g. grouping by shared resource to minimize oven-door-opening), the fitness term rewards the wrong adjacency pattern; low-severity since it's a tunable weight the user can zero out via the weights panel if it doesn't feel right |
| A4 | Fan-in from multiple producers of the same stored product (week-graph builder edge case) defaults to "consumer waits on ALL matching producer instances" (conservative AND-semantics), not "any one" | Pattern 1 | If the household actually wants only one of several redundant same-product batches to gate the consumer, the schedule will be unnecessarily conservative (later start time than strictly necessary) — a correctness-safe but potentially suboptimal default |
| A5 | GA fixed hyperparameter defaults: population=60, generations=150, crossover rate=0.85, mutation rate=0.15, elitism=2 | Standard Stack / Common Pitfalls (implied) | These are reasonable RCPSP-GA-literature defaults for a small (~10-40 activity) instance, not verified against this specific fitness landscape; if the resulting schedules look poor in practice, these are the first knobs to retune (they must stay OUTSIDE the user-facing weights panel per D-01a.2) |
| A6 | `missing-pull-step` linter rule (PREP-06 rule a) scopes its "was this stored input produced by a preceding pull/thaw/make step" check to the single recipe's own graph, not the full week graph | Code Examples | If a household recipe legitimately relies on a stock made by a DIFFERENT recipe in the same week (the week-graph cross-recipe edge case), a single-recipe-scoped rule would false-positive; a week-graph-scoped rule requires the linter to run against a planned week rather than a standalone recipe, which is a bigger surface change worth confirming with the user before locking in |

**If this table is empty:** N/A — see rows above; these are the load-bearing interpretive gaps the decision record and phase doc leave open. None of them block starting implementation, but A1 and A6 in particular should be confirmed with the user (or explicitly locked by the planner as a documented default) before the GA fitness function and linter rule scope are implemented, since both are expensive to silently get wrong.

## Open Questions

1. **What exactly does "step grouping" (weights.grouping) reward?**
   - What we know: it's one of the 5 named tunable weights (`plans/workflow-redesign.md` Topic 4, `scheduler_config.weights.grouping` per D-04); it's distinct from "chopping consolidation" (`weights.chopping`).
   - What's unclear: whether it groups by shared recipe/meal, shared resource, or something else.
   - Recommendation: default to shared-recipe/meal adjacency (A3); since it's user-tunable at runtime via the weights panel, a wrong initial guess is low-cost to discover and doesn't require a code change to correct behavior — the user can simply zero the slider if the effect doesn't feel right, and this can be revisited once real usage surfaces what "grouping" the household actually wants.

2. **Does the "missing pull/thaw/make step" linter rule need week-graph scope or single-recipe scope?**
   - What we know: the chicken-stock failure example spans a single recipe in the phase doc's telling, but the week-graph builder (PREP-03) explicitly handles the case where a stored product's producer is a *different* recipe in the same week.
   - What's unclear: whether PREP-06's linter rule should also reason across a planned week (bigger, Phase-6-adjacent surface — the linter currently runs per-recipe/per-product in Phase 1) or stay recipe-scoped and accept that cross-recipe pull-step coverage is effectively delegated to the week-graph builder's "producer absent -> source node" handling (which doesn't itself surface an error to the user, since the phase doc says that's the linter's job).
   - Recommendation: implement the on-demand linter rule at single-recipe scope first (matches Phase-1's existing architecture, avoids a bigger scope change into "week-aware linting" this phase), and treat week-scoped pull-step checking as a natural, low-risk follow-on once IMP-06/Phase 6's planning-time linting surface exists. Flag this explicitly to the user during planning so the scope choice is a conscious decision, not a silent gap.

3. **Total oven rack capacity vs. per-step `rack_slots` — confirm the split.**
   - What we know: `scheduler_config.oven_rack_slots` (D-04) is the household's total oven capacity (e.g. "this oven has 2 racks"); `recipe_steps.rack_slots` (D-05) is how many of those slots a given step's dish consumes (default 1).
   - What's unclear: nothing structurally, but this two-tier design (capacity in config, consumption per step) isn't spelled out explicitly as "these two fields relate as capacity vs. consumption" anywhere in CONTEXT.md — it's inferred from the two decisions read together.
   - Recommendation: confirm this reading with the user before schema/UI work locks in the field semantics (a one-line confirmation, low cost, prevents a costly later misunderstanding about what "oven_rack_slots" in `scheduler_config` actually represents).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PocketBase test instance (`192.168.50.95:8091`) | Schema migration + code development (all of PREP-01..06) | Yes (HTTP 200 confirmed 2026-07-09) | — | — |
| PocketBase prod instance (`192.168.50.95:8090`) | Content backfill (PREP-02), final schema application | Yes (HTTP 200 confirmed 2026-07-09) | — | — |
| Node.js | Build/test tooling, offline backfill scripts | Yes | v24.14.0 | — |
| npm | Package install (`prando`) | Yes | 11.9.0 | — |
| `prando` (npm package) | GA determinism (PREP-03) | Not yet installed | 6.0.1 (verified available) | `npm install prando` — trivial, no blocker |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — `prando` is a standard `npm install`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 |
| Config file | `recipe-planner/vitest.config.ts` (node environment, `src/**/*.test.ts` + `scripts/**/*.test.js`) |
| Quick run command | `cd recipe-planner && npx vitest run src/lib/scheduler` (scoped to the new module during development) |
| Full suite command | `cd recipe-planner && npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PREP-01 | New `recipe_steps` fields round-trip via API | integration (live PocketBase, test DB) | manual verification against `:8091` per the phase doc's Item 1 acceptance step (no existing automated PocketBase-integration test harness in this repo) | ❌ Wave 0 — no PB-integration test precedent exists; this repo's convention (per `TESTING.md`) is pure-function unit tests only, so this check stays a documented manual/checkpoint step, not a new automated test category |
| PREP-01 | Edit Step dialog persists 4 new fields | manual/UAT | N/A (component-level tests not in this repo's stack — no `@testing-library/react`/jsdom installed, per `vitest.config.ts`'s own comment) | ❌ — component testing is out of this repo's established scope; verify via UAT |
| PREP-02 | Backfill review writes only approved values, idempotent on re-run | unit (pure function: given draft JSON + current DB state, compute the write-set) | `npx vitest run src/pages/StepBackfill` or wherever the pure diff/apply logic is factored out | ❌ Wave 0 — factor the draft-vs-current diff logic into a pure, testable function separate from the React page |
| PREP-03 | Fixed `(seed, weights, plan)` -> byte-identical schedule twice | unit (determinism regression) | `npx vitest run src/lib/scheduler/genetic.test.ts -t determinism` | ❌ Wave 0 |
| PREP-03 | No DAG-precedence or resource-constraint violation in GA output | unit (property/invariant check over generated schedules) | `npx vitest run src/lib/scheduler/genetic.test.ts -t "no violations"` | ❌ Wave 0 |
| PREP-03 | Two different-temp oven steps never overlap; rack-slot capacity respected; burner capacity respected; singleton appliance capacity respected | unit | `npx vitest run src/lib/scheduler/resources.test.ts` | ❌ Wave 0 |
| PREP-03 | Week-graph: shared-stock cross-recipe edge connects two recipes; producer-absent leaves a source node with no edge | unit | `npx vitest run src/lib/scheduler/week-graph.test.ts` | ❌ Wave 0 |
| PREP-04 | Check-off recomputes remaining timeline without reordering | unit (retime.ts) | `npx vitest run src/lib/scheduler/retime.test.ts` | ❌ Wave 0 |
| PREP-04 | Readiness state flips from "waiting on: X" to ready once upstream checked off | unit (pure derivation function, factored out of the React component) | `npx vitest run src/lib/scheduler` (readiness helper co-located or in its own file) | ❌ Wave 0 |
| PREP-04 | Cook-mode progress persists across refresh | integration/manual | manual verification against `:8091`, matching Phase 2's SHOP-01 precedent (no PB-integration test harness exists in-repo) | ❌ — manual UAT, consistent with this repo's established pattern |
| PREP-05 | Slider change + regenerate changes schedule deterministically | unit | covered by the PREP-03 determinism test using two different weight vectors | (reuses genetic.test.ts) |
| PREP-06 | Linter v2 flags exactly the 3 new rule violations against a fixture recipe | unit | `npx vitest run src/lib/linter/linter.test.ts` (extend the existing suite, following its established fixture pattern) | Partial — `linter.test.ts` exists and is the file to extend, not create |

### Sampling Rate
- **Per task commit:** run the scoped quick command for whichever module the task touches (e.g. `npx vitest run src/lib/scheduler/genetic.test.ts` after touching `genetic.ts`).
- **Per wave merge:** `cd recipe-planner && npm test` (full suite).
- **Phase gate:** full suite green before `/gsd-verify-work`; PocketBase-integration items (schema round-trip, cook-progress persistence) remain manual/UAT checkpoints per this repo's established convention (no live-PB integration harness exists — confirmed via `TESTING.md` and `vitest.config.ts`'s own explanatory comment).

### Wave 0 Gaps
- [ ] `recipe-planner/src/lib/scheduler/week-graph.test.ts` — covers PREP-03 (week-graph edge cases)
- [ ] `recipe-planner/src/lib/scheduler/resources.test.ts` — covers PREP-03 (resource feasibility, including the implicit cook resource and oven temp-conflict rule)
- [ ] `recipe-planner/src/lib/scheduler/genetic.test.ts` — covers PREP-03/PREP-05 (determinism regression + no-violation invariant + weight-change regression)
- [ ] `recipe-planner/src/lib/scheduler/retime.test.ts` — covers PREP-04 (check-off recompute)
- [ ] `recipe-planner/src/lib/linter/rules/missing-pull-step.test.ts` (or extend `linter.test.ts`) — covers PREP-06
- [ ] Framework install: none needed — Vitest is already configured and used project-wide; no new test framework required, only new test files following the existing `*.test.ts` co-location convention

## Security Domain

This is a self-hosted, single-household, trusted-tailnet application (per `PROJECT.md`/`REQUIREMENTS.md` Out of Scope: "Multi-user auth / realtime sync... Self-hosted, trusted network, single household"). No new external-facing surface or auth boundary is introduced by this phase — all new collections (`cook_progress`, `scheduler_config`) sit behind the same PocketBase instance/access model as every existing collection.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Out of scope per project decision (single trusted household, no auth) |
| V3 Session Management | No | Same |
| V4 Access Control | No | Same |
| V5 Input Validation | Yes | PocketBase field-level validation (required/select-enum constraints) for the new `recipe_steps`/`cook_progress`/`scheduler_config` fields, matching the existing pattern for every other collection in this schema |
| V6 Cryptography | No | No new secrets/crypto surface introduced |

### Known Threat Patterns for this stack
Not applicable beyond the existing project-wide posture — this phase adds no new network-facing input path (the offline AI backfill draft JSON is reviewed and approved by a human before any write, closing the one path that might otherwise look like an "untrusted input" concern).

## Sources

### Primary (HIGH confidence)
- `recipe-planner/src/lib/aggregation/types.ts`, `builders/step-builder.ts`, `builders/flow-builder.ts`, `utils/step-utils.ts` — read in full, this project's own code
- `recipe-planner/src/lib/types.ts`, `recipe-planner/pb_schema.json` — current schema/types, read directly
- `recipe-planner/src/lib/linter/index.ts` + `rules/*.ts` — Phase-1 linter architecture, read in full
- `recipe-planner/src/hooks/useShoppingState.ts`, `recipe-planner/src/lib/sync-queue.ts` — Phase-2 persistence pattern, read in full
- `recipe-planner/src/pages/RecipeEditor.tsx` (lines 418-450, 595-645, 1279-1350) — Edit Step dialog + save handlers, read directly, line numbers verified against current file state
- `recipe-planner/src/components/nodes/StepNode.tsx`, `recipe-planner/src/components/outputs/BatchPrepTab.tsx` — read in full
- `.claude/skills/recipe-import/SKILL.md` — read in full
- `plans/workflow-redesign.md` Topic 4, `.planning/phase-docs/phase-5-prep-day-engine.md` — decision record + elaboration, read in full
- `npm view prando version` / `gsd-tools query package-legitimacy check` — package legitimacy verified live

### Secondary (MEDIUM confidence)
- github.com/zeh/prando README `[CITED via WebFetch]` — public API surface (constructor, `next`/`nextInt`/`nextArrayItem`/`nextBoolean`/`reset`/`skip`), no built-in shuffle
- RCPSP genetic-algorithm literature (ResearchGate/IEEE search results, WebSearch cross-checked against multiple sources) `[CITED, MEDIUM]` — activity-list representation + Serial Schedule Generation Scheme as the standard decode procedure

### Tertiary (LOW confidence)
- GA fixed-hyperparameter defaults (population=60, generations=150, crossover=0.85, mutation=0.15) — general RCPSP-GA-literature convention for small instances, not verified against this project's specific fitness landscape; see Assumptions Log A5

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the only new dependency (`prando`) is legitimacy-verified against the npm registry; everything else reuses libraries already in `package.json`
- Architecture: MEDIUM — the data-flow architecture (week-graph -> resources -> GA -> cook mode) is well-grounded in this project's existing code; the fitness-function semantics (Pitfall 1, Assumption A1) and two weight definitions (A3) are genuinely underspecified by the decision record and need a locked interpretation before implementation
- Pitfalls: HIGH — every pitfall is either a direct codebase-verified fact (the signature-merge trap) or a standard, well-documented GA/RCPSP failure mode (naive shuffle bias, oven temp-conflict modeling)

**Research date:** 2026-07-09
**Valid until:** 30 days (stable domain — no fast-moving external dependencies; the one new package, `prando`, is a mature, low-churn library)
