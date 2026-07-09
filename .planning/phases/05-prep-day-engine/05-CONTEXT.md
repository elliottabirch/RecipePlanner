# Phase 5: Prep-Day Engine - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn prep day from a flat, mentally-sequenced checklist into a deterministic,
resource-aware scheduler plus an interactive tablet cook mode — backed by new
`recipe_steps` metadata (durations, instructions, controlled prep-action vocab)
backfilled across the existing 185 steps, and a linter v2 that flags step-metadata
and pull-step violations on demand.

Delivers PREP-01…PREP-06. This phase clarifies HOW to implement the Topic-4
decision record; it does not add new capabilities. The draft/publish lifecycle,
in-app import, and publish-time lint gate remain Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Scheduler algorithm
- **D-01:** **Keep the full seeded genetic algorithm** exactly as the decision
  record (`plans/workflow-redesign.md` Topic 4) locks it — GA over the merged
  week-graph, fitness = weighted sum (active-time primary), subject to DAG
  precedence + resource constraints. User explicitly retained the GA after being
  shown research recommending a simpler deterministic list-scheduler for home
  scale (~10-40 step-instances). The ADR is **unchanged**.
- **D-01a (research-surfaced constraints the planner MUST address):** because the
  GA was kept despite the simpler alternative, the plan must explicitly solve the
  three risks the research flagged, or the GA becomes a determinism/perf liability:
  1. **Cross-operator determinism** — thread ONE seeded PRNG (not `Math.random`,
     not engine-dependent sort stability) through every stochastic operator
     (init, selection, crossover, mutation) so `(seed, weights, plan)` →
     byte-identical schedule across JS engines. (candidate dep: `prando`.)
  2. **Hidden hyperparameters** — population size, generations, mutation/crossover
     rates sit *outside* the exposed weights panel. Decide fixed defaults and
     document them; they must not silently change schedule output.
  3. **Instant recompute-on-check-off** — per-tap re-evolution risks the "feels
     instant on tablet" bar (PREP-04/AC5). Plan must bound GA cost or use a
     cheaper recompute path on check-off (e.g. re-time the fixed order rather than
     re-evolve — order is authoritative, clock adapts).
  - Documented upgrade/fallback path if the GA underperforms or can't hit the
    instant bar: seeded beam / multi-start SSGS, then a deterministic priority
    list scheduler. Not adopted now; recorded so it isn't re-derived later.

### Day-before prep horizon (the open seed) — CUT from Phase 5
- **D-02:** **Dropped entirely, not merely deferred.** User: nothing in this
  household's kitchen needs a "do before prep" bucket — everything is doable
  during prep day; nothing is too frozen to delay prep by days. Therefore:
  - **No** `lead_time_minutes` field, **no** night-before checklist, **no**
    "tonight-for-tomorrow" cook-mode card.
  - **AC8 is removed** from this phase (was conditional/deferred).
  - The scalar-vs-absolute-horizon question is moot.
  - **Still in scope:** the linter v2 rule "stored/inventory input consumed by an
    assembly step with no preceding pull/thaw/make step" (the chicken-stock
    failure) — that catches the *missing step*, independent of lead time.
  - `recipe_steps` gets NO `lead_time_minutes` column.

### Persistence
- **D-03:** **Cook-mode check-off progress → new `cook_progress` PocketBase
  collection**, keyed by `(weekly_plan, step_instance)`, reusing Phase-2's
  `createSyncQueue` + optimistic-hook pattern (mirror `useShoppingState`, do NOT
  overload the `shopping_state` collection — different domain/keys). Cross-device,
  survives tablet refresh/sleep. Add to `collections` in `recipe-planner/src/lib/api.ts`.
- **D-04:** **Scheduler config → new `scheduler_config` PocketBase collection**
  (singleton / single JSON record): `{ seed, weights{active, chopping,
  grouping, elapsed, resource_pressure}, burner_count, oven_rack_slots,
  appliances[] }`. Shared across devices — tuning weights on the tablet persists
  to the laptop. Read by both the weights panel and the GA.

### Resource model
- **D-05:** **Full resource model.** `recipe_steps` gains the Proposed §3.1 fields:
  - `resource` select enum: `oven` / `stovetop` / `blender` / `food_processor` /
    `instant_pot` / `none`
  - `oven_temp_f` (number, required when `resource = oven`) → drives the
    temperature-conflict rule (two different-temp oven steps cannot overlap)
  - `rack_slots` (number, default 1)
  - Stovetop modeled with a **configurable burner count, default 4**; singleton
    appliances (blender/food_processor/instant_pot) capacity 1 each.
  - **Backfill infers** `resource` / `oven_temp_f` / `rack_slots` from
    `prep_action` + step name (same offline draft pass as the core fields),
    editable afterward in the authoring UI, required at import for new recipes
    (linter-enforced). This resolves §7's "infer vs. require" in favor of
    infer-during-backfill. Without populated tags AC4 is untestable.

