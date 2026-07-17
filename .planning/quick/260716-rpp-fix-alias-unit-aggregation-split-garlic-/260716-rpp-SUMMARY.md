---
quick_id: 260716-rpp
type: quick
status: incomplete
completed: null
files_modified:
  - recipe-planner/scripts/audit-garlic-node-quantities.js
  - recipe-planner/src/lib/aggregation/builders/product-builder.ts
  - recipe-planner/src/lib/aggregation/builders/product-builder.test.ts
  - recipe-planner/src/lib/import/build-recipe-graph.ts
  - .planning/todos/pending/2026-07-12-alias-units-break-cross-recipe-aggregation.md
  - .planning/todos/pending/2026-07-12-garlic-cube-clove-unit-conversion.md
commits:
  - "1f3725e feat(260716-rpp): add garlic node-quantity audit script — read-only vs prod, rehearsed on :8091"
  - "997c74c feat(260716-rpp): normalize alias units at read+write boundaries, warn on unresolvable splits (latent-bug prevention)"
  - "40d87ed docs(260716-rpp): correct both garlic-unit todos against the verified 2026-07-16 prod probe"
---

# Quick Task 260716-rpp: Fix garlic over-pull data bug + harden aggregation merge against unresolvable-unit splits

**Tasks 1-3 of 4 complete. Task 4 — the human-gated prod `--apply` that actually fixes the garlic over-pull — has NOT run. Prod data is untouched: the week of 7/13 still pulls 8 garlic cubes, not the corrected ~4.**

## Status: INCOMPLETE — blocking human checkpoint outstanding

This plan ships in four tasks, in descending order of real value:
1. Build + rehearse the read-only prod audit script (DONE)
2. Harden the aggregation read/write boundaries against alias-unit splits (DONE — but see "no visible effect" below)
3. Correct both source todos' disproven diagnosis (DONE)
4. **The human-gated prod `--apply` that corrects the garlic node quantities (NOT DONE — this is the checkpoint that fixes the bug the user actually sees)**

Per the execution constraints for this run, Task 4 was deliberately NOT executed — it is a `checkpoint:human-verify` gated `blocking-human` requiring a human to read the full worksheet, decide corrected quantities from recipe evidence, confirm rows, dry-run, and only then apply against prod. That review has not happened yet.

**The most important thing to say plainly: the code fix (Task 2) has NO visible effect on today's prod data.** Zero alias units exist in prod (the Phase 01-08 sweep already flattened `cube`/`clove`/`ea` etc. to canonical `each`). The garlic over-pull is a DATA bug — a node literally stores `quantity=3` on a product measured in cubes — and it is still live in prod exactly as it was before this session. Nothing a user can see has changed yet.

## What shipped

### Task 1 — `scripts/audit-garlic-node-quantities.js` (commit `1f3725e`)

Read-only audit against prod (default `PB_URL`), following the established
`normalize-node-units.js` + `apply-unit-resolutions.js` pattern:

