---
title: Exploration session — blind spots beyond the workflow redesign
date: 2026-07-05
context: /gsd-explore follow-up to the five-topic workflow redesign discussion (plans/workflow-redesign.md)
---

Four blind spots were surfaced beyond the settled redesign topics; three were explored, one seeded.

## Explored and decided

**Offline at the store** — Real constraint checked first: phone hotspot + Tailscale is viable, so full local-first sync architecture was **rejected** as unnecessary. Decision: NAS PocketBase joins the tailnet; app switches to tailnet hostnames; shopping UI uses optimistic updates + retry with a pending-sync indicator. (Todo: `nas-pocketbase-tailnet`.)

**Recipe evolution & feedback** — Decision: one-tap notes on any recipe surface → pending-note queue → agent applies each note as a **draft revision** → week wizard prompts approval next time the recipe comes up. Rejected: edit-recipe-immediately (interrupts dinner), structured post-cook rating ritual (unwanted weekly chore; rotation stays planned=cooked LRU without preference weighting).

**Portions & people** — The real need is occasional whole-week shifts (guests, travel). Decision: a single **people-multiplier on the weekly plan**, stacked on per-meal quantities. Rejected: per-person portion model, recipe yield/servings engine — machinery the household doesn't need.

## Seeded for later

**Day-before prep horizon** — thaw/marinate/pull-out tasks that must schedule before prep day. Deferred to Phase 5 scheduler design; see `.planning/seeds/day-before-prep-horizon.md`.

All decisions were folded into `plans/workflow-redesign.md` (Topics 1, 3, 5 and the Phase 2/4/6 roadmap entries).
