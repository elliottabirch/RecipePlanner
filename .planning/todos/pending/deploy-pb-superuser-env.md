---
title: Add PB_SUPERUSER_EMAIL/PASSWORD to the NAS deploy environment
date: 2026-07-06
priority: medium
---

The app is deployed as a static build on the OMV NAS (192.168.50.95), not served from
this repo — `recipe-planner/.env.local` only covers local script runs
(`merge-products.js` backup+merge and any future superuser-authenticated tooling).

- Add `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` to the deploy environment on the
  NAS wherever migration/maintenance scripts will run in production context.
- Per dotfiles conventions: config changes on the machines belong in
  `~/code/windows-dev-setup` modules, not ad-hoc edits.
- Related: `nas-pocketbase-tailnet` todo (Phase 2 infra prereq) touches the same
  deploy surface — consider doing both in one pass.
