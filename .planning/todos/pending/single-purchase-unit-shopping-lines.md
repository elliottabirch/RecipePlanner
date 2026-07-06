---
title: Single purchase-unit shopping lines (one line per ingredient, in the unit you buy)
date: 2026-07-06
priority: high
resolves_phase: 3
status: captured-not-scoped
---

## Idea

The shopping list should show **exactly one line per ingredient**, expressed in the
**unit the ingredient is purchased in** at the store — not one line per measurement
dimension. Examples the user gave:

- Butter is bought in **lb**; recipes call for it in tbsp (volume) → the tbsp must
  convert to oz/lb (mass).
- Olive oil is bought in **oz** (mass); recipes use tbsp (volume) → tbsp must convert.

This holds across all ingredients. Multiple lines per ingredient add mental overhead
and clutter on the store tablet — the goal is a single, clean, purchase-unit line.

## Why this is NOT a Phase 1 patch

Phase 1 shipped **convert-or-split by dimension**: same-dimension quantities merge,
cross-dimension quantities split into separate lines (and the linter flags them). That
was a deliberate, locked decision — "no density model; cross-dimension conversion out of
scope" (PROJECT.md Key Decisions + Out of Scope). Collapsing tbsp→oz is a cross-dimension
(volume→mass) conversion, which is impossible without per-ingredient density / gram-weight
data. So this feature **reverses that locked decision** and requires new per-product data.

## What it needs (design sketch — not yet scoped)

Per product:
1. A **purchase_unit** — what you buy it in (butter → lb, olive oil → oz, eggs → each).
2. A **volume↔mass bridge** — a gram-weight per household measure (e.g. "1 tbsp butter =
   14.2 g") or equivalent density.

Then aggregation converts ALL of a product's quantities into its purchase_unit → one line.
Phase 1's split behavior becomes the **fallback only** when a product lacks bridge data,
and the linter flags those products (rule already exists in spirit).

## Why Phase 3 is the right home

Phase 3 (Product Registry Seeding) seeds from **USDA FDC Foundation Foods and retains FDC
IDs** (REG-04). USDA FDC **food-portion data provides exactly these gram-weights per
household measure** — the non-guessy source that makes single-line conversion possible.
So this belongs as an extension of the registry work (e.g. a new REG-05 requirement +
`purchase_unit` field + portion/gram-weight ingest), or a dedicated phase built on Phase 3.

## To promote (decision deferred by user 2026-07-06)

User confirmed the **placement** (extend Phase 3) but chose **"not yet — just capture it"**
on adopting the density model, so roadmap decisions are unchanged for now. To pick this up:
1. Formally reverse the "no density model / cross-dimension out of scope" decision in
   PROJECT.md + REQUIREMENTS.md.
2. Add the requirement(s) to Phase 3 (or insert a phase after it).
3. Discuss/plan the `purchase_unit` field, the FDC portion-data ingest, and the aggregation
   change that collapses to a single purchase-unit line with split-as-fallback.
