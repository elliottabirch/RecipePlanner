---
quick_id: 260716-u4p
type: quick
status: incomplete
completed: null
files_modified:
  - recipe-planner/src/lib/scheduler/day-of-work.ts
  - recipe-planner/src/lib/scheduler/day-of-work.test.ts
  - recipe-planner/src/pages/CookMode.tsx
  - recipe-planner/src/lib/linter/rules/timing-coherence.ts
  - recipe-planner/src/lib/linter/rules/timing-coherence.test.ts
  - recipe-planner/src/lib/linter/index.ts
  - recipe-planner/scripts/split-create-spaghetti-step.js
  - .planning/todos/pending/2026-07-16-publish-gate-is-severity-blind.md
  - .planning/todos/pending/2026-07-12-day-of-steps-have-no-surface-cook-mode-ends-silently.md
  - .planning/todos/pending/2026-07-12-mis-tagged-just-in-time-timing-on-make-ahead-steps.md
  - .planning/todos/resolved/2026-07-12-garlic-cube-clove-unit-conversion.md
  - .planning/todos/resolved/2026-07-16-thyme-mixes-sprigs-and-packages-in-each.md
  - .planning/STATE.md
commits:
  - "73bab2c docs(260716-u4p): plan JIT silent-end fix, mistag guard, spaghetti split"
  - "c63d799 fix(260716-u4p): cook mode names day-of meals instead of claiming completion"
  - "9f47692 feat(260716-u4p): timing-coherence linter rule + capture severity-blind publish gate"
  - "28c9102 feat(260716-u4p): create-spaghetti split script — audit, gated apply, rollback"
  - "b6f009f docs(260716-u4p): backlog hygiene — file resolved todos, correct stale entries"
---

# Quick Task 260716-u4p: Stop cook mode's silent-completion lie, split `create spaghetti`, guard timing mis-tags

**Tasks 1-4 of 4 complete. The checkpoint — the human-gated `--apply` of the `create spaghetti` split against real prod — has NOT run. Prod recipe data is untouched: `create spaghetti` is still one mega-step in both spaghetti recipes, scheduled wholesale on Saturday.**

## Status: INCOMPLETE — blocking human checkpoint outstanding

1. Stop cook mode claiming "All steps complete!" while day-of cooking remains (DONE)
2. Ship the `timing-coherence` linter rule + capture the severity-blind publish gate as a todo (DONE)
3. Build, rehearse (apply AND rollback, on `:8091`), and ship the `create spaghetti` split script (DONE — script shipped, rehearsed, prod untouched)
4. Backlog hygiene — file resolved todos, correct stale STATE.md/todo entries (DONE)
5. **The human-gated prod `--apply` of the split (NOT DONE — this is the checkpoint)**

## What shipped

### Task 1 — Cook mode names day-of work instead of claiming completion (commit `c63d799`)

**The bourguignon retag this plan was originally scoped to perform is ALREADY APPLIED — by hand, with no commit and no script, by an unrecorded actor, sometime between 2026-07-12 and 2026-07-16.** Verified against live prod 2026-07-16: `Pull garlic cubes`, `Brown mushrooms`, and `Simmer bourguignon` all read `timing=batch`; the `Pull garlic cubes → Simmer bourguignon` edge is intact in the live week graph. `git log --all` over `*retag*`/`*timing*` is empty and no such script exists in `scripts/`. **A prod data change made outside the repo was invisible to the backlog** — three todos and four STATE.md entries all still described it as pending, and this plan's own scope was built on that stale claim. That is the process finding (see Task 4), and it is the second time in two days the backlog's own diagnosis was itself the defect (cf. `260716-rpp`).

**Cook mode was not "ending silently" — it was asserting a false completion.** `CookMode.tsx:704-712` rendered "All steps complete! / Every prep-day step in this plan has been checked off." whenever `visibleOrder.length === 0`, even with day-of (`just_in_time`) cooking still ahead — an affirmative, incorrect claim, which is worse than silence. New pure module `src/lib/scheduler/day-of-work.ts` (`collectDayOfWork` / `formatDayOfSummary`) is the deliberate complement of `week-graph.ts:158`'s JIT exclusion, predicating on `timing === JustInTime` alone — deliberately NOT `isJustInTimeStep`, which also requires `step_type === Assembly` and would recreate the invisibility hole for a mis-tagged prep step (verified latent, not live: zero of prod's 17 timed `prep` steps are JIT today, but the predicate must stay a true complement regardless). CookMode now shows "Prep day complete." followed by the named meals/steps remaining; the original wording survives only when genuinely nothing remains.

9 new tests in `day-of-work.test.ts`, including a hand-built, offline fixture reconstructing week 7/13's exact pre-split day-of summary from the verified probe: *"4 meals still need day-of cooking: Harissa Cod with Chickpeas (1 step), Mushroom Bourguignon (Simple) (2 steps), salad and salmon (2 steps), Creamy Tomato Soup (1 step)"* — not the source todo's predicted text. Full suite green (319 tests), `tsc --noEmit` clean, build succeeds.

