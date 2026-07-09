# Phase 5: Prep-Day Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 5-prep-day-engine
**Areas discussed:** Day-before horizon scope, Scheduler algorithm fidelity, Progress + config storage, Resource model scope

---

## Day-before prep horizon (`lead_time_minutes`)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to later phase | Keep Phase 5 focused; no lead_time_minutes/night-before checklist; linter still flags missing pull/thaw/make | |
| Scalar lead_time_minutes | Add field now; GA emits night-before checklist anchored on Phase-4 dates | |
| Absolute horizon | Absolute "must-finish-before-prep" constraint + tonight-for-tomorrow card | |

**User's choice:** Neither — cut the concept entirely for now.
**Notes:** "for right now, we dont need anything in a bucket of 'do before prep', it should all be doable during prep. nothing is too frozen to delay prep by days." → No lead_time_minutes column, no night-before checklist, AC8 removed (stronger than "defer" — dropped from the product until the household's needs change). Linter's missing pull/thaw/make rule still ships.

---

## Scheduler algorithm fidelity

*Research agent (gsd-advisor-researcher) produced a 3-option comparison grounded in home-scale RCPSP.*

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic list scheduler (amend ADR) | SSGS over topo order, weighted by the 5 factors; pure function, instant recompute, easiest debug. Research recommendation. | |
| Beam / multi-start SSGS | Explores a few tie-break orderings, keeps best feasible; still deterministic | |
| Full seeded GA (keep ADR as-is) | Genetic algorithm exactly as the decision record locks it | ✓ |

**User's choice:** Full seeded GA — keep the ADR unchanged.
**Notes:** User retained the locked GA after seeing research recommend a simpler deterministic scheduler for home scale (~10-40 step-instances). Research's risk analysis (cross-operator determinism, hidden hyperparameters, per-tap recompute performance) was folded into CONTEXT D-01a as mandatory planner constraints; the deterministic-scheduler alternative is recorded as a documented fallback path.

---

## Cook-mode progress persistence

| Option | Description | Selected |
|--------|-------------|----------|
| New cook_progress collection (reuse Phase-2 pattern) | Per-(weekly_plan, step_instance) on createSyncQueue + optimistic hook; cross-device | ✓ |
| localStorage | Single-device, simplest, lost on cache clear | |

**User's choice:** New `cook_progress` collection reusing the Phase-2 pattern.
**Notes:** Mirror `useShoppingState`; do not overload `shopping_state`.

---

## Scheduler config + kitchen-resource profile storage

| Option | Description | Selected |
|--------|-------------|----------|
| scheduler_config PB collection | Singleton {seed, weights, burner_count, oven_rack_slots, appliances[]}; shared across devices | ✓ |
| localStorage | Single-device, simplest | |

**User's choice:** `scheduler_config` PocketBase collection.
**Notes:** Weight tuning on the tablet persists to the laptop.

---

## Resource model scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full | resource enum + oven_temp_f + rack_slots + temp-conflict + burners(4) + singletons; backfill infers | ✓ |
| Oven + singletons only | Drop burner modeling | |
| Singletons only | Cheapest; oven-temp conflict unmodeled | |

**User's choice:** Full resource model.
**Notes:** Backfill infers resource/oven_temp_f/rack_slots from prep_action + step name; editable in authoring UI; required at import for new recipes. Makes AC3/AC4 meaningful.

---

## Claude's Discretion

- **Backfill delivery surface** — in-app review page (`StepBackfill.tsx`) consuming offline-drafted JSON (recipe-import skill pattern), `scripts/` variant as fallback. Following the decision record's Phase-6 in-app direction; not separately discussed.
- **Core step-metadata schema** and `prep_action` vocabulary — locked by the record.

## Deferred Ideas

- Day-before prep horizon / `lead_time_minutes` / PREP-F1 — cut from the product (D-02).
- Simpler scheduler (deterministic list / beam-search) — documented fallback if the GA can't hit determinism or the instant-recompute bar.
- `swap-aware-prep-naming` todo — adjacent to cook-mode display but a distinct Phase-2-swap enhancement; reviewed, not folded.
