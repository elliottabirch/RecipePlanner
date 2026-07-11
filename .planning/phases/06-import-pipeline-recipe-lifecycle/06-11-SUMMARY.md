---
phase: 06-import-pipeline-recipe-lifecycle
plan: 11
subsystem: skills
tags: [recipe-import, suggest-recipes, import-json, constraints, vitest, agent-skills]

# Dependency graph
requires:
  - phase: 06-import-pipeline-recipe-lifecycle (Plan 02)
    provides: validateImportJson / NormalizedGraph D-01 contract + scoreProduct confidence gate
  - phase: 06-import-pipeline-recipe-lifecycle (Plan 04)
    provides: buildRecipeGraph({status}) — the single graph-write spine that lands drafts
  - phase: 05 (prep-day engine)
    provides: recipe_steps Phase-5 metadata (active_minutes/passive_minutes/prep_action/resource/…)
provides:
  - recipe-import skill rewritten to EMIT the D-01 import JSON (no more scripts / test-DB / promote ritual)
  - references/schema.md refreshed to the Phase-5-aware contract (7 step fields + recipes.status)
  - /suggest-recipes manual chat-first skill (propose 3-5, land only accepted as drafts)
  - pure constraints module (registryOverlap / activePrepMinutes / batchFit / macroEstimate) + tests
