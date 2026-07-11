---
phase: 06-import-pipeline-recipe-lifecycle
verified: 2026-07-11T00:39:04Z
status: human_needed
score: 5/5 must-haves verified (automated logic + wiring); 6 UI behaviors UAT-pending
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
human_verification:
  - test: "On Test DB set one recipe status=draft, leave another published. Open Recipes list; open WeekWizard (Fill Week); open a weekly plan Add-Meal picker."
    expected: "Draft recipe shows a grey 'Draft' chip in the list; published does not. Draft recipe is NOT in any WeekWizard slot pool and NOT selectable in the Add-Meal picker."
    why_human: "React components with no jsdom test env; DB-query filtering + visual badge are only observable in a live browser (SC1 / IMP-01)."
  - test: "Open /import on a tablet, paste a fixture recipe JSON with at least one unmatched/low-confidence product line. Resolve inline (auto-match / pick-existing / QuickCreateProductDialog). Also paste a malformed JSON."
    expected: "Valid paste: unmatched lines surface a 'Match these products' step; on resolve the recipe lands directly in prod as a draft (buildRecipeGraph status=draft) and redirects into RecipeEditor. Malformed paste: warnings render, nothing is saved, no partial write, button stays enabled. No test DB / migration script involved."
    why_human: "Full paste→resolve→land→redirect round-trip is a React flow, jsdom-untestable (SC2 / IMP-02, IMP-03)."
  - test: "Run /suggest-recipes in Claude Code against the live registry."
    expected: "3-5 candidate summaries print in chat with registry-overlap %, active time, and batch-fit computed via lib/suggest/constraints.ts; only accepted candidates are built as drafts."
    why_human: "Manual chat-first skill; proposal quality and chat ergonomics are agent-runtime, not statically checkable (SC3 / IMP-04)."
  - test: "Tap 'Add note' on all three surfaces — recipe card (Recipes), cook-mode Now/Next card, and calendar week cell (WeeklyPlans)."
    expected: "Each tap lands a status='pending' recipe_notes row with the correct source_surface (recipe-card / cook-mode / calendar) and recipe relation, with no page navigation. Three correctly-tagged rows persist in PocketBase."
    why_human: "Tablet touch-target ergonomics + live PB persistence across three surfaces; jsdom-untestable (SC4 / IMP-05)."
  - test: "Run the evolve-recipes skill to drain a pending note into a draft revision, approve it, then seed that draft revision and open WeekWizard (Fill Week)."
    expected: "Note drains into a draft revision (revision_of set, source_node linkage) via buildRecipeGraph; on approval planWriteBack writes the reviewed graph back onto the ORIGINAL recipe id (planned_meals + overrides survive). WeekWizard shows a low-emphasis 'Revised — review?' chip on the pool recipe that opens the draft in RecipeEditor without pushing it into the plan; absent when no pending draft revision exists."
    why_human: "Wizard flag visual treatment + live navigation and the full note→revision→write-back loop are React/agent-runtime; the planWriteBack invariant itself IS unit-tested (SC4 / IMP-06)."
  - test: "Open a DRAFT recipe with a lint-violating step (missing durations/prep_action). Click Publish. Then fix the violation, Save, and Publish again."
    expected: "First Publish: 'Fix N issue(s) before publishing' dialog lists findings, recipe stays a draft (chip remains), status unchanged. After fix: Publish succeeds silently, the Publish button disappears, and the recipe re-enters the WeekWizard pool / Add-Meal picker. Importing itself is never blocked."
    why_human: "Publish button click → lint-gate → status transition is a React interaction; the runRecipeLint composition IS unit-tested (SC5 / IMP-07)."
---

# Phase 6: Import Pipeline & Recipe Lifecycle Verification Report

