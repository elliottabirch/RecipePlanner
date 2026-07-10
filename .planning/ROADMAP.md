# Roadmap: RecipePlanner

## Overview

Milestone v1.1 "Workflow Redesign" fixes four root-cause defects in the weekly shop-and-prep
cycle: a unit-disciplined data layer that silently mis-sums shopping quantities, a memoryless
weekly plan, metadata-free recipe steps that make prep day unsolvable to sequence, and a
self-inflicted import ritual that duplicates the in-app recipe editor. The six phases below
formalize the decomposition in `.planning/phase-docs/00-overview.md`: Phase 1 makes the data
layer trustworthy and gates everything after it; Phases 2 and 4 turn the tablet into a durable
shopping tool and give the weekly plan memory (parallelizable once Phase 1 lands); Phase 3
seeds a real product registry; Phase 5 makes prep day an optimized, interactive cook-mode
experience; Phase 6 retires the import-script ritual and closes the loop with recipe
inspiration and evolution. Authoritative decision record: `plans/workflow-redesign.md`.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Hygiene** - Unit-disciplined data layer: enum + canonical units, convert-or-split aggregation fix, dedup + unique index, linter v1 (completed 2026-07-06)
- [x] **Phase 2: Shopping State & Live Substitution** - Persisted shopping state, have-N, mid-shop swap, make-at-home, quick-create, tablet touch pass (UAT approved, verified 7/7, completed 2026-07-06)
- [x] **Phase 3: Product Registry Seeding** - external plain-name ingredient seed (USDA-linked via fdc_id), fuzzy search everywhere, "Search USDA" mode (completed 2026-07-07)
- [x] **Phase 4: Weekly Planning Memory** - Plan start dates, people-multiplier, tag-based slot templates, guided-fill wizard (completed 2026-07-09)
- [ ] **Phase 5: Prep-Day Engine** - Step metadata + AI-assisted backfill, seeded GA scheduler, interactive cook mode, weights panel, linter v2
- [ ] **Phase 6: Import Pipeline & Recipe Lifecycle** - Draft/published recipes, in-app JSON import, recipe-import skill rewrite, /suggest-recipes, evolution loop

## Phase Details

### Phase 1: Data Hygiene

**Goal**: The recipe data layer is unit-disciplined and duplicate-free, so every downstream aggregation (shopping list, prep, containers) is trustworthy by construction.
**Depends on**: Nothing (first phase). Gates and hardens all later phases (hard dep for Phases 3 and 5; soft dep for Phases 2 and 4).
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07
**Success Criteria** (what must be TRUE):

  1. Shopping list aggregation never silently sums mismatched units — same-dimension quantities combine correctly into one line, cross-dimension quantities appear as separate, clearly distinct lines (DATA-01, DATA-02)
  2. Editing a recipe's ingredient unit only ever sets a measurement unit (cup, gram, etc.) — container type (jar, bag) is a separate field, never conflated with unit (DATA-03)
  3. Every product name in the registry is unique case-insensitively — attempting to create a duplicate name is rejected, and existing duplicates have been one-shot merged (DATA-04, DATA-05)
  4. Running the recipe linter on demand surfaces the four data-hygiene issues (unit mismatches, container-as-unit, missing store/section, prep words in raw names) instead of failing silently (DATA-06)
  5. `decisions.md` and the schema export accurately reflect the app's real step-aggregation behavior, so future development isn't misled by stale docs (DATA-07)

**Plans**: 8/8 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Test harness (Vitest) + units.ts enum/conversion/alias/display module + Product type fields [DATA-02]
- [x] 01-02-PLAN.md — Dedup + merge scripts: find-duplicates JSON/MD output + merge-products with backup/preflight/orphan-check [DATA-04]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Convert-or-split aggregation fix + stable lineId through the shopping list [DATA-01]
- [x] 01-04-PLAN.md — Recipe linter v1 (4 rules), Products.tsx panel + headless lint.js [DATA-06]
- [x] 01-05-PLAN.md — normalize-node-units + backfill-units scripts + decisions.md reconciliation [DATA-05, DATA-07]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-06-PLAN.md — Remove unit-as-container overload + enum-bound editor unit Select [DATA-03]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-07-PLAN.md — Add canonical_unit/dimension PB fields (both DBs) + full migration rehearsal on test [DATA-04, DATA-05]

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-08-PLAN.md — One-shot prod migration + case-insensitive (name, type) unique index [DATA-04, DATA-05]

### Phase 2: Shopping State & Live Substitution

