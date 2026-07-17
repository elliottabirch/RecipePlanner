---
created: 2026-07-16
title: Publish gate is severity-blind — a `warning` hard-blocks publish exactly like an `error`
area: ui
severity: minor
source: 260716-u4p — surfaced while designing the timing-coherence linter rule
files:
  - recipe-planner/src/pages/RecipeEditor.tsx:744-782 (handlePublish — `if (lintFindings.length > 0)` before any status write)
  - recipe-planner/src/lib/linter/index.ts:37-44 (the `LintFinding.severity` union — "error" | "warning")
  - recipe-planner/src/lib/linter/recipe-lint.ts:27-32 (composeRecipeFindings — the publish-gate's finding source)
---

## Problem

`RecipeEditor.tsx:767`'s `handlePublish` gates on `lintFindings.length > 0`, full stop:

```ts
const lintFindings = await runRecipeLint(id);
if (lintFindings.length > 0) {
  // Failure path: never write status.
  setFindings(lintFindings);
  setLintDialogOpen(true);
  return;
}
```

`LintFinding.severity` (`linter/index.ts:38`) is `"error" | "warning"` — every rule carefully
picks one or the other — but **the value is never read at the publish gate.** A `warning` blocks
publish exactly as hard as an `error` does. This makes "warning" a lie: there is no such thing as
an advisory finding at this gate, only a blocking one and a non-existent one.

`mixed-denomination.test.ts` carries a comment reading "A heuristic must not block a publish" —
**that comment is misleading.** It is true only by accident: `mixed-denomination` is a
*product*-scoped rule that needs registry-wide nodes to find its signal (the two denominations
usually live in different recipes), and the recipe-scoped publish-gate caller
(`composeRecipeFindings` → `runLint`) passes only one recipe's nodes, so the rule finds nothing
there — it's inert at the gate by accident of scope, not because its `warning` severity is
honored. **A step-scoped rule has no such escape hatch.** `timing-coherence` (shipped in this
same plan, 260716-u4p) joins `runStepLint`, which IS wired into the publish gate
(`composeRecipeFindings` → `runRecipeLint`) — so any `warning` it emits is a hard block, full
stop, and had to be tuned to a 0-false-positive bar before it could ship at all. **Every future
step rule inherits that same constraint** unless this gate is fixed.

## Scope — honestly, using the 2026-07-16 prod measurement (do NOT overstate this)

Simulating every current rule against all 67 live recipes: only **2 recipes would block on
re-publish** (one on `missing-canonical-unit`, one on `missing-store-section`), and **there are
0 drafts in prod today**, so the gate is barely exercised in practice. The 268 products failing
`missing-canonical-unit` are overwhelmingly unreferenced registry entries, not recipes anyone is
trying to publish right now.

**This is a genuine design defect with a long tail — it is NOT a live outage.** Read it as: the
gate will increasingly punish future step rules (forcing every one to a 0-FP bar it may not be
able to reach, the way `timing-coherence` barely could) rather than as something broken today.

## Sketch of the fix (not done here — own blast radius)

Block publish only on `severity: "error"`; surface `warning` findings non-blockingly (e.g. show
the dialog but let the human proceed, or a "publish anyway" affordance). Straightforward in
isolation, but it **re-opens what every existing rule's severity is allowed to mean** —
`cross-dimension`, `prep-words`, `missing-store-section`, `missing-canonical-unit`,
`mixed-denomination`, `missing-durations`, `missing-prep-action`, and now `timing-coherence` all
picked their current severity under the (wrong) assumption that severity doesn't gate anything.
Revisiting the gate means re-auditing every one of those choices — its own task, with its own
blast radius, not a one-line fix bundled into this plan.

## Related

- `260716-u4p` (this plan) — added `timing-coherence`, the step rule that had to hit 0 FPs
  precisely because this gate can't tell a warning from an error.
