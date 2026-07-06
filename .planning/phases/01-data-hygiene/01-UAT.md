---
status: resolved
phase: 01-data-hygiene
source: [01-VERIFICATION.md]
started: 2026-07-06T18:25:00Z
updated: 2026-07-06T18:45:00Z
---

## Current Test

number: 2
name: complete
expected: |
  All human verification items confirmed by the user (2026-07-06).
awaiting: none

## Tests

### 1. Shopping-list split-line rendering
expected: Open the app on a plan whose shopping list contains a product split across two dimensions (one node in a volume unit, one in a mass unit) plus a merged multi-source line (white-bean olive oil 0.25 cup + 2 tbsp). Confirm two distinct split rows appear, no console duplicate-key warning, checking one row's checkbox does not toggle the other, and the per-recipe breakdown sums to the line total.
result: passed — confirmed visually by user 2026-07-06

### 2. RecipeEditor enum unit input
expected: Open the add/edit product dialog for a non-stored product. Confirm the Unit field is a dropdown of enum tokens (tsp, tbsp, cup, g, lb, each, …) with no way to type free text.
result: passed — confirmed visually by user 2026-07-06

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
