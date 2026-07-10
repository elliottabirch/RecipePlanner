---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Workflow Redesign
current_phase: 6
current_phase_name: Import Pipeline & Recipe Lifecycle
status: ready_to_plan
stopped_at: Phase 6 UI-SPEC approved
last_updated: "2026-07-10T22:41:52.917Z"
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 45
  completed_plans: 45
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-06)

**Core value:** The derived weekly outputs — shopping list and prep plan — must be trustworthy and low-friction for the real weekly shop-and-prep cycle.
**Current focus:** Phase 5 complete + verified (5/5). Now at Phase 6 (Import Pipeline & Recipe Lifecycle) — ready to discuss/plan.

## Current Position

Phase: 6 — Import Pipeline & Recipe Lifecycle
Status: Cook mode is live on the NAS (`http://192.168.50.95:3000`). Prep-day
scheduler ships with week-wide prep merge, clock-ordered Now/Next + full-schedule
list, and a day-of (`just_in_time`) step filter. In-app weights panel +
deterministic regenerate shipped and human-verified.

Phase 5 close-out (2026-07-10):

- **05-12 Task 3 human-verify checkpoint APPROVED** by the user: weights
  tuning, twice-unchanged deterministic regenerate, checked-off confirmation
  dialog (accent-green, cook_progress preserved), and cross-device weight
  persistence all confirmed live on the tablet.

- `05-12-SUMMARY.md` written (Tasks 1-2 commits 2a524aa/15068c0 + approved
  checkpoint).

- `05-11-SUMMARY.md` written **retroactively** — cook mode was built ad-hoc
  (commits cc86014/f5e0af4/dd62097 + live refinements) with no contemporaneous
  SUMMARY; reconciled now.

- ROADMAP.md updated: Phase 5 = 12/12 Complete (2026-07-10).

Post-close follow-on (2026-07-10, commit a7094ec) — **linter v2 on-demand
surface wired** (PREP-06): the 05-07 rule modules + `runStepLint`/`runWeekLint`
aggregators had shipped but `runWeekLint` had zero UI callers, so success
criterion #5's "linter, run on demand, flags step-metadata and pull-step
violations" was unmet at the user-facing level. Added
`collectStoredInputConsumptions` (derives the missing-pull-step input from
`MealKeyedRecipeData`, excludes just_in_time consumers, deduped, unit-tested)
and a "Check plan" button + results dialog in CookMode that runs BOTH v2
aggregators against the loaded week. Criterion #5 now genuinely satisfied.
(Publish-gate wiring of the same rules — IMP-07 — remains a Phase 6 concern.)

Verification state: `npx tsc --noEmit` clean, production build green, 180/180
tests passing (23 files). No standalone `/gsd-verify-work` run — success
criteria satisfied via the two blocking human-verify checkpoints (05-11 cook
mode, 05-12 weights) + green suite + this linter-surface close-out.

Deferred out of Phase 5 (carried to Phase 6 step-metadata / data work):

- **Step-instruction DATA cleanup** (PREP-04 partial). Correction per
  05-VERIFICATION.md: the display *mechanism* already exists — `NowNextCard`
  renders `instance.step.instructions` in the tap-to-expand Collapse. What's
  deferred is the data: many step `name`s duplicate the full instruction text
  and `instructions` is often empty. (Earlier notes wrongly said the mechanism
  was missing.)

- `swap-aware-prep-naming` — prep-step titles / prep-state output node names
  don't yet reflect ingredient swaps.

- `connective-recipe-batch-then-consume` thread 3 (contextual naming) + thread 4
  (model batch→consume at import time) — deferred to Phase 6 (elision + display
  surfaces done this session; see todo).

Next candidate: Phase 6 — Import Pipeline & Recipe Lifecycle (discuss or plan).

Progress: [██████████] Phase 5 complete — 5 of 6 phases done

## Performance Metrics

**Velocity:**

