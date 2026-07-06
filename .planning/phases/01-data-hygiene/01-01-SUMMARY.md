---
phase: 01-data-hygiene
plan: 01
subsystem: data-layer
tags: [vitest, typescript, units, unit-conversion, testing]

# Dependency graph
requires: []
provides:
  - Vitest test harness (node environment, pure-function tests only, no jsdom)
  - src/lib/units.ts — Unit/Dimension enum, exact NIST/BIPM conversion factors, alias-based normalizeUnit(), deterministic display-unit selection (promoteUnit/chooseDisplayUnit)
  - Product.canonical_unit / Product.dimension type fields
affects: [01-02-aggregation-fix, 01-03-node-unit-normalization, 01-04-linter-v1]

# Tech tracking
tech-stack:
  added: [vitest ^4.1.10]
  patterns: [pure-function TS module mirroring src/lib/aggregation/utils/product-utils.ts shape (no PocketBase/React imports), TDD RED-then-GREEN commit pairing]

key-files:
  created: [recipe-planner/vitest.config.ts, recipe-planner/src/lib/units.ts, recipe-planner/src/lib/units.test.ts]
  modified: [recipe-planner/package.json, recipe-planner/package-lock.json, recipe-planner/src/lib/types.ts]

key-decisions:
  - "vitest devDependency approved via package-legitimacy checkpoint (Task 1): 68M/wk downloads, canonical github.com/vitest-dev/vitest repo, package ~4.5 years old — the [SUS] flag in 01-RESEARCH.md was a false positive driven by latest-version publish recency, not package age"
  - "UNIT_ALIASES seeded verbatim from the 445-record live recipe_product_nodes.unit disposition table in 01-RESEARCH.md Common Pitfalls #2, not re-derived from the phase doc's smaller grep sample"
  - "promoteUnit()/chooseDisplayUnit() implement D-10: canonical_unit wins when set (primary path); else largest unit keeping quantity >= 1, capped at cup (volume) / lb (mass), never crossing metric<->customary within one promotion path"

patterns-established:
  - "Unit conversion module stays exact and reviewable (D-11) — no fraction/human rounding in units.ts; that is a render-layer concern for a later phase"
  - "normalizeUnit() never guesses (D-08) — returns null for anything not an exact enum member or a documented alias, surfacing junk values (by, chile, medium, 28oz cans) for manual resolution instead of silently mapping them"

requirements-completed: [DATA-02]

coverage:
  - id: D1
    description: "Vitest test harness stood up (node environment, no jsdom/DOM this phase) with `npm test` wired to `vitest run`"
    requirement: "DATA-02"
    verification:
      - kind: other
        ref: "cd recipe-planner && npx vitest run --reporter=dot"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exact conversion math in units.ts: cup<->tbsp round-trip, white-bean 6-tbsp anchor, cross-dimension null, count non-convertible — using verbatim NIST/BIPM factors (cup=236.588236, lb=453.59237)"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/units.test.ts#units.ts — conversion math"
        status: pass
    human_judgment: false
  - id: D3
    description: "normalizeUnit() alias resolution covering the 445-record live disposition table (ea, cups, Tbsp, clove(s), can, bu, bunch, tbl, cu, whole, cubes) and returning null for genuinely unresolvable values (by, chile, medium, 28oz cans) per D-08"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/units.test.ts#units.ts — normalizeUnit (alias resolution)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deterministic display-unit selection (promoteUnit/chooseDisplayUnit) implementing D-10 — cup/lb promotion caps, no metric<->customary crossing, order-independent"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/units.test.ts#units.ts — display-unit selection (D-10)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Product interface extended with canonical_unit?: Unit and dimension?: Dimension; project typechecks with no new errors"
    requirement: "DATA-02"
    verification:
      - kind: other
        ref: "cd recipe-planner && npx tsc -b --noEmit"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-06
status: complete
---

# Phase 1 Plan 1: Vitest Harness + units.ts Single Source of Truth Summary

**Stood up Vitest (node environment) and built src/lib/units.ts — the exact-factor conversion module, alias-based normalizeUnit(), and D-10 deterministic display-unit selector that every later Phase 1 plan (aggregation fix, node-unit normalization, linter) depends on.**

## Performance

- **Duration:** 4 min (continuation from checkpoint; Task 1 package-legitimacy gate resolved by human "approved" response before this session)
- **Started:** 2026-07-06T06:52:35Z
- **Completed:** 2026-07-06T06:55:57Z
- **Tasks:** 3 (Task 1 checkpoint gate + Task 2 + Task 3, all now complete)
- **Files modified:** 6

## Accomplishments

