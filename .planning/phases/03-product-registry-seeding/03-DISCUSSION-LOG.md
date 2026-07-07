# Phase 3: Product Registry Seeding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 3-Product Registry Seeding
**Areas discussed:** Purchase-unit / density model, Search-USDA data path, Nutrition storage shape, Seed breadth & curation
**Mode:** Advisor (standard calibration; NON_TECHNICAL_OWNER = false). Four parallel research agents backed the tables below.

---

## Cross-cutting research finding

"~800 USDA Foundation Foods" is not achievable from Foundation Foods — that dataset holds only ~160–350 items total (FNDDS 2021–2023 docs: 162–163 with current data), ~<150 net-new after a raw-purchasable filter + dedup against the existing 291. Real breadth lives in **SR Legacy** (7,793 items). Foundation Foods also lacks household gram-weight portions ("100-unit measures only" — USDA FAQ). This reframed the seed-source, Search-USDA, and density decisions.

---

## Purchase-unit / density model

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Phase 3 (A) | Single-line UX ships with the registry now; grows into a 2nd SR-Legacy/FNDDS portion ingest + cross-match + density fallback, reversing a locked decision inside an already-scoped phase | |
| Defer to its own phase (B) | Ship Phase 3 clean; keep `fdc_id` + nullable `canonical_unit`/`dimension` hooks; a focused follow-on phase adds `purchase_unit` + `product_portions` bridge + grams-pivot aggregation after spiking coverage | ✓ |
| Keep convert-or-split (C) | Don't adopt; honor the locked "no density model"; single-line want stays unmet | |

**User's choice:** Defer to its own phase (B)
**Notes:** Foundation Foods can't supply the gram-weights as a free byproduct; premise needs a separate portion source + curated fallback. Phase 3's obligation is only to preserve the hooks. Convert-or-split remains the permanent fallback tier.

---

## Search-USDA data path

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled SR-Legacy index (A) | Trimmed name+category+fdc_id JSON (~150–250KB gz), offline, hotspot-tolerant, reuses fuse.js | |
| Live FDC API (B) | Query-time API call; smaller bundle but network round-trip mid-shop, API key + PocketBase proxy, 1000 req/hr lockout risk | |
| Hybrid (C) | Bundled index primary; live API only on local miss; defer building the fallback until a real miss rate appears | ✓ |

**User's choice:** Hybrid (C)
**Notes:** Ship the bundled SR-Legacy index in Phase 3 (SR Legacy carries native `fdc_id` for pre-fill); the live-API fallback is deferred until usage justifies it. Since the seed no longer uses SR Legacy (Opt 4 below), the bundle is a standalone asset, not free.

---

## Nutrition storage shape

| Option | Description | Selected |
|--------|-------------|----------|
| Inline nullable columns (A) | `nutrient_basis_g/kcal/protein_g/fat_g/carb_g` on products (per-100g); matches `/suggest-recipes` macro floor; `fdc_id` retention makes inline→linked additive later | ✓ |
| Linked product_nutrients table (B) | ~80k rows nobody queries yet; full micronutrient fidelity but builds-now for the deferred NUTR-01 | |

**User's choice:** Inline nullable columns (A)
**Notes:** Seed `fdc_id` now (required); backfill macros later via nutrient ids 1008/1003/1004/1005. No linked table this phase.

---

## Seed breadth & curation

| Option | Description | Selected |
|--------|-------------|----------|
| SR-Legacy slice + overrides (Opt 2) | Filtered SR-Legacy raw slice for breadth; rule-based rename + ~50–150-item override list scoped to bad-fit categories | |
| Thin Foundation-Foods-only (Opt 1) | Skip SR Legacy; accept <150 net-new top-up; lean on first-use correction | |
| External plain-name dataset (Opt 4) | Import canonical culinary names (Open Food Facts / ingredient-parser); join to USDA only for `fdc_id`/nutrition | ✓ |

**User's choice:** External plain-name dataset (Opt 4)
**Notes:** A pivot from the phase doc's "rename USDA descriptions" approach. Plain names come from the external catalog; USDA is consulted for `fdc_id` + macros via a name→FDC join. Which external dataset, the join strategy, and the category→section mapping are captured as research open-questions in CONTEXT.md. REG-01's "~800 USDA Foundation Foods" wording is now inaccurate. `frozen`/`international` sections won't auto-populate under any option.

---

## Claude's Discretion

- Fuzzy-search library (`fuse.js` vs `match-sorter`) — pin one, use across all four+ surfaces.
- Name→FDC join algorithm details; schema-migration mechanics; seed dry-run/report mode.

## Deferred Ideas

- **Density / purchase-unit single-line model** → dedicated follow-on phase built on Phase 3 (spike portion coverage → `purchase_unit` + `product_portions` + grams-pivot aggregation; reverse the "no density model" decision then). Hooks preserved by Phase 3.
- Reviewed-not-folded todos: `swap-aware-prep-naming` (Phase 5), `nas-pocketbase-tailnet` (infra, Phase 2/6), `deploy-pb-superuser-env` (deploy/infra).
