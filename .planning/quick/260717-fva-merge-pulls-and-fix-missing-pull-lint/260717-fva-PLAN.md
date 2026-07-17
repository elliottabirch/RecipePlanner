---
quick_id: 260717-fva
type: quick
description: Two coupled cook-mode defects around freezer/pantry pull steps. (A) buildWeekGraph's week-wide prep merge only considers single-RAW-input steps, so three per-recipe "Pull garlic cubes" inventory-pull steps never collapse — cook mode shows three duplicate pull cards. Extend the merge to single-INVENTORY-input pulls (keyed by input product id, own label, parallel to the raw path). (B) missing-pull-step flags every legit freezer/pantry pull as a missing pull (12 false positives), because a prior-week-stock inventory input is legitimately sourceless in-plan — exempt sourceless INVENTORY consumptions while keeping STORED misses flagged. Pure code, no prod write, no checkpoint.
autonomous: true
files_modified:
  - recipe-planner/src/lib/scheduler/week-graph.ts
  - recipe-planner/src/lib/scheduler/week-graph.test.ts
  - recipe-planner/src/lib/linter/rules/missing-pull-step.ts
  - recipe-planner/src/lib/linter/rules/missing-pull-step.test.ts
  - recipe-planner/src/lib/linter/rules/collect-stored-inputs.test.ts
  - .planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md
  - .planning/STATE.md
must_haves:
  truths:
    - "Cook mode shows ONE 'Pull garlic cubes' card, not three — `buildWeekGraph` collapses the three per-recipe inventory-pull steps (all consuming input product `garlic cubes (frozen)` `h0g9xux0yrg84xg`, a prior-week-stock inventory item) into a single `merged-pull::<productId>` node, and each of the three recipes' downstream garlic consumers still has a precedence path to that one node"
    - "The pull merge keys on the INPUT PRODUCT ID, never on the step name — the three drifted names (`Pull garlic cubes` / `Pull out garlic cubes`) collapse regardless. Name normalization is explicitly NOT part of this fix and is filed as its own todo"
    - "The existing raw-prep 'Prep onion' cross-recipe merge is byte-identical in behaviour — a PARALLEL pull path was added; `singleRawInput`, `makeMergedPrepStep`, and the raw `ProductType.Raw` gate were not touched"
    - "The merged pull node carries its OWN label (`Pull {product}`) and step type — it does NOT reuse `makeMergedPrepStep`, so a freezer pull is never mislabelled 'Prep garlic cubes (frozen)'"
    - "The merged pull node is KEPT, never elided by the spurious-pull pass (3b): frozen garlic is produced by nothing in-plan, so pull-merge candidates (input NOT in `producedProductIds`) are disjoint from 3b's produced-in-plan set — verified, the two conditions are exact inverses"
    - "The missing-pull-step linter no longer fires on a legitimate freezer/pantry pull — a sourceless INVENTORY consumption is prior-week stock (consumed only by pull steps in this data model) and is exempt; the 12 live false positives on plan `71ukhycp2v4s0fw` are gone"
    - "The rule still has TEETH: a real step consuming a STORED input that NO step produces anywhere in the plan is STILL flagged — a genuinely missing make/pull step"
    - "Every new test FAILS against the unfixed code (stash-fix → confirm RED → restore), so each test actually watches the bug it is named for"
  artifacts:
    - recipe-planner/src/lib/scheduler/week-graph.ts
    - recipe-planner/src/lib/scheduler/week-graph.test.ts
    - recipe-planner/src/lib/linter/rules/missing-pull-step.ts
    - recipe-planner/src/lib/linter/rules/missing-pull-step.test.ts
    - .planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md
  key_links:
    - "THE COUPLING IS NOT WHAT THE BRIEF DESCRIBES — measured, planning_findings #5. Task A does not leave a 'still-sourceless merged node that Task B must exempt'. `collectStoredInputConsumptions` gates every consumption on the week-graph's node-id set (`missing-pull-step.ts:60-61`), and its ids are `${mealId}::${stepId}`. After the merge the three original pull ids are GONE from the graph and the synthetic `merged-pull::…` id is never emitted as a consumption — so Task A ITSELF clears the three garlic false positives (verified: post-merge `collectStoredInputConsumptions` returns `[]`). The merged node is LINTER-INVISIBLE. Task B independently clears the OTHER single (un-merged) leaf pulls"
    - "Task A lands FIRST; Task B is TESTED AGAINST A's real `buildWeekGraph` output. Justification: B-first would also be correct, but only A-first lets B's composition test see BOTH mechanisms at once (the 3-garlic merge yields zero findings via A's gate AND a single un-merged garlic pull is exempt via B's predicate). That is the 'B-tested-against-A' arrangement"
    - "The disqualifier is `week-graph.ts:86` (`if (product?.type !== ProductType.Raw) return null;`) inside `singleRawInput`, feeding `mergeableInfo` at `:167-169`, consumed by merge pass (4) at `:277`. The `resource:none` gate at `:167` is NOT the blocker — all three garlic pulls already normalize to `none`. Raw-type is the sole disqualifier"
    - "`StoredInputConsumption` (`missing-pull-step.ts:19-25`) carries `productId` + `productName` but NOT `type`. Task B must thread `productType` through it and update the two exact-object `toEqual` assertions in `collect-stored-inputs.test.ts:118-123` and `:185-189`, or they go red on the interface change alone"
    - "Display-order freeze (`display-order.ts`, 260717-25d) is agnostic to node identity — it sorts `schedule.order` by `starts`, re-established at each generation. A merged pull node sorts like any other id; no change needed there (verified by reading the module). `collectDayOfWork` (`day-of-work.ts`) touches only `just_in_time` steps; pulls are `batch`, so the merge cannot drop or duplicate day-of work"
