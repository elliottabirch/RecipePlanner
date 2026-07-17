---
quick_id: 260716-rpp
type: quick
description: Fix alias-unit aggregation split + garlic clove/cube over-pull
autonomous: false
files_modified:
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts
  - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
  - recipe-planner/src/lib/import/build-recipe-graph.ts
  - recipe-planner/scripts/audit-garlic-node-quantities.js
  - .planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md
  - .planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md
must_haves:
  truths:
    - "Two planned meals using the same product with an alias unit (e.g. \"cube\") produce ONE summed aggregation line, not two"
    - "An alias unit gets the discrete ceil applied (never under-buy an indivisible item), same as its canonical form"
    - "A node unit that cannot be resolved to a canonical Unit is logged loudly at the split, never silently routed to a `|undefined` line"
    - "Units written by BOTH the recipe editor and the import page land canonical in recipe_product_nodes"
    - "Every garlic node in prod carries a quantity that means what it says in that product's own unit (a node on `garlic cubes (frozen)` reading 3 means 3 cubes, not 3 cloves)"
    - "The prod data write happens only after a human reads the full dry-run diff and approves"
  artifacts:
    - recipe-planner/scripts/audit-garlic-node-quantities.js
    - recipe-planner/scripts/dedup-output/garlic-node-quantities.json
  key_links:
    - "buildAggregatedProduct normalizes node.unit before scaleQuantity and before the merge key is derived — the single read boundary"
    - "planGraphWrites (build-recipe-graph.ts) is the single write path for BOTH RecipeEditor.handleSave and the /import page (Phase 06-04, D-01/D-05, IMP-02), so one normalize there covers both surfaces"
---

<objective>
Two todos, one pass: `alias-units-break-cross-recipe-aggregation` (aggregation
read path never calls `normalizeUnit`, so an alias unit fails `canConvert`
against itself and splits into an invisible second line) and
`garlic-cube-clove-unit-conversion` (app says pull 3 garlic cubes where it
should be 1).

Fix the code so alias units can never split or skip the discrete ceil, close the
write-path hole they enter through, make the silent split loud — and separately,
under an explicit human gate, correct the garlic node quantities in prod.

**Explicitly NOT in scope: the clove↔cube ratio model.** No first-class `clove`
count unit, no count-to-count conversion table, no product-level pack/portion
field. Once every garlic node stores its count in that product's own unit, the
1:1 merge is correct and normalization alone yields right quantities. The ratio
model is entangled with the deferred `single-purchase-unit-shopping-lines` work
(which reverses the locked "no density model" decision), and the garlic todo
explicitly warns against bolting a garlic special case onto `units.ts`. Leave
that decision to that phase; this plan must not foreclose it.
</objective>

<planning_findings>
**Read this before starting — a read-only probe of prod (2026-07-16) contradicts
both todos' premises about the live data. The code diagnosis in both todos is
correct; the data diagnosis is not.**

1. **There are ZERO alias units in prod today.** The full raw histogram of
   `recipe_product_nodes.unit` is: `each`(199), `cup`(115), `""`(104),
   `tbsp`(49), `tsp`(30), `lb`(19), `oz`(16), `qt`(11), `fl_oz`(2), and one junk
   value `serving`(1). No `cube`, no `clove`, no `ea`. The Phase 01-08
   `normalize-node-units.js` supervised prod run already flattened them.
   → **The alias-split bug is real but currently latent — it has no live prod
   instances.** Task 1 is a regression guard and a fix for the way aliases get
   back IN (the import contract), not a fix for a firing bug. Do not expect the
   shopping list to visibly change when Task 1 lands.

2. **The garlic over-pull is a pure DATA bug, and it is live.** Garlic is
   several products, not one:

   | Product | id | type | canonical_unit |
   |---|---|---|---|
   | `garlic cubes (frozen)` | `h0g9xux0yrg84xg` | inventory | each |
   | `garlic cube (pulled)` | `nth208298rbyj8h` | transient | each |
   | `garlic minced` | `4sm6pe82wp97a41` | raw | each |

   Creamy Tomato Soup (`zoch88349g713g8`, qty=2) and Honey-Garlic Roasted
   Broccolini (`towm23or3877720`, qty=3) BOTH point at the same
   `garlic cubes (frozen)` with the same canonical unit `each` — so they already
   merge correctly to 5. The app says "3 cubes" for the broccolini **because the
   node literally says 3**. The recipe was authored as "3 cloves"; the Phase-01
   sweep normalized `cloves → each` while **preserving the quantity 3**. The
   ratio was destroyed at write time, not read time.

