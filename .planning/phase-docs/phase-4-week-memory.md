# Phase 4: Weekly Planning Memory

> Source of truth: `plans/workflow-redesign.md` → Topic 3 ("Weekly planning memory") and roadmap phase 4. This doc elaborates that decision record; every choice that goes beyond it is marked **Proposed (not yet decided)**. Schema claims are verified against `pb_schema_updated.json` and cited code against the real frontend.

---

## 1. Purpose & Problem Statement

Root cause #3 from the diagnosis: **the weekly plan has no memory.** Today a "week" is a bare record and meals are added one at a time from a flat recipe list. Concretely:

- **`weekly_plans` has exactly one field beyond system columns: `name` (optional text).** Verified: `pb_schema_updated.json` lines 1747-1788 — the collection's only user field is `text1579384333` / `name`. There is no date, no template, no scaling factor.
- **No date means no history and no rotation.** Because plans are undated, the app cannot answer "when did we last cook this?" or "what did we have last week?" There is no ordering signal, so nothing can suggest what to plan next.
- **New-week flow is fully manual.** `WeeklyPlans.tsx` creates a plan from just a name (`handleSavePlan`, lines 356-391) and every meal is hand-picked through the "Add Meal" dialog (`handleSaveMeal`, lines 412-436) against an alphabetical recipe `Autocomplete` (lines 998-1018). Nothing is pre-filled; the household re-derives the same staple list from scratch every week.
- **No rotation pools.** Tags exist (`tags`, `recipe_tags`; schema lines 1691-1745 and 1419-1472) and are already used cosmetically to group "Micah" meals by tag (`WeeklyPlans.tsx` 710-778), but there is no concept of a slot ("2 × dinner-main") or a pool of tag-eligible recipes to draw from.
- **Scaling is per-meal only.** `planned_meals.quantity` (schema lines 950-961) multiplies a single meal, and aggregation *derives* `mealCount = meal.quantity || 1` at three sites: `aggregation.ts:180` (inside `buildProductFlowGraph`, feeding the flow graph), `product-builder.ts:136`, and `step-builder.ts:173`. (`flow-builder.ts:38,80` *consume* that `mealCount` as a passed parameter — they are not derivation sites.) There is no way to say "this whole week is for 6 people, not 4" without editing every meal's quantity by hand.

This phase gives the plan a memory: a start date, a reusable slot-based template, a guided fill wizard that leads with staples and orders each pool by least-recently-planned, and a single people-multiplier on the plan that stacks on top of per-meal quantities.

---

## 2. Feature Descriptions

### 2.1 Dated weeks
Every weekly plan gains a **start date** (the Monday of that week). This is the backbone for everything else: history queries, "last week", and least-recently-planned ordering all key off it. The plan header shows the date; the New Plan dialog collects it (defaulting to the upcoming Monday). Existing name stays as an optional free-text label ("Thanksgiving week").

### 2.2 Week template & rotation slots
A **week template** is an ordered list of **slots**. Each slot is:
- a **label** ("Dinner mains", "Bean salad", "Staples"),
- a **count** (how many recipes to pick — "2 ×", "1 ×"),
- a **pool** defined by one or more **recipe tags** — the recipes eligible to fill that slot are those carrying a matching tag,
- optionally a **target meal slot** (breakfast/lunch/dinner/snack/micah) so filled meals land in the right row.

New recipes join a pool simply by being tagged — no per-slot recipe lists to maintain. The template is edited rarely; the household has essentially one recurring weekly shape.

### 2.3 Guided-fill wizard (blank start)
Creating a new week opens a **wizard that starts blank** and walks the template **slot by slot**:

- **The first slot is Staples.** It is **pre-filled with last week's staple picks** — confirm in one tap, or adjust. No separate staples system; staples are just the first slot with copy-forward behavior.
- **Every other slot presents its pool ordered least-recently-planned first.** The recipe you haven't cooked in the longest time (or never) floats to the top; the one you made last week sinks. You pick `count` recipes to fill the slot, then advance.
- Picks accumulate into the plan as `planned_meals`, using the slot's target meal slot and count.
- The wizard can be skipped or exited at any point; the existing manual "Add Meal" flow remains available for one-offs and edits.