---

<objective>
**Two coupled defects around freezer/pantry PULL steps in cook mode, one shared
root — the week-graph builder was written for RAW knife-prep and never taught
about inventory pulls. Both fixes are pure code. No prod write. No checkpoint.
Do not deploy.**

**Symptom A — three duplicate "Pull garlic cubes" cards.** Three separate recipes
each carry a pull step that consumes the SAME prior-week-stock inventory item
`garlic cubes (frozen)` and produces its own transient `garlic cube (pulled)`.
`buildWeekGraph`'s week-wide merge (pass 4) collapses duplicate handling of one
ingredient into a single card — but ONLY for single-**raw**-input knife prep
(`singleRawInput` bails at `week-graph.ts:86` on `ProductType.Raw`). Inventory
pulls are `inventory`, not `raw`, so they never merge. Cook mode shows the same
freezer pull three times. **The merge is ALREADY cross-recipe** (it merged "Prep
onion" from two recipes) — this is a near-miss, not a new feature. Task A adds a
PARALLEL inventory-pull path, keyed by input product id, with its own label — it
does NOT weaken the raw path.

**Symptom B — missing-pull-step flags every legit freezer pull (12 false
positives).** `lintMissingPullStep` flags every stored/inventory consumption
whose consumer node has no incoming producer edge. A genuine freezer/pantry
pull's inventory input is sourceless in-plan BY DESIGN (it is prior-week stock;
you do not "make" garlic cubes each week) — so the pull node has zero incoming
edges and gets flagged as if the pull were missing. The pull step IS the pull.
Task B exempts a sourceless INVENTORY consumption (prior-week stock) while
keeping a sourceless STORED consumption flagged (a genuinely missing this-week
make-step — the rule's real teeth).

**The coupling is real but SMALLER and DIFFERENT than first framed — I measured
it (planning_findings #5).** Task A does not hand Task B a "still-flagged merged
node". The consumption collector gates on the week graph's node ids, so once the
three garlic pulls merge, their ids leave the graph and their consumptions
vanish — Task A itself clears the three garlic false positives, and the merged
node is never linted at all. Task B independently clears the OTHER ~9 single,
un-merged leaf pulls. Order: **A first; B tested against A's real output** so a
composition test pins both at once.

**Explicitly NOT in scope, by deliberate call:**

- **Pull-step NAME normalization.** `Pull garlic cubes` / `Pull out garlic cubes`
  / `Pull frozen garlic cube` is real data drift, but it is a **red herring for
  BOTH bugs**: the merge keys on the input product id and the exemption is
  structural — neither reads the step name. Normalizing names would fix nothing
  here and risks selling a cosmetic change as a defect fix. Task C files it as a
  data-hygiene todo (kin to `swap-aware-prep-naming`) and it is done.
- **The spaghetti / create-spaghetti split.** Both spaghetti-related findings
  predate the split (planning_findings #7). Do NOT propose a rollback. If "Cook
  spaghetti" turns out to consume a STORED (not inventory) input, that is a
  product-TYPING question, not a rule-weakening one — see Task B.
- **Making the merged pull node linter-visible.** The `includedIds` gate already
  correctly drops merged-away consumers, and the merged pull IS the pull (no
  genuine miss is possible), so leaving it unlinted is correct, not a gap.
- **Deploying / prod writes.** None. The live plan `71ukhycp2v4s0fw` was read
  ONLY to measure the 12 findings.
</objective>

<planning_findings>
**Read this before starting. Everything below was read from the real code or
measured by running the REAL `buildWeekGraph` + `collectStoredInputConsumptions`
+ `runWeekLint` via `npx tsx` over a synthetic three-garlic-pull fixture (the
same fixture shape the brief describes; no PocketBase, no prod write). The
brief's diagnosis was measured against live prod plan `71ukhycp2v4s0fw`
read-only; I re-verified the load-bearing internals against the code and my own
runs. Where the brief's prose and the code disagree, the code wins — and on the
COUPLING they DO disagree (#5).**

1. **Symptom A CONFIRMED, exact disqualifier verified.** `buildWeekGraph`'s merge
   pass (4) (`week-graph.ts:272-322`) only collapses nodes recorded in
   `mergeableInfo` (`:277`). `mergeableInfo` is populated at `:167-169` ONLY when
   `stepResource(step) === "none"` AND `singleRawInput(...)` returns non-null.
   `singleRawInput` (`:79-88`) bails at **`:86`**: `if (product?.type !==
   ProductType.Raw) return null;`. Garlic cubes are `inventory`, not `raw`, so
   inventory pulls are never candidates. **The `none` gate is NOT the blocker** —
   measured: all three garlic pulls normalize to `none` already. The `Raw` type
   check is the sole disqualifier. Confirmed by running the fixture: 3 separate
   pull nodes (`meal-a::pull-a`, `meal-b::pull-b`, `meal-c::pull-c`),
   `merged-pull` present = false.

2. **The merge is graph-safe for pulls — verified against the remap.** Each pull
   feeds only its own recipe's downstream garlic consumer via an intra-recipe
   edge (pass 2). Merge pass (4) builds `originalToMerged` and then `remap`s every
   edge (`:305-316`), fanning every member's downstream edge out of the single
   merged node — so all three consumers still wait on the one merged pull. There
   is NO quantity risk: `StepInstance` (`scheduler/types.ts:44-63`) carries no
   product quantity; the week graph is a precedence DAG only; shopping quantities
   come from a separate aggregation path. Only the STEP CARD was duplicated.

3. **HAZARD confirmed: `makeMergedPrepStep` (`week-graph.ts:104-140`) hardcodes
   `StepType.Prep`, `resource:none`, and a `Prep {product} (breakdown)` name.**
   Reusing it for a pull would render a freezer pull as "Prep garlic cubes
   (frozen)". Task A needs its OWN `makeMergedPullStep` producing a `Pull
   {product}` label and an appropriate step type. The raw-type gate means an
   inventory pull can NEVER reach `singleRawInput`/`makeMergedPrepStep`, so the
   two paths cannot cross-contaminate.

4. **The pull-merge and the spurious-pull elision (pass 3b) are DISJOINT —
   verified against `isSpuriousInPlanPull`.** Pass 3b (`:224-270`) elides pulls
   whose inventory input IS produced in-plan (`isSpuriousInPlanPull`,
   `connective.ts:52-72`, requires `producedProductIds.has(inputProduct.id)` plus
   Assembly + 0 active + 0 passive + single inventory input). Task A's merge
   candidates are the INVERSE: inventory input NOT produced in-plan (genuine
   prior-week stock). Frozen garlic is produced by nothing in-plan, so it survives
   3b and is a merge candidate. The two sets can never overlap. Task A must gate
   pull candidacy on `!producedProductIds.has(productId)` AND on the node still
   existing after 3b (defensive) so the disjointness holds structurally, not by
   luck. Note two of the three garlic pulls are 1a/0p, so they would fail
   `isSpuriousInPlanPull`'s zero-time test anyway — but the product-not-produced
   gate is the real, principled guard.

5. **THE COUPLING CORRECTION — this is where the brief's prose and the code
   diverge, and the code is right. MEASURED.** The brief says "even a perfect
   garlic merge leaves the merged pull node STILL sourceless, so it stays flagged
   by missing-pull-step unless Task B also fixes the rule." **That is not what the
   code does.** `collectStoredInputConsumptions` (`missing-pull-step.ts:41-73`)
   emits one consumption per `${mealId}::${stepId}` consumer, gated at `:60-61`
   on `includedConsumerIds` = the week graph's node-id set. After Task A merges
   the three garlic pulls:
   - their three original ids (`meal::pull`) are GONE from the graph → dropped by
     the `includedIds` gate,
   - the synthetic `merged-pull::<productId>` id is NOT a `${mealId}::${stepId}`
     and is never emitted as a consumption at all.

   I verified this directly: feeding a post-merge `includedIds` set (three pull
   ids removed, `merged-pull::garlic-frozen` added) to the REAL
   `collectStoredInputConsumptions` returns **`[]`** — zero garlic consumptions,
   hence zero garlic findings. **So Task A ITSELF clears the three garlic false
   positives, and the merged node is LINTER-INVISIBLE.** The existing comment
   (`missing-pull-step.ts:37-39`) — "a stored-input consumer is never a mergeable
   single-raw prep node, so its id is always present un-remapped" — was written
   for the RAW merge (raw prep consumes `raw`, never stored/inventory, so it never
   appears in consumptions). Task A introduces the first case where a
   stored/inventory-input consumer IS merged away; the gate handles it correctly
   by dropping it. **Consequence for planning:** Task B is NOT needed to un-flag
   garlic (Task A does that). Task B is needed for the ~9 OTHER single, un-merged
   leaf pulls (freezer/pantry pulls that appear once and so are never merge
   candidates). Do not write Task B as if it must "exempt the merged node" — it
   never sees it.

6. **Symptom B CONFIRMED against the fixture.** `lintMissingPullStep`
   (`missing-pull-step.ts:75-89`) builds `consumerIdsWithProducer =
   Set(edges.map(e => e.to))` and flags every consumption whose `consumerId` is
   absent from it. Pure topology — no product-type check, no name check. Running
   the fixture: 3 consumptions (the three pull steps consuming `garlic cubes
   (frozen)`), 3 findings — one per pull. A legit freezer/pantry pull's inventory
   input has no in-plan producer BY DESIGN, so every such pull is flagged. The
   brief's live count: 12 findings, all with incomingEdges=0; 8 literal pull/take
   steps plus `take ground beef out of freezer` and `Cook spaghetti`.

7. **The 12 are pre-existing, not a regression.** Both spaghetti-related findings
   predate the create-spaghetti split (STATE.md `mis-tagged-just-in-time-…`).
   The CookMode path is exact: `CookMode.tsx:592-600` — `includedIds =
   new Set(weekGraph.nodes.map(n => n.id))` → `collectStoredInputConsumptions` →
   `runWeekLint`. Do not propose a spaghetti rollback.

8. **The exemption predicate — RECOMMENDED shape, with the domain reasoning and
   the one thing to verify live.** In this data model, INVENTORY items are
   consumed ONLY by pull steps: `garlic cubes (frozen)` [inventory] → "Pull
   garlic cubes" → `garlic cube (pulled)` [transient] → cook step. Cook steps
   consume the TRANSIENT, never the inventory directly. Therefore "a sourceless
   inventory consumption" is a pull step, and exempting sourceless inventory
   exempts exactly the pulls with no over-suppression. STORED items, by contrast,
   are this-week fridge items (chicken stock, cooked pasta) that MUST be produced
   in-plan — a sourceless STORED consumption is a genuine missing make-step and
   must stay flagged. **This maps the brief's own teeth requirement exactly** ("a
   real COOK step whose STORED input has no pull anywhere" must still flag). The
   one thing to VERIFY live before trusting it: confirm each of the 12 flagged
   consumers has an INVENTORY input. If any (e.g. `Cook spaghetti`) has a STORED
   input, do NOT weaken the rule to silence it — either it is a genuine miss
   (keep flagged, teeth) or the product is mis-typed and should be inventory/
   pantry (a DATA fix, out of scope — note it in the SUMMARY / a todo). The rule
   change is type-based, not name-based and not difficulty-gated.

9. **Interface change ripples into one existing test.** `StoredInputConsumption`
   (`:19-25`) has no `type`. Threading `productType` through it (so the rule can
   exempt inventory) changes the emitted object shape, and
   `collect-stored-inputs.test.ts` asserts exact objects with `toEqual` at
   `:118-123` and `:185-189`. Task B must update those two assertions (add
   `productType`, or switch to `expect.objectContaining`) or they go red on the
   shape change alone — a red that has nothing to do with the fix.

10. **Non-interactions verified by reading the code, per the brief's "verify,
    don't assume":**
    - **Display-order freeze** (`display-order.ts`, 260717-25d): `freezeDisplayOrder`
      sorts `schedule.order` by `starts` and `applyDisplayOrder` replays a frozen
      id list — both are agnostic to node identity; a `merged-pull::…` id sorts
      like any other. The freeze is re-established at each generation from the
      current (merged) graph, so a changed node count / id set is captured
      cleanly. No change needed. (How verified: read `display-order.ts:43-94` — no
      assumption about id shape; ids flow straight from `schedule.order`.)
    - **`collectDayOfWork`** (`day-of-work.ts:34-64`): filters `step.timing ===
      Timing.JustInTime` and nothing else. Pull steps are `batch` (STATE.md:271
      confirms the garlic pulls were retagged `batch`), so they never enter
      `collectDayOfWork` and the merge cannot drop or duplicate day-of work.
    - **Spurious-pull elision (3b)**: see #4 — the merged node is KEPT.

11. **Fixture builders exist and are proven.** `week-graph.test.ts:30-131`
    provides `makeProduct` / `makeProductNode` / `makeStep` / `makeStepToProductEdge`
    / `makeProductToStepEdge` / `makeRecipeData` and a full raw-merge +
    cross-recipe + 3b-elision suite (`:169-498`). `collect-stored-inputs.test.ts`
    and `connective.test.ts` mirror the same inline-Map convention. Reuse these —
    do not invent a new fixture style. `StepType` is only `Prep | Assembly`
    (`types.ts:110`), `ProductType` is `raw | transient | stored | inventory`
    (`:31`), `Timing` is `batch | just_in_time` (`:115`).
</planning_findings>

<tasks>

<task type="auto" tdd="true">
  <name>Task A: Extend the week-wide merge to single-inventory-input pulls (parallel to the raw path, own label)</name>
  <files>recipe-planner/src/lib/scheduler/week-graph.ts, recipe-planner/src/lib/scheduler/week-graph.test.ts</files>
  <behavior>
    - Three per-recipe pull steps each consuming a single inventory product
      `garlic cubes (frozen)` (NOT produced in-plan) collapse into ONE
      `merged-pull::<productId>` node; the three original `meal::pull` ids are
      gone; each of the three recipes' downstream garlic consumers still has an
      edge FROM the merged node (precedence preserved via the existing `remap`).
    - The merged node's step is labelled `Pull {product}` with an appropriate
      step type — NOT `Prep {product}`; produced by a new `makeMergedPullStep`,
      never by `makeMergedPrepStep`.
    - The merged pull node is KEPT, not elided by pass 3b (frozen garlic is
      produced by nothing in-plan).
    - A single garlic pull in a one-recipe plan is left untouched (nothing to
      aggregate — mirrors the raw "one occurrence" case).
    - The existing raw-prep merge is byte-identical: the "Prep onion" cross-recipe
      merge test still asserts a `merged-prep::onion` node with summed active time
      and fanned edges (do NOT edit that test; it must stay green).
  </behavior>
  <action>
    **Own commit.** Add a PARALLEL inventory-pull merge path alongside the
    existing raw-prep merge in `week-graph.ts`. The raw path (`singleRawInput`
    `:79-88`, its `mergeableInfo` population `:167-169`, and `makeMergedPrepStep`
    `:104-140`) MUST stay byte-identical in behaviour — add beside it, never
    inside it.

    1. **New `singleInventoryInput(recipeData, stepId)`** mirroring `singleRawInput`
       but returning non-null only when the step's SOLE input is a single product
       of type `ProductType.Inventory` (return `{ productId, productName }`). Do
       not modify `singleRawInput`.

    2. **New `pullMergeableInfo` map**, populated in pass (1) next to
       `mergeableInfo`: when `stepResource(step) === "none"` and
       `singleInventoryInput(...)` is non-null, record it. Gate on the resource
       normalizer to match the raw path's resource-safety invariant — freezer /
       pantry pulls are resource-none; planning_findings #1 confirms the garlic
       pulls already are. A single node can never be in BOTH maps: `singleRawInput`
       matches only `raw`, `singleInventoryInput` only `inventory` — disjoint by
       type.

    3. **Candidacy filter at merge time**, using `producedProductIds` (already
       computed at `:233` for pass 3b, in scope in pass 4): only merge a pull group
       whose input `productId` is NOT in `producedProductIds` (genuine prior-week
       stock), and skip any member whose node id is no longer in `nodeById`
       (defensively excludes anything 3b elided). This makes the pull-merge and 3b
       provably disjoint (planning_findings #4).

    4. **New `makeMergedPullStep(mergedId, productName, members)`** — do NOT reuse
       `makeMergedPrepStep`. Produce a synthetic `RecipeStep`: name `Pull
       {productName}` (a per-member breakdown is optional — if added, key it off
       the members, not the drifted step names), `step_type` an appropriate pull
       type (the members' common `step_type`, defaulting to `StepType.Assembly` —
       pulls are pass-through connectors), the resource normalized to none,
       `active_minutes` = summed members' active, `passive_minutes: 0`. Set
       `mergedMembers` on the node exactly as the raw path does, so Cook Mode can
       reconstruct the members.

    5. **Wire into pass (4)**: build `pullMembersByProduct` from `pullMergeableInfo`
       (respecting the #3 filter), and for each group with 2+ members create a
       `merged-pull::<productId>` node via `makeMergedPullStep`, add every member
       to the SHARED `originalToMerged` map, and push the node so it is included in
       `mergedGraphNodes`. The existing `remap` + edge-dedupe + early-return
       (`:303-322`) then handles both raw and pull merges uniformly — just ensure
       the early `if (originalToMerged.size === 0)` check runs AFTER pull members
       are added, and that `mergedGraphNodes` concatenates BOTH raw and pull merged
       nodes. Keep the merged-id scheme distinct: `merged-prep::` vs `merged-pull::`.

    Do NOT touch `missing-pull-step.ts`, `connective.ts`, `CookMode.tsx`,
    `display-order.ts`, or `day-of-work.ts` in this task.

    **Tests (append to `week-graph.test.ts`, reuse its `make*` builders).**
    - **The merge test.** Three meals, each a pull step (single inventory input
      `garlic cubes (frozen)`, produced by nothing in-plan) → its own transient →
      a downstream cook step. Assert: exactly one `merged-pull::<garlicId>` node;
      none of the three `meal::pull` ids remain; each meal's cook step has an
      incoming edge from the merged node (`expect.arrayContaining`). FAILS before
      the fix (currently three separate pull nodes, `merged-pull` absent).
    - **The label test.** Assert the merged node's `step.name` starts with `Pull `
      and is not a `Prep`-mislabelled name — the node did not go through
      `makeMergedPrepStep`.
    - **The 3b-kept test.** In the same three-garlic plan (input produced by
      nothing), assert the `merged-pull` node EXISTS (not elided) — guards against
      routing pulls through the spurious-pull pass.
    - **The single-pull test.** One meal, one garlic pull → NOT merged (no
      `merged-pull::` node), the original `meal::pull` id present. Mirrors the raw
      "one occurrence untouched" case.

    **RED discipline (non-negotiable).** Before committing: with the new tests in
    place, `git stash` ONLY the `week-graph.ts` change (keep the test edits), run
    the new merge test, CONFIRM it is RED (`merged-pull` node absent), then
    `git stash pop` and confirm GREEN. A merge test that passes against unfixed
    code is testing nothing — rewrite it.
  </action>
  <verify>
    <automated>cd recipe-planner && npx vitest run src/lib/scheduler/week-graph.test.ts && bash -e -c '
fail() { echo "FAIL: $1"; exit 1; }
f=src/lib/scheduler/week-graph.ts
grep -q "singleInventoryInput" "$f" || fail "add a parallel singleInventoryInput (do not overload singleRawInput)"
grep -q "makeMergedPullStep" "$f" || fail "the merged pull needs its OWN label fn, not makeMergedPrepStep"
grep -q "merged-pull::" "$f" || fail "merged pull nodes need a distinct id scheme (merged-pull::<productId>)"
grep -q "singleRawInput" "$f" || fail "the raw path must be preserved intact"
grep -q "makeMergedPrepStep" "$f" || fail "the raw makeMergedPrepStep must be preserved intact"
grep -q "ProductType.Raw" "$f" || fail "the raw ProductType.Raw gate must be preserved (byte-identical raw path)"
grep -q "producedProductIds" "$f" || fail "pull-merge candidacy must gate on producedProductIds (not-produced-in-plan)"
t=src/lib/scheduler/week-graph.test.ts
grep -q "merged-pull::" "$t" || fail "the merge test must assert the merged pull node id"
echo "week-graph pull-merge gates OK"
' && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>Cook mode collapses the three per-recipe `garlic cubes (frozen)` pulls into one `merged-pull::<productId>` node labelled `Pull …`, with all three downstream consumers still edged to it; the merged node survives pass 3b; a lone garlic pull is left un-merged. The raw-prep merge and its tests are byte-identical and green. Both/all new tests fail against the pre-fix `week-graph.ts` (stash-checked RED). `npx tsc --noEmit` clean, full `npx vitest run` green, `npm run build` succeeds. Independently committable.</done>
</task>

<task type="auto" tdd="true">
  <name>Task B: Exempt legit freezer/pantry pulls from missing-pull-step (sourceless inventory), keep STORED misses flagged</name>
  <files>recipe-planner/src/lib/linter/rules/missing-pull-step.ts, recipe-planner/src/lib/linter/rules/missing-pull-step.test.ts, recipe-planner/src/lib/linter/rules/collect-stored-inputs.test.ts</files>
  <behavior>
    - A single (un-merged) freezer/pantry pull — a consumer whose sole input is an
      INVENTORY product with no in-plan producer — is NOT flagged by
      missing-pull-step.
    - A real step consuming a STORED input that no step produces anywhere in the
      plan IS still flagged (teeth).
    - Composition with Task A: running the REAL `buildWeekGraph` over the
      three-garlic-pull plan, then `collectStoredInputConsumptions` +
      `runWeekLint`, yields ZERO garlic findings (Task A's merge + gate drop them)
      AND a single un-merged garlic pull is exempt (Task B's predicate).
  </behavior>
  <action>
    **Own commit. Lands AFTER Task A** so the composition test below exercises the
    real merged graph (planning_findings #5 key_link). First **VERIFY the live
    12**: rebuild the graph over plan `71ukhycp2v4s0fw` (or a faithful synthetic
    replay using the ACTUAL product types of the 12 flagged consumers) and confirm
    each flagged consumer's input is INVENTORY. Record the result in the SUMMARY.

    **READ `isSpuriousInPlanPull` (`connective.ts:52-72`) first** — it is the
    inverse of what you are building (it exempts pulls whose input IS produced
    in-plan; you are exempting pulls whose input is prior-week stock, NOT produced
    in-plan). Decide and JUSTIFY in the SUMMARY whether you reuse/extend it or
    keep the exemption type-based; the recommended shape below does not require
    touching `connective.ts`.

    **The fix (recommended, type-based — planning_findings #8):**
    1. Add `productType: ProductType` to the `StoredInputConsumption` interface
       (`missing-pull-step.ts:19-25`) and emit it from
       `collectStoredInputConsumptions` — the type is already in hand at `:53`
       (`inputProduct.type`). No new fetch.
    2. In `lintMissingPullStep`, exempt a sourceless consumption whose
       `productType` is `ProductType.Inventory`: such an input is prior-week /
       pantry stock, legitimately without an in-plan producer (in this data model
       inventory is consumed only by pull steps). Keep flagging a sourceless
       `Stored` consumption — that is a genuinely missing this-week make/pull step,
       the rule's teeth. Update the finding message if needed so it still reads
       truthfully for the STORED case.
    3. **Update the two exact-object `toEqual` assertions** in
       `collect-stored-inputs.test.ts` (`:118-123` and `:185-189`) to include the
       new `productType`, or switch them to `expect.objectContaining`
       (planning_findings #9). These are existing tests going red on the shape
       change, not new coverage.

    If the live check shows a flagged consumer with a STORED input that should not
    be flagged, DO NOT broaden the exemption to STORED — instead determine whether
    it is a genuine miss (leave flagged) or a mis-typed product (a DATA issue;
    note it, file a todo, out of scope here). The rule must never be weakened to
    silence a STORED miss.

    **Tests — new `missing-pull-step.test.ts`** (mirror `week-graph.test.ts` /
    `collect-stored-inputs.test.ts` fixture builders; import `buildWeekGraph`,
    `collectStoredInputConsumptions`, `runWeekLint`).
    - **The exemption test (B's RED test).** A single-recipe plan with one leaf
      pull: sole input an INVENTORY product produced by nothing in-plan, producing
      a transient consumed downstream. Build the graph, collect consumptions, run
      the lint → assert ZERO findings for that inventory input. This FAILS before
      the fix (currently flagged). Stash-check it RED.
    - **The teeth test.** A plan where a real step consumes a STORED product that
      no step produces → assert it IS still flagged. Passes before AND after — it
      proves the rule keeps teeth, so it is not a RED test but it MUST be present.
    - **The composition test (pins Task A + B together).** The full three-garlic
      plan through the REAL `buildWeekGraph` → assert exactly one `merged-pull`
      node AND `runWeekLint` returns ZERO garlic findings. Comment that garlic is
      cleared by Task A's merge + the `includedIds` gate (planning_findings #5),
      NOT by B's predicate — so a future regression in EITHER surfaces here.

    Do NOT touch `week-graph.ts`, `CookMode.tsx`, or `connective.ts` (unless you
    deliberately choose the sibling-predicate route and justify it).
  </action>
  <verify>
    <automated>cd recipe-planner && npx vitest run src/lib/linter/rules/missing-pull-step.test.ts src/lib/linter/rules/collect-stored-inputs.test.ts && bash -e -c '
fail() { echo "FAIL: $1"; exit 1; }
r=src/lib/linter/rules/missing-pull-step.ts
grep -q "productType" "$r" || fail "thread productType through StoredInputConsumption so the rule can exempt inventory"
grep -q "ProductType.Inventory" "$r" || fail "the rule must exempt sourceless INVENTORY (prior-week stock)"
t=src/lib/linter/rules/missing-pull-step.test.ts
test -f "$t" || fail "new missing-pull-step.test.ts must exist"
grep -qi "buildWeekGraph" "$t" || fail "the composition test must run the REAL buildWeekGraph (B tested against A)"
grep -qiE "stored|teeth|genuine" "$t" || fail "a genuinely-missing STORED case must stay flagged (rule keeps teeth)"
echo "missing-pull exemption gates OK"
' && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>A sourceless INVENTORY consumption (a legit freezer/pantry pull) is exempt from missing-pull-step; a sourceless STORED consumption is still flagged. The 12 live false positives on `71ukhycp2v4s0fw` are cleared (verified against the live plan / a faithful replay; result recorded in the SUMMARY). The exemption test fails against the pre-fix rule (stash-checked RED); the teeth test still flags a STORED miss; the composition test confirms A + B keep garlic clean via the real `buildWeekGraph`. `collect-stored-inputs.test.ts` updated for the `productType` field. `npx tsc --noEmit` clean, full `npx vitest run` green, `npm run build` succeeds. Independently committable.</done>
</task>

<task type="auto">
  <name>Task C: File the pull-name-drift data-hygiene todo and record the quick task in STATE.md</name>
  <files>.planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md, .planning/STATE.md</files>
  <action>
    Own commit (docs). No code, no prod write.

    **Create `.planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md`**
    (front-matter matching the existing pending-todo format — `created`, `title`,
    `area`, `severity: minor`, `source`, `files`). Content:
    - The same freezer pull is authored under drifted names across recipes:
      `Pull garlic cubes`, `Pull out garlic cubes`, `Pull frozen garlic cube`
      (three recipes, one product `garlic cubes (frozen)` `h0g9xux0yrg84xg`).
    - **Explicitly a RED HERRING for the 260717-fva bugs**, recorded so a future
      reader does not mistake it for the cause: the merge (Task A) keys on the
      input product id and the exemption (Task B) is structural/type-based —
      neither reads the step name, so normalizing names would have fixed NEITHER
      duplicate cards NOR the false positives. This is real data drift worth
      cleaning on its own terms only.
    - Kin to `swap-aware-prep-naming` (prep-step titles not reflecting swaps) —
      both are authored-free-text naming-consistency work; cross-reference it.
    - Note the merged pull card now shows a single `Pull {product}` label
      regardless, so this drift is no longer user-visible on the merged card — it
      remains a registry-hygiene issue (Batch Prep / product-flow surfaces, and
      any un-merged single pull still shows its authored name).

    **Update STATE.md.** Add a `260717-fva` row to **Quick Tasks Completed**
    (`STATE.md:296-301`, same table shape) summarising: extended the week-graph
    merge to inventory pulls (3 duplicate garlic cards → 1) AND exempted legit
    freezer/pantry pulls from missing-pull-step (12 false positives cleared),
    both pure code, no prod write, tests green. Add a `pull-step-names-drift-…`
    bullet to **Pending Todos** (`:266-283`). Do NOT touch other pending todos or
    the `Blockers/Concerns` section — in particular leave u4p's outstanding prod
    `--apply` blocker (`:292`) alone; this plan writes nothing to prod and must
    not imply otherwise.
  </action>
  <verify>
    <automated>cd /home/ellio/code/RecipePlanner && bash -e -c '
fail() { echo "FAIL: $1"; exit 1; }
n=.planning/todos/pending/2026-07-17-pull-step-names-drift-across-recipes.md
test -f "$n" || fail "the pull-name-drift todo must exist"
grep -qiE "red herring|not the cause|does not read the step name|structural" "$n" || fail "the todo must state it is a red herring for the fva bugs (names are not read by either fix)"
grep -qi "swap-aware-prep-naming" "$n" || fail "cross-reference the sibling naming todo"
grep -q "260717-fva" .planning/STATE.md || fail "STATE.md missing the 260717-fva quick-task row"
grep -q "pull-step-names-drift" .planning/STATE.md || fail "STATE.md must carry the new pending todo bullet"
echo "backlog hygiene OK"
'</automated>
  </verify>
  <done>The pull-name drift is filed as its own honestly-scoped data-hygiene todo that explicitly labels itself a red herring for these bugs and cross-references `swap-aware-prep-naming`. STATE.md carries the `260717-fva` quick-task row and the new pending-todo bullet, claims no prod write, and leaves every other backlog entry (especially u4p's prod blocker) untouched. Independently committable.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean, full `npx vitest run` green (333 existing + the new
  week-graph pull-merge and missing-pull-step cases; the two `collect-stored-inputs`
  assertions updated for `productType`), `npm run build` succeeds — all from
  `recipe-planner/`.
- **RED gate (per the brief, non-negotiable).** Each task's new tests MUST fail
  against the unfixed code: stash the source change (keep the test), confirm RED,
  restore, confirm GREEN. Specifically: Task A's merge test is RED without the
  pull path (`merged-pull` node absent); Task B's exemption test is RED without
  the rule change (the leaf pull is still flagged). If a new test is green before
  its fix, it is watching the wrong thing — rewrite it. This session's precedent:
  a rule bug once shipped with a test named after it that could not see it.
- Task B's composition test asserts the crossing is REAL both ways — one
  `merged-pull` node exists AND `runWeekLint` returns zero garlic findings —
  through the actual `buildWeekGraph`, so it cannot pass vacuously and it pins
  Task A + Task B together.
- Atomic commits, one per task, matching repo style (`fix(260717-fva): …`,
  `test(…)`, `docs(…)`), ending `Co-Authored-By: Claude Opus 4.8`.
- **Nothing is written to prod. Nothing is deployed. No checkpoint.** Do not
  commit `import-drafts/` or `recipe-planner/add-notes-tmp.mjs` — both are
  pre-existing untracked files unrelated to this work.
</verification>

<success_criteria>
Cook mode shows a single "Pull garlic cubes" card instead of three, and the
missing-pull-step linter stops crying wolf on every legitimate freezer/pantry
pull while still catching a genuinely missing this-week make-step.

**The SUMMARY must state plainly:**
1. **The merge blocker was a single type check.** `singleRawInput`
   (`week-graph.ts:86`) gates on `ProductType.Raw`, so the week-wide merge — which
   was ALREADY cross-recipe (it merges "Prep onion" across recipes) — simply never
   considered inventory pulls. Task A added a PARALLEL inventory path keyed by
   input product id, with its own `Pull {product}` label (never the raw
   `makeMergedPrepStep`), leaving the raw path byte-identical.
2. **The coupling was smaller and different than first framed — measured.** Task A
   did NOT hand Task B a still-flagged merged node. `collectStoredInputConsumptions`
   gates on the week-graph node-id set, so merging the three garlic pulls dropped
   their consumptions entirely (verified: post-merge collection returns `[]`) and
   the synthetic `merged-pull::…` id is never a consumption. **Task A itself
   cleared the three garlic false positives; the merged node is linter-invisible.**
   Task B was needed for the OTHER single, un-merged leaf pulls.
3. **Task B is type-based, not name-based.** A sourceless INVENTORY consumption is
   prior-week / pantry stock (consumed only by pull steps in this data model) and
   is exempt; a sourceless STORED consumption is a genuine missing make-step and
   stays flagged — the rule keeps its teeth. State the live-verified outcome: how
   many of the 12 flagged consumers had inventory inputs, and — if any had a STORED
   input — whether that is a genuine miss or a product-typing data issue (filed,
   not silenced).
4. **The pull-step name drift is a RED HERRING, and the plan says so.** Neither
   fix reads the step name; normalizing `Pull garlic cubes` / `Pull out garlic
   cubes` / `Pull frozen garlic cube` would have fixed nothing. It is filed as its
   own data-hygiene todo (kin to `swap-aware-prep-naming`), not sold as part of
   this fix.
5. **Every new test fails against the unfixed code.** The merge test is RED
   without the pull path; the exemption test is RED without the rule change —
   stash-checked. A test named after a bug that cannot see the bug is not coverage.
6. **Pure code, no prod write, no deploy, no checkpoint.** The live plan
   `71ukhycp2v4s0fw` was read only to count and characterise the 12 findings.
</success_criteria>
