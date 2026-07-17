---
created: 2026-07-17
title: Passive windows outlive check-off and have no surface — need a timer bar/list
area: ui
files:
  - recipe-planner/src/lib/scheduler/readiness.ts:29-38 (deriveReadiness — purely `checked`-based, no notion of a running passive window)
  - recipe-planner/src/lib/scheduler/retime.ts:138-149 (the passive-collapse bug — PREREQUISITE, fixed under 260717-25d Task A)
  - recipe-planner/src/pages/CookMode.tsx (NowNextCard / getStatusChip — where a timer surface would live)
---

## Problem

**Check off a step with a timer and the timer disappears.** Check off `Simmer meat sauce`
(1a/15p) and the 15-minute simmer vanishes from the screen — but it is still physically
happening on the stove. The cook has no way to see it, and nothing to track it by.
(User-reported 2026-07-17.)

## Root: check-off is overloaded

For an **active** step, check-off means *done*.
For a step with **passive time**, check-off means *"the active part is done; the timer is
now running."*

These are different events and the app collapses them into one. That single conflation
produces three separate defects:

| Symptom | Where | Status |
|---|---|---|
| Check-off destroys the passive window in the retime math | `retime.ts:138-149` | **RESOLVED 2026-07-17** — `260717-25d` Task 1 |
| Check-off destroys the passive window on screen (no timer) | `CookMode.tsx` | **This todo** |
| Dependents go "ready" on tap, not when the timer elapses | `readiness.ts:29-38` | Spun out to its own todo — **same work as this** |

The `deriveReadiness` passive-aware enhancement (deferred out of the now-resolved
`.planning/todos/resolved/2026-07-12-checkoff-annihilates-passive-time-in-retime.md`, and
filed on its own honestly-titled todo,
`.planning/todos/pending/2026-07-17-readiness-is-blind-to-running-passive-windows.md`) is
the **model**; this todo is the **surface**. They are one feature and should be designed
together, not bolted on separately — whichever is picked up first should re-read the other.

## Ordering — this is why the prerequisite mattered

`260717-25d` Task 1 landed first (2026-07-17). **If retime destroys the passive window,
there is no timer left to display.** Fixing the math is what makes the timer surface
buildable at all.

## Solution sketch (not decided)

A timer bar or list that tracks running passive windows so nothing gets lost just because
its step was checked off — e.g. `Simmer meat sauce — 12:34 remaining`, `Bake cod — 4:10
remaining`. Open questions worth deciding deliberately rather than defaulting:

- **Does check-off need to split into two actions** ("started" vs "done"), or is one tap
  plus an inferred running window enough? One tap is likely right — the cook shouldn't have
  to tell the app twice — but the state model needs to represent both.
- **What does the chip say** for a step whose timer is running vs. genuinely complete?
  Touches `getStatusChip` / `deriveReadiness`.
- **Does a dependent become ready when the timer elapses**, and how is that noticed without
  polling? This is the `deriveReadiness` half.
- Where does the bar live so it is glanceable at a stove — persistent header? Bottom bar?
- Does it need an alarm/notification when a window elapses, or is passive display enough?

## Related

- `.planning/todos/resolved/2026-07-12-checkoff-annihilates-passive-time-in-retime.md`
  (RESOLVED 2026-07-17) — the math half, now fixed. Its deferred `deriveReadiness` piece
  lives on at `.planning/todos/pending/2026-07-17-readiness-is-blind-to-running-passive-windows.md`,
  which is really this feature's model layer.
- `.planning/todos/resolved/2026-07-12-cook-mode-list-shuffles-on-checkoff.md`
  (RESOLVED 2026-07-17) — same check-off code path (`handleToggleChecked`), different
  defect, also fixed by `260717-25d`.
- The `create spaghetti` split (applied 2026-07-17) added a 1a/15p `Simmer meat sauce`, so
  there is now one more passive window a cook can lose track of.
