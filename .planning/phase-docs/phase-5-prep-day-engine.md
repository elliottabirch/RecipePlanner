# Phase 5: Prep-Day Engine (Scheduler + Cook Mode)

> Authoritative source: `plans/workflow-redesign.md` Topic 4 and roadmap item 5. This doc elaborates that decision record. Choices that go beyond it are marked **Proposed (not yet decided)**.

---

## 1. Purpose & Problem Statement

This phase closes the second of the four root causes in the diagnosis: **"Steps carry no metadata."** Today a `recipe_steps` record is `{ name, step_type, timing, position_x, position_y }` and nothing else (`pb_schema_updated.json` collection `pbc_1735492817`; mirrored in `src/lib/types.ts:94-101`). There is no duration, no instruction text, and no structured description of what the prep action *is*. Two concrete frustrations follow directly from that gap:

- **Prep day has no plan, only a flat checklist.** `BatchPrepTab.tsx` renders all batch-included steps as one flat, unordered `List` of checkboxes (`src/components/outputs/BatchPrepTab.tsx:75-150`), each with a per-step `Prep`/`Assembly` chip (`STEP_TYPE_LABELS`, `:100-109`) — and nothing else. There is no phase grouping in the code (the `StepType` enum is only `Prep`/`Assembly` — `types.ts:84-86` — there is no `Distribution` type; the raw-processing/cooking/distribution phases are a spec note in `decisions.md`, not implemented). There is no ordering, no timing, no notion that a 2-hour simmer should start first so it runs in the background while onions are diced. The cook sequences the whole day in their head every week. With no `*_minutes` fields there is literally nothing for a scheduler to optimize over.
- **Assembly steps are opaque at the counter.** Each batch step's `inputs → name → outputs` detail with aggregated quantities is always rendered inline (`BatchPrepTab.tsx:111-140`); the checkbox only toggles done-state (`:85-88`). Ratio/amount detail (e.g. a bean-salad dressing's oil:acid ratio) has nowhere to live — `recipe_steps` has no `instructions` field — so the cook works from memory or a separate recipe card. There is no "this assembly is waiting on diced onion" signal; the flat list gives no readiness cues and no place for instruction detail.

The **chicken-stock failure** named throughout the decision record is the sharp edge: a recipe consumes stored stock at assembly time, but the "pull/make stock" step either isn't modeled or isn't scheduled early enough, so prep stalls 20-30 min. Part of that is a missing step (a **linter** concern) and part is a missing *lead time* (the day-before-prep-horizon seed).

**Scale of the backfill problem (verified against prod `192.168.50.95:8090`):** 185 `recipe_steps` across 57 `recipes`. Every one of those steps currently lacks all Phase-5 metadata, which is why a one-shot AI-assisted backfill (not hand entry) is the chosen path.

This phase makes steps first-class scheduling units, computes a resource-aware prep-day order that minimizes hands-on time, and turns the flat checklist into an interactive tablet cook mode.

---

## 2. Feature Descriptions

### 2.1 Step metadata (authoring)
Every step gains, in the recipe editor's Edit Step dialog:
- **Active minutes** — hands-on time (chopping, stirring, plating).
- **Passive minutes** — unattended time the cook can walk away from (simmer, bake, chill, marinate).
- **Instructions** — free text where ratios and technique detail finally live ("whisk 3:1 oil to lemon, season to taste").
- **Prep action** — a value from the controlled prep vocabulary (sliced, diced, minced, grated, …) introduced in Topic 2. Present on prep steps; drives the scheduler's chopping-consolidation weight.

New recipes cannot be published without these fields (linter-enforced, see 2.6).

