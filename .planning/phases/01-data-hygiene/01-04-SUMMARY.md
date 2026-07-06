---
phase: 01-data-hygiene
plan: 04
subsystem: linter
tags: [typescript, vitest, react, mui, pocketbase, node-type-stripping, tsx]

requires:
  - phase: 01-data-hygiene (plan 01)
    provides: units.ts (canConvert/getDimension/normalizeUnit), canonical_unit/dimension on Product
provides:
  - "src/lib/linter/ — pure LintFinding[] rule core (cross-dimension, prep-words, missing-store-section, missing-canonical-unit) + runLint() aggregator (DATA-06)"
  - "Products.tsx Lint button + findings Dialog panel (D-03 UI surface)"
  - "scripts/lint.js headless runner sharing the same rule core (D-03 CLI surface)"
affects: ["Phase 5 linter v2 (extends this rule set)", "any future phase touching product/node data hygiene"]

tech-stack:
  added: [tsx]
  patterns:
    - "Pure LintFinding[] rule functions, one file per rule, aggregated by runLint() — mirrors the aggregation/ builder convention"
    - "All linter-module imports from ../types are type-only (verbatimModuleSyntax `import type`), so the module never pulls runtime TS enums (ProductType etc.) into a graph a headless script might load directly"
    - "Two thin callers (Products.tsx handler, scripts/lint.js) independently fetch+group recipe_product_nodes by product id, then call the identical runLint() core — no rule logic duplicated in either surface"

key-files:
  created:
    - recipe-planner/src/lib/linter/index.ts
    - recipe-planner/src/lib/linter/rules/cross-dimension.ts
    - recipe-planner/src/lib/linter/rules/prep-words.ts
    - recipe-planner/src/lib/linter/rules/missing-store-section.ts
    - recipe-planner/src/lib/linter/rules/missing-canonical-unit.ts
    - recipe-planner/src/lib/linter/linter.test.ts
    - recipe-planner/scripts/lint.js
  modified:
    - recipe-planner/src/pages/registries/Products.tsx
    - recipe-planner/package.json
    - recipe-planner/package-lock.json

key-decisions:
  - "cross-dimension rule needs recipe_product_nodes.unit values per product, which neither Products.tsx's product-only expand nor the plan's stated scripts/lint.js expand list carries — added a small nodes-fetch-and-group step to both surfaces (Rule 2: without it, cross-dimension never fires against real data)"
  - "All ../types imports inside src/lib/linter/ are type-only (import type), so the linter module never pulls the ProductType/StepType runtime enums into the dependency graph scripts/lint.js loads"
  - "Direct `node scripts/lint.js` fails (Node's native type-stripping requires explicit extensions on relative ESM imports; the linter module's imports are intentionally extensionless to match the rest of the codebase's bundler-mode convention) — installed tsx as a devDependency and invoke via `npx tsx scripts/lint.js`, verified end-to-end against live prod data (68.6M weekly downloads, github.com/privatenumber/tsx — clearly legitimate, no ambiguity requiring a blocking checkpoint)"

requirements-completed: [DATA-06]

coverage:
  - id: D1
    description: "Four pure LintFinding[] rules (cross-dimension, prep-words, missing-store-section with SECTION_REQUIRED_STORES={safeway}, missing-canonical-unit) plus runLint() aggregator; a fully-clean product produces zero findings"
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "src/lib/linter/linter.test.ts (14 tests: flag+clean pair per rule, SECTION_REQUIRED_STORES content check, fully-clean-product zero-findings case)"
        status: pass
      - kind: other
        ref: "npx tsc -b --noEmit (clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Linter is runnable on-demand from Products.tsx (Lint button + findings Dialog, findings link to the offending product) and from a headless scripts/lint.js, both calling the same rule core"
    requirement: DATA-06
    verification:
      - kind: other
        ref: "grep runLint|linter src/pages/registries/Products.tsx; node --check scripts/lint.js; npx tsc -b --noEmit (all clean/pass)"
        status: pass
      - kind: manual_procedural
        ref: "npx tsx scripts/lint.js run live against prod (192.168.50.95:8090) — produced real findings (15 cross-dimension, 5 prep-words, 96 missing-store-section) confirming the wiring works end-to-end"
        status: pass
    human_judgment: true
    rationale: "The Products.tsx Lint button's visual rendering (dialog opens correctly, clicking a finding opens the right product's edit dialog, no layout regressions) was not captured by a browser/component test — no component-test harness exists yet (jsdom/@testing-library/react intentionally left uninstalled per 01-RESEARCH.md). tsc + the headless script's live run confirm the data path is correct; the UI's visual/interactive correctness needs a human glance."

