---
phase: 3
slug: product-registry-seeding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed Phase 1) |
| **Config file** | recipe-planner/vitest.config.ts (verify during planning) |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~TBD seconds (planner to confirm) |

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
| {planner fills from PLAN.md tasks} | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Product-search unit tests (REG-02) — the fuzzy module (`product-search.ts`) is the clearest automatable surface: "paste tomato" ranks "tomato paste" first; "garbonzo" matches "garbanzo"
- [ ] Seed name-resolver / dedup unit tests (REG-01) — case-insensitive `(name, type)` match, skip-with-review on near-match

*Planner refines against final PLAN.md task list.*

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
