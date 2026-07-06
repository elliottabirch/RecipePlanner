---
phase: 2
slug: shopping-state-live-substitution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed Phase 1) |
| **Config file** | recipe-planner/vitest.config.ts (verify during Wave 0) |
| **Quick run command** | `cd recipe-planner && npx vitest run --changed` |
| **Full suite command** | `cd recipe-planner && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | SHOP-01..07 | — | filled by planner | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*This map is populated by the planner from RESEARCH.md's Validation Architecture section during planning, and refined by the Nyquist auditor.*

---

## Wave 0 Requirements

- [ ] Verify vitest config + harness from Phase 1 still runs
- [ ] Test doubles for PocketBase `shopping_state` CRUD (upsert idempotency, per-plan scoping)
- [ ] Pure-function tests for content-derived stable keys (stored/pull/container) and the shopping-line → per-meal-node mapping

*Pure re-derivation logic (stable keys, node mapping, quantity/unit threading through `applyVariantOverrides`) is the automatable core; optimistic-sync and touch UX lean manual.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Persist across refresh + device switch | SHOP-01 | Cross-device, real PocketBase | Check items on tablet, refresh + open on phone, confirm state |
| Optimistic update + retry + pending indicator on connectivity drop | SHOP-07 | Requires real network drop over tailnet | Drop hotspot mid-check (no reload), confirm indicator + reconnect landing |
| Tablet touch pass | SHOP-06 | Visual/ergonomic | Operate stepper/swap/make-it on tablet viewport |

*Automated tests cover re-derivation and persistence logic; device/network/touch behaviors are manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