**Goal**: The tablet becomes a durable, trustworthy shopping companion — state persists across refresh and device switch, and the user can adapt the list mid-shop without breaking downstream outputs.
**Depends on**: Phase 1 (soft — aggregation correctness). Infra prereq: NAS PocketBase joins the tailnet + `db-config.ts` hostname switch (todo `nas-pocketbase-tailnet`), required for store/phone use but not local development.
**Requirements**: SHOP-01, SHOP-02, SHOP-03, SHOP-04, SHOP-05, SHOP-06, SHOP-07
**Success Criteria** (what must be TRUE):

  1. Checking off items on any outputs tab persists to PocketBase and survives refresh and device switch, scoped per weekly plan (SHOP-01)
  2. User can record "have N" per line and see remaining-to-buy, auto-completing when the line is satisfied (SHOP-02)
  3. Mid-shop, user can swap a product for a substitute — choosing affected meals and a per-meal quantity/unit — and all downstream outputs (shopping, prep, pull, container lists) re-derive immediately (SHOP-03)
  4. User can resolve a line as "make it at home," with an offer to add its source recipe to the week, and can quick-create a new product from a minimal phone-friendly dialog without leaving the flow (SHOP-04, SHOP-05)
  5. Outputs pages are touch-friendly on tablet and remain usable over the tailnet through a brief connectivity drop, showing a pending-sync indicator until queued writes land (SHOP-06, SHOP-07)

**Plans**: 10/10 plans complete

Plans:
**Wave 1** *(parallel — pure logic + schema)*

- [x] 02-01-PLAN.md — Content-derived stable keys: lineId through StoredItem/PullListItem/MealContainer + collapse 3 helpers + fix 4 tab call sites [SHOP-01]
- [x] 02-02-PLAN.md — VariantOverride quantity/unit inherit-when-null threading in applyVariantOverrides [SHOP-03]
- [x] 02-03-PLAN.md — shopping-overlay (have-N/resolution/export filter) + shopping-mapping (line→node targets) pure modules [SHOP-02, SHOP-03, SHOP-04]
- [x] 02-04-PLAN.md — sync-queue optimistic retry/backoff/coalesce primitive [SHOP-07]
- [x] 02-05-PLAN.md — shopping_state collection + meal_variant_overrides fields (manual PB, both instances) + api/types surface [SHOP-01, SHOP-03]

**Wave 2** *(blocked on 02-04, 02-05)*

- [x] 02-06-PLAN.md — useShoppingState optimistic hook + SyncIndicator component [SHOP-01, SHOP-07]

**Wave 3** *(blocked on 02-01/02/03/06)*

- [x] 02-07-PLAN.md — Wire Outputs.tsx: hook + Set-view adapter, override map threading, overlay/export filter, SyncIndicator mount [SHOP-01, SHOP-03, SHOP-06]

**Wave 4** *(blocked on 02-07)*

- [x] 02-08-PLAN.md — ShopSwapDialog + QuickCreateProductDialog + Outputs swap-save/make-it handlers [SHOP-03, SHOP-04, SHOP-05]

**Wave 5** *(blocked on 02-08)*

- [x] 02-09-PLAN.md — ShoppingListTab: have-N stepper, remaining-to-buy, resolved treatment, swap/make-it buttons [SHOP-02, SHOP-04, SHOP-06]

**Wave 6** *(blocked on 02-07/08/09)*

- [x] 02-10-PLAN.md — Touch pass (CheckableListItem + non-shopping tabs), print scoping, end-of-phase human UAT [SHOP-06, SHOP-07] — Tasks 1-2 complete; Task 3 (human UAT) blocking checkpoint pending

**UI hint**: yes

### Phase 3: Product Registry Seeding

**Goal**: The product registry has real-world breadth and is easy to search, so authoring and quick-create rarely require typing an ingredient from scratch.
**Depends on**: Phase 1 (hard — unique name index + canonical-unit fields). Soft dep on Phase 2 (Search-USDA mode and swap-search fuzzy wiring use Phase 2 surfaces; everything else in this phase is Phase-2-independent).
**Requirements**: REG-01, REG-02, REG-03, REG-04
**Success Criteria** (what must be TRUE):

  1. The product registry gains meaningful breadth of plain-named raw ingredients from an external catalog (USDA-linked via retained `fdc_id`), each with default store/section and zero duplicate names against the existing set (REG-01) — breadth, not a hard count; the "~800 Foundation Foods" estimate was superseded in discussion (Phase 3 CONTEXT D-01: Foundation Foods alone yields <150 net-new)
  2. Searching for a product on the registry page, in the recipe editor, or in quick-create tolerates typos and reordered words — "garbonzo" finds "garbanzo," "paste tomato" finds "tomato paste" (REG-02)
  3. Quick-create offers a "Search USDA" mode to pull in an item not already in the seeded set, on demand (REG-03)
  4. Seeded products carry nutrition fields in the background (FDC ID, macros) with no user-facing nutrition UI yet (REG-04)

