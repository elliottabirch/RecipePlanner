---
created: 2026-07-12
title: Day-of (just_in_time) steps have no surface — cook mode ends silently mid-meal
area: ui
files:
  - recipe-planner/src/lib/scheduler/week-graph.ts:158 (the exclusion — `if (step.timing === Timing.JustInTime) continue;`)
  - recipe-planner/src/lib/scheduler/week-graph.ts:146-153 (header comment stating the intent)
  - recipe-planner/src/lib/scheduler/day-of-work.ts (SHIPPED 2026-07-16, u4p Task 1 — the deliberate complement of the week-graph.ts:158 exclusion)
  - recipe-planner/src/pages/CookMode.tsx:704-720 (the completion Paper — now names remaining day-of work instead of asserting completion)
  - recipe-planner/src/lib/aggregation.ts:106 (buildPullLists — JIT *ingredients*, but not JIT *steps*)
  - recipe-planner/src/components/outputs/PullListsTab.tsx (dark for week 7/13 — see Corrected section)
---

## Corrected 2026-07-16 (u4p)

Verified against live prod 2026-07-16 (probe run for quick task `260716-u4p`).
Corrections to the draft below, none of which change the ship decision (piece 1
fixed, piece 2 stays pending):

1. **Cook mode was not "ending silently" — it was asserting completion.**
   `CookMode.tsx:704-712` renders **"All steps complete! / Every prep-day step
   in this plan has been checked off."** whenever `visibleOrder.length === 0`,
   even with day-of (JIT) work still ahead. An affirmative, incorrect claim is
   a worse failure than silence, and it is what this todo's Problem section
   should have named. **Fixed 2026-07-16 (`260716-u4p` Task 1):** a new pure
   `day-of-work.ts` module (`collectDayOfWork` / `formatDayOfSummary`) —
   the deliberate complement of `week-graph.ts:158`'s exclusion — feeds a
   rewritten completion Paper: "Prep day complete." plus a named list of
   remaining meals and their day-of steps. The original wording survives only
   when genuinely nothing remains.
2. **The step tables below predate an unrecorded prod retag and are stale.**
   Between 2026-07-12 and 2026-07-16, an unrecorded actor retagged
   `Brown mushrooms`, `Simmer bourguignon`, and `Pull garlic cubes` to `batch`
   BY HAND in the RecipeEditor — no commit, no script (`git log --all` over
   `*retag*`/`*timing*` is empty). Mushroom Bourguignon is now **5 batch steps
   shown, 2 JIT steps hidden** (`Cook egg noodles`, `Serve over noodles` —
   correctly JIT), not "3 shown / 5 hidden incl. a 35-min braise." See the
   sibling `mis-tagged-just-in-time-timing-on-make-ahead-steps` todo for the
   full process finding. The line "the step data is CORRECT" is retracted by
   that same sibling todo — it was wrong for 3 of the 5 historically mis-tagged
   steps.
