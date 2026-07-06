---
phase: 01-data-hygiene
verified: 2026-07-06T18:20:00Z
status: human_needed
score: 7/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "Split shopping-list lines render with distinct stable identities — no React duplicate-key warning, one checkbox never toggles two lines, per-source breakdown visibly sums to the line total (DATA-01, Plan 03 truth)"
    test: "Open the app on a plan whose shopping list contains a product split across two dimensions (e.g. one node in cup, one in lb) and a merged multi-source line (white-bean olive oil 0.25 cup + 2 tbsp). Confirm: two distinct split rows appear, no console duplicate-key warning, checking one row's box does not toggle the other, and the per-recipe breakdown quantities sum to the displayed line total."
    expected: "Split lines are visually distinct and independently checkable; merged line shows 6 tbsp / 0.375 cup with a breakdown that adds up."
    why_human: "No component/browser test harness exists (jsdom/@testing-library intentionally uninstalled per 01-RESEARCH.md). lineId threading and merge math are verified in code + unit tests, but the rendered DOM behavior (dup-key warning, checkbox isolation) is not exercised by any automated test."
human_verification:
  - test: "Shopping-list split-line rendering — see behavior_unverified_items[0]"
    expected: "Distinct independently-checkable split rows, no duplicate-key warning, breakdown sums to total"
    why_human: "UI rendering behavior, no component-test harness"
  - test: "RecipeEditor node unit input — open the add/edit product dialog for a non-stored product and confirm the Unit field is a dropdown of enum tokens (tsp, tbsp, cup, g, lb, each, ...) with no way to type free text"
    expected: "Enum-bound dropdown only; free-text unit entry is impossible"
    why_human: "Visual/interactive confirmation; code shows an enum-bound MUI Select (constrained by construction) but the rendered UX was not captured by a test"
---

# Phase 1: Data Hygiene Verification Report

**Phase Goal:** The recipe data layer is unit-disciplined and duplicate-free, so every downstream aggregation (shopping list, prep, containers) is trustworthy by construction.
**Verified:** 2026-07-06T18:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is a backend/data-layer guarantee, and every load-bearing piece is verified in the codebase and tests: an exact-factor unit conversion module with a CR-01 regression guard, convert-or-split aggregation with stable lineIds, a four-rule linter on two surfaces, the container-as-unit overload removed with an enum-bound editor input, decisions.md reconciled to the real signature-based aggregation, and a live prod migration whose end state is attested by the current `pb_schema.json` export (canonical_unit/dimension fields + the `(name COLLATE NOCASE, type)` unique index). Two downstream UI-rendering behaviors remain human-verifiable only.

### Observable Truths

| # | Truth (Success Criterion / Requirement) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Aggregation never silently sums mismatched units; same-dimension combines, cross-dimension splits into distinct lines (DATA-01, DATA-02) | ✓ VERIFIED | `product-builder.ts` `resolveMergeTargetKey`+`canConvert`; tests: white-bean anchor merge, order-independence, cross-dimension split into `pid` / `pid\|mass`; step-builder mirrors it (4 tests). 56/56 vitest pass. |
| 2 | Units are an enum with canonical_unit + dimension per product and a within-dimension conversion module (DATA-02) | ✓ VERIFIED | `units.ts` Unit/Dimension enum, exact NIST/BIPM TO_ML/TO_G, `convert`/`canConvert`/`normalizeUnit`/`promoteUnit`; `types.ts` Product carries `canonical_unit?`/`dimension?`; tests green; tsc clean. |
| 3 | Editing a unit only sets a measurement unit; container type is a separate field, never conflated (DATA-03) | ✓ VERIFIED | RecipeEditor both write sites unconditional `unit: productUnit \|\| undefined` (lines 401/485); `containerTypeName` threaded via container_type expand; aggregation.ts container reads + dedup key on `containerTypeName` (lines 348/392/402). |
| 4 | Product names unique case-insensitively; duplicate create rejected; existing dupes one-shot merged (DATA-04, DATA-05) | ✓ VERIFIED | `pb_schema.json` contains `CREATE UNIQUE INDEX idx_products_name_type_ci ON products (name COLLATE NOCASE, type)`; dedup was a no-op (0 real same-type dupes, decisions `[]`); merge/find-duplicate scripts carry backup+preflight+orphan-check safety net. Live rejection manually attested at Plan 08 Task 3 checkpoint. |
| 5 | Node units normalized to enum tokens; canonical_unit/dimension backfilled (DATA-05) | ✓ VERIFIED | `normalize-node-units.js` (210 written), `backfill-units.js` (155 inferred), `apply-unit-resolutions.js` (165-row human worksheet); post-run lint missing-canonical-unit 123→0. Schema fields live per `pb_schema.json`. Audit artifacts in phase dir. |
| 6 | Linter surfaces the four data-hygiene issues on demand from two surfaces (DATA-06) | ✓ VERIFIED | 4 rule files (`cross-dimension`, `prep-words`, `missing-store-section` with `SECTION_REQUIRED_STORES={safeway}`, `missing-canonical-unit`) + `runLint`; Products.tsx Lint button + dialog; headless `scripts/lint.js`; 14 linter tests pass; live run surfaced real findings. |
| 7 | decisions.md + schema export reflect real signature-based step aggregation (DATA-07) | ✓ VERIFIED | `grep "exact string match"` (ex product-name) empty; "signature" x5, container revisit note present; `pb_schema.json` is the single current export (pb_schema_updated.json deleted per user direction). |
| 8 | Split shopping-list lines render distinctly (no dup-key warning, isolated checkboxes, breakdown sums) (DATA-01 UI) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | lineId threaded to ShoppingListTab (`item.lineId` at checkbox key + React key), data verified by tests — but rendered DOM behavior has no component-test harness. See Human Verification. |

