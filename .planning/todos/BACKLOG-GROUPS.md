# Backlog — Consolidated Groups

Grouping of `.planning/todos/pending/` into "knock-out-together" clusters, so a
fresh session can pick a coherent chunk instead of re-deriving the map. Each
group notes the member todo files, the shared root cause, rough size, and
whether the members are genuinely knockable-together or just adjacent.

_Last updated: 2026-07-18 (after Groups B, D, and A shipped)._

## How to work a group (conventions this repo uses)

- **Probe prod before any data work.** `.planning/` and STATE.md drift from prod
  (hand-edits via RecipeEditor, no commit). PocketBase prod is public-read at
  `http://192.168.50.95:8090` — script with the `pocketbase` npm client from
  inside `recipe-planner/` (deps aren't resolvable from the scratchpad).
- **Per-chunk rhythm:** implement → `tsc`/eslint/vitest green → `vite build` →
  commit (`fix|feat|docs(YYMMDD-xxx): …`, 3-char id) → deploy → user verifies on
  the tablet → then resolve the todo(s) + log a STATE.md quick-task row.
- **Deploy:** `ssh nasadmin@openmediavault`, pull + `npm run build` + restart
  `recipe-planner` service. Bundle hash changes each deploy → tell the user to
  **hard-refresh the tablet** before testing. Full steps in `DEPLOYMENT.md`.
- **Resolve a todo:** add `[RESOLVED YYYY-MM-DD]` to its title + a resolution
  note, `git mv` it to `.planning/todos/resolved/`, add a row to STATE.md's
  quick-task table, update `stopped_at`/`last_updated`.

---

## ✅ Completed this session (2026-07-17 → 07-18)

- **Group A — Cook-mode card information architecture** (`260718-cca`): designed the
  Now/Next card's IA once, covering both sibling todos. **Convergence indicator**: pure
  `deriveConvergence` walks the graph downstream (step → assembly → co-inputs → container),
  rendered as a "Combines with: … → destination" call-out; merged-prep nodes show it
  per-recipe. **Full-recipe reader**: 📖 button opens a dialog with `Recipe.notes` prose +
  scaled ingredients (lists every recipe on merged nodes). **Data**: authored tight prose for
  31 recipes (56/67 were empty) via `apply-recipe-notes.mjs`. **Import skill**: notes contract
  now carries full source prose. Both todos resolved. Deployed + user-confirmed.
- **Group B — Passive time / readiness** (`260717-pwr`): "Running now" timer
  strip + passive-aware `deriveReadiness` + early-finish ✓. Both source todos
  resolved.
- **Group D — Shopping / pull-list graph gaps**:
  - `260718-wpl` — restored the week pull list on the Batch Prep print view
    (`buildWeekPullList`, sources from `flowGraph.products`).
  - `260718-uni` — surfaced consumed-but-unmade non-raw inputs across 4 surfaces
    (detection, cook-mode blocked chip, Outputs make/buy section, publish gate).
    Fix follow-up made the check per-INPUT not per-step. Data follow-up: the
    `asian peanut dressing` soba recipe was given a real "make dressing" step in
    prod (no longer flagged).

---

## Ready to pick up

### Group F — Deploy / infra pair  _(small)_ — ⏸️ DEFERRED (2026-07-18)
- `nas-pocketbase-tailnet.md`  _(priority: high)_
- `deploy-pb-superuser-env.md`

Same NAS deploy surface; both route config through `~/code/windows-dev-setup`.
`deploy-pb-superuser-env` explicitly says "do in one pass with the tailnet one."
Config/infra, not app code. **Clean pair.**

**Deferred (user, 2026-07-18):** blocked on prerequisite orchestration work on
another server that will coordinate this — do NOT start F until that lands. Pick
up in a clean session.

**Probe findings (2026-07-18, saves rediscovery):**
- The NAS is **already joined to the tailnet** — MagicDNS name
  `openmediavault.taila99e54.ts.net` (tailnet `taila99e54.ts.net`, Tailscale IP
  `100.125.105.121`). So F1's "join the NAS to the tailnet" step is already done;
  remaining F1 work is just the app-config switch + verify.
- App config lives in `recipe-planner/src/lib/db-config.ts`: prod/test URLs come
  from `VITE_POCKETBASE_URL` / `VITE_POCKETBASE_TEST_URL` env (build-time), else
  hardcoded `http://192.168.50.95:8090` / `:8091`. The switch = point these at
  `http://openmediavault.taila99e54.ts.net:8090` / `:8091` (via the Vite env at
  build time on the NAS, or by changing the fallback). Then verify PB CORS + the
  `serve` origin still allow the app. NOTE: tailnet is HTTP here (no TLS on the
  `:8090/:8091` origins) — a mixed-content check may matter if the app is ever
  served over https.
- F2: `recipe-planner/.env.local` already exists (422 B, the local-script creds
  the todo references) AND Group A added a gitignored root `.env` + `.env.example`
  for the same purpose. Reconcile these two when doing F2 (one source of truth for
  `PB_SUPERUSER_*`); the NAS-deploy-env half still needs doing. See
  [[prod-pb-write-creds-env]].

### Group E1 — Naming consistency via controlled vocab  _(medium)_
- `2026-07-17-pull-step-names-drift-across-recipes.md`  _(cosmetic on its own)_
- `swap-aware-prep-naming.md`
- `connective-recipe-batch-then-consume.md` — **thread 3 (naming) only**

One root: authored free-text step/product names don't reflect the graph. Do the
Phase-5 step-metadata `prep_action` controlled-vocab + derived-label rework once
and all three fall out. (Thread 4 of the connective todo — an import-time model —
is **blocked on Phase 6 import**, skip.)

### Group E3 — Data hygiene  _(small, quick wins; mechanically unrelated)_
- `usda-search-plain-rename.md` — verbose SR-Legacy names leak into products.
- `improve-recipe-tagging-for-wizard-pools.md` — thin wizard slot suggestions;
  "not a code gap," ongoing manual tagging.

Bundle only for convenience.

---

## Needs a design decision first (not clean pickups)

### Group C — Day-of / cook-mode step visibility
- `2026-07-12-day-of-steps-have-no-surface-cook-mode-ends-silently.md` — **piece 2
  only** (piece 1, the false "All steps complete!", shipped under `260716-u4p`).
- `2026-07-12-deprioritize-store-steps-in-cook-mode.md`

Both are "which steps compete for the cook's attention." Blocked on a shared
prerequisite: **there is no first-class store-step marker** — needs a
schema/inference decision before either can be done right (the "just hide them"
version is a few lines; the correct version needs the marker).

### Group E2 — Authoring guidance + lint gate
- `2026-07-12-authoring-skills-need-downstream-consequences-reference.md` — parent
  doc for the whole authoring class.
- `2026-07-12-mis-tagged-just-in-time-timing-on-make-ahead-steps.md` — **mostly
  shipped**; only "tighten the import skill" (item 3) is genuinely open.
- `2026-07-16-publish-gate-is-severity-blind.md` — minor, NOT a live outage
  (2 recipes, 0 drafts); re-audits every rule's severity (own blast radius).

Related by "make authoring choices enforceable," but each has independent blast
radius. Low urgency.

---

## Deliberately skipping (don't casually pick up)

- `2026-07-12-alias-units-break-cross-recipe-aggregation.md` — cheap read/write
  normalize already shipped; the remaining `""`-driven merge-semantics fix was
  judged a **bad trade** (silent-corruption risk to dedup one cosmetic 0-qty
  line). Only pick up with a full `addOrMergeProduct` rewrite committed.
- `single-purchase-unit-shopping-lines.md` — **deferred to its own phase**;
  reverses a locked PROJECT.md/REQUIREMENTS.md decision ("no density model") and
  needs USDA portion ingest. Needs a formal decision reversal first.
- `connective-recipe-batch-then-consume.md` **thread 4** — blocked on the Phase 6
  import pipeline (thread 3 lives in Group E1 above).

---

## Recommendation for next session

**Group F is deferred** (blocked on other-server orchestration — see its section).
Until that prereq lands, the next clean pickup is **Group E1** (naming controlled-vocab)
or **Group E3** (data-hygiene quick wins). Neither needs a design decision.