3. **The predicted message text was wrong; the real one names FOUR meals
   (five once `260716-u4p`'s Task 3 split lands).** Computed against live week
   7/13, not guessed: *"4 meals still need day-of cooking: Harissa Cod with
   Chickpeas (1 step), Mushroom Bourguignon (Simple) (2 steps), salad and
   salmon (2 steps), Creamy Tomato Soup (1 step)"* — not the predicted
   "Mushroom Bourguignon (5 steps), Meat Spaghetti (1 step)." Meat Spaghetti
   does not appear yet because `create spaghetti` was retagged `batch`
   wholesale rather than split (see the sibling todo); `260716-u4p` Task 3
   splits it behind a gated write, at which point Meat Spaghetti becomes the
   fifth entry.
4. **File-reference line numbers corrected**: the exclusion is
   `week-graph.ts:158` (not 150-155), the header comment is `:146-153` (not
   144-149).
5. **`PullListsTab` is NOT a substitute entry point for a day-of surface** —
   confirmed dark for week 7/13: `buildPullLists` filters
   `plannedMeals.filter((meal) => meal.day)`, and all 18 meals in week 7/13 are
   week-spanning with no `day` set. It renders nothing and proves nothing
   either way. Piece 2's day-of cook surface below should NOT assume
   `PullListsTab` as its natural entry point until that changes.

**Piece 1 (this file's own "small" fix) is now SHIPPED** — see
`day-of-work.ts` and the `CookMode.tsx` Paper above. **Piece 2 — a day-of
cook surface — is the live remainder and is why this todo stays pending.**

## Problem

The cook-mode list **ran out** while two dinners were still unmade. The last thing
Mushroom Bourguignon said to do was "slice carrots" and "quarter mushrooms" — then the
schedule simply ended. Meat Spaghetti never appeared at all beyond thawing the beef. The cook
was left standing in the kitchen with no idea what to do next.

**Root cause: `just_in_time` steps are excluded from the week graph entirely, and nothing else
in the app shows them.**

`week-graph.ts:158` (line number corrected 2026-07-16 — see Corrected section above), in the node-building pass:

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
because for them the JIT steps are **the entire cook**. Verified against prod (2026-07-12):

> **RETRACTED 2026-07-16 (u4p):** the two tables below are STALE — an unrecorded
> by-hand retag between 2026-07-12 and 2026-07-16 moved `Pull garlic cubes`,
> `Brown mushrooms`, and `Simmer bourguignon` to `batch`. Bourguignon is now 5
> batch / 2 JIT, not 3 batch / 5 JIT. Kept here as the historical record of
> what was verified on 2026-07-12; do not treat as current state.

**Mushroom Bourguignon (Simple)** — 3 batch steps, 5 just_in_time steps (AS OF 2026-07-12, STALE):

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

**Meat Spaghetti** — 1 batch step, 1 just_in_time step (AS OF 2026-07-12, still accurate — `create spaghetti` was retagged `batch` wholesale, not split, until `260716-u4p` Task 3):

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
And cook mode **asserted an affirmative "All steps complete!"** (corrected 2026-07-16 — see
above; it does not merely stop), which is the part that actually stranded the user: even with
perfect data, a claim of completion that isn't true reads as "you're done" when you aren't.

## Solution

Two pieces. **Piece 1 SHIPPED 2026-07-16 (`260716-u4p` Task 1).**

**1. ~~Stop cook mode ending silently~~ Stop cook mode asserting false completion — SHIPPED.**
When the prep-day list is exhausted, cook mode now says so AND says what remains:
*"Prep day complete."* followed by `formatDayOfSummary`'s sentence (e.g. *"4 meals still need
day-of cooking: Harissa Cod with Chickpeas (1 step), Mushroom Bourguignon (Simple) (2 steps),
salad and salmon (2 steps), Creamy Tomato Soup (1 step)"* — the real, computed message; see the
Corrected section above for why the originally-predicted text was wrong), plus a per-meal list
of the remaining step names. See `recipe-planner/src/lib/scheduler/day-of-work.ts`
(`collectDayOfWork` / `formatDayOfSummary`) and the rewritten Paper at `CookMode.tsx:704-720`.
The original "All steps complete!" wording survives only when genuinely nothing remains — it
was never deleted, only gated correctly.

**2. Build a day-of cook surface — STILL PENDING, this is why this todo stays open.** A per-meal
view for the night you eat it: the recipe's JIT steps in dependency order, with instructions,
durations, and resources — the same `NowNextCard` treatment cook mode already gives prep day.
Options:
- Reuse the scheduler: build a **per-meal, day-of graph** from the JIT steps (the same
  `buildWeekGraph` machinery with the filter inverted) and run cook mode against it. Highest
  reuse — readiness chips, countdowns, and check-off all come for free, and the bourguignon's
  35-minute simmer is exactly the passive window the scheduler is good at packing around.
- Or a simpler ordered checklist per meal, if a full day-of scheduler is more than is wanted.

**`PullListsTab` is NOT the natural entry point** (corrected 2026-07-16 — see above): it is dark
for any week where planned meals are week-spanning rather than day-assigned, which is 18/18 in
the live week 7/13. Whichever surface piece 2 becomes, it needs its own entry point — do not
assume `PullListsTab` already provides one.

## Related

- `restore-week-pull-list-on-prep-print-view` — **same exclusion, different symptom.** That todo
  found the batch-prep print view's pull list going empty partly because ingredients consumed
  only by JIT steps vanish from `buildBatchPrepListFromFlow`. Both bugs trace to day-of steps
  being filtered out of the prep-day pipeline with nothing catching what falls through. Worth
  fixing together — the shared question is "where does day-of work live?"
- `checkoff-annihilates-passive-time-in-retime` — the bourguignon's 35-minute simmer is exactly
  the passive window that bug destroys, so a day-of scheduler would inherit it immediately.