- Total plans completed: 39
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 8 | - | - |
| 2 | 10 | - | - |
| 04 | 9 | - | - |
| 05-prep-day-engine | 12 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 4min | 3 tasks | 6 files |
| Phase 01-data-hygiene P02 | 15min | 2 tasks | 3 files |
| Phase 01 P03 | 24min | 3 tasks | 6 files |
| Phase 01 P04 | 32min | 2 tasks | 9 files |
| Phase 01 P05 | 20min | 3 tasks | 3 files |
| Phase 01-data-hygiene P06 | 14min | 2 tasks | 4 files |
| Phase 01-data-hygiene P07 | 65min | 2 tasks | 5 files |
| Phase 01-data-hygiene P08 | 22min | 3 tasks | 9 files |
| Phase 02-shopping-state-live-substitution P01 | 20min | 2 tasks | 8 files |
| Phase 02 P02 | 10min | 1 tasks | 2 files |
| Phase 02 P03 | 12min | 2 tasks | 4 files |
| Phase 02 P04 | 18min | 1 tasks | 2 files |
| Phase 02-shopping-state-live-substitution P05 | 12min | 2 tasks | 3 files |
| Phase 02 P06 | 5min | 2 tasks | 3 files |
| Phase 02-shopping-state-live-substitution P07 | 6min | 2 tasks | 1 files |
| Phase 02 P08 | 35min | 3 tasks | 5 files |
| Phase 02 P09 | 25min | 2 tasks | 2 files |
| Phase 02-shopping-state-live-substitution P10 | 6min | 2 tasks | 5 files |
| Phase 03-product-registry-seeding P02 | 15min | 2 tasks | 6 files |
| Phase 03 P03 | 1min | 2 tasks | 3 files |
| Phase 03 P01 | 3min | 2 tasks | 3 files |
| Phase 03 P05 | 3min | 2 tasks | 5 files |
| Phase 03-product-registry-seeding P04 | 21min | 3 tasks | 3 files |
| Phase 03 P06 | 20min | 2 tasks | 1 files |
| Phase 04-weekly-planning-memory P01 | 9min | 3 tasks | 4 files |
| Phase 04 P02 | 20min | 2 tasks | 4 files |
| Phase 04 P03 | 6min | 3 tasks | 7 files |
| Phase 04-weekly-planning-memory P04 | 6min | 1 tasks | 1 files |
| Phase 04 P08 | 12min | 2 tasks | 3 files |
| Phase 04-weekly-planning-memory P06 | 12min | 2 tasks | 1 files |
| Phase 04-weekly-planning-memory P07 | 12min | 1 tasks | 1 files |
| Phase 04-weekly-planning-memory P09 | 25min | 2 tasks | 2 files |
| Phase 05 P01 | 25min | 3 tasks | 4 files |
| Phase 05-prep-day-engine P02 | 8min | 3 tasks | 8 files |
| Phase 05 P03 | 10min | 2 tasks | 2 files |
| Phase 05 P04 | 25min | 2 tasks | 2 files |
| Phase 05-prep-day-engine P05 | 15min | 1 tasks | 1 files |
| Phase 05-prep-day-engine P06 | 20min | 1 tasks | 1 files |
| Phase 05-prep-day-engine P07 | 20min | 3 tasks | 4 files |
| Phase 05-prep-day-engine P08 | 20min | 3 tasks | 5 files |
| Phase 05-prep-day-engine P09 | 20min | 2 tasks | 2 files |
| Phase 05 P10 | 15min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Convert-or-split by dimension in aggregation; no density model (Phase 1)
- Preparation states are transient nodes, not products (Phase 1)
- Seed registry from USDA FDC Foundation Foods, ~800 concept-level items (Phase 3)
- Tailnet connectivity, not local-first sync (Phases 2, 6)
- Tag-based rotation pools + guided-fill wizard, staples as first slot (Phase 4)
- Seeded genetic-algorithm scheduler, primary objective = minimize active time (Phase 5)
- Imports land in prod as drafts; test DB for schema/code only (Phase 6)
- [Phase 01]: vitest approved via package-legitimacy checkpoint (68M/wk downloads, canonical repo, ~4.5yr old) — SUS flag was a false positive from latest-version publish recency, not package age
- [Phase 01]: UNIT_ALIASES seeded verbatim from the 445-record live disposition table in 01-RESEARCH.md — Real corpus is messier than the phase doc's grep sample; re-deriving from scratch risks missing container-type strings and junk values
- [Phase 01]: promoteUnit/chooseDisplayUnit implement D-10 deterministic display-unit selection — canonical_unit wins when set; else largest unit keeping qty>=1 capped at cup/lb, no metric<->customary crossing
- [Phase 01]: D-05 review format implemented as JSON decisions skeleton + companion Markdown report in scripts/dedup-output/ (gitignored)
- [Phase 01]: Cross-type same-name collisions quarantined into a separate MD section and excluded from the JSON decisions array (D-12, Pitfall #1)
- [Phase 01]: merge-products.js hardcodes the four D-07 reference collections rather than deriving them from the stale pb_schema_updated.json
- [Phase 01]: convert-or-split display-unit re-derivation only fires on an actual merge (2+ nodes), not on first insertion — Keeps single-ingredient shopping lines showing their as-entered unit unchanged; scopes the D-10 formatting change to the merge bug this plan fixes, avoiding scope creep
- [Phase 01]: lineId = productId for the common case, productId|dimension for a split line, derived purely from the incoming unit's dimension name — Any number of distinct dimensions for the same product converge on a stable key without needing to search existing split entries; this is also the Phase 2 persisted-checkbox key
- [Phase 01]: Cross-dimension rule needs recipe_product_nodes.unit data; both Products.tsx and scripts/lint.js fetch+group nodes by product id before calling runLint() — Neither surface's product-only query carries node-unit data naturally; without it the cross-dimension rule never fires against real data
- [Phase 01]: Installed tsx as a devDependency for scripts/lint.js (direct node execution fails on extensionless relative imports) — Pre-approved fallback in the plan text; verified 68.6M weekly downloads, canonical github.com/privatenumber/tsx repo
- [Phase 01]: Container-clearing scope in normalize-node-units.js stays exactly stored-type nodes per D-01 — Live data shows container-type strings mostly on raw/inventory-type nodes; widening scope would be an undiscussed architectural expansion, so those cases route to the unresolved report for Plan 08 human review instead
- [Phase 01]: backfill-units.js canonical_unit heuristic: most-frequently-used normalized unit within a product's single inferred dimension — Deterministic (count desc, then alphabetical tie-break), matches how the product is actually used in recipes, independent of node fetch order
- [Phase 01-data-hygiene]: FridgeFreezerTab/MealContainersTab/PullListsTab required no changes — audit confirmed they already read containerTypeName, not unit, for container display — Prevented redundant edits; consumers already implemented the correct field
- [Phase 01-data-hygiene]: Prod has zero real same-type dupes; merge machinery rehearsed via self-cleaning synthetic fixtures on TEST — Plan 08's merge step is likely a no-op on real data — find-duplicates against a fresh prod copy produced an empty same-type skeleton; only the two intentional cross-type pairs exist
- [Phase 01-data-hygiene]: NEW Plan 08 entry condition: all unit gaps (29 unresolved node units + ambiguous/null canonical_units) must be resolved via a human-confirmed unit-resolutions worksheet (scripts/dedup-output/unit-resolutions.json) applied during the supervised prod run — User sign-off condition at the 01-07 rehearsal checkpoint — nothing left to the linter
- [Phase 01-data-hygiene]: PB superuser credentials live in gitignored recipe-planner/.env.local, sourced at run time; needed again for Plan 08's prod backup — merge-products.js pb.backups.create() requires superuser auth; values never printed or committed
- [Phase 01-data-hygiene]: Schema exports consolidated to a single canonical pb_schema.json; pb_schema_updated.json deleted (user-directed at the Plan 08 Task 3 checkpoint) — Acceptance greps against pb_schema_updated.json are satisfied by pb_schema.json; later phases verify against pb_schema.json only
- [Phase 01-data-hygiene]: Plan 08 prod backup taken explicitly via pb.backups.create because merge-products.js exits before its own backup step on an empty decisions file — Preserves the D-06.2 backup-before-any-mutation guarantee on the no-op merge path
- [Phase 02-shopping-state-live-substitution]: MealContainer.containers[].lineId is recipe-name-scoped (not per-planned-meal), matching the builder's pre-existing grouping; strictly improves on the positional-key bug without expanding scope into a buildMealContainersList rework
- [Phase 02-shopping-state-live-substitution]: VariantOverride.unit typed as the Phase-1 Unit enum (imported from lib/units.ts), not free text, per D-12 — no import cycle encountered
- [Phase 02-shopping-state-live-substitution]: ShoppingStateEntry defined locally in shopping-overlay.ts (not imported from 02-05's types.ts) — avoids hard-depending on sibling Wave-1 plan ordering; structurally compatible with whatever 02-05 defines
- [Phase 02-shopping-state-live-substitution]: getMealNodeTargetsForProduct fans a per-meal quantity/unit input out to every matching recipe_product_node within that meal, per 02-RESEARCH Open Question 1's recommended default
- [Phase 02]: sync-queue.ts maxAttempts = retries allowed AFTER initial attempt fails (4 total invocations for a permanently-failing write), matching 02-RESEARCH's cited useShoppingState code example
- [Phase 02]: sync-queue.ts clears failedKeys optimistically at enqueue time (not only after success confirms), keeping pending/failed as independent live counts for SyncIndicator
- [Phase 02-shopping-state-live-substitution]: shopping_state collection created on both prod/test with pre-migration override count 0/0 — no backfill needed for meal_variant_overrides.quantity/unit
- [Phase 02]: ShoppingState.resolution typed as buy|make|skip|null (not non-null) to match the actual nullable PocketBase select field
- [Phase 02]: useShoppingState enqueues the full merged {checked, have_quantity, resolution} triple on every write (not a bare patch), since sync-queue.ts coalesces by replacing a key's pending payload — a partial-patch design would drop an earlier field's optimistic change if two setters fire before the first flush completes — Prevents silent data loss on rapid successive edits to the same shopping line before the sync queue flushes
- [Phase 02]: SyncIndicator exported from components/outputs/index.ts alongside sibling tab components, matching the existing barrel-export convention — 02-07 needs to import it for Outputs.tsx wiring; keeps the directory's export pattern consistent
- [Phase 02]: Outputs.tsx does not destructure setHaveQuantity/setResolution from useShoppingState in 02-07 (noUnusedLocals enabled repo-wide); both remain on the hook for 02-08/02-09 to pull in directly
- [Phase 02]: filteredShoppingListForExport keeps the pre-existing pantry-checked exclusion branch alongside the new filterForExport resolved-line exclusion — pantry items use a separate getPantryCheckboxKey namespace, so overlaying them via getShoppingCheckboxKey never interferes with pantry-checkbox behavior
- [Phase 02]: swap-save scopes delete+recreate of meal_variant_overrides to the touched node IDs (not the whole meal), unlike WeeklyPlans.handleSaveVariants — prevents a store-time single-product swap from clobbering an unrelated planning-time override in the same meal
- [Phase 02]: onSwap/onMakeIt pass the full AggregatedProduct item (not just productId) so make-it can resolve both product/source_recipe lookup and the shopping_state lineId key without a second lookup
- [Phase 02]: ShoppingListTabProps extended with optional onSwap/onMakeIt/canMakeIt in 02-08 (declaration only, no rendering) so 02-09's call site compiles ahead of its own rendering work
- [Phase 02]: Non-pantry shopping lines drop the manual checkbox in favor of the have-N stepper as the SHOP-02 completion signal; pantry-style lines are unchanged
- [Phase 02]: have-N stepper clamps to [0, totalQuantity]; remaining caption always uses text.secondary (never success.main, which is byte-identical to this app's accent green) to avoid overloading the 10% accent budget
- [Phase 02]: Swap/Make-it buttons render on every line in the byStore/section groups (pantry-style included) but not in the separate bottom Pantry Check section, which verifies stock rather than buying/substituting
- [Phase 03]: searchProducts made generic and identity-preserving (returns original object refs, no leaked _sortedTokens field) rather than the research doc's literal augmented-object return
- [Phase 03]: MUI Autocomplete noOptionsText is a static ReactNode, not a function of inputValue — added onInputChange-tracked local state at each of the 3 Autocomplete sites to drive the dynamic 'No products match' copy
- [Phase 03]: D-01/Open Question 1 LOCKED — hand-curated (LLM-assisted) ~500-item catalog source (96% real fdc_id join coverage vs 14% OFF-filtered) for Plan 04's full seed build
- [Phase 03]: REG-04 nutrition-ready schema landed: 8 nullable fields added to products on both DBs (idempotent script), Product interface mirrors them; density/purchase-unit fields stay deferred/unchanged
- [Phase 03]: Bundled asset came in at 117KB gzipped (7,793 rows) — under the D-06 150-250KB target after dropping duplicate/blank-name rows
- [Phase 03]: category-section-map.ts returns a section NAME not a live PocketBase id — id resolution against the live sections collection is deferred to Plan 06
- [Phase 03-04]: 27 SKIP_REVIEW near-matches (onion/garlic/tomato/etc.) kept as-is per user policy: existing registry products are more specific than seed near-dupes — Resolver's default conservative behavior; no override needed
- [Phase 03-04]: Prod registry seeded: 432 net-new raw products inserted, 49 backfilled with fdc_id/usda_data_type/usda_category, 0 failures — REG-01 completion; zero duplicate-index violations confirmed post-insert
- [Phase 03-06]: Search-USDA prefill verified live in prod persisting fdc_id + usda_data_type='sr_legacy'; bundled index's verbose SR-Legacy names deferred to usda-search-plain-rename todo
- [Phase 04-01]: poolForSlot/TemplateSlot fixtures use inline object literals cast with as any rather than importing a not-yet-existing TemplateSlot type — matches 04-RESEARCH's Code Example convention
- [Phase 04-01]: resolvePlanDate designed as (plan, index, baseMonday) pure function; descending-by-created/id-asc sort exercised inline in the test, not a second exported symbol
- [Phase 04]: Live read-back verification used a self-cleaning temporary node script (recipe-planner/scripts/_tmp-verify-schema.mjs) that parses .env.local internally rather than exposing PB_SUPERUSER_* values to the agent shell — Preserves the established gitignored-creds boundary while still proving the schema live on both prod/test instances; script deleted immediately after use, zero residue confirmed via git status
- [Phase 04-03]: scaleQuantity(qty, factor, unitOrForceDiscrete) centralizes D-04 rounding -- continuous mass/volume exact, each-dimension/discrete marker ceils; used at all product-total, container-instance, and step in/out call sites
- [Phase 04-03]: buildPullLists D-03 fix bundles a feature (peopleMultiplier support) with a latent correctness fix (existing quantity>1 meals were previously unscaled) -- covered by a dedicated regression test, not folded into the multiplier=1 no-op assertion
- [Phase 04-weekly-planning-memory]: planning-history LRU module implemented per 04-RESEARCH.md Pattern 5/6 verbatim; poolForSlot typed against Pick<TemplateSlot, 'pool_tags'> for narrow dependency surface — Matches history.test.ts's exact import contract with no deviation needed
- [Phase 04-08]: people_multiplier <= 0 is clamped to 0.1 (not reset to 1) at save time in the New Plan dialog — matches the PocketBase field's own Min 0.1 constraint, defense-in-depth for T-04-08a
- [Phase 04-08]: formatWeekOf renders dates in UTC to avoid a local-timezone off-by-one-day shift on the date-only start_date value
- [Phase 04-05]: backfill-plan-dates.js resolvePlanDate implements 'Week of <Month> <Day>, <Year>' regex parse (rounds back to that week's Monday) with a descending-Mondays-by-created-order fallback (id-asc tie-break) — Dry-run against both prod/test found exactly 1 undated plan on each instance, name '6/22', which does not match the Week-of pattern and falls back to this-week's Monday rather than a June 22 date the name implies -- flagged for human review before apply
- [Phase 04-06]: Confirmed household week template slot set (Staples/Proteins/Starches/Vegetables/Greens-Salads/Micah meals) applied via idempotent seed-week-template.js to both prod and test -- pool_tags resolved to real tag ids, fails loudly on any missing tag
- [Phase 04-07]: Live UAT for the multiplier badge/scaling checkpoint deferred to the user (AUTO_MODE auto-approved implementation, not the runtime claim) -- coverage D1 marked human_judgment:true pending an actual x2-plan exercise in the running app
- [Phase 04-09]: Staples pre-fill writes planned_meals immediately on wizard open (guarded to only fire when the staples slot has zero existing picks), unifying the write path so Confirm Staples is a pure advance action
- [Phase 04-09]: Staples slot exempted from auto-advance-on-count-reached (only advances via explicit Confirm Staples tap) so a fully-matching pre-fill doesn't silently skip past user review
- [Phase 05-01]: pb_schema.json canonical mirror confirmed at repo root (not recipe-planner/); apply-phase5-schema.mjs script re-exports there; rack_slots default-1 enforced at application layer since PB schema has no field-level default
- [Phase 05-02]: resources.test.ts uses RecipeStep's real field names (active_minutes/passive_minutes/resource/oven_temp_f/rack_slots) for isFeasibleAt, matching Pattern 4's decode usage
- [Phase 05-02]: missing-pull-step signature is (weekGraph, consumedStoredInputs[]) reusing WeekGraph edges per D-07 plus a product-type side list
- [Phase 05-02]: runWeekLint introduced as a distinct week-scoped aggregator entry point from the per-recipe runLint
- [Phase 05-03]: oven_temp_f validation triggers on Save-click attempt (not eager), matching handleSaveEditedStep's existing early-return pattern; clears on next field edit or when resource leaves oven
- [Phase 05-03]: Add Step dialog intentionally NOT extended with the 7 fields — only the Edit Step dialog + both save touchpoints are in scope; new steps get metadata via edit-after-create
- [Phase 05-04]: export-steps-for-backfill.mjs authenticates as PB superuser purely for read visibility, issues only getFullList() calls (read-only, cred-safe)
- [Phase 05-04]: prep_action assigned only to genuine knife-cut steps matching the 6-verb vocabulary; non-cutting prep-typed steps (cook/toast/juice/sweat/thaw) left null rather than forcing a mismatched enum value
- [Phase 05-04]: resource inferred per step from name+graph context (oven/stovetop/blender/none); no step indicated Instant Pot use so instant_pot was never assigned in the 185-step backfill draft
- [Phase 05-05]: Cross-recipe product matching in buildWeekGraph uses RecipeProductNode.product (relation-ID field) rather than expand.product.id for id comparison; expand still used for the stored/inventory type check
- [Phase 05-prep-day-engine]: resources.ts: emptyResourceTimeline() takes no config param (capacities live only in scheduler_config, passed per-call to isFeasibleAt) to avoid an unused-parameter lint/tsc error
- [Phase ?]: missing-pull-step takes (weekGraph, consumedStoredInputs) and is aggregated via a standalone runWeekLint, kept out of runLint's per-recipe signature (D-07)
- [Phase 05-08]: StepBackfill review UI defaults every field to Accept; Save is never blocked by pending decisions - Edit/Reject are explicit reviewer overrides (user-approved at checkpoint)
- [Phase 05-08]: isStepUnbackfilled treats PocketBase un-set defaults (0/empty-string) as needing backfill, not just null - PB never stores null for un-set number/select fields
- [Phase 05-09]: computeActiveSessionSpan uses each instance's Schedule.ends value (not a literal active-only recompute) - required by the fixed genetic.test.ts D-06 fixture, which explicitly asserts the span must not equal sum(active_minutes)
- [Phase 05-09]: crossover/mutation offspring repaired to valid topological order via a deterministic priority-rank walk (no extra PRNG draws), not ad-hoc splice repair
- [Phase 05-live 2026-07-10]: Week-wide prep merge in `buildWeekGraph` — every single-raw-ingredient, resource-none prep step across the plan collapses into one `merged-prep::<productId>` node (summed active, precedence fanned out so each recipe keeps its cut). A safe, deliberate merge distinct from the Pitfall-3 signature-merge (precedence preserved, no resource double-booking). Replaced an abandoned ingredient-dispersion GA fitness experiment (weight-based clustering couldn't beat the makespan objective on real instances).
- [Phase 05-live 2026-07-10]: Cook Mode drives Now/Next AND the new collapsible full-schedule list by decoded start time (clock order), never the GA's internal topological activity list (which lists e.g. post-smoke bbq assembly early). `schedule.order` stays topological only for deterministic retiming (D-01a.3).
- [Phase 05-live 2026-07-10]: `buildWeekGraph` excludes `timing=just_in_time` (day-of assembly/serving) steps and any edge touching them; keeps `batch` and blank-timing. Test fixture default flipped to `batch`.
- [Phase 05-live 2026-07-10]: Steps have a real `instructions` text field separate from `name`; many `name`s duplicate the full instruction. Decision: keep `name` visible in cook mode, defer step-detail-on-click + name-shortening data cleanup to a later phase.
- [Phase 05-live 2026-07-10]: "GA Gauntlet Week" stress-test plan created on PROD (`weekly_plans/q2h4t30cmh0cdm6`, 20 planned meals incl. salad-and-salmon) — 14 cross-recipe edges, veg-stock fan-out 6, chicken-broc-rice fan-in. App defaults to Test DB; switch to Production to view it. Shipped as commits 3b6504b, 36d0400, 1ffc947 on main.

### Pending Todos

- `nas-pocketbase-tailnet` — NAS PocketBase instances join the tailnet; `db-config.ts` switches from LAN IPs to tailnet hostnames. Required before Phase 2 and Phase 6 store/phone use; does not block local development. See `.planning/todos/pending/nas-pocketbase-tailnet.md`.
- `connective-recipe-batch-then-consume` — **PARTIALLY RESOLVED 2026-07-10 (commit 0574b5c):** spurious in-plan pull connectors are now elided in cook mode (`buildWeekGraph`) and skipped in batch prep / product flow (`buildProductFlowGraph`), via a shared detector `aggregation/utils/connective.ts` (inverse of the missing-pull-step linter). STILL OPEN (deferred to Phase 6): contextual naming (producer output hard-codes "…frozen"; belongs with `swap-aware-prep-naming`) and import-time modeling of the batch→consume link (blocked on the unbuilt import pipeline). See `.planning/todos/pending/connective-recipe-batch-then-consume.md`.

### Blockers/Concerns

- ⚠️ [Phase 2→infra] `nas-pocketbase-tailnet` todo still open — SHOP-07 store/phone use over the tailnet is unverified (LAN works; app-side optimistic/retry/pending-indicator complete). Needed before real store use.
- ℹ️ [Phase 5] `swap-aware-prep-naming` todo — prep-step titles + prep-state output node names don't reflect ingredient swaps yet (authored free text). Swap's input/quantity re-derivation IS correct (fixed 9cf9206). Belongs with Phase 5 step-metadata rework.

*(All Phase 2 re-verification blockers resolved — UAT approved 2026-07-06, verification passed 7/7.)*

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260710-jpw | Fix cook-mode Full Schedule reshuffle on first check-off (retimeSchedule over-serialization) + 0-elapsed quirk | 2026-07-10 | b91ac19 | [260710-jpw-fix-cook-mode-full-schedule-reshuffle-on](./quick/260710-jpw-fix-cook-mode-full-schedule-reshuffle-on/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Nutrition | NUTR-01 (nutrition UI over FDC fields) | Future requirement | Milestone v1.1 requirements definition |
| Prep Horizon | PREP-F1 (day-before lead-time scheduling) | Open seed, conditional on Phase 5 | Milestone v1.1 requirements definition |
| Pull Lists | PULL-F1 (pull-list scaling) | Excluded from v1.1 | Milestone v1.1 requirements definition |

## Session Continuity

Last session: 2026-07-10T22:41:52.910Z
gsd-verifier passed all 5 success criteria (`05-VERIFICATION.md`, status:
passed); `phase.complete` advanced ROADMAP/STATE to Phase 6. PROJECT.md evolved
(Phases 3/4/5 features → Validated; scheduler/registry/rotation decisions marked
✓). Also this session (post-Phase-5 fixes, all committed to `main`, NOT yet
pushed/deployed): linter v2 on-demand wiring (PREP-06 close), connective-recipe
pull-connector elision across cook mode + display surfaces, meatballs recipe
graph fixed on PROD (form→cook split), and the cook-mode retime reshuffle bug
(quick task 260710-jpw). Suite green at 194 tests, tsc clean.
Stopped at: Phase 6 UI-SPEC approved
plan. No CONTEXT.md yet, so /gsd-discuss-phase 6 is the recommended entry.
⚠️ 15+ commits are unpushed (origin/main behind); the NAS deploys from GitHub,
so none of this session's work is live on :3000 until pushed + rebuilt.
Resume file: .planning/phases/06-import-pipeline-recipe-lifecycle/06-UI-SPEC.md
