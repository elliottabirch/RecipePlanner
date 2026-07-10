---
phase: 06-import-pipeline-recipe-lifecycle
plan: 03
subsystem: lifecycle
tags: [lifecycle, draft-filter, linter, publish-gate, pure-module, fail-open]

# Dependency graph
requires:
  - phase: 06-01
    provides: Recipe.status ("draft" | "published") field the draft filter and publish gate act on
provides:
  - DRAFT_EXCLUDING_FILTER / buildDraftExcludingFilter() fail-open draft-exclusion filter string (D-04, IMP-01)
  - isPlannable(status) pure predicate mirroring the filter semantics
  - composeRecipeFindings(steps, products) pure publish-gate core = runStepLint ++ runLint (D-06, IMP-07)
  - runRecipeLint(recipeId) live-record publish gate (reads steps + referenced products)
affects: [06-05, 06-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-open query guard: exclude only the negative value (status != draft), never enumerate the positive (status = published) — unset rows stay visible (Pitfall 1)"
    - "Lazy dynamic import(../api) inside the async runner so the pure composition core stays node/vitest-importable past the localStorage-reading pb client"

key-files:
  created:
    - recipe-planner/src/lib/lifecycle/draft-filter.ts
    - recipe-planner/src/lib/lifecycle/draft-filter.test.ts
    - recipe-planner/src/lib/linter/recipe-lint.ts
    - recipe-planner/src/lib/linter/recipe-lint.test.ts
  modified: []

key-decisions:
  - "Filter string emitted is exactly status != \"draft\" (fail-open) — the equals-published form is forbidden and unit-asserted absent (T-06-03a)"
  - "runRecipeLint lazy-imports ../api inside the function body; a top-level import pulls pocketbase.ts -> db-config.ts which reads localStorage at module load and breaks node-env tests of the pure core"
  - "runWeekLint / missing-pull-step deliberately excluded from composeRecipeFindings — it needs a whole WeekGraph absent for a single unplanned recipe (Pitfall 4, T-06-03b); a test asserts no missing-pull-step finding for any input"

patterns-established:
  - "Fail-open exclusion filter builder as a shared const consumed by getAll's filter option at both planning call sites (Plan 05)"
  - "Pure findings-composition core split from the async live-record runner so the rule composition is unit-testable without a live DB"

requirements-completed: [IMP-01, IMP-07]

coverage:
  - id: D1
    description: "Fail-open draft filter: DRAFT_EXCLUDING_FILTER is status != draft (never equals-published); isPlannable false only for exactly draft, true for published / unset / empty / unknown"
    requirement: "IMP-01"
    verification:
      - kind: unit
        ref: "src/lib/lifecycle/draft-filter.test.ts#draft-filter — fail-open draft exclusion (D-04, IMP-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "composeRecipeFindings returns step-rule + product-rule findings and never a missing-pull-step (week) finding for any input; empty array on clean input"
    requirement: "IMP-07"
    verification:
      - kind: unit
        ref: "src/lib/linter/recipe-lint.test.ts#composeRecipeFindings — step + product only, week excluded (D-06, IMP-07)"
        status: pass
    human_judgment: false

# Metrics
duration: ~10min
completed: 2026-07-10
status: complete
---

# Phase 06 Plan 03: Draft Filter + Publish-Gate Primitives Summary

**A fail-open `status != "draft"` filter builder (excludes drafts, keeps unset-status rows plannable) plus a pure `composeRecipeFindings` publish-gate core composing the existing per-step + per-product linters while provably excluding the week-scoped pull-step rule — the two gate primitives the Plan 05 draft-wiring and Plan 06 Publish button consume.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-10T23:37:34Z
- **Tasks:** 2 (both TDD)
- **Files created:** 4

## Accomplishments
- `DRAFT_EXCLUDING_FILTER` / `buildDraftExcludingFilter()` yield the correctness-critical `status != "draft"` fail-open form; the fail-closed `status = "published"` form is explicitly forbidden and unit-asserted absent (T-06-03a). Un-set/empty status rows stay plannable so no existing recipe silently vanishes from planning (Pitfall 1).
- `isPlannable(status?)` — a pure predicate returning `false` only for exactly `"draft"` (published, undefined, `""`, and any unknown value all stay plannable), making the fail-open semantics unit-testable without a live DB.
- `composeRecipeFindings(steps, products)` — the pure publish-gate core returning exactly `[...runStepLint(steps), ...runLint(products)]`. A test asserts step-rule + product-rule findings both surface and that `missing-pull-step` never appears for any input (Pitfall 4, T-06-03b).
- `runRecipeLint(recipeId)` — the async live-record runner: reads the recipe's steps and its referenced products (enriched to `ProductExpanded` with node units grouped by product id + store/section/container_type expand, mirroring Products.tsx:151-166), then composes findings. `runWeekLint` deliberately excluded.

## Task Commits

Each task followed TDD (test → feat):

1. **Task 1: Fail-open draft-exclusion filter builder** - `086b70a` (test), `48e2def` (feat)
2. **Task 2: runRecipeLint composition (step + product, excludes week)** - `0d16d38` (test), `273eafc` (feat)

**Plan metadata:** _(this commit)_

## Files Created
- `recipe-planner/src/lib/lifecycle/draft-filter.ts` - Fail-open draft-exclusion filter const/builder + `isPlannable` predicate (D-04, IMP-01)
- `recipe-planner/src/lib/lifecycle/draft-filter.test.ts` - 6 tests: filter string shape (not equals-published), isPlannable true for published/unset/""/unknown, false for draft
- `recipe-planner/src/lib/linter/recipe-lint.ts` - Pure `composeRecipeFindings` + async `runRecipeLint`, week rule excluded (D-06, IMP-07)
- `recipe-planner/src/lib/linter/recipe-lint.test.ts` - 5 tests: step-rule finding, product-rule finding, both together, never missing-pull-step, empty on clean input

## Decisions Made
- The filter string is emitted as exactly `status != "draft"` and the tests assert the equals-published form never appears — the fail-open/fail-closed distinction is the entire point of this primitive (T-06-03a: a fail-closed filter drops every un-set-status row from planning).
- `runRecipeLint` uses a lazy `await import("../api")` inside the function body rather than a top-level import. A top-level `../api` import transitively loads `pocketbase.ts -> db-config.ts`, whose `getCurrentDbUrl` reads `localStorage` at module-evaluation time — absent in the node/vitest env, which broke importing the pure `composeRecipeFindings` core. The lazy import keeps the pure core node-importable while the live runner still resolves `getAll`/`collections` at call time. (Deviation Rule 3 — blocking test-infra issue, fixed inline.)
- `runWeekLint` / `missing-pull-step` is excluded from the composition: its input (a whole `WeekGraph` + cross-recipe stored-input consumptions) does not exist for a single unplanned recipe (Pitfall 4). A dedicated test locks this in (T-06-03b — no silent week-rule bypass into the publish gate).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lazy-import ../api to keep the pure lint core node-importable**
- **Found during:** Task 2 GREEN (first `runRecipeLint` run failed at import time)
- **Issue:** A top-level `import { getAll, collections } from "../api"` pulls `pocketbase.ts -> db-config.ts`, which calls `localStorage.getItem` at module load. In the vitest node env (no jsdom, per plan) this throws before any test body runs, so even the pure `composeRecipeFindings` core could not be imported.
- **Fix:** Moved the `getAll`/`collections` import to a lazy `await import("../api")` inside `runRecipeLint`. The pure export now has zero module-load side effects; the live runner resolves the pb client only when actually invoked (always in a browser).
- **Files modified:** recipe-planner/src/lib/linter/recipe-lint.ts
- **Commit:** 273eafc

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - both are pure `src/lib` modules, no new packages, no runtime service configuration.

## Next Phase Readiness
- `DRAFT_EXCLUDING_FILTER` is the exact string Plan 05 passes to `getAll`'s `filter` option at the two planning call sites (WeekWizard, WeeklyPlans).
- `runRecipeLint(recipeId)` returns the `LintFinding[]` the Plan 06 RecipeEditor Publish dialog renders; status flips to `published` only on an empty result.
- No blockers.

## Threat Flags
None - no new security-relevant surface beyond the planned trust boundary (planning query -> DB draft filter), which is mitigated as designed (T-06-03a fail-open, T-06-03b week-rule exclusion, both unit-asserted).

## Self-Check: PASSED

All four created files exist on disk; all four task commits (086b70a, 48e2def, 0d16d38, 273eafc) present in git history. Both target tests green, `npx tsc --noEmit` clean, full suite green (223 tests).

---
*Phase: 06-import-pipeline-recipe-lifecycle*
*Completed: 2026-07-10*
