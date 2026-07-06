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
| 02-01 T1 | 02-01 | 1 | SHOP-01 | T-02-01 | stable content-derived keys (no index) | unit | `npx vitest run src/lib/aggregation/aggregation-lineid.test.ts` | ❌ W0 (new) | ⬜ pending |
| 02-01 T2 | 02-01 | 1 | SHOP-01 | T-02-01 | 4 tab call sites use helpers | grep gate | `grep -rn "get*CheckboxKey" src/` (4+ call sites) | n/a | ⬜ pending |
| 02-02 T1 | 02-02 | 1 | SHOP-03 | T-02-02 | quantity/unit inherit-when-null threading | unit | `npx vitest run src/lib/aggregation/utils/variant-utils.test.ts` | ❌ W0 (new) | ⬜ pending |
| 02-03 T1 | 02-03 | 1 | SHOP-02, SHOP-04 | T-02-03 | remaining math + export excludes resolved | unit | `npx vitest run src/lib/shopping-overlay.test.ts` | ❌ W0 (new) | ⬜ pending |
| 02-03 T2 | 02-03 | 1 | SHOP-03 | T-02-04 | line→node targets distinct per planned_meal | unit | `npx vitest run src/lib/shopping-mapping.test.ts` | ❌ W0 (new) | ⬜ pending |
| 02-04 T1 | 02-04 | 1 | SHOP-07 | T-02-05, T-02-06 | coalesce + capped retry, no silent drop | unit | `npx vitest run src/lib/sync-queue.test.ts` | ❌ W0 (new) | ⬜ pending |
| 02-05 T1 | 02-05 | 1 | SHOP-01, SHOP-03 | T-02-07..09 | collection rules + unique index + cascade | manual (PB CRUD round-trip) | — (blocking checkpoint) | n/a | ⬜ pending |
| 02-05 T2 | 02-05 | 1 | SHOP-01, SHOP-03 | — | typed api/types surface | type-check | `npx tsc -b` | n/a | ⬜ pending |
| 02-06 T1 | 02-06 | 2 | SHOP-01, SHOP-07 | T-02-10, T-02-11 | optimistic upsert query-then-branch | type-check + manual UAT | `npx tsc -b` (live round-trip manual) | n/a | ⬜ pending |
| 02-06 T2 | 02-06 | 2 | SHOP-07 | — | 3-state sync indicator | type-check | `npx tsc -b` | n/a | ⬜ pending |
| 02-07 T1-2 | 02-07 | 3 | SHOP-01, SHOP-03, SHOP-06 | T-02-12, T-02-13 | override threading + export filter | type-check + unit | `npx tsc -b && npx vitest run` | n/a | ⬜ pending |
| 02-08 T1-3 | 02-08 | 4 | SHOP-03, SHOP-04, SHOP-05 | T-02-14..16 | confirm-first make-it, input validation | type-check + manual UAT | `npx tsc -b && npx vitest run` | n/a | ⬜ pending |
| 02-09 T1-2 | 02-09 | 5 | SHOP-02, SHOP-04, SHOP-06 | T-02-17, T-02-18 | have-N clamp, 48px targets | type-check + manual UAT | `npx tsc -b` | n/a | ⬜ pending |
| 02-10 T1-2 | 02-10 | 6 | SHOP-06, SHOP-07 | T-02-19, T-02-20 | touch pass + print scoping | type-check + full suite | `npx tsc -b && npx vitest run` | n/a | ⬜ pending |
| 02-10 T3 | 02-10 | 6 | SHOP-01..07 | T-02-19 | end-to-end device/network/touch UAT | manual (blocking checkpoint) | — | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Automatable core = pure re-derivation logic (stable keys, line→node mapping, quantity/unit threading, overlay filtering, sync-queue). Device/network/touch behaviors (SHOP-01 device switch, SHOP-06 touch, SHOP-07 drop, dialog flows) are manual-only — no live-PocketBase or jsdom/RTL harness exists in this repo (02-RESEARCH Validation Architecture).*

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
