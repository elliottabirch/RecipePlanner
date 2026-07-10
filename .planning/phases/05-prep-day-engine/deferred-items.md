# Phase 5 — Deferred Items

Out-of-scope discoveries noted during plan execution (not fixed, per the
executor's scope-boundary rule — only issues directly caused by the
current task's changes are auto-fixed).

## From 05-08 execution (2026-07-10)

- `src/lib/scheduler/genetic.test.ts` and `src/lib/scheduler/retime.test.ts`
  fail with "Cannot find module './genetic'" / "'./retime'" when running the
  full `npx vitest run` suite. These are pre-existing Wave-0 RED tests from
  05-02 (commit `6b6ccd8`), awaiting their own plan's GREEN implementation
  (`genetic.ts`/`retime.ts` do not exist yet). Unrelated to 05-08's
  diff/apply core or StepBackfill page — left untouched.