### 2.2 AI-assisted metadata backfill with batch review
A one-shot backfill flow drafts `active_minutes`, `passive_minutes`, `instructions`, and `prep_action` for all 185 existing steps using the recipe graph as context (step name, inputs, outputs, recipe name). **Invocation mechanism (decided):** the drafting is done *offline* by Claude / Claude Code — the existing `recipe-import` skill pattern (`.claude/skills/recipe-import/SKILL.md`), where the model emits draft JSON that the app consumes. The app has **no runtime LLM integration today** (verified: no `anthropic`/`openai`/LLM client anywhere in `src/`), and adding a browser-side model call would require a key/proxy — new infra that contradicts §5. So there is no in-app "call the model" step: the in-app page only reads a drafted-metadata JSON file (or paste), renders draft-vs-current review per step, and writes on approval. Drafts are **never auto-written**; they are presented in reviewable batches (e.g. one recipe at a time) with per-field edit + accept/reject, and only written to PocketBase on approval. Re-runnable and idempotent (only touches steps still missing fields). *(Alternative kept open: a true runtime in-app LLM call — only if a model, endpoint, and key/proxy location are chosen, which would invalidate the "no new infra" claim in §5.)*

### 2.3 Genetic-algorithm prep-day scheduler
Given a weekly plan, the engine merges every planned recipe's dependency DAG into one **week graph** (recipe graphs are already DAGs; cross-recipe links occur where one recipe's stored/inventory output feeds another's input) and runs a **seeded, deterministic genetic algorithm** to produce a single ordered prep-day timeline. Determinism: same `(seed, weights, plan)` → identical schedule, every time.

- **Primary objective: minimize active/hands-on time** (schedule passive steps early so their unattended windows absorb other active work). Elapsed time is secondary.
- **Tunable weights:** active/hands-on time, chopping consolidation, step grouping, elapsed time, resource pressure.
- **Modeled resources (hard constraints):** the oven (finite rack slots **and** a temperature-conflict rule — two steps needing different oven temps cannot overlap), the stovetop (a configurable burner count, default proposed at 4), and singleton appliances (blender, food processor, instant pot — capacity 1 each). **Exactly one cook is assumed** — no hands/labor resource for now, which is precisely why active-time minimization is the objective rather than a resource.
- **Output:** an ordered list of scheduled step instances with computed start/end offsets, plus a **night-before checklist** for any lead-time steps (see 2.5).

### 2.4 Interactive cook mode (tablet)
Replaces the flat batch-prep checklist for prep day. A tablet-first timeline:
- **Now / Next cards** — the current step(s) and what follows, large touch targets.
- **Check-off advances the plan** — completing a step marks it done and **recomputes** the remaining timeline; the *order* is authoritative and the clock adapts to when you actually finish (you started the simmer 5 min late → downstream countdowns shift).
- **Countdown timers on passive steps** — a 2-hour simmer shows a live timer; the card surfaces when it will free its resource.
- **Per-step scaled quantities + instructions** — tapping a step shows exact quantities scaled by planned-meal counts (already derivable from the graph) plus the authored instruction text.
- **Readiness state on assembly steps** — an assembly shows "waiting on: diced onion, cooked beans" until its upstream outputs are checked off, then flips to ready. (Bean salad is *batch* assembly done on prep day, so this recipe-card detail lives inside cook mode, not a serve-time surface.)
- Cook-mode progress is **persisted** per weekly plan (survives refresh / tablet sleep), unlike today's in-memory `checkedItems` set (`Outputs.tsx`, `const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())`).

### 2.5 Day-before prep horizon (see Risks — this is the open seed)
Steps that must start before prep day (thaw a protein 12h ahead, soak beans overnight, pull frozen stock) are given a **lead time**, and the scheduler emits them into the night-before checklist rather than the main timeline. Detailed decision in §7.

### 2.6 GA weights panel
An in-app panel with a slider per weight and a **"Regenerate plan"** button. Adjusting weights + regenerating re-runs the GA (same seed unless the user reseeds) and re-renders the timeline, so the cook can trade elapsed time against consolidation and see the result immediately.

