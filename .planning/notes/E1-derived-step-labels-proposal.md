# E1 Design Proposal — Derived Step Labels + Swap-Aware Naming

_Drafted 2026-07-18. Status: **PROPOSAL — no code written.** For review before any
implementation. Covers Group E1 (`.planning/todos/BACKLOG-GROUPS.md`): the three
todos `2026-07-17-pull-step-names-drift-across-recipes`, `swap-aware-prep-naming`,
and `connective-recipe-batch-then-consume` thread 3._

---

## 1. The problem in one sentence

Authored free-text `step.name` (and the fused-name prep-state output products) don't
reflect the recipe graph, so (a) the same action drifts across recipes
(`pull out X` / `Pull frozen garlic cube` / `Pull garlic cubes`) and (b) an
ingredient swap re-points a prep step's input but leaves its title and its output
product's name stale (`dice sweet potato` still says "sweet potato" after swapping
to potato).

## 2. What already exists (so we build, not rebuild)

Grounded in a prod probe + code map on 2026-07-18:

- **`RecipeStep.prep_action` already exists** (Phase 5 PREP-02) and is **already a
  DB-enforced PocketBase `select` enum** — `apply-phase5-schema.mjs:107` values
  `["sliced","diced","minced","chopped","grated","shredded"]`. The single source of
  truth is `PREP_VERBS` (`src/lib/linter/rules/prep-words.ts:9-16`), currently
  **duplicated** (not imported) into `RecipeEditor` (`PREP_ACTION_OPTIONS:89-95`) and
  the schema script. It is populated on 78/229 steps, values clean (diced 39, sliced
  21, chopped 10, shredded 4, minced 3, grated 1).
- **`prep_action` is metadata-only today** — used by lint (`missing-prep-action.ts`),
  scheduler chopping-batch grouping (`genetic.ts:439`), and the merged-prep label
  (below), but **never rendered on a step card**. `StepNode` even declares the prop
  (`:16`) but doesn't draw it. Cards show `step.name`.
- **A derived-label pattern already exists** in `week-graph.ts`:
  `memberActionLabel(step)` = `prep_action || <leading verb of name> || "prep"`
  (`:134-137`); `makeMergedPrepStep` synthesizes `` `Prep ${productName}${breakdown}` ``
  (`:143-179`); `makeMergedPullStep` synthesizes `` `Pull ${productName}` `` (`:191-212`).
  Crucially `productName` comes from the **input product node**, so these labels are
  **already swap-aware for merged nodes**. This proposal generalizes that pattern to
  un-merged steps.
- **Swaps** (`applyVariantOverrides`, `variant-utils.ts:183-276`, commit `9cf9206`)
  rewrite only the input node's `product` relation (same node id); they never touch
  `step.name` or the output node. So any label that reads the post-swap input product
  becomes swap-aware **for free**.

## 3. The data splits into three step classes (this drives everything)

From the full leading-verb bucket of all 229 prod step names:

| Class | Examples | Count | Input cardinality | Derivable? |
|---|---|---|---|---|
| **Knife-prep** | dice/small-large-fine dice, slice, chop, chiffonade, mince, shred, grate, halve, quarter, brunoise, zest, juice, trim, peel | ~81 | **all single-input** (verified {1:81}) | **Yes — cleanly.** `"{cut} {input}"` |
| **Pull / inventory** | pull (16), take-out-of-freezer (3) | ~19 | single inventory input | Yes — from inventory input (week-graph already does merged case) |
| **Cook / assembly / instructional** | cook (31), roast (13), simmer, bake, assemble (12), combine (9), make, `"Melt butter, saute onion ~8 min, add garlic…"` | ~110 | multi-input, prose | **No — keep authored.** Derivation destroys real instructions. |

**Key feasibility result:** all 81 knife-prep steps have exactly one input product, and
deriving even *fixes* existing drift — authored `"dice potatoes"` whose input is
actually `sweet potato` derives to `"diced sweet potato"`.

**Implication:** the model must be a **hybrid** — a controlled action drives a derived
label *only where the step opts in*; instructional steps keep their authored prose.
This is not "derive everything."

## 4. Two independent naming layers (the todos conflate them; we shouldn't)