**"Planned = cooked."** There is no separate confirm-cooked tracking (explicitly rejected in the decision record). A recipe counts as "last cooked" on the start date of the most recent plan that contains it.

### 2.4 People multiplier
The plan gains a **people-multiplier** (default 1). It **stacks on top of** each meal's own `quantity`, so the effective portion count for any meal is `plannedMeal.quantity × plan.people_multiplier`. Set it to 1.5 for a guest week or 0.5 for a travel week and every shopping quantity, prep amount, and container count scales together — no per-meal edits. This is deliberately the *only* scaling knob; no per-person portioning or recipe-yield engine (rejected in exploration 2026-07-05).

---

## 3. Data Model Changes

All new collections/fields are additive; no destructive migration of existing data is required. Field names below are proposed; only `weekly_plans.start_date` and `weekly_plans.people_multiplier` are directly mandated by the decision record.

### 3.1 `weekly_plans` — add fields (mandated)
| field | type | notes |
|---|---|---|
| `start_date` | date | The week's Monday. **Backfill:** existing undated plans get a synthetic date (see Migration). Required going forward. |
| `people_multiplier` | number (default 1) | Stacks on `planned_meals.quantity`. Nullable/absent ⇒ treated as 1. |

### 3.2 `week_templates` — new collection *(Proposed — the decision record says "a week template is a list of slots" but does not specify persistence shape)*
| field | type | notes |
|---|---|---|
| `name` | text, required | e.g. "Standard week". Single template is sufficient today; collection form leaves room for seasonal variants without a migration. |

### 3.3 `template_slots` — new collection *(Proposed)*
| field | type | notes |
|---|---|---|
| `template` | relation → week_templates, required | Owning template. |
| `label` | text, required | Slot name shown in the wizard. |
| `count` | number, required | How many recipes fill this slot ("2 ×"). |
| `meal_slot` | select (breakfast/lunch/dinner/snack/micah), **required** | Target row for the created `planned_meals`; matches the existing `planned_meals.meal_slot` enum (schema 928-938). **Must be required:** `planned_meals.meal_slot` is `required: true` (schema line 934), so a slot with no `meal_slot` would make the wizard's `create(collections.plannedMeals, …)` write a null required field and PocketBase would reject it. |
| `day` | select (mon/tue/wed/thu/fri/sat/sun), optional | Target day for the created `planned_meals`; matches the existing `planned_meals.day` enum (schema 943-948). **Load-bearing:** the manual Add Meal flow sets `day` (`WeeklyPlans.tsx:421`), the week view groups by it (`getMealsForDaySlot`, `WeeklyPlans.tsx:507`), and `buildPullLists` filters `daySpecificMeals = plannedMeals.filter(m => m.day)` (`aggregation.ts:108`). If the wizard leaves `day` null, wizard-built plans diverge from manual ones **and produce empty pull lists**. Optional here because some slots span the week; when null the created meal is week-spanning, exactly like a manual meal with no day. |
| `pool_tags` | relation → tags, `maxSelect > 1` | Recipes carrying **any** of these tags are eligible. **Match-any** semantics proposed; the record's examples ("dinner-main", "bean-salad") are single-tag pools so any/all is moot in practice. |
| `sort_order` | number | Wizard step order; Staples slot sorts first. |
| `prefill_from_last_week` | bool (default false) | **True on the Staples slot.** When true the wizard pre-fills last week's picks for this slot instead of LRU-ordering the pool. This *is* the "staples = first slot" mechanic — no separate staples table. |