3. **The raw-unit evidence is gone.** Because the sweep already flattened
   `clove → each`, the DB no longer records whether a `3 each` node meant 3
   cloves or 3 cubes. **The audit therefore cannot auto-propose a ÷3** — every
   correction is human judgment against the recipe text. This is exactly why the
   `apply-unit-resolutions.js` confirmed-worksheet pattern exists; follow it.

4. **`|undefined` split keys ARE being minted on prod today** — by the 104
   `""`-unit nodes on non-`Stored` products (`shouldCreateInstances` only
   instances `Stored`, so `""` nodes on raw/inventory/transient reach the merge
   path and `canConvert("","") === false`). So the loud-failure logging in Task 1
   **must be a `console.warn`, never a throw** — a throw would crash the shopping
   list on legitimate cleared-container nodes. Scope the warn to non-empty
   unresolvable units so `""` (a deliberate D-01 sentinel) stays quiet and the
   one live `serving` node surfaces.

**Consequence for the plan's shape:** the two todos still land together, but the
ordering rationale inverts. The data fix is the live bug; the code fix is
prevention. Shipping the code fix alone changes nothing a user can see — and
shipping it without the data fix leaves garlic mis-counted. Say so in the
SUMMARY.
</planning_findings>

<tasks>

<task type="auto">
  <name>Task 1: Normalize at the read + write boundaries, make the split loud, regression tests</name>
  <files>recipe-planner/src/lib/aggregation/builders/product-builder.ts, recipe-planner/src/lib/import/build-recipe-graph.ts, recipe-planner/src/lib/aggregation/builders/product-builder.test.ts</files>
  <action>
    **Read boundary** (`product-builder.ts:36-37`). Import `normalizeUnit` from
    `../../units` and replace `const nodeUnit = node.unit || "";` with
    `const nodeUnit = normalizeUnit(node.unit ?? "") ?? node.unit ?? "";`.
    Falling back to the raw string (not `""`) is deliberate: D-08 says an
    unresolvable unit is never guessed and never silently discarded — it stays
    honest, splits, and gets surfaced by the warn below. This one line fixes both
    the merge key (`"cube"` → `"each"` → `canConvert` true → merges) and the
    discrete ceil at `:38` (`getDimension("each") === "count"` → `isDiscrete`
    true). `nodeUnit` also feeds `createMealSource` at `:50`, which is correct
    and wanted.

    **Loud failure** (`resolveMergeTargetKey`, `product-builder.ts:93-104`).
    Before returning the `${baseKey}|${dimension}` split key, when `dimension`
    is `undefined` AND `newProduct.unit` is a non-empty string, `console.warn`
    with the product id, product name, and the offending raw unit, stating the
    line is being split to a key no surface may show and that the node's unit
    needs normalizing (D-08). Do NOT throw and do NOT warn on `""` — see
    planning_findings #4; `""` is the deliberate cleared-container sentinel on
    104 live nodes and a throw would take down the shopping list. Expect this
    warn to fire once on the live `serving` node; that is the warn working.

    **Write boundary** (`build-recipe-graph.ts:132`). `planGraphWrites` is the
    single write path for both `RecipeEditor.handleSave` (which delegates at
    `RecipeEditor.tsx:720`) and the /import page, per Phase 06-04 — so normalize
    here once and both surfaces are covered. Replace `unit: pn.unit,` with the
    same normalize-or-keep-raw expression used at the read boundary. Keep the
    existing empty semantics intact (`""` stays `""`); do not add a WR-01 clear
    sentinel, `unit` is already a plain required string. Note the editor's unit
    input is already an enum-bound Select (`RecipeEditor.tsx:127-128`, DATA-03),
    so the real hole this closes is the import JSON contract, where a skill can
    still emit `"cloves"`.

    **Tests** (`product-builder.test.ts`). Widen `makeNode`'s `unit` param from
    `Unit` to `string` (`RecipeProductNode.unit` is `?: string`, types.ts:99), so
    alias units can be passed without casts; existing call sites are unchanged.
    Add a `mergeNodesAcrossMeals(product, [{node, recipeName, plannedMealId}])`
    helper that drives `buildAggregatedProduct`/`addOrMergeProduct` over ONE
    shared products Map with a distinct recipeName + plannedMealId per entry —
    the existing `mergeNodesForProduct` is single-meal and cannot express this.
    Then add a describe block with:
    (a) two meals, same product, both unit `"cube"` (qty 2 and 3) → assert
        `products.size === 1`, the line is keyed `productId` (no `|undefined`
        key present), `totalQuantity === 5`, and `mealSources` has 2 entries;
    (b) the combined case — meal A `3 "cloves"`, meal B `1 "cube"` → assert ONE
        line of `4 each`. Comment this assertion explicitly: 1:1 is the CORRECT
        and intended result once each node stores its count in the product's own
        unit (which Task 2/3 enforces for garlic); the 3-cloves-to-1-cube ratio
        is deliberately NOT modeled here and is deferred with
        `single-purchase-unit-shopping-lines`. A future reader must not
        "fix" this test into a 2-each expectation without building that model.
    (c) discrete ceil on an alias unit — one node `1 "cube"` scaled by a
        fractional/multiplying mealCount that yields a non-integer (e.g. qty 1,
        mealCount 2.5) → assert `totalQuantity === 3` (ceil), proving the alias
        now takes the same never-under-buy path as `"each"`.
  </action>
  <verify>
    <automated>cd recipe-planner && npx vitest run src/lib/aggregation/builders/product-builder.test.ts && npx tsc --noEmit && npx vitest run && npm run build</automated>
  </verify>
  <done>Alias units merge into one summed line and take the discrete ceil; unresolvable non-empty units warn instead of splitting silently; both write surfaces normalize via planGraphWrites; full suite green, tsc clean, build succeeds. Independently committable — commit this task on its own.</done>
