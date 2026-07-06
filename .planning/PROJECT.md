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

### Active

<!-- Milestone v1.1 Workflow Redesign. Detail in REQUIREMENTS.md. -->

- [ ] Unit-disciplined data layer: unit enum, canonical unit + dimension per product, convert-or-split aggregation, product dedup + unique names, linter v1
- [ ] Durable shopping state: persisted checkboxes, have-N, mid-shop swap flow, make-at-home, quick-create, tablet touch pass
- [ ] Product registry seeded from USDA Foundation Foods (~800 items) with fuzzy search and "Search USDA" mode
- [ ] Weekly planning memory: plan start dates, people-multiplier, tag-based slot templates, guided-fill wizard with staples-first + LRU ordering
- [ ] Prep-day engine: step metadata + AI-assisted backfill, seeded GA scheduler with resource model, interactive cook mode, weights panel, linter v2
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
- Shared one-shot task: `pb_schema_updated.json` re-export is stale (missing `meal_variant_overrides`, `recipe_queue`); Phase 1 owns it, later phases verify.

## Constraints

- **Tech stack**: Stay within React/TS/MUI + PocketBase — no new infra services; single-household self-hosted deployment
- **Data safety**: Schema/content changes must survive the prod/test split; destructive migrations (dedup, unit normalization) are one-shot and reviewed
- **Devices**: Tablet-first for shopping and cook mode; phone-friendly for quick-create and import capture; print kept only for batch prep
- **Determinism**: Prep-day scheduler must be deterministic given seed + weights

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Convert-or-split by dimension in aggregation; no density model | Within-dimension conversion is safe; cross-dimension guesses are not — lint instead | — Pending |
| Preparation states are transient nodes, not products | One raw product per ingredient; prep vocab lives on steps; enforced by lint | — Pending |
| Seed registry from USDA FDC Foundation Foods (~800 concept-level items) | Concept-level names without branded purveyor noise; FDC IDs enable nutrition later | — Pending |
| Tailnet connectivity, not local-first sync | NAS PB reachable from the store via phone hotspot; optimistic updates suffice for single user | — Pending |
| Tag-based rotation pools + guided-fill wizard, staples as first slot | New recipes join pools by tagging; no separate staples machinery | — Pending |
| Seeded genetic-algorithm scheduler, primary objective = minimize active time | Deterministic, tunable via weights panel; consolidation-friendly | — Pending |
| Imports land in prod as drafts; test DB for schema/code only | Kills the test→prod content-migration ritual and the PC requirement | — Pending |
| Step aggregation merges by input/output product-ID signature (code behavior kept) | Reconcile docs to code rather than change working behavior | — Pending |

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
*Last updated: 2026-07-05 after starting milestone v1.1 (GSD bootstrap from workflow-redesign decision record)*
