---
phase: 5
slug: prep-day-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `05-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 (already configured project-wide) |
| **Config file** | `recipe-planner/vitest.config.ts` (node env; `src/**/*.test.ts` + `scripts/**/*.test.js`) |
| **Quick run command** | `cd recipe-planner && npx vitest run src/lib/scheduler` |
| **Full suite command** | `cd recipe-planner && npm test` |
| **Estimated runtime** | ~5–20 seconds (pure-function unit suite) |

---

## Sampling Rate

- **After every task commit:** Run the scoped quick command for the touched module
  (e.g. `npx vitest run src/lib/scheduler/genetic.test.ts` after touching `genetic.ts`).
- **After every plan wave:** Run `cd recipe-planner && npm test` (full suite).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~20 seconds.

---

## Per-Task Verification Map

*Task IDs are assigned by the planner; this maps requirements → automated proof. GA
determinism, resource-constraint satisfaction, and week-graph construction are all
property-testable pure functions (the phase's high-value Nyquist coverage).*

| Req | Behavior | Test Type | Automated Command | File | Status |
|-----|----------|-----------|-------------------|------|--------|
| PREP-01 | New `recipe_steps` fields round-trip via API | integration/manual | manual against `:8091` (no PB-integration harness in-repo per TESTING.md) | ❌ manual UAT | ⬜ pending |
| PREP-01 | Edit Step dialog persists 4 new fields | manual/UAT | N/A (no component-test stack installed) | ❌ manual UAT | ⬜ pending |
| PREP-02 | Backfill review writes only approved values, idempotent on re-run | unit (pure diff/apply) | `npx vitest run src/pages/StepBackfill` (factor diff logic out of the React page) | ❌ W0 | ⬜ pending |
| PREP-03 | Fixed `(seed, weights, plan)` → byte-identical schedule twice | unit (determinism) | `npx vitest run src/lib/scheduler/genetic.test.ts -t determinism` | ❌ W0 | ⬜ pending |
| PREP-03 | No DAG-precedence or resource-constraint violation in GA output | unit (invariant) | `npx vitest run src/lib/scheduler/genetic.test.ts -t "no violations"` | ❌ W0 | ⬜ pending |
| PREP-03 | Oven temp-conflict, rack-slot, burner, singleton-appliance, and implicit-cook capacities respected | unit | `npx vitest run src/lib/scheduler/resources.test.ts` | ❌ W0 | ⬜ pending |
| PREP-03 | Week-graph: cross-recipe shared-stock edge; producer-absent → source node | unit | `npx vitest run src/lib/scheduler/week-graph.test.ts` | ❌ W0 | ⬜ pending |
| PREP-04 | Check-off re-times remaining timeline WITHOUT reordering (D-01a.3) | unit (retime) | `npx vitest run src/lib/scheduler/retime.test.ts` | ❌ W0 | ⬜ pending |
| PREP-04 | Readiness flips "waiting on: X" → ready once upstream checked | unit (pure derivation) | `npx vitest run src/lib/scheduler` | ❌ W0 | ⬜ pending |
| PREP-04 | Cook-mode progress persists across refresh | integration/manual | manual against `:8091` (matches Phase-2 SHOP-01 precedent) | ❌ manual UAT | ⬜ pending |
| PREP-05 | Slider change + regenerate changes schedule deterministically | unit | reuses `genetic.test.ts` with two weight vectors | ❌ W0 | ⬜ pending |
| PREP-06 | Linter v2 flags exactly the 3 new rule violations (missing-pull-step at **week scope** per D-07) | unit | `npx vitest run src/lib/linter/linter.test.ts` (extend existing suite) | ⚠️ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `recipe-planner/src/lib/scheduler/week-graph.test.ts` — PREP-03 (week-graph edge cases; per-instance nodes, cross-recipe edges, producer-absent, fan-in AND-semantics)
- [ ] `recipe-planner/src/lib/scheduler/resources.test.ts` — PREP-03 (resource feasibility incl. implicit cook resource + oven temp-conflict)
- [ ] `recipe-planner/src/lib/scheduler/genetic.test.ts` — PREP-03/05 (determinism regression + no-violation invariant + **active-session-span** objective per D-06 + weight-change regression)
- [ ] `recipe-planner/src/lib/scheduler/retime.test.ts` — PREP-04 (check-off recompute, order-preserving)
- [ ] `recipe-planner/src/lib/linter/` — PREP-06 (extend `linter.test.ts`; missing-pull-step at week scope)
- [ ] Framework install: **none** — Vitest already configured; add `*.test.ts` files following the existing co-location convention.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| New step fields round-trip through PocketBase | PREP-01 | No live-PB integration harness in-repo (TESTING.md convention = pure-function units only) | Edit a step in the editor against `:8091`, reload, confirm the 4 fields persist and render on the node |
| Cook-mode progress survives refresh | PREP-04 | Same — PB persistence is manual/UAT per Phase-2 precedent | Check off steps in cook mode, refresh the tablet, confirm state restored |
| Backfill review UX (draft-vs-current per recipe batch) | PREP-02 | React page interaction | Run backfill against test DB, review one recipe, approve, confirm writes; re-run touches nothing already filled |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new scheduler/linter test files)
- [ ] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
