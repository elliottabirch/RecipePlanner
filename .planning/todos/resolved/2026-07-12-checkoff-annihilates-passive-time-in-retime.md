---
created: 2026-07-12
title: "[RESOLVED 2026-07-17] Check-off annihilates a step's passive window in retimeSchedule"
area: general
severity: major
source: 260717-25d Task 1
files:
  - recipe-planner/src/lib/scheduler/retime.ts:130-146 (effStep — the passive-collapse bug)
  - recipe-planner/src/pages/CookMode.tsx:570-586 (handleToggleChecked — elapsedMinutes from the Now anchor)
  - recipe-planner/src/pages/CookMode.tsx:322-327 (nowStartRef — anchor set when a step becomes "Now")
  - recipe-planner/src/lib/scheduler/genetic.ts:295-335 (decodeSSGS — the CORRECT reference behavior)
  - recipe-planner/src/lib/scheduler/retime.test.ts
---

## Resolved — 2026-07-17

**Fixed by flooring passive at its estimate** — this todo's own "floored
variant" (`passiveOcc = estPassive > 0 ? Math.max(estPassive, actualElapsed -
activeOcc) : 0`), chosen over its "honest model" alternative (`active =
actualElapsed`) because the honest model changes `activeOcc` semantics for
EVERY passive step in the app — every active-phase overrun would propagate
to dependents, a real behaviour change needing its own evidence, not a
2-line correctness fix. `activeOcc`'s `Math.min` cap is untouched, byte for
byte. Verified genuine overrun absorption still works: a simmer that really
took 50 minutes still ends at 50, not pinned at 43 — the floor is a floor,
not a pin. Live line numbers drifted to `retime.ts:138-149`.

**This todo understated its own bug — the phantom-burner defect is bigger
than the "dependents collapse" framing.** The collapse does not merely
mis-time a dependent step; it **phantom-frees the resource (burner/oven) the
checked-off step is still physically occupying**, so the scheduler placed a
second pot on an occupied burner — verified with real prod shapes
(`Simmer bourguignon` 8a/35p, `Brown mushrooms` 12a/0p, `burner_count: 1`)
and **no precedence edge required at all**. `resources.ts` meters stovetop
across a step's full active+passive window precisely because a simmering pot
still holds its burner; the collapse lied to that model and produced a
PHYSICALLY IMPOSSIBLE schedule, not merely a wrong time. This is why the
fix shipped ahead of Task 2's display-order fix, and why the phantom-burner
case, not this todo's blend-symptom case, is the stronger regression test.

**The origin, because the process is the finding.** `5704693` ("fix
checked-off step keeps active/passive split") introduced the buggy formula
AND the test named after it (`retime.test.ts:146`), in the SAME commit,
while fixing the previous shuffle (the third fix in this area after
`3665946` and `b91ac19`). Its own commit message reasoned entirely about the
full-list check-off path ("since a full-list check-off records the step's
estimate") — where the formula happens to be correct — and never considered
the Now-card path, where `actualElapsed` is active-only. **A path-coverage
bug, not a math error.** Proof of the gap: the fix passes all 326 existing
tests UNCHANGED; two new tests were added that specifically exercise
`actualElapsed <= estActive`, verified RED against the old formula before
the fix landed.

**The check-off contract is now written down in `retime.ts`** — the comment
block that previously encoded the opposite assumption (and grew this bug
once already) now states plainly: check-off means hands-on work is
finished, `actualElapsed` measures the active phase only, and passive
continues unattended and is floored at its estimate, never derived from how
fast the cook was.

**Deferred rider spun out honestly**, not dropped: `deriveReadiness`
passive-awareness (this todo's "also worth fixing while here") is its own
todo — see `.planning/todos/pending/2026-07-17-readiness-is-blind-to-running-passive-windows.md`.
It changes what a status chip *means* (a feature, not this bug) and would
have muddied a 2-line correctness fix.

## Problem

Cook mode suggested **blend the tomato soup immediately after the cook step** — but the soup
has a **45-minute simmer** to get through first. Blending then is physically impossible, and
being sent to the blender is a pure waste of the cook's time.

The scheduler is not misordering anything. Blend *is* correctly after cook. The bug is that
**the 45-minute simmer gets deleted from the schedule the moment you check the cook step
off**, so blend's start time collapses to "right now."

### Root cause — `retime.ts:130-146`

`decodeSSGS` (`genetic.ts:312-328`) is correct: a step is bounded by
`max(ends of predecessors)`, and `end = start + active + passive`. So on the *initial*
schedule, blend is correctly pushed past the simmer.

`retimeSchedule` — which runs on **every check-off** — recomputes the checked step's
footprint from the cook's measured elapsed time:

```ts
const activeOcc =
  estPassive > 0 ? Math.min(estActive, actualElapsed) : actualElapsed;
