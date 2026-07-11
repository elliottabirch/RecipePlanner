---
phase: 06-import-pipeline-recipe-lifecycle
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - recipe-planner/src/lib/types.ts
  - recipe-planner/src/lib/api.ts
  - recipe-planner/scripts/apply-phase6-schema.mjs
  - recipe-planner/src/lib/import/validate-import.ts
  - recipe-planner/src/lib/import/build-recipe-graph.ts
  - recipe-planner/src/lib/import/write-back.ts
  - recipe-planner/src/lib/lifecycle/draft-filter.ts
  - recipe-planner/src/lib/linter/recipe-lint.ts
  - recipe-planner/src/lib/search/product-search.ts
  - recipe-planner/src/lib/suggest/constraints.ts
  - recipe-planner/src/hooks/useRecipeNotes.ts
  - recipe-planner/src/components/AddNoteButton.tsx
  - recipe-planner/src/components/WeekWizard.tsx
  - recipe-planner/src/components/Layout.tsx
  - recipe-planner/src/components/cook-mode/NowNextCard.tsx
  - recipe-planner/src/pages/Import.tsx
  - recipe-planner/src/pages/RecipeEditor.tsx
  - recipe-planner/src/pages/Recipes.tsx
  - recipe-planner/src/pages/WeeklyPlans.tsx
  - recipe-planner/src/App.tsx
  - .claude/skills/recipe-import/SKILL.md
  - .claude/skills/suggest-recipes/SKILL.md
  - .claude/skills/evolve-recipes/SKILL.md
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-10
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the Phase 6 import pipeline and recipe draft/publish lifecycle. The core
correctness-critical primitives the phase pivots on are, on their own, sound:

- **Draft filter** (`draft-filter.ts`) is correctly fail-open (`status != "draft"`,
  `isPlannable` returns `status !== "draft"`) and both wiring sites (WeekWizard,
  WeeklyPlans) use `buildDraftExcludingFilter()`. No fail-closed form anywhere.
- **`validateImportJson`** appears genuinely total — every parse/shape/enum/edge path
  is wrapped, coercion helpers never throw, and failures surface as `ImportError[]`.
- **Publish gate** (`RecipeEditor.handlePublish`) returns before any status write when
  findings exist; `runRecipeLint` correctly excludes the week/pull-step rule.
- **`planWriteBack`** id-stability logic is correct for the three documented cases.

The most serious issue is in the migration: `backfillRecipeStatus` is **not** the
idempotent no-op it advertises — a re-run after any draft exists force-publishes every
draft (data corruption of the exact lifecycle the phase introduces). Beyond that, the
shared write spine has a field-clearing defect (undefined values are dropped by the PB
SDK on update, so toggling a field back to empty — notably a step's `timing` when its
type changes — leaves stale data), and the edge-direction inference couples to a ref
naming convention the validator does not actually enforce.

## Critical Issues

### CR-01: Migration `backfillRecipeStatus` force-publishes drafts on any re-run (data corruption)

**File:** `recipe-planner/scripts/apply-phase6-schema.mjs:180-202`
**Issue:** `main()` unconditionally calls `backfillRecipeStatus()` on every invocation,
and the backfill updates **every** recipe whose `status !== "published"` to
`"published"`:

```js
for (const r of recipes) {
  if (r.status !== "published") {
    await pb.collection("recipes").update(r.id, { status: "published" });
  }
}
```

The header and inline comments claim this is idempotent/"re-running is a no-op
(T-06-01a)". That is true only on the *first* run (when all rows are `status === ""`).
Once the lifecycle is in use, a recipe with `status === "draft"` also satisfies
`status !== "published"`, so a re-run silently promotes **all drafts to published** —
and the post-backfill assertion (`stragglers.length > 0 → throw`) actively *requires*
that nothing remain unpublished, so the script is designed to make coexistence with
drafts impossible. Re-running is an explicitly supported workflow (test `:8091` rehearsal
then prod `:8090`, plus any later re-run to apply/verify additive schema, since `main()`
always runs all four steps). The result is unpublished, unfinished draft recipes being
pushed straight into weekly planning — defeating the entire feature this phase delivers.

