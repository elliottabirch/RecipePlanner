---
phase: 05-prep-day-engine
plan: 12
subsystem: cook-mode
tags: [typescript, react, mui, scheduler, weights, determinism]

# Dependency graph
requires:
  - phase: 05-prep-day-engine
    provides: "generateSchedule (05-09) with persisted-seed determinism, CookMode.tsx + cook_progress (05-11), scheduler_config collection + SchedulerConfig type (05-01)"
provides:
  - "scheduler-config.ts: loadSchedulerConfig()/saveSchedulerConfig(patch) over the scheduler_config singleton (plain getAll/update, no sync-queue)"
  - "WeightsPanel.tsx: 5 sliders (active leading + default-boosted per D-06) with debounced write-on-release and a full-width 'Regenerate Plan' CTA"
  - "Deterministic in-app regenerate flow in CookMode with a non-destructive checked-off confirmation"
affects: [cook-mode, prep-day-engine, scheduler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scheduler_config is a low-frequency singleton write — deliberately NOT routed through sync-queue.ts (unlike shopping_state/cook_progress); plain debounced update-on-release is sufficient"
    - "Regenerate re-invokes generateSchedule(weekGraph, config) with the persisted seed, so an unchanged re-run is byte-identical (determinism = seed + weights)"
    - "Checked-off regenerate is gated behind a confirm dialog using the accent-green (not error-red) action, preserving cook_progress"

key-files:
  created:
    - recipe-planner/src/lib/scheduler/scheduler-config.ts
    - recipe-planner/src/components/cook-mode/WeightsPanel.tsx
  modified:
    - recipe-planner/src/pages/CookMode.tsx

key-decisions:
  - "scheduler_config write bypasses the sync-queue entirely (D-06 low-frequency singleton) — debounced write-on-release only, never per drag tick (T-05-12a)"
  - "active weight is listed first and defaults higher than the other four sliders, encoding the D-06 primary objective (minimize active time) in the UI itself"
  - "Regenerating over checked-off steps shows the exact copy 'Regenerating will keep your checked-off steps but recalculate remaining timing. Continue?' with an accent-green Regenerate action, and preserves cook_progress; the no-checked-steps path skips the confirmation (T-05-12b)"

patterns-established:
  - "WeightsPanel's full-width contained 'Regenerate Plan' CTA reuses BatchPrepTab's primary-Button treatment"
  - "Same-seed regenerate is the determinism guarantee surfaced to the user — proven by regenerating twice with unchanged weights and getting an identical schedule"

requirements-completed: [PREP-05]

coverage:
  - id: D1
    description: "User can tune 5 scheduler weights in-app; changes persist to the scheduler_config singleton (debounced on release) and are shared across devices"
    requirement: "PREP-05"
    verification:
      - kind: human
        ref: "05-12 Task 3 human-verify: tuned weights, reloaded on another device, weights persisted"
        status: pass
    human_judgment: true
  - id: D2
    description: "Regenerate re-invokes the GA with the persisted seed (deterministic — unchanged re-run is identical); regenerating with checked-off steps warns first with accent (not error) styling and keeps checked steps"
    requirement: "PREP-05"
    verification:
      - kind: human
        ref: "05-12 Task 3 human-verify: regenerated twice unchanged (identical), checked-off confirm dialog copy/styling/behavior confirmed, progress preserved"
        status: pass
    human_judgment: true
  - id: D3
    description: "The active weight leads and defaults higher than the others (D-06 primary objective)"
    requirement: "PREP-05"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit clean; WeightsPanel slider-presence grep (all 5 weights + Regenerate CTA)"
        status: pass
    human_judgment: false

# Metrics
duration: retroactive
completed: 2026-07-10
status: complete
---

# Phase 5 Plan 12: In-App Weights Panel + Deterministic Regenerate Summary

**The GA fitness weights become user-tunable in cook mode (active-led per D-06), persisted to the shared scheduler_config singleton, with a deterministic same-seed "Regenerate Plan" flow that warns non-destructively before recomputing over checked-off steps.**

## Accomplishments
- `scheduler-config.ts`: `loadSchedulerConfig()` / `saveSchedulerConfig(patch)` over the `scheduler_config` singleton — plain `getAll`/`update`, no sync-queue (deliberate, low-frequency write)
- `WeightsPanel.tsx`: 5 MUI Sliders (0–10) for active / chopping / grouping / elapsed / resource_pressure, **active first and default-boosted** (D-06), 48px touch thumbs, debounced write-on-release (no per-tick write, no live regenerate), full-width contained "Regenerate Plan" CTA
- Regenerate flow wired into `CookMode.tsx`: reloads `scheduler_config`, re-invokes `generateSchedule(weekGraph, config)` with the persisted seed (deterministic), and replaces the timeline
- Checked-off confirmation: exact copy `"Regenerating will keep your checked-off steps but recalculate remaining timing. Continue?"` with an **accent-green** (not error-red) Regenerate action, preserving `cook_progress`; no-checked-steps path skips confirmation

## Task Commits
1. **Task 1: scheduler_config load/save helper + WeightsPanel** — `2a524aa` (feat)
2. **Task 2: wire regenerate flow into CookMode with checked-off confirmation** — `15068c0` (feat)
3. **Task 3: human-verify checkpoint** — verified live on the NAS (weights tuning, twice-unchanged determinism, checked-off dialog copy/styling/behavior, cross-device persistence); approved by user 2026-07-10

Interim state commit: `e18613a` (recorded Tasks 1–2 complete, paused at the checkpoint).

## Decisions Made
- `scheduler_config` writes bypass the sync-queue used by `shopping_state`/`cook_progress` — it's a low-frequency singleton, so a debounced plain `update` on release is sufficient and avoids queue overhead (mitigates T-05-12a write-storm).
- The `active` weight is deliberately surfaced **first and default-higher** so the UI itself encodes the D-06 primary objective.
- Regenerate is the **only** recompute trigger (no live preview), and it uses the persisted seed so determinism is user-verifiable by regenerating twice unchanged.

## Deviations from Plan
None functionally — Tasks 1 and 2 implemented as written (tsc clean, both automated greps passed). Task 3 is a blocking human-verify checkpoint that was completed live on the tablet rather than in this session; this SUMMARY is written on approval.

## Issues Encountered
None.

## User Setup Required
None — `scheduler_config` singleton already provisioned in Plan 01's schema.

## Next Phase Readiness
- Phase 5 (Prep-Day Engine) is functionally complete: step metadata + backfill, deterministic seeded GA scheduler with resource model, interactive cook mode, weights panel, and linter v2 are all shipped and live on the NAS.
- Carried forward: step-detail-on-click surfacing the real `instructions` field, and `swap-aware-prep-naming` — deferred to a later phase / Phase 6 step-metadata work.

## Self-Check: PASSED
- FOUND: recipe-planner/src/lib/scheduler/scheduler-config.ts
- FOUND: recipe-planner/src/components/cook-mode/WeightsPanel.tsx
- FOUND commits: 2a524aa, 15068c0
- Human checkpoint: APPROVED (2026-07-10)

---
*Phase: 05-prep-day-engine*
*Completed: 2026-07-10*
