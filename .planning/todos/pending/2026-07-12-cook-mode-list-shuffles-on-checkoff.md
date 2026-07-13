---
created: 2026-07-12
title: Cook mode list shuffles when you check off a step
area: ui
files:
  - recipe-planner/src/pages/CookMode.tsx:298-308 (orderedByTime — sorts by schedule.starts)
  - recipe-planner/src/pages/CookMode.tsx:564-600 (handleToggleChecked — retimeSchedule + setSchedule)
  - recipe-planner/src/pages/CookMode.tsx:10-14 (header comment stating the violated invariant)
  - recipe-planner/src/lib/scheduler/retime.ts
---

## Problem

Checking off a step in cook mode visibly **reshuffles the step list**. Cards you already
read jump to new positions, which is exactly the thing the page promises never happens.

This is a *different* bug from the earlier "shuffle" (commit `3665946`, which replaced
positional checkbox keys with `lineId`-derived keys so checked state stopped re-attaching to
the wrong row). Here the checked state is fine — the **rendered order itself** permutes.

**Root cause — the file contradicts its own stated invariant.** `CookMode.tsx:10-14` says:

> Check-off always calls `retimeSchedule` — the fixed activity-list order the GA (or a prior
> retime) decided is never permuted; only the displayed times/countdowns recompute
> (D-01a.3 "order is authoritative, the clock adapts").

That holds for `schedule.order` — `retimeSchedule` genuinely does not permute it. But the
list is **not rendered from `schedule.order`**. It's rendered from `orderedByTime`
(`:298-308`), which re-sorts a copy by start time:

```ts
return [...schedule.order].sort((a, b) => {
  const sa = schedule.starts.get(a.id) ?? 0;
  const sb = schedule.starts.get(b.id) ?? 0;
  return sa - sb || (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
});
```

…and `handleToggleChecked` (`:589-596`) calls `retimeSchedule(...)` → `setSchedule(retimed)`
on **every** check-off. Retime recomputes `starts` from `actualCompletions`, which records
the *measured* elapsed time (or the estimate when the step was never surfaced as "Now").
Any step that ran longer or shorter than its estimate shifts its own and its downstream
steps' start times. As soon as two steps' start times cross, the sort swaps them and the
list jumps.

So the activity-list order is stable, but display order is a function of `starts`, and
`starts` is recomputed on every tap. The invariant the *cook* experiences — "cards don't
move" — is not the invariant the code preserves.

## Solution

Make display order stable across retimes. The clock should adapt; the card sequence should
not.

Preferred: **freeze the display order at schedule-generation time.** Compute the
start-time-sorted order once when a schedule is generated (`performRegenerate` /
`setSchedule(generated)`), hold it in state, and have retime update only the *times* shown
on each card — never the sequence. `orderedByTime` then becomes a stable ordering computed
from the generation-time `starts`, not the live ones.

Cheaper alternative: keep sorting, but sort by the **initial** `starts` snapshot captured
when the schedule was first generated, rather than the current (retimed) `starts`.

Note that `orderedByTime` exists for a real reason (documented at `:290-297`): the GA's
`schedule.order` is topological, so a step like the post-smoke bbq assembly is listed early
even though its clock time is 20h out. Sorting by start time restores the true interleaved
timeline. Do **not** "fix" this by simply rendering `schedule.order` — that would bring back
the topological ordering the sort was added to correct. The fix is to sort **once**, not
never.

`visibleOrder` (`:313-315`) and the Now/Next walk derive from `orderedByTime`, so both
inherit the fix for free.

Add a regression test alongside `src/lib/scheduler/retime.test.ts`: build a schedule, record
the rendered order, apply a retime with an actual-completion that overruns its estimate
enough to cross a neighbor's start time, and assert the rendered order is unchanged while
the displayed times do change.
