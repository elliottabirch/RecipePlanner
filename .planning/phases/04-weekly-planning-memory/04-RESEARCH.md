# Phase 4: Weekly Planning Memory - Research

**Researched:** 2026-07-07
**Domain:** PocketBase schema evolution + TypeScript aggregation-pipeline plumbing + MUI wizard UI (internal codebase research; no new external libraries)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `weekly_plans` gains `start_date` (Monday, backfilled then required) + `people_multiplier` (default 1; absent ⇒ 1). Mandated by decision record (`plans/workflow-redesign.md` Topic 3).
- Multiplier applied at the **three true derivation sites**: `aggregation.ts:180`, `product-builder.ts:136`, `step-builder.ts:173` as `mealCount = (meal.quantity || 1) * peopleMultiplier`. Do NOT also edit `flow-builder.ts:38,80` (they consume the passed `mealCount` — double-count hazard). *(This research verified and corrected the exact current line numbers for these sites — see Architecture Patterns, Pattern 1; the decision itself — which files, one derivation each — stands unchanged.)*
- Rotation pools are tag-based (reuse existing `tags`/`recipe_tags`, no new tagging UI). Wizard orders pools LRU-first; Staples = first slot, copy-forward from last week.
- LRU tie-break is deterministic: never-planned first, then ascending last-planned date, ties broken by recipe `name` asc (then `id` asc) — stable across renders (phase doc §4 item 4 / AC#6).
- Schema changes made **manually via PocketBase admin UI** on both prod (`:8090`) and test (`:8091`), mirrored into `pb_schema.json`. `sync-to-test.js` is a data copier only — extend its `COLLECTIONS_TOP_DOWN` with `week_templates` then `template_slots` (dependency order) so their records copy to test.
- **D-01: Seed once, defer the editor UI.** No in-app template editor this phase. Seed the household's single de-facto `week_templates` row + its `template_slots` (one Staples slot with `prefill_from_last_week=true`, plus dinner/salad/etc. slots keyed to existing tags) via the PB admin UI or a one-off `recipe-planner/scripts/` seed script run against both instances. This DROPS phase-doc §4 item 7 (template editor UI) from Phase 4 scope.
- **D-02: Accordion, one-at-a-time (single page).** Build `WeekWizard.tsx` as a one-page accordion, NOT a modal stepper. Active slot expanded, others collapsed; auto-advance on completion; collapsed headers show `N of {count} picked` badge. Picking = tap-to-toggle recipe `Chip`s (reuse `WeeklyPlans.tsx` idiom). A slot is never blocking — 0/partial is valid. Off-pool recipes via a docked "+ add other recipe" `Autocomplete` (reuse the Add-Meal `Autocomplete`). Staples slot = accordion #1, pre-expanded, last week's picks pre-toggled, one "Confirm staples" action. Every written `planned_meal` carries the slot's `meal_slot` (required, never null) and `day` (may be null).
- **D-03: Fix `buildPullLists` to honor quantity × multiplier** — SCOPE EXPANSION, reverses phase-doc AC#7 exclusion. Pull lists are INCLUDED in the people-multiplier. Change `buildPullLists` to emit `node.quantity × (meal.quantity || 1) × peopleMultiplier`. Two ripples to handle: (1) this is also a latent correctness fix — changes pull-list output for *existing* meals with `quantity > 1`, needs a regression check, not just "multiplier=1 ⇒ no change"; (2) it expands v1.1 scope past `PULL-F1` (currently "excluded from v1.1") and revises `AC#7` — update `REQUIREMENTS.md` (PULL-F1 → folded into WEEK-02) and phase-doc §4 item 5 / §6 AC#7 / §7 Open-Question during planning.
- **D-04: Ceil discrete, exact continuous.** Multiplier accepts fractional values (0.5/1.5). Continuous mass/volume (g, ml, cup, …) stay exact fractional. Discrete `each`-dimension counts (eggs, cans) and container instance counts get a deliberate `Math.ceil` — never under-buy an indivisible item; make the container ceil explicit, not reliant on the incidental float behavior of the `for (i < instances)` loop. Documented AC#7 exception for `each`-dimension products (`3 eggs × 0.5 = 1.5 → shows 2`, diverges from raw hand-multiply). Prefer a single shared rounding helper over duplicating `Math.ceil` logic across the three re-derivation sites.

### Claude's Discretion

- `week_templates`/`template_slots`/`planned_meals.template_slot` exact field shapes (phase doc §3.3–3.4 proposal is a strong default; `template_slot` link recommended for exact staples pre-fill but tag-membership fallback is acceptable).
- `start_date` backfill algorithm details (parse "Week of …" names, else descending Mondays by `created`; phase doc §3.6 / item 1b) — mechanics are Claude's to finalize; only the outcome (every existing plan non-null, then tighten to required) is fixed.
- Seed-script vs admin-UI for the one template row; dry-run/report mode on the backfill script.
- `people_multiplier` control placement/widget (plan header vs edit dialog) — phase doc item 6 default (both, + surface on Outputs) is fine.
- Pool `pool_tags` match-any vs match-all — match-any is the default; single-tag pools make it moot today.

### Deferred Ideas (OUT OF SCOPE)

- **Minimal in-app template editor** — follow-on only if desktop-admin editing (+ re-mirror to test) proves annoying in real use. Not Phase 4 (reuse `Tags.tsx` list+dialog CRUD + `RecipeEditor.tsx` tag-multiselect if/when built).
- **Multi-template / seasonal templates** — `week_templates` modeled as a collection precisely so this doesn't need a later migration, but no multi-template UI/logic built now.
- **Pool match-all semantics** — `pool_tags` is match-any; an explicit any/all toggle is deferred until a multi-tag pool is actually wanted (moot today, single-tag pools).
- **Reviewed todos NOT folded into Phase 4:** `deploy-pb-superuser-env` (prereq note only — backfill/seed scripts need existing gitignored `.env.local` superuser creds, same as Phase 1/3; NAS deploy-env change itself out of scope), `nas-pocketbase-tailnet` (Phase 2/6 concern, Phase 4 is LAN-only), `single-purchase-unit-shopping-lines` (deferred to its own phase), `swap-aware-prep-naming` (Phase 5), `usda-search-plain-rename` (Phase 3 follow-up).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| WEEK-01 | Weekly plans have a start date (existing plans backfilled) | Pattern 4 (schema/threading), Runtime State Inventory (backfill data-migration classification), Pitfall 1 (line-number verification), Validation Architecture Wave 0 gap (`backfill-plan-dates.test.js`), Open Question 1 (dry-run/report mode against real "Week of …" corpus) |
| WEEK-02 | A per-plan people-multiplier stacks on per-meal quantities through all aggregation outputs, **including pull lists per D-03** | Pattern 1 (single-injection-point multiplier plumbing, corrected line numbers), Pattern 2 (D-03 `buildPullLists` fix + regression requirement), Pattern 3 (D-04 shared `scaleQuantity` rounding helper, three call-site categories), Pattern 4 (`Outputs.tsx` threading, `useMemo` dependency fix), Pitfall 3 & 5 |
| WEEK-03 | User can define a week template of tag-based slots (`week_templates` + `template_slots`) | Architectural Responsibility Map (DB-owned, no app editor this phase per D-01), Pattern 6 (pool resolution), Pitfall 2 (`sync-to-test.js` insertion order), Pitfall 4 (`meal_slot` required-field mirroring) |
| WEEK-04 | Guided-fill wizard leads with a staples slot pre-filled from last week and orders each pool least-recently-planned-first | Pattern 5 (LRU service exact shape + tie-break, unit-testable), Pattern 6 (staples pre-fill + pool resolution), Code Examples (wizard write pattern, Chip reuse, LRU tie-break test), Validation Architecture (wizard UI is manual-only — pre-existing project-wide test-infra gap, not a Phase 4 gap) |

</phase_requirements>

## Summary

This phase is unusually well-specified: `.planning/phase-docs/phase-4-week-memory.md` plus the four CONTEXT.md decisions (D-01..D-04) already answer almost every "what" and "how." This research's job was narrow and code-verification-focused: **re-derive every cited file/line reference against the live codebase**, and design the two genuinely-unspecified pieces (the LRU service's exact algorithm shape, and the shared discrete/continuous rounding helper for D-04).