### 2.7 Recipe linter v2
Extends the Phase-1 linter with the rules this phase's data makes checkable:
- **Missing pull/thaw/make step** — a stored or inventory product consumed by an assembly step with no preceding pull/thaw/make step that produces it (the chicken-stock failure).
- **Missing durations** — a step with neither active nor passive minutes.
- **Missing prep vocabulary** — a prep step with no `prep_action`.
Runs **on-demand** in this phase. The publish-time gate that blocks unclean recipes is wired in **Phase 6**, which introduces the draft/publish lifecycle and the import page (import-time linting is deferred there per Phase 1 §4.6/§7); this phase delivers the rules and the on-demand surface those hooks consume.

---

## 3. Data Model Changes

### 3.1 `recipe_steps` — new fields (collection `pbc_1735492817`)
| Field | Type | Notes |
|---|---|---|
| `active_minutes` | number (nullable until backfilled) | hands-on minutes |
| `passive_minutes` | number (nullable until backfilled) | unattended minutes |
| `instructions` | text | ratios / technique detail |
| `prep_action` | select (controlled vocab) | sliced, diced, minced, grated, … — the Topic-2 prep vocabulary. Nullable; expected on prep steps. |

**Proposed (not yet decided) — resource + lead-time fields on `recipe_steps`:** the resource model in the decision record ("oven … stovetop … singleton appliances") requires each step to declare *what it uses*, which the record implies but does not spell out as fields. Proposed:
| Field | Type | Notes |
|---|---|---|
| `resource` | select | `oven` / `stovetop` / `blender` / `food_processor` / `instant_pot` / `none` (**Proposed** — exact enum TBD) |
| `oven_temp_f` | number | required when `resource = oven`; drives the temperature-conflict rule (**Proposed**) |
| `rack_slots` | number | oven rack slots consumed, default 1 (**Proposed**) |
| `lead_time_minutes` | number | if set, step schedules onto the night-before checklist this far ahead (thaw = 720). Addresses the day-before-prep-horizon seed (**Proposed** — see §7) |

**Migration:** all four core fields are additive and nullable, so existing 185 steps validate immediately; the backfill (2.2) populates them. No data rewrite. The `prep_action` enum values should be sourced from the same controlled prep-verb list **Phase 1** establishes for its linter's "prep-words in raw product names" rule (Phase 1 §4.6 rule 2) to keep one vocabulary. (Phase 2 establishes no prep vocabulary; Phase 1 owns the word list, this phase adds the `prep_action` *field* that consumes it — Phase 1 §7 defers that field here.)

### 3.2 Scheduler configuration — **Proposed (not yet decided)**
The GA needs persisted weights and a kitchen-resource profile (burner count, appliance inventory, oven rack count/temp rule). Decision record fixes *that* these are tunable/configurable but not *where* they persist. Proposed: a small singleton `scheduler_config` collection (or a single JSON record) holding `{ seed, weights{...}, burner_count, oven_rack_slots, appliances[] }`, read by the weights panel and the GA. Alternative kept open: client-side (localStorage) if single-device is acceptable. Marked Proposed.

### 3.3 Cook-mode progress — **Proposed (not yet decided)**
Cook-mode check-off state must persist per weekly plan (§2.4). Options: (a) a `cook_progress` collection keyed by `weekly_plan` + scheduled-step identity, or (b) reuse whatever persisted-checkbox mechanism Phase 2 builds for shopping state. Recommend converging on the Phase-2 mechanism to avoid two persistence models; flagged Proposed pending Phase-2's final shape.

### 3.4 Collection-name registry
Any new collection must be added to `collections` in `src/lib/api.ts:51-66` (which already lists `recipeSteps`, `weeklyPlans`, `mealVariantOverrides`, etc.).

---

## 4. Implementation Plan

Ordered; each item independently verifiable.

