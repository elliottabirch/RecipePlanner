---
quick_id: 260716-rpp
type: quick
description: Fix garlic over-pull data bug + harden the aggregation merge against unresolvable-unit splits
autonomous: false
files_modified:
  - recipe-planner/scripts/audit-garlic-node-quantities.js
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts
  - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
  - recipe-planner/src/lib/import/build-recipe-graph.ts
  - .planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md
  - .planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md
must_haves:
  truths:
    - "Every garlic node in prod carries a quantity that means what it says in that product's own unit (a node on `garlic cubes (frozen)` reading 3 means 3 cubes, not 3 cloves)"
    - "The prod data write happens only after a human reads the full dry-run diff and approves; a PB backup and a rollback worksheet exist before the first write"
    - "Two planned meals using the same product with an alias unit (e.g. \"cube\") produce ONE summed aggregation line, not two"
    - "An alias unit gets the discrete ceil applied (never under-buy an indivisible item), same as its canonical form"
    - "A non-empty unit that cannot be resolved to a canonical Unit is logged loudly at the split; `\"\"` stays quiet; nothing throws"
    - "Units written by BOTH the recipe editor and the import page land canonical in recipe_product_nodes"
    - "Both source todos carry a diagnosis that matches the verified prod probe — regardless of whether the data write lands"
  artifacts:
    - recipe-planner/scripts/audit-garlic-node-quantities.js
    - recipe-planner/scripts/dedup-output/garlic-node-quantities.json
    - recipe-planner/scripts/dedup-output/garlic-node-quantities.md
  key_links:
    - "buildAggregatedProduct normalizes node.unit before scaleQuantity and before the merge key is derived — the single read boundary"
    - "planGraphWrites (build-recipe-graph.ts:132) is the single write path for BOTH RecipeEditor.handleSave and the /import page (Phase 06-04, D-01/D-05, IMP-02), so one normalize there covers both surfaces"
    - "resolveMergeTargetKey's `|undefined` split is DEFERRED, not fixed — the order-dependence pin tests in Task 2 are the artifact that carries the finding to whoever picks it up"
---

<objective>
**The live bug is DATA, not code.** Honey-Garlic Broccolini's node
`towm23or3877720` literally stores `quantity=3` on `garlic cubes (frozen)`, a
product measured in cubes. The recipe was authored "3 cloves"; the Phase-01
`normalize-node-units.js` sweep mapped `cloves -> each` while **preserving the
quantity**, destroying the ratio at write time. The week of 7/13 pulls 8 garlic
cubes where it should pull ~4. This is a real, user-visible, 3x over-pull, and
correcting it is the point of this plan.

**Retracting the todos' headline story.** Both source todos claim the app "only
told us to pull 1 garlic cube" because two recipes' alias units split into
separate lines and never summed. That is **not reproducible**. Running the real
`buildProductFlowGraph` against prod and the live week plan `71ukhycp2v4s0fw`
yields ONE correctly merged line — `total=8 each, sources=3` across Creamy Tomato
Soup, Honey-Garlic Broccolini, and Mushroom Bourguignon. There is no split and no
under-count on that product. The app is not under-counting garlic; it is
faithfully reporting wrong numbers. See `<planning_findings>`.

So this plan does three things, in descending order of real value:

1. **Correct the garlic node quantities in prod** — read-only audit producing a
   human-confirmed worksheet, then an explicitly gated `--apply`. This is the bug.
2. **Harden the aggregation read/write boundaries** — normalize alias units so
   they cannot split or skip the discrete ceil, and plug the import contract they
   enter through. Framed honestly: **zero alias units exist in prod today**, so
   this has NO visible effect on current data. It is a latent-bug guard.
3. **Correct both source todos** — they carry a disproven diagnosis, which is
   itself a defect sitting in the backlog.

**Explicitly NOT in scope: the clove↔cube ratio model.** Every garlic node
already uses `each` consistently, so there is no live cloves+cubes 1:1 mis-merge
to defend against — only wrong quantities, which Task 1/4 fix directly. The model
is entangled with the deferred `single-purchase-unit-shopping-lines` work (which
reverses the locked "no density model" decision), and the garlic todo explicitly
warns against bolting a garlic special case onto `units.ts`. Leave that decision
to that phase; this plan must not foreclose it.

