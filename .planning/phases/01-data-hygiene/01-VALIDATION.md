---
phase: 1
slug: data-hygiene
status: draft
nyquist_compliant: false
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
| (filled by planner) | — | — | DATA-01..07 | — | — | — | — | ❌ W0 | ⬜ pending |

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