1. **Step title** (`step.name`) — what the cook reads on the card. Low-risk to derive.
2. **Prep-state output product name** — the `Transient`/`Stored` product a prep step
   *emits* (`onion (yellow) small-dice`, `rice cooked`, `basil chiffonade`). Prod has
   **86 transient + 68 stored** such products; 219 step-output nodes → 157 distinct
   fused names. The node model has **no prep-state flag** — a node's kind derives from
   its linked `product.type` (`Raw`/`Transient`/`Stored`/`Inventory`), and the
   "diced onion" concept lives entirely in the authored output product's name.

Layer 1 is a display change. **Layer 2 is a data-model change** (see §6). They should
ship as separate decisions; layer 1 delivers most of the felt value.

## 5. Proposed controlled vocabulary (`prep_action` → first-class enum)

Promote the existing string list to a TS enum + widen it, with **one source of truth**
imported everywhere (kill the 3-way duplication). Group by class so display knows how
to render each:

- **Cut actions** (render `"{label} {input}"`): `dice`, `small_dice`, `large_dice`,
  `fine_dice`, `brunoise`, `slice`, `thin_slice`, `chop`, `mince`, `shred`, `grate`,
  `halve`, `quarter`, `zest`, `juice`, `trim`, `peel`, `florets` (for
  break-down/process-to-florets).
- **Inventory action** (render `"Pull {input}"`): `pull`.
- **Everything else**: no `prep_action` → **keep authored `name`.** We do *not* add
  cook/assembly verbs to the vocab; those stay prose.

Open vocab questions for you: (a) model size as separate actions
(`small_dice`/`large_dice`) — recommended, matches the data — vs a separate `size`
field; (b) is `florets` an action or does "process broccoli into florets" stay
authored?; (c) display casing — `"diced onion"` (past-tense, matches current
`prep_action` values) vs `"dice onion"` (imperative).

## 6. Layer-2 options — prep-state output product naming (the hard one)

Pick one; each has a distinct migration cost.

- **Option A — Derive output name from base + state (least invasive).** Keep the
  transient/stored product records but give each a `base_product` link + reuse the
  producing step's `prep_action`; **derive** the displayed name as `"{state} {base}"`.
  On swap, re-point `base_product` (or read the producing step's post-swap input) →
  name re-derives. Migration: backfill `base_product` on ~86+ transient products; no
  edge rewiring. Downstream consumers keep working (same product ids).
- **Option B — Collapse prep-state into the graph (cleanest, biggest).** Stop modeling
  "diced onion" as its own product. The output node points at the **base** product
  (`onion`) and carries the state (`diced`) on the node/edge. Eliminates the 86
  transient products. Migration: rewire 219 output nodes + every downstream consumer
  edge, collapse duplicate products, re-point aggregation keys. High risk, touches the
  cross-recipe fan-in match (`week-graph.ts:271-297` matches on
  `outputNode.product === inputNode.product`).
- **Option C — Defer layer 2 entirely.** Ship layer-1 derived step titles now; leave
  output-product names authored. The swap still leaves the *downstream* consumer's
  label stale, but the cook-facing prep card is fixed. Lowest risk.

**Recommendation:** Option C first (ship layer 1), then Option A as a follow-up if the
stale downstream name proves annoying in practice. Option B only if we later decide the
transient-product proliferation is itself a problem worth a migration.

## 7. Proposed implementation model (layer 1)

- **`deriveStepLabel(step, inputProductName)`** — new pure helper. If `step.prep_action`
  is a cut action → `"{label(prep_action)} {inputProductName}"`; if `pull` →
  `"Pull {inputProductName}"`; else → `step.name` (authored fallback). Generalizes
  `memberActionLabel`/`makeMergedPrepStep`; the merged-node code collapses onto it.
- **Route the display surfaces through it** (from the code map): `CookMode.tsx`
  (348, 995, 1171), `NowNextCard.tsx:170`, `BatchPrepPrintView.tsx` (246, 345),
  `BatchPrepTab.tsx:102`, `RecipeEditor.tsx:357` (`StepNode` label), plus surface the
  value in `StepNode` which already has the prop. Each needs the step's single input
  product name in scope — the graph already has it at every call site.
- **Authoring:** in `RecipeEditor`, once `prep_action` is set, show the *derived* label
  as the step's display name (and keep a raw-`name` override escape hatch for the
  instructional steps). Import (`build-recipe-graph.ts:173`, `validate-import.ts`)
  already round-trips `prep_action`.
- **Single source of truth:** move `PREP_VERBS` → a `prep-actions.ts` enum + label map,
  import it into the linter, `RecipeEditor`, `StepBackfill`, and reference the same list
  from the schema script. Update the PocketBase `select` values via a new
  `apply-*-schema.mjs` (the enum widens, so the DB select must widen too or writes 400).