**Also NOT in scope, by a deliberate call made during planning: the
`|undefined` merge-semantics fix.** See `<planning_findings>` #6 for the
evidence. Task 2 ships the `console.warn` and pins the broken behavior with
executable tests instead.
</objective>

<planning_findings>
**Read this before starting. The orchestrator ran the REAL aggregation code (via
`npx tsx`) against live prod and the live week plan `71ukhycp2v4s0fw` ("week of
7/13") on 2026-07-16. These findings SUPERSEDE both todos. Do NOT re-derive them
and do NOT trust the todos' diagnosis — the todos are the thing being corrected.**

1. **ZERO alias units exist in prod.** Full `recipe_product_nodes.unit`
   histogram: `each`(199), `cup`(115), `""`(104), `tbsp`(49), `tsp`(30),
   `lb`(19), `oz`(16), `qt`(11), `fl_oz`(2), `serving`(1). No `cube`, no `clove`,
   no `ea`. The Phase 01-08 sweep already flattened them.
   → **The alias-split bug is real but LATENT — it has no live instances.** Do
   not expect the shopping list to visibly change when Task 2 lands.

2. **The todos' headline symptom is NOT REPRODUCIBLE.** Week 7/13 plans Creamy
   Tomato Soup (qty-node 2), Honey-Garlic Broccolini (qty-node 3), AND Mushroom
   Bourguignon (qty-node 3) — all on the same `garlic cubes (frozen)` product
   `h0g9xux0yrg84xg`, all unit `each`. `buildProductFlowGraph` merges them
   correctly into one line, `total=8 each, sources=3`. The batch-prep step reads
   `Pull garlic cubes (+ 1 variants) — IN: garlic cubes (frozen) 8 each`.

3. **The 3x over-pull is live and PURE DATA.** Suspects (all on
   `garlic cubes (frozen)`, all unit `each`): `towm23or3877720` Broccolini qty=3
   (todo says should be 1), `k2nn479wa423rrj` Bourguignon qty=3,
   `zoch88349g713g8` Tomato Soup qty=2, `g996j1m2bbn13nm` Indian batch qty=2.
   `k63xfg3t4lwsj83` / `nm35xoo159213k4` / `6fd5bu3s4vn5o42` read 1 and are
   likely already correct. Garlic is several products:
   `garlic cubes (frozen)` `h0g9xux0yrg84xg` (inventory, canonical `each`),
   `garlic cube (pulled)` `nth208298rbyj8h` (transient, `each`),
   `garlic minced` `4sm6pe82wp97a41` (raw, `each`).

4. **The raw clove/cube evidence is GONE from the DB.** The sweep already
   flattened `clove -> each`, so nothing records whether a `3 each` node meant 3
   cloves or 3 cubes. **The audit therefore CANNOT auto-propose a ÷3** — every
   correction is human judgment against recipe prose (D-08: never guess). Recipe
   step text still mentions cloves/cubes and is the only surviving evidence.

5. **The `|undefined` split IS minted live — by `""` units, NOT aliases.**
   `canConvert("","")` is false for the same reason `canConvert("cube","cube")`
   is. On week 7/13 the flow graph produces TWO lines for one transient:
   `key="nth208298rbyj8h"` (`garlic cube (pulled)`, unit `each`, total 0) AND
   `key="nth208298rbyj8h|undefined"` (same product, unit `""`, total 0) —
   visible as two identical `garlic cube (pulled)` outputs on the pull step.
   **`normalizeUnit` does NOT fix this**: `normalizeUnit("")` returns `null`, the
   expression falls back to the raw `""`, and the line still splits. The todo's
   proposed one-line fix would not have touched the live bug.

6. **Why the `|undefined` merge fix is DEFERRED (planner's call, made against
   the code — this is the load-bearing finding; do not quietly overturn it).**
   The obvious candidate fix ("a dimensionless unit with quantity 0 absorbs into
   the base line — a D-01 sentinel carries no quantity to lose") is
   **order-dependent**, and the naive order-independent version silently destroys
   data:
   - `resolveMergeTargetKey` (`product-builder.ts:98-99`) returns `baseKey`
     whenever no base exists yet. So the absorb rule only fires when the `""`
     node arrives SECOND. If it arrives FIRST it claims the bare key with unit
     `""`, and the later real `each` node hits `canConvert("", "each") === false`
     → `getDimension("each") === "count"` → gets exiled to `${baseKey}|count`.
     The duplicate line survives, now with the REAL quantity on the split key.
   - Making it order-independent requires the base line to YIELD to the incoming
     — rewriting `addOrMergeProduct`'s merge branch (`:117-145`). That branch
     rests on the documented invariant at `:129-130` ("merged is guaranteed
     non-null here"). With a dimensionless *existing* unit, `mergeQuantities`
     returns `null` (`product-utils.ts:52`), the `if (merged)` guard at `:131`
     skips, and **the incoming 8 `each` is silently discarded** — strictly worse
     than a duplicate line.
   - That makes the honest fix a rewrite of the merge branch plus a relaxation of
     DATA-01's convert-or-split contract, whose guard is explicitly load-bearing:
     `units.ts:114-121` says two dimensionless units "must NOT be treated as
     convertible — otherwise `undefined === undefined` reads as `true` and
     `convert` returns NaN, silently corrupting the merged quantity."
   - **Blast radius vs. payoff:** this merge path runs for every product on every
     surface, and 14 products carry a mixed unresolvable+canonical spread (see
     #7). The live symptom it would fix is ONE duplicate `garlic cube (pulled) 0`
     line on a cook card — and per #9 a `0` transient is the convention, so the
     duplicate reads as noise, not a wrong number. Trading a silent-corruption
     risk across every shopping line for a cosmetic dedup inside a quick task is
     a bad trade. Task 2 ships the warn and **pins both orderings with tests** so
     the finding is executable, not folklore; the merge-semantics change is
     deferred to a real phase via the rewritten alias todo (Task 3).

7. **Blast radius of #5: 14 products** have a mixed unresolvable+canonical unit
   spread and would split if one week planned the relevant recipes together:
   `garlic cube (pulled)`, `onion (yellow) small-dice`, `onion (yellow) large
   dice`, `onion (red) large dice`, `sweet potato large dice`, `broccoli
   florets`, `parsley chopped`, `lemon juice`, `tahini sauce`, `cucumber sliced`,
   `broccoli patties`, `salt` (raw, tsp+""), `pepper black` (raw, tsp+""),
   `pork shoulder roast` (raw, ""+each). BUT — verified on week 7/13 — the
   shopping list currently shows exactly ONE `salt` line (4 tsp) and ONE
   `pepper black` line, no duplicates. For raw/shopping-list products this is
   **latent, not firing**. Only the 0-qty transient actually split this week.
   **Do not overstate this as live shopping-list corruption.**

8. **`""` is a deliberate D-01 sentinel on 104 live nodes** (all 5 raw `""`
   nodes have qty 0; `stored` is 59/76 `""`). A throw on unresolvable units would
   crash the shopping list. Any loud-failure signal MUST be `console.warn` scoped
   to non-empty unresolvable units so `""` stays quiet.

9. **qty=0 on transients is the CONVENTION, not a bug** — 60 of 129 transient
   nodes are 0. Do NOT "fix" transient zeros; `garlic cube (pulled) 0` on a cook
   card is normal.

10. `product-builder.ts:36-37` is `const nodeUnit = node.unit || "";` —
    `normalizeUnit` is never called in the read path. `scaleQuantity`'s
    isDiscrete check at `:38` is `getDimension(unit) === "count"`, undefined for
    aliases → ceil skipped. `build-recipe-graph.ts:132` (`planGraphWrites`) is
    the single write path for BOTH `RecipeEditor.handleSave` and the /import page.

**Consequence for the plan's shape:** the data fix is the live bug; the code work
is prevention. Shipping the code fix alone changes nothing a user can see.
Shipping it without the data fix leaves garlic mis-counted. Say so in the SUMMARY.
</planning_findings>

<tasks>

<task type="auto">
  <name>Task 1: Garlic node-quantity audit script — read-only vs prod, rehearsed on :8091</name>
  <files>recipe-planner/scripts/audit-garlic-node-quantities.js</files>
  <action>
    Build the audit following the established sweep pattern of
    `normalize-node-units.js` + `apply-unit-resolutions.js`: `PB_URL` env var
    defaulting to prod (`http://192.168.50.95:8090`), **dry-run unless `--apply`**,
    superuser auth via `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` from the
    gitignored `.env.local` (never print the values), a `fmtError` helper, and
    output under `scripts/dedup-output/`.

    **This task runs READ-ONLY against prod. It must NOT be invoked with
    `--apply` against prod here — that is Task 4, behind the human gate.**

    Report phase (no writes): fetch products, select every product whose name
    matches /garlic/i, fetch all `recipe_product_nodes` for those products with
    `expand: "recipe"`, and emit a worksheet
    `scripts/dedup-output/garlic-node-quantities.json` in the
    `apply-unit-resolutions.js` shape — an array of rows each carrying
    `{ nodeId, recipeName, recipeStatus, productId, productName, productType,
    currentQuantity, currentUnit, proposedQuantity, evidence, confirmed: false }`.

    **`proposedQuantity` must be seeded equal to `currentQuantity` and
    `confirmed` must be seeded `false` for every row.** Do NOT auto-propose a ÷3:
    per planning_findings #4 the raw `clove`/`cube` string is gone from the DB, so
    the script has no evidence of intent and would be guessing (D-08). The human
    fills in `proposedQuantity` and flips `confirmed`.

    To make that human pass tractable, populate `evidence` per row by fetching
    that node's recipe's steps from `recipe_steps` (filter on the node's `recipe`
    relation id) and extracting any `name` or `instructions` text matching
    /clove|cube/i (truncated). That recovers the authoring intent from prose where
    the unit field lost it, and is the single highest-value column in the
    worksheet. Also emit a companion Markdown report
    `scripts/dedup-output/garlic-node-quantities.md` next to the JSON (same
    convention as `normalize-node-units-unresolved.md`) rendering the rows as a
    table for review, grouped by product.

    Only apply rows where `confirmed === true`, and pre-flight validate before any
    mutation (mirroring `preflightValidate`): `proposedQuantity` must be a finite
    number `>= 0`; abort the whole run if any confirmed row is malformed. On
    `--apply`, before the first write: call `pb.backups.create()` (the D-06.2
    backup-before-any-mutation guarantee, same as the Plan 08 prod run), print the
    returned backup id, and write a rollback worksheet
    `garlic-node-quantities.rollback.json` capturing each touched node's BEFORE
    `{nodeId, quantity, unit}`. Only `quantity` is ever written; never `unit`,
    never a delete.

    Rehearsal: run the report against prod read-only, then use `scripts/sync-to-test.js`
    to copy prod to test and rehearse the full `--apply` path against the test
    instance (`PB_URL=http://192.168.50.95:8091`) with a synthetic confirmed row,
    proving the write + backup + rollback-worksheet path works before it ever
    points at prod.
  </action>
  <verify>
    <automated>cd recipe-planner && node scripts/audit-garlic-node-quantities.js 2>&1 | tee /tmp/garlic-audit.txt && test -f scripts/dedup-output/garlic-node-quantities.json && test -f scripts/dedup-output/garlic-node-quantities.md && node -e "const r=require('./scripts/dedup-output/garlic-node-quantities.json');const rows=Array.isArray(r)?r:r.nodes;if(!rows.length)throw new Error('empty worksheet');if(rows.some(x=>x.confirmed!==false))throw new Error('rows must seed confirmed:false');if(rows.some(x=>x.proposedQuantity!==x.currentQuantity))throw new Error('rows must seed proposedQuantity===currentQuantity (no auto-guess)');console.log('worksheet OK:',rows.length,'rows')"</automated>
  </verify>
  <done>Read-only audit lists every garlic node with its recipe, current qty/unit, and clove/cube prose evidence; worksheet seeds no guesses; `--apply` path rehearsed green on :8091 including backup id + rollback worksheet. Prod is untouched. Expect ~20 garlic nodes (probe count 2026-07-16), including the four suspects in planning_findings #3.</done>
</task>

<task type="auto">
  <name>Task 2: Normalize at read + write boundaries, warn on unresolvable splits, pin the deferred merge bug</name>
  <files>recipe-planner/src/lib/aggregation/builders/product-builder.ts, recipe-planner/src/lib/import/build-recipe-graph.ts, recipe-planner/src/lib/aggregation/builders/product-builder.test.ts</files>
  <action>
    **Frame this correctly in the commit message: latent-bug prevention. There are
    zero alias units in prod (planning_findings #1), so nothing visible changes.**

    **Read boundary** (`product-builder.ts:36-37`). Import `normalizeUnit` from
    `../../units` and replace `const nodeUnit = node.unit || "";` with
    `const nodeUnit = normalizeUnit(node.unit ?? "") ?? node.unit ?? "";`.
    Falling back to the raw string (not `""`) is deliberate: D-08 says an
    unresolvable unit is never guessed and never silently discarded — it stays
    honest, splits, and gets surfaced by the warn below. This one line fixes both
    the merge key (`"cube"` → `"each"` → `canConvert` true → merges) and the
    discrete ceil at `:38` (`getDimension("each") === "count"` → `isDiscrete`
    true). `nodeUnit` also feeds `createMealSource` at `:50`, which is correct and
    wanted.

    **Loud failure** (`resolveMergeTargetKey`, `product-builder.ts:93-104`).
    Before returning the `${baseKey}|${dimension}` split key, when `dimension` is
    `undefined` AND `newProduct.unit` is a non-empty string, `console.warn` with
    the product id, product name, and the offending raw unit, stating the line is
    being split to a key no surface may show and that the node's unit needs
    normalizing (D-08). Do NOT throw and do NOT warn on `""` — see
    planning_findings #8; `""` is the deliberate cleared-container sentinel on 104
    live nodes and a throw would take down the shopping list.
    Note the warn only fires when a base line already exists (the function returns
    early at `:99` when it does not), which is correct: a lone unresolvable node
    claiming its own base key renders one honest line and harms nothing. The
    damage only happens at the split. Do NOT promise this surfaces the live
    `serving` node — it will only warn if that product has a colliding sibling in
    a planned week.

    **Do NOT change the merge semantics.** Leave `resolveMergeTargetKey`'s
    `|undefined` split and `addOrMergeProduct`'s merge branch exactly as they are.
    Read planning_findings #6 for why: the naive fix is order-dependent, and the
    order-independent version silently discards the real quantity. That change is
    deferred to a real phase (Task 3 rewrites the alias todo to carry it).

    **Write boundary** (`build-recipe-graph.ts:132`). `planGraphWrites` is the
    single write path for both `RecipeEditor.handleSave` and the /import page, per
    Phase 06-04 — so normalize here once and both surfaces are covered. Replace
    `unit: pn.unit,` with the same normalize-or-keep-raw expression used at the
    read boundary. Keep the existing empty semantics intact (`""` stays `""`); do
    not add a WR-01 clear sentinel, `unit` is already a plain required string. The
    editor's unit input is already an enum-bound Select (DATA-03), so the real
    hole this closes is the import JSON contract, where a skill can still emit
    `"cloves"`.

    **Tests** (`product-builder.test.ts`). Widen `makeNode`'s `unit` param from
    `Unit` to `string` (`RecipeProductNode.unit` is `?: string`, types.ts:99), so
    alias units can be passed without casts; existing call sites are unchanged.
    Add a `mergeNodesAcrossMeals(product, [{node, recipeName, plannedMealId}])`
    helper that drives `buildAggregatedProduct`/`addOrMergeProduct` over ONE
    shared products Map with a distinct recipeName + plannedMealId per entry — the
    existing `mergeNodesForProduct` is single-meal and cannot express this. Then
    add a describe block with:

    (a) **alias merge** — two meals, same product, both unit `"cube"` (qty 2 and
        3) → assert `products.size === 1`, the line is keyed `productId`, no key
        containing a dimension suffix is present, `totalQuantity === 5`, and
        `mealSources` has 2 entries.
    (b) **alias discrete ceil** — one node `1 "cube"` scaled by a mealCount that
        yields a non-integer (qty 1, mealCount 2.5) → assert
        `totalQuantity === 3`, proving the alias now takes the same
        never-under-buy path as `"each"`.
    (c) **combined cloves + cubes** — meal A `3 "cloves"`, meal B `1 "cube"` →
        assert ONE line of `4 each`. Comment this assertion explicitly: 1:1 is the
        CORRECT and intended result once each node stores its count in the
        product's own unit (which Tasks 1/4 enforce for garlic); the
        3-cloves-to-1-cube ratio is deliberately NOT modeled here and is deferred
        with `single-purchase-unit-shopping-lines`. A future reader must not "fix"
        this into a 2-each expectation without building that model.
    (d) **PIN the deferred split bug, both orderings** — this is the executable
        record of planning_findings #6, and the most valuable thing in this task.
        Use `vi.spyOn(console, "warn")` where needed and restore it.
        - d1: base-first — meal A `8 "each"`, meal B `0 ""` → assert
          `products.size === 2` and that the second key is the base key suffixed
          with the stringified `undefined` dimension; assert the base line still
          holds 8. Comment: KNOWN-WRONG, currently renders a duplicate 0 line.
        - d2: sentinel-first — meal A `0 ""`, meal B `8 "each"` → assert
          `products.size === 2`, that the BARE key holds the `""` 0 line, and
          that the `count`-suffixed split key holds the real 8. Comment: this is
          the proof that "absorb dimensionless zero into the base" is
          order-dependent; a fix must handle BOTH orderings and must not let the
          8 be dropped by the null-merge guard at product-builder.ts:131.
        Both tests assert current behavior. When the merge-semantics phase lands,
        these tests are EXPECTED to fail and should be rewritten to the new
        contract — say so in a comment above the describe block.
  </action>
  <verify>
    <automated>cd recipe-planner && npx vitest run src/lib/aggregation/builders/product-builder.test.ts && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>Alias units merge into one summed line and take the discrete ceil; unresolvable non-empty units warn instead of splitting silently; both write surfaces normalize via planGraphWrites; the `""`-driven split is unchanged but pinned by tests in both orderings; full suite green, tsc clean, build succeeds. Independently committable — commit this task on its own.</done>
</task>

<task type="auto">
  <name>Task 3: Correct both source todos — they carry a disproven diagnosis</name>
  <files>.planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md, .planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md</files>
  <action>
    A wrong diagnosis sitting in the backlog is itself a defect. **Do this
    regardless of whether the Task 4 data write lands** — it does not depend on it.
    Both todos stay in `pending/` at the end of this task; Task 4 decides what
    resolves.

    Rewrite each todo's Problem/Solution to match `<planning_findings>`, and add a
    `## Retracted` section at the top of each recording what the original claimed,
    what the 2026-07-16 prod probe actually found, and the date — do not just
    delete the wrong text, or the next reader re-derives it.

    **`2026-07-12-alias-units-break-cross-recipe-aggregation.md`** — retitle to
    reflect the real defect (the split is `""`-driven, not alias-driven). Retract:
    the "app only told us to pull 1 garlic cube / two recipes never summed"
    symptom is NOT reproducible (finding #2); zero alias units exist in prod
    (finding #1); and the proposed one-line `normalizeUnit` fix would NOT have
    touched the live bug, because `normalizeUnit("")` returns `null` and the line
    still splits (finding #5). Rewrite Problem around what IS true: an
    unresolvable unit mints a `|undefined` line, live, driven by the 104 `""`
    nodes; latent for the 14 mixed-spread products (finding #7); currently
    manifesting only as a duplicate 0-qty transient line on a cook card.
    Rewrite Solution to record what shipped (normalize at the read + write
    boundaries, the `console.warn`, the pin tests) and what did NOT — carry
    finding #6 across VERBATIM enough to be actionable: the order-dependence, the
    silent-discard failure mode of the naive order-independent version, the
    DATA-01 / `canConvert` guard that must be deliberately relaxed, and the
    pointer to the `product-builder.test.ts` pin tests. Drop the "⚠️ Interaction"
    section's premise (cloves and cubes cannot mis-merge 1:1 today — every garlic
    node already uses `each`), replacing it with a pointer to the deferred ratio
    model. **This todo STAYS PENDING** — it is now the carrier for the deferred
    merge-semantics work, and cannot honestly be resolved by this plan.

    **`2026-07-12-garlic-cube-clove-unit-conversion.md`** — the Problem's headline
    (3x over-pull) is CORRECT; keep it, and strengthen it with the probe evidence:
    the node literally stores 3, the Phase-01 sweep preserved the quantity while
    mapping `cloves -> each`, and the raw evidence is now gone from the DB
    (finding #4). Retract only the root-cause attribution: this is not a units.ts
    modeling gap firing today, it is destroyed data. Keep layer 1 (data fix) and
    mark it as being addressed by
    `scripts/audit-garlic-node-quantities.js` under this plan. Keep layer 2 (model
    fix) but mark it explicitly deferred to
    `single-purchase-unit-shopping-lines`, noting that it is not currently
    load-bearing for correctness — every garlic node uses `each` consistently, so
    the only live error is wrong quantities. Drop the "⚠️ Land this together"
    section's ordering claim (fixing the split does not create a cloves+cubes
    1:1 mis-merge, because there are no cloves in prod). **This todo resolves in
    Task 4, not here.**
  </action>
  <verify>
    <automated>cd /home/ellio/code/RecipePlanner && for f in .planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md .planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md; do grep -q '^## Retracted' "$f" || { echo "FAIL: $f missing Retracted section"; exit 1; }; grep -q '2026-07-16' "$f" || { echo "FAIL: $f missing probe date"; exit 1; }; done && echo "both todos corrected"</automated>
  </verify>
  <done>Both todos carry a `## Retracted` section dated 2026-07-16 and a Problem/Solution that matches the verified probe. The alias todo is retitled, stays pending, and carries the deferred merge-semantics finding (#6) in enough detail to act on. The garlic todo keeps its correct headline with the root cause re-attributed to data. Independently committable — commit this task on its own.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Task 1 produced a read-only prod audit of every garlic node plus a
    confirmed-worksheet whose rows all seed `confirmed: false` /
    `proposedQuantity === currentQuantity`, rehearsed end-to-end on the test
    instance including backup + rollback worksheet. Task 2 shipped the latent-bug
    guard (normalize at read + write boundaries, warn on unresolvable splits, pin
    tests for the deferred `""` split). Task 3 corrected both todos.

    **Prod data is still untouched. This is the only step that fixes the bug the
    user actually sees.**
  </what-built>
  <how-to-verify>
    This is the irreversible step. Do not run it unattended.

    1. Open `recipe-planner/scripts/dedup-output/garlic-node-quantities.md` and
       read every row. For each, decide what the quantity SHOULD be in that
       product's own unit — a node on `garlic cubes (frozen)` reading 3 means 3
       cubes. Use the `evidence` column (recipe prose mentioning cloves/cubes) and
       open the recipe in the app where it is ambiguous. Known suspects from the
       2026-07-16 probe: `towm23or3877720` Honey-Garlic Broccolini qty=3 (the todo
       says this should be 1), `k2nn479wa423rrj` Mushroom Bourguignon qty=3,
       `zoch88349g713g8` Creamy Tomato Soup qty=2, `g996j1m2bbn13nm` Indian
       Vegetarian (batch) qty=2. The qty=1 nodes (`k63xfg3t4lwsj83`,
       `nm35xoo159213k4`, `6fd5bu3s4vn5o42`) are likely already correct.
       `garlic minced` is a different product; leave it unless clearly wrong.
       **Do NOT "fix" the qty=0 `garlic cube (pulled)` transient nodes** — 60 of
       129 transients are 0 and that is the convention, not a bug.
    2. Edit `garlic-node-quantities.json`: set `proposedQuantity` and flip
       `confirmed: true` ONLY on rows you actually decided. Leave the rest false.
    3. Dry-run against prod and read the FULL diff — every line, before any write:
       `cd recipe-planner && node scripts/audit-garlic-node-quantities.js`
       Confirm each printed `node X: qty A -> B` matches your intent, and that no
       row you did not confirm appears.
    4. Only after that diff reads correctly, apply:
       `cd recipe-planner && node scripts/audit-garlic-node-quantities.js --apply`
       Confirm it prints the PB backup id and wrote
       `garlic-node-quantities.rollback.json`.
    5. Read back: re-run the read-only audit and confirm each corrected node now
       reports the intended quantity.
    6. Verify in the app (hard-refresh the tablet first — the NAS deploy caches
       the old bundle): the week of 7/13, which plans Creamy Tomato Soup,
       Honey-Garlic Broccolini and Mushroom Bourguignon, should show ONE
       garlic-cube pull line whose count is the sum of the corrected per-recipe
       quantities — down from the current 8 to roughly 4. It was already ONE
       merged line before this change; only the number should move.

    **Rollback** if the sweep is wrong: re-apply the BEFORE values from
    `garlic-node-quantities.rollback.json` (each row carries the original
    `{nodeId, quantity, unit}`), or restore the PB backup taken in step 4 from the
    PocketBase admin UI. The edits touch only `recipe_product_nodes.quantity`; no
    schema, no deletes, no unit writes.

    After the write lands and reads back clean, move ONLY
    `.planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md` to
    resolved, noting that the ratio model was deliberately NOT built and remains
    deferred to `single-purchase-unit-shopping-lines`. **Leave
    `2026-07-12-alias-units-break-cross-recipe-aggregation.md` PENDING** — Task 3
    rewrote it to carry the deferred `|undefined` merge-semantics work, which this
    plan does not ship (planning_findings #6).
  </how-to-verify>
  <resume-signal>Type "approved" once the prod diff has been reviewed and applied (or describe what looked wrong in the diff)</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean, full `npx vitest run` green (new alias merge/ceil tests and both split-pin tests included), production build succeeds.
- Prod garlic nodes read back with human-confirmed quantities; PB backup id and rollback worksheet both recorded.
- Both todos carry a `## Retracted` section matching the 2026-07-16 probe. Garlic todo moved to resolved; alias todo intentionally still pending as the carrier for the deferred merge-semantics work.
</verification>

<success_criteria>
Garlic nodes in prod carry quantities that mean what they say in each product's
own unit, corrected under an explicit human gate with a backup and a rollback
path — the week of 7/13 pulls ~4 garlic cubes instead of 8. Alias units can no
longer split a product into an invisible second line or skip the discrete ceil,
and can no longer enter via the import contract. A non-empty unresolvable unit
warns loudly at the split. The clove↔cube ratio model is untouched and still open
for `single-purchase-unit-shopping-lines`.

**The SUMMARY must state plainly:**
1. The garlic over-pull was fixed by the DATA correction, not by the code. The
   code fix is a latent-bug guard with no visible effect on today's prod data —
   zero alias units remain after the Phase 01-08 sweep.
2. Both todos' headline story ("the app only told us to pull 1 cube because two
   recipes never summed") is retracted as not reproducible. The app was already
   merging correctly and faithfully reporting a wrong number.
3. The `|undefined` merge-semantics fix was **deliberately deferred**, not
   forgotten. The naive fix is order-dependent and its order-independent form
   silently discards the real quantity via the null-merge guard at
   `product-builder.ts:131`. The behavior is pinned by tests in both orderings
   and the work is carried by the rewritten alias todo. Whoever picks it up must
   handle both orderings and consciously relax DATA-01's convert-or-split guard.
</success_criteria>
