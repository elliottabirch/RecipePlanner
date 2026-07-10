---
phase: 05-prep-day-engine
plan: 11
subsystem: cook-mode
tags: [typescript, react, mui, cook-mode, readiness, persistence]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    provides: "generateSchedule (05-09), retimeSchedule (05-10), buildWeekGraph/week-graph (05-05), resources.ts (05-06), and cook_progress collection + types (05-01)"
provides:
  - "useCookProgress(weeklyPlanId): optimistic per-(weekly_plan, step_instance) progress hook mirroring useShoppingState, reusing sync-queue.ts unmodified"
  - "deriveReadiness(stepInstance, weekGraph, checkedSet): pure AND-semantics readiness helper (waiting/ready + waitingOn[])"
  - "CookMode.tsx interactive tablet page: now/next cards, live passive countdowns, readiness chips, retime-not-reorder check-off, 'Start Cook Mode' launch from Outputs"
affects: [prep-day-engine, cook-mode, check-off-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useCookProgress is a direct structural analog of useShoppingState (Map state, createSyncQueue over writable fields, query-then-branch upsert filtered by weekly_plan + step_instance) — zero new persistence machinery, sync-queue.ts reused verbatim"
    - "Check-off calls retimeSchedule (05-10), never generateSchedule — cards recompute times without ever changing position; no drag/reorder affordance exists in the UI"
    - "readiness.ts is kept pure (no React/PB) so AND-semantics are unit-testable in isolation"

key-files:
  created:
    - recipe-planner/src/hooks/useCookProgress.ts
    - recipe-planner/src/lib/scheduler/readiness.ts
    - recipe-planner/src/lib/scheduler/readiness.test.ts
    - recipe-planner/src/pages/CookMode.tsx
    - recipe-planner/src/components/cook-mode/NowNextCard.tsx
    - recipe-planner/src/components/cook-mode/ReadinessChip.tsx
  modified:
    - recipe-planner/src/pages/Outputs.tsx
    - recipe-planner/src/App.tsx

key-decisions:
  - "Cook mode drives Now/Next and the full-schedule list by decoded start time (clock order), not the GA's internal topological activity list (which lists e.g. post-smoke assembly early); schedule.order stays topological only for deterministic retiming (D-01a.3)"
  - "Steps carry a real `instructions` text field separate from `name`; many names duplicate the full instruction. Kept `name` visible in cook mode; step-detail-on-click + name-shortening data cleanup deferred to a later phase (PREP-04 partial)"

patterns-established:
  - "cook_progress persistence reuses shopping_state's optimistic + sync-queue pattern unchanged, keyed by (weekly_plan, step_instance)"
  - "retime-not-reorder: the only mutation path on check-off is retimeSchedule, keeping card order stable mid-cook"

requirements-completed: [PREP-04]

coverage:
  - id: D1
    description: "deriveReadiness returns 'waiting' listing each un-checked upstream producer and 'ready' only once ALL upstream producers are checked (AND-semantics); a step with no upstream producers is ready at t=0"
    requirement: "PREP-04"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/scheduler/readiness.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tablet cook mode: now/next cards render with scaled quantities, check-off re-times without reordering, passive steps show MM:SS countdown → Ready, assembly readiness flips on upstream completion, and progress survives refresh"
    requirement: "PREP-04"
    verification:
      - kind: human
        ref: "05-11 Task 3 human-verify checkpoint (tablet, live on NAS)"
        status: pass
    human_judgment: true

# Metrics
duration: retroactive
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 11: Interactive Tablet Cook Mode Summary

**The prep-day surface that supersedes the flat BatchPrepTab checklist: now/next cards, live passive countdowns, binary AND-readiness, and order-stable retime-on-check-off, with progress persisted per (weekly_plan, step_instance).**

> **Retroactive summary.** Plan 11 was executed and shipped ad-hoc (committed across `cc86014`, `f5e0af4`, `dd62097`, then refined live) without a SUMMARY written at the time. This document reconciles the GSD audit trail after the fact. The human-verify checkpoint (Task 3) was confirmed live on the NAS as part of the Phase 5 close-out.

## Accomplishments
- `useCookProgress` optimistic hook mirroring `useShoppingState`, keyed by (weekly_plan, step_instance) against `cook_progress`, reusing `sync-queue.ts` unmodified
- Pure `deriveReadiness` helper with AND-semantics (waiting/ready + waitingOn[]) plus co-located passing tests
- `CookMode.tsx` interactive page: now card (accent border + shadow), next card, 48px check-off, live MM:SS passive countdowns, readiness chips, tap-for-detail scaled quantities
- Check-off wired to `retimeSchedule` (never `generateSchedule`) — no reorder affordance exists
- "Start Cook Mode" launch on the Outputs page; CookMode route registered in `App.tsx`; `BatchPrepTab.tsx` retained for its print view

## Task Commits
1. **Failing readiness AND-semantics tests** — `cc86014` (test)
2. **useCookProgress hook + pure readiness helper** — `f5e0af4` (feat)
3. **Interactive tablet cook mode page + Outputs launch** — `dd62097` (feat)

Live refinements shipped after the initial build (folded into this plan's scope):
- `3b6504b` — week-wide prep merge + clock-ordered cook mode
- `36d0400` — exclude just_in_time (day-of) steps from prep-day schedule
- `12ceeb1` / `26dac88` — per-recipe cut breakdown on merged prep cards (stacked by cut header)

## Decisions Made
- Now/Next and the full-schedule list are driven by **decoded start time (clock order)**, not the GA's topological activity list; `schedule.order` stays topological only for deterministic retiming.
- `name` stays visible in cook mode even though many step names duplicate the full `instructions` text; step-detail-on-click + name-shortening cleanup is **deferred** (PREP-04 partial). This is the tracked `swap-aware-prep-naming` / step-detail follow-up.

## Deviations from Plan
- Executed outside the standard GSD execute-plan flow (ad-hoc), so no atomic per-task docs commit or contemporaneous SUMMARY existed until this retroactive reconciliation.
- Scope expanded live beyond the original plan text to add week-wide prep merge and the just-in-time exclusion (both logged as decisions in STATE.md, 2026-07-10).

## Issues Encountered
None blocking. Step-instruction display deferred by decision rather than by defect.

## Next Phase Readiness
- Cook mode is live on the NAS (`http://192.168.50.95:3000`) and is the foundation Plan 12's weights panel + regenerate mounts into.
- Deferred: step-detail-on-click surfacing the real `instructions` field, and swap-aware prep-step naming — both carried to a later phase / Phase 6 step-metadata work.

## Self-Check: PASSED
- FOUND: recipe-planner/src/hooks/useCookProgress.ts
- FOUND: recipe-planner/src/lib/scheduler/readiness.ts
- FOUND: recipe-planner/src/pages/CookMode.tsx
- FOUND commits: cc86014, f5e0af4, dd62097

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10 (summary reconciled retroactively)*
