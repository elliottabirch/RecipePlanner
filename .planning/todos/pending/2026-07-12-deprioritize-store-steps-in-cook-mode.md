---
created: 2026-07-12
title: Deprioritize or hide store steps in cook mode
area: ui
files:
  - recipe-planner/src/lib/scheduler/genetic.ts:427-452 (fitness — no term for store steps)
  - recipe-planner/src/lib/scheduler/genetic.ts:340-375 (computeActiveSessionSpan)
  - recipe-planner/src/pages/CookMode.tsx:298-315 (orderedByTime / visibleOrder)
  - recipe-planner/src/lib/types.ts:110-113 (StepType — only Prep | Assembly)
  - recipe-planner/src/pages/RecipeEditor.tsx:89-96 (PREP_ACTION_OPTIONS — no "store")
---

## Problem

Cook mode opens with a run of **"store" steps** — put the chicken in the freezer, put the
herbs in the fridge, and so on. They're clustered at the *start* of the list, which is the
worst possible place: they do nothing to get the long-pole recipes moving, and they burn the
cook's attention at the exact moment the smoker/oven should be getting loaded.

They should be pushed to the **end**, or slotted into moments when nothing else is happening
(passive windows). The user's own read: *"We could probably just hide them all together, to
be honest."*

**Why the scheduler front-loads them.** Two structural reasons:

1. **Nothing pulls them later.** A store step whose input is a *purchased raw* product has no
   upstream dependency, so it's eligible at t=0 and the SSGS decoder places eligible steps as
   early as it can. It's short and uses `resource: "none"`, so it doesn't collide with
   anything and nothing pushes back.
2. **Nothing in the fitness function objects.** `fitness()` (`genetic.ts:432`) is a weighted
   sum of active span, elapsed span, chopping-adjacency breaks, meal-grouping breaks, and
   resource pressure. **None of these penalize doing a zero-value step first.** A store step
   contributes no resource pressure (`computeResourcePressure` skips `resource === "none"`)
   and doesn't change the makespan meaningfully, so the GA is close to *indifferent* about
   where it lands — and indifference means it stays wherever the seed order dropped it.

## The blocker to solve first: store steps aren't identifiable

There is **no first-class marker for a store step**. `StepType` is only
`Prep | Assembly` (`types.ts:110-113`), and `PREP_ACTION_OPTIONS` is
`sliced | diced | minced | chopped | grated | shredded` (`RecipeEditor.tsx:89`) — no
`store`. Today a "store step" is just a step a human *named* "Store …". Nothing in the
schema knows that.

So any fix starts here. Options, cheapest first:

- **Infer structurally** — a step whose output is a `Stored` product and whose
  `active_minutes` is trivial. No migration, but fuzzy.
- **Add `prep_action: "store"`** — a small, additive change; backfillable via the existing
  `StepBackfill.tsx` page and `scripts/export-steps-for-backfill.mjs`. Note `prep_action` is
  currently *also* the chopping-adjacency key in `fitness()`, so adding a value to it has a
  (probably harmless, worth checking) side effect on the `chopping` term.
- **Add `StepType.Store`** — cleanest semantically, but touches the linter rules, the
  aggregation split (`buildBatchPrepListFromFlow` filters on `StepType`), the import
  contract (`validate-import.ts`), and `BatchPrepPrintView`'s Prep/Assembly split. Bigger blast
  radius.

## Solution

Once store steps are identifiable, pick a lever:

- **Hide (simplest, and what the user leaned toward):** filter them out of `visibleOrder` /
  the Now-Next walk in `CookMode.tsx:313-315`. They'd still exist in the graph and on the
  batch-prep print view; they just stop competing for the cook's attention. Consider a
  "show store steps" toggle rather than deleting them outright — putting things away is real
  work, it just isn't *scheduled* work.
- **Deprioritize:** add a fitness term that penalizes scheduling a store step before any
  unstarted long-pole (high `passive_minutes`) step — i.e. make the GA prefer "load the
  smoker, then put the groceries away." This is the more correct fix and directly serves the
  user's "…or at times when we aren't doing anything else": store steps are ideal filler for
  passive windows, since they need the cook but no resource.
- Weights live in `scheduler_config` and are user-tunable, so a new term should be
  zeroable like the other four (`genetic.ts:427-452`).

Prefer hiding first — it's a few lines and immediately fixes the felt problem — and treat the
fitness term as the follow-up once store steps have a real marker.