The verification turned up real drift. `recipe-planner/src/pages/WeeklyPlans.tsx` line citations in CONTEXT.md/the phase doc are **100% accurate** (handleSavePlan 356-391, handleSaveMeal 412-436, plan-list ListItemText 584-587, Chip idiom 743-778, header 792-794, Add-Meal Autocomplete 998-1018 — all confirmed byte-for-byte). But `aggregation.ts`, the two builder files, `Outputs.tsx`, and `types.ts` have all drifted (Phase 2/3 work added code above the cited lines). Corrected line numbers are given below in each relevant section — **use these, not the CONTEXT.md numbers**, when writing the plan.

The multiplier plumbing turns out to be a true single-injection-point design per file, confirmed against actual code: `aggregation.ts`, `product-builder.ts`, and `step-builder.ts` each independently compute their own local `mealCount` (not three call-sites needing three separate multiply-ins spread across many lines — one `const mealCount = ...` line per file, and everything downstream in that file already flows from it). `buildPullLists` currently has **no** `mealCount` concept at all (D-03's fix introduces one). Container-instance counts (`instances = (node.quantity||1) * mealCount`) appear at **three** sites across two files (`product-builder.ts` once, `flow-builder.ts` twice) that must all apply the identical ceil rule or the flow graph's instance keys will disagree with the product map's instance keys.

**Primary recommendation:** Thread a single `peopleMultiplier: number` parameter (default 1) into `buildProductFlowGraph` and `buildPullLists`; have each builder file multiply it into its one local `mealCount`/quantity-derivation line; add one shared `scaleQuantity(qty, factor, isDiscrete)` helper in `units.ts` for the D-04 ceil/exact split, and call it at exactly the sites enumerated in "Architecture Patterns" below — no more, no fewer.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `start_date` storage + backfill | Database (PocketBase schema) | Script (Node, `scripts/`) | Schema field is the source of truth; backfill is a one-off data migration, not app code |
| `people_multiplier` storage | Database (PocketBase schema) | — | Simple scalar field on `weekly_plans` |
| Multiplier scaling math | App logic (`src/lib/aggregation*`) | — | Pure-function aggregation layer; already owns all quantity derivation (Phase 1/2 precedent) |
| Week template + slots definition | Database (new collections) | Script (seed) | D-01: no in-app editor this phase; PB admin UI / seed script write directly to the DB |
| LRU pool ordering | App logic (new `src/lib/planning/history.ts`) | — | Pure function over already-fetched `weekly_plans` + `planned_meals`; no new DB query shape needed beyond an `expand` |
| Guided-fill wizard UI | Browser/Client (React component) | App logic (writes `planned_meals` via existing `create()`) | New `WeekWizard.tsx`; reuses existing MUI Chip/Autocomplete idioms already in `WeeklyPlans.tsx` |
| `pb_schema.json` mirroring | Docs/config (manual) | — | Established convention (Phase 1 D-06.2): admin-UI schema edits are hand-mirrored into this file, not generated |
| Test→prod data copy | Script (`sync-to-test.js`) | — | Existing data-only copier; extended with two new collection names in `COLLECTIONS_TOP_DOWN`, ordered correctly (see Pitfalls) |

## Package Legitimacy Audit

**No external packages required this phase.** All work is: (1) PocketBase schema fields/collections created via admin UI — no client library needed beyond the already-installed `pocketbase` npm package; (2) new TypeScript modules and a new React component using only already-installed dependencies (`@mui/material`, `@mui/icons-material`, `pocketbase`); (3) Node scripts using the already-installed `pocketbase` client, following the exact pattern of `scripts/seed-usda.js` (Phase 3, already package-legitimacy-cleared).

**Specifically verified absent and NOT to be added:** `@mui/x-date-pickers` is not in `package.json` (checked `recipe-planner/package.json` dependencies/devDependencies directly). Do not add it for the `start_date` picker — use a plain MUI `TextField` with `type="date"` (native HTML date input), which is zero-dependency and matches this project's minimal-footprint convention. If the planner considers a calendar-widget date picker, that would be a new dependency requiring its own legitimacy check — recommend against it; native `<input type="date">` via `TextField` is sufficient for a Monday-picker.

**Packages removed due to SLOP verdict:** none. **Packages flagged SUS:** none.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  WeeklyPlans.tsx (plan list, header, manual Add-Meal, template-seed  │
│  data lives only in PocketBase — no in-app editor this phase)         │
│                                                                        │
│   New Plan dialog ──create()──► weekly_plans                          │
│      │  start_date (Monday picker)                                   │
│      │  people_multiplier (numeric field, default 1)                 │
│      ▼                                                                │
│   [New] "Start Wizard" button ──► WeekWizard.tsx                      │
└───────────────────┬───────────────────────────────────────────────────┘
                     │ reads
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PocketBase (prod :8090 / test :8091)                                │
│                                                                        │
│  weekly_plans (+start_date, +people_multiplier)                      │
│  week_templates ──1:N──► template_slots (+meal_slot REQUIRED,        │
│                                           +day OPTIONAL,               │
│                                           +pool_tags relation→tags,   │
│                                           +sort_order, +prefill_bool) │
│  planned_meals (+template_slot relation, OPTIONAL)                   │
│  tags / recipe_tags (UNCHANGED — pools reuse existing tagging)       │
└───────────────────┬───────────────────────────────────────────────────┘
                     │ getFullList (expand: weekly_plan | recipe)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  src/lib/planning/history.ts  (NEW, pure functions)                  │
│                                                                        │
│  computeLastPlannedDates(plans, plannedMeals)                        │
│      → Map<recipeId, isoDateString | undefined>                      │
│  orderPoolByLRU(recipes, lastPlannedMap)                             │
│      → recipes sorted: never-planned first, then ascending date,     │
│        tie-break name asc, then id asc                               │
└───────────────────┬───────────────────────────────────────────────────┘
                     │ consumed by
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WeekWizard.tsx (NEW component, one-page MUI Accordion)              │
│                                                                        │
│  iterate template_slots by sort_order                                │
│    slot 1 (Staples, prefill_from_last_week) → prior plan's picks,    │
│                                                 pre-toggled Chips     │
│    slot N → pool = recipes ∩ pool_tags, ordered via history.ts,      │
│              tap-to-toggle Chips + docked off-pool Autocomplete      │
│  on confirm/auto-advance ──create()──► planned_meals                 │
│    { weekly_plan, recipe, meal_slot: slot.meal_slot (never null),    │
│      day: slot.day ?? null, quantity: 1, template_slot: slot.id }    │
└───────────────────┬───────────────────────────────────────────────────┘
                     │ feeds (same path as manually-created meals)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Outputs.tsx                                                         │
│                                                                        │
│  plans (all, loaded once) ──find(selectedPlanId)──► selectedPlan      │
│  selectedPlan.people_multiplier ──► buildProductFlowGraph(            │
│                                        plannedMeals, recipeData,      │
│                                        peopleMultiplier)   [NEW arg]  │
│                                     ──► buildPullLists(                │
│                                        plannedMeals, recipeData,      │
│                                        peopleMultiplier)   [NEW arg]  │
│                                                                        │
│  buildProductFlowGraph → products/steps Maps                          │
│    → buildShoppingListFromFlow, buildBatchPrepListFromFlow,          │
│      buildStoredItemsListFromFlow, buildMealContainersList           │
│  buildPullLists → PullListMeal[] (D-03: NOW scaled too)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
recipe-planner/
├── src/
│   ├── components/
│   │   └── WeekWizard.tsx          # NEW — one-page Accordion wizard (D-02)
│   ├── lib/
│   │   ├── planning/
│   │   │   └── history.ts          # NEW — LRU service (pure functions, unit-tested)
│   │   ├── aggregation.ts          # buildProductFlowGraph/buildPullLists gain peopleMultiplier param
│   │   ├── aggregation/
│   │   │   ├── builders/
│   │   │   │   ├── product-builder.ts   # processRecipeProducts gains peopleMultiplier param
│   │   │   │   └── step-builder.ts      # processRecipeSteps gains peopleMultiplier param
│   │   │   └── types.ts
│   │   ├── units.ts                # + scaleQuantity() shared rounding helper (D-04)
│   │   ├── api.ts                  # + weekTemplates, templateSlots entries in `collections`
│   │   └── types.ts                # WeeklyPlan +start_date +people_multiplier;
│   │                                 # + WeekTemplate, TemplateSlot; PlannedMeal +template_slot
│   └── pages/
│       ├── WeeklyPlans.tsx         # plan dialog +date/+multiplier; plan list/header show date
│       └── Outputs.tsx             # look up selectedPlan; pass peopleMultiplier through
└── scripts/
    ├── backfill-plan-dates.js      # NEW — one-off, prod + test
    └── seed-week-template.js       # NEW — one-off, prod + test (D-01)
```

### Pattern 1: Single local `mealCount` derivation site per builder file (already established, confirmed live)
**What:** `aggregation.ts`, `product-builder.ts`, and `step-builder.ts` each compute exactly one local `const mealCount = ...` line, and everything else in that file derives from it. This is why the phase doc's "three true derivation sites" framing holds even though the exact line numbers cited in CONTEXT.md have drifted.
**When to use:** Injecting `peopleMultiplier` — multiply it into each file's *one* local `mealCount` line; do not hunt for other places `.quantity` appears (those are all downstream consumers, already correct).
**Verified current locations (2026-07-07, supersede CONTEXT.md's cited line numbers):**
```typescript
// src/lib/aggregation.ts — buildProductFlowGraph(), line 183
const mealCount = meal.quantity || 1;
// → change to: const mealCount = (meal.quantity || 1) * peopleMultiplier;
// used at lines 193-198 as the mealCount arg to createProductToStepFlows/createStepToProductFlows

// src/lib/aggregation/builders/product-builder.ts — processRecipeProducts(), line 183
const mealCount = plannedMeal.quantity || 1;
// → change to: const mealCount = (plannedMeal.quantity || 1) * peopleMultiplier;
// (NOT line 62's `instances = (node.quantity||1) * mealCount` — that's a consumer, not
//  the derivation site, and does not need its own multiply-in)

// src/lib/aggregation/builders/step-builder.ts — processRecipeSteps(), line 199
const mealCount = plannedMeal.quantity || 1;
// → change to: const mealCount = (plannedMeal.quantity || 1) * peopleMultiplier;
```
**Do NOT touch** `flow-builder.ts:38,80` (`const instances = (node.quantity || 1) * mealCount;`) — these *consume* the `mealCount` parameter already passed in by `aggregation.ts`'s `createProductToStepFlows`/`createStepToProductFlows` calls (line 193-204); `peopleMultiplier` is not even in scope there. Confirmed live: `flow-builder.ts` has no independent `plannedMeal.quantity` read anywhere.

**Threading requirement:** `processRecipeProducts(recipeData, plannedMeal, products)` and `processRecipeSteps(recipeData, plannedMeal, steps)` are currently called from `buildProductFlowGraph` (`aggregation.ts` lines 186, 189) **without** a `mealCount`/multiplier argument at all — each function independently re-derives `plannedMeal.quantity || 1` internally. Both function signatures need a new 4th parameter `peopleMultiplier: number` (default `1` for the many existing unit tests that don't pass it), and `buildProductFlowGraph` must forward its own `peopleMultiplier` parameter into both calls:
```typescript
// aggregation.ts, current (line 186, 189):
processRecipeProducts(data, meal, products);
processRecipeSteps(data, meal, steps);
// → becomes:
processRecipeProducts(data, meal, products, peopleMultiplier);
processRecipeSteps(data, meal, steps, peopleMultiplier);
```

### Pattern 2: D-03 pull-list fix — new `mealCount` concept where none existed
**What:** `buildPullLists` (`aggregation.ts` lines 102-161, verified) currently emits `quantity: node.quantity` **completely unscaled** (line 139: `quantity: node.quantity,` inside the `jitSteps.forEach` → `inputEdges.forEach` loop) — no `meal.quantity`, no multiplier, nothing. This confirms the phase doc's characterization exactly.
**Fix (D-03):** add a `peopleMultiplier` parameter to `buildPullLists(plannedMeals, recipeDataMap, peopleMultiplier = 1)` and change the item push to:
```typescript
items.push({
  productName: product.name,
  quantity: (node.quantity ?? 0) * (meal.quantity || 1) * peopleMultiplier,
  unit: node.unit,
  containerTypeName: product.expand?.container_type?.name,
  fromStorage,
  lineId: `${meal.id}-${step.id}-${node.id}`,
});
```
**Regression-check requirement (flagged by D-03 itself):** this changes output for **existing** meals with `quantity > 1` even at `peopleMultiplier = 1` — today those meals' pull-list items are silently unscaled by `meal.quantity`. The plan must include an explicit regression check comparing pre-fix and post-fix pull-list output for any live plan containing a `quantity > 1` meal with JIT steps, not just a "multiplier=1 → no change" smoke test (that smoke test will actually *fail* to be a no-op for quantity>1 meals — that's the point of the fix, but it must be called out, not silently absorbed into an "identical output" AC).
**Call site to update:** `Outputs.tsx` line 472-475 (verified, see Pattern 4 below) — `buildPullLists(plannedMeals, recipeData)` → `buildPullLists(plannedMeals, recipeData, selectedPlan?.people_multiplier ?? 1)`.
**Test file to extend:** `src/lib/aggregation/aggregation-lineid.test.ts` — currently has 2 `buildPullLists` call sites (lines 211, 248-249), both using `makePlannedMeal`'s default `quantity: 1` and no multiplier arg, so they'll pass unchanged with a default-`1` third parameter. Add new test cases here (or a sibling test file) asserting: (a) `quantity: 2` meal × no multiplier scales pull-list item quantity ×2 (the regression fix itself); (b) `quantity: 1` meal × `peopleMultiplier: 1.5` scales ×1.5; (c) `quantity: 2` meal × `peopleMultiplier: 1.5` scales ×3 (compounding, matching AC#7's "equals hand-multiplying" equivalence for continuous units).

### Pattern 3: D-04 discrete/continuous rounding — one shared helper, three call categories
**What:** `getDimension(unit)` in `units.ts` (verified, line 106-108) already classifies `"each"` → `"count"` dimension vs `"volume"`/`"mass"` for everything else. This is the exact classifier D-04 needs; no new classification logic required.
**Recommended shared helper (new export in `units.ts`, alongside `promoteUnit`/`chooseDisplayUnit`):**
```typescript
/**
 * D-04: scale a quantity by a (possibly fractional) factor. Continuous
 * mass/volume stay exact (fractional grams/cups are real, weighable
 * numbers). Discrete `each`-dimension counts get a deliberate ceil — never
 * under-buy an indivisible item. `forceDiscrete` covers container-instance
 * counts, which are always integer-conceptual regardless of the product's
 * own unit dimension.
 */
export function scaleQuantity(
  qty: number,
  factor: number,
  unitOrForceDiscrete: Unit | "discrete"
): number {
  const isDiscrete =
    unitOrForceDiscrete === "discrete" ||
    getDimension(unitOrForceDiscrete as Unit) === "count";
  const scaled = qty * factor;
  return isDiscrete ? Math.ceil(scaled) : scaled;
}
```
**Three call-site categories, verified against live code:**
1. **Continuous/discrete product totals** — `calculateProductQuantity(quantity, mealCount)` in `product-utils.ts` (verified, `return quantity * mealCount;`), called from `buildAggregatedProduct` (`product-builder.ts` line 38) where `nodeUnit` is already in scope. Replace the call with `scaleQuantity(quantity, mealCount, nodeUnit as Unit)`.
2. **Container-instance counts** — `instances = (node.quantity || 1) * mealCount` appears at **three** sites: `product-builder.ts` line 62 (inside `buildAggregatedProduct`), and `flow-builder.ts` lines 38 and 80 (inside `createProductToStepFlows`/`createStepToProductFlows`). **All three must use the identical ceil rule** (`scaleQuantity(node.quantity || 1, mealCount, "discrete")`), because `product-builder.ts` decides *how many* instance product-keys to create and `flow-builder.ts` decides *how many* instance keys to draw flow edges for — if they diverge (e.g. one ceils, one truncates via float loop artifact), the flow graph gets edges pointing at product instance keys that were never created, or vice versa. This is the exact float-drift risk named in CONTEXT.md ("2.0000000002" via `for (i < instances)`).
3. **Step input/output quantities** — `extractStepInputs`/`extractStepOutputs` in `step-builder.ts` (lines 52, 86: `quantity: (node.quantity || 0) * mealCount`) — same treatment, `scaleQuantity(node.quantity || 0, mealCount, node.unit as Unit)`.

**Documented AC#7 exception (per D-04):** for `each`-dimension products, `ceil` can diverge from a raw hand-multiply (`3 eggs × 0.5 = 1.5 → shows 2`). The plan's verification step for AC#7 must assert byte-for-byte equivalence only for continuous (mass/volume) products, and assert the *ceil* behavior (not raw-multiply equivalence) for `each`-dimension products and container instances.

### Pattern 4: `people_multiplier` threading at the Outputs.tsx call sites (verified current line numbers)
**What:** CONTEXT.md cites `Outputs.tsx:159` (plan loaded), `:320` (buildProductFlowGraph call), `:376` (buildPullLists call). **All three have drifted.** Verified current locations:
```typescript
// src/pages/Outputs.tsx line 101 — plans state (NOT loaded filtered by id; full list)
const [plans, setPlans] = useState<WeeklyPlan[]>([]);
// line 212-213 — loaded once on mount via getAll(collections.weeklyPlans)
const plansData = await getAll<WeeklyPlan>(collections.weeklyPlans);
setPlans(plansData);

// line 399-402 — buildProductFlowGraph call site (was cited as :320)
const productFlowGraph = useMemo(
  () => buildProductFlowGraph(plannedMeals, recipeData),
  [plannedMeals, recipeData]
);

// line 472-475 — buildPullLists call site (was cited as :376)
const pullLists = useMemo(
  () => buildPullLists(plannedMeals, recipeData),
  [plannedMeals, recipeData]
);
```
**Fix:** derive `const selectedPlan = useMemo(() => plans.find(p => p.id === selectedPlanId), [plans, selectedPlanId]);` (there is currently no such derived value in `Outputs.tsx` — `plans` and `selectedPlanId` are both already in scope but never joined). Then:
```typescript
const peopleMultiplier = selectedPlan?.people_multiplier ?? 1;
const productFlowGraph = useMemo(
  () => buildProductFlowGraph(plannedMeals, recipeData, peopleMultiplier),
  [plannedMeals, recipeData, peopleMultiplier]
);
const pullLists = useMemo(
  () => buildPullLists(plannedMeals, recipeData, peopleMultiplier),
  [plannedMeals, recipeData, peopleMultiplier]
);
```
Both `useMemo` dependency arrays must include `peopleMultiplier` or switching plans won't re-derive outputs.

### Pattern 5: LRU service shape (`src/lib/planning/history.ts`, new)
**What:** Pure functions, no PocketBase import, fully unit-testable. `PlannedMealExpanded` (`types.ts` line 198-203, verified) **already has** `expand?.weekly_plan?: WeeklyPlan` typed — so a single `getAll<PlannedMealExpanded>(collections.plannedMeals, { expand: "weekly_plan" })` (no filter — all plans, all meals) gives every input this service needs in one query, no separate plans fetch required if the caller only needs the expand.
```typescript
// src/lib/planning/history.ts
import type { WeeklyPlan, PlannedMeal } from "../types";

/** Per-recipe last-planned date (ISO `start_date` string), or undefined if
 * the recipe has never appeared in any dated plan. Undated plans
 * (pre-backfill, or if start_date is somehow null) are excluded from the
 * computation — they contribute no signal, they don't count as "recent". */
export function computeLastPlannedDates(
  plans: WeeklyPlan[],
  plannedMeals: PlannedMeal[]
): Map<string, string> {
  const planDateById = new Map(
    plans.filter((p) => p.start_date).map((p) => [p.id, p.start_date!])
  );
  const lastPlanned = new Map<string, string>();
  for (const meal of plannedMeals) {
    const date = planDateById.get(meal.weekly_plan);
    if (!date) continue;
    const existing = lastPlanned.get(meal.recipe);
    if (!existing || date > existing) lastPlanned.set(meal.recipe, date);
  }
  return lastPlanned;
}

/** AC#6: never-planned first, then ascending last-planned (oldest/most
 * stale first), ties broken by name asc then id asc — deterministic and
 * stable across renders (no reliance on Map/array iteration order). */
export function orderPoolByLRU<T extends { id: string; name: string }>(
  recipes: T[],
  lastPlanned: Map<string, string>
): T[] {
  return [...recipes].sort((a, b) => {
    const da = lastPlanned.get(a.id);
    const db = lastPlanned.get(b.id);
    if (!da && !db) return tieBreak(a, b);
    if (!da) return -1;
    if (!db) return 1;
    if (da !== db) return da < db ? -1 : 1;
    return tieBreak(a, b);
  });
}

function tieBreak(a: { id: string; name: string }, b: { id: string; name: string }): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
```
**ISO string comparison note:** PocketBase `date`-type fields serialize as ISO 8601 strings (e.g. `"2026-07-06 00:00:00.000Z"`); lexicographic string comparison (`da < db`) is chronologically correct for this format without parsing to `Date` objects, keeping the function free of timezone-conversion bugs. Verify the exact serialized format against a live record during implementation (PocketBase has historically used a space, not `T`, as the date/time separator — `toISOString()`-style parsing would need a light normalization if the plan ever needs to *display* the date, but raw string comparison for ordering is unaffected either way).

### Pattern 6: Wizard pool resolution (staples pre-fill + tag-pool intersection)
**What:** `recipeTags: Map<string, string[]>` (recipe id → tag ids) is already built in both `WeeklyPlans.tsx` (lines 79-80, populated ~236) and `Outputs.tsx` (lines 323-333) via `getAll<RecipeTag>(collections.recipeTags, { expand: "tag" })`. The wizard should build the same map once and reuse it for pool resolution:
```typescript
function poolForSlot(
  slot: TemplateSlot,
  recipes: Recipe[],
  recipeTags: Map<string, string[]>
): Recipe[] {
  const poolTagIds = new Set(slot.pool_tags); // relation field, maxSelect > 1 → string[]
  return recipes.filter((r) =>
    (recipeTags.get(r.id) || []).some((tagId) => poolTagIds.has(tagId))
  );
}
```
**Staples pre-fill:** load the previous plan — `plans.filter(p => p.start_date && p.start_date < thisPlan.start_date).sort by start_date desc)[0]` — then its `planned_meals` filtered by `template_slot === staplesSlot.id` (if the field is modeled) or by tag-membership fallback (recipe tagged with the staples pool's tag AND appeared in that prior plan) if `template_slot` is omitted. Recommend including `planned_meals.template_slot` (Claude's Discretion says both are acceptable, phase doc recommends including it) — it turns this into an exact relation filter instead of a tag-membership heuristic, and it's a single nullable relation field, cheap to add now vs. retrofit later.

### Anti-Patterns to Avoid
- **Re-adding a multiply-in at `flow-builder.ts`:** would double-count the multiplier (it's already downstream of the already-multiplied `mealCount` parameter passed from `aggregation.ts`).
- **Relying on `for (i < instances)` float-loop truncation for the D-04 ceil:** explicitly named as a real bug in this codebase already (`2.0000000002` drift) — always ceil into an integer variable before the loop.
- **Filtering `planned_meals` by weekly_plan before joining for LRU history:** the LRU history computation needs meals from **every** plan (to find "last planned"), not just the currently-selected plan — do not reuse `Outputs.tsx`'s plan-scoped `getAll(..., { filter: 'weekly_plan="..."' })` pattern for this query.
- **Treating `week_templates` as a settings singleton:** modeled as a collection per the phase doc's explicit forward-compatibility reasoning (seasonal variants later) — don't collapse it to a single hardcoded row in app code even though only one row exists today.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Monday-of-week date picker | Custom calendar widget | Native `<input type="date">` via MUI `TextField type="date"` | Zero new dependency (`@mui/x-date-pickers` is NOT installed — confirmed); "upcoming Monday" default is a one-line date computation, not a picker feature |
| Fractional-quantity rounding | Ad-hoc `Math.ceil`/`Math.round` scattered across 3 files | Single `scaleQuantity()` helper in `units.ts` (Pattern 3) | D-04 explicitly asks for one shared helper; scattered rounding is exactly the kind of drift that already happened once (the `for (i<instances)` float-loop bug) |
| Tag-pool intersection logic | New query/filter abstraction | Plain `Array.prototype.some()` over the already-built `recipeTags: Map<string,string[]>` (Pattern 6) | The map is already fetched and built identically in two existing pages; no new data-fetch shape needed |
| Recency/"how long ago" sorting | Hand-rolled Date math per call site | `computeLastPlannedDates` + `orderPoolByLRU` (Pattern 5), string-compared ISO dates | Centralizes the tie-break rule (AC#6) in one unit-tested place instead of re-implementing at each pool render |

**Key insight:** every piece of "new" logic in this phase is a thin pure-function layer over data shapes (`recipeTags`, `plannedMeals`, `weekly_plans`) that already exist and are already fetched elsewhere in the app. The risk in this phase is not algorithmic complexity — it's **plumbing drift** (an old cited line number, a forgotten `useMemo` dependency, a multiplier that reaches two of three sites but not the third). Treat every "add `peopleMultiplier` parameter" task as complete only when grep confirms zero remaining un-multiplied `.quantity` reads in the three files.

## Runtime State Inventory

> Not a rename/refactor/migration phase in the "change an identifier everywhere" sense, but `start_date` backfill is a **data migration** on an existing collection with live records on two PocketBase instances. Applying the inventory discipline:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `weekly_plans` records on **both** prod (`:8090`) and test (`:8091`) currently have `name` as their only user field (verified: `pb_schema.json` lines 1059-1095, matches phase doc's "text1579384333/name" claim exactly). Every existing row needs a synthetic `start_date` before the field can be tightened to required. | Data migration via `scripts/backfill-plan-dates.js`, run against **both** instances (script takes `PB_URL` env override per the `seed-usda.js`/`find-duplicates.js` convention — default prod, override to `:8091` for test) |
| Live service config | None — `weekly_plans`/`planned_meals` are ordinary PocketBase collections, no external service (n8n, Datadog, etc.) references them by name or id. | None |
| OS-registered state | None — no OS task scheduler, pm2, or launchd entries reference plan records. | None |
| Secrets/env vars | `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` (gitignored `recipe-planner/.env.local`) are required for the backfill script and the template-seed script's writes, same as every prior Phase 1/3 mutating script (`seed-usda.js`, `merge-products.js` confirmed to use this exact pattern). No new secret needed — reuse the existing ones. | None (reuse) |
| Build artifacts | None — no compiled/installed artifact embeds plan schema shape. | None |

**Nothing found in 3 of 5 categories** — verified by grep/inspection, not left blank.

## Common Pitfalls

### Pitfall 1: Stale cited line numbers from CONTEXT.md/phase-doc
**What goes wrong:** Following `Outputs.tsx:159/320/376` or `aggregation.ts:180`/`product-builder.ts:136`/`step-builder.ts:173`/`types.ts:117-119` literally lands on the wrong code (verified drift documented in Patterns 1, 2, 4 above).
**Why it happens:** Those citations were accurate when the phase doc was written (2026-07-05/06) but Phase 2/3 plans added code above the cited sections since.
**How to avoid:** Use the corrected line numbers in this document. `WeeklyPlans.tsx` citations, by contrast, were independently re-verified and are exactly correct — no drift there.
**Warning signs:** A grep for the cited line's expected content (e.g. `grep -n "mealCount = meal.quantity" src/lib/aggregation.ts`) returning a different line number than cited.

### Pitfall 2: `sync-to-test.js` array insertion position
**What goes wrong:** Appending `week_templates`/`template_slots` to the **end** of `COLLECTIONS_TOP_DOWN` (after `recipe_queue`, the current last entry at line 43) works fine for the templates themselves (they have no relation back to `weekly_plans`/`planned_meals`), **but** if `planned_meals.template_slot` is modeled (recommended, Pattern 6), then `planned_meals` — copied at line 40, well before the array's end — would be created with a `template_slot` relation pointing at a `template_slots` record that doesn't exist in test yet, and PocketBase's relation validation will reject the create.
**Why it happens:** `COLLECTIONS_TOP_DOWN` order in `copyAllFromProd` (`sync-to-test.js` lines 88-135, verified) is a strict parent-before-child dependency order; there's no post-pass relation-patch for anything except the two entries hardcoded in `DEFERRED_RELATION_FIELDS` (`products.source_recipe`, `products.store_bought_product`).
**How to avoid:** Insert `week_templates` then `template_slots` **before** `weekly_plans`/`planned_meals` in the array (verified current array, `sync-to-test.js` lines 27-44): insert them right after `step_to_product_edges` (line 38) and before `weekly_plans` (line 39). This satisfies both orderings needed: template-before-slot (D-01's stated requirement) and slot-before-planned_meals (the `template_slot` relation's actual dependency). Alternative: add `planned_meals: ["template_slot"]` to `DEFERRED_RELATION_FIELDS` and append at the end instead — either works; inserting earlier is simpler (no deferred-patch machinery needed) and is the recommended approach.
**Warning signs:** A `sync-to-test` run logging `create planned_meals/<id> failed` with a relation-validation error mentioning `template_slot`.

### Pitfall 3: Forgetting a `useMemo` dependency after adding `peopleMultiplier`
**What goes wrong:** `productFlowGraph`/`pullLists` `useMemo` calls in `Outputs.tsx` (Pattern 4) silently keep showing stale (unscaled) output when the user changes the multiplier or switches plans, because React doesn't know to re-run the memo.
**Why it happens:** Easy to add the new function argument without touching the dependency array two lines below.
**How to avoid:** Every `useMemo` in the derive chain downstream of `plannedMeals`/`recipeData` in `Outputs.tsx` needs `peopleMultiplier` (or `selectedPlan`) added to its dependency array if it now flows through `productFlowGraph` or `pullLists` (all of `shoppingList`, `overlaidShoppingList`, `groupedShoppingList`, `batchPrepSteps`, `storedItems`, `mealContainers` already transitively depend on `productFlowGraph` via their own dependency arrays, so they inherit correctness automatically — only the two direct call sites need the explicit new dependency).
**Warning signs:** UAT: change multiplier, outputs don't visibly update without a full page reload.

### Pitfall 4: `template_slots.meal_slot` accidentally left optional
**What goes wrong:** If `template_slots.meal_slot` is created as optional/nullable in the PocketBase admin UI (easy default when clicking through the schema editor), a slot with no `meal_slot` set will make the wizard's `create(collections.plannedMeals, {...})` call fail at write time, because `planned_meals.meal_slot` is `required: true` (verified: `pb_schema.json` line 1899, `"required": true`).
**Why it happens:** Nothing in the PocketBase UI enforces "if collection A's required field is populated from collection B's field, B's field must also be required" — that constraint lives only in the phase doc's reasoning, not in the schema tooling.
**How to avoid:** When creating `template_slots.meal_slot` in the admin UI, explicitly mark it **required**, matching the phase doc's §3.3 explicit call-out. Add this as an acceptance check in the plan, not just a design note.
**Warning signs:** A wizard write throwing a PocketBase validation error on `meal_slot` during manual testing.

### Pitfall 5: `buildPullLists` regression silently absorbed into "no visible change"
**What goes wrong:** Because D-03 is *also* a correctness fix (not just a new feature), a naive "multiplier=1 reproduces today's output" AC will **pass** even though pull-list output for `quantity > 1` meals has changed — because that AC only tests multiplier=1, and the meal-quantity scaling bug it fixes is independent of the multiplier.
**Why it happens:** The two changes (multiplier support, meal-quantity scaling fix) are bundled in one code change to `buildPullLists`, but AC#7/AC#8 as currently phrased in the phase doc only test the multiplier dimension.
**How to avoid:** Plan must include a dedicated regression test/AC: "a plan with an existing `quantity: 2` meal that has JIT assembly steps shows pull-list quantities doubled versus pre-fix behavior" — separate from the multiplier ACs. See Pattern 2's regression-check requirement.

## Code Examples

### Wizard write pattern (reuses `handleSaveMeal`'s exact `create()` call shape)
```typescript
// Source: recipe-planner/src/pages/WeeklyPlans.tsx lines 412-423 (verified exact)
await create(collections.plannedMeals, {
  weekly_plan: selectedPlan.id,
  recipe: selectedRecipe.id,
  meal_slot: selectedSlot,
  day: selectedDay || null,
  quantity: mealQuantity || 1,
});
// WeekWizard.tsx per-slot pick reuses this identically, substituting the
// slot's meal_slot/day and adding template_slot:
await create(collections.plannedMeals, {
  weekly_plan: plan.id,
  recipe: pickedRecipe.id,
  meal_slot: slot.meal_slot,       // required — always set, from the slot
  day: slot.day ?? null,           // optional — week-spanning slots stay null
  quantity: 1,
  template_slot: slot.id,          // if the optional field is modeled
});
```

### Chip idiom to reuse for wizard tap-to-toggle picks
```typescript
// Source: recipe-planner/src/pages/WeeklyPlans.tsx lines 755-772 (verified exact,
// the Micah-meal tag-group Chip rendering — same filled/outlined toggle idiom
// D-02 specifies for the wizard, adapted from onDelete to onClick toggle)
<Chip
  key={meal.id}
  label={recipe.name}
  onClick={() => togglePick(slot.id, recipe.id)}
  variant={isPicked ? "filled" : "outlined"}
  size="small"
  sx={{
    backgroundColor: isPicked ? tagColor : undefined,
    color: isPicked ? "white" : undefined,
  }}