### 3.4 `planned_meals` — add field *(Proposed, optional)*
| field | type | notes |
|---|---|---|
| `template_slot` | relation → template_slots, nullable | Records which slot produced this meal. Makes "last week's staples" an exact query and enables per-slot history. **If omitted**, staples pre-fill falls back to tag membership (recipes tagged as the Staples pool that appeared in last week's plan), which is adequate. Included as an accuracy enhancement, not a hard requirement. |

### 3.5 No change needed to `tags` / `recipe_tags`
Pools reuse the existing tag system as-is. A recipe joins a pool purely by having the tag (via `recipe_tags`, schema 1419-1472). No new tagging UI beyond what already exists.

### 3.6 Migration notes
- **`start_date` backfill:** existing `weekly_plans` are undated. Sequence: (1) create the field **nullable**; (2) run the backfill script (implementation item 1b) that gives each existing plan a best-effort date (parse `name` where it looks like "Week of …", else assign descending Mondays by `created` order so history ordering is at least monotonic); (3) tighten to **required**. LRU is only as good as the backfilled dates for pre-existing plans; it self-corrects as new dated plans accumulate.
- **`people_multiplier`:** default 1; absence is treated as 1 in code, so no data touch needed for old plans.
- **Template seeding:** create one `week_templates` row + its `template_slots` from the household's current de-facto week (one Staples slot with `prefill_from_last_week=true`, plus dinner/salad/etc. slots keyed to existing tags). This is a one-time data-entry task, not a code migration.
- **Schema-change mechanism (correction).** New fields (`start_date`, `people_multiplier`) and new collections (`week_templates`, `template_slots`, optional `planned_meals.template_slot`) are created **manually through the PocketBase admin UI** (or a PB migration) on **both** the prod (`:8090`) and test (`:8091`) instances, with `pb_schema_updated.json` kept as the manual source of truth. `scripts/sync-to-test.js` **cannot** apply schema changes — it is purely a record/data copier: it clears each test collection and re-creates records from prod via `getFullList`/`create`/`delete` over a hardcoded `COLLECTIONS_TOP_DOWN` list (lines 16-31), with zero schema/field/collections-import logic. Separately, before that script can copy the **data** of the new collections to test, its `COLLECTIONS_TOP_DOWN` array must be extended with `week_templates` and `template_slots` in dependency order (templates before slots). Note the array already omits `meal_variant_overrides` and `recipe_queue` (both referenced in `api.ts:66-67` but absent from the copy list).

---

## 4. Implementation Plan

Ordered; each item independently verifiable.

1. **Schema: `weekly_plans` fields (nullable first).** Add `start_date` (date, **nullable** for now) and `people_multiplier` (number, default 1) to prod + test PocketBase **via the admin UI** (not `sync-to-test.js` — see §3.6 correction) and to `pb_schema_updated.json`. Extend `WeeklyPlan` in `recipe-planner/src/lib/types.ts` (currently just `{ name?: string }`, lines 117-119) with `start_date?: string` and `people_multiplier?: number`.
   - *Verify:* PocketBase admin shows the fields on both instances; a plan can be created with a date via the API.

1b. **Backfill `start_date`, then tighten to required.** Write a one-off Node script under `recipe-planner/scripts/` (e.g. `backfill-plan-dates.js`, patterned on `sync-to-test.js`'s PocketBase client setup) that runs against **both** prod (`:8090`) and test (`:8091`): for every existing `weekly_plans` record with no `start_date`, parse the `name` when it matches "Week of …", otherwise assign descending Mondays ordered by `created` (tie-break: `id` ascending) so ordering is monotonic. After the script confirms every plan has a non-null `start_date`, tighten the field to **required** in the admin UI and in `pb_schema_updated.json`.
   - *Verify (ties to AC#2):* every pre-existing `weekly_plans` record on both instances has a non-null `start_date` and still loads in the app without error.

2. **Schema: template collections.** Create `week_templates` and `template_slots` (§3.3 — note `template_slots.meal_slot` is **required**; `day` is optional), optional `planned_meals.template_slot` (§3.4), **via the admin UI** on both instances and in `pb_schema_updated.json`. Add `weekTemplates` / `templateSlots` entries to `collections` in `src/lib/api.ts` (the `collections` map, lines 51-68) and `WeekTemplate` / `TemplateSlot` types to `types.ts`. Extend `sync-to-test.js`'s `COLLECTIONS_TOP_DOWN` (lines 16-31) with `week_templates` then `template_slots` so their data can be copied to test.
   - *Verify:* CRUD a template + slots through the admin UI; `sync-to-test.js` copies template + slot records to test without error.

3. **Date in the New Plan dialog.** In `WeeklyPlans.tsx`, extend the plan dialog (state at 95-98, `handleSavePlan` 356-391, dialog markup 953-987) with a date picker defaulting to the upcoming Monday. Persist `start_date` on create/update. Show the date in the plan list (`ListItemText`, 584-587) and header (792-794).
   - *Verify:* New plans store and display a start date.

4. **Planning-history / LRU service.** New module `src/lib/planning/history.ts` (Proposed path). Given all `weekly_plans` (with `start_date`) and all `planned_meals`, compute per-recipe **last-planned date** = max start_date of plans containing that recipe. Expose `orderPoolByLRU(recipeIds, history)` → recipes never planned first (most stale), then ascending by last-planned date. **Deterministic tie-break:** for two recipes with the same last-planned date, and for the never-planned group among themselves, order by recipe `name` ascending (fall back to `id` ascending if names are equal) so ordering is stable across renders/sessions.
   - *Verify:* Unit test — a recipe absent from all plans sorts before one planned last week; a recipe planned 3 weeks ago sorts before one planned this week; **two recipes with equal last-planned dates (and two never-planned recipes) sort by name deterministically across repeated calls.**

5. **People-multiplier plumbing through aggregation.** Thread the plan's multiplier into the flow graph. `buildProductFlowGraph` and `buildPullLists` live in `src/lib/aggregation.ts` (not `builders/`). Add a `peopleMultiplier` argument to `buildProductFlowGraph` (called at `Outputs.tsx:320`) and multiply it into `mealCount` at the **three true derivation sites**, so `mealCount = (meal.quantity || 1) * peopleMultiplier`:
   - `aggregation.ts:180` — inside `buildProductFlowGraph`'s `plannedMeals.forEach`; this is the `mealCount` **passed** to `createProductToStepFlows`/`createStepToProductFlows`, so it feeds all flow/instance/container counts. **Do not** also edit `flow-builder.ts:38,80` — those consume the passed `mealCount` (`peopleMultiplier` is not even in scope there); touching them would double-count.
   - `product-builder.ts:136` — re-derives its own `mealCount` independently.
   - `step-builder.ts:173` — re-derives its own `mealCount` independently.

   Because product-builder and step-builder each re-derive `mealCount` (they ignore the value `aggregation.ts` computes), the multiplier must be applied at **each** of the three sites.

   **Pull lists — now included (D-03, supersedes the original "deliberate exclusion" below).** `buildPullLists` (`aggregation.ts:101-158`, called at `Outputs.tsx:376`) previously did **not** scale by meal quantity at all — it emitted `quantity: node?.quantity` verbatim (`aggregation.ts:138`) with no `mealCount`. D-03 fixes this: `buildPullLists` now takes a `peopleMultiplier` parameter (default 1) and emits `node.quantity × (meal.quantity || 1) × peopleMultiplier` (continuous units exact, each-dimension pulls ceil via the shared `scaleQuantity` helper, D-04). This was also a latent correctness fix — existing `quantity > 1` meals' pull-list output changes even at multiplier 1, covered by a dedicated regression test (see Phase 4 CONTEXT.md D-03).

   **Threading the plan record.** `people_multiplier` lives on the `weekly_plans` record. The full plans list is already loaded at `Outputs.tsx:159` (`getAll(collections.weeklyPlans)`); the meal-fetch block at `Outputs.tsx:195` only fetches `plannedMeals` (filtered by `weekly_plan`) and does not have the plan record in scope. Look up the selected plan by `selectedPlanId` from the already-loaded plans list (or thread the plan object) so `people_multiplier` is available at the `buildProductFlowGraph` and `buildPullLists` call sites.
   - *Verify:* Setting a plan's multiplier to 2 doubles every shopping-list quantity, prep amount, and container count versus multiplier 1, and matches editing each meal's `quantity` ×2. **Pull-list quantities now scale identically (D-03): quantity × multiplier, continuous exact / each-dimension ceil.**

6. **People-multiplier control.** Add a numeric multiplier field to the plan header/edit dialog in `WeeklyPlans.tsx`; persist to `weekly_plans.people_multiplier`. Surface the active multiplier on the Outputs page so the scaling is visible where it takes effect.
   - *Verify:* Changing the value re-derives outputs live.

7. **Template editor UI.** New page/dialog to CRUD `week_templates` + `template_slots` (label, count, meal_slot, pool tags via a tag multiselect, sort_order, `prefill_from_last_week`). Reuse the tag-selection pattern already present for recipes. Low-frequency screen; can be minimal.
   - *Verify:* A slot "2 × Dinner mains" bound to the `dinner-main` tag persists and reloads.

8. **Guided-fill wizard.** New component `src/components/WeekWizard.tsx` (Proposed) launched from "New Plan". Flow:
   - create the dated plan,
   - iterate `template_slots` by `sort_order`,
   - **Staples slot (`prefill_from_last_week`):** load the previous plan (max `start_date` < this plan's), pre-select its staple picks (via `template_slot` link if present, else tag membership), one-tap confirm,
   - **other slots:** resolve the pool (recipes whose `recipe_tags` intersect `pool_tags`), order via the LRU service (item 4), let the user pick `count`,
   - write each pick as a `planned_meal` (reusing `create(collections.plannedMeals, …)` as in `handleSaveMeal`, 417-423) with the slot's `meal_slot` (**required** — never null), the slot's `day` (§3.3; may be null for week-spanning slots, exactly like a manual meal with no day), `quantity` 1, and `template_slot` when modeled. **`day` must be threaded through** so wizard meals match manual ones (`WeeklyPlans.tsx:421` sets `day`) and so day-specific slots produce non-empty pull lists (`buildPullLists` filters on `meal.day`, `aggregation.ts:108`). If a slot's `meal_slot` were ever unset the create would fail (`planned_meals.meal_slot` is required) — hence the §3.3 requirement that `template_slots.meal_slot` be required.
   - *Verify:* Running the wizard on an empty week produces a populated plan; created meals carry the slot's `meal_slot` and `day`; a day-specific slot yields a non-empty pull list; the staples slot mirrors last week; each pool lists least-recently-planned recipes on top.

9. **Docs/schema sync.** Update `pb_schema_updated.json` and `decisions.md`'s Weekly-Plans schema block (lines 368-382) to reflect the new fields/collections.
   - *Verify:* `pb_schema_updated.json` matches the live instances.

---

## 5. Dependencies & Prerequisites

- **Phase 1 (Data hygiene)** — not strictly blocking, but the people-multiplier magnifies the unit-blind summing bug (`product-builder.ts:68-100`): scaling a wrong sum yields a wrong-er sum. Land Phase 1's aggregation fix first so multiplied quantities are trustworthy.
- **Tag discipline** — pools are only as good as recipe tagging. Recipes intended for a pool must carry the pool's tag before the wizard is useful. This is data hygiene, not code; call it out in the template-seeding step.
- **`start_date` before everything else in this phase** — history/LRU (item 4), the wizard (item 8), and "last week's staples" all depend on it. It is the first schema change.
- **No dependency on Phase 2/3/5.** Week memory is self-contained and delivers standalone value. It does *not* require the tailnet/shopping work (Phase 2) or USDA seeding (Phase 3).
- **Largely not a prerequisite for later phases** — Phase 5's scheduler/cook mode/linter consume the merged week graph regardless of how the week was assembled, so they do not depend on the wizard or the template/LRU machinery. **One narrow exception:** Phase 5's *conditional* day-before-prep horizon (its night-before checklist) consumes `weekly_plans.start_date` — added in this phase (§3.1) — to anchor "the night before" (Phase 5 §5, §7). So that one deferred Phase-5 feature depends on this phase's **date field** (not the wizard); Phase 6's `/suggest-recipes` recency logic likewise reads dated `weekly_plans` (Phase 6 §5). The wizard/template/rotation work is what nothing downstream requires.

---

## 6. Acceptance Criteria

1. A weekly plan can be created with a **start date**, and the date is shown in the plan list and header.
2. Existing (previously undated) plans have a backfilled `start_date` and still load without error.
3. A **week template** with ordered slots (label, count, target meal slot, tag-defined pool) can be created and edited; adding a matching tag to a recipe makes it appear in that slot's pool with no other change.
4. The **new-week wizard** starts blank and walks slots in order; completing it produces `planned_meals` matching the picks, in the correct meal-slot rows.
5. The wizard's **first slot is Staples**, pre-filled with the prior plan's staple picks, confirmable in one tap.
6. Within a pool slot, options are ordered **least-recently-planned first**: a never-planned recipe appears above one planned last week; verified against two hand-constructed plans with known dates. **Ties are deterministic:** two recipes with equal last-planned dates (and two never-planned recipes) appear in a stable, name-ordered sequence across repeated renders.
7. Setting a plan's **people-multiplier** to N scales the **meal-quantity-dependent outputs** — shopping-list quantities, batch-prep amounts, container counts, and (per D-03) **pull-list quantities** — by N relative to multiplier 1, and equals the result of multiplying every meal's `quantity` by N by hand for continuous (mass/volume) units. **Documented exception:** each-dimension products and container-instance counts ceil rather than raw-multiply (D-04) — never under-buy an indivisible item — so hand-multiply equivalence applies to continuous units byte-for-byte, and to discrete units up to the ceil.
8. A multiplier of 1 (or absent) reproduces today's exact output — no regression for existing plans.
9. Wizard-created plans behave like manually-created ones: created `planned_meals` carry the slot's `meal_slot` and `day`, and a day-specific slot produces a non-empty pull list (i.e. wizard meals are not silently null-`day`).

---

## 7. Risks & Open Questions

- **Pool match semantics (Proposed).** `pool_tags` is modeled as match-any. The record's examples are single-tag pools, so any/all is currently moot — but if a slot ever needs "salad AND vegan", this needs an explicit any/all toggle. Deferred until a multi-tag pool is actually wanted.
- **`planned_meals.template_slot` link (Proposed, optional).** Adds precision to staples pre-fill and per-slot history at the cost of one nullable relation. If skipped, staples pre-fill relies on tag membership, which misfires if the same recipe belongs to both the Staples pool and another pool. Recommend including it; flagged because the decision record doesn't mention it.
- **`start_date` backfill quality.** LRU ordering for *pre-existing* plans is only as accurate as the synthetic backfilled dates. It self-heals as new dated plans accumulate. Acceptable given "planned = cooked" is already an approximation.
- **Single template assumption.** Modeling `week_templates` as a collection (vs. one hardcoded template) is Proposed for future flexibility; the household needs only one today. If genuinely one-template-forever, the collection could collapse to a settings row — kept as a collection to avoid a later migration.
- **Pull lists now scale with the week (Resolved via D-03).** `buildPullLists` previously emitted `node.quantity` unscaled (`aggregation.ts:138`) — neither per-meal `quantity` nor the people-multiplier reached it. D-03 resolves the open question raised here: `buildPullLists` now honors `node.quantity × (meal.quantity || 1) × peopleMultiplier`, and the multiplier/AC#7 equivalence extends to pull lists (continuous exact, each-dimension ceil per D-04). This was implemented as both a feature (multiplier support) and a correctness fix (existing `quantity > 1` meals' pull-list output was previously wrong), landed together in Phase 4 Plan 03 with a dedicated regression test.
- **People-multiplier and non-linear quantities.** The multiplier scales all quantities linearly. Recipes with step quantities that don't scale linearly (a fixed pinch of salt, one pan regardless of batch) will be over/under-stated. Out of scope here — no recipe-yield engine by decision; note it as a known imprecision the cook corrects at authoring time.
- **Deferred deliberately:** confirm-cooked tracking (rejected — planned = cooked), per-person portioning and recipe-yield engine (rejected in exploration 2026-07-05), preference-weighted rotation (rejected — rotation stays pure LRU). The recipe-evolution "review revised recipe in the wizard" prompt (decision record Topic 5) is **Phase 6** work; this phase only builds the wizard shell it will later hook into.
