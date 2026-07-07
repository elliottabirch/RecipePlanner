---
phase: 3
slug: product-registry-seeding
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.10 (installed Phase 1) |
| **Config file** | recipe-planner/vitest.config.ts |
| **Quick run command** | `npx vitest run <file>` (per-task file) |
| **Full suite command** | `npm test` (= `vitest run`, from recipe-planner/) |
| **Estimated runtime** | full suite < 30s (small unit-test corpus) |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 schema script + pb_schema | 03-01 | 1 | REG-04 | T-03-01/03 | Idempotent append-only schema mutation, test-first | smoke | `node -e` field-presence check vs pb_schema.json | ❌ Wave 0 (script) | ⬜ pending |
| 01-T2 Product interface | 03-01 | 1 | REG-04 | — | Optional fields, existing products valid | typecheck | `npx tsc -b --noEmit` | ✅ types.ts | ⬜ pending |
| 01-T3 schema/registry checkpoint | 03-01 | 1 | REG-04 | T-03-01 | Human confirms both DBs + registry load | manual | human-verify | N/A | ⬜ pending |
| 02-T1 searchProducts module | 03-02 | 1 | REG-02 | T-03-04/SC | Empty-query guard; in-memory only | unit (tdd) | `npx vitest run src/lib/search/product-search.test.ts` | ❌ Wave 0 | ⬜ pending |
| 02-T2 wire 5 call sites | 03-02 | 1 | REG-02 | — | Single shared module | integration/smoke | grep import count 4 + `npx tsc -b` | ✅ 4 components | ⬜ pending |
| 03-T1 seed pipeline + comparison | 03-03 | 1 | REG-01 | T-03-05/06 | Parse error handling; read-only PB | smoke | file-presence + report grep | ❌ Wave 0 (script) | ⬜ pending |
| 03-T2 catalog decision | 03-03 | 1 | REG-01 | — | Human locks source | manual | checkpoint:decision | N/A | ⬜ pending |
| 04-T1 full usda-seed.json | 03-04 | 2 | REG-01 | T-03-06 | 20-item spot-check | smoke | `node -e` seed-shape check | ❌ Wave 0 (artifact) | ⬜ pending |
| 04-T2 seed resolver + test | 03-04 | 2 | REG-01 | T-03-08/09 | raw-scoped dedup, no auto-merge | unit (tdd) | `npx vitest run scripts/seed-usda.test.js` | ❌ Wave 0 | ⬜ pending |
| 04-T3 dry-run/rehearsal/prod seed | 03-04 | 2 | REG-01, REG-04 | T-03-07 | Dry-run review + backup-before-mutate | manual | human-verify | N/A | ⬜ pending |
| 05-T1 SR-Legacy asset build | 03-05 | 2 | REG-03 | T-03-10 | Trimmed 3-field asset | smoke | `node -e` index-shape check | ❌ Wave 0 (asset) | ⬜ pending |
| 05-T2 usda-lookup + section map | 03-05 | 2 | REG-03 | T-03-04 | Empty-query returns [] | unit (tdd) | `npx vitest run src/lib/usda/usda-lookup.test.ts` | ❌ Wave 0 | ⬜ pending |
| 06-T1 Search-USDA tab | 03-06 | 3 | REG-03 | T-03-04/11/12 | Lazy-load, unit stays required | integration/smoke | grep `searchUsda`+`sr_legacy` + `npx tsc -b` | ✅ QuickCreateProductDialog | ⬜ pending |
| 06-T2 prefill flow checkpoint | 03-06 | 3 | REG-03 | T-03-12 | Human confirms persisted fdc_id/usda_data_type | manual | human-verify | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test/artifact scaffolds are created inline within their owning tasks (test-first `tdd="true"` tasks and offline scripts) — no separate Wave 0 plan is needed; each MISSING surface below is authored before or alongside its implementation task:

- [ ] `src/lib/search/product-search.test.ts` (REG-02) — authored first in 03-02 T1: "paste tomato" ranks "tomato paste" first; "garbonzo" matches "garbanzo"; empty/whitespace passthrough
- [ ] `scripts/seed-usda.test.js` (REG-01) — authored first in 03-04 T2: exact→BACKFILL/SKIP, near→SKIP_REVIEW (never merge), miss→INSERT, cross-type→review flag not block
- [ ] `src/lib/usda/usda-lookup.test.ts` (REG-03) — authored first in 03-05 T2: fdc_id-bearing candidates for a real query, `[]` on empty/whitespace, sectionIdForCategory mapping
- [ ] Offline scripts (`add-product-nutrition-fields.js`, `build-usda-seed.js`, `seed-usda.js`, `build-usda-search-index.js`) — verified by their own `node -e` shape checks / dry-run reports (no unit-test harness needed; artifact + report is the verification, per Phase 1 `dedup-output/` convention)
- [ ] Framework install: none — vitest already configured project-wide

*Sampling continuity: no 3 consecutive tasks lack an automated verify — every auto task carries a `node -e`, `vitest`, `tsc`, or grep gate; only the 4 human-verify/decision checkpoints are manual, and none are adjacent-by-three.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Seed run against test DB inserts genuine-miss products with resolved section/store, zero dup-index violations | REG-01 | Requires a live PocketBase (test :8091) and human spot-check of names/sections | Run seed script against :8091 in dry-run then apply; spot-check 20 names + section/store |
| "Search USDA" quick-create returns candidates and persists fdc_id + usda_data_type | REG-03 | Interactive dialog + bundled asset in a running app | Open quick-create, toggle Search USDA, pick an SR-Legacy-only item, save, verify record |

*Planner refines against final PLAN.md task list.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
