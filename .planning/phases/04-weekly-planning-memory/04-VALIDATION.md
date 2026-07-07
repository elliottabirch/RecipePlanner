---
phase: 4
slug: weekly-planning-memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`environment: "node"`, `include: ["src/**/*.test.ts", "scripts/**/*.test.js"]`) |
| **Config file** | `recipe-planner/vitest.config.ts` |
| **Quick run command** | `npm run test -- <changed-file-pattern>` (e.g. `src/lib/planning/history.test.ts`) |
| **Full suite command** | `npm run test` (= `vitest run`) |
| **Estimated runtime** | ~10–30 seconds (node-only suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- <changed-file-pattern>`
- **After every plan wave:** Run `npm run test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green; wizard UI flows verified manually (no component-test harness — project-wide convention, not a gap this phase introduces)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; rows below map each requirement to its automated verification. Planner/nyquist-auditor refine into task-level rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | WEEK-01 | — | N/A | unit (pure backfill parser) | `npm run test -- scripts/backfill-plan-dates.test.js` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-01 | — | N/A | manual (admin-UI/app load vs live DB; script dry-run report) | manual | — | ⬜ pending |
| TBD | — | — | WEEK-02 | — | N/A | unit (multiplier scaling; multiplier=1 no-regression AC#8) | `npm run test -- src/lib/aggregation` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-02 / D-03 | — | N/A | unit (buildPullLists honors quantity×multiplier; pull-list correctness regression AC#7) | `npm run test -- src/lib/aggregation` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-02 / D-04 | — | N/A | unit (`scaleQuantity()` discrete-ceil / continuous-exact split) | `npm run test -- src/lib/units` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-03 | — | N/A | unit (pool-resolution helper: recipe_tags ∩ pool_tags) + manual (PB admin CRUD) | `npm run test -- src/lib/planning` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-04 | — | N/A | unit (`history.ts` LRU + deterministic tie-break AC#6) | `npm run test -- src/lib/planning/history.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | WEEK-04 | — | N/A | manual (wizard walkthrough — no jsdom harness this phase) | manual/UAT | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/planning/history.test.ts` — WEEK-04 LRU ordering + deterministic tie-break (AC#6)
- [ ] Extend `src/lib/aggregation/aggregation-lineid.test.ts` (or new `src/lib/aggregation.test.ts`) — WEEK-02 multiplier scaling + D-03 pull-list regression (AC#7, AC#8)
- [ ] `scripts/backfill-plan-dates.test.js` — WEEK-01 "Week of …" parse + fallback-Monday logic, extracted as a pure resolver function (pattern: `scripts/seed-usda.test.js`)
- [ ] `src/lib/units` test addition — D-04 `scaleQuantity()` discrete/continuous split
- [ ] No framework install needed — Vitest already configured project-wide

*Note: no component-test framework exists for `WeekWizard.tsx` — a pre-existing project-wide gap (vitest scoped to `node`, no jsdom). Wizard UI verification is manual/UAT this phase, consistent with `WeeklyPlans.tsx`/`Outputs.tsx`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing plans load with backfilled `start_date`; new plan stores/shows date | WEEK-01 | Requires live PocketBase read on both instances | Run backfill (dry-run first), confirm every plan non-null, load app, create a dated plan |
| Week template + slots CRUD; tagging a recipe makes it pool-eligible | WEEK-03 | No in-app editor (D-01); CRUD is via PB admin UI | Create template + slots in admin UI both instances; tag a recipe; confirm it appears in the slot's pool in the wizard |
| Wizard blank-start, staples pre-fill + one-tap confirm, LRU pool order, skippable, correct meal_slot/day | WEEK-04 | No jsdom/component harness this phase | Run wizard on an empty week; confirm staples mirror last week, pools list LRU-first, partial slots write fewer meals, day-specific slot yields non-empty pull list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