duration: 32min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 4: Recipe Linter v1 Summary

**Four pure `LintFinding[]` rules (cross-dimension mismatch, prep-words in raw names, missing store/section with Safeway-only section requirement, missing canonical_unit) shared by a Products.tsx "Lint" button + findings dialog and a headless `scripts/lint.js`, verified live against real prod data.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-06T00:22Z (approx.)
- **Completed:** 2026-07-06T00:54Z (approx.)
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified beyond that — package.json/lock)

## Accomplishments
- `src/lib/linter/index.ts` exports the `LintFinding` type, a linter-scoped `ProductExpanded` type (with an optional `nodes` array for node-unit data), and a `runLint()` aggregator that concatenates all four rules' findings
- Four pure rule files: `cross-dimension.ts` (uses `normalizeUnit`/`getDimension`/`canConvert` from `units.ts`), `prep-words.ts` (controlled prep-verb list + `(raw)` suffix), `missing-store-section.ts` (`SECTION_REQUIRED_STORES = {"safeway"}` per D-04, copied verbatim from the research pattern), `missing-canonical-unit.ts`
- `linter.test.ts`: 14 tests — a flag+clean pair for every rule, a `SECTION_REQUIRED_STORES` content assertion, and a fully-clean-product zero-findings test
- Products.tsx: "Lint" button, `findings` state, `handleRunLint()` handler that enriches the loaded product list with per-product node-unit data before calling `runLint()`, and a findings `Dialog` where each finding is a clickable `Alert` linking to the offending product's edit form
- `scripts/lint.js`: headless runner sharing the identical rule core, verified end-to-end against live prod data via `npx tsx`

## Task Commits

Each task was committed atomically (TDD RED/GREEN for Task 1):

1. **Task 1 RED: failing tests for linter core** - `74a3274` (test)
2. **Task 1 GREEN: linter core implementation** - `54c770a` (feat)
3. **Task 2: Products.tsx Lint button + scripts/lint.js** - `09eb5ec` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `recipe-planner/src/lib/linter/index.ts` - `LintFinding` type, linter-scoped `ProductExpanded` (+ `LinterProductNode`), `runLint()` aggregator
- `recipe-planner/src/lib/linter/rules/cross-dimension.ts` - Flags node units spanning >1 dimension or not convertible to `canonical_unit`
- `recipe-planner/src/lib/linter/rules/prep-words.ts` - Flags raw product names with a controlled prep verb or `(raw)` suffix
- `recipe-planner/src/lib/linter/rules/missing-store-section.ts` - `SECTION_REQUIRED_STORES = {"safeway"}`; missing-store and Safeway-missing-section findings
- `recipe-planner/src/lib/linter/rules/missing-canonical-unit.ts` - Flags non-pantry products with a null `canonical_unit`
- `recipe-planner/src/lib/linter/linter.test.ts` - 14 tests covering all four rules + the clean-product case
- `recipe-planner/src/pages/registries/Products.tsx` - "Lint" button, `findings`/`linting`/`lintDialogOpen` state, `handleRunLint()`, findings `Dialog` panel
- `recipe-planner/scripts/lint.js` - Headless linter runner, prints findings grouped by rule
- `recipe-planner/package.json`, `package-lock.json` - Added `tsx` devDependency

