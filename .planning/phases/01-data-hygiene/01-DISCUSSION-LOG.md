# Phase 1: Data Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 1-Data Hygiene
**Areas discussed:** Container type placement, Linter surface & section rule, Dedup & backfill workflow, Unit enum & display
**Mode:** Advisor (research-backed comparison tables, 4 parallel researcher agents), `--chain`

---

## Area selection

All four proposed gray areas were selected for discussion. Areas derive from the open
questions in `.planning/phase-docs/phase-1-data-hygiene.md` §7; already-locked decisions
(convert-or-split, signature-based step aggregation, one-shot human-reviewed dedup,
free-text `unit` column this phase) were not re-asked.

## Todo cross-reference

| Todo | Match score | Decision |
|------|-------------|----------|
| `nas-pocketbase-tailnet` | 0.6 (keywords: phase, shopping) | **Keep in Phase 2** (its `resolves_phase` tag) — Phase 1 has no connectivity dependency |

---

## Container type placement

| Option | Description | Selected |
|--------|-------------|----------|
| Product-level + revisit note | No schema change; container from `products.container_type`; record revisit trigger in `decisions.md` | ✓ |
| Per-node relation now | Nullable `recipe_product_nodes.container_type` with product-level fallback | |

**User's choice:** Product-level + note (Recommended)
**Notes:** Research emphasized no current data demonstrates a per-node need, and manual
two-DB schema edits are a standing risk the phase is trying to reduce.

---

## Linter surface & section rule

| Option | Description | Selected |
|--------|-------------|----------|
| Products btn + script, store set | Lint button + panel on Products page, headless `scripts/lint.js`, `SECTION_REQUIRED_STORES` (Safeway needs section) | ✓ |
| Products btn + script, store-only rule | Same surfaces, section check deferred | |
| Dedicated /lint page, store set | New route + nav entry, same rule set | |

**User's choice:** Products btn + script, store set (Recommended)
**Notes:** The Safeway section convention already caused real misses (chives, crema,
ancho chile per recipe-import SKILL.md); the one-store allowlist has low staleness risk.
Dedicated /lint page deferred to linter v2 (Phase 5).

---

## Dedup & backfill workflow

| Option | Description | Selected |
|--------|-------------|----------|
| JSON map + MD report | Rich Markdown context report (names, per-collection ref counts) + small JSON decisions file that `merge-products.js` reads | ✓ |
| JSON edit-file only | Single generated JSON edited in place | |
| Interactive CLI prompts | Per-candidate y/n walkthrough with confirmation log | |

**User's choice:** JSON map + MD report (Recommended)
**Notes:** All options carried the same safety net, now mandatory: test rehearsal via
`sync-to-test.js`, `pb.backups.create()` prod snapshot, pre-flight ID validation,
zero-orphan check. Reference collections enumerated against live DB, not the stale
schema export.

---

## Unit enum & display

| Option | Description | Selected |
|--------|-------------|----------|
| Largest unit ≥1, capped | Promote until qty < 1, capped at cup/lb, never crossing metric↔customary | ✓ |
| Smallest base unit (tsp/g) | Phase doc's original §4.3 proposal | |
| Hand-tuned breakpoints | Kitchen-friendly promotion table at quarter-cup precision | |

**User's choice:** Largest unit ≥1, capped (Recommended)
**Notes:** Applies only to the null-`canonical_unit` fallback (primary path converts to
`canonical_unit`). Enum ships as proposed — grep found no `clove`/`bunch`/`head`/`can`
unit strings in real data, so count-words alias to `each`. Fraction formatting is a
render-layer concern, kept out of `units.ts`.

---

## Claude's Discretion

- Dimension stored-vs-derived (§3.1): doc's store-and-auto-write proposal stands;
  planner may collapse to derive-only.
- Exact conversion constants (with round-trip tests, flagged for review).
- `mergeQuantities` shared helper vs inline.
- Lint findings panel UX details.

## Deferred Ideas

- Per-node container type (revisit trigger in `decisions.md`)
- Dedicated /lint page (linter v2 / Phase 5)
- Count-dimension enum members (when real data needs them)
- PB `select` conversion of node `unit` column
- Import-time linting (Phase 6)
