---
phase: 6
slug: import-pipeline-recipe-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 (node env — no jsdom) |
| **Config file** | `recipe-planner/vitest.config.ts` |
| **Quick run command** | `cd recipe-planner && npx vitest run src/lib/<file>.test.ts` |
| **Full suite command** | `cd recipe-planner && npm test` |
| **Estimated runtime** | ~10s full suite (~194 tests, 24 files, currently green) |

**Hard constraint:** No DOM env → React components are NOT unit-testable this phase. All logic (JSON validation, graph-write remap planning, lint composition, draft-filter builder, /suggest constraint math) MUST be extracted into pure `src/lib/*` modules to be covered; components stay thin wiring validated by live UAT.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/<touched>.test.ts`
- **After every plan wave:** Run `cd recipe-planner && npm test` (full suite green)
- **Before `/gsd-verify-work`:** Full suite green + `npx tsc --noEmit` clean
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Req | Behavior (observable) | Test Type | Automated Command | File Exists | Status |
|-----|-----------------------|-----------|-------------------|-------------|--------|
| IMP-01 | Draft recipe never appears in WeekWizard pool / Add-Meal picker; published + un-set do | unit (filter builder) | `npx vitest run src/lib/lifecycle/draft-filter.test.ts` | ❌ W0 | ⬜ pending |
| IMP-02 | Malformed JSON never yields a partial write — validator returns errors, no `buildRecipeGraph` call | unit | `npx vitest run src/lib/import/validate-import.test.ts` | ❌ W0 | ⬜ pending |
| IMP-02 | `planGraphWrites(graph, seed)` emits correct create/update ops + edge remap for a fixture graph | unit (pure planner) | `npx vitest run src/lib/import/graph-write.test.ts` | ❌ W0 | ⬜ pending |
| IMP-02 | Product resolution: high-score auto-matches, low-score flagged for inline resolve | unit | `npx vitest run src/lib/search/product-search.test.ts` (extend) | ⚠️ extend | ⬜ pending |
| IMP-07 | Publish blocked when a step-lint rule fails; status unchanged | unit | `npx vitest run src/lib/linter/recipe-lint.test.ts` | ❌ W0 | ⬜ pending |
| IMP-07 | Import path never invokes lint (invariant) | unit/assertion | covered in validate-import + graph-write tests | ❌ W0 | ⬜ pending |
| IMP-06 | Write-back keeps `planned_meals.recipe` id + unchanged-node ids stable (override survives); removed node → dangling override flagged | unit (pure remap planner) | `npx vitest run src/lib/import/write-back.test.ts` | ❌ W0 | ⬜ pending |
| IMP-05 | Note create/list/drain hook shape (`useRecipeNotes` mirrors `useRecipeQueue`) | manual (hook) | live UAT | manual | ⬜ pending |
| IMP-04 | Registry-overlap / active-time / batch-fit computation on a fixture | unit | `npx vitest run src/lib/suggest/constraints.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/import/validate-import.test.ts` — IMP-02 (never-throw normalizer)
- [ ] `src/lib/import/graph-write.test.ts` — IMP-02 (pure `planGraphWrites` create/update/edge remap)
- [ ] `src/lib/import/write-back.test.ts` — IMP-06 / D-10 (node-id preservation + dangling-override detection)
- [ ] `src/lib/lifecycle/draft-filter.test.ts` — IMP-01 (fail-open `status != "draft"` builder incl. empty status)
- [ ] `src/lib/linter/recipe-lint.test.ts` — IMP-07 (`runRecipeLint` composes step + product, excludes week)
- [ ] Extend `src/lib/search/product-search.test.ts` — `scoreProduct` confidence gate
- [ ] `src/lib/suggest/constraints.test.ts` — IMP-04 (overlap/active-time/batch-fit math), if extracted

*Architecture note: extract a pure `planGraphWrites(graph, remapSeed)` from the PB-executing `buildRecipeGraph` so id-remap is testable without live PocketBase. Framework already installed — no new deps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Import page paste→resolve→land | IMP-02, IMP-03 | React component, no jsdom | Paste fixture JSON on tablet; confirm draft lands in prod + opens in RecipeEditor |
| Draft `<Chip>` badge in recipe list | IMP-01 | React component | Confirm draft recipes render badged, published do not |
| RecipeEditor Publish button + lint gate | IMP-07 | React component | Publish a lint-failing draft → blocked with findings; fix → publishes |
| Note-attach buttons (cook mode / calendar / card) | IMP-05 | React components | One-tap note from each surface writes a pending `recipe_notes` row |
| Wizard "review revised recipe?" flag | IMP-06 | React component | Recipe with pending draft revision shows flag in WeekWizard |
| Schema migration on prod + test DB | IMP-01, IMP-05 | PocketBase admin op | Run migration script test-first (8091) then prod (8090); verify `status` backfilled `published`, `recipe_notes` created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