**Fix:** Gate the backfill so it only touches rows that were never assigned a status,
never rows explicitly set to `"draft"`:

```js
// Only backfill legacy rows that have no status yet ("" or undefined).
// Never touch an explicit "draft" — that is a live lifecycle value.
if (r.status !== "published" && r.status !== "draft") {
  await pb.collection("recipes").update(r.id, { status: "published" });
}
```

And weaken the post-backfill assertion to "no row left with empty status" rather than
"every row is published", so intentional drafts survive a re-run.

## Warnings

### WR-01: Shared write spine drops `undefined` fields on update — cleared values do not persist (stale `timing` on step-type change)

**File:** `recipe-planner/src/lib/import/build-recipe-graph.ts:111-155`, executed via `buildRecipeGraph` update path (231-247); origin `RecipeEditor.handleSaveEditedStep:512-544`
**Issue:** `planGraphWrites` builds node/step `data` objects that include fields whose
value is `undefined` (e.g. `timing: step.timing`, `quantity: pn.quantity`,
`meal_destination: pn.mealDestination`, `active_minutes`, `passive_minutes`,
`prep_action`, `oven_temp_f`, `rack_slots`, and `notes` on the recipe). On the
**update** path these are passed to `pb.collection.update(id, data)`. The PocketBase JS
SDK serializes to JSON for non-file payloads, and `JSON.stringify` omits `undefined`
keys — so an update can only *set* a field, never *clear* it back to empty.

Concrete manifestation: in `RecipeEditor.handleSaveEditedStep`, changing an existing
step from `assembly` → `prep` sets `timing: undefined`. On save that key is dropped, so
the DB keeps the old `timing` (e.g. `"just_in_time"`). The step now reads as a prep step
with a stale serve-time timing that the prep-day scheduler consumes. The same defect
prevents clearing a node's `quantity`/`meal_destination` or a step's active/passive
minutes on an existing recipe.

**Fix:** Emit explicit empty values instead of `undefined` for clearable fields on the
update path (PocketBase treats `null`/`""`/`0`-guarded values correctly), e.g. coerce in
`planGraphWrites`:

```js
timing: step.timing ?? null,
quantity: pn.quantity ?? null,
meal_destination: pn.mealDestination ?? "",
```

or strip only truly-absent keys while sending explicit clears for fields the editor can
blank. Verify against the intended round-trip in `graph-write.test.ts`.

### WR-02: Edge direction inference couples to a `ref` prefix the validator does not enforce → silent edge loss

**File:** `recipe-planner/src/lib/import/build-recipe-graph.ts:169-188`
**Issue:** Edge direction is inferred purely from the ref string:
`edge.from.startsWith("product")` / `edge.to.startsWith("product")`. If neither endpoint
starts with `product`, both the `sourceIsProduct && !targetIsProduct` and
`!sourceIsProduct && targetIsProduct` branches are false and the edge is **silently
dropped**. But `validateImportJson` accepts *arbitrary* custom refs
(`toNonEmptyString(entry.ref)`, validate-import.ts:190,231) and only checks that edge
endpoints exist in the `refs` set — it will report a paste with refs like
`"tomato"`/`"chop-1"` as fully valid (`ok: true`), after which `buildRecipeGraph` drops
every edge with no error surfaced anywhere. Since `/import` is the untrusted-paste
boundary, a validator-approved graph can lose its entire step topology on write.