### Task 2 — `timing-coherence` linter rule + severity-blind gate todo (commit `9f47692`)

**`create spaghetti` was retagged `batch` WHOLESALE rather than split — invisible became wrongly-scheduled, not fixed.** Both `meat spaghetti` and `meat spaghetti (micah)`'s `create spaghetti` step (8a/15p, assembly/batch, stovetop) verified unchanged from the original mis-tag audit; the app currently schedules boiling noodles, plating, and parmesan for Saturday. Meat spaghetti is planned in the live week and does not appear in the day-of list.

**The linter rule as originally scoped would have bricked ten published recipes.** "An `assembly` step with meaningful `passive_minutes` tagged `just_in_time` is at least a warning" produces 10 findings against live prod, ALL false positives (`cook salmon`, `cook hamburger patties`, `cook lasagna`, `cook garlic chicken`, `assemble roasting veg and cook salmon`, `assemble tuna salad sandwiches`, `Warm pitas in oven`, `bake french fries`, `Cook egg noodles`, `Bake cod (day-of)`) — and a `warning` is not advisory: `RecipeEditor.tsx:767` is `if (lintFindings.length > 0)`, so it hard-blocks publish exactly like an `error`. Shipped the conjunction the evidence supports instead: `passive_minutes >= 5` AND a `/simmer|braise|stew/i` verb in the step's name+instructions. Zero live findings against the 24 live JIT steps; 3 of 5 historical mis-tags caught (`Simmer bourguignon`, `create spaghetti` ×2). `roast` was deliberately excluded despite being requested — it adds 2 false positives and catches nothing extra; `bake` adds 3 more. `Brown mushrooms` (12a/0p) and `Pull garlic cubes` (1a/0p) are zero-passive and structurally uncatchable by any passive-gated rule — a KNOWN, ACCEPTED miss, pinned by the test suite, not chased by relaxing the gate.

The severity-blind publish gate itself is captured as a new todo (`.planning/todos/pending/2026-07-16-publish-gate-is-severity-blind.md`), scoped honestly using the measured blast radius: only 2 of 67 recipes would block on re-publish today, and 0 drafts exist in prod, so this is a design defect with a long tail, not a live outage. Fixing it re-opens what every existing rule's severity is allowed to mean — its own task, not bundled here.

7 new tests in `timing-coherence.test.ts`, including a `PROD_JIT_2026_07_16` fixture encoding all 11 blessed live JIT steps and asserting zero findings — the executable form of the design argument; widening the verb list or dropping the passive gate makes this fixture fail. Full suite green (326 tests), `tsc --noEmit` clean, build succeeds.

### Task 3 — `create spaghetti` split script: audit, gated apply, rollback (commit `28c9102`)

`scripts/split-create-spaghetti-step.js` follows the established gated-write pattern (`audit-node-quantities.js`): resolves both spaghetti recipes by id, asserts the step's exact shape (assembly/batch/8a/15p/stovetop) before proposing anything, and emits a full graph-delta worksheet (JSON + Markdown), seeded `confirmed: false`:

- **RETAG+RENAME** the reused step to "Simmer meat sauce" (stays `batch`), narrowed to the sauce.
- **NEW step** "Boil spaghetti and plate" (`assembly`/`just_in_time`).
- **RETARGET** the `spaghetti noodles dry` and `parmesan cheese` product→step edges, and the `meat spaghetti stored` step→product edge, onto the new step.
- **NEW shared product** `meat sauce` (`stored`, `canonical_unit: cup`, mirroring `tahini sauce`) — omitting `canonical_unit` would make both recipes unpublishable, since `lintMissingCanonicalUnit` has no type exemption.
- **NEW load-bearing edge**: meat-sauce node → "Boil spaghetti and plate" — without it the plate step has no dependency on its sauce, reproducing the exact silent-edge-drop failure this whole cluster is about.

