---
phase: 02-shopping-state-live-substitution
plan: 04
subsystem: sync
tags: [vitest, tdd, pure-functions, retry, backoff, fake-timers]

# Dependency graph
requires: []
provides:
  - "sync-queue.ts — createSyncQueue(), SyncQueue<T>, SyncQueueCounts, CreateSyncQueueOptions<T>"
affects: [02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, React-free/PocketBase-free modules under src/lib/ for logic that must be unit-testable in Vitest's node environment"
    - "Injectable scheduleRetry option defaulting to global setTimeout — compatible with vi.useFakeTimers() without a bespoke clock abstraction"

key-files:
  created:
    - recipe-planner/src/lib/sync-queue.ts
    - recipe-planner/src/lib/sync-queue.test.ts
  modified: []

key-decisions:
  - "maxAttempts semantics: number of retries allowed AFTER the initial attempt fails (matches 02-RESEARCH's useShoppingState code-example condition attempt < 3, not a total-invocation count) — total invocations for a payload that never succeeds = maxAttempts + 1"
  - "failedKeys.delete(key) happens at enqueue time (optimistically), not only after a retry confirms success — a fresh enqueue on a previously-exhausted key immediately reflects as pending again, matching the SyncIndicator's Saving/retry-exhausted/Synced state model where pending and failed are independent counts"
  - "Avoided vi.waitFor in the two timing-sensitive tests (exponential backoff delays, retry-exhaustion sequencing) — vi.waitFor advances fake timers internally via its own polling when fake timers are active, which corrupted exact-delay assertions; replaced with deterministic vi.advanceTimersByTimeAsync sequencing"

requirements-completed: [SHOP-07]

coverage:
  - id: D1
    description: "enqueue() coalesces by key: the newest payload replaces a pending one while a prior write for that key is in flight; process() is never double-invoked concurrently for the same key"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#coalesces by key"
        status: pass
    human_judgment: false
  - id: D2
    description: "A successful process() decrements pending and fires onChange with updated counts"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#decrements pending and fires onChange when process resolves"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failing write retries with exponential backoff (baseDelayMs * 2 ** attempt): 1s, then 2s for the default maxAttempts=3/baseDelayMs=1000 case"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#retries a failing write with exponential backoff"
        status: pass
    human_judgment: false
  - id: D4
    description: "After maxAttempts rejections, the key moves to failed (retry-exhausted) rather than being silently dropped; no further retries are scheduled"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#moves a key to failed"
        status: pass
    human_judgment: false
  - id: D5
    description: "A subsequent successful retry after earlier failure clears the key from failed"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#clears a key from failed once a subsequent retry succeeds"
        status: pass
    human_judgment: false
  - id: D6
    description: "maxAttempts/baseDelayMs are constructor options, tunable per instance (not hardcoded), per D-13 planner discretion"
    requirement: "SHOP-07"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/sync-queue.test.ts#supports independent maxAttempts/baseDelayMs per instance"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-06
status: complete
---

# Phase 2 Plan 4: createSyncQueue Sync Queue Primitive Summary

**A dependency-free, React-free `createSyncQueue()` primitive that coalesces writes by key, retries failures with capped exponential backoff, and surfaces `pending`/`failed` counts via getters — the SHOP-07 core `useShoppingState` (02-06) will wire to PocketBase.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-06T20:59:00Z
- **Completed:** 2026-07-06T21:17:00Z
- **Tasks:** 1
- **Files modified:** 2 (both new)

## Accomplishments
- `sync-queue.ts`: `createSyncQueue({ process, maxAttempts=3, baseDelayMs=1000, onChange, scheduleRetry })` returns `{ enqueue, pending, failed }`. Coalesces by key via a `Map<string, {payload, attempt}>` plus an `inFlight` guard `Set` so `process()` is never invoked concurrently for the same key. Exponential backoff (`baseDelayMs * 2 ** attempt`) is capped at `maxAttempts` retries after the initial attempt; retry-exhausted keys move into a `failed` `Set` (never silently dropped). A fresh `enqueue()` on a previously-failed key clears it from `failed` and restarts the attempt cycle.
- `pending`/`failed` are exposed as getters (recomputed from live `Map`/`Set` sizes on every access) rather than snapshotted values, so a consuming hook always reads current counts without needing to resubscribe.
- Timers are injectable via `scheduleRetry` (defaults to global `setTimeout`), which is transparently compatible with `vi.useFakeTimers()` since fake timers replace the global the default delegates to — no bespoke clock abstraction needed for deterministic tests.
- Verified React-free and PocketBase-free (no such imports); passes `tsc -b` clean and the full existing test suite (90 tests, 9 files after this plan) alongside the 6 new tests.

## Task Commits

Task followed the RED → GREEN TDD cycle:

1. **Task 1: createSyncQueue** - `835e89e` (test: 6 failing tests against a throwing stub), `5e6f723` (feat: full implementation + a test-timing determinism fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/sync-queue.ts` - `SyncQueueCounts`, `CreateSyncQueueOptions<T>`, `SyncQueue<T>`, `createSyncQueue<T>()`
- `recipe-planner/src/lib/sync-queue.test.ts` - 6 tests: coalescing under an in-flight write, pending/onChange on success, exponential backoff timing, retry-exhaustion→failed, recovery-clears-failed, per-instance maxAttempts/baseDelayMs tunability

## Decisions Made
- **maxAttempts semantics:** interpreted as the number of retries allowed *after* the initial attempt fails — mirroring 02-RESEARCH's `useShoppingState` code example (`if (attempt < 3) { schedule retry }`), where `attempt` starts at 0 for the initial call and the condition gates 3 additional retries (4 total invocations) before giving up. This matches the research's cited "3 attempts (1s/2s/4s)" backoff shape (three retry delays, not three total calls).
- **failedKeys cleared at enqueue time, not only on success:** a fresh `enqueue()` for a key currently in `failed` immediately removes it from `failed` and re-adds it to the pending set, even before the retry resolves. This keeps `pending`/`failed` simple, independent counts (both can theoretically be nonzero only transiently, never for the same key) and matches the `SyncIndicator` state model where "Saving" (pending>0) should show as soon as a retry is queued, not only once it succeeds.
- **Avoided `vi.waitFor` for timing-sensitive assertions:** discovered mid-implementation that `vi.waitFor` internally calls `vi.advanceTimersByTimeAsync` in its polling loop when fake timers are active, which advanced the fake clock further than the test intended and caused a false failure (backoff test saw 3 calls when only 2 were expected at a checkpoint). Fixed by using explicit `vi.advanceTimersByTimeAsync(ms)` sequencing with direct assertions instead, for the two tests that assert exact call counts at exact elapsed times.

## Deviations from Plan

None — plan executed exactly as written, including the tdd="true" RED→GREEN protocol (task action bundled test+implementation instructions; executed as a separate failing-test commit against a throwing stub, then a full-implementation commit).

## Issues Encountered
- **[Rule 1 - Bug, caught pre-commit] `vi.waitFor` + fake timers timing corruption:** described above under Decisions Made. Caught during the GREEN-phase verification run (one of six tests failed with an off-by-one call count) before any commit was made; fixed by rewriting the two timing-precise tests to avoid `vi.waitFor` and bundled into the GREEN commit rather than committing broken timing assertions.

## User Setup Required

None — no external service configuration required. Pure client-side logic with no new dependencies (per 02-RESEARCH Package Legitimacy Audit — no new packages this phase).

## Next Phase Readiness
- `createSyncQueue` is ready for 02-06 (`useShoppingState` hook) to wire its `process` callback to a PocketBase upsert (query-then-branch per 02-RESEARCH Pitfall 5) and read `pending`/`failed` to drive `SyncIndicator.tsx`'s Saving/retry-exhausted/Synced states.
- No blockers for downstream plans in this phase.

---
*Phase: 02-shopping-state-live-substitution*
*Completed: 2026-07-06*

## Self-Check: PASSED

Both created files verified present on disk (`recipe-planner/src/lib/sync-queue.ts`, `recipe-planner/src/lib/sync-queue.test.ts`); both task commits (835e89e, 5e6f723) verified present in git log.
