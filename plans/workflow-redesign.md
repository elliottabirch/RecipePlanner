# Workflow Redesign — Decisions & Roadmap

_Discussion held 2026-07-05. Captures the diagnosis of the seven workflow frustrations, the decisions made per topic, and a phased roadmap. Supersedes nothing in `decisions.md` except where explicitly noted._

## Diagnosis summary

The seven frustrations reduce to four root causes:

1. **No unit discipline in the data layer.** Free-text units, aggregation sums quantities across mismatched units, no unique constraint on product names.
2. **Steps carry no metadata.** No duration, no instructions, no prep vocabulary — so prep-day sequencing and assembly-time clarity are both unsolvable with current data.
3. **The weekly plan has no memory.** No dates, no templates, no staples concept, no persisted checkbox state.
4. **The import pipeline is self-inflicted overhead.** The app already has a full recipe editor (`RecipeEditor.tsx`) doing the same DB writes as the bespoke import scripts, and recipe data never required a frontend deploy.

### Confirmed bugs (fix regardless of features)

- **Unit-blind quantity summing** — `src/lib/aggregation/builders/product-builder.ts:68-72` keys by product ID and `:87-100` sums `totalQuantity` without comparing units. Real data: white bean stew has olive oil nodes of `0.25 cup` and `2 tbsp` → shopping list shows "2.25 cup". Same pattern in `step-builder.ts:132-148`.
- **Spec/code divergence on step aggregation** — `decisions.md` says exact name match; code merges by sorted input/output product-ID signature (`step-utils.ts:20`). Reconcile docs to match code (signature behavior is kept).
- **Shopping checkbox state is in-memory only** (`Outputs.tsx:113`) — resets on refresh/tab switch.
- **`unit` field overloaded** as container-type name for stored products (`aggregation.ts:334`) — must be split into its own field before unit standardization.
- **No unique constraint on `products.name`** — near-dupes exist (Olive oil / olive oil, parsley / parsley (raw)).

---

## Topic 1 — Shopping flow & live substitution

Problem: binary non-persistent checkboxes; no "have 2 of 5 potatoes"; substitutions are per-meal-node, require pre-existing products, and can't be done mid-shop. Printed lists are cumbersome; a tablet is available for shopping and prep.

**Decisions:**

- **Swap scope: pick recipes at swap time.** Swap dialog (opened from a shopping-list line) shows which of this week's meals use the product; user checks which get the substitute.
- **Quantity on swap: always prompt per recipe.** Each checked recipe gets an explicit quantity/unit entry for the substitute.
- **Propagation is automatic** — all outputs (shopping, prep, pull lists, containers) are derived from the flow graph, so a persisted swap re-derives everything. Implementation extends the existing `meal_variant_overrides` mechanism.
- **Partial-have: numeric "have N"** per shopping line; list shows remaining-to-buy.
- **State: persisted to PocketBase per weekly plan.** Single-user; no realtime sync. Survives refresh and device switches.
- **Make-at-home action:** a line item can be resolved as "make it" — marked not-to-buy; if the product has a `source_recipe`, offer to add that recipe to the week so its steps land in the prep list. (Resolves the todo.txt "raw state is in the house" item.)
- **Device target: tablet-first**, touch-friendly Outputs pages. **Print stylesheet kept for batch prep only** — shopping goes fully digital.
- **Connectivity model (explored 2026-07-05): tailnet, not local-first.** The NAS PocketBase instances join the tailnet and the tablet rides a phone hotspot, so the DB is reachable from the store. The shopping UI needs only optimistic updates with retry + a pending-sync indicator for flaky moments — no offline-first sync architecture. Prerequisite: move `db-config.ts` from LAN IPs to tailnet hostnames (see todo `nas-pocketbase-tailnet`).
- **New products mid-swap:** registry is pre-seeded (Topic 2) so misses are rare; a minimal, phone-friendly quick-create dialog covers edge cases. Keep it ruthlessly scoped — name + store/section + unit.