**Fix:** Either enforce the `product-*` / `step-*` prefix convention in
`validateImportJson` (reject/normalize refs that don't match, with an `ImportError`), or
carry an explicit node-kind on each `NormalizedProductNode`/`NormalizedStep` and resolve
edge direction from that kind in `planGraphWrites` instead of from the ref string. The
node lists already distinguish products from steps — use that instead of the prefix.

### WR-03: `planWriteBack` does not guard duplicate `source_node` → two refs collapse onto one original node id

**File:** `recipe-planner/src/lib/import/write-back.ts:62-69`
**Issue:** If two reviewed nodes carry the same `sourceNode` (both pointing at one
original node id), both get `remapSeed[node.ref] = src`. `buildRecipeGraph` then issues
two `update` ops against the *same* DB record and records `nodeDbIds[refA] =
nodeDbIds[refB] = src`. Edges referencing `refA` and `refB` both resolve to the same
node id, corrupting the graph (the second update wins the record; edges become
ambiguous/duplicated). The evolution-loop is agent-produced so this is unlikely, but the
module is the documented single source of truth for id-stable write-back and does no
defensive check.

**Fix:** Detect a `source_node` already claimed by an earlier reviewed node and treat the
duplicate as a fresh create (or surface it as an error the caller must resolve):

```js
if (src && originalSet.has(src) && !mappedOriginals.has(src)) {
  remapSeed[node.ref] = src;
  mappedOriginals.add(src);
}
// else: create fresh (or collect into a `conflicts` list)
```

## Info

### IN-01: `applyFieldsToCollection` pre-update drop-guard is tautological (dead check)

**File:** `recipe-planner/scripts/apply-phase6-schema.mjs:115-121`
**Issue:** `mergedFields = [...existingFields, ...toAdd]` always contains every existing
field, so `dropped = existingNames.filter(n => !mergedNames.has(n))` is always empty and
the `throw` can never fire. The real protection is the post-update verification
(133-136); the pre-update guard is dead defensive code.
**Fix:** Remove it, or comment that it only guards against a future refactor that mutates
`mergedFields`.

### IN-02: `RecipeEditor` `isNew` publish path is unreachable; manually-created recipes keep `status === ""`

**File:** `recipe-planner/src/pages/RecipeEditor.tsx:682`; `recipe-planner/src/pages/Recipes.tsx:122-127`; `recipe-planner/src/App.tsx:57`
**Issue:** The comment at handleSave claims "the hand-authored New-Recipe create path
sets status='published' explicitly", gated on `isNew`. But nothing navigates to
`/recipes/new` (confirmed: the only `/recipes/...` navigations go to `/recipes/:id`). The
"New Recipe" button in `Recipes.tsx` calls `create(recipes, { name })` — no status — then
routes to `/recipes/:id`, so `RecipeEditor` loads with `isNew === false` and never runs
the `status: "published"` branch. Manually-created recipes therefore keep `status === ""`
permanently (plannable via fail-open, but never actually "published", never badged). The
`recipes/new` route and the `isNew` create branch are effectively dead.
**Fix:** Either set `status: "published"` in `Recipes.handleCreateRecipe`'s create
payload, or route "New Recipe" to `/recipes/new` so the intended path runs. Remove the
dead route/branch if the create-then-edit flow is canonical.

### IN-03: Failed auto-land offers no visible retry-to-land control

**File:** `recipe-planner/src/pages/Import.tsx:167-169, 341-351`
**Issue:** When a paste resolves fully on first pass (`unresolved.length === 0`),
`landDraft` runs automatically. If it throws, `landError` is shown but the "Finish
import" button is gated on `parseInfo.unmatched > 0`, which is false on this path — so no
land button appears. Recovery relies on the user re-clicking "Import recipe" (which
re-validates and re-auto-lands). Recoverable but non-obvious.
**Fix:** Show the "Finish import" button whenever `readyToFinish && landError` too, or
drop the `unmatched > 0` condition and rely on `readyToFinish`.

### IN-04: Each `AddNoteButton` instance loads the entire `recipe_notes` collection on mount

**File:** `recipe-planner/src/components/AddNoteButton.tsx:33`; `recipe-planner/src/hooks/useRecipeNotes.ts:11-28`
**Issue:** `AddNoteButton` calls `useRecipeNotes()`, whose `useEffect` fires `refresh()`
(a full `getAll(recipeNotes)`) on mount. The button is rendered per recipe card
(Recipes grid), per calendar cell (WeeklyPlans), and per cook-mode card, so N buttons
issue N identical full-collection fetches — and none of them actually read `notes`
(the button only needs `addNote`). Correctness-adjacent redundancy (performance proper
is out of v1 scope).
**Fix:** Give `AddNoteButton` a lightweight write-only path (call `create` directly, or a
`useRecipeNotes({ subscribe: false })` variant that skips the initial fetch).

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