/>
```

### LRU tie-break unit test shape (AC#6)
```typescript
// New file: src/lib/planning/history.test.ts
import { describe, expect, it } from "vitest";
import { computeLastPlannedDates, orderPoolByLRU } from "./history";

it("never-planned sorts before any planned recipe", () => {
  const lastPlanned = computeLastPlannedDates(
    [{ id: "plan-1", start_date: "2026-06-01" } as any],
    [{ recipe: "recipe-a", weekly_plan: "plan-1" } as any]
  );
  const ordered = orderPoolByLRU(
    [{ id: "recipe-a", name: "A" }, { id: "recipe-b", name: "B" }],
    lastPlanned
  );
  expect(ordered.map((r) => r.id)).toEqual(["recipe-b", "recipe-a"]);
});

it("ties break by name asc, then id asc, deterministically across repeated calls", () => {
  const lastPlanned = new Map<string, string>(); // both never-planned
  const recipes = [
    { id: "z-id", name: "Same" },
    { id: "a-id", name: "Same" },
  ];
  const ordered1 = orderPoolByLRU(recipes, lastPlanned);
  const ordered2 = orderPoolByLRU([...recipes].reverse(), lastPlanned);
  expect(ordered1.map((r) => r.id)).toEqual(["a-id", "z-id"]);
  expect(ordered2.map((r) => r.id)).toEqual(["a-id", "z-id"]); // order-independent
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `weekly_plans` = bare `name` text field, no date, no scaling | `weekly_plans` gains `start_date` + `people_multiplier`; new `week_templates`/`template_slots` collections | This phase | Enables history/rotation/LRU and guest-week scaling for the first time |
| `buildPullLists` ignores `meal.quantity` entirely | `buildPullLists` honors `meal.quantity × peopleMultiplier` (D-03) | This phase | Existing `quantity > 1` meals' pull-list output changes — flagged regression, not silent |
| Manual "Add Meal" only, one recipe at a time from a flat alphabetical list | Guided wizard walks tag-based template slots, LRU-ordered, staples pre-filled; manual Add-Meal stays available for one-offs | This phase | Faster week-fill for the recurring weekly shape; manual flow unchanged/untouched |

**Deprecated/outdated:** None — this phase is purely additive to the existing aggregation/schema/UI patterns established in Phases 1-3; nothing existing is removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PocketBase `date`-type field values serialize with a space separator (`"2026-07-06 00:00:00.000Z"`), not `T`, based on training-data familiarity with PocketBase's Go-driven JSON date formatting — not independently re-verified against a live query response in this research session (the DB was reachable via `curl` health-check but no authenticated read of an actual date field was performed). | Pattern 5 (LRU service, ISO string comparison note) | Low — lexicographic ordering works for either separator as long as it's used consistently; only matters if the plan/implementation later needs to `Date.parse()` the value for display formatting, where a `T` vs space mismatch could need a `.replace(" ", "T")` normalization. Flagged for a quick live-record check during Wave 0. |
| A2 | The "upcoming Monday" default-date computation for the New Plan dialog is a plain JS date-math one-liner, not a library concern — no dedicated date library (`date-fns`, `dayjs`) is needed for this phase's date handling (Monday default, "Week of ..." backfill parsing, ISO comparison). | Don't Hand-Roll table; scripts/backfill-plan-dates.js design | Low-medium — if the backfill script's "Week of Jan 6" parsing turns out to need more robust natural-language date parsing than a simple regex, a light date library could be justified; recommend attempting the regex-only approach first (phase doc's own suggested algorithm) since the existing corpus of plan names is small and hand-verifiable. |

**If this table is empty:** N/A — two low-risk assumptions logged above; both are self-correcting (would surface immediately during Wave 0 implementation, not at prod-write time) and don't block planning.

## Open Questions

1. **Exact "Week of …" name corpus on the live `weekly_plans` table**
   - What we know: The schema has exactly one user field (`name`, optional text) today; the phase doc's backfill algorithm assumes some plans have names matching a "Week of …" pattern and some don't.
   - What's unclear: How many existing rows actually match that pattern vs. need the "descending Mondays by `created`" fallback — this determines how much the backfill script's regex path is actually exercised versus dead code for a currently-empty corpus.
   - Recommendation: The backfill script should run in `--dry-run`/report mode first (Claude's Discretion explicitly allows this) against both instances, printing a per-row disposition (matched "Week of …" → parsed date, vs. fallback → assigned date) before any write, mirroring the `seed-usda.js --dry-run` convention already established.

2. **`pool_tags` match-any vs. match-all UI affordance for the (deferred) editor**
   - What we know: D-01 defers the editor entirely this phase; match-any is the locked semantic default (Claude's Discretion confirms).
   - What's unclear: Nothing for *this* phase — this is purely a note that the deferred editor (see CONTEXT.md `<deferred>`) will need an any/all toggle only if a genuinely multi-tag pool is ever wanted; not an open question blocking Phase 4 planning.
   - Recommendation: No action needed this phase; deferred note carried forward correctly in CONTEXT.md already.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | `scripts/backfill-plan-dates.js`, `scripts/seed-week-template.js` | ✓ | v24.14.0 | — |
| npm | dev/build tooling | ✓ | 11.9.0 | — |
| PocketBase (prod, `192.168.50.95:8090`) | schema admin-UI edits, backfill/seed script writes, `sync-to-test` source | ✓ (health-check `200` from this sandbox) | not queried (admin API not hit) | — |
| PocketBase (test, `192.168.50.95:8091`) | same, mirrored | Not independently health-checked this session (same host, adjacent port — prod reachability strongly implies test is too) | — | — |
| `pocketbase` npm client | all scripts + app code | ✓ (already a dependency) | see `package.json` | — |
| `@mui/material`, `@mui/icons-material` | `WeekWizard.tsx`, plan dialog date/multiplier fields | ✓ (already dependencies) | see `package.json` | — |
| `vitest` | unit tests for `history.ts`, `buildPullLists` regression, `scaleQuantity` | ✓ (already a devDependency, `npm run test` = `vitest run`) | see `package.json` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — this phase adds zero new external dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts`, verified: `environment: "node"`, `include: ["src/**/*.test.ts", "scripts/**/*.test.js"]`) |
| Config file | `recipe-planner/vitest.config.ts` |
| Quick run command | `npm run test -- src/lib/planning/history.test.ts` (or the relevant new/changed test file) |
| Full suite command | `npm run test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| WEEK-01 | Existing plans backfilled non-null `start_date`; new plans store/display one | unit (backfill parse logic) + manual (admin-UI/app verification against live DB, per script's own dry-run report) | `npm run test -- scripts` (if backfill parse logic is extracted as a pure function per `seed-usda.js`'s `resolveSeedRow` precedent) | ❌ Wave 0 — new `scripts/backfill-plan-dates.test.js` following `seed-usda.test.js`'s pattern |
| WEEK-02 | `people_multiplier` scales shopping/prep/container/pull-list outputs; multiplier=1 no-regression; D-03 pull-list correctness fix | unit | `npm run test -- src/lib/aggregation` | ❌ Wave 0 — extend `product-builder.test.ts`, `step-builder.test.ts`, `aggregation-lineid.test.ts` (or a new `aggregation.test.ts`) with multiplier + D-03 regression cases |
| WEEK-03 | Week template + slots CRUD-able (via admin UI, not app this phase); tagging a recipe makes it pool-eligible | manual (PB admin UI CRUD) + unit (`poolForSlot`-style filter function, Pattern 6) | manual: admin UI; automated: `npm run test -- src/lib/planning` | ❌ Wave 0 — pool-resolution helper needs its own small test if extracted as a named function rather than inlined in `WeekWizard.tsx` |
| WEEK-04 | Wizard blank-start, slot-by-slot, staples pre-fill+one-tap-confirm, LRU pool order, deterministic tie-break (AC#6), skippable, day/meal_slot always correctly set | unit (`history.ts` LRU + tie-break) + manual (wizard UI walkthrough — no component-test harness exists yet, see below) | `npm run test -- src/lib/planning/history.test.ts` | ❌ Wave 0 for `history.test.ts`; wizard UI itself has **no automated test path** — `vitest.config.ts` explicitly notes "No jsdom/DOM environment this phase" (verified comment in the config file), so `WeekWizard.tsx`'s rendering/interaction is manual-only under current test infra |

### Sampling Rate
- **Per task commit:** targeted `npm run test -- <changed-file-pattern>`
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; wizard UI flows verified manually (no component-test harness — matches existing project convention, not a gap introduced by this phase)

### Wave 0 Gaps
- [ ] `src/lib/planning/history.test.ts` — covers WEEK-04 LRU/tie-break (AC#6)
- [ ] Extend `src/lib/aggregation/aggregation-lineid.test.ts` (or new `src/lib/aggregation.test.ts`) — covers WEEK-02 multiplier scaling + D-03 pull-list regression (AC#7, AC#8)
- [ ] `scripts/backfill-plan-dates.test.js` — covers WEEK-01 backfill parse logic, following `scripts/seed-usda.test.js`'s pure-resolver-function pattern (extract the "Week of …" parse + fallback-Monday logic as a pure function, test it directly, keep `main()` as thin PocketBase wiring)
- [ ] Small unit test for `scaleQuantity()` in `units.ts` (or a `units.test.ts` addition) — covers D-04's discrete/continuous split directly, independent of the larger aggregation tests
- [ ] No component-test framework exists for `WeekWizard.tsx` — this is a **pre-existing, project-wide** gap (vitest config explicitly scopes to `node` environment, no jsdom), not something this phase should attempt to close; wizard UI verification is manual/UAT this phase, consistent with how `WeeklyPlans.tsx`/`Outputs.tsx` UI has always been verified

*(Framework install: none needed — vitest already configured and used project-wide.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | Partial — script-level only | `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` env vars, gitignored `.env.local`, `authWithPassword("_superusers", ...)` — established pattern (`merge-products.js`, `seed-usda.js`), reused unchanged. App-level auth is out of scope (single-household, trusted-LAN app, no auth layer exists or is being added). |
| V3 Session Management | No | Not applicable — no session/token model in this app or added by this phase. |
| V4 Access Control | No | Not applicable — single-user household app, no role/permission model. |
| V5 Input Validation | Yes | PocketBase field-level validation (required/select-enum constraints) is the control — `template_slots.meal_slot` required+select-enum, `day` optional+select-enum, `pool_tags` relation (referential integrity enforced by PocketBase), `people_multiplier` a plain `number` field (no client-side range validation currently exists for e.g. negative/zero multipliers — recommend the plan add a simple `> 0` guard in the plan-dialog UI, mirroring no existing precedent to copy but trivial to add). |
| V6 Cryptography | No | Not applicable — no new cryptographic operations. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Script run against prod without an explicit backup-before-mutate step | Tampering / Repudiation | Follow the established `seed-usda.js`/`merge-products.js` pattern exactly: `pb.backups.create()` before any write, `--dry-run`/`--backup-only` flags, `PB_URL` env override to rehearse against test (`:8091`) first. `backfill-plan-dates.js` and the template-seed script MUST both implement this, per CONTEXT.md's explicit "supervised prod run" precedent from Phase 1. |
| Negative or zero `people_multiplier` producing negative/zero quantities silently | Tampering (data integrity) | Client-side guard in the plan dialog (`people_multiplier > 0`, sensible cap e.g. `<= 10`) — not currently enforced by any PocketBase field constraint (plain `number` type has no `min`/`max` set by default; the plan can optionally set `min: 0.1`-ish on the PocketBase field itself as a belt-and-suspenders server-side check). |
| `template_slot`/`pool_tags` relation left dangling after a tag or slot deletion | Tampering (referential integrity) | PocketBase relation fields without `cascadeDelete` simply null out on target deletion (verified pattern elsewhere in schema, e.g. `recipe_tags.tag` relation, `cascadeDelete: false`) — acceptable for this low-frequency, admin-UI-only editing surface; no additional app-level guard needed this phase. |

## Sources

### Primary (HIGH confidence — direct code/schema inspection this session)
- `recipe-planner/src/lib/aggregation.ts` (543 lines, full read) — `buildPullLists`, `buildProductFlowGraph` exact current implementation
- `recipe-planner/src/lib/aggregation/builders/product-builder.ts` (full read) — `buildAggregatedProduct`, `processRecipeProducts`, instance-count logic
- `recipe-planner/src/lib/aggregation/builders/step-builder.ts` (full read) — `extractStepInputs`/`extractStepOutputs`/`processRecipeSteps`
- `recipe-planner/src/lib/aggregation/builders/flow-builder.ts` (full read) — instance-count consumer confirmation
- `recipe-planner/src/lib/aggregation/utils/product-utils.ts` (full read) — `calculateProductQuantity`, `mergeQuantities`
- `recipe-planner/src/lib/aggregation/types.ts` (full read) — `PlannedMealWithRecipe`, `AggregatedFlowProduct`, etc.
- `recipe-planner/src/lib/units.ts` (full read) — `getDimension`, dimension classification for D-04
- `recipe-planner/src/pages/Outputs.tsx` (lines 1-660 read) — plan loading, `useMemo` chain, call sites
- `recipe-planner/src/pages/WeeklyPlans.tsx` (full structural read) — dialog/Chip/Autocomplete patterns, all citations independently re-verified
- `recipe-planner/src/lib/api.ts`, `types.ts` (full read) — `collections` map, `WeeklyPlan`/`PlannedMeal` interfaces
- `recipe-planner/src/constants/mealPlanning.ts` (full read) — `DAYS`/`MEAL_SLOTS`/`SLOT_COLORS`
- `recipe-planner/scripts/sync-to-test.js` (full read) — `COLLECTIONS_TOP_DOWN` exact current array/order
- `recipe-planner/scripts/seed-usda.js` (partial read, auth/backup/dry-run sections) — script pattern template
- `recipe-planner/src/lib/aggregation/aggregation-lineid.test.ts`, `product-builder.test.ts` (partial reads) — existing test call-site shapes for `buildPullLists`/`buildAggregatedProduct`
- `recipe-planner/vitest.config.ts`, `package.json` (full read) — test framework, dependency list confirmation (no `@mui/x-date-pickers`)
- `pb_schema.json` (targeted reads: `weekly_plans`, `planned_meals`, `tags`, `recipe_tags`, collection id list) — canonical schema verification
- `recipe-planner/src/lib/db-config.ts` (full read) — LAN URL confirmation

### Secondary (MEDIUM confidence)
- `.planning/phase-docs/phase-4-week-memory.md` — elaborated phase design (authoritative per CONTEXT.md, with the two named deltas); used as the spine, cross-checked against live code above
- `plans/workflow-redesign.md` §Topic 3 (read) — milestone decision record
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 4 (read) — requirement/success-criteria text

### Tertiary (LOW confidence)
- PocketBase `date`-field JSON serialization format (space vs. `T` separator) — training-data recollection, not independently re-verified against a live authenticated query this session (see Assumption A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entirely internal-codebase research, every claim traced to a direct file read this session
- Architecture: HIGH — multiplier plumbing, LRU service shape, and D-04 rounding helper design all directly verified against live source, with corrected line numbers superseding the (now-stale) CONTEXT.md citations
- Pitfalls: HIGH — all five pitfalls derived from directly-observed code (verified `sync-to-test.js` array order, verified `required: true` on `planned_meals.meal_slot`, verified `buildPullLists`'s current unscaled behavior)

**Research date:** 2026-07-07
**Valid until:** ~14 days (fast-moving — this codebase is under active multi-phase development; line-number citations in particular should be re-verified if planning is delayed past the next phase's execution)
