---
quick_id: 260717-fva
type: quick
status: complete
completed: 2026-07-17
files_modified:
  - recipe-planner/src/lib/scheduler/week-graph.ts
  - recipe-planner/src/lib/scheduler/week-graph.test.ts
  - recipe-planner/src/lib/linter/rules/missing-pull-step.ts
  - recipe-planner/src/lib/linter/rules/missing-pull-step.test.ts
  - recipe-planner/src/lib/linter/rules/collect-stored-inputs.test.ts
  - .planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md
  - .planning/STATE.md
commits:
  - "53f8d3e fix(260717-fva): extend week-wide merge to single-inventory pulls"
  - "ddee263 fix(260717-fva): exempt sourceless INVENTORY consumptions from missing-pull-step"
  - "514a96b docs(260717-fva): file pull-name-drift todo, record quick task in STATE.md"
---

# Quick Task 260717-fva: Merge duplicate pull cards + fix missing-pull-step false positives Summary

**Extended the week-wide merge to inventory pulls (own `Pull {product}` label, never `Prep`) and exempted sourceless INVENTORY consumptions from missing-pull-step — pure code, no prod write, no deploy.**

## Status: COMPLETE

All 3 tasks done. 340/340 tests green (337 existing + 3 new), `npx tsc --noEmit` clean, `npm run build` succeeds. Every new behavioral test verified RED against the unfixed code before committing (stash-checked).

## 1. The merge blocker was a single type check

`singleRawInput` (`week-graph.ts:104` pre-fix line 86) gates on `ProductType.Raw` — the week-wide merge (already cross-recipe: it merges "Prep onion" across recipes) simply never considered inventory pulls. Three recipes each pulling `garlic cubes (frozen)` showed three duplicate cook-mode cards.

Task A added a **parallel** path, `singleInventoryInput`, mirroring `singleRawInput` exactly but matching only `ProductType.Inventory` — the two functions are disjoint by type, so a step can never be a candidate for both merges. The merged node is built by a new `makeMergedPullStep`, which deliberately does **not** reuse `makeMergedPrepStep` (that function hardcodes `StepType.Prep` and a `Prep {product}` name — reusing it would have rendered a freezer pull as "Prep garlic cubes (frozen)"). The merged node's label is `Pull {productName}`.

Merge candidacy is gated on `!producedProductIds.has(productId)` — the same `producedProductIds` set pass 3b (spurious-in-plan-pull elision) already computes, and the inverse of 3b's own gate — so the pull merge and 3b are provably disjoint, not disjoint by luck. The raw-prep path (`singleRawInput`, `mergeableInfo`, `makeMergedPrepStep`, the `ProductType.Raw` check) is untouched; its own tests are unmodified and still green.

**Tests** (`week-graph.test.ts`, 4 new): the merge collapses three drifted-name garlic pulls (`Pull garlic cubes` / `Pull out garlic cubes` / `Pull frozen garlic cube`) into one `merged-pull::<productId>` node with every consumer's edge fanned out; the merged node is labelled `Pull `, never `Prep`; it survives pass 3b; a lone pull is left un-merged (mirrors the raw one-occurrence case).

**RED-checked:** stashed `week-graph.ts` only, kept the test file — 3 of the 4 new tests failed (merged-pull node absent, as expected); the 4th (single-pull-untouched) correctly stayed green both ways since it's asserting a no-op. Restored the fix, confirmed all 13 tests in the file green.

## 2. The coupling was smaller and different than first framed — measured

