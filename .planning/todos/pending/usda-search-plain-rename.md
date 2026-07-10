---
title: Plain-rename the bundled SR-Legacy Search-USDA index (verbose names leak into created products)
date: 2026-07-07
priority: medium
resolves_phase: 3
status: captured
---

## Problem

The bundled Search-USDA index `recipe-planner/src/assets/usda-sr-legacy.json` (built in Phase 3
plan 03-05) stores **raw SR-Legacy descriptions** as the `name` field (e.g. `"Kumquats, raw"`),
not plain human names. So when a user picks a result on the "Search USDA" tab of
`QuickCreateProductDialog`, the created product inherits the verbose USDA name — e.g. a product
named `Kumquats, raw` (fdc_id 168154, usda_data_type `sr_legacy`) landed in prod during Phase 3
UAT. This contradicts Phase 3's whole goal of plain human names (D-01), and the plan/UI-SPEC
intended the prefill to use a plain-renamed name.

Confirmed 2026-07-07: only 1 comma-named product exists in prod (`Kumquats, raw`) — the seed
(`usda-seed.json`) is clean; the issue is isolated to the Search-USDA prefill path. User approved
Phase 3 as-is (edits names manually when they care), but flagged that the verbose name is a system
artifact, not their input.

## Fix

1. Rebuild `usda-sr-legacy.json` in `recipe-planner/scripts/build-usda-search-index.js` so the
   `name` field runs through `build-usda-seed.js`'s plain-name normalizer (drop trailing state
   qualifiers like `, raw` / `, mature seeds`; reorder comma-inverted forms `Beans, black` →
   `black beans`; keep the hand-curated overrides). Re-verify the bundled gzipped size stays near
   ~117KB and `searchUsda` still ranks correctly.
2. (Optional, prod data) Rename the existing `Kumquats, raw` product → `kumquat`, keeping its
   `fdc_id` (168154), section (produce), and `usda_data_type`.

## Notes

Low-risk; no schema change. Belongs to Phase 3's polish or a quick follow-up. Related:
Phase 3 CONTEXT D-01 (plain-name catalog) and 03-06 (Search-USDA tab).
