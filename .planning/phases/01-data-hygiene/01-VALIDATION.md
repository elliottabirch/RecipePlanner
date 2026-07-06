---
phase: 1
slug: data-hygiene
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (new devDependency — Wave 0 installs; no test framework exists in repo) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `cd recipe-planner && npx vitest run src/lib/units.test.ts` |
| **Full suite command** | `cd recipe-planner && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd recipe-planner && npx vitest run src/lib/units.test.ts`
- **After every plan wave:** Run `cd recipe-planner && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T2 vitest install | 01 | 1 | DATA-02 | T-01-SC | package-legitimacy gate before install | config | `cd recipe-planner && npx vitest run` | ❌ W0 | ⬜ pending |
| 01-T3 units.ts | 01 | 1 | DATA-02 | T-01-CONV | exact NIST/BIPM factors, never-guess alias null | unit | `cd recipe-planner && npx vitest run src/lib/units.test.ts` | ❌ W0 | ⬜ pending |
| 02-T1 find-duplicates | 02 | 1 | DATA-04 | T-02-XTYPE | cross-type collisions quarantined | smoke | `cd recipe-planner && node --check scripts/find-duplicates.js` | ✅ | ⬜ pending |
| 02-T2 merge-products | 02 | 1 | DATA-04 | T-02-STALE, T-02-LOSS | backup+preflight+orphan-check before delete | smoke | `cd recipe-planner && node --check scripts/merge-products.js` | ❌ W0 | ⬜ pending |
| 03-T1 product-builder | 03 | 2 | DATA-01 | T-03-SUM, T-03-KEY | convert-or-split, distinct lineId | unit | `cd recipe-planner && npx vitest run src/lib/aggregation/builders/product-builder.test.ts` | ❌ W0 | ⬜ pending |
| 03-T2 step-builder | 03 | 2 | DATA-01 | T-03-SUM | convert-or-split inputs+outputs | unit | `cd recipe-planner && npx vitest run src/lib/aggregation/builders/step-builder.test.ts` | ❌ W0 | ⬜ pending |
| 03-T3 lineId threading | 03 | 2 | DATA-01 | T-03-KEY | ShoppingListTab keyed by lineId | smoke+unit | `cd recipe-planner && npx vitest run` | ✅ | ⬜ pending |
| 04-T1 linter rules | 04 | 2 | DATA-06 | T-04-BYPASS | 4 rules + clean-product-zero-findings | unit | `cd recipe-planner && npx vitest run src/lib/linter/linter.test.ts` | ❌ W0 | ⬜ pending |
| 04-T2 linter surfaces | 04 | 2 | DATA-06 | T-04-BYPASS | dual surface, shared core | smoke | `cd recipe-planner && node --check scripts/lint.js` | ❌ W0 | ⬜ pending |
| 05-T1 decisions.md | 05 | 2 | DATA-07 | — | signature wording, no name-match claim | smoke (grep) | `grep -in "exact string match" decisions.md` (expect no step line) | ✅ | ⬜ pending |
| 05-T2 normalize-node-units | 05 | 2 | DATA-05 | T-05-GUESS | dry-run default, unresolved reported | smoke | `cd recipe-planner && node --check scripts/normalize-node-units.js` | ❌ W0 | ⬜ pending |
| 05-T3 backfill-units | 05 | 2 | DATA-05 | T-05-DRIFT | dimension from canonical_unit, ambiguous null | smoke | `cd recipe-planner && node --check scripts/backfill-units.js` | ❌ W0 | ⬜ pending |
| 06-T1 containerTypeName | 06 | 3 | DATA-03 | T-06-OVERLOAD, T-06-DEDUP | container from products.container_type | smoke+unit | `cd recipe-planner && test -z "$(grep -rn 'is now the container type\|is the container type' src)"` | ✅ | ⬜ pending |
| 06-T2 editor enum | 06 | 3 | DATA-03 | T-06-OVERLOAD | enum Select, unit measurement-only | smoke | `cd recipe-planner && npx tsc -b --noEmit` | ✅ | ⬜ pending |
| 07-T1 schema fields | 07 | 4 | DATA-04, DATA-05 | T-07-DRIFT | identical fields on both DBs | manual (grep export) | `grep -c "canonical_unit" pb_schema_updated.json` | N/A | ⬜ pending |
| 07-T2 rehearsal | 07 | 4 | DATA-04, DATA-05 | T-07-WRONGDB | full flow proven on test | manual | manual UAT on test :8091 | N/A | ⬜ pending |
| 08-T1 merge review | 08 | 5 | DATA-04 | T-08-LOSS | human confirms merge map | manual (decision) | manual review of decisions JSON | N/A | ⬜ pending |
| 08-T2 prod migration | 08 | 5 | DATA-04, DATA-05 | T-08-LOSS | backup+orphan-check gating | manual+smoke | `cd recipe-planner && node scripts/find-duplicates.js` (expect zero same-type dupes) | ✅ | ⬜ pending |
| 08-T3 unique index | 08 | 5 | DATA-04 | T-08-INDEX, T-08-BYPASS | (name COLLATE NOCASE, type) index | manual (grep export) | `grep -c "idx_products_name_type_ci" pb_schema_updated.json` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `recipe-planner/src/lib/units.test.ts` — round-trip conversion tests for DATA-01/DATA-02
- [ ] `vitest` devDependency + config — no framework detected in repo

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PB Admin schema edits applied on prod+test | DATA-02, DATA-04 | No migration tooling; manual Admin UI operation | Apply fields/index in PB Admin on :8090 and :8091, re-export pb_schema_updated.json |
| Dedup merge-map review | DATA-04 | Irreversible one-shot; human judgment per candidate | Review MD report, edit JSON decisions file, confirm before merge-products.js run |
| Shopping list renders correct converted quantities | DATA-01 | Visual check against live prod data | Open Outputs → Shopping List; verify white-bean-stew olive oil shows one converted line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
