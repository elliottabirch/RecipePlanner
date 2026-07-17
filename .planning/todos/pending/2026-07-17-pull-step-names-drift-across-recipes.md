---
created: 2026-07-17
title: Pull-step names drift across recipes for the same product ("Pull garlic cubes" / "Pull out garlic cubes" / "Pull frozen garlic cube")
area: data
severity: minor
source: 260717-fva — surfaced while fixing the week-graph pull merge + missing-pull-step false positives
files:
  - recipe_steps records for the three recipes pulling `garlic cubes (frozen)` (`h0g9xux0yrg84xg`)
  - recipe-planner/src/lib/scheduler/week-graph.ts (singleInventoryInput / makeMergedPullStep — reads product id, never the step name)
---

## Problem

The same freezer/pantry pull — pulling `garlic cubes (frozen)` (`h0g9xux0yrg84xg`) — is authored
under three drifted names across three recipes:

- `Pull garlic cubes`
- `Pull out garlic cubes`
- `Pull frozen garlic cube`

This is real data-hygiene drift: the same action, described three different ways by whoever
authored each recipe. Worth cleaning up on its own terms.

## Explicitly a RED HERRING for the 260717-fva bugs

Recorded here so a future reader does not mistake this drift for the cause of either bug fixed in
260717-fva:

- **The week-graph pull merge** (Task A, `singleInventoryInput` / `makeMergedPullStep` in
  `week-graph.ts`) keys the merge on the **input product id** (`garlic cubes (frozen)`'s id),
  never on the step name. All three drifted names collapse into the same `merged-pull::<productId>`
  node regardless of what any of them is called.
- **The missing-pull-step exemption** (Task B, `missing-pull-step.ts`) is **structural/type-based**
  — it exempts a sourceless consumption whose input `productType` is `Inventory`. It never reads
  the step name either.

Normalizing these names would have fixed **neither** the duplicate cook-mode cards **nor** the
false-positive lint findings. Do not re-open either bug expecting a name fix to matter.

## What's still user-visible

After 260717-fva's merge, the three recipes' pulls collapse into a single merged card labelled
`Pull garlic cubes (frozen)` (the merged node's own synthetic label, not any of the three authored
names) — so the drift is no longer visible on the merged cook-mode card. It remains visible:

- On **Batch Prep** / product-flow surfaces that show the per-recipe step before any merge.
- On **any single, un-merged pull** of a differently-named product (a pull that appears once in a
  plan still shows its own authored name, drift and all).

## Kin to `swap-aware-prep-naming`

Both this todo and `swap-aware-prep-naming` (Phase 5, see `.planning/STATE.md` Blockers/Concerns)
are authored-free-text naming-consistency issues: `swap-aware-prep-naming` is about prep-step
titles not reflecting ingredient swaps; this one is about the same underlying action being
authored under different free-text names across recipes. Consider addressing together as part of
the Phase 5 step-metadata rework — both need a controlled vocabulary or a normalization pass over
authored step names, not a code-path fix.

## Recommendation

Not urgent — cosmetic, and the merge already hides it on the one surface (cook mode) where it was
most visible. When picked up: normalize the three recipes' pull-step names to one canonical form
("Pull garlic cubes (frozen)" or similar), and consider whether a shared step-authoring convention
(kin to `swap-aware-prep-naming`) should be established so this class of drift stops recurring.