**Phase Goal:** Adding and evolving recipes happens entirely in-app, with drafts kept out of planning until approved — retiring the test-database migration ritual.
**Verified:** 2026-07-11T00:39:04Z
**Status:** human_needed (all logic + wiring automated-proven; component-level UI behaviors UAT-pending by documented no-jsdom posture)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Recipes have draft/published status; drafts invisible to planning, visible+badged in list (IMP-01) | ✓ VERIFIED (core) · UAT-pending (UI) | Schema: `pb_schema.json` `recipes.status` select [draft,published] (L1050-1057) + `apply-phase6-schema.mjs` backfills all rows→published. Filter applied at BOTH planning call sites: `WeekWizard.tsx:113` and `WeeklyPlans.tsx:157` via `buildDraftExcludingFilter()`. Fail-open logic (`status != "draft"`, keeps unset) unit-tested in `draft-filter.test.ts`. Draft `<Chip>` at `Recipes.tsx:432-434`. Visual badge + live pool-exclusion = UAT. |
| 2 | Paste JSON in-app → draft lands in prod, no test DB / migration (IMP-02, IMP-03) | ✓ VERIFIED (core) · UAT-pending (UI) | `/import` route registered `App.tsx:60`, nav `Layout.tsx:153`. `Import.tsx` pipeline: `validateImportJson` (never-throws, L6 invariant) → inline resolve via `QuickCreateProductDialog` → `buildRecipeGraph({status:"draft"})` (L108) → `navigate("/recipes/"+recipeId)`. `recipe-import` skill rewritten to EMIT JSON (no scripts, retires migration ritual). Pure `validateImportJson`/`planGraphWrites` unit-tested. E2E paste flow = UAT. |
| 3 | /suggest-recipes proposes 3-5 registry-reusing, low-active-time, batch-compatible candidates (IMP-04) | ✓ VERIFIED (core) · UAT-pending (runtime) | `.claude/skills/suggest-recipes/SKILL.md` (3-5, accepted-only, reuses `constraints.ts`). `lib/suggest/constraints.ts` exports `registryOverlap`, `activePrepMinutes`, `batchFit`, `macroEstimate`, `CONFIDENT_MATCH_GATE` — all unit-tested in `constraints.test.ts`. Macro floor is a soft "estimated" heuristic (D-08, no macro data) — matches ROADMAP wording. Live proposal = manual skill run. |
| 4 | One-tap note from calendar/cook-mode/recipe-card → agent draft revision surfaced in wizard (IMP-05, IMP-06) | ✓ VERIFIED (core) · UAT-pending (UI) | `AddNoteButton` wired to all 3 surfaces: `Recipes.tsx:509`, `cook-mode/NowNextCard.tsx:124`, `WeeklyPlans.tsx:990` (sourceSurface tagged). `useRecipeNotes.addNote` creates `status:"pending"` rows. `evolve-recipes` skill drains notes→draft revision, write-back via `planWriteBack`. Wizard flag: `WeekWizard.tsx:122-136,551-582` queries pending draft revisions, indexes by `revision_of`, renders review link. `planWriteBack` id-stability invariant unit-tested (`write-back.test.ts`). Live loop + flag render = UAT. |
| 5 | Publishing blocked until recipe linter passes; importing never blocked (IMP-07) | ✓ VERIFIED (core) · UAT-pending (UI) | `RecipeEditor.handlePublish` (L763-782): `runRecipeLint(id)` → if findings>0 open dialog + RETURN before any status write; else `update(status:"published")`. Publish button draft-only guarded `status==="draft"` (L908). `runRecipeLint` composes step+product, EXCLUDES week lint — unit-tested `recipe-lint.test.ts`. Import never-block invariant via never-throw `validateImportJson`. Live publish-gate click = UAT. |

