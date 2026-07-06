---
title: Day-before prep horizon for the GA scheduler
trigger_condition: When designing/implementing Phase 5 (prep-day engine / GA scheduler) from plans/workflow-redesign.md
planted_date: 2026-07-05
---

The scheduler currently models prep as one contiguous session, but some tasks must happen **before** prep day: thawing proteins, overnight soaking/marinating, pulling frozen stock out of the freezer. The chicken-stock 20–30 min delay pain is partly this class — a "pull/make stock" step that belongs the night before, not at assembly time.

When the scheduler is designed, decide:
- Whether steps get a `lead_time` / "must-start-before" attribute (e.g. thaw: 12h ahead) so the GA emits a **night-before checklist** alongside the prep-day timeline.
- How the linter rule ("stored/inventory input consumed by assembly with no preceding pull/thaw/make step") interacts with this — the lint catches the missing step; the lead-time attribute schedules it.
- Whether the cook-mode UI needs a separate "tonight, for tomorrow" card.

Context: raised during 2026-07-05 exploration; deliberately deferred rather than rejected.
