---
title: Improve recipe tagging so the week-wizard pools suggest well
area: data-hygiene
created: 2026-07-09
source: phase-04 UAT (test 5)
severity: minor
---

# Improve recipe tagging for wizard pools

**What:** During Phase 4 UAT the guided-fill wizard mechanics passed, but the meal
*suggestions* per slot are thin/odd because recipe tagging is incomplete. The wizard
is working as designed — each slot's pool is exactly the recipes carrying that slot's
`pool_tags`, ordered least-recently-planned-first. Suggestion quality is a function of
tag coverage, not wizard code.

**Why:** The "Standard week" template slots key off these tags: `protein`, `starch`,
`vegetable`, `green`, `fruit` (Staples slot), `micah meal`. Recipes not tagged into the
right category won't surface in that slot; over-broad tagging surfaces the wrong ones.

**How to apply:**
- Tag more recipes into the six category tags via the recipe editor (data work, done incrementally).
- Consider adding a dedicated `staple` tag and re-pointing the Staples slot's `pool_tags`
  from `fruit` to `staple` (currently `fruit` is a stand-in — see 04-06 seed).
  Re-run `scripts/seed-week-template.js` after changing the slot's pool tag.
- Optional wizard enhancement (future phase, not required): a fallback that widens a
  slot's pool (or shows all recipes) when the tagged pool is empty/too small.

**Not a code gap.** Phase 4 (WEEK-04) is code-complete and verified; this is ongoing
tagging hygiene. Non-blocking.
