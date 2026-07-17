---
created: 2026-07-12
title: Unresolvable-unit split mints an invisible duplicate line (`""`-driven, not alias-driven) — merge-semantics fix deferred
area: general
files:
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts:36-52 (nodeUnit — now normalized via normalizeUnit; the read-boundary half of this todo SHIPPED under 260716-rpp)
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts:104-135 (resolveMergeTargetKey — the `|undefined` split; now console.warn's on a non-empty unresolvable unit, but the split itself is UNCHANGED and deliberately deferred)
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts:141-165 (addOrMergeProduct — the merge branch; the `if (merged)` guard at ~152 silently discards data if this is ever made order-independent naively)
  - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts (PIN: deferred "" split bug, both orderings — the executable record of what a real fix must handle)
  - recipe-planner/src/lib/aggregation/utils/product-utils.ts:43-64 (mergeQuantities — bails on !canConvert, returns null for a dimensionless existing unit)
  - recipe-planner/src/lib/units.ts:38-53 (UNIT_DIMENSIONS — 15 canonical keys only)
  - recipe-planner/src/lib/units.ts:87-105 (UNIT_ALIASES — 17 aliases; now normalized at both the aggregation read boundary and the import/editor write boundary)
  - recipe-planner/src/lib/units.ts:111-122 (canConvert — unknown unit is never convertible; the guard this todo's naive fix would need to deliberately relax)
  - recipe-planner/src/lib/units.ts:148-153 (normalizeUnit — now called at both the aggregation read path and build-recipe-graph.ts's write path)
  - recipe-planner/src/lib/import/build-recipe-graph.ts:132-138 (planGraphWrites — now normalizes unit on write, closing the import-JSON-contract hole; SHIPPED under 260716-rpp)
---

## Retracted (2026-07-16)

A 2026-07-16 orchestrator probe ran the REAL aggregation code (`npx tsx`) against
live prod and the live week plan `71ukhycp2v4s0fw` ("week of 7/13"). This
retracts most of the original diagnosis below:

- **The headline symptom is NOT reproducible.** This todo originally claimed
  "the app only told us to pull 1 garlic cube" because two recipes' quantities
  "never got summed." Week 7/13 plans Creamy Tomato Soup, Honey-Garlic
  Broccolini, AND Mushroom Bourguignon on the same `garlic cubes (frozen)`
  product, all unit `each` — `buildProductFlowGraph` merges them correctly into
  ONE line, `total=8 each, sources=3`. There is no split and no under-count on
  that product. The app was already merging correctly and faithfully reporting
  a wrong number (see the sibling `garlic-cube-clove-unit-conversion` todo,
  which carries the real, live 3x over-pull).
- **Zero alias units exist in prod.** Full `recipe_product_nodes.unit`
  histogram: `each`(199), `cup`(115), `""`(104), `tbsp`(49), `tsp`(30),
  `lb`(19), `oz`(16), `qt`(11), `fl_oz`(2), `serving`(1). No `cube`, no
  `clove`, no `ea`. The Phase 01-08 `normalize-node-units.js` sweep already
  flattened every alias in `recipe_product_nodes.unit` to its canonical form.
  This todo's proposed fix (`normalizeUnit(node.unit ?? "") ?? node.unit ?? ""`
  at the read boundary) is real and worth having as a guard against a *future*
  alias entering the data, but it fixes nothing live today.
- **The proposed one-line fix would not have touched the live bug even before
  the sweep.** `normalizeUnit("")` returns `null`, the expression falls back to
  the raw `""`, and the line still splits. The `|undefined` split that actually
  fires live is driven by the `""` D-01 sentinel, not by an alias.
- The "⚠️ Interaction with `garlic-cube-clove-unit-conversion`" section below
  is retracted in full: cloves and cubes cannot mis-merge at a wrong 1:1 ratio
  today, because every live garlic node already uses `each` — there are no
  cloves in prod to merge against. See the pointer at the bottom of this file
  for where the ratio model actually lives now.

**What shipped under 260716-rpp Task 2** (latent-bug prevention, zero visible
effect on today's data — see files list above): `normalizeUnit` is now called
at the aggregation read boundary AND the `planGraphWrites` write boundary (the
single write path for both `RecipeEditor.handleSave` and the `/import` page).
A non-empty unresolvable unit now `console.warn`s when it is about to split
into an invisible second line. `""` stays quiet (it is a deliberate, frequent,
live sentinel — see below). **The merge-semantics fix below was NOT shipped —
it is the live-but-latent finding this todo now carries forward.**

## Problem (rewritten 2026-07-16 to match the verified probe)

The `|undefined` split IS minted live today — but by the `""` D-01 sentinel,
not by an alias. `canConvert("", "")` is false for the exact same reason
`canConvert("cube", "cube")` was false before Task 2's normalize: two
dimensionless units must never be treated as convertible (`units.ts:111-122`'s
comment explains why — `undefined === undefined` would read as `true` and
`convert` would return `NaN`, silently corrupting the merged quantity).

On week 7/13 the flow graph produces TWO lines for one transient product:
`key="nth208298rbyj8h"` (`garlic cube (pulled)`, unit `each`, total 0) AND
`key="nth208298rbyj8h|undefined"` (same product, unit `""`, total 0) — visible
as two identical `garlic cube (pulled)` outputs on the pull step.

**`""` is a deliberate D-01 sentinel on 104 live nodes** (all 5 raw `""` nodes
have qty 0; `stored` is 59/76 `""`). It marks a cleared/not-yet-set unit, not
an authoring error, and it must stay quiet — a throw here would crash the
shopping list for every one of those 104 nodes.

**Currently manifesting only as a duplicate 0-qty transient line on a cook
card.** `qty=0` on transients is the convention, not a bug (60 of 129 transient
nodes are 0) — so the duplicate reads as noise on the cook card, not a wrong
number. **Latent for 14 products with a mixed unresolvable+canonical unit
spread** (`garlic cube (pulled)`, `onion (yellow) small-dice`, `onion (yellow)
large dice`, `onion (red) large dice`, `sweet potato large dice`, `broccoli
florets`, `parsley chopped`, `lemon juice`, `tahini sauce`, `cucumber sliced`,
`broccoli patties`, `salt` (raw, tsp+`""`), `pepper black` (raw, tsp+`""`),
`pork shoulder roast` (raw, `""`+each)) — these would split if one week planned
the relevant recipes together, but verified on week 7/13 the shopping list
currently shows exactly ONE `salt` line and ONE `pepper black` line, no
duplicates. Do not overstate this as live shopping-list corruption — for
raw/shopping-list products it is latent, not firing.

## Solution — what shipped, and what is DEFERRED (carried here for the next reader)

**Shipped (260716-rpp Task 2):** normalize at the read + write boundaries, plus
the `console.warn` on a non-empty unresolvable unit's split. See the files list
above for exact locations.

**NOT shipped — deferred, this is the load-bearing finding to act on next.**
The obvious candidate fix ("a dimensionless unit with quantity 0 absorbs into
the base line — a D-01 sentinel carries no quantity to lose") is
**order-dependent**, and the naive order-independent version silently destroys
data:

- `resolveMergeTargetKey` (`product-builder.ts:104-135`) returns `baseKey`
  whenever no base exists yet. So the absorb rule only fires when the `""`
  node arrives SECOND. If it arrives FIRST it claims the bare key with unit
  `""`, and the later real `each` node hits `canConvert("", "each") === false`
  → `getDimension("each") === "count"` → gets exiled to `${baseKey}|count`. The
  duplicate line survives, now with the REAL quantity on the split key.
- Making it order-independent requires the base line to YIELD to the incoming
  — rewriting `addOrMergeProduct`'s merge branch (`~141-165`). That branch
  rests on the documented invariant that `merged` is guaranteed non-null when
  `resolveMergeTargetKey` returns an existing key. With a dimensionless
  *existing* unit, `mergeQuantities` returns `null`
  (`product-utils.ts:52`, `canConvert` guard), the `if (merged)` guard skips,
  and **the incoming 8 `each` is silently discarded** — strictly worse than a
  duplicate line.
- That makes the honest fix a rewrite of the merge branch plus a deliberate
  relaxation of DATA-01's convert-or-split contract, whose guard is explicitly
  load-bearing (`units.ts:111-122`): two dimensionless units "must NOT be
  treated as convertible — otherwise `undefined === undefined` reads as `true`
  and `convert` returns NaN, silently corrupting the merged quantity."
- **Blast radius vs. payoff:** this merge path runs for every product on every
  surface, and 14 products carry a mixed unresolvable+canonical spread. The
  live symptom it would fix is ONE duplicate `garlic cube (pulled) 0` line on a
  cook card — and a `0` transient is the convention, so the duplicate reads as
  noise, not a wrong number. Trading a silent-corruption risk across every
  shopping line for a cosmetic dedup was judged a bad trade for a quick task.

**Executable record of the finding:** `product-builder.test.ts`'s
`"PIN: deferred \"\" (dimensionless) split bug, both orderings"` describe block
pins BOTH orderings as CURRENT (known-wrong) behavior:
- base-first (real unit arrives first, `""` second): duplicate line survives,
  base holds the real quantity, no warn (`""` stays quiet).
- sentinel-first (`""` arrives first, real unit second): the bare key holds
  the `""` line, the real quantity is exiled to the dimension-suffixed split
  key — proving it is NOT silently dropped, which is the failure mode any
  order-independent fix must avoid.

Whoever picks this up must: (1) handle both orderings, (2) not let the
null-merge guard at `addOrMergeProduct` drop a real quantity when the existing
line is dimensionless, and (3) deliberately relax (not quietly bypass)
`canConvert`'s convert-or-split guard for this one case. When that lands,
rewrite the two pin tests to the new contract — their current failure at that
point is expected, not a regression.

## Ratio model — pointer only

Drop the retracted "⚠️ Interaction" section's premise entirely: cloves and
cubes cannot mis-merge 1:1 today, because every live garlic node already uses
`each` — see `garlic-cube-clove-unit-conversion` for the real, live 3x
over-pull and its deferred ratio-model layer 2, which is where the
clove↔cube conversion work actually belongs (tracked jointly with the pending
`single-purchase-unit-shopping-lines` todo).
