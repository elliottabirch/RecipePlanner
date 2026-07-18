---
created: 2026-07-17
title: "[RESOLVED 2026-07-17] deriveReadiness is blind to a running passive window — a dependent reads \"ready\" the instant its predecessor is checked off, not when its simmer/bake actually finishes"
area: general
severity: minor
source: deferred from 2026-07-12-checkoff-annihilates-passive-time-in-retime.md (spun out honestly by 260717-25d Task 3, not forgotten)
files:
  - recipe-planner/src/lib/scheduler/readiness.ts:29-38 (deriveReadiness — purely `checked`-based AND over upstream producers)
  - recipe-planner/src/pages/CookMode.tsx:342-356 (getCountdown — already computes the exact remaining passive minutes this todo needs)
  - recipe-planner/src/pages/CookMode.tsx:358-386 (getStatusChip — where the chip text/state would change)
  - recipe-planner/src/lib/scheduler/readiness.test.ts
---

## Resolved — 2026-07-17 (260717-pwr)

Built as the model layer of the passive-window feature, alongside its surface
sibling (`passive-windows-outlive-checkoff-need-a-surface`).

- `deriveReadiness` takes an optional 4th param `runningPassiveSet` — the ids of
  checked-off producers whose passive window is still counting down. A producer
  in that set no longer satisfies its dependents. Default-empty, so every prior
  caller/test keeps its pre-passive behaviour (4 new tests pin the passive path).
- `ReadinessResult` now splits blockers into `waitingOn` (unchecked) vs
  `simmering` (checked but running), so `getStatusChip` can render
  `MM:SS left on <producer>` instead of a bare "waiting on: …" or a premature
  "ready". CookMode derives the set from `getCountdown` against the live wall
  clock and threads it (plus a remaining-time label map) into the chip.
- The load-bearing signal noted below (frozen list order → chip is the ONLY
  startability cue) is now correct: a dependent stays "waiting" until the simmer
  actually elapses (or the cook taps ✓ to finish it early).

Commit cdc14c6 (+ early-finish b23899d). 344/344 tests green, deployed + verified.

## Problem

`deriveReadiness` (`readiness.ts:29-38`) is purely `checked`-based (AND-semantics over
upstream producers): a dependent assembly step flags "ready" the instant every upstream
producer is checked off, with no notion of whether a producer's **passive** phase (its
simmer, its bake) is actually still running. Check off `Simmer bourguignon` the moment the
pot goes on the stove and its dependent immediately reads "Ready" — with 43 minutes of real
simmering still ahead.

`getCountdown` (`CookMode.tsx:342-356`) already computes exactly the remaining passive time
for a step's own card. Readiness should consult it so a dependent reads something like
"waiting — 43:12 left on the simmer" instead of "ready" until the timer actually elapses.

## Why this was deferred, not forgotten

Recorded here so the call is not quietly overturned later:

- It changes what a status chip **means** — a semantics change, i.e. a **feature**, not a
  correctness bug. It touches `readiness.ts`, `getStatusChip` (`CookMode.tsx:358-386`), and
  `readiness.test.ts`.
- Bundling it into `260717-25d` would have muddied a 2-line, provably-behaviour-identical
  correctness fix (the `retime.ts` passive-collapse fix) with a UI/UX design decision that
  needs its own evidence and its own test coverage.

## How 260717-25d moved this in BOTH directions — say both, not just one

- **Less acute.** With the passive-collapse fix landed, the schedule itself now keeps the
  simmer (it no longer collapses to 8 minutes), so the Now/Next walk no longer surfaces the
  dependent early — the cook is not physically sent to the wrong station. The blindness no
  longer *misroutes* the cook; it now shows up only as a wrong chip label.
- **More important.** The cook-mode display order is now **frozen** (`260717-25d` Task 2),
  and the explicit rationale for freezing it (see the resolved
  `2026-07-12-cook-mode-list-shuffles-on-checkoff.md`) is that **readiness chips, not list
  order, are what tell the cook whether a step is actually startable** — the list no longer
  rearranges itself to say "not yet." That rationale now leans on the chip being right. A
  chip that reads "ready" with 43 minutes left on the simmer is the ONE remaining
  load-bearing signal for startability — and it is the one still blind to a running passive
  window.

## Related

- Same code path this was originally filed under:
  `.planning/todos/resolved/2026-07-12-checkoff-annihilates-passive-time-in-retime.md`
  (RESOLVED 2026-07-17) — that todo's math fix is what makes this todo's own passive-time
  numbers trustworthy to consult in the first place.
- `.planning/todos/pending/2026-07-17-passive-windows-outlive-checkoff-need-a-surface.md` —
  a broader, user-reported sibling filed the same day: a running passive window has no
  on-screen timer surface at all once its step is checked off. That todo's own table already
  names this exact readiness gap as "same work as this" (its third symptom row) and proposes
  designing the timer surface and the readiness fix together rather than separately. Treat
  these two todos as one feature to design, not two independent fixes — whichever is picked
  up first should re-read the other before scoping.
