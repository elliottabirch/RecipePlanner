---
title: Orchestrate connective recipes — batch-produce one recipe, then consume its output in later steps
date: 2026-07-10
priority: medium
resolves_phase: 6
---

Surfaced 2026-07-10 reviewing the GA Gauntlet Week cook-mode schedule. When a
recipe batch-produces an item that another planned recipe consumes, the consumer
carries a zero-time "pull from inventory" connector step that reads wrong — and
is redundant — when the producer is *in the same plan* (made fresh, not pulled
from the freezer).

**Concrete example (meatballs):**
- `spinach meatballs batch` → step **"Create meatballs"** → output `meatballs frozen [inventory]`
- `meatballs` → step **"pull out meatbals"** `[assembly/batch, 0 active / 0 passive]` ← `meatballs frozen [inventory]` → output `meatballs stored [stored]`

Two things read wrong when both recipes are in one plan:
1. **"pull out meatballs" implies pull-from-freezer**, but we just made them this
   week. It's a graph connector, not a real task — yet it shows up as a cook step.
2. **The producer's output is literally named `meatballs frozen`** — they aren't
   frozen yet on the day you make and use them. Authored inventory-item naming
   assumes the batch-then-freeze-then-use workflow, not same-day make-and-use.

This is the same inventory-pull machinery `buildWeekGraph` cross-recipe edges (3)
already wire up (producer stored/inventory output -> consumer input), and the
inverse of the missing-pull-step linter (Phase 5, Plan 07): there we flag a
*missing* producer; here the producer is *present* and the pull step is spurious.

**Design threads to figure out:**
- **Elide in-plan pull connectors:** when a producer for an inventory input is
  present in the same plan, drop the zero-time pull step and wire the consumer's
  downstream directly to the producer's fresh output (short-circuit
  producer → inventory → pull → consumer).
- **Hide non-tasks in cook mode:** treat 0-active/0-passive, single-inventory-input
  assembly "pull" steps as graph glue, not cook-mode tasks (filter from the
  displayed list, like the new `just_in_time` filter).
- **Contextual naming:** "pull meatballs from freezer" vs "use today's fresh
  batch" depending on whether the producer is present in the plan; likewise the
  producer output name shouldn't hard-code "frozen".
- **Model this at import time:** as we build the recipe-import path, capture the
  batch-produce → consume relationship cleanly (shared product identity, an
  explicit produces/consumes link) rather than relying on authored
  "…frozen"/"pull out…" strings, so the scheduler can reason about it.

Treat as a recipe-graph modeling decision, not a cosmetic tweak. Intersects the
recipe-import work and the cross-recipe edge model. Related:
`swap-aware-prep-naming.md` (the sibling "authored names don't reflect the
graph" problem).

---

## Partial resolution — 2026-07-10 (commit 0574b5c)

**Done (elision + display surfaces):** spurious in-plan pull connectors are now
detected and dropped. A shared detector (`aggregation/utils/connective.ts`,
`isSpuriousInPlanPull`) flags a zero-time Assembly step with a single
`inventory` input whose product is produced by some step elsewhere in the plan
— the inverse of the missing-pull-step linter, off the same producer-set test.

- **Cook mode** (`buildWeekGraph`): elision pass short-circuits
  producer → [pull] → consumer into producer → consumer and drops the pull node
  (design threads 1 + 2, at the graph level).
- **Batch prep + product flow** (`buildProductFlowGraph` / `processRecipeSteps`):
  the same spurious pull steps are skipped.
- **Fridge/Freezer:** intentionally unchanged — its entry is the real `stored`
  item (a legitimate physical container between make and use), not the pull step.

**Still open (deferred):**
- **Thread 3 — contextual naming:** the producer's `inventory` output still
  hard-codes "…frozen", and any *surviving* (not-made-in-plan) pull still reads
  "pull out …". Naming is authored free text today — belongs with
  `swap-aware-prep-naming.md` (same "authored names don't reflect the graph"
  root). Not addressed here (user scoped this pass to elision + display).
- **Thread 4 — model at import time:** capture the batch-produce → consume
  relationship as shared product identity / an explicit produces-consumes link
  instead of authored "…frozen"/"pull out…" strings. Blocked on the Phase 6
  import pipeline (not yet built); the current fix is a heuristic detector, not
  a data-model change. Revisit when Phase 6 import lands.