1. **Schema migration — core step fields.** Add `active_minutes`, `passive_minutes`, `instructions`, `prep_action` to `recipe_steps` in PocketBase; update `pb_schema_updated.json`. Extend `RecipeStep` in `src/lib/types.ts:94-101`. *Verify:* a step record round-trips the new fields via the API.
2. **Authoring UI.** Two touchpoints (do both — they are separate functions): (a) add the four fields to the Edit Step dialog in `src/pages/RecipeEditor.tsx:1237-1288` (TextFields/Select alongside the existing Step Type / Timing controls) and capture them into `node.data` inside `handleSaveEditedStep` at `RecipeEditor.tsx:418-444` (which today only writes `label`/`stepType`/`timing` into local React-Flow node state via `setNodes` — no DB write happens here); (b) add the four fields to the `nodeData` object written to PocketBase in `handleSave` at `RecipeEditor.tsx:629-636` (the step-node branch that currently persists `recipe`/`name`/`step_type`/`timing`/`position_x`/`position_y`). Surface active/passive on the graph node in `src/components/nodes/StepNode.tsx` (extend `StepNodeData` at `:7-10`). *Verify:* edit a step, reload, values persist and render on the node.
3. **AI backfill flow.** New page (e.g. `src/pages/StepBackfill.tsx`) that ingests drafted-metadata JSON produced *offline* by Claude/Claude Code (the `recipe-import` skill pattern — §2.2), not a runtime in-app model call. The page fetches all steps missing fields, matches them to the drafted JSON (batched by recipe), renders draft-vs-current review, and writes on approval only. **Backfill scope includes resource tags:** the same offline draft populates `resource` / `oven_temp_f` / `rack_slots` (§3.1) inferred from `prep_action` and step name, not just the four core fields — otherwise the scheduler's resource constraints have no data to act on (see item 5 and AC4). **Proposed:** in-app page rather than a one-off script, to match the Phase-6 in-app direction; a `scripts/` variant is the fallback. *Verify:* run against test DB, review one recipe, approve, confirm writes (core fields **and** resource tags); re-run touches nothing already filled.
4. **Week-graph builder.** New `src/lib/scheduler/week-graph.ts`: merge per-meal recipe DAGs (input: the `RecipeGraphData` / `MealKeyedRecipeData` structures in `src/lib/aggregation/types.ts:42-55`) into one DAG, linking stored/inventory outputs to consuming inputs across recipes. **Link rule:** add a cross-recipe edge when a stored/inventory **output node's product ID equals** a consuming **input node's product ID** in another planned recipe. Two edge cases must be handled explicitly: (a) **producer absent from the plan** (buy-vs-make — e.g. chicken stock consumed but no recipe in the plan produces it): leave the input as a graph **source** (no cross-edge); the *missing pull/thaw/make step* is a linter concern (§2.7), not a graph-builder error. (b) **Fan-in / multiple producers** (two planned recipes both output the same stored product): the consuming input fans in from all matching producer outputs. **Note:** the scheduler must operate on **per-instance step nodes**, not the signature-merged aggregation used for the batch list (`step-utils.ts:20-27` merges by sorted input/output product-ID signature) — reuse the graph data but not the merge. *Verify:* a two-recipe plan sharing stock produces a single connected DAG with the cross edge; a plan consuming a stored product whose producer is absent leaves that input as a source with no cross-edge.
5. **Resource model + step resource tagging.** Add the Proposed §3.1 resource fields; model oven (slots + temp conflict), N burners, singleton appliances as constraint checks in `src/lib/scheduler/resources.ts`. **Populate the tags on existing data:** the offline backfill (item 3) infers `resource` / `oven_temp_f` / `rack_slots` for the 185 existing steps from `prep_action` + step name — this resolves the §7 "infer vs. require" question in favor of **infer-during-backfill, editable in the authoring UI**; new recipes require the resource tag at import (linter-enforced, §2.7). Without this population step the scheduler's resource constraints are vacuous and AC4 is untestable. *Verify:* two steps at different oven temps are flagged as non-overlapping, exercised against a plan whose steps carry inferred resource tags.
6. **GA scheduler.** `src/lib/scheduler/genetic.ts`: seeded deterministic GA over the week graph; fitness = weighted sum (active-time primary) subject to DAG precedence + resource constraints; emit ordered step instances with start/end offsets + a night-before list for lead-time steps. *Verify:* fixed seed+weights yields byte-identical schedule twice; no resource/precedence violations in output.
7. **Scheduler config persistence + weights panel.** Implement §3.2 storage; build the sliders + "Regenerate plan" panel. *Verify:* moving a slider and regenerating changes the schedule deterministically.
8. **Cook mode UI.** New route/page: now/next cards, tap-for-detail (scaled quantities from the graph + `instructions`), passive-step countdowns, readiness states ("waiting on: …") computed from upstream check-off, check-off → recompute. Persist progress (§3.3). This supersedes `BatchPrepTab.tsx` as the prep-day surface (keep the print stylesheet for batch prep per Topic 1). *Verify:* checking a prep step flips its dependent assembly from "waiting" to ready and shifts downstream countdowns.
9. **Linter v2.** Extend the Phase-1 linter with the three §2.6 rules (missing pull/thaw/make before stored/inventory consumption; missing durations; missing prep vocab), exposed via the same **on-demand** surface Phase 1 built. The **publish-gate wiring is Phase 6's** (the draft/publish lifecycle and import page do not exist until then — Phase 1 §4.6 defers import-time linting to Phase 6); this item ships the rules Phase 6 hooks in. *Verify:* a recipe with an unmet stored input and a step missing durations produces exactly those findings.