**Score:** 5/5 truths verified at logic + wiring level (0 present-behavior-unverified; the two behavior-dependent invariants — draft-filter fail-open and write-back id-stability — are exercised by passing unit tests). 6 UI/runtime behaviors routed to human UAT.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/import/validate-import.ts` | Never-throw import normalizer | ✓ VERIFIED | First-class never-block invariant; unit-tested |
| `lib/import/build-recipe-graph.ts` | Shared graph-write spine | ✓ VERIFIED | Wired into Import.tsx + RecipeEditor; planGraphWrites tested |
| `lib/import/write-back.ts` | Pure `planWriteBack` id-stability | ✓ VERIFIED | Unit-tested; consumed by evolve-recipes skill |
| `lib/lifecycle/draft-filter.ts` | Fail-open draft-exclusion filter | ✓ VERIFIED | Applied at 2 planning call sites; tested |
| `lib/linter/recipe-lint.ts` | `runRecipeLint` step+product, no week | ✓ VERIFIED | Wired to Publish button; tested |
| `lib/suggest/constraints.ts` | 4-constraint math | ✓ VERIFIED | Unit-tested; consumed by suggest-recipes skill |
| `hooks/useRecipeNotes.ts` | Note CRUD (pending) | ✓ VERIFIED | Consumed by AddNoteButton |
| `pages/Import.tsx` | Paste→resolve→land page | ✓ VERIFIED (wired) | Route + nav registered; UI flow = UAT |
| `components/AddNoteButton.tsx` | One-tap note on 3 surfaces | ✓ VERIFIED (wired) | All 3 call sites present |
| `pb_schema.json` | status + recipe_notes + revision_of + source_node | ✓ VERIFIED | All fields present; migration script backfills |
| `.claude/skills/{recipe-import,suggest-recipes,evolve-recipes}` | Manual JSON-emitting skills | ✓ VERIFIED | All 3 present, wire to tested lib modules |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `WeekWizard.tsx` / `WeeklyPlans.tsx` | recipes query | `buildDraftExcludingFilter()` filter | ✓ WIRED |
| `Import.tsx` | prod DB | `buildRecipeGraph({status:"draft"})` | ✓ WIRED |
| `RecipeEditor.handlePublish` | `runRecipeLint` | gate before status write | ✓ WIRED |
| `AddNoteButton` (×3 surfaces) | `recipe_notes` | `useRecipeNotes.addNote` | ✓ WIRED |
| `evolve-recipes` skill | original recipe id | `planWriteBack` remapSeed | ✓ WIRED |
| `WeekWizard` flag | draft revision | `revision_of` query + index | ✓ WIRED |
| suggest/evolve skills | constraint/write-back math | `lib/suggest/constraints.ts`, `lib/import/write-back.ts` | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full pure-logic suite (incl. all phase-6 test files) | `npx vitest run` | 31 files, 263 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | clean, no errors | ✓ PASS |
| Live prod PocketBase probe (status backfill / recipe_notes reachable) | `curl :8090` | server offline at verify time | ? SKIP → covered by migration script + SUMMARY attestation (57/57 backfilled) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| IMP-01 | 06-01,03,05 | ✓ SATISFIED | status field + 2-site filter + Draft chip |
| IMP-02 | 06-02,04,07 | ✓ SATISFIED | validate + graph-write + Import page |
| IMP-03 | 06-07,11 | ✓ SATISFIED | recipe-import skill emits JSON, no scripts |
| IMP-04 | 06-11 | ✓ SATISFIED | suggest-recipes skill + constraints module |
| IMP-05 | 06-08 | ✓ SATISFIED | useRecipeNotes + AddNoteButton ×3 surfaces |
| IMP-06 | 06-09,10 | ✓ SATISFIED | planWriteBack + evolve-recipes + wizard flag |
| IMP-07 | 06-03,06 | ✓ SATISFIED | runRecipeLint + draft-only Publish gate |

No orphaned requirements: all IMP-01…IMP-07 map to plans that claimed them.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX` debt markers, no `TODO`/`HACK`/`PLACEHOLDER`, no stubs in phase source files. The single `return null` at `Import.tsx:286` is a legitimate map-guard (skip missing node), not a stub render.

### Human Verification Required

6 items (see frontmatter `human_verification`) — all are React-component or manual-skill runtime behaviors that are jsdom-untestable by the project's documented no-DOM test posture (`06-VALIDATION.md`). Each was deliberately deferred to end-of-phase UAT and recorded in the per-plan SUMMARY "Needs UI Verification (UAT)" sections. They cover: (1) draft chip + planning exclusion, (2) import paste→land round-trip, (3) /suggest-recipes proposal, (4) three note surfaces persist pending rows, (5) evolution loop + wizard flag, (6) publish lint-gate transition.

### Gaps Summary

No gaps. Every ROADMAP success criterion has its logic and wiring verified against the actual codebase: pure modules unit-tested (263 green), all wiring points confirmed present and connected, schema migration script + `pb_schema.json` carry the status/recipe_notes/revision_of/source_node additions, and all three manual skills exist and delegate to the tested lib modules. The two subtlest behavior-dependent invariants (draft-filter fail-open, write-back node-id stability) are backed by passing unit tests, so they are VERIFIED rather than present-behavior-unverified. The phase is NOT failed — it is `human_needed` solely because the component-level and manual-skill runtime behaviors require live human UAT (an intentional, documented posture), not because any implementation is missing, stubbed, or unwired.

---

_Verified: 2026-07-11T00:39:04Z_
_Verifier: Claude (gsd-verifier)_
