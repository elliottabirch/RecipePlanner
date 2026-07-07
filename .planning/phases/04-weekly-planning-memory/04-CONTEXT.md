# Phase 4: Weekly Planning Memory - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the weekly plan a memory. Concretely:

- **Dated weeks** — `weekly_plans` gains `start_date` (the week's Monday); existing undated plans backfilled (WEEK-01). This is the backbone for history, "last week", and least-recently-planned ordering.
- **People-multiplier** — a single per-plan `people_multiplier` (default 1, fractional-capable) that stacks on per-meal `quantity` and flows through aggregation to scale all quantity-dependent outputs (WEEK-02, but see D-03: pull lists now included).
- **Tag-based week template** — `week_templates` + `template_slots` collections; each slot = label + count + target `meal_slot`/`day` + a tag-defined recipe pool (WEEK-03). Recipes join a pool by being tagged; no per-slot recipe lists.
- **Guided-fill wizard** — a blank-start wizard that walks slots in `sort_order`; the first slot is Staples (pre-filled from last week, one-tap confirm), every other slot presents its pool least-recently-planned-first; picks land as `planned_meals` (WEEK-04). Skippable/exitable; the manual Add-Meal flow stays.

**"Planned = cooked."** No confirm-cooked tracking — a recipe's "last cooked" is the `start_date` of the most recent plan containing it (locked in decision record; do not re-litigate).

**Explicitly OUT of this phase:** per-person portion model / recipe-yield engine (rejected 2026-07-05); preference-weighted rotation (rotation stays pure LRU); confirm-cooked tracking. The recipe-evolution "review revised recipe in the wizard" hook is **Phase 6** — this phase only builds the wizard shell it later hangs off.

</domain>

<decisions>
## Implementation Decisions

> Four gray areas researched (advisor mode, `standard` calibration). Most of Phase 4's "how" was already locked by the decision record + phase doc (verified against code); these four were the genuinely-open product/scope calls.

### Locked upstream (carried in — do NOT re-ask)
- `weekly_plans` gains `start_date` (Monday, backfilled then required) + `people_multiplier` (default 1; absent ⇒ 1). Mandated by decision record (`plans/workflow-redesign.md` Topic 3).
- Multiplier applied at the **three true derivation sites**: `aggregation.ts:180`, `product-builder.ts:136`, `step-builder.ts:173` as `mealCount = (meal.quantity || 1) * peopleMultiplier`. Do NOT also edit `flow-builder.ts:38,80` (they consume the passed `mealCount` — double-count hazard).
- Rotation pools are tag-based (reuse existing `tags`/`recipe_tags`, no new tagging UI). Wizard orders pools LRU-first; Staples = first slot, copy-forward from last week.
- LRU tie-break is deterministic: never-planned first, then ascending last-planned date, ties broken by recipe `name` asc (then `id` asc) — stable across renders (phase doc §4 item 4 / AC#6).
- Schema changes made **manually via PocketBase admin UI** on both prod (`:8090`) and test (`:8091`), mirrored into `pb_schema.json`. `sync-to-test.js` is a data copier only — extend its `COLLECTIONS_TOP_DOWN` with `week_templates` then `template_slots` (dependency order) so their records copy to test.

### Template management scope — D-01
- **D-01: Seed once, defer the editor UI.** No in-app template editor this phase. Seed the household's single de-facto `week_templates` row + its `template_slots` (one Staples slot with `prefill_from_last_week=true`, plus dinner/salad/etc. slots keyed to existing tags) via the PB admin UI or a one-off `recipe-planner/scripts/` seed script run against both instances. Rationale: the phase doc itself calls the editor "low-frequency… can be minimal," the household has one recurring week shape, and the phase's real value is the wizard/LRU/multiplier (items 1–6, 8). **This DROPS phase-doc §4 item 7 (template editor UI) from Phase 4 scope.** Rare edits (new pool tag, count change) happen in desktop PB admin + re-mirror to test — the accepted friction already used for schema. A minimal in-app editor is the natural follow-on if desktop-admin editing proves annoying (see `<deferred>`).

### Wizard interaction model — D-02
- **D-02: Accordion, one-at-a-time (single page).** Build `WeekWizard.tsx` as a one-page accordion, NOT a modal stepper (a modal fights the required "skippable/exitable at any point"). Specifics:
  - Active slot expanded, others collapsed; **auto-advance** to the next slot on completion; collapsed headers show `N of {count} picked` (a `Chip` badge) so the whole week's state stays visible.
  - Picking = **tap-to-toggle recipe `Chip`s** — reuse the colored-`Chip` idiom already at `WeeklyPlans.tsx:743-778` (`filled` when selected, `outlined` when not).
  - A slot is **never blocking**: leaving it 0/partial is valid and simply writes fewer `planned_meals` (consistent with "skippable").
  - **Off-pool recipes** reachable via a small "+ add other recipe" `Autocomplete` docked at the bottom of each expanded section — reuse the exact recipe `Autocomplete` from the Add-Meal dialog (`WeeklyPlans.tsx:998-1018`), writing into that slot's `meal_slot`/`day`.
  - **Staples slot = accordion #1, pre-expanded**, last week's picks pre-toggled, one prominent **"Confirm staples"** action that advances without re-tapping each chip (individual chips stay toggleable to drop/add before confirming). This is the one-tap fast path.
  - Every written `planned_meal` carries the slot's `meal_slot` (**required** — never null) and `day` (may be null for week-spanning slots) so wizard meals behave identically to manual ones and day-specific slots yield non-empty pull lists (AC#9).

### Pull-list scaling — D-03 (SCOPE EXPANSION — reverses phase-doc AC#7 exclusion)
- **D-03: Fix `buildPullLists` to honor quantity × multiplier.** Pull lists are INCLUDED in the people-multiplier. Change `buildPullLists` (`aggregation.ts` ~101-158) to emit `node.quantity × (meal.quantity || 1) × peopleMultiplier` — the same one-line pattern already proven at `step-builder.ts:52,86`. One prod call site (`Outputs.tsx`) + 3 test assertions to update. Rationale: the pull list is the household's literal what-to-pull checklist; a guest week that scales shopping/prep/containers but not the pull list is a visible trust gap ("if the graph says it, the list must be right"). Blast radius is small (one well-tested function).
  - **⚠ Planning must handle two ripples:** (1) this is also a latent **correctness fix** — it changes pull-list output for *existing* meals with `quantity > 1`, so it needs a regression check, not just "multiplier=1 ⇒ no change"; (2) it **expands v1.1 scope past `PULL-F1`** (currently "excluded from v1.1") and **revises `AC#7`** (which excludes pull lists). Update `REQUIREMENTS.md` (PULL-F1 → folded into WEEK-02) and phase-doc §4 item 5 / §6 AC#7 / §7 Open-Question during planning so the docs match this decision.

### Multiplier rounding — D-04
- **D-04: Ceil discrete, exact continuous.** Multiplier accepts fractional values (0.5 travel / 1.5 guest). Rounding rule:
  - **Continuous mass/volume (g, ml, cup, …) stay exact fractional** — matches `units.ts` D-11 ("aggregation stays exact and reviewable; rendering handles display") and preserves AC#7's hand-multiply equivalence. `337.5g` is a real, weighable number.
  - **Discrete `each`-dimension counts (eggs, cans) and container instance counts get a deliberate `Math.ceil`** — never under-buy an indivisible item. Critically, make the container ceil **explicit**, not reliant on the incidental float behavior of `product-builder.ts`'s `for (i < instances)` loop, which can drift an extra container from float error (e.g. `2.0000000002`).
  - **Documented AC#7 exception:** for `each`-dimension products, `ceil` can diverge from a raw hand-multiply (`3 eggs × 0.5 = 1.5 → shows 2`). Call this out explicitly in the AC/verification rather than claiming byte-for-byte equivalence for `each` items. Continuous items remain byte-for-byte.
  - Prefer a single shared rounding helper over duplicating `Math.ceil` logic across the three re-derivation sites.

### Claude's Discretion
- `week_templates`/`template_slots`/`planned_meals.template_slot` exact field shapes (phase doc §3.3–3.4 proposal is a strong default; `template_slot` link recommended for exact staples pre-fill but tag-membership fallback is acceptable).
- `start_date` backfill algorithm details (parse "Week of …" names, else descending Mondays by `created`; phase doc §3.6 / item 1b) — mechanics are Claude's to finalize; only the outcome (every existing plan non-null, then tighten to required) is fixed.
- Seed-script vs admin-UI for the one template row; dry-run/report mode on the backfill script.
- `people_multiplier` control placement/widget (plan header vs edit dialog) — phase doc item 6 default (both, + surface on Outputs) is fine.
- Pool `pool_tags` match-any vs match-all — match-any is the default; single-tag pools make it moot today.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone decision record
- `plans/workflow-redesign.md` §Topic 3 ("Weekly planning memory") + §Phased roadmap phase 4 — authoritative source for the mandated decisions (start_date, tag-based slots, blank+guided fill, LRU order, staples-first, planned=cooked, people-multiplier).

### Phase design (mostly current; two deltas)
- `.planning/phase-docs/phase-4-week-memory.md` — full elaborated phase design, code-verified with line numbers. **Two deltas from this discussion:** (1) §4 item 7 (template editor UI) is **dropped** from Phase 4 per D-01 (seed once, defer); (2) §4 item 5 / §6 AC#7 / §7 pull-list exclusion is **reversed** per D-03 (pull lists now scale). All other sections (schema §3, backfill §3.6/item 1b, LRU §4 item 4, multiplier plumbing §4 item 5, wizard §4 item 8, ACs) remain authoritative.
- `.planning/phase-docs/00-overview.md` — milestone overview.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §Week Memory — WEEK-01..04, and §Deferred `PULL-F1` (now folded into WEEK-02 per D-03 — update during planning). §Requirement→Phase map lines 118-121.
- `.planning/ROADMAP.md` §Phase 4 — goal + success criteria.

### Schema & codebase
- `pb_schema.json` — canonical PocketBase schema (22 collections). Verify `weekly_plans`, new `week_templates`/`template_slots`, and optional `planned_meals.template_slot` against it; mirror all new fields/collections in.
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md`, `STACK.md` — codebase maps.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recipe-planner/src/pages/WeeklyPlans.tsx` (1128 lines) — the plan/meal home. Reuse: colored-`Chip` tag-group idiom (`:743-778`) for wizard pick chips; Add-Meal recipe `Autocomplete` (`:998-1018`) for the wizard's off-pool add; plan dialog (`:953-987`, `handleSavePlan` `:356-391`) extends with the `start_date` picker + `people_multiplier` control; plan list/header (`:584-587`, `:792-794`) show the date.
- `recipe-planner/src/pages/registries/Tags.tsx` — List+Dialog CRUD pattern; the reference if the deferred minimal template editor is ever built.
- `recipe-planner/src/pages/RecipeEditor.tsx:753-774` — `Autocomplete multiple` tag-selection pattern (for `pool_tags` if/when an editor is built; also the template-seed reference).
- `recipe-planner/src/lib/step-builder.ts:52,86` — the proven `quantity × mealCount` scaling pattern to copy into `buildPullLists` (D-03).
- `recipe-planner/src/lib/units.ts` — D-11 "aggregation stays exact, rounding is display-only" precedent grounding D-04; unit enum + dimension map classify `each` vs mass/volume for the rounding split.
- `recipe-planner/scripts/sync-to-test.js` — PocketBase-client boilerplate + `COLLECTIONS_TOP_DOWN` copy list; pattern for the `start_date` backfill script and the template seed; **must be extended** with `week_templates`, `template_slots`.

### Established Patterns
- Schema changes are manual (PB admin UI, both instances) + mirrored to `pb_schema.json`; new fields nullable-first, backfill, then tighten to required (the `start_date` sequence).
- Aggregation re-derives `mealCount` independently at three sites — the multiplier must be applied at each; `flow-builder.ts` consumes, never derives (don't touch).
- New collections must be added to the `collections` map in `recipe-planner/src/lib/api.ts` (`:51-68`) and typed in `recipe-planner/src/lib/types.ts` (extend `WeeklyPlan` at `:117-119`; add `WeekTemplate`/`TemplateSlot`).

### Integration Points
- `weekly_plans` record is already loaded at `Outputs.tsx:159`; look up the selected plan by `selectedPlanId` to get `people_multiplier` at the `buildProductFlowGraph` call site (`Outputs.tsx:320`) — the meal-fetch block (`:195`) doesn't have the plan in scope.
- `buildProductFlowGraph` and `buildPullLists` both live in `recipe-planner/src/lib/aggregation.ts` (not `builders/`); pull-list prod call site is `Outputs.tsx` (~:376).
- New files anticipated: `recipe-planner/src/components/WeekWizard.tsx`, `recipe-planner/src/lib/planning/history.ts` (LRU service), `recipe-planner/scripts/backfill-plan-dates.js`, a template-seed script.

</code_context>

<specifics>
## Specific Ideas

- Wizard should feel like a *walkthrough that never hides the week* — accordion sections, auto-advance, "N of count" badges, staples one-tap confirm. Tablet-first touch targets.
- Trust bar for the multiplier: a 1.5× guest week must scale the pull list too (D-03) — the user explicitly wants the physical what-to-pull checklist to be right, not just the shopping list.
- Never under-buy an indivisible item (eggs/cans/containers ceil), but don't overstate butter/cups (stay fractional) — D-04.

</specifics>

<deferred>
## Deferred Ideas

### Minimal in-app template editor → follow-on if desktop-admin editing chafes
D-01 defers the template editor. If editing pool tags/counts in desktop PB admin (+ re-mirror to test) proves annoying in real use, build a minimal tablet editor reusing `Tags.tsx` list+dialog CRUD + `RecipeEditor.tsx` tag-multiselect (~1-2 files, single template, no drag-reorder). Not worth the phase-4 scope now.

### Multi-template / seasonal templates
`week_templates` is modeled as a collection (not a settings row) precisely so seasonal variants don't need a later migration — but no multi-template UI/logic is built now. Pick up only when a second template is actually wanted.

### Pool match-all semantics
`pool_tags` is match-any. If a slot ever needs "salad AND vegan", add an explicit any/all toggle then. Moot today (single-tag pools).

### Reviewed Todos (not folded)
- `deploy-pb-superuser-env` — NOT folded, but a **prereq note**: the `start_date` backfill script + schema/seed scripts need PB superuser creds locally (gitignored `.env.local`), same as Phase 1/3 scripts. The NAS deploy-env change itself is out of scope.
- `nas-pocketbase-tailnet` — infra for Phase 2/6 store use; Phase 4 is not store-facing (wizard/planning runs on LAN). Not Phase 4.
- `single-purchase-unit-shopping-lines` — deferred to its own dedicated follow-on phase (Phase 3 decision). Not Phase 4.
- `swap-aware-prep-naming` — Phase 5 (prep-step metadata rework). Not Phase 4.
- `usda-search-plain-rename` — Phase 3 Search-USDA follow-up. Not Phase 4.

</deferred>

---

*Phase: 4-Weekly Planning Memory*
*Context gathered: 2026-07-07*