---

## 5. Dependencies & Prerequisites

- **Phase 1 (Data hygiene) — hard prerequisite.** Provides linter v1 (v2 extends it), the controlled prep vocabulary (shared with `prep_action`), and unit standardization (per-step scaled quantities in cook mode are only trustworthy once unit-blind summing is fixed — `product-builder.ts:91`, `step-builder.ts:132`).
- **Phase 4 (Week memory) — prerequisite for the day-before horizon.** The night-before checklist needs `weekly_plans` to carry a **start date** (added in Phase 4); without dates, "the night before" has no anchor.
- **Phase 2 (Shopping state) — soft dependency.** Its persisted-checkbox mechanism is the recommended substrate for cook-mode progress (§3.3); if Phase 2's shape isn't final, cook mode uses its own `cook_progress` collection.
- **The backfill (item 3) must precede the scheduler being useful** — the GA optimizes over durations that don't exist until backfilled. Scheduler code can be built in parallel, but a meaningful schedule requires populated metadata.
- **No new infra.** Runs against existing PocketBase (test `:8091` for schema/code, prod `:8090` for content per the eliminated-migration model). This holds **only because the AI backfill is offline** (Claude/Claude Code emits draft JSON, the app just reviews-and-writes — §2.2); a runtime in-app LLM call would require a key/proxy and break this claim. Tailnet work (todo `nas-pocketbase-tailnet`) is a Phase-2 concern, not blocking here.

---

## 6. Acceptance Criteria

1. `recipe_steps` exposes `active_minutes`, `passive_minutes`, `instructions`, `prep_action`; all 185 existing steps validate and are editable in the recipe editor.
2. The backfill flow drafts metadata for existing steps, shows a per-batch review, writes only approved values, and is idempotent on re-run.
3. Generating a schedule for a weekly plan with the same `(seed, weights)` produces an identical ordered timeline on repeat runs.
4. Given a weekly plan whose steps carry resource tags (populated by the backfill, item 3/5), the generated schedule violates no DAG-precedence edge and no resource constraint (oven slots, oven temp overlap, burner count, singleton appliance capacity). *(This criterion is only meaningful once resource tags are populated — see item 5.)*
5. Cook mode shows now/next cards; checking off a step recomputes the remaining timeline; passive steps show live countdowns; an assembly step displays "waiting on: …" until its upstream outputs are checked, then reads ready; tapping a step shows scaled quantities + instructions. Progress survives a refresh.
6. The weights panel changes the schedule deterministically via sliders + "Regenerate plan."
7. Linter v2 flags, on-demand: (a) a stored/inventory input consumed with no preceding pull/thaw/make step, (b) a step missing durations, (c) a prep step missing `prep_action`. (The publish-blocking behavior lands in Phase 6 with the draft/publish gate — see Phase 6 AC11; this phase delivers the rules and the on-demand run.)
**Conditional / deferred (tied to Phase-4 dependency and Proposed `lead_time_minutes`):**