**Plans**: 6/6 plans complete

Plans:
**Wave 1** *(parallel — schema, search module, seed-source spike)*

- [x] 03-01-PLAN.md — Nutrition-ready schema: 8 nullable fields on products (both DBs) + Product interface + pb_schema.json re-export [REG-04]
- [x] 03-02-PLAN.md — searchProducts fuzzy module (fuse.js) + wire all 5 product-search call sites [REG-02]
- [x] 03-03-PLAN.md — Seed-build pipeline + USDA acquisition + 50-item catalog comparison → D-01 catalog decision [REG-01]

**Wave 2** *(blocked on Wave 1)*

- [x] 03-04-PLAN.md — Full usda-seed.json + idempotent dedup/backfill/insert resolver + test-first/backup prod run [REG-01, REG-04]
- [x] 03-05-PLAN.md — Bundled SR-Legacy Search-USDA asset + searchUsda lookup module + category→section map [REG-03]

**Wave 3** *(blocked on Wave 2)*

- [x] 03-06-PLAN.md — "Search USDA" tab in QuickCreateProductDialog (prefill name/section/fdc_id, unit manual) [REG-03]

**UI hint**: yes

### Phase 4: Weekly Planning Memory

**Goal**: The weekly plan remembers dates and scales servings, and a guided wizard helps the user fill a week fast without re-deciding rotation from scratch.
**Depends on**: Phase 1 (soft — scaled quantities are only trustworthy once aggregation is fixed).
**Requirements**: WEEK-01, WEEK-02, WEEK-03, WEEK-04
**Success Criteria** (what must be TRUE):

  1. Every weekly plan has a start date (existing plans backfilled), shown in the plan list and header (WEEK-01)
  2. Setting a plan's people-multiplier scales shopping, batch-prep, container, and pull-list quantities accordingly (D-03 folds pull lists in), with a multiplier of 1 reproducing today's output exactly for continuous units (WEEK-02)
  3. User can define a reusable week template of tag-based slots, and tagging a recipe makes it eligible for the matching slot's pool with no other change (WEEK-03)
  4. The guided-fill wizard leads with a staples slot pre-filled from last week's picks, then walks remaining slots ordering each pool's options least-recently-planned-first (WEEK-04)

**Plans**: 9/9 plans complete

Plans:
**Wave 0** *(test scaffolds)*

- [x] 04-01-PLAN.md — Wave 0 Nyquist test scaffolds: LRU/pool, multiplier+D-03 pull-list regression, scaleQuantity, backfill resolver [WEEK-01, WEEK-02, WEEK-03, WEEK-04]

**Wave 1** *(schema + pure aggregation core, parallel)*

- [x] 04-02-PLAN.md — Schema foundation: weekly_plans fields + week_templates/template_slots + planned_meals.template_slot (manual PB both instances) + pb_schema/types/api/sync-to-test [WEEK-01, WEEK-02, WEEK-03]
- [x] 04-03-PLAN.md — Multiplier core: scaleQuantity (D-04) + three-site threading + buildPullLists D-03 fix + REQUIREMENTS/phase-doc reconciliation [WEEK-02]

**Wave 2** *(services, scripts, and UI surfacing — parallel, no file overlap)*

- [x] 04-04-PLAN.md — LRU history service: computeLastPlannedDates + orderPoolByLRU + poolForSlot (pure, tested) [WEEK-03, WEEK-04]
- [x] 04-05-PLAN.md — start_date backfill script (pure resolver + dry-run/backup, both instances) + tighten to required [WEEK-01]
- [x] 04-06-PLAN.md — Seed one week_templates row + template_slots (Staples-first, tag pools) idempotent script, both instances [WEEK-03]
- [x] 04-07-PLAN.md — Outputs.tsx: thread people_multiplier into both aggregation call sites + useMemo deps + ×N badge [WEEK-02]
- [x] 04-08-PLAN.md — New Plan dialog start_date + people_multiplier + list/header date display + dates helper [WEEK-01, WEEK-02]

**Wave 3** *(wizard)*

