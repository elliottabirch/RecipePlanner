---
created: 2026-07-12
title: "`create spaghetti` mega-step split to a 4-step all-batch model (bourguignon retag already applied — by hand, unrecorded)"
area: database
files:
  - .claude/skills/recipe-import/SKILL.md:415-426 ("Step Timing" — the convention being violated)
  - recipe-planner/src/lib/scheduler/week-graph.ts:158 (JIT steps excluded from the prep-day graph)
  - recipe-planner/src/lib/linter/rules/timing-coherence.ts (SHIPPED 2026-07-16, u4p Task 2 — guards this class going forward)
  - recipe-planner/scripts/split-create-spaghetti-step.js (REWRITTEN 2026-07-17, u4p Task 1 — the 4-step all-batch split, gated behind human `--apply`)
---

## Corrected 2026-07-17 (u4p) — the split model itself was wrong

**Read this before anything below it, including the 2026-07-16 correction —
it describes a proposal this todo made that the user does NOT want.**

A direct **user interview (2026-07-17)** settled how meat spaghetti is
actually cooked, and it overturns this todo's own solution:

> The spaghetti is boiled on prep day, combined with the sauce, and stored
> combined. There is no day-of work for this dish.

Every consequence follows, and each one corrects something this todo (or a
prior revision of the fixing plan) got wrong:

- **`create spaghetti` being retagged `batch` (wholesale) was CORRECT, not a
  half-fix.** The 2026-07-16 correction below calls it "wrongly-scheduled"
  because it assumed the boil-and-plate work was day-of. It is not. There was
  nothing wrong with the wholesale retag except that it left one step doing
  the work of four.
- **This todo's own proposal — "split it into a `batch` sauce step ... plus a
  day-of step that cooks noodles and plates"  — was FALSE**, and was never
  derived from how the user cooks. It was assumed from the dish's name
  ("spaghetti" implies day-of boiling) rather than checked. A script
  implementing exactly that proposal (`28c9102`) was designed, planned, and
  rehearsed on `:8091` — and never applied to prod, because the rehearsal
  step surfaced the divergence before the checkpoint. It has since been
  **rewritten**, not amended, for the correct model.
- **Meat spaghetti having zero `just_in_time` steps is correct by design.**
  Its absence from cook mode's day-of summary (`collectDayOfWork`,
  `day-of-work.ts`) is a **property to assert**, not a gap to close. Anyone
  who "fixes" that absence by adding a day-of plate step is re-introducing
  this exact bug for the third time — this todo has now been wrong about
  this dish twice.
- **The real, narrow defect was granularity, not timing.** One 8a/15p
  mega-step hid two overlappable passive windows and under-counted active
  time (real total: 10a/23p, not 8a/15p). Splitting into four `batch` steps
  (Cook spaghetti 2a/8p, Cook meat 5a/0p, Simmer meat sauce 1a/15p, Combine
  all 2a/0p) lets the scheduler place the 8-minute noodle boil inside the
  15-minute sauce simmer — **but only because prod's
  `scheduler_config.burner_count` is 2.** `resources.ts` holds a stovetop
  resource for a step's full active+passive window; at `burner_count: 1` this
  split would make the dish **slower**, not faster. If that config value
  ever changes, the split's rationale evaporates.

**Mark this piece SHIPPED once the human `--apply` at the `260716-u4p`
checkpoint lands** — `scripts/split-create-spaghetti-step.js` (rewritten
2026-07-17, model `batch-4step-v2`) is the script; it was rehearsed
end-to-end on `:8091` including an executed `--rollback`, and the read-only
report against prod is the human-facing worksheet at
`scripts/dedup-output/split-create-spaghetti.md`.

## Corrected 2026-07-16 (u4p)

Verified against live prod 2026-07-16 (probe run for quick task `260716-u4p`).
This is the load-bearing correction — read it before anything below:

**The bourguignon retag in the table below was ALREADY APPLIED — by hand, in
the RecipeEditor, by an unrecorded actor, sometime between 2026-07-12 and
2026-07-16. There is no commit and no script.** `git log --all` over
`*retag*`/`*timing*` is empty, and no such script exists in `scripts/`.
Verified prod state: `Pull garlic cubes` (1a/0p), `Brown mushrooms` (12a/0p),
and `Simmer bourguignon` (8a/35p) all read `timing=batch`. Only `Cook egg
noodles` and `Serve over noodles` remain `just_in_time` — correctly.
Published JIT steps now total **24**, not the **29** this todo originally
audited; the difference is exactly these 5 retagged records.