8. *(Conditional — only if `lead_time_minutes` is committed in-scope, see §3.1/§7; requires Phase-4 plan start dates to anchor "the night before.")* A recipe with a `lead_time_minutes` step surfaces that step on a night-before checklist separate from the prep-day timeline. If `lead_time_minutes` remains Proposed/deferred at planning time, this criterion moves to the next phase along with the feature.

---

## 7. Risks & Open Questions

- **Day-before prep horizon (the open seed, `.planning/seeds/day-before-prep-horizon.md`).** Direction: add a `lead_time_minutes` attribute (§3.1, Proposed) so the GA emits a **night-before checklist** alongside the prep-day timeline; the linter's "missing pull/thaw/make" rule catches the *missing step*, while `lead_time_minutes` handles *when* it runs. **Still open (blocks committing this in-scope):** whether a single scalar lead time is enough or steps need an absolute "must-finish-before prep starts" horizon (thaw vs. overnight marinate differ), and whether cook mode needs a distinct "tonight, for tomorrow" card vs. reusing the timeline. Because both the horizon design and the Phase-4 plan-start-date dependency are unresolved, `lead_time_minutes` and its acceptance criterion (AC8) are held in the **conditional/deferred** bucket: commit them in this phase only if the scalar-vs-absolute-horizon question is resolved and Phase 4 has landed dates; otherwise they slide to a later phase. The rest of Phase 5 (metadata, scheduler, cook mode, linter) does not depend on lead time.
- **GA cost model is only as good as the backfilled durations.** AI-drafted minutes are estimates; a bad estimate produces a plausible-but-wrong schedule. Mitigation: durations are editable in cook mode and the review gate is human. Risk that the household never corrects them.
- **Resource declaration burden (Proposed §3.1).** Tagging every step with a resource + oven temp is real authoring overhead the decision record didn't fully price. **Resolved here:** the resource tags are **inferred during the offline backfill** from `prep_action` + step name (item 3/5), editable afterward in the authoring UI, and required at import for new recipes (linter-enforced) — rather than a separate hand-tagging pass. The residual risk is inference quality: a mis-inferred oven temp or resource produces a plausible-but-wrong schedule until corrected (same failure class as bad duration estimates below).
- **Recompute-on-check-off UX.** Constantly reshuffling "next" as the cook falls behind could feel unstable. The decision record fixes *order as authoritative, clock adapts* — so order should be stable and only times shift; verify this reads calmly on the tablet.
- **Signature-merge vs. per-instance scheduling.** The batch-prep aggregation deliberately merges identical steps across meals (`step-utils.ts`); the scheduler must *not* inherit that merge or it loses per-meal precedence and resource counts. Called out in §4.4 to prevent a subtle correctness bug.
- **Persistence-model convergence (§3.3).** Whether cook progress rides Phase-2's persisted-checkbox mechanism or gets its own collection is deferred to when Phase 2 lands.
- **`scheduler_config` location (§3.2).** Collection vs. localStorage deferred; affects whether weight tuning is shared across devices.
- **Deferred by design:** multi-cook scheduling (one cook assumed), a density/cross-dimension conversion model (cross-dimension mismatches stay linter findings per Topic 2), and nutrition-aware sequencing.