## 8. Migration / backfill plan

1. **Schema:** widen the `prep_action` PocketBase `select` to the new vocab (new
   `scripts/apply-e1-schema.mjs`, mirrors `apply-phase5-schema.mjs`). Additive → the
   151 steps with empty `prep_action` still validate.
2. **Backfill knife-prep steps:** offline script — for each step whose leading verb is a
   cut verb, set `prep_action` from the verb (map `small dice`→`small_dice`,
   `brunoise`→`brunoise`, fix typos `smal`/`chiffonnade`, `process…florets`→`florets`).
   ~81 steps. Dry-run + APPLY gated, like `fix-lint-canonical-units.mjs`.
3. **Backfill pull steps:** set `prep_action=pull` on the ~19 pull/take steps.
4. **Verify derived labels** read correctly against real recipes (cook-mode + batch
   prep) before/after; spot-check the swap flow re-derives.
5. **(If Option A later)** separate migration to add `base_product` to transient/stored
   products.

Prod-write steps need superuser creds (`node --env-file=.env.local`, blocked-by-
classifier from this agent → you run them). Deploy per DEPLOYMENT.md; hard-refresh tablet.

## 9. Suggested phasing (each independently shippable)

- **E1-a — Derived knife-prep + pull step titles (layer 1, Option C).** Vocab enum +
  `deriveStepLabel` + route display surfaces + backfill 100 steps. Delivers the
  swap-aware step-title win and kills pull-name drift on every surface. **Recommended
  first slice.**
- **E1-b — Prep-state output product naming (layer 2, Option A).** Only if the stale
  downstream name matters after E1-a ships.
- **E1-c — Import-time model (connective todo thread 4).** Blocked on Phase 6 import;
  out of scope here.

## 10. Decision needed from you

1. Approve the **hybrid** model (derive only where `prep_action` set; instructional
   steps keep prose)? 
2. Approve the **vocab** in §5 (and answer the three open sub-questions)?
3. Layer-2: **Option C-then-A** (recommended), or go straight to A/B?
4. Start with **E1-a** as the first slice?

---

## 11. LOCKED DECISIONS (user, 2026-07-18)

1. **Hybrid model — APPROVED.** Derive a label only where `prep_action` is set;
   instructional cook/assembly steps keep their authored prose.
2. **Single flat `prep_action` enum — APPROVED.** One field whose values are all the
   flat permutations needed (size baked in: `small dice`/`large dice` are distinct
   values, NOT a separate `size` field). **No `florets` action** — the
   break-down/process-to-florets steps use action `process`.
   - **Two display forms per action** (the `process`/`processed` example): each action
     key maps to `{ verb, state }`. **Step titles use the imperative verb**
     (`process broccoli`, `dice onion`); **prep-state output products use the
     past-participle state** (`processed broccoli`, `diced onion`). Handles irregulars
     (`brunoise`, `chiffonade`) via the static map rather than auto-suffixing. One DB
     field, forms live in a display map.
3. **Layer 2 = Option A now, then B later — APPROVED.** Do NOT defer (skip Option C).
   Derive output-product names from base + state in Option A; the graph-collapse
   Option B comes as a later pass.
4. **Start with E1-a — APPROVED.** Sequence: E1-a (derived step titles, layer 1) →
   E1-b (Option A output-product names, layer 2) → later Option B.

### Locked vocabulary (`prep_action` key → {verb, state})

| key | verb (step title) | state (output product) |
|---|---|---|
| `dice` | dice | diced |
| `small_dice` | small dice | small-diced |
| `large_dice` | large dice | large-diced |
| `fine_dice` | fine dice | fine-diced |
| `brunoise` | brunoise | brunoised |
| `slice` | slice | sliced |
| `thin_slice` | thinly slice | thinly sliced |
| `chiffonade` | chiffonade | chiffonade |
| `chop` | chop | chopped |
| `mince` | mince | minced |
| `shred` | shred | shredded |
| `grate` | grate | grated |
| `halve` | halve | halved |
| `quarter` | quarter | quartered |
| `zest` | zest | zested |
| `juice` | juice | juiced |
| `trim` | trim | trimmed |
| `peel` | peel | peeled |
| `process` | process | processed |
| `pull` | pull | pulled |

(String forms centralized in one map — easy to tweak later. `pull` renders the title as
`Pull {input}`.)