The plan's own `planning_findings #5` predicted this, and it held exactly: Task A did **not** hand Task B a still-flagged merged node. `collectStoredInputConsumptions` gates every consumption on the week-graph's node-id set — after Task A merges the three garlic pulls, their three original ids leave the graph (dropped by the gate) and the synthetic `merged-pull::…` id is never emitted as a consumption at all (it's not a `${mealId}::${stepId}`).

**Task A alone cleared the three garlic false positives.** Verified directly by running the real `buildWeekGraph` + `collectStoredInputConsumptions` over the live plan (see section 4 below): after Task A's commit, zero garlic findings remained, with no Task B code present yet.

Task B was needed for the OTHER single, un-merged leaf pulls — confirmed live: 9 remaining, none of them garlic.

## 3. Task B is type-based, not name-based

`StoredInputConsumption` now carries `productType` (threaded from `inputProduct.type`, already in hand at the collector — no new fetch). `lintMissingPullStep` exempts a sourceless consumption whose `productType === ProductType.Inventory` — legit prior-week/pantry stock that is never "made" in-plan by design. A sourceless `ProductType.Stored` consumption is **not** exempt — a this-week fridge item nothing in the plan produces is a genuine missing make-step, and stays flagged (the rule's teeth, pinned by a new synthetic unit test since no live example exists in this plan — see below).

Did not touch `connective.ts`'s `isSpuriousInPlanPull` — read it first as instructed; it answers the inverse question (input **IS** produced in-plan → elide as a redundant connector), not this one (input is **not** produced in-plan → the consumer's sourcelessness is expected, not a miss). Keeping the two predicates as siblings rather than merging them keeps each rule's contract legible on its own.

**Live-verified result (read-only replay of `CookMode.tsx:592-600`'s exact sequence against plan `71ukhycp2v4s0fw`, no writes):**

- Before Task B (Task A already committed): **9** `missing-pull-step` findings remained (not 12 — the 3 garlic findings were already gone via Task A, confirming section 2 above). `merged-pull::h0g9xux0yrg84xg` ("Pull garlic cubes (frozen)") present with 3 members.
- All 9 remaining findings had `productType=inventory`:
  - 3× on the same "pull out egg bites" step (egg cup veggie, spinach egg bites, egg cup meat)
  - "pull out meatbals" → meatballs frozen
  - "pull out carnitas" → pork shoulder (carnitas)
  - "pull out brocolli patties" → broccoli patties
  - "pull out salmon" → salmon frozen
  - "take ground beef out of freezer" → ground beef frozen
  - **"Cook spaghetti"** → spaghetti noodles dry
- After Task B: all 9 are exempt (all inventory-typed) — **0 remaining `missing-pull-step` findings** on this plan.

**A genuine divergence from the plan's own framing, worth flagging explicitly.** The plan's success criteria said "`Cook spaghetti`/`spaghetti noodles dry` (a cook step, not a leaf pull) may legitimately remain flagged" and explicitly warned: if that consumer's input turned out to be `Stored`, don't weaken the rule to silence it. **Measured, its input is `Inventory`, not `Stored`** — so the STORED-input conditional the plan set up for that case doesn't apply; the type-based fix correctly exempts it via the same mechanism as every other pantry pull, with no rule-weakening needed. This is consistent with the domain reasoning (`spaghetti noodles dry` is a shelf-stable pantry box, consumed directly by the cook step with no intermediate "pull" step — unlike the frozen items, which do have an explicit pull) but it does mean the plan's own "genuine miss vs. mis-typed data" fork was never exercised live: **no sourceless `Stored` consumption exists anywhere in plan `71ukhycp2v4s0fw` today**, so the rule's teeth are pinned only by the new synthetic unit test (`missing-pull-step.test.ts`'s "STILL flags a sourceless STORED consumption" case), not by a live example. Not a data-typing bug — `spaghetti noodles dry` being inventory is correct — but noting it since the plan asked to report honestly rather than claim the expected split matched reality when it didn't.

**Interface-change ripple:** `collect-stored-inputs.test.ts`'s two exact-object `toEqual` assertions (the "lists each stored/inventory input" and "dedupes repeat consumptions" tests) went red purely on the new `productType` field — updated to include it, per the plan's own prediction. Not new coverage, an existing-test fix for the shape change.

**Composition test** (`missing-pull-step.test.ts`): runs the real `buildWeekGraph` over the three-garlic-pull synthetic plan and asserts exactly one `merged-pull` node **and** zero garlic findings from `runWeekLint` — with a comment noting garlic is cleared by Task A's merge + gate, not Task B's predicate, so a future regression in either mechanism surfaces here.

**RED-checked:** stashed `missing-pull-step.ts` only, kept all three test files — the exemption test failed (finding present when it should be absent), and both `collect-stored-inputs.test.ts` assertions failed on the missing `productType` field, exactly as expected. The teeth test and composition test correctly stayed green both ways (proving they're not vacuous). Restored the fix, confirmed all 6 tests across both files green.

## 4. The pull-step name drift is a RED HERRING, and the plan says so

Filed `.planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md`: the three recipes' garlic pulls are authored under drifted names (`Pull garlic cubes` / `Pull out garlic cubes` / `Pull frozen garlic cube`). The todo states explicitly that this is a red herring for both 260717-fva bugs — the merge keys on input product id, the exemption is type-based, neither reads the step name — and cross-references the kin todo `swap-aware-prep-naming`.

## 5. Every new test fails against the unfixed code

Confirmed for both Task A and Task B via `git stash push --keep-index -- <source-file>` (keeping test-file edits, reverting only the fix), re-running the affected test files, and observing the expected failures before `git stash pop` restored the fix. Documented per-task above.

## 6. Pure code, no prod write, no deploy, no checkpoint

The live plan `71ukhycp2v4s0fw` was read only, via a temporary read-only `tsx` script (deleted before this commit, never committed) replaying `CookMode.tsx:592-600`'s exact `buildWeekGraph` → `collectStoredInputConsumptions` → `runWeekLint` sequence against `PB_URL=http://192.168.50.95:8090` (default prod) with `getFullList`/`getOne` reads only. No `create`/`update`/`delete` calls anywhere in this session.

## Deviations from Plan

**1. [Genuine finding divergence, not a code deviation] Cook spaghetti's input is Inventory, not the STORED case the plan set up to reason about.** See section 3 above — the plan's own success criteria anticipated needing to weigh "genuine miss vs. mis-typed data" for a possible STORED consumer among the 12; measured, that branch never triggers because `spaghetti noodles dry` is already `Inventory`. No code change was needed or made because of this; flagging it because the plan explicitly asked to report when reality diverges from its own framing rather than silently proceed as if the expectation held.

No other deviations. Both tasks landed exactly as planned: Task A first (parallel merge path, own label, disjoint from 3b), Task B tested against Task A's real `buildWeekGraph` output (composition test), Task C filing the red-herring todo and updating STATE.md without touching the u4p blocker or any other pending todo.

## Known Stubs

None. No hardcoded empty/placeholder values were introduced.

## Threat Flags

None. Pure scheduling/linting logic changes; no new network endpoints, auth paths, or schema changes at a trust boundary. No prod write of any kind — the live plan was read-only, via a temporary uncommitted script.

## Self-Check: PASSED

All 5 source files confirmed present on disk (`week-graph.ts`, `week-graph.test.ts`, `missing-pull-step.ts`, `missing-pull-step.test.ts`, `collect-stored-inputs.test.ts`), plus the new todo and updated STATE.md. All 3 commit hashes (`53f8d3e`, `ddee263`, `514a96b`) confirmed present in `git log --oneline`. `npx tsc --noEmit` clean, `npx vitest run` (340/340), and `npm run build` all re-confirmed green after the final commit. `git status --short` confirms `import-drafts/`, `recipe-planner/add-notes-tmp.mjs`, and the pre-existing `.planning/config.json` diff were never staged or committed by this task.
