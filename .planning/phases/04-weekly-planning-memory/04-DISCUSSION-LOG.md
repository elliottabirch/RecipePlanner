# Phase 4: Weekly Planning Memory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 4-Weekly Planning Memory
**Areas discussed:** Template management scope, Wizard interaction model, Pull-list scaling, Multiplier rounding
**Mode:** Advisor (standard calibration; parallel research per area)

---

## Template management scope

| Option | Description | Selected |
|--------|-------------|----------|
| Seed once, defer editor | No editor UI this phase; seed the one template via admin/script; rare edits via desktop PB admin | ✓ |
| Minimal in-app editor | ~1-2 files reusing Tags.tsx CRUD + tag-multiselect; tablet self-service for pool tags/counts | |
| Full editor UI | Drag-reorder, multi-template CRUD; most effort | |

**User's choice:** Seed once, defer editor
**Notes:** Household has one recurring week shape; phase doc itself calls the editor "low-frequency… can be minimal." Drops phase-doc §4 item 7 from Phase 4. Minimal editor noted as a follow-on if desktop-admin editing chafes.

---

## Wizard interaction model

| Option | Description | Selected |
|--------|-------------|----------|
| Accordion, one-at-a-time | One-page accordion, active slot expanded + auto-advance, tap-to-toggle chips, staples pre-toggled + Confirm, off-pool via Autocomplete; skippable | ✓ |
| Full-screen stepper | MUI Stepper, one slot per screen; strict ritual; modal fights "exit anytime" | |
| Single scrollable page | All slots as plain sections; simplest; weakest guided feel | |

**User's choice:** Accordion, one-at-a-time
**Notes:** Modal stepper fights the required "skippable/exitable at any point." Accordion reuses existing WeeklyPlans idioms (colored chips `:743`, Add-Meal Autocomplete `:998`). Slots never blocking; off-pool add docked per section; staples = accordion #1 with one-tap Confirm.

---

## Pull-list scaling under the people-multiplier

| Option | Description | Selected |
|--------|-------------|----------|
| Fix + scale pull lists | Make buildPullLists honor quantity × multiplier like every other output; low blast radius | ✓ |
| Exclude as planned | Leave pull lists unscaled per AC#7; zero code risk but ships the trust gap | |

**User's choice:** Fix + scale pull lists
**Notes:** Reverses phase-doc AC#7 exclusion and expands v1.1 scope past PULL-F1. Same one-line pattern as `step-builder.ts:52,86`; one prod call site + 3 tests. Also a latent correctness fix — changes existing `quantity>1` pull-list output (needs regression check). REQUIREMENTS.md (PULL-F1 → WEEK-02) + phase-doc AC#7 to be updated during planning.

---

## People-multiplier value type & rounding

| Option | Description | Selected |
|--------|-------------|----------|
| Ceil discrete, exact continuous | grams/ml/cups exact (D-11/AC#7); deliberate Math.ceil for each-counts + container instances | ✓ |
| Exact fractional everywhere | No new rounding, byte-for-byte AC#7; "4.5 eggs" unrounded; container count relies on incidental float-ceil | |
| Ceil everything | Never under-buy but overstates butter/cups 100%; violates AC#7 | |

**User's choice:** Ceil discrete, exact continuous
**Notes:** Fractional multiplier (0.5/1.5) mandated. Make container ceil explicit (not the float-fragile `for (i<instances)` side effect). One documented AC#7 exception for `each`-dimension items; continuous stays byte-for-byte. Prefer a shared rounding helper.

## Claude's Discretion

- `week_templates`/`template_slots`/`planned_meals.template_slot` exact field shapes (phase doc §3.3–3.4 default; template_slot link recommended, tag-membership fallback acceptable).
- `start_date` backfill algorithm mechanics (outcome fixed: all non-null → tighten to required).
- Seed-script vs admin-UI for the template row; dry-run/report mode on backfill.
- `people_multiplier` control placement/widget; `pool_tags` match-any (default).

## Deferred Ideas

- Minimal in-app template editor (follow-on if desktop-admin editing chafes).
- Multi-template / seasonal templates (collection modeled for it; no UI/logic now).
- Pool match-all semantics (add any/all toggle when a multi-tag pool is wanted).
- Reviewed todos not folded: `deploy-pb-superuser-env` (prereq note only), `nas-pocketbase-tailnet`, `single-purchase-unit-shopping-lines`, `swap-aware-prep-naming`, `usda-search-plain-rename` — all belong to other phases.
