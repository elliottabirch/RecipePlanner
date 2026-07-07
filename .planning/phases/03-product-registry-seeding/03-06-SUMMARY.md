---
phase: 03-product-registry-seeding
plan: 06
subsystem: ui
tags: [react, mui, usda, quick-create, fuse.js]

# Dependency graph
requires:
  - phase: 03-product-registry-seeding
    provides: "usda-lookup.ts (searchUsda), category-section-map.ts (sectionIdForCategory), bundled usda-sr-legacy.json index (03-05)"
provides:
  - "Two-tab QuickCreateProductDialog (Enter manually / Search USDA) with on-demand USDA prefill"
  - "Create payload extended with fdc_id + usda_data_type='sr_legacy' for USDA-sourced products"
affects: [nutrition-ui, future-usda-index-rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy dynamic-import of the bundled USDA search index on first Search-USDA tab activation, cached in-memory for the session"

key-files:
  created: []
  modified:
    - "recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx"

key-decisions:
  - "isValid gate left unchanged (name + unit required) — a USDA prefill does not bypass the required Unit field (Open Question 4)"
  - "Verified live in prod: user-approved Search-USDA flow persists fdc_id + usda_data_type='sr_legacy' correctly (Kumquats, raw / fdc_id 168154)"
  - "Known limitation accepted by user: bundled SR-Legacy index stores verbose USDA descriptions as name (e.g. 'Kumquats, raw'), so Search-USDA prefill produces non-plain names, contradicting D-01's plain-name goal. Deferred to .planning/todos/pending/usda-search-plain-rename.md — NOT fixed in this plan."

patterns-established:
  - "Tab-based dialog mode toggle with lazy-loaded secondary data source, reusable for future 'search external catalog' prefill flows"

requirements-completed: [REG-03]

coverage:
  - id: D1
    description: "Search USDA tab added to QuickCreateProductDialog: two-tab toggle, lazy-loaded bundled index, searchUsda-driven results list with loading/empty/no-match states"
    requirement: "REG-03"
    verification:
      - kind: manual_procedural
        ref: "Task 2 human-verify checkpoint — live app walkthrough"
        status: pass
    human_judgment: true
    rationale: "Visual/interactive UI flow (tab switching, result list rendering, chip display, focus behavior) requires human observation of the running app; not covered by automated tests."
  - id: D2
    description: "Selecting a Search-USDA result prefills Name + Section, records fdc_id/usda_data_type, returns to manual tab, focuses Unit, and the created product persists fdc_id + usda_data_type='sr_legacy'"
    requirement: "REG-03"
    verification:
      - kind: manual_procedural
        ref: "Task 2 human-verify checkpoint — confirmed live in prod (Kumquats, raw, fdc_id 168154, usda_data_type=sr_legacy)"
        status: pass
    human_judgment: true
    rationale: "End-to-end persistence claim confirmed by the user directly against the production PocketBase Admin UI, not an automated assertion."

# Metrics
duration: 20min
completed: 2026-07-07
status: complete
---

# Phase 3 Plan 06: Search USDA Tab in Quick-Create Summary

**Added an on-demand "Search USDA" tab to the existing quick-create dialog, fuzzy-searching the bundled SR-Legacy index and prefilling name/section/fdc_id while keeping unit manual+required — confirmed live in prod persisting fdc_id + usda_data_type='sr_legacy'.**

## Performance

- **Duration:** ~20 min (Task 1 implementation + checkpoint wait for Task 2 verification)
- **Started:** 2026-07-07T00:30:00-07:00 (approx, Task 1 commit at 00:42:45-07:00)
- **Completed:** 2026-07-07T16:49:51Z
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 1

## Accomplishments
- Two-tab toggle ("Enter manually" default / "Search USDA") added directly below `DialogTitle`, preserving the existing manual-entry behavior byte-for-byte
- Search USDA tab lazy-loads the bundled `usda-sr-legacy.json` index via dynamic import on first activation only, reusing the in-memory index thereafter
- `searchUsda()` wired with a 20-result cap, autofocus, and exact loading/empty/no-match copy per 03-UI-SPEC.md
- Selecting a result prefills Name + Section (via `sectionIdForCategory`), records `fdc_id` + `usda_data_type = "sr_legacy"`, returns to the manual tab, focuses the Unit select, and shows a neutral "USDA match · fdc:{id}" chip
- `isValid` gate unchanged — Unit remains manual and required even for USDA-prefilled products
- User verified live in production: a product created via the Search-USDA tab ("Kumquats, raw", fdc_id 168154) correctly persisted `usda_data_type = "sr_legacy"`

## Task Commits

1. **Task 1: Add the Search USDA tab + prefill flow to QuickCreateProductDialog** - `e3e5930` (feat)
2. **Task 2: Verify the Search-USDA prefill flow + persisted USDA fields** - APPROVED by user via live prod check (no code changes; checkpoint task, no separate commit)

**Plan metadata:** (this commit) - `docs: complete 03-06 plan`

## Files Created/Modified
- `recipe-planner/src/components/outputs/QuickCreateProductDialog.tsx` - Added Search USDA tab, lazy index load, result list, prefill logic, fdc chip, extended create payload with fdc_id/usda_data_type

## Decisions Made
- Kept `isValid` unchanged (name + unit required) so USDA prefill never bypasses the required Unit field, per Open Question 4
- Used dynamic `import()` for the bundled index rather than a static top-level import, keeping the 117KB asset out of the main bundle chunk until the Search-USDA tab is actually used

## Deviations from Plan

None - plan executed exactly as written. Task 1 implementation matched the plan's acceptance criteria (grep-verified `searchUsda`/`sr_legacy` wiring, clean `npx tsc -b`). Task 2 was a human-verify checkpoint; the user approved the flow after testing it live in production.

## Issues Encountered

**Known limitation, accepted by user (not fixed in this plan):** The bundled SR-Legacy search index (`recipe-planner/src/assets/usda-sr-legacy.json`, built in 03-05) stores raw SR-Legacy descriptions as the `name` field (e.g. `"Kumquats, raw"`) rather than a plain human name. This means the Search-USDA prefill flow — while functionally correct (fdc_id/usda_data_type persist correctly) — produces verbose product names that contradict D-01's plain-name catalog goal. This was confirmed live in prod: a product named "Kumquats, raw" (fdc_id 168154, usda_data_type='sr_legacy') was created during UAT. The user approved completing 03-06 as-is (editing names manually when it matters) and captured the proper fix as a follow-up todo: `.planning/todos/pending/usda-search-plain-rename.md` (plain-rename the bundled index's `name` field via the existing normalizer, optionally rename the one existing prod product). This fix is explicitly deferred, not part of 03-06's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- REG-03 complete: quick-create now offers both seeded-registry search and on-demand USDA search, satisfying Phase 3's full registry-seeding requirement set (REG-01 through REG-04).
- Phase 3 (product-registry-seeding) is now fully complete — all 6 plans executed and verified.
- Follow-up: `.planning/todos/pending/usda-search-plain-rename.md` should be picked up before/alongside future USDA-index work to align Search-USDA prefill names with D-01's plain-name goal.

---
*Phase: 03-product-registry-seeding*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `.planning/phases/03-product-registry-seeding/03-06-SUMMARY.md`
- FOUND: commit `e3e5930`