## Topic 2 — Units & product hygiene

**Decisions:**

- **Seed the registry from USDA FoodData Central, Foundation Foods first** (~800 concept-level items — "black beans", not "Del Rio black beans 8 oz"; the purveyor noise is confined to FDC's "Branded" type, which we skip entirely). Rename to plain names; filter to raw purchasable items. Quick-create gains a **"search USDA" mode** pulling SR Legacy items on demand.
- **Fast product search**: fuzzy/token typeahead (client-side over a few thousand items) instead of exact-prefix matching.
- **Store/section on seeded items: category defaults at import** (USDA category → store section best guess), corrected inline at first use.
- **Canonical unit + dimension per product; unit becomes an enum.** Conversion **within dimension only** (tbsp↔cup, g↔lb). Cross-dimension mismatches (5 potatoes vs 2 lb) are **linter findings**, fixed at authoring time. No density model.
- **Preparation states are NOT products.** Cucumber is one raw product; sliced/diced/minced states are transient nodes from prep steps. Enforced by lint (no prep-words in raw product names). **Structured prep vocabulary** (controlled list: sliced, diced, minced, …) added to prep steps/transient nodes — this is also the signal the scheduler's chopping-consolidation weight consumes.
- **Dedup: one-shot assisted cleanup** — run `scripts/find-duplicates.js`, review proposed merges, migrate node references to survivors, then add a **case-insensitive unique index on `products.name`**.
- **Nutrition: design for it, build later.** Keep USDA FDC IDs on products; nullable enrichment fields or a linked table; no UI now.

## Topic 3 — Weekly planning memory

**Decisions:**

- **`weekly_plans` gains a start date.** Prerequisite for history, rotation, and "last week".
- **Rotation pools are tag-based.** A week template is a list of slots ("2 × dinner-main", "1 × bean-salad"), each pool defined by recipe tags. New recipes join a pool by being tagged.
- **New-week flow: blank + guided fill.** A wizard walks slot-by-slot; within each slot, pool options are ordered **least-recently-planned first**.
- **Staples = the first wizard slot**, pre-filled with last week's staple items; confirm in one tap or adjust. No separate staples machinery.
- **Freshness: planned = cooked.** No confirm-cooked tracking; rotation uses planning history.
- **Scaling: a single people-multiplier on the weekly plan** (explored 2026-07-05), stacked on top of per-meal quantities, for guest/travel weeks. No per-person portion model, no recipe yield engine — rejected as machinery the household doesn't need.

## Topic 4 — Prep-day engine (scheduling + assembly clarity)

**Decisions:**

- **Schema: `recipe_steps` gains `active_minutes`, `passive_minutes`, `instructions`**, plus the Topic-2 prep vocabulary. `instructions` is where ratios/amount details (e.g. bean-salad dressing) finally live; exact per-step input quantities are already derivable from the graph.
- **Backfill: AI-assisted one-shot pass** — durations, prep vocab, and instruction text drafted for all existing steps, reviewed in batches. New recipes require the fields at import (linter-enforced).
- **Scheduler: seeded genetic algorithm** over the merged week-graph (recipe graphs are already dependency DAGs). Deterministic given seed + weights. Tunable weights: active/hands-on time, chopping consolidation, step grouping, elapsed time, resource pressure.
- **Primary objective: minimize active/hands-on time.** Consolidation-friendly; elapsed time is secondary.
- **Modeled resources:** oven (rack slots **and** temperature-conflict rule), stovetop (configurable burner count), singleton appliances (blender, instant pot, food processor — capacity 1). **One cook assumed** (no hands-count resource for now).
- **Cook mode: interactive timeline on the tablet.** Now/next cards, check-off advances the plan, countdown timers on passive steps, recompute-on-check-off (order is authoritative; the clock adapts). Tapping a step shows exact scaled quantities + instructions.
- **Assembly steps show full detail in cook mode** with a **readiness state** ("waiting on: diced onion, cooked beans") until upstream outputs exist. (Clarified: bean salad is *batch assembly*, not just-in-time — the recipe-card need is inside cook mode, not a serve-time surface.)
- **GA tuning: in-app weights panel** with sliders + "regenerate plan".
- **Open seed:** day-before prep horizon — thaw/marinate/overnight/pull-out tasks that must schedule *before* prep day (the chicken-stock delay is partly this class). Decide when designing the scheduler; see `.planning/seeds/day-before-prep-horizon.md`.
- **Recipe linter** (import-time + on-demand) — rules so far:
  - stored/inventory input consumed by an assembly step with no preceding pull/thaw/make step (the chicken-stock failure)
  - step missing durations or prep vocabulary
  - node unit not convertible to product's canonical unit / cross-dimension mismatch
  - prep-words in raw product names
  - raw product missing store/section (existing convention, now enforced)

## Topic 5 — Import pipeline & inspiration

**Decisions:**

- **In-app import page** replaces bespoke per-recipe scripts: accepts structured recipe JSON (from the recipe-import skill, or from Claude on a phone parsing pasted/photographed recipes) and creates the full graph as a **draft**, reviewable in the existing `RecipeEditor`. Kills the PC requirement.
- **Draft flag, direct to prod.** Recipes gain draft/published status; imports land in prod as drafts, invisible to planning until published. **The test→prod content-migration step is eliminated**; the test DB remains for schema/code changes only. The recipe-import skill gets rewritten to emit JSON for the import page instead of generating scripts.
- **Inspiration: on-demand `/suggest-recipes` skill** — reads the product registry + recent plans, proposes 3–5 candidates as import-ready JSON. Constraints (all selected):
  - ≥~80% ingredient overlap with the existing registry
  - low active prep time (passive time acceptable)
  - batch-prep compatible (stores/reheats/assembles within the prep-day model)
  - protein/macro floor per serving (pairs with the nutrition-later schema)
- **Recipe evolution loop** (explored 2026-07-05): a one-tap **note** can be attached to a recipe from any surface (calendar cell, cook mode, recipe card) — "more lemon", "brussels version was better". Pending notes form a queue; an **agent pass turns each note into a draft revision** of the recipe (reusing the draft/published mechanics above). The week wizard flags revised recipes — "updated per your note, review?" — and the original stays published until approved. Rejected alternatives: edit-immediately (breaks dinner), structured post-cook ratings (weekly ritual not wanted).

---

## Phased roadmap

Ordering follows dependencies; phases 2–6 each deliver standalone value.

1. **Data hygiene** — fix unit-blind aggregation (interim key: product+unit), split container-type out of `unit`, unit enum + canonical units + within-dimension conversion, dedup cleanup + unique index, linter v1, reconcile `decisions.md` with actual step-aggregation behavior.
2. **Shopping state** — persisted per-plan list state, have-N, checked persistence, swap flow (pick-recipes + per-recipe quantity prompt), make-it action, quick-create dialog, tablet-friendly Outputs pass, batch-prep print stylesheet. Prereq: NAS PocketBase on tailnet + `db-config.ts` hostname switch; UI uses optimistic updates with retry.
3. **Registry seeding** — USDA Foundation import (plain names, category→section defaults), fuzzy search, "search USDA" in quick-create, FDC IDs + nutrition-ready schema.
4. **Week memory** — dates on plans, tag-based slots + week template, guided-fill wizard with staples-first slot, LRU ordering, people-multiplier field applied on top of meal quantities.
5. **Prep-day engine** — step metadata schema, AI-assisted backfill + review, GA scheduler with resource model, interactive cook mode with readiness states, weights panel, linter v2 (durations/pull-step rules).
6. **Import & inspiration** — draft flag, in-app JSON import page, recipe-import skill rewrite (emit JSON), retire migration scripts, `/suggest-recipes` skill, recipe-note capture + agent-applied draft revisions (evolution loop).
