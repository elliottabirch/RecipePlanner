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

## CORRECTION (2026-07-12): the data for THESE two recipes is WRONG

An earlier draft of this todo claimed the recipe data was correct and the app was solely at
fault. **That was wrong** — the user pushed back, and they're right. See the sibling todo
`mis-tagged-just-in-time-timing-on-make-ahead-steps` for the data fix.

Per the recipe-import skill's own documented convention:

> **`batch`** — a cook/assembly step done during the Saturday prep-day session (roasting,
> **simmering**, tossing a make-ahead salad). **The normal case for a weekly meal's assembly
> steps.**
> **`just_in_time`** — a step that MUST happen the night you eat: a fresh sear, baking the
> fish, warming tortillas and assembling tacos, dressing a salad kept un-dressed.

"Simmering" is named as the canonical **batch** example. So `Simmer bourguignon`,
`Brown mushrooms`, and `create spaghetti` are **mis-tagged** and belong in the prep-day
schedule. Once retagged, cook mode WILL show them and the immediate stranding goes away for
these two recipes.

## The app defect is still real, just narrower

Retagging fixes these recipes; it does not fix the class. A correctly-JIT step — `assemble
tacos`, `warm pitas`, `Bake cod (day-of)`, `Serve over noodles` — is *still* invisible in every
screen. Cook mode is explicitly the *prep-day* schedule; there is **no day-of schedule
anywhere**. The nearest thing, `buildPullLists` → `PullListsTab` (`aggregation.ts:106`), walks
JIT steps only to list the **ingredients to pull from storage** — never the steps themselves,
their instructions, durations, or order.

So the cook still has no screen telling them how to finish a meal on the night they eat it.
And cook mode **still ends silently**, which is the part that actually stranded the user: even
with perfect data, a prep-day list that just stops reads as "you're done."

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
