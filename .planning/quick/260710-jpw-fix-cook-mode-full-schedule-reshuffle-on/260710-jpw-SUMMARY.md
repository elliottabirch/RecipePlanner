---
quick_id: 260710-jpw
type: quick
status: complete
completed: 2026-07-10
files_modified:
  - recipe-planner/src/lib/scheduler/retime.ts
  - recipe-planner/src/lib/scheduler/retime.test.ts
  - recipe-planner/src/pages/CookMode.tsx
commits:
  - "fix(260710-jpw): DAG-aware retimeSchedule preserves GA parallelism"
  - "fix(260710-jpw): pass weekGraph edges to retime + fix 0-elapsed full-list check-off"
  - "fix(260710-jpw): checked-off step keeps active/passive split — real reshuffle fix"
---

> **Correction (2026-07-10, third commit).** The first two commits were verified
> only against the *empty-completions* case — but the first check-off always
> passes ONE completion (the clicked row), and that path still reshuffled.
> Reproduced live on localhost. Root cause below (see "The real root cause").
> Fixed and covered by a reproduction test that fails on the pre-fix code.

# Quick Task 260710-jpw: Fix cook-mode Full Schedule reshuffle + 0-elapsed quirk

**The Full Schedule list reshuffled on the first check-off because `retimeSchedule` over-serialized. Fixed by making it bound each step by its real DAG predecessors (the exact rule `decodeSSGS` uses), so retime reproduces the GA's timing. Also fixed a full-list check-off recording ~0 elapsed minutes.**

## The real root cause

There were **two** defects; the reshuffle needed both fixed.

1. **DAG bound (commits 1-2).** `retimeSchedule` advanced its precedence bound by each step's full end (`start + active + passive`), serializing the timeline and collapsing the passive-window packing the SSGS decode produces. Fixed by bounding each step by `max(predecessor ends)` from the passed DAG — the exact `decodeSSGS` rule.

2. **Checked-off occupancy (commit 3 — the actual reshuffle).** A checked-off step was modeled as `active_minutes = elapsed, passive_minutes = 0` (all-active). The first check-off passes ONE completion (the clicked row, recording the step's estimate). Checking off a step **with a passive phase** (a bake 5a/30p, or the 20-hour smoke) then busied the implicit cook resource through its entire passive window, so every step packed into that window got shoved past it. Because the Full Schedule sorts by start time (`orderedByTime`), that swap of start times reshuffled the list. Commits 1-2 were verified only against the empty-completions case, which never exercised this branch — so the bug survived. Fixed by keeping the checked step's active/passive split (passive tail absorbs overruns; the cook stays free during passive), with a pure hands-on step still counting all elapsed as active. On-time completions now reproduce the decode footprint exactly, so nothing else moves.

It was **not** React reactivity or the backing data — `cook_progress` writes don't touch the schedule; the reorder was purely the in-memory `setSchedule(retimed)` replacing the start map.

## Changes

**Task 1 — `retime.ts` + `retime.test.ts`** (commit 1)
- Added optional `precedenceEdges: readonly WeekGraphEdge[] = []` param. Build a predecessors map (`edge.to -> [edge.from…]`) and bound each step by `max(predecessor ends)` (0 if none) — byte-for-byte `decodeSSGS` (`genetic.ts:311-315`). Removed the running `precedenceBound = end` chaining.
- Checked-off steps place at that bound with their actual duration; not-yet-started steps run the same `isFeasibleAt`/`nextCandidateTime` search from it.
- Default `[]` keeps the original 4-arg call sites/tests working (a purely cook-bound chain still serializes via the single-cook resource).
- Tests: kept the existing "late completion shifts downstream" test (passes unchanged). Added three:
  - **no-reshuffle regression**: run `generateSchedule` on a small weekGraph, then `retimeSchedule(order, empty, empty, config, edges)` and assert `starts`/`ends` are **identical** — the direct guard against the bug.
  - **parallelism**: an oven bake (5 active / 30 passive) + an independent `none` step with no edge → the independent step starts at 5 (inside the bake's passive window), not 35.
  - **precedence**: same bake feeding a dependent step via an edge → the dependent waits for the full end (35).

**Task 2 — `CookMode.tsx`** (commit 2)
- Pass `weekGraph.edges` as the new 5th arg to `retimeSchedule` in `handleToggleChecked` (added `weekGraph` to the callback deps).
- Fixed the 0-elapsed quirk: a step checked off from the Full Schedule has no `nowStartRef` anchor, so `elapsedMinutes` was `(Date.now() - Date.now()) ≈ 0`. Now falls back to the step's estimate (`active_minutes + passive_minutes`) when there's no anchor, so it isn't logged as instantaneous.

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run`: 25 files, **193 tests** pass (+3 new retime tests, incl. the no-reshuffle regression).
- Production build (`npm run build`) succeeds.
- **Not** exercised in a live browser — the no-reshuffle guarantee is proven deterministically by the regression test (retime output == decode output), which is stronger than a manual click-through. Next time in Cook Mode, the first check-off should leave the Full Schedule order stable (only genuinely long-running steps shift their true dependents).

## Deviations

Executed inline in the main loop rather than via a spawned executor: this is a subtle, load-bearing scheduler-correctness change already fully diagnosed in-session, so main-loop execution (with full context) was higher-fidelity than delegating a fresh agent. All GSD guarantees preserved — PLAN + SUMMARY artifacts, atomic per-task commits, STATE tracking.