affects: [import-page, recipe-lifecycle, agent-skills, suggest-recipes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skill emits JSON for the in-app /import page instead of generating per-recipe DB scripts"
    - "Constraint math extracted to a pure, node-testable src/lib module (no PB, no React)"
    - "Soft macro heuristic explicitly flagged estimated:true — never a hard filter (D-08)"

key-files:
  created:
    - recipe-planner/src/lib/suggest/constraints.ts
    - recipe-planner/src/lib/suggest/constraints.test.ts
    - .claude/skills/suggest-recipes/SKILL.md
  modified:
    - .claude/skills/recipe-import/SKILL.md
    - .claude/skills/recipe-import/references/schema.md

key-decisions:
  - "recipe-import + suggest-recipes both emit D-01 JSON for the /import page (single write path via buildRecipeGraph); direct-write node scripts avoided since the app api client reads localStorage"
  - "Confidence gate default CONFIDENT_MATCH_GATE=0.15 (D-02 / Assumption A5), tunable per call"
  - "batchFit.fit = recipe_type==batch_prep AND >=50% steps batch-timed; exposes batchStepRatio too"
  - "macroEstimate returns estimated:true literal + caveat note; sums protein_g (0 today) so it degrades to a real figure once macros are backfilled, still non-authoritative"

patterns-established:
  - "Pattern: agent skills produce paste-ready import JSON, not scripts — retires the test->prod migration ritual"
  - "Pattern: /suggest constraints reuse scoreProduct so proposal ranking matches app search (no near-dupe divergence)"

requirements-completed: [IMP-03, IMP-04]

coverage:
  - id: D1
    description: "recipe-import skill emits the D-01 {name+hints} JSON contract; script-gen / test-DB / promote-to-prod steps removed; schema.md refreshed with Phase-5 step fields + status"
    requirement: "IMP-03"
    verification:
      - kind: manual_procedural
        ref: "grep guard: schema.md contains active_minutes/prep_action/status AND SKILL.md contains no port 8091 / promote to prod / migrate-[recipe"
        status: pass
    human_judgment: true
    rationale: "Skill prose quality (does the emitted-JSON guidance actually produce a valid import payload) is a judgment call best confirmed by running the skill on a real recipe; the grep guard only proves the ritual was removed."
  - id: D2
    description: "Pure constraints module: registryOverlap / activePrepMinutes / batchFit / macroEstimate with macro explicitly soft/estimated"
    requirement: "IMP-04"
    verification:
      - kind: unit
        ref: "recipe-planner/src/lib/suggest/constraints.test.ts (16 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/suggest-recipes manual skill: reads registry + recent plans, prints 3-5 candidate summaries with the four constraints, lands only accepted candidates as drafts"
    requirement: "IMP-04"
    verification:
      - kind: manual_procedural
        ref: "grep: SKILL.md references overlap/active/batch/estimated/draft + constraints module + buildRecipeGraph({status:draft})"
        status: pass
    human_judgment: true
    rationale: "Whether the skill actually proposes good, non-duplicate, registry-reusing candidates and lands clean drafts requires a live run against prod — not statically checkable."

# Metrics
duration: 6min
completed: 2026-07-11
status: complete
---

# Phase 6 Plan 11: Recipe-Import Rewrite + /suggest-recipes Summary

**recipe-import now emits the D-01 import JSON for the /import page (retiring the test→prod script ritual), and a new chat-first /suggest-recipes skill proposes registry-reusing candidates scored by a pure, tested constraints module — landing only accepted ones as drafts.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-11T00:25:48Z
- **Completed:** 2026-07-11T00:31:XXZ
- **Tasks:** 3
- **Files modified:** 5 (2 created lib + test, 1 new skill, 2 rewritten skill files)

## Accomplishments
- Rewrote `.claude/skills/recipe-import/SKILL.md` to emit the D-01 `{name+hints}` JSON contract that `validateImportJson` accepts and the `/import` page lands as a draft — deleting the old Step 4 (script gen), Step 5 (test-DB run on 8091), and Step 6 (promote-to-prod migration). The migration ritual is retired (IMP-03).
- Refreshed the stale `references/schema.md` to the Phase-5-aware contract: added the 7 `recipe_steps` fields (`active_minutes`, `passive_minutes`, `instructions`, `prep_action`, `resource`, `oven_temp_f`, `rack_slots`) and the `recipes.status` lifecycle field, plus a full D-01 JSON contract summary.
- Built `recipe-planner/src/lib/suggest/constraints.ts` — pure `registryOverlap` / `activePrepMinutes` / `batchFit` / `macroEstimate`, with the macro figure explicitly flagged `estimated: true` (D-08, protein_g=0 across the registry).
- Added `.claude/skills/suggest-recipes/SKILL.md` — a manual, chat-first proposer (3-5 candidates, four constraints printed per candidate) that lands ONLY accepted candidates as drafts via the D-01 contract + `buildRecipeGraph({status:"draft"})`.

## Task Commits

1. **Task 1: Rewrite recipe-import skill + refresh schema.md** - `d177fcd` (feat)
2. **Task 2 (RED): failing constraints tests** - `fcc6a22` (test)
3. **Task 2 (GREEN): constraints module implementation** - `9d985ef` (feat)
4. **Task 3: /suggest-recipes manual skill** - `94f8b1f` (feat)

_Task 2 was TDD (test → feat)._

## Files Created/Modified
- `recipe-planner/src/lib/suggest/constraints.ts` - Pure constraint math for /suggest (overlap/active/batch/soft-macro), reuses `scoreProduct`; no PB/React so it runs under Vitest node env.
- `recipe-planner/src/lib/suggest/constraints.test.ts` - 16 tests covering all four functions incl. macro-is-soft assertions.
- `.claude/skills/suggest-recipes/SKILL.md` - New chat-first suggestion skill.
- `.claude/skills/recipe-import/SKILL.md` - Rewritten to emit D-01 JSON; migration ritual removed.
- `.claude/skills/recipe-import/references/schema.md` - Refreshed to Phase-5 contract + status + JSON summary.

## Decisions Made
- **Both skills emit JSON for the /import page rather than writing directly.** `buildRecipeGraph` lazy-imports the app's `api.ts` (which reads `localStorage` at load), so a plain node script can't call it. Emitting the D-01 JSON keeps a single write path (the /import page → buildRecipeGraph) and mirrors the just-rewritten recipe-import ergonomics. The skill's DB access is read-only (registry/plan lookups).
- **`CONFIDENT_MATCH_GATE = 0.15`** as the default overlap gate (D-02 / Assumption A5), overridable per call.
- **`batchFit` returns both a boolean `fit` and `batchStepRatio`** so the skill can print a nuanced summary, with `fit` requiring `batch_prep` type AND a batch-timed step majority.
- **`macroEstimate.estimated` is the literal `true`** and the note documents protein_g=0 across the registry — making it structurally impossible to present as authoritative (threat T-06-11b).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. Full suite (263 tests, 31 files) green; `npx tsc --noEmit` clean.

## Known Stubs
None. `macroEstimate` returning 0 today is not a stub — it is the correct, documented soft-heuristic behavior (protein_g=0 across the registry per D-08); it will surface real figures automatically once nutrition backfill lands, still flagged estimated.

## Threat Flags
None. No new network endpoints, auth paths, or trust boundaries introduced — skills read the registry read-only and the /import page (existing surface) performs writes.

## Self-Check: PASSED
All 5 deliverable files present on disk; all 4 task commits (d177fcd, fcc6a22, 9d985ef, 94f8b1f) present in git history.
