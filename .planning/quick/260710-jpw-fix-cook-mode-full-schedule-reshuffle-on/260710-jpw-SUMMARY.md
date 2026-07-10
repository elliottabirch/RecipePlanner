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
---

# Quick Task 260710-jpw: Fix cook-mode Full Schedule reshuffle + 0-elapsed quirk

**The Full Schedule list reshuffled on the first check-off because `retimeSchedule` over-serialized. Fixed by making it bound each step by its real DAG predecessors (the exact rule `decodeSSGS` uses), so retime reproduces the GA's timing. Also fixed a full-list check-off recording ~0 elapsed minutes.**

## Root cause

`retimeSchedule` advanced its precedence bound by each step's **full end** (`start + active + passive`) after every step. That serialized the whole timeline, collapsing the parallelism `generateSchedule` (SSGS decode) produces by packing active work into other steps' passive windows (the cook is free during passive time — `resources.ts`). Because CookMode's Full Schedule sorts by start time (`orderedByTime`), the first check-off swapped the GA's interleaved starts for retime's serialized ones and the list snapped from interleaved clock order to topological order. It only happened once because subsequent retimes reproduced the same serial timing.

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