effStep = {
  ...instance.step,
  active_minutes: activeOcc,
  passive_minutes: Math.max(0, actualElapsed - activeOcc),   // <-- BUG
};
```

Walk the tomato soup through it. Say cook is `active_minutes: 5`, `passive_minutes: 45`. You
do the hands-on part, get the pot simmering, and check the step off after ~5 minutes:

- `actualElapsed = 5`
- `activeOcc = min(5, 5) = 5`
- `passive_minutes = max(0, 5 - 5) = **0**`
- `end = start + 5 + 0` — **the 45-minute simmer is gone**

Blend's precedence bound is `cook.end`, which is now 5 minutes after cook started. So blend
is served up as the next thing to do.

This isn't an edge case — it fires **whenever `actualElapsed <= estActive`**, i.e. any time
you check a step off promptly. And prompt check-off is the *designed* behavior for exactly
these steps: `CookMode.tsx:313-315` says the Now/Next walk skips checked steps "so after you
load the smoker you move straight to the next timed task rather than waiting out its 20h
passive window." The UI tells you to check off as soon as the hands-on work is done; the
retime math then reads that as "the entire step, passive included, took 5 minutes."

**The two halves disagree about what check-off means.** `retime.ts` assumes `actualElapsed`
spans `active + passive` (its comment reasons only about *overrun*: "any overrun is absorbed
by the passive tail"). `CookMode.tsx` sets the anchor when the step becomes **Now**
(`:324-326`) and check-off means "I'm done touching this." So `actualElapsed` only ever
measures the **active** phase.

### A telling detail

The no-anchor fallback is *correct*. `CookMode.tsx:580-583` uses
`estimate = active_minutes + passive_minutes` when a step was checked off from the Full
Schedule without ever being "Now" — and that value flows through the same formula to give
`passive = (estActive + estPassive) - estActive = estPassive`, preserving the simmer.

So: **checking a step off from the Full Schedule preserves the simmer; checking it off from
the Now card destroys it.** The fallback path is right and the measured path is wrong.

## Solution

Passive time is a property of the **dish**, not of the cook. The soup simmers for 45 minutes
no matter how briskly you got it on the stove. `retimeSchedule` must never shrink
`passive_minutes` below its estimate.

Given that check-off means "hands-on work finished," the honest model is:

```ts
active_minutes: actualElapsed,        // what the cook actually spent
passive_minutes: estPassive,          // physical; unchanged by how fast the cook was
```

If you want to keep absorbing genuine overrun into the passive tail, floor it at the
estimate rather than deriving it:

```ts
const activeOcc = estPassive > 0 ? Math.min(estActive, actualElapsed) : actualElapsed;
const passiveOcc =
  estPassive > 0 ? Math.max(estPassive, actualElapsed - activeOcc) : 0;
```

Decide and write down the check-off contract explicitly — "check-off = hands-on done, passive
continues unattended" — because `retime.ts`'s comments currently encode the opposite
assumption and will re-grow this bug otherwise.

Also worth fixing while here: a step whose passive phase is still running shouldn't be able
to surface a *dependent* step as "Now" at all. `deriveReadiness` (`readiness.ts`) is purely
`checked`-based (AND over upstream producers), so it flags blend "ready" the instant cook is
checked, with no notion of the simmer still having 43 minutes on the clock. `getCountdown`
(`CookMode.tsx:329-341`) already computes exactly that remaining passive time — readiness
should consult it, so a dependent step reads "waiting — 43:12 left on the simmer" instead of
"ready."

## Related

Same code path as `cook-mode-list-shuffles-on-checkoff` — that todo is about `orderedByTime`
re-sorting on the `starts` that *this* bug corrupts. Fixing the passive collapse will shrink
the observed shuffling too, but they are independent defects and both need fixing: this one
produces wrong times, that one re-sorts the list from them.

Regression test in `retime.test.ts`: a step with `active: 5, passive: 45` followed by a
dependent step; check it off with `actualElapsed = 5`; assert the dependent's start is still
`>= 50`, not `5`.
