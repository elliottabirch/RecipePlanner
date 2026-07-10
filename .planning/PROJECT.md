# RecipePlanner

## What This Is

A self-hosted household meal-planning app (React + PocketBase on the home NAS) that represents recipes as flow graphs — product and step nodes wired into dependency DAGs — and derives everything downstream from them: weekly plans, shopping lists grouped by store/section, batch-prep instructions, pull lists, and meal-container assignments. Built for a single household's weekly shop-and-batch-prep cycle, used on a tablet in the store and kitchen.

## Core Value

The derived weekly outputs — shopping list and prep plan — must be trustworthy and low-friction for the real weekly shop-and-prep cycle. If the graph says it, the list must be right.

## Requirements

### Validated

<!-- Inferred from the shipped, working codebase (pre-GSD v1.0). -->

- ✓ Graph-based recipe editor (ReactFlow) persisting normalized product/step/edge records — v1.0
- ✓ Weekly plans with planned meals (recipe + slot + day + quantity) — v1.0
- ✓ Per-meal variant overrides substituting ingredients without editing the recipe — v1.0
- ✓ Aggregated outputs: shopping list, pull lists, batch-prep list, meal containers, ready-to-eat inventory — v1.0
- ✓ Registry management: products, stores, sections, container types, tags — v1.0
- ✓ Production/test database switching (localStorage-backed) — v1.0
- ✓ Print stylesheets for outputs — v1.0 (kept for batch prep only going forward)
- ✓ Unit-disciplined data layer: unit enum + `units.ts` conversion, canonical unit + dimension per product, convert-or-split aggregation with stable lineId, product dedup + case-insensitive `(name, type)` unique index, linter v1 — v1.1 Phase 1
- ✓ Durable shopping state: per-plan persisted checkboxes across all six Outputs tabs (content-derived stable keys), have-N with remaining-to-buy, mid-shop swap (pre-filled qty/unit + inline quick-create) with full downstream re-derivation, confirm-first make-at-home (gated on source_recipe), buy/make/skip resolution, optimistic sync + pending indicator, tablet touch pass — v1.1 Phase 2
- ✓ Product registry seeded from USDA Foundation Foods (~500-item curated catalog) with fuzzy search and "Search USDA" mode persisting fdc_id — v1.1 Phase 3
- ✓ Weekly planning memory: plan start dates, people-multiplier scaling, tag-based slot templates, guided-fill wizard with staples-first pre-fill + LRU ordering — v1.1 Phase 4
- ✓ Prep-day engine: step metadata + AI-assisted backfill (185 steps), seeded GA scheduler with resource model, interactive tablet cook mode (now/next, retime-on-check-off, readiness, countdowns), weights panel + deterministic regenerate, on-demand linter v2 — v1.1 Phase 5 (verified 5/5)

### Active

<!-- Milestone v1.1 Workflow Redesign. Detail in REQUIREMENTS.md. -->

- [ ] Import pipeline & lifecycle: draft/published recipes, in-app JSON import, recipe-import skill rewrite, /suggest-recipes, recipe-evolution note loop

### Out of Scope

- Cross-dimension unit conversion / density model — linter flags mismatches at authoring time instead; no density data wanted
- Offline-first sync architecture — tailnet + optimistic updates with retry covers the store use case (single user, no realtime)
- Per-person portion model / recipe yield engine — a single people-multiplier per plan is all the household needs
- Structured post-cook ratings — weekly ritual not wanted; one-tap notes replace it
- Confirm-cooked tracking — rotation freshness uses planning history (planned = cooked)
- Nutrition UI — schema designed for it (FDC IDs, nullable fields), building it deferred
- Multi-user auth/realtime — self-hosted, trusted network, single household

## Context

- Stack: React 19 + TypeScript + Vite + MUI 7, PocketBase backend, deployed as static build on the OMV NAS (192.168.50.95); prod + test PocketBase instances. Codebase map in `.planning/codebase/`.
- Authoritative decision record for this milestone: `plans/workflow-redesign.md` (2026-07-05 discussion). Elaborated in `.planning/phase-docs/` (overview + 6 phase docs).
- Confirmed bugs driving Phase 1: unit-blind quantity summing (`product-builder.ts`, `step-builder.ts`), overloaded `recipe_product_nodes.unit` (doubles as container-type name), no unique constraint on `products.name`, in-memory-only shopping checkboxes, and a spec/code divergence on step aggregation (signature-based behavior is kept; docs reconcile).
- Infra prereq (todo `nas-pocketbase-tailnet`): NAS PocketBase instances join the tailnet and `db-config.ts` switches from LAN IPs to tailnet hostnames — required for store/phone use in Phases 2 and 6; does not block local development.
- Shared one-shot task: DONE in Phase 1 (Plan 08) — schema exports consolidated to a single canonical `pb_schema.json` (22 collections incl. `meal_variant_overrides`, `recipe_queue`, and the `idx_products_name_type_ci` unique index); `pb_schema_updated.json` deleted. Later phases verify against `pb_schema.json`.

