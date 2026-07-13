---
created: 2026-07-12
title: Day-of (just_in_time) steps have no surface — cook mode ends silently mid-meal
area: ui
files:
  - recipe-planner/src/lib/scheduler/week-graph.ts:150-155 (the exclusion — `if (step.timing === Timing.JustInTime) continue;`)
  - recipe-planner/src/lib/scheduler/week-graph.ts:144-149 (header comment stating the intent)
  - recipe-planner/src/pages/CookMode.tsx:298-315 (orderedByTime / visibleOrder — the list that ends)
  - recipe-planner/src/lib/aggregation.ts:106 (buildPullLists — JIT *ingredients*, but not JIT *steps*)
  - recipe-planner/src/components/outputs/PullListsTab.tsx
---

## Problem

The cook-mode list **ran out** while two dinners were still unmade. The last thing
Mushroom Bourguignon said to do was "slice carrots" and "quarter mushrooms" — then the
schedule simply ended. Meat Spaghetti never appeared at all beyond thawing the beef. The cook
was left standing in the kitchen with no idea what to do next.

**Root cause: `just_in_time` steps are excluded from the week graph entirely, and nothing else
in the app shows them.**

`week-graph.ts:150-155`, in the node-building pass:

```ts
for (const step of recipeData.steps) {
  if (step.timing === Timing.JustInTime) continue;   // <-- never becomes a node
  ...
}
```

The header states the intent plainly: JIT steps "are day-of assembly/serving (plate the bowls,
build the sandwich) and have no place in a prep-day schedule." Cook mode schedules over the
week graph, so a step that isn't a node **cannot ever be surfaced**.

That reasoning is sound for *plating* — but it is catastrophically wrong for these two recipes,
because for them the JIT steps are **the entire cook**. Verified against prod:

**Mushroom Bourguignon (Simple)** — 3 batch steps, 5 just_in_time steps:

| Step | timing | in cook mode? |
|---|---|---|
| Quarter mushrooms | `batch` | ✅ shown |
| Dice onion | `batch` | ✅ shown |
| Slice carrots | `batch` | ✅ shown |
| Pull garlic cubes | `just_in_time` | ❌ invisible |
| Brown mushrooms (12 min, stovetop) | `just_in_time` | ❌ invisible |
| Simmer bourguignon (8a/35p, stovetop) | `just_in_time` | ❌ invisible |
| Cook egg noodles (2a/8p) | `just_in_time` | ❌ invisible |
| Serve over noodles | `just_in_time` | ❌ invisible |

**Meat Spaghetti** — 1 batch step, 1 just_in_time step:

| Step | timing | in cook mode? |
|---|---|---|
| take ground beef out of freezer | `batch` | ✅ shown |
| **create spaghetti** (8a/15p, the whole dish) | `just_in_time` | ❌ invisible |

So cook mode showed three knife tasks and a freezer pull, then declared itself done — while
~70 minutes of actual cooking, including a 35-minute braise, existed only in the database.

## The data is probably RIGHT. The app is missing a surface.

Worth being clear about this, because the tempting "fix" is to re-tag these steps as `batch`
and that would be wrong. Browning mushrooms and simmering a bourguignon genuinely *are* day-of
work — you chop on prep day and cook the braise the night you eat it. The `batch` / `just_in_time`
split is modeling reality correctly.

The defect is that **`just_in_time` has no home**. Cook mode is explicitly the *prep-day*
schedule. There is no *day-of* schedule anywhere. The nearest thing, `buildPullLists` →
`PullListsTab` (`aggregation.ts:106`), walks JIT steps only to list the **ingredients to pull
from storage** — it never surfaces the steps themselves, their instructions, durations, or
order. The cooking instructions for a JIT meal are unreachable from any screen.

## Solution

Two pieces, and the first is small enough to ship on its own.

**1. Stop cook mode ending silently (do this first — it's the actual harm).** When the prep-day
list is exhausted, say so, and say what remains: *"Prep day complete. 2 meals still need day-of
cooking: Mushroom Bourguignon (5 steps), Meat Spaghetti (1 step)."* Right now the list just
stops, which reads as "you're finished." Anything is better than that. The data is trivially
available — the JIT steps are sitting in `recipeData.steps`, they're just filtered out at
`week-graph.ts:151`.

**2. Build a day-of cook surface.** A per-meal view for the night you eat it: the recipe's JIT
steps in dependency order, with instructions, durations, and resources — the same
`NowNextCard` treatment cook mode already gives prep day. Options:
- Reuse the scheduler: build a **per-meal, day-of graph** from the JIT steps (the same
  `buildWeekGraph` machinery with the filter inverted) and run cook mode against it. Highest
  reuse — readiness chips, countdowns, and check-off all come for free, and the bourguignon's
  35-minute simmer is exactly the passive window the scheduler is good at packing around.
- Or a simpler ordered checklist per meal, if a full day-of scheduler is more than is wanted.

Either way, `PullListsTab` is the natural entry point — it already knows which meals have JIT
steps and which day they land on.

## Related

- `restore-week-pull-list-on-prep-print-view` — **same exclusion, different symptom.** That todo
  found the batch-prep print view's pull list going empty partly because ingredients consumed
  only by JIT steps vanish from `buildBatchPrepListFromFlow`. Both bugs trace to day-of steps
  being filtered out of the prep-day pipeline with nothing catching what falls through. Worth
  fixing together — the shared question is "where does day-of work live?"
- `checkoff-annihilates-passive-time-in-retime` — the bourguignon's 35-minute simmer is exactly
  the passive window that bug destroys, so a day-of scheduler would inherit it immediately.
