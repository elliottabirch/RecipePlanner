# Phase 2: Shopping State & Live Substitution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 2-shopping-state-live-substitution
**Areas discussed:** Persistence scope, Resolution model, Swap UX, Make-it flow

---

## Persistence scope

| Option | Description | Selected |
|--------|-------------|----------|
| ID-stable tabs only | Persist shopping/pantry/batch-prep now; leave stored/containers/pull in-memory. Avoids the positional-key correctness bug, defers 3 tabs. | |
| Fix keys + persist all six | Rework the three positional key helpers into content-derived stable keys, then persist every tab. Full coverage, more design work. | ✓ |

**User's choice:** Fix keys + persist all six
**Notes:** Takes the harder branch of phase doc item 6a deliberately. Planner must derive deterministic content-based composite keys for stored/container/pull lines (never array index); fall back to in-memory only if a truly stable key can't be derived for a given tab.

---

## Resolution model (enum + resolved-line behavior)

| Option | Description | Selected |
|--------|-------------|----------|
| buy/make/skip, hidden when resolved | Three states; resolved lines disappear from screen + export. | |
| buy/make/skip, shown dimmed | Three states; resolved lines stay visible dimmed/struck, easy to un-resolve. | ✓ |
| buy/make only, hidden when resolved | Matches decision record literally; no skip state. | |

**User's choice:** buy/make/skip, shown dimmed (on-screen)
**Follow-up — export behavior:** Export **excludes** resolved lines (vs mirror-screen). Split rule: screen = full picture with state, export = actionable buy list only.

---

## Swap UX

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-fill qty + inline quick-create | Per-meal qty/unit pre-fills original node value; missing products created inline, return into picker. | ✓ |
| Require qty + inline quick-create | Force explicit qty/unit entry; quick-create inline. | |
| Pre-fill qty + separate quick-create | Pre-fill qty; quick-create as separate dialog. | |

**User's choice:** Pre-fill qty + inline quick-create
**Notes:** Lowest store friction. Makes inherit-when-null the default at both UI and persistence layers.

---

## Make-it flow

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm-first, no-recipe just marks | Confirm add when recipe exists; silently mark not-to-buy when none. | |
| Auto-add, no-recipe just marks | Auto-add recipe; mark not-to-buy when none. | |
| Confirm-first, no-recipe warns | Confirm when recipe exists; hint when none. | |
| **Other (user):** Gate on recipe | Do not allow make-it at all if the product has no source_recipe defined. | ✓ |

**User's choice (free-text):** "do not allow the switch if we don't have a recipe defined for it" — make-it action is unavailable (disabled/hidden) on recipe-less lines.
**Follow-up — add behavior when eligible:** Confirm first ("Add [recipe] to this week and make it instead of buying?") before mutating the plan. Chosen over auto-add.

---

## Claude's Discretion

- Collection naming (`shopping_state` vs `plan_line_state`) — planner picks.
- Orphaned `shopping_state` row garbage collection — leave inert this phase.
- Optimistic retry specifics (backoff, max attempts) — planner's call; last-write-wins default.

## Deferred Ideas

- Durable-across-reload optimistic queue (localStorage/IndexedDB) — out of scope (edges toward rejected offline-first).
- Orphaned `shopping_state` row GC — revisit if it becomes a real problem.
- Registry-driven quick-create/swap search upgrades — Phase 3.
- Cook-mode progress persistence reusing this mechanism — Phase 5 (soft dep).

## Reconciliation note

- Phase doc specced `meal_variant_overrides.unit` / quick-create unit as free text assuming Phase 1 hadn't landed. Phase 1 is complete (`units.ts` enum + `products.canonical_unit`), so the enum + product field are used now instead of free text.
- Phase doc item 2 ("re-export stale `pb_schema_updated.json`") is already done — schema consolidated to a single `pb_schema.json` in Phase 1. Verify-only.