Both judgement calls (the 6a/15p + 2a/8p duration apportionment; `stored` vs. the bourguignon reference's `transient`) are surfaced explicitly in the worksheet for human confirmation, not resolved silently.

`--apply` re-verifies live state against the worksheet's recorded "before" snapshot before writing (aborts on any drift), requires `confirmed: true`, backs up via `pb.backups.create()` before the first write, and writes a rollback worksheet incrementally as each record is created — covering CREATES (1 product, 2 steps, 2 nodes, 4 edges), not just field reverts, since this write mints new records (unlike the garlic/thyme field-only sweeps). `--rollback` reverts the retargeted edges and renamed steps first, then deletes created records children-before-parents (edges → nodes → steps → product).

**Rehearsed end-to-end against `:8091`** (synced fresh from prod via `sync-to-test.js`): `--apply` landed cleanly (product + both steps + both nodes + all 8 edges created/retargeted); `buildWeekGraph` confirmed "Boil spaghetti and plate" is correctly ABSENT from the week graph (JIT) while "Simmer meat sauce" (batch) remains present, and the recipe-graph-level sauce→node→plate dependency chain holds; `collectDayOfWork` picked up `meat spaghetti` as a genuine 5th day-of entry with its `Boil spaghetti and plate` step. `--rollback` was then executed for real (not just written) and verified via direct read-back to restore the exact original step names/durations/timing and edge counts (8 product→step edges, 2 step→product edges), and to delete the created product. **Prod (`:8090`) is untouched** — the shipped worksheet is a fresh, `confirmed: false` read-only report generated against prod after the rehearsal, with no rollback file present (nothing was ever applied there).

### Task 4 — Backlog hygiene (commit `b6f009f`)

Filed both `[RESOLVED 2026-07-16]` todos (garlic, thyme) into `resolved/` via `git mv`. Corrected STATE.md's Pending Todos: FOUR entries were stale, not the two originally scoped — `mis-tagged-just-in-time-timing-on-make-ahead-steps` and `day-of-steps-have-no-surface-cook-mode-ends-silently` rewritten against the verified probe; `alias-units-break-cross-recipe-aggregation`'s retracted "never calls normalizeUnit" claim and its dependency on the (now-resolved) garlic todo dropped; the resolved garlic entry removed entirely; `publish-gate-is-severity-blind` added. Both source todos rewritten with a `## Corrected 2026-07-16 (u4p)` section recording what was previously claimed, what the 2026-07-16 probe found, and why — neither is silently closed, since a todo that disappears teaches nothing. **Both stay pending**, each now carrying exactly one deferred piece: the mis-tag todo carries the `create spaghetti` split's human `--apply` and the import-skill tightening; the day-of todo carries the still-unbuilt day-of cook surface.

## What did NOT happen (and why)

**The human-gated prod `--apply` of the `create spaghetti` split.** This is the write that actually fixes Meat Spaghetti's wrongly-scheduled cook, and it was deliberately not run against prod in this session — per the non-negotiable constraint that only the human runs `--apply` against `:8090`, behind the checkpoint below. It requires:
1. A human to read `scripts/dedup-output/split-create-spaghetti.md`, rule on the duration apportionment and the `stored`-vs-`transient` product-type divergence, and set `confirmed: true` in the JSON worksheet.
2. A dry-run against prod, reading the full delta.
3. Only then, `--apply` against prod — printing the backup id and rollback worksheet.
4. A read-back confirmation and an end-to-end check in the live app (with a hard-refresh, per the known NAS-deploy caching quirk) that cook mode's day-of summary now includes `meat spaghetti (1 step)`.

**Prod recipe data remains exactly as it was before this session.** Bourguignon's three steps are `batch` (verified, unchanged — nothing to write there). Both spaghetti recipes' `create spaghetti` step is still one 8a/15p mega-step; no `meat sauce` product exists; no split has landed.

## Deviations from Plan

None — plan executed exactly as written for all four tasks. Two implementation details not spelled out verbatim in the plan text:

**[Rule 2 — design completion] `split-create-spaghetti-step.js`'s `--rollback` mode.** The plan required the rollback path to be "rehearsed for real," which implies a mechanism to execute it, but didn't specify the CLI shape. Implemented as a third mode (`--rollback`) on the same script, reading the rollback worksheet and reverting retargets/renames before deleting created records children-before-parents. Verified by actually running it against `:8091` and confirming the graph returned to its exact original shape (this session; see Task 3).

**[Rule 2 — design completion] Dual-mode load-or-generate worksheet logic, mirroring `audit-node-quantities.js`.** If `split-create-spaghetti.json` doesn't exist, the script builds a fresh report from live PocketBase data; if it exists, it reloads it (preserving human edits) and re-verifies every recorded "before" value against live state before printing the planned delta, aborting loudly on any drift. This is what makes the checkpoint's "dry-run → confirm → apply" sequence work with the same command at every step.

## Known Stubs

None. No hardcoded empty/placeholder values were introduced.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-write-path | `recipe-planner/scripts/split-create-spaghetti-step.js` | New script capable of writing to prod PocketBase (creating a product, 2 steps, 2 nodes, 4 edges; updating 2 steps; retargeting 6 edges). Follows the exact auth/backup/dry-run-by-default conventions of `audit-node-quantities.js` (superuser creds from gitignored `.env.local`, never printed; `--apply` explicitly opt-in and requires `confirmed: true`; `pb.backups.create()` before any mutation; drift-checked against a recorded "before" snapshot). No new HTTP endpoints or auth paths — it uses the existing PocketBase collections and superuser auth flow. The write itself has not run against prod; it is gated behind the checkpoint below. |

## Self-Check: PASSED

All 7 created/modified source files confirmed present on disk (`day-of-work.ts`, `day-of-work.test.ts`, `CookMode.tsx`, `timing-coherence.ts`, `timing-coherence.test.ts`, `linter/index.ts`, `split-create-spaghetti-step.js`). All 5 commit hashes (`73bab2c`, `c63d799`, `9f47692`, `28c9102`, `b6f009f`) confirmed present in `git log --oneline --all`. Both resolved todos confirmed present in `.planning/todos/resolved/` and absent from `.planning/todos/pending/`. Both source todos confirmed present in `.planning/todos/pending/` with a `## Corrected 2026-07-16 (u4p)` section each.
