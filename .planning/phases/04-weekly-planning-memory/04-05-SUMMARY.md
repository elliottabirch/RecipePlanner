---
phase: 04-weekly-planning-memory
plan: 05
subsystem: data-migration
tags: [pocketbase, backfill, node-script, pure-functions, data-hygiene]

# Dependency graph
requires:
  - phase: 04-weekly-planning-memory
    provides: "04-01 authored the RED backfill-plan-dates.test.js contract; 04-02 created weekly_plans.start_date (nullable) on both instances"
provides:
  - "scripts/backfill-plan-dates.js with a pure, unit-tested resolvePlanDate resolver + dry-run/backup safety"
  - "Every weekly_plans record on both instances now has a non-null start_date (WEEK-01 backfill half)"
  - "pb_schema.json mirror flips start_date to required:true (live enforcement pending user re-import)"
affects: [04-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure resolver + thin PB wiring (seed-usda.js precedent); --dry-run report-only; pb.backups.create() before mutation"

requirements-completed: [WEEK-01]
---

# 04-05: Backfill weekly_plans start_date

## What was built
- `scripts/backfill-plan-dates.js` — pure `resolvePlanDate` (parses `"Week of <Month> <Day>, <Year>"` → Monday; else assigns descending Mondays by `created` order, tie-break id asc), dry-run mode, and a `pb.backups.create()` snapshot before any write. Flips the Wave-0 `backfill-plan-dates.test.js` scaffold GREEN (5/5).
- Backfill **applied to both instances** (test :8091 then prod :8090) after user review of the dry-run.

## Live data outcome
- Each instance had exactly **one** previously-undated `weekly_plans` record (`899xv1y31283wt1`, name `"6/22"`).
- Per user decision ("Honor June 22"), that record's `start_date` was set to **`2026-06-22`** (a Monday) on **both** instances rather than the algorithmic fallback (`2026-07-06`).
- Verified live: both instances return `start_date = 2026-06-22 00:00:00.000Z` for the record; no null `start_date` remains.

## Tighten-to-required
- `pb_schema.json` mirror updated to `weekly_plans.start_date.required = true` (commit `ff61ee3`).
- **Pending user action:** re-import `pb_schema.json` on both instances to enforce `required` on the live collections (chosen path). Live collections currently still show `required=false` — this is a data-integrity tightening only; every record is already dated, so functionality is unaffected until re-import.

## Deviation
- Plan executed across three sessions split by a human-action checkpoint (dry-run review → apply approval). The apply + date-correction landed via a continuation that was interrupted before writing this SUMMARY; state reconciled against git + live DB reads before closing out. The live `required` flip was intentionally deferred to a user re-import (user's chosen path) rather than an API PATCH.

## Verification
- `npm run test -- scripts/backfill-plan-dates.test.js` → 5/5 green (full suite green modulo the wizard/UI plans not yet built).
- Live reads confirm both records dated `2026-06-22` on prod + test.

## Commits
- `ef1ef63` feat(04-05): backfill-plan-dates.js pure resolver + safety scaffolding
- `ff61ee3` feat(04-05): tighten weekly_plans.start_date to required in schema mirror
