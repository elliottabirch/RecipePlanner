---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Workflow Redesign
current_phase: 2
current_phase_name: Shopping State & Live Substitution
status: executing
stopped_at: Completed 02-05-PLAN.md
last_updated: "2026-07-06T21:41:01.878Z"
last_activity: 2026-07-06
last_activity_desc: Completed 02-02-PLAN.md
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 18
  completed_plans: 13
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** The derived weekly outputs — shopping list and prep plan — must be trustworthy and low-friction for the real weekly shop-and-prep cycle.
**Current focus:** Phase 2 — Shopping State & Live Substitution

## Current Position

Phase: 2 (Shopping State & Live Substitution) — EXECUTING
Plan: 6 of 10
Status: Ready to execute
Last activity: 2026-07-06 — Completed 02-02-PLAN.md

Progress: [██████░░░░] 56%

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 8 | - | - |

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

### Pending Todos

- `nas-pocketbase-tailnet` — NAS PocketBase instances join the tailnet; `db-config.ts` switches from LAN IPs to tailnet hostnames. Required before Phase 2 and Phase 6 store/phone use; does not block local development. See `.planning/todos/pending/nas-pocketbase-tailnet.md`.

### Blockers/Concerns

yet.

- REQUIREMENTS.md marks SHOP-01 fully Complete after 02-01, but SHOP-01's acceptance criterion (checkbox state persists across refresh/device switch) isn't realized until the shopping_state collection + useShoppingState hook land in 02-05/02-06 — 02-01 only built the lineId identity precondition. Re-verify SHOP-01 at full Phase 2 completion, not before.
- REQUIREMENTS.md marks SHOP-03 fully Complete after 02-02, but SHOP-03's acceptance criterion (user can swap a product mid-shop via a dialog, with all outputs re-derived) isn't realized until the swap dialog UI and the `Outputs.tsx` override-map builder land in 02-07/02-08 — 02-02 only built the pure re-derivation threading (`VariantOverride.quantity/unit` + inherit-when-null in `applyVariantOverrides`). Re-verify SHOP-03 at full Phase 2 completion, not before.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Nutrition | NUTR-01 (nutrition UI over FDC fields) | Future requirement | Milestone v1.1 requirements definition |
| Prep Horizon | PREP-F1 (day-before lead-time scheduling) | Open seed, conditional on Phase 5 | Milestone v1.1 requirements definition |
| Pull Lists | PULL-F1 (pull-list scaling) | Excluded from v1.1 | Milestone v1.1 requirements definition |

## Session Continuity

Last session: 2026-07-06T21:41:01.872Z
Stopped at: Completed 02-05-PLAN.md
Resume file: None