- [x] 04-09-PLAN.md — WeekWizard.tsx accordion (staples pre-fill, LRU pools, off-pool add, skippable) + Fill Week launch [WEEK-03, WEEK-04]

**UI hint**: yes

### Phase 5: Prep-Day Engine

**Goal**: Prep day becomes a deterministic, optimized, interactive cook-mode experience instead of a manually-sequenced guess.
**Depends on**: Phase 1 (hard). Conditionally feeds from Phase 4's start date for the day-before lead-time horizon only, if that feature stays in scope.
**Requirements**: PREP-01, PREP-02, PREP-03, PREP-04, PREP-05, PREP-06
**Success Criteria** (what must be TRUE):

  1. Every recipe step carries durations, instructions, and a controlled prep-action vocabulary, editable in the recipe editor (PREP-01)
  2. The 185 existing steps are backfilled with this metadata via an AI-assisted pass, reviewed in batches before being saved (PREP-02)
  3. Generating a prep-day schedule for a weekly plan is deterministic — the same seed and weights always produce the same ordered timeline — and respects both recipe step order and kitchen resource limits (oven racks/temperature, burners, singleton appliances) (PREP-03)
  4. Cook mode's tablet view shows now/next cards with scaled quantities and instructions, recomputes the remaining timeline as steps are checked off, and shows live countdowns for passive steps (PREP-04)
  5. User can tune scheduler weights in-app and regenerate the plan; the linter, run on demand, flags step-metadata and pull-step violations (PREP-05, PREP-06)

**Plans**: 8/12 plans executed

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Schema, types & API foundation (7 recipe_steps fields + cook_progress + scheduler_config)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — Scheduler types + prando + Wave-0 red test scaffolds
- [x] 05-03-PLAN.md — Step-metadata authoring UI (RecipeEditor + StepNode)
- [x] 05-04-PLAN.md — Offline backfill draft JSON for the 185 steps

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-05-PLAN.md — Week-graph builder (per-instance nodes, cross-recipe edges)
- [x] 05-06-PLAN.md — Resource feasibility model (cook/oven/stovetop/appliances)
- [x] 05-07-PLAN.md — Linter v2 rules (durations, prep_action, week-scoped pull-step)
- [x] 05-08-PLAN.md — Backfill review page + idempotent apply

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 05-09-PLAN.md — Seeded GA scheduler (SSGS decode + active-span fitness + determinism)
- [ ] 05-10-PLAN.md — Order-preserving check-off retime

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 05-11-PLAN.md — Cook mode + cook-progress hook + readiness

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 05-12-PLAN.md — Weights panel + deterministic regenerate

**UI hint**: yes

### Phase 6: Import Pipeline & Recipe Lifecycle

**Goal**: Adding and evolving recipes happens entirely in-app, with drafts kept out of planning until approved — retiring the test-database migration ritual.
**Depends on**: Phase 4 (wizard hosts the evolution prompt; dated plans feed `/suggest-recipes`). Phase 5 (recipe_steps metadata is a hard input to the import JSON contract). Infra prereq: tailnet (phone capture), same as Phase 2.
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, IMP-07
**Success Criteria** (what must be TRUE):

  1. Recipes have a draft/published status; draft recipes are invisible to weekly planning but visible, badged, in the recipe list (IMP-01)
  2. User can paste structured recipe JSON into an in-app import page and get a draft recipe landed directly in prod, with no test database or migration script involved (IMP-02, IMP-03)
  3. `/suggest-recipes` proposes 3-5 import-ready recipe candidates that reuse existing registry products, favor low active time, and are batch-prep compatible (IMP-04)
  4. User can attach a one-tap note to a recipe from the calendar, cook mode, or recipe card, and later see an agent-produced draft revision surfaced for review in the week wizard (IMP-05, IMP-06)
  5. Publishing a draft recipe is blocked until it passes the recipe linter; importing itself is never blocked (IMP-07)

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6. Phases 2 and 4 are independent of each other and may be planned/executed in parallel once Phase 1 completes.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Hygiene | 8/8 | Complete    | 2026-07-06 |
| 2. Shopping State & Live Substitution | 10/10 | Complete    | 2026-07-07 |
| 3. Product Registry Seeding | 6/6 | Complete   | 2026-07-07 |
| 4. Weekly Planning Memory | 9/9 | Complete    | 2026-07-09 |
| 5. Prep-Day Engine | 8/12 | In Progress|  |
| 6. Import Pipeline & Recipe Lifecycle | 0/TBD | Not started | - |