## Constraints

- **Tech stack**: Stay within React/TS/MUI + PocketBase — no new infra services; single-household self-hosted deployment
- **Data safety**: Schema/content changes must survive the prod/test split; destructive migrations (dedup, unit normalization) are one-shot and reviewed
- **Devices**: Tablet-first for shopping and cook mode; phone-friendly for quick-create and import capture; print kept only for batch prep
- **Determinism**: Prep-day scheduler must be deterministic given seed + weights

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Convert-or-split by dimension in aggregation; no density model | Within-dimension conversion is safe; cross-dimension guesses are not — lint instead | ✓ Phase 1 (revisit pending: user wants single purchase-unit lines — deferred to Phase 3, see todo) |
| Preparation states are transient nodes, not products | One raw product per ingredient; prep vocab lives on steps; enforced by lint | ✓ Phase 1 (linter rule live) |
| Seed registry from USDA FDC Foundation Foods (~800 concept-level items) | Concept-level names without branded purveyor noise; FDC IDs enable nutrition later | ✓ Phase 3 (shipped as a ~500-item hand-curated catalog, 96% fdc_id join coverage) |
| Tailnet connectivity, not local-first sync | NAS PB reachable from the store via phone hotspot; optimistic updates suffice for single user | — Pending |
| Tag-based rotation pools + guided-fill wizard, staples as first slot | New recipes join pools by tagging; no separate staples machinery | ✓ Phase 4 |
| Seeded genetic-algorithm scheduler, primary objective = minimize active time | Deterministic, tunable via weights panel; consolidation-friendly | ✓ Phase 5 (SSGS decode + active-session-span fitness; retime-on-check-off preserves parallelism) |
| Imports land in prod as drafts; test DB for schema/code only | Kills the test→prod content-migration ritual and the PC requirement | — Pending |
| Step aggregation merges by input/output product-ID signature (code behavior kept) | Reconcile docs to code rather than change working behavior | ✓ Phase 1 (decisions.md reconciled) |
| Persist all six Outputs tabs via content-derived stable keys (not array-position keys) | Positional keys silently mis-attach checks when make-it reorders lists — a correctness hazard, not a benign reset | ✓ Phase 2 (four inline tab call sites reworked) |
| Resolved lines (make/skip/have-complete) shown dimmed on-screen but excluded from export | Screen = full picture with state; export = actionable buy list only | ✓ Phase 2 |
| Mid-shop swap keeps the swapped node wired to downstream prep steps (edge re-pointing) | A raw-ingredient swap must re-derive prep/pull inputs, not sever them; the old override logic only fit made-component→store-bought swaps | ✓ Phase 2 (fixed in UAT, commit 9cf9206) |
| Swap/quick-create units bind to the Phase-1 unit enum, not free text | Phase 1 shipped `units.ts` + `products.canonical_unit`, so the phase doc's interim free-text plan was superseded | ✓ Phase 2 |
| Prep-step titles + prep-state output names reflecting a swap deferred to Phase 5 | Authored free-text naming is a recipe-graph modeling concern that belongs with the prep-day step-metadata rework (PREP-01) | — Deferred (todo: swap-aware-prep-naming) |

## Current Milestone: v1.1 Workflow Redesign

**Goal:** Fix the four root-cause workflow defects — no unit discipline in the data layer, metadata-free steps, a memoryless weekly plan, and a self-inflicted import ritual — across six phases.

**Target features:**
- Phase 1 — Data Hygiene: unit enum + canonical units, convert-or-split aggregation fix, dedup + unique index, linter v1
- Phase 2 — Shopping State & Live Substitution: persisted list state, have-N, mid-shop swap, make-at-home, quick-create, tablet pass
- Phase 3 — Product Registry Seeding: USDA Foundation Foods seed, fuzzy search, "Search USDA" mode
- Phase 4 — Weekly Planning Memory: plan dates, people-multiplier, slot templates, guided-fill wizard
- Phase 5 — Prep-Day Engine: step metadata + backfill, GA scheduler, interactive cook mode, linter v2
- Phase 6 — Import Pipeline & Recipe Lifecycle: draft/published, in-app JSON import, skill rewrite, /suggest-recipes, evolution loop

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-10 after Phase 5 (Prep-Day Engine) completed and verified (5/5 success criteria) — step metadata + backfill, seeded GA scheduler with resource model, interactive cook mode, weights panel + deterministic regenerate, and on-demand linter v2 shipped and live on the NAS. Phases 3 (registry seed) and 4 (planning memory) also reconciled to Validated. Next: Phase 6 (Import Pipeline & Recipe Lifecycle).*