- Vitest installed as a devDependency (verified legitimate: 68M/wk downloads, canonical repo, ~4.5yr old package) and wired via `npm test` / `vitest.config.ts` (node environment, no jsdom)
- `units.ts` exports the full Unit/Dimension vocabulary (D-09: no dedicated clove/bunch/head/can enum members), exact TO_ML/TO_G conversion tables copied verbatim from NIST/BIPM factors, and `getDimension`/`canConvert`/`convert` returning `null` across dimensions and for non-equal count-to-count conversions
- `UNIT_ALIASES` + `normalizeUnit()` seeded from the real 445-record live disposition table (not the phase doc's smaller grep sample) — resolves `ea`, `cups`, `Tbsp`, `clove(s)`, `can`, `bu`, `bunch`, `tbl`, `cu`, `whole`, `cubes`, `slices`, `pitas`, `sprigs` to canonical tokens, and correctly returns `null` for genuinely unresolvable junk (`by`, `chile`, `medium`, `28oz cans`) per D-08
- `promoteUnit()`/`chooseDisplayUnit()` implement D-10's deterministic display-unit selection: canonical_unit wins when set; otherwise largest unit keeping quantity >= 1, capped at cup/lb, never crossing metric<->customary
- `Product` interface extended with `canonical_unit?: Unit` and `dimension?: Dimension`; full project typechecks clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve vitest install (package legitimacy gate)** — resolved via human "approved" response (checkpoint, no commit — see Deviations/Checkpoint History below)
2. **Task 2: Install Vitest and wire the test script** — `6224bf7` (feat)
3. **Task 3 (RED): Add failing tests for units.ts** — `45f582c` (test)
4. **Task 3 (GREEN): Implement units.ts + Product type fields** — `a0e034d` (feat)

**Plan metadata:** committed separately after this SUMMARY.

_Task 3 used the TDD RED->GREEN cycle (tdd="true"); no REFACTOR commit was needed — the GREEN implementation required no follow-up cleanup._

## Files Created/Modified

- `recipe-planner/package.json` - added `vitest` devDependency + `"test": "vitest run"` script
- `recipe-planner/package-lock.json` - lockfile update from `npm install -D vitest`
- `recipe-planner/vitest.config.ts` - minimal Vitest config, `test.environment: "node"`, includes `src/**/*.test.ts` + `scripts/**/*.test.js`
- `recipe-planner/src/lib/units.ts` - Unit/Dimension enum, UNIT_DIMENSIONS, TO_ML/TO_G exact factors, getDimension/canConvert/convert, UNIT_ALIASES/normalizeUnit, promoteUnit/chooseDisplayUnit
- `recipe-planner/src/lib/units.test.ts` - 30 tests covering conversion math, alias resolution, and display-unit selection
- `recipe-planner/src/lib/types.ts` - `Product.canonical_unit?: Unit`, `Product.dimension?: Dimension`, importing from `./units`

## Decisions Made

- Approved vitest install per the package-legitimacy checkpoint — evidence (68M/wk downloads, canonical repo, 4.5-year package age) outweighed the tool's "too-new" false-positive flag driven by latest-version publish recency
- Followed 01-RESEARCH.md's exact UNIT_ALIASES seed table rather than re-deriving aliases from the phase doc's smaller grep sample, per the plan's explicit instruction and Pitfall 2's warning about the messier real corpus
- Implemented `chooseDisplayUnit(dimension, canonicalUnit, qty, currentUnit)` as a thin wrapper over `promoteUnit(qty, unit)` (both exported, per the plan's "OR" phrasing) rather than picking only one — downstream aggregation code can call whichever fits its call site

## Deviations from Plan

None - plan executed exactly as written. (One self-caught test-authoring bug was fixed during the same TDD task before the GREEN commit — see below; it did not require a separate deviation rule since it was corrected within the RED/GREEN cycle itself, not a plan deviation.)

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed floating-point margin bug in an added test case**
- **Found during:** Task 3 (GREEN — first test run after implementing units.ts)
- **Issue:** A test I authored (`promotes an under-representation up to the largest unit keeping qty >= 1`) asserted `promoteUnit(48, "tsp")` promotes to `cup`, but with the sanctioned (rounded) NIST/BIPM constants, 48 tsp converts to ~0.999997 cup — just under the `>= 1` threshold — so the implementation correctly stopped at `fl_oz` instead. The implementation was correct; the test's chosen input value had insufficient margin.
- **Fix:** Changed the test input from 48 tsp to 60 tsp (1.25 cup, well over the threshold) so the promotion-to-cup assertion is meaningful and stable.
- **Files modified:** recipe-planner/src/lib/units.test.ts
- **Verification:** `npx vitest run src/lib/units.test.ts` — 30/30 passing
- **Committed in:** a0e034d (Task 3 GREEN commit, test file was part of the same commit as the implementation since it was still red until this fix)

---

**Total deviations:** 1 auto-fixed (1 bug — self-authored test precision issue, not a plan or implementation defect)
**Impact on plan:** No scope creep; the fix only corrected a test's input value margin, the units.ts implementation was correct on first pass for that case.

## Issues Encountered

None.

## Checkpoint History

- **Task 1 (checkpoint:human-verify, gate="blocking-human", package-legitimacy):** Human reviewed npmjs.com/package/vitest, confirmed canonical repo/download count/package age, and responded "approved". No code changes in this task — it exists solely to gate the `npm install -D vitest` in Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `units.ts` is now the single source of truth for unit vocabulary, conversion, and display-unit selection — Plan 01-02 (aggregation convert-or-split fix) and the later node-unit normalization script and linter v1 can import it directly (`getDimension`, `canConvert`, `convert`, `normalizeUnit`, `promoteUnit`/`chooseDisplayUnit`).
- `Product.canonical_unit`/`Product.dimension` type fields exist in TypeScript but the PocketBase schema itself does not yet have these fields (schema addition + `pb_schema_updated.json` re-export is a later plan's responsibility per 01-RESEARCH.md Pitfall 3 — two independently-running PB instances need the manual field-add in the same order).
- No blockers. Ready for 01-02-PLAN.md.

---
*Phase: 01-data-hygiene*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: recipe-planner/vitest.config.ts
- FOUND: recipe-planner/src/lib/units.ts
- FOUND: recipe-planner/src/lib/units.test.ts
- FOUND: recipe-planner/src/lib/types.ts contains `canonical_unit`
- FOUND: commit 6224bf7 (Task 2)
- FOUND: commit 45f582c (Task 3 RED)
- FOUND: commit a0e034d (Task 3 GREEN)
- Re-ran verification: `npx vitest run src/lib/units.test.ts` — 30/30 passing
- Re-ran verification: `npx tsc -b --noEmit` — clean, no output
