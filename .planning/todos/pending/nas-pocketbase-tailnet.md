---
title: Put NAS PocketBase on the tailnet and switch app config to tailnet hostnames
date: 2026-07-05
priority: high
resolves_phase: 2
---

Prerequisite for Phase 2 (shopping state) delivering value away from home.

- Join the OMV NAS (`192.168.50.95`, `pi@openmediavault`) to the tailnet so both PocketBase instances (prod :8090, test :8091) are reachable from the tablet on a phone hotspot.
- Update `recipe-planner/src/lib/db-config.ts` to use the tailnet hostname (e.g. `openmediavault.<tailnet>.ts.net`) instead of the LAN IP, so one build works at home and out. Verify CORS/serve config still allows the app origin.
- Shopping UI (Phase 2) then only needs optimistic updates + retry with a pending-sync indicator — decision recorded in `plans/workflow-redesign.md` (Topic 1, connectivity model).
- Per dotfiles conventions: if any tooling/config is needed on the machines, add it to `~/code/windows-dev-setup` modules rather than ad-hoc.