### GA objective + linter scope (confirmed post-research, 2026-07-09)
- **D-06 (GA primary objective):** "minimize active/hands-on time" = **minimize the
  active-session span** — `max(activeEnd) − min(activeStart)` across all scheduled
  step instances. `sum(active_minutes)` is invariant under reordering, so it cannot
  be the objective; the span reading compresses the cook's total tied-to-the-kitchen
  stretch by overlapping active bursts into other steps' passive windows, and is
  consistent with the record's separate (secondary) "elapsed time" weight. Resolves
  RESEARCH A1 (was `[ASSUMED]`). The GA fitness function MUST implement this reading.
- **D-07 (linter "missing pull/thaw/make" scope):** the PREP-06 rule (a) runs at
  **whole-planned-week scope**, not single-recipe: a stored/inventory input is
  satisfied if ANY recipe in the planned week produces it (reuse the week-graph
  builder's cross-recipe producer→consumer edges). Handles the real cross-recipe
  chicken-stock case (recipe A consumes stock recipe B makes) without false
  positives. Resolves RESEARCH A6 (was `[ASSUMED]`). Implication: this linter rule
  operates against a planned week, a larger surface than the Phase-1 per-recipe
  linter — the planner must account for that (the other two v2 rules — missing
  durations, missing prep vocab — stay per-recipe/per-step).
- **Planner-locked research defaults (A2–A5, follow RESEARCH.md unless noted):**
  implicit single-cook resource occupied only during `active_minutes` (never
  `passive_minutes`); within a step, active-then-passive ordering (A2); "step
  grouping" weight = shared recipe/meal adjacency, user-tunable so a wrong guess is
  cheap (A3); fan-in defaults to AND-semantics — consumer waits on all matching
  producers (A4); GA hyperparameters (pop/generations/rates) live OUTSIDE the weights
  panel with RESEARCH.md's defaults as a starting point (A5, D-01a.2).

### Claude's Discretion
- **Backfill delivery surface:** in-app review page (`recipe-planner/src/pages/StepBackfill.tsx`)
  that consumes offline-drafted JSON (the `recipe-import` skill pattern — no
  runtime in-app LLM call), renders draft-vs-current per step, writes only on
  approval, idempotent on re-run. This follows the decision record's Phase-6
  in-app direction; a `scripts/` variant is the documented fallback. Not
  separately discussed — following the record.
- **Core step-metadata schema** (`active_minutes`, `passive_minutes`,
  `instructions`, `prep_action`) is locked by the record; `prep_action` enum
  values reuse Phase-1's controlled prep-verb list (one vocabulary).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decision records (authoritative — read first)
- `plans/workflow-redesign.md` §"Topic 4" — the locked decision record: GA
  scheduler, minimize active time, modeled resources, cook mode, weights panel,
  linter rules. **Source of truth.**
- `.planning/phase-docs/phase-5-prep-day-engine.md` — elaborates Topic 4 into
  data-model changes (§3), an ordered implementation plan (§4), dependencies
  (§5), acceptance criteria (§6), and risks/open questions (§7). Note: this
  CONTEXT overrides its §2.5/§3.1/§7 lead-time material (D-02 cuts it) and
  confirms its Proposed §3.1 resource fields (D-05), §3.2 config store (D-04),
  and §3.3 cook-progress store (D-03).
- `.planning/phase-docs/00-overview.md` — the four root-cause diagnosis and
  decomposition ("steps carry no metadata").
- `.planning/REQUIREMENTS.md` — PREP-01…PREP-06 (note PREP-F1 day-before horizon
  is CUT per D-02).
- `.planning/seeds/day-before-prep-horizon.md` — the seed being dropped (D-02);
  read only to confirm what is being cut, not to implement.

### Codebase — data layer & aggregation
- `recipe-planner/src/lib/types.ts` (`RecipeStep`, `StepType`) — extend with new
  step fields.
- `recipe-planner/pb_schema_updated.json` — collection `pbc_1735492817`
  (`recipe_steps`); mirror schema additions here after PB changes.
- `recipe-planner/src/lib/api.ts` (`collections` map) — register
  `cook_progress` + `scheduler_config`.
- `recipe-planner/src/lib/aggregation/types.ts` — `RecipeGraphData` /
  `MealKeyedRecipeData`, input to the week-graph builder.
- `recipe-planner/src/lib/step-utils.ts` — **signature-merge to AVOID**: the
  scheduler must operate on per-instance step nodes, not this merged batch view.
- `decisions.md` — real step-aggregation behavior (reconciled in Phase 1).

### Codebase — UI & persistence pattern
- `recipe-planner/src/components/outputs/BatchPrepTab.tsx` — the flat checklist
  cook mode supersedes (keep its print stylesheet for batch prep).
- `recipe-planner/src/pages/RecipeEditor.tsx` — Edit Step dialog + `handleSave`
  step-node branch; add the four authoring fields at both touchpoints.
- `recipe-planner/src/hooks/useShoppingState.ts` +
  `recipe-planner/src/lib/sync-queue.ts` — the Phase-2 optimistic upsert +
  `createSyncQueue` pattern to mirror for `cook_progress` (D-03).
- `.claude/skills/recipe-import/SKILL.md` — offline draft-JSON-then-review
  pattern the backfill flow follows.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`,
  `STACK.md`, `TESTING.md`, `INTEGRATIONS.md`, `CONCERNS.md` — general project map.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createSyncQueue` + `useShoppingState` (Phase 2)** — optimistic,
  retry/backoff/coalescing, per-`(weekly_plan, key)` upsert. Direct template for
  `useCookProgress` against the new `cook_progress` collection (D-03).
- **Recipe graphs are already DAGs** — `RecipeGraphData`/`MealKeyedRecipeData`
  feed the week-graph builder; cross-recipe edges link a stored/inventory output
  node's product ID to a consuming input node's product ID in another recipe.
- **Phase-1 prep-verb vocabulary** — reused verbatim for the `prep_action` enum.
- **Phase-4 `people_multiplier` + `start_date`** — cook-mode scaled quantities
  derive from `people_multiplier`; start_date is NO LONGER needed here (D-02 cut
  the night-before horizon that required it).

### Established Patterns
- **Test DB `:8091` for schema/code, prod `:8090` for content** — additive
  nullable columns validate immediately; no data rewrite. "No new infra" holds
  because the AI backfill is offline (no runtime LLM client in `src/`).
- **Signature-merge is for the batch LIST only** — the scheduler must use
  per-instance step nodes (else it loses per-meal precedence + resource counts).

### Integration Points
- New collections `cook_progress`, `scheduler_config` → `collections` in `api.ts`.
- Cook mode replaces `BatchPrepTab.tsx` as the prep-day surface; keep print
  stylesheet for batch prep.
- New scheduler modules: `recipe-planner/src/lib/scheduler/` (`week-graph.ts`,
  `resources.ts`, `genetic.ts`).
- Linter v2 extends the Phase-1 on-demand linter surface (publish-gate wiring is
  Phase 6).

</code_context>

<specifics>
## Specific Ideas

- **Order is authoritative, the clock adapts** (from the record): on check-off,
  recompute times/countdowns but keep the ordering stable so the tablet reads
  calmly. This is also the cheap recompute path that sidesteps per-tap GA
  re-evolution (D-01a.3).
- **185 steps across 57 recipes** need backfill — verified against prod
  `:8090`. Backfill is one-shot, batched (one recipe at a time), human-reviewed,
  idempotent (touches only steps still missing fields).
- **Full GA retained by explicit user choice** despite a researched
  recommendation to simplify — treat the D-01a constraints as first-class plan
  requirements, not nice-to-haves.

</specifics>

<deferred>
## Deferred Ideas

- **Day-before prep horizon (`lead_time_minutes`, night-before checklist, PREP-F1)**
  — CUT from the product for now, not just this phase (D-02): the household has
  no pre-prep tasks. Revisit only if that changes.
- **Simpler scheduler (deterministic list / beam-search)** — documented fallback
  if the retained GA can't hit determinism or the instant-recompute bar
  (D-01/D-01a). Not in scope now.
- **Multi-cook scheduling, density/cross-dimension conversion, nutrition-aware
  sequencing** — out of scope by design (per record §7 + REQUIREMENTS Out of Scope).

### Reviewed Todos (not folded)
- `swap-aware-prep-naming.md` ("Make prep-step titles and prep-state output names
  reflect ingredient swaps") — adjacent to cook mode's per-step display but a
  distinct Phase-2-swap enhancement; deferred, not folded into Phase 5 scope.
- Other keyword matches (`nas-pocketbase-tailnet`, `deploy-pb-superuser-env`,
  `improve-recipe-tagging-for-wizard-pools`, `single-purchase-unit-shopping-lines`,
  `usda-search-plain-rename`) are infra or other-phase concerns — not Phase 5.

</deferred>

---

*Phase: 5-prep-day-engine*
*Context gathered: 2026-07-09*