</task>

<task type="auto">
  <name>Task 2: Garlic node-quantity audit script — read-only vs prod, rehearsed on :8091</name>
  <files>recipe-planner/scripts/audit-garlic-node-quantities.js</files>
  <action>
    Build the audit following the established sweep pattern of
    `normalize-node-units.js` + `apply-unit-resolutions.js`: `PB_URL` env var
    defaulting to prod (`http://192.168.50.95:8090`), **dry-run unless `--apply`**,
    superuser auth via `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` from the
    gitignored `.env.local` (never print the values), `fmtError` helper, and
    output under `scripts/dedup-output/`.

    **This task runs READ-ONLY against prod. It must not be invoked with
    `--apply` against prod here — that is Task 3, behind the human gate.**

    Report phase (no writes): fetch products, select every product whose name
    matches /garlic/i, fetch all `recipe_product_nodes` for those products with
    `expand: "recipe"`, and emit a worksheet
    `scripts/dedup-output/garlic-node-quantities.json` in the
    `apply-unit-resolutions.js` shape — an array of rows each carrying
    `{ nodeId, recipeName, recipeStatus, productId, productName, productType,
    currentQuantity, currentUnit, proposedQuantity, evidence, confirmed: false }`.

    **`proposedQuantity` must be seeded equal to `currentQuantity` and
    `confirmed` must be seeded `false` for every row.** Do NOT auto-propose a ÷3:
    per planning_findings #3 the raw `clove`/`cube` string is gone from the DB, so
    the script has no evidence of intent and would be guessing (D-08). The human
    fills in `proposedQuantity` and flips `confirmed`.

    To make that human pass tractable, populate `evidence` per row by fetching
    that node's recipe steps and extracting any instruction/name text matching
    /clove|cube/i (truncated). That recovers the authoring intent from prose
    where the unit field lost it, and is the single highest-value column in the
    worksheet. Also emit a companion Markdown report next to the JSON (same
    convention as `normalize-node-units-unresolved.md`) rendering the rows as a
    table for review.

    Only apply rows where `confirmed === true`, and pre-flight validate before
    any mutation (mirroring `preflightValidate`): `proposedQuantity` must be a
    finite number `>= 0`; reject the run if any confirmed row is malformed. On
    `--apply`, before the first write: call `pb.backups.create()` (the D-06.2
    backup-before-any-mutation guarantee, same as the Plan 08 prod run) and write
    a rollback worksheet `garlic-node-quantities.rollback.json` capturing each
    touched node's BEFORE `{nodeId, quantity, unit}`.

    Rehearsal: run the report against prod read-only, then copy prod to test and
    rehearse the full `--apply` path against the test instance
    (`PB_URL=http://192.168.50.95:8091`) with a synthetic confirmed row, proving
    the write + backup + rollback-worksheet path works before it ever points at
    prod.
  </action>
  <verify>
    <automated>cd recipe-planner && node scripts/audit-garlic-node-quantities.js 2>&1 | tee /tmp/garlic-audit.txt && test -f scripts/dedup-output/garlic-node-quantities.json && node -e "const r=require('./scripts/dedup-output/garlic-node-quantities.json');const rows=Array.isArray(r)?r:r.nodes;if(!rows.length)throw new Error('empty worksheet');if(rows.some(x=>x.confirmed!==false))throw new Error('rows must seed confirmed:false');if(rows.some(x=>x.proposedQuantity!==x.currentQuantity))throw new Error('rows must seed proposedQuantity===currentQuantity (no auto-guess)');console.log('worksheet OK:',rows.length,'rows')"</automated>
  </verify>
  <done>Read-only audit lists every garlic node with its recipe, current qty/unit, and clove/cube prose evidence; worksheet seeds no guesses; `--apply` path rehearsed green on :8091 including backup + rollback worksheet. Prod is untouched. Expect ~20 garlic nodes (probe count 2026-07-16).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Task 1 shipped the code fix (alias normalize at read + write boundaries, loud
    warn on unresolvable splits, regression tests). Task 2 produced a read-only
    prod audit of every garlic node plus a confirmed-worksheet whose rows all
    seed `confirmed: false` / `proposedQuantity === currentQuantity`, rehearsed
    end-to-end on the test instance. **Prod data is still untouched.**
  </what-built>
  <how-to-verify>
    This is the irreversible step. Do not run it unattended.

    1. Open `recipe-planner/scripts/dedup-output/garlic-node-quantities.md` and
       read every row. For each, decide what the quantity SHOULD be in that
       product's own unit — a node on `garlic cubes (frozen)` reading 3 means 3
       cubes. Use the `evidence` column (recipe prose mentioning cloves/cubes)
       and open the recipe in the app where it is ambiguous. Known suspects from
       the 2026-07-16 probe: `towm23or3877720` Honey-Garlic Roasted Broccolini
       qty=3 (the todo says this should be 1), `k2nn479wa423rrj` Mushroom
       Bourguignon qty=3, `zoch88349g713g8` Creamy Tomato Soup qty=2,
       `g996j1m2bbn13nm` Indian Vegetarian (batch) qty=2. The qty=1 nodes are
       likely already correct. Also decide the paired `garlic cube (pulled)`
       transient nodes (several read 0) — they should track their frozen source.
       `garlic minced` is a different product; leave it unless clearly wrong.
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
       the old bundle): a week planning both Creamy Tomato Soup and Honey-Garlic
       Roasted Broccolini shows ONE garlic-cube pull line whose count is the sum
       of the corrected per-recipe quantities.

    **Rollback** if the sweep is wrong: re-apply the BEFORE values from
    `garlic-node-quantities.rollback.json` (each row carries the original
    `{nodeId, quantity, unit}`), or restore the PB backup taken in step 4 from
    the PocketBase admin UI. The edits touch only
    `recipe_product_nodes.quantity`; no schema, no deletes.

    After the write lands and reads back clean, mark BOTH source todos resolved
    (`.planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md`
    and `.planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md`)
    — only now, not before. In each, note that the ratio model was deliberately
    NOT built and remains deferred to `single-purchase-unit-shopping-lines`.
  </how-to-verify>
  <resume-signal>Type "approved" once the prod diff has been reviewed and applied (or describe what looked wrong in the diff)</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean, full `npx vitest run` green (new product-builder alias tests included), production build succeeds.
- Prod garlic nodes read back with human-confirmed quantities; PB backup id and rollback worksheet both recorded.
- Both source todos moved to resolved, each noting the deferred ratio model.
</verification>

<success_criteria>
Alias units can no longer split a product into an invisible second line or skip
the discrete ceil, and can no longer enter via the import contract; an
unresolvable unit now warns loudly instead of silently minting a `|undefined`
line. Garlic nodes in prod carry quantities that mean what they say in each
product's own unit, corrected under an explicit human gate with a backup and a
rollback path. The clove↔cube ratio model is untouched and still open for
`single-purchase-unit-shopping-lines`.

**The SUMMARY must state plainly:** the code fix alone is a latent-bug guard with
no visible effect on today's prod data (zero alias units remain after the Phase
01-08 sweep); the garlic over-pull was fixed by the DATA correction, not by the
code. Shipping the code without the data fix would have left garlic mis-counted.
</success_criteria>
</content>
</invoke>
