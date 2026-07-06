---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Workflow Redesign
current_phase: 1
current_phase_name: Data Hygiene
status: executing
stopped_at: Completed 01-04-PLAN.md
last_updated: "2026-07-06T07:27:58.179Z"
last_activity: 2026-07-06
last_activity_desc: Phase 1 execution started
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 8
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** The derived weekly outputs — shopping list and prep plan — must be trustworthy and low-friction for the real weekly shop-and-prep cycle.
**Current focus:** Phase 1 — Data Hygiene

## Current Position

Phase: 1 (Data Hygiene) — EXECUTING
Plan: 5 of 8
Status: Ready to execute
Last activity: 2026-07-06 — Phase 1 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 4min | 3 tasks | 6 files |
| Phase 01-data-hygiene P02 | 15min | 2 tasks | 3 files |
| Phase 01 P03 | 24min | 3 tasks | 6 files |
| Phase 01 P04 | 32min | 2 tasks | 9 files |

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

### Pending Todos

- `nas-pocketbase-tailnet` — NAS PocketBase instances join the tailnet; `db-config.ts` switches from LAN IPs to tailnet hostnames. Required before Phase 2 and Phase 6 store/phone use; does not block local development. See `.planning/todos/pending/nas-pocketbase-tailnet.md`.

### Blockers/Concerns

None yet.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Nutrition | NUTR-01 (nutrition UI over FDC fields) | Future requirement | Milestone v1.1 requirements definition |
| Prep Horizon | PREP-F1 (day-before lead-time scheduling) | Open seed, conditional on Phase 5 | Milestone v1.1 requirements definition |
| Pull Lists | PULL-F1 (pull-list scaling) | Excluded from v1.1 | Milestone v1.1 requirements definition |

## Session Continuity

Last session: 2026-07-06T07:27:58.174Z
Stopped at: Completed 01-04-PLAN.md
Resume file: None