**Score:** 7/7 requirement truths verified (1 downstream UI behavior present but behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `recipe-planner/src/lib/units.ts` | enum, conversion, alias, display selection | ✓ VERIFIED | Exact factors; CR-01 fix (canConvert rejects non-enum) present. |
| `recipe-planner/src/lib/units.test.ts` | round-trip + alias + CR-01 regression | ✓ VERIFIED | Includes "treats non-enum / empty units as unconvertible (no NaN)" regression. |
| `recipe-planner/src/lib/aggregation/builders/product-builder.ts` | convert-or-split + lineId | ✓ VERIFIED | `resolveMergeTargetKey`, `mergeQuantities`, `containerTypeName`, `lineId`. |
| `recipe-planner/src/lib/aggregation/builders/step-builder.ts` | input/output convert-or-split | ✓ VERIFIED | 4 tests cover convertible-merge + cross-dimension-separate. |
| `recipe-planner/src/lib/linter/` (index + 4 rules) | LintFinding rules + runLint | ✓ VERIFIED | All 4 rule files present, wired to both surfaces. |
| `recipe-planner/scripts/{find-duplicates,merge-products,normalize-node-units,backfill-units,apply-unit-resolutions,lint}.js` | migration tooling | ✓ VERIFIED | All pass `node --check`; safety nets present (backup/authWithPassword/orphan/meal_variant_overrides). |
| `recipe-planner/src/pages/RecipeEditor.tsx` | container/unit write split + enum Select | ✓ VERIFIED | `UNIT_OPTIONS` enum-bound Select; unconditional productUnit writes. |
| `decisions.md` | reconciled step-aggregation wording | ✓ VERIFIED | Signature wording present; stale exact-name-match gone; D-02 revisit note. |
| `pb_schema.json` | canonical_unit, dimension, index, meal_variant_overrides | ✓ VERIFIED | All four greps = 1; `pb_schema_updated.json` intentionally deleted (not a missing artifact). |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| ShoppingListTab.tsx | aggregation/types.ts | rows keyed by `item.lineId` (checkbox key + React key); pantry stays on productId | ✓ WIRED |
| product-builder.ts | units.ts | `canConvert`/`getDimension` for merge decision | ✓ WIRED |
| cross-dimension.ts | units.ts | `normalizeUnit`/`getDimension`/`canConvert` | ✓ WIRED |
| Products.tsx | linter/index.ts | Lint button `handleRunLint` calls `runLint(enriched)` | ✓ WIRED |
| aggregation.ts | product-builder.ts | reads `product.containerTypeName` | ✓ WIRED |
| merge-products.js | PocketBase prod | confirmed decisions JSON drives repoint+delete (no-op: 0 dupes) | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full unit suite | `npx vitest run` | 56/56 pass (4 files) | ✓ PASS |
| Typecheck | `npx tsc -b --noEmit` | exit 0, clean | ✓ PASS |
| Scripts parse | `node --check` x6 | all OK | ✓ PASS |
| CR-01 regression | vitest (units.test.ts) | non-enum → convert null / canConvert false | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
| --- | --- | --- | --- |
| DATA-01 | 01-03 | ✓ SATISFIED | convert-or-split builders + lineId + tests |
| DATA-02 | 01-01 | ✓ SATISFIED | units.ts enum/conversion + Product fields + tests |
| DATA-03 | 01-06 | ✓ SATISFIED | container/unit split + enum Select |
| DATA-04 | 01-02, 01-07, 01-08 | ✓ SATISFIED | dedup tooling + (name,type) unique index in pb_schema.json |
| DATA-05 | 01-05, 01-07, 01-08 | ✓ SATISFIED | normalize + backfill + resolutions applied to prod |
| DATA-06 | 01-04 | ✓ SATISFIED | 4-rule linter, two surfaces, 14 tests |
| DATA-07 | 01-05 | ✓ SATISFIED | decisions.md reconciled; schema export current |

All 7 phase requirement IDs accounted for across plans; no orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| --- | --- | --- | --- |
| (phase-modified src) | No unresolved TBD/FIXME/XXX debt markers in phase code | ℹ️ Info | None |
| 01-REVIEW.md | 1 critical (CR-01) fixed in ccf1cba with regression test; 11 lower findings advisory/open | ⚠️ Warning | Advisory follow-ups; not goal-blocking per phase guidance |

### Human Verification Required

1. **Shopping-list split-line rendering** — Open a plan whose shopping list has a cross-dimension split product and a merged multi-source line (white-bean olive oil). Confirm two distinct rows, no React duplicate-key console warning, checkbox isolation, and breakdown summing to the total. *Why human:* no component-test harness; rendered DOM behavior uncovered by tests.
2. **RecipeEditor enum unit input** — Open the add/edit dialog for a non-stored product; confirm the Unit field is an enum dropdown with no free-text entry. *Why human:* visual/interactive; code enforces it by construction but the rendered UX was not captured.

### Gaps Summary

No blocking gaps. The data-layer goal is achieved by construction and verified in code + tests + the live schema export: exact conversion with the NaN-corruption path closed (CR-01), convert-or-split aggregation, a DB-enforced case-insensitive `(name, type)` unique index, fully backfilled canonical units, and reconciled docs. Status is `human_needed` solely because two downstream UI-rendering behaviors (split-line display and the editor's enum Select) have no automated coverage and were flagged by the executors themselves as needing a human glance — neither is a defect, both are visual confirmations. The single critical review finding (CR-01) is already fixed with a regression test; the remaining 11 review findings are advisory follow-ups, not goal blockers.

---

_Verified: 2026-07-06T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