**This is a process finding, not just a data one — and the second time in two
days the backlog's own diagnosis was itself the defect** (cf. `260716-rpp`'s
garlic todo, which also had to be corrected against a verified prod probe). A
prod data change made outside the repo — no commit, no script, no STATE.md
entry — was invisible to this todo, to `day-of-steps-have-no-surface-...`, and
to four STATE.md entries, all of which kept describing the retag as pending
work to be scheduled. **The durable guard against this recurring is the
linter rule (`timing-coherence`, shipped below), not a script or a memory** —
a script only catches what someone remembers to run; a publish-gate rule
catches it whether anyone remembers or not.

**Structural problem #1 (pull-with-simmer) is RESOLVED — verified on the real
graph, not assumed.** Running `buildWeekGraph` over the live week plan
(`71ukhycp2v4s0fw`) produces 40 nodes / 20 edges and the edge `Pull garlic
cubes → Simmer bourguignon` is intact (also `Brown mushrooms → Simmer
bourguignon`, `Quarter mushrooms → Brown mushrooms`, `Slice carrots → Simmer
bourguignon`, `Prep onion (yellow) (diced ×2) → Simmer bourguignon`). The
`includedIds` edge guard dropped nothing — whoever applied the by-hand retag
happened to retag the pull WITH the simmer, avoiding exactly the silent-edge-
drop hazard this todo originally warned about.

**Structural problem #2 (`create spaghetti` mega-step) is the one live
remainder — updated to the post-retag reality.** It was retagged `batch`
**wholesale rather than split** in both `meat spaghetti` and `meat spaghetti
(micah)` — so the app now schedules boiling noodles, plating, and parmesan for
**Saturday**. The failure mode changed from *invisible* (cook stranded, this
todo's original framing) to **wrongly-scheduled** (cook boils spaghetti on
Saturday) — not an improvement, and no message-only fix touches it.
`260716-u4p` Task 3 ships the split behind the full gated-write pattern
(read-only audit → human-confirmed worksheet → `pb.backups.create()` →
`--apply` → rollback worksheet, rehearsed on `:8091`) — **mark this piece
SHIPPED once the checkpoint's human `--apply` lands**;
`scripts/split-create-spaghetti-step.js` is the script.

**Solution item 2 (the linter rule) is SHIPPED — with a stated, tested blind
spot.** `rules/timing-coherence.ts` flags an `assembly` step tagged
`just_in_time` when it ALSO has `passive_minutes >= 5` AND its name+
instructions match `/simmer|braise|stew/i`. Zero findings against the 24 live
JIT steps (the rule as originally scoped —passive time alone— would have
flagged 10, all false positives); 3 of the 5 historical mis-tags caught.
**`Brown mushrooms` (12a/0p) and `Pull garlic cubes` (1a/0p) are BOTH
zero-passive and structurally uncatchable by any passive-gated rule — the
header says so and `timing-coherence.test.ts` pins it as a KNOWN, ACCEPTED
miss.** Do not assume the class is fully covered.

**Solution item 3 (tighten the import skill) is STILL OPEN — this is what
keeps this todo pending.** The convention was already documented
(`SKILL.md:415-426`) and still got imported wrong, then drifted further
without anyone noticing for 4 days. The guidance needs to be louder about the
default: *a weekly meal's cook steps are `batch` unless the dish is actively
ruined by being made ahead.*

**The "17 prep steps carry a timing" note is confirmed, not new:** all 17 are
`batch`, zero are `just_in_time`, and `week-graph.ts` treats a `batch` prep
step identically to a blank one. Confirmed harmless today; still drift against
the documented convention (skill says prep steps should leave `timing` unset).

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

> **RETRACTED 2026-07-16 (u4p):** "29 published `just_in_time` steps" is STALE.
> Verified 2026-07-16: **24** published JIT steps remain — the difference is
> exactly the 5 records in the table below, retagged by hand between
> 2026-07-12 and 2026-07-16 with no commit and no script. See the Corrected
> section at the top of this file.

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

> **RETRACTED 2026-07-16 (u4p): structural problem #1 is RESOLVED, not just
> theoretically avoidable.** Verified on the REAL graph (`buildWeekGraph` over
> live plan `71ukhycp2v4s0fw`, 40 nodes / 20 edges): `Pull garlic cubes →
> Simmer bourguignon` is intact, alongside every other bourguignon batch edge.
> Whoever applied the by-hand retag happened to move the pull WITH the simmer,
> so this hazard did not fire. See the Corrected section at the top.

