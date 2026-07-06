---
status: testing
phase: 01-data-hygiene
source: [01-VERIFICATION.md]
started: 2026-07-06T18:25:00Z
updated: 2026-07-06T18:25:00Z
---

## Current Test

number: 1
name: Shopping-list split-line rendering
expected: |
  Distinct, independently-checkable split rows; no React duplicate-key console
  warning; checking one row's box does not toggle the other; per-recipe
  breakdown quantities sum to the displayed line total. The white-bean olive
  oil line (0.25 cup + 2 tbsp) shows as one merged line (~6 tbsp / 0.375 cup).
awaiting: user response

## Tests

### 1. Shopping-list split-line rendering
expected: Open the app on a plan whose shopping list contains a product split across two dimensions (one node in a volume unit, one in a mass unit) plus a merged multi-source line (white-bean olive oil 0.25 cup + 2 tbsp). Confirm two distinct split rows appear, no console duplicate-key warning, checking one row's checkbox does not toggle the other, and the per-recipe breakdown sums to the line total.
result: [pending]

### 2. RecipeEditor enum unit input
expected: Open the add/edit product dialog for a non-stored product. Confirm the Unit field is a dropdown of enum tokens (tsp, tbsp, cup, g, lb, each, …) with no way to type free text.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