- **Report phase (no writes):** fetches every garlic-named product, every `recipe_product_node` against them, and recovers clove/cube authoring evidence from the owning recipe's steps (the raw unit string is gone from the DB, so recipe prose is the only surviving evidence of intent). Emits `scripts/dedup-output/garlic-node-quantities.json` (gitignored) and a companion Markdown report, both seeded with `proposedQuantity === currentQuantity` and `confirmed: false` on every row — no auto-guessed correction (D-08).
- **Apply phase (gated behind `--apply` + an existing human-confirmed worksheet):** pre-flight validates confirmed rows (`proposedQuantity` finite ≥ 0), takes a PB backup via `pb.backups.create()` before the first write, writes a BEFORE-state rollback worksheet, then updates only `recipe_product_nodes.quantity` on confirmed rows.
- **Rehearsal:** ran the report against prod (20 garlic nodes across 7 products found — matches the plan's ~20 estimate and all 4 known suspects exactly: `towm23or3877720` qty=3, `k2nn479wa423rrj` qty=3, `zoch88349g713g8` qty=2, `g996j1m2bbn13nm` qty=2). Synced prod → test via `sync-to-test.js` (IDs are preserved across the copy). Hand-edited one node to a synthetic `confirmed: true` row, ran the dry-run against `:8091` (diff matched intent exactly), then `--apply`'d against `:8091` — printed the backup id, wrote the rollback worksheet BEFORE the write, and the update landed (`quantity: 1 -> 2`, verified via read-back). Confirmed the corresponding prod node was untouched (`quantity: 1`, unchanged) both before and after the rehearsal. The pristine worksheet (20 rows, all `confirmed: false`) was regenerated before commit.

**Rehearsal result: PASSED, end to end** — dry-run diff, backup id, rollback worksheet written before the write, applied update, read-back confirmation, and a direct prod-untouched check.

### Task 2 — Alias unit normalization at read + write boundaries (commit `997c74c`)

**Framed honestly: latent-bug prevention with zero visible effect on today's data.**

- Read boundary (`product-builder.ts` `buildAggregatedProduct`): `nodeUnit` now resolves through `normalizeUnit(node.unit ?? "") ?? node.unit ?? ""` instead of the raw `node.unit || ""`. This fixes both the merge key (`"cube"` → `"each"` → merges) and the discrete ceil (`getDimension("each") === "count"` → ceil applied) for any future alias unit. Falls back to the raw string (never silently to `""`) when unresolvable, per D-08.
- Loud failure (`resolveMergeTargetKey`): `console.warn`s with product id/name/raw unit when a **non-empty** unresolvable unit is about to split into an invisible second line. `""` deliberately stays quiet — it's the D-01 cleared-container sentinel on 104 live prod nodes, and a throw here would take down the shopping list.
- Write boundary (`build-recipe-graph.ts` `planGraphWrites`): same normalize-or-keep-raw applied at the single write path shared by `RecipeEditor.handleSave` and the `/import` page (Phase 06-04), closing the import-JSON-contract hole (a skill can still emit `"cloves"`; the editor's own unit input is already enum-bound).
- **Deliberately NOT changed:** `resolveMergeTargetKey`'s `|undefined` split and `addOrMergeProduct`'s merge branch. This is the deliberately deferred merge-semantics fix (see "Deferred work" below) — pinned by two new tests asserting current (known-wrong) behavior in both node orderings, so the finding is executable, not folklore.
- Tests added to `product-builder.test.ts`: alias merge (two meals, `"cube"` → one 5-each summed line, no split key), alias discrete ceil (matches `"each"`'s never-under-buy ceil), combined `"cloves"` + `"cube"` merging 1:1 into one 4-each line (correct today; the 3:1 ratio model is explicitly NOT built here), and the two split-bug pin tests (base-first, sentinel-first).
- Verification: 11/11 new tests + 301/301 full suite green, `tsc --noEmit` clean, production build succeeds.

### Task 3 — Corrected both source todos (commit `40d87ed`)

Both todos carried a disproven diagnosis, which is itself a defect. Both now carry a `## Retracted (2026-07-16)` section recording what the original claimed vs. what the verified probe found:

- `alias-units-break-cross-recipe-aggregation.md` — retitled to reflect that the live split is `""`-driven (the D-01 sentinel), not alias-driven (zero aliases exist in prod). Retracts the "app only pulled 1 garlic cube" headline symptom as not reproducible, and retracts the "⚠️ Interaction" section in full (no live cloves+cubes 1:1 mis-merge is possible — every garlic node already uses `each`). **Stays PENDING** — it is now the carrier for the deliberately deferred `|undefined` merge-semantics fix, pointing at the two pin tests shipped in Task 2 as the executable record.
- `garlic-cube-clove-unit-conversion.md` — keeps its correct headline (3x over-pull, corrected suspect list) but re-attributes root cause to destroyed data (the Phase-01 sweep flattened `clove`/`cube` → `each` while preserving the quantity) rather than a `units.ts` modeling gap firing today. Layer 1 (data fix) now points at `scripts/audit-garlic-node-quantities.js`; layer 2 (ratio model) stays deferred to `single-purchase-unit-shopping-lines` and is marked not currently load-bearing. **This todo resolves in Task 4, not here** — it remains in `pending/` until the prod write lands and reads back clean.

## What did NOT happen (and why)

**Task 4 — the human-gated prod `--apply`.** This is the ONLY step that fixes the bug a user actually sees, and it was deliberately not run in this session. It requires:
1. A human to read every row in `scripts/dedup-output/garlic-node-quantities.md`, decide the corrected quantity per node using the evidence column + the recipe itself, and hand-edit the JSON worksheet to set `proposedQuantity` and `confirmed: true` only on the rows they've actually decided.
2. A dry-run against prod, reading the full diff.
3. Only then, `--apply` against prod — printing the backup id and rollback worksheet.
4. A read-back confirmation and a live app check (with a hard-refresh, per the known NAS-deploy caching quirk) that the week of 7/13 now shows ~4 garlic cubes instead of 8.
5. After that lands clean, moving `garlic-cube-clove-unit-conversion.md` to resolved (leaving the alias todo pending, as it now carries the deferred merge-semantics work).

**Prod garlic data remains exactly as it was before this session.** `garlic cubes (frozen)` nodes `towm23or3877720` (qty=3), `k2nn479wa423rrj` (qty=3), `zoch88349g713g8` (qty=2), and `g996j1m2bbn13nm` (qty=2) are all unchanged. The week-of-7/13 shopping/pull list still shows 8 garlic cubes where the corrected total is roughly 4.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1-3. The one design decision made during Task 1's implementation, not spelled out verbatim in the plan text, was how the single script handles both worksheet-generation and worksheet-driven dry-run/apply in one invocation:

**[Rule 2 — design completion] `audit-garlic-node-quantities.js`'s dual-mode load-or-generate logic.** The plan's checkpoint steps imply the *same* command (`node scripts/audit-garlic-node-quantities.js`, no flags) is used both to generate the initial worksheet AND to dry-run diff a human-edited worksheet. Implemented as: if `scripts/dedup-output/garlic-node-quantities.json` does not exist, build it fresh from live PB data (report phase); if it exists, load it as-is (preserving human edits) and print/apply confirmed-row diffs. `--apply` requires an existing worksheet (errors clearly if absent). This was necessary to make the plan's Task 4 checkpoint steps 2-4 work as written, and was verified by the full rehearsal (generate → edit → dry-run → apply → read-back → regenerate-pristine) in this session.

## Known Stubs

None. No hardcoded empty/placeholder values were introduced.

## Threat Flags

None. `audit-garlic-node-quantities.js` follows the exact auth/backup/dry-run-by-default conventions of the existing `merge-products.js` / `normalize-node-units.js` / `apply-unit-resolutions.js` scripts (superuser creds sourced from gitignored `.env.local`, never printed; `--apply` explicitly opt-in; backup-before-mutation via `pb.backups.create()`). No new network endpoints, auth paths, or schema changes — it only reads existing collections and, when gated, writes a single existing field (`recipe_product_nodes.quantity`).

## Self-Check: PASSED

All 6 modified/created files confirmed present on disk. All 3 commit hashes (`1f3725e`, `997c74c`, `40d87ed`) confirmed present in `git log --oneline --all`.