**1. `Pull garlic cubes` must move WITH the simmer, or the graph silently loses it.**
It currently feeds `Simmer bourguignon` (`Pull garlic cubes → garlic cube (pulled) [transient]
→ Simmer bourguignon`). Both are JIT today, so both are excluded together and nothing breaks.
But if you retag the simmer to `batch` and leave the pull as `just_in_time`, `week-graph.ts`
drops the edge — its `includedIds.has(from) && includedIds.has(to)` guard skips any edge
touching an excluded step. The simmer would then schedule **with no dependency on its garlic**,
exactly the silent-edge-drop failure described in `unproduced-non-raw-inputs-are-invisible`.
**Retag the pull and the simmer in the same change.**

> **RETRACTED 2026-07-17 (u4p): the proposal below (a `batch` sauce step plus a
> `just_in_time` day-of plate step) is WRONG and was never built.** A direct user
> interview established the spaghetti is boiled on prep day and stored combined
> with the sauce — there is no day-of work for this dish at all. The correct
> model is FOUR `batch` steps (Cook spaghetti, Cook meat, Simmer meat sauce,
> Combine all); the defect was granularity, not a day-of/make-ahead split. See
> the Corrected section at the top of this file.

**2. `create spaghetti` is a mega-step that cannot be tagged correctly either way.** ~~Its
instructions are *"Brown ground beef, combine with marinara, and simmer over cooked
spaghetti; top with parmesan"* — one step conflating **make-ahead sauce** (brown + simmer:
`batch`) with **day-of** work (boil the spaghetti, plate, top with parmesan: `just_in_time`).
No single `timing` value is right. **Split it** into a `batch` sauce step producing a stored
meat-sauce product, plus a day-of step that cooks noodles and plates — mirroring how
Mushroom Bourguignon already separates `Simmer bourguignon` from `Cook egg noodles` /
`Serve over noodles`.~~ (superseded — see retraction above: the actual defect is that this
one step hides two overlappable passive windows, not a day-of/make-ahead split.)

## Also worth cleaning

**17 published `prep` steps carry a `timing` value.** The skill says prep steps should leave
`timing` UNSET ("a knife/prep step is not a scheduled cook"). Harmless today —
`week-graph.ts` treats blank timing as prep-day — but it's drift against the documented
convention and makes the data harder to reason about. Low priority.

## Solution

1. **Fix the four steps — DONE, but done OUTSIDE the repo, unrecorded.** Bourguignon's
   brown/simmer/pull are `batch` in prod; `create spaghetti` is `batch` (wholesale) in both
   spaghetti recipes — and **correctly so** (see the 2026-07-17 correction at the top: there
   is no day-of work for this dish). No script did this and no commit records it. What
   remains is a **4-step all-`batch` granularity split** (Cook spaghetti, Cook meat, Simmer
   meat sauce, Combine all), not a day-of/make-ahead split: `260716-u4p` Task 1 rewrote
   `scripts/split-create-spaghetti-step.js` for this model, rehearsed it end-to-end (apply +
   rollback) on `:8091`, and left it behind the full gated-write pattern — checkpoint pending
   human `--apply` against prod.
2. **Stop it recurring — SHIPPED.** `rules/timing-coherence.ts` (`260716-u4p` Task 2) flags an
   `assembly` step tagged `just_in_time` with `passive_minutes >= 5` AND a
   simmer/braise/stew verb in its name+instructions. Zero findings against the 24 live JIT
   steps; 3 of 5 historical mis-tags caught (`Brown mushrooms` and `Pull garlic cubes` are
   zero-passive and structurally uncatchable — a KNOWN, ACCEPTED miss, not a bug to chase by
   relaxing the passive gate). Wired into `runStepLint`, reaching both the publish gate and
   cook mode's lint dialog.
3. **Tighten the import skill — STILL OPEN, this is why this todo stays pending.** The
   convention is documented but was still gotten wrong on import, then drifted further
   unrecorded for 4 days, which suggests the guidance needs to be louder about the default:
   *a weekly meal's cook steps are `batch` unless the dish is actively ruined by being made
   ahead.*

## Related

- `day-of-steps-have-no-surface-cook-mode-ends-silently` — the app-side sibling. Retagging
  these four steps fixes **these two recipes**, but correctly-JIT steps (`assemble tacos`,
  `Bake cod`, `Serve over noodles`) remain invisible in every screen, and cook mode still ends
  silently. Both need fixing; neither subsumes the other.
