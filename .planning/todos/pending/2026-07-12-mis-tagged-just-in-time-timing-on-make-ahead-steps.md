---
created: 2026-07-12
title: Mis-tagged just_in_time timing on make-ahead cook steps (bourguignon, spaghetti)
area: database
files:
  - .claude/skills/recipe-import/SKILL.md:415-426 ("Step Timing" — the convention being violated)
  - recipe-planner/src/lib/scheduler/week-graph.ts:150-155 (JIT steps excluded from the prep-day graph)
  - recipe-planner/src/lib/linter/rules/ (no rule guards timing coherence)
---

## Problem

Cook mode's prep-day list ended with two dinners unmade because their **cooking steps are
tagged `just_in_time` when they should be `batch`**. This is a recipe-data defect, not (only)
an app defect.

The recipe-import skill documents the convention (`SKILL.md:415-426`):

> - **`batch`** — a cook/assembly step done during the Saturday prep-day session (roasting,
>   **simmering**, tossing a make-ahead salad). **The normal case for a weekly meal's
>   assembly steps.**
> - **`just_in_time`** — a step that MUST happen the night you eat: a fresh sear, baking the
>   fish, warming tortillas and assembling tacos, dressing a salad kept un-dressed.

"Simmering" is the canonical **batch** example. A braise is make-ahead work by definition.

## Audit of published recipes (run against prod 2026-07-12)

Of 29 published `just_in_time` steps, most are **correct** — the skill explicitly blesses them:
`cook salmon` / `Bake cod (day-of)` (baking the fish), `cook hamburger patties` (fresh sear),
`Toss cabbage…` (dressing a salad kept un-dressed), `warm pitas`, the Costco lasagna /
garlic-chicken heat-and-eat bakes, and every `assemble …` / `serve …` plating step. Leave
those alone.

**Genuinely mis-tagged — these four:**

| Recipe | Step | Timing now | Should be |
|---|---|---|---|
| Mushroom Bourguignon (Simple) | `Brown mushrooms` (12a/0p) | `just_in_time` | `batch` |
| Mushroom Bourguignon (Simple) | `Simmer bourguignon` (8a/35p) | `just_in_time` | `batch` |
| Mushroom Bourguignon (Simple) | `Pull garlic cubes` (1a/0p) | `just_in_time` | `batch` (see below) |
| meat spaghetti **and** meat spaghetti (micah) | `create spaghetti` (8a/15p) | `just_in_time` | **split** (see below) |

## Two structural problems, not just wrong enum values

**1. `Pull garlic cubes` must move WITH the simmer, or the graph silently loses it.**
It currently feeds `Simmer bourguignon` (`Pull garlic cubes → garlic cube (pulled) [transient]
→ Simmer bourguignon`). Both are JIT today, so both are excluded together and nothing breaks.
But if you retag the simmer to `batch` and leave the pull as `just_in_time`, `week-graph.ts`
drops the edge — its `includedIds.has(from) && includedIds.has(to)` guard skips any edge
touching an excluded step. The simmer would then schedule **with no dependency on its garlic**,
exactly the silent-edge-drop failure described in `unproduced-non-raw-inputs-are-invisible`.
**Retag the pull and the simmer in the same change.**

**2. `create spaghetti` is a mega-step that cannot be tagged correctly either way.**
Its instructions are *"Brown ground beef, combine with marinara, and simmer over cooked
spaghetti; top with parmesan"* — one step conflating **make-ahead sauce** (brown + simmer:
`batch`) with **day-of** work (boil the spaghetti, plate, top with parmesan: `just_in_time`).
No single `timing` value is right. **Split it** into a `batch` sauce step producing a stored
meat-sauce product, plus a day-of step that cooks noodles and plates — mirroring how
Mushroom Bourguignon already separates `Simmer bourguignon` from `Cook egg noodles` /
`Serve over noodles`.

## Also worth cleaning

**17 published `prep` steps carry a `timing` value.** The skill says prep steps should leave
`timing` UNSET ("a knife/prep step is not a scheduled cook"). Harmless today —
`week-graph.ts` treats blank timing as prep-day — but it's drift against the documented
convention and makes the data harder to reason about. Low priority.

## Solution

1. **Fix the four steps** via a one-off script (reads work unauthenticated; writes need
   `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD` — see the `deploy-pb-superuser-env` todo).
   Retag bourguignon's brown/simmer/pull to `batch`; split `create spaghetti` in both
   spaghetti recipes.
2. **Stop it recurring.** Nothing guards timing coherence today — there is no linter rule for
   it, and `timing` is one of only two fields the import validator **soft-normalizes** rather
   than hard-failing (`SKILL.md:312-313`), so a bad value slides in silently. Add a linter
   rule: an `assembly` step with meaningful `passive_minutes` (a simmer/braise/roast) tagged
   `just_in_time` is at least a warning. The publish gate (`runRecipeLint`) already exists to
   carry it.
3. **Tighten the import skill.** The convention is documented but was still gotten wrong on
   import, which suggests the guidance needs to be louder about the default: *a weekly meal's
   cook steps are `batch` unless the dish is actively ruined by being made ahead.*

## Related

- `day-of-steps-have-no-surface-cook-mode-ends-silently` — the app-side sibling. Retagging
  these four steps fixes **these two recipes**, but correctly-JIT steps (`assemble tacos`,
  `Bake cod`, `Serve over noodles`) remain invisible in every screen, and cook mode still ends
  silently. Both need fixing; neither subsumes the other.