## Decisions Made
- The cross-dimension rule needs each product's `recipe_product_nodes.unit` values, which neither surface's product-only query naturally carries — both `Products.tsx`'s `handleRunLint()` and `scripts/lint.js` independently fetch `recipe_product_nodes`, group by `product` id, and attach a `nodes` array before calling `runLint()`. This is plumbing shared conceptually (not literally, to avoid a premature shared-fetch abstraction across a React handler and a Node script) — no rule *logic* is duplicated, only the fetch-and-group step, which is intentionally thin.
- Every `../types` import inside `src/lib/linter/` is a type-only `import type` (enforced by the project's `verbatimModuleSyntax`), so the linter module's dependency graph never pulls in the `ProductType`/`StepType` runtime TS enums — this was necessary groundwork for attempting a direct `node scripts/lint.js` run.
- Direct `node scripts/lint.js` fails with `ERR_MODULE_NOT_FOUND` — Node's native TypeScript type-stripping requires explicit file extensions on relative ESM import specifiers, but the linter module's internal imports are intentionally extensionless to match the rest of the codebase's `moduleResolution: bundler` convention (adding `.ts` extensions there would be an inconsistent, source-wide style change out of this plan's scope). Installed `tsx` (verified: 68.6M weekly downloads, `github.com/privatenumber/tsx` canonical repo — unambiguously legitimate, no alternative package search warranted) as a devDependency; `npx tsx scripts/lint.js` was run live against prod and confirmed working end-to-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added recipe_product_nodes fetch+group step to both linter surfaces**
- **Found during:** Task 2 (wiring Products.tsx and scripts/lint.js)
- **Issue:** The cross-dimension rule's behavior spec (Task 1) requires per-product node-unit data, but Task 2's stated action text only mentioned expanding `store,section,container_type` on the products query — with no node data attached, the cross-dimension rule would silently never fire from either surface.
- **Fix:** Added a `recipe_product_nodes` fetch + group-by-product-id step to `handleRunLint()` (Products.tsx) and to `scripts/lint.js`, attaching a `nodes` array to each product before calling `runLint()`.
- **Files modified:** `recipe-planner/src/pages/registries/Products.tsx`, `recipe-planner/scripts/lint.js`
- **Verification:** Live `npx tsx scripts/lint.js` run against prod surfaced 15 real cross-dimension findings, confirming the rule fires correctly once wired.
- **Committed in:** `09eb5ec` (Task 2 commit)

**2. [Rule 3 - Blocking] Installed `tsx` as a devDependency**
- **Found during:** Task 2 (verifying `node scripts/lint.js` runs directly, per the plan's explicit contingency)
- **Issue:** Direct `node scripts/lint.js` failed with `ERR_MODULE_NOT_FOUND` — Node's native type-stripping doesn't resolve the linter module's extensionless relative imports.
- **Fix:** Ran `npm install -D tsx` after independently verifying package legitimacy (68.6M weekly downloads via the npm downloads API, canonical `github.com/privatenumber/tsx` repo); invoke via `npx tsx scripts/lint.js`. This exact fallback was pre-specified in the PLAN.md action text as the anticipated contingency, not an executor-invented package choice.
- **Files modified:** `recipe-planner/package.json`, `recipe-planner/package-lock.json`
- **Verification:** `npx tsx scripts/lint.js` ran successfully against live prod PocketBase, printing grouped findings.
- **Committed in:** `09eb5ec` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking — package install pre-approved by the plan's own contingency text)
**Impact on plan:** Both necessary for the linter to function end-to-end against real data; no scope creep beyond what the plan's behavior spec and explicit contingency already called for.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `npx vitest run` green (54/54 tests across 4 files); `npx tsc -b --noEmit` clean; `node --check scripts/lint.js` passes
- Live run against prod surfaced real, expected hygiene issues: 15 cross-dimension mismatches, 5 prep-word raw names, 96 missing-store-section findings (mostly `stored`-type batch-prep products with no store, matching the literal Pattern 3 rule — `stored` is not excluded from the store-required filter, only `transient` and `pantry` are, per the plan's explicit spec)
- These findings are exactly the kind of pre-existing data noise the later phases (DATA-04 dedup, DATA-05 node-unit normalization, D-08 canonical_unit backfill — later plans in this same phase) are meant to clean up; the linter itself makes no changes, it only surfaces
- No component-test harness exists yet, so the Products.tsx Lint dialog's visual/click behavior (opening the right product on click) was not captured by an automated test — worth a quick manual glance next time the Products page is touched

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*
