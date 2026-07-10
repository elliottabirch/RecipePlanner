---
quick_id: 260710-jpw
type: quick
description: Fix cook-mode Full Schedule reshuffle on first check-off (retimeSchedule over-serialization) + 0-elapsed quirk
autonomous: true
files_modified:
  - recipe-planner/src/lib/scheduler/retime.ts
  - recipe-planner/src/lib/scheduler/retime.test.ts
  - recipe-planner/src/pages/CookMode.tsx
must_haves:
  truths:
    - "retimeSchedule with no actual completions reproduces generateSchedule's start times exactly (no first-check-off reshuffle)"
    - "retimeSchedule preserves the GA's parallelism — an independent step packs into another step's passive window instead of waiting for its full end"
    - "A step with a real precedence predecessor still waits for that predecessor's full end (active + passive)"
    - "Checking off a not-yet-started step from the Full Schedule records its estimated duration, not ~0 minutes"
  artifacts:
    - recipe-planner/src/lib/scheduler/retime.ts
  key_links:
    - "retimeSchedule takes precedence edges and bounds each step by max(predecessor ends) — the same rule as decodeSSGS (genetic.ts:311)"
    - "CookMode passes weekGraph.edges into retimeSchedule"
---

<objective>
The cook-mode Full Schedule list reshuffles the first time any row is checked off. Root cause: `retimeSchedule` over-serializes — it advances `precedenceBound = end` (start+active+passive) after every step, collapsing the parallelism `generateSchedule` (SSGS decode) produces by packing active work into other steps' passive windows. Because the list sorts by start time, the first check-off swaps interleaved starts for serialized ones and the whole list snaps to topological order. Fix retime to use the real precedence DAG (the same `max(predecessor ends)` rule decodeSSGS uses), so retime reproduces the decode's timing. Also fix a related quirk: checking off a non-"Now" row records ~0 elapsed minutes.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: DAG-aware retimeSchedule + tests</name>
  <files>recipe-planner/src/lib/scheduler/retime.ts, recipe-planner/src/lib/scheduler/retime.test.ts</files>
  <action>
    Add an optional 5th param `precedenceEdges: readonly WeekGraphEdge[] = []` to retimeSchedule. Build a predecessors map (edge.to -> [edge.from...]). Replace the running `precedenceBound = end` chaining with a per-step bound = max over the step's DAG predecessors' computed ends (default 0) — identical to decodeSSGS (genetic.ts:311-315). Checked-off steps: start at that bound, end = start + actualElapsed. Not-yet-started steps: candidate = bound, then the existing isFeasibleAt/nextCandidateTime search; end = candidate + active + passive. This makes retime(empty completions, edges) reproduce generateSchedule's starts exactly, while a genuinely late completion still pushes only its real dependents.
    Tests: keep the existing "late completion shifts downstream" test (passes unchanged — those cook-bound steps serialize via the single-cook resource). Add: (a) a no-reshuffle regression test — build a small weekGraph, run generateSchedule, then retimeSchedule(schedule.order, empty, empty, config, weekGraph.edges) and assert starts deep-equal; (b) a parallelism test — an oven bake (long passive) + an independent resource:none step, assert the independent step starts inside the bake's passive window (not after its full end); (c) a precedence test — a bake feeding a dependent step, assert the dependent starts at/after the bake's full end.
  </action>
  <verify>cd recipe-planner && npx vitest run src/lib/scheduler/retime.test.ts && npx tsc --noEmit</verify>
  <done>retime reproduces decode timing with no completions; parallelism preserved; precedence respected.</done>
</task>

<task type="auto">
  <name>Task 2: Wire edges into CookMode + fix 0-elapsed quirk</name>
  <files>recipe-planner/src/pages/CookMode.tsx</files>
  <action>
    In handleToggleChecked, pass `weekGraph.edges` as the new 5th arg to retimeSchedule. Fix the 0-elapsed quirk: when computing elapsedMinutes for a checked-off step, if there is no nowStartRef anchor for it (i.e. it was checked from the Full Schedule, never the "Now" card), record its estimated duration (active_minutes + passive_minutes) instead of (Date.now() - Date.now()) ≈ 0.
  </action>
  <verify>cd recipe-planner && npx tsc --noEmit && npx vitest run && npm run build</verify>
  <done>Cook mode retimes with DAG precedence; full-list check-off records the estimate.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean, full `npx vitest run` green (new retime tests included), production build succeeds.
</verification>

<success_criteria>
First check-off no longer reshuffles the Full Schedule (retime reproduces decode timing); parallelism preserved; precedence respected; full-list check-off records the step's estimate, not 0.
</success_criteria>
