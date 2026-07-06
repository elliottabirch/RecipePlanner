# Requirements: RecipePlanner

**Defined:** 2026-07-05
**Core Value:** The derived weekly outputs — shopping list and prep plan — must be trustworthy and low-friction for the real weekly shop-and-prep cycle.

## v1.1 Requirements

Requirements for milestone v1.1 Workflow Redesign. Each maps to roadmap phases. Authoritative detail: `plans/workflow-redesign.md` + `.planning/phase-docs/`.

### Data Hygiene

- [x] **DATA-01**: Shopping aggregation never sums mismatched units — converts within dimension to the product's canonical unit, or splits lines by dimension
- [x] **DATA-02**: Units are an enum with canonical unit + dimension per product, with a within-dimension conversion module (`src/lib/units.ts`)
- [x] **DATA-03**: `recipe_product_nodes.unit` carries measurement units only — container-type semantics split into their own field
- [x] **DATA-04**: Products are deduped one-shot and protected by a case-insensitive unique index on `products.name`
- [x] **DATA-05**: Existing node units are normalized to enum tokens
- [x] **DATA-06**: Linter v1 flags the 4 data-hygiene rule violations on demand
- [x] **DATA-07**: `decisions.md` reconciled with actual signature-based step aggregation; stale `pb_schema_updated.json` re-exported

### Shopping State

- [x] **SHOP-01**: Shopping checkbox state persists per plan across refresh and device switch
- [x] **SHOP-02**: User can record "have N" per line and see remaining-to-buy
- [x] **SHOP-03**: User can swap a product mid-shop — picking affected meals and entering per-meal quantity/unit — with all outputs re-derived
- [x] **SHOP-04**: User can resolve a line as "make it at home", with offer to add the source recipe to the week
- [ ] **SHOP-05**: User can quick-create a product from a phone-friendly minimal dialog (name + store/section + unit)
- [ ] **SHOP-06**: Outputs pages are tablet touch-friendly
- [x] **SHOP-07**: Shopping UI works over the tailnet with optimistic updates, retry, and a pending-sync indicator

### Registry Seeding

- [ ] **REG-01**: Product registry seeded with ~800 USDA Foundation Foods (plain names, category→section defaults, FDC IDs retained)
- [ ] **REG-02**: Every product-search surface uses fuzzy/token client-side search
- [ ] **REG-03**: Quick-create offers a "Search USDA" mode for on-demand items
- [ ] **REG-04**: Products carry nutrition-ready nullable fields (no UI)

### Week Memory

- [ ] **WEEK-01**: Weekly plans have a start date (existing plans backfilled)
- [ ] **WEEK-02**: A per-plan people-multiplier stacks on per-meal quantities through all aggregation outputs (pull lists excluded by design)
- [ ] **WEEK-03**: User can define a week template of tag-based slots (`week_templates` + `template_slots`)
- [ ] **WEEK-04**: Guided-fill wizard leads with a staples slot pre-filled from last week and orders each pool least-recently-planned-first

### Prep-Day Engine

- [ ] **PREP-01**: Recipe steps carry `active_minutes`, `passive_minutes`, `instructions`, and a controlled `prep_action` vocabulary
- [ ] **PREP-02**: The 185 existing steps are backfilled via an AI-assisted offline pass, reviewed in batches
- [ ] **PREP-03**: A seeded, deterministic GA scheduler orders the merged week-graph with a resource model (oven racks + temperature, burners, singleton appliances)
- [ ] **PREP-04**: Interactive tablet cook mode shows now/next cards, readiness states, scaled quantities + instructions, and recomputes on check-off
- [ ] **PREP-05**: User can tune scheduler weights in-app and regenerate the plan
- [ ] **PREP-06**: Linter v2 flags the 3 step-metadata/pull-step rules on demand

### Import & Lifecycle

- [ ] **IMP-01**: Recipes have a draft/published lifecycle; drafts are invisible to planning
- [ ] **IMP-02**: User can import structured recipe JSON in-app, landing in prod as a draft via the shared graph-write path
- [ ] **IMP-03**: The `recipe-import` skill emits import JSON instead of scripts; the test→prod migration ritual is retired
- [ ] **IMP-04**: `/suggest-recipes` proposes 3–5 import-ready candidates honoring the four constraints (registry overlap, low active time, batch-compatible, macro floor)
- [ ] **IMP-05**: User can attach a one-tap note to a recipe from calendar, cook mode, or recipe card
- [ ] **IMP-06**: An agent pass turns pending notes into draft revisions, surfaced for review in the week wizard
- [ ] **IMP-07**: Publishing gates on the recipe linter (import itself does not)

## Future Requirements

Deferred. Tracked but not in current roadmap.

### Nutrition

- **NUTR-01**: Nutrition UI over the FDC-linked enrichment fields (schema ships in REG-04; UI later)

### Prep Horizon

- **PREP-F1**: Day-before prep horizon (thaw/marinate/overnight lead-time scheduling) — open seed; `lead_time_minutes` + related AC conditional/deferred pending design + Phase 4 dates

### Pull Lists

- **PULL-F1**: Pull-list quantities scale with per-meal quantity + people-multiplier — requires a preceding `buildPullLists` fix; excluded from v1.1

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cross-dimension unit conversion / density model | Linter flags mismatches at authoring time; density guesses aren't trustworthy |
| Offline-first sync architecture | Tailnet + optimistic updates covers the store case; single user, no realtime |
| Per-person portion model / recipe yield engine | Single people-multiplier per plan is all the household needs |
| Structured post-cook ratings | Weekly ritual not wanted; one-tap notes (IMP-05) replace it |
| Confirm-cooked tracking | Rotation freshness uses planning history (planned = cooked) |
| Multi-user auth / realtime sync | Self-hosted, trusted network, single household |
| Hands-count scheduler resource | One cook assumed for now |
| Durable-across-reload offline write queue | Optimistic retry suffices on tailnet |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| DATA-07 | Phase 1 | Complete |
| SHOP-01 | Phase 2 | Complete |
| SHOP-02 | Phase 2 | Complete |
| SHOP-03 | Phase 2 | Complete |
| SHOP-04 | Phase 2 | Complete |
| SHOP-05 | Phase 2 | Pending |
| SHOP-06 | Phase 2 | Pending |
| SHOP-07 | Phase 2 | Complete |
| REG-01 | Phase 3 | Pending |
| REG-02 | Phase 3 | Pending |
| REG-03 | Phase 3 | Pending |
| REG-04 | Phase 3 | Pending |
| WEEK-01 | Phase 4 | Pending |
| WEEK-02 | Phase 4 | Pending |
| WEEK-03 | Phase 4 | Pending |
| WEEK-04 | Phase 4 | Pending |
| PREP-01 | Phase 5 | Pending |
| PREP-02 | Phase 5 | Pending |
| PREP-03 | Phase 5 | Pending |
| PREP-04 | Phase 5 | Pending |
| PREP-05 | Phase 5 | Pending |
| PREP-06 | Phase 5 | Pending |
| IMP-01 | Phase 6 | Pending |
| IMP-02 | Phase 6 | Pending |
| IMP-03 | Phase 6 | Pending |
| IMP-04 | Phase 6 | Pending |
| IMP-05 | Phase 6 | Pending |
| IMP-06 | Phase 6 | Pending |
| IMP-07 | Phase 6 | Pending |

**Coverage:**

- v1.1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 ✓

*Note: an earlier draft of this file stated 31 total requirements; the actual enumerated
count across the six categories (DATA 7 + SHOP 7 + REG 4 + WEEK 4 + PREP 6 + IMP 7) is 35.
Corrected during roadmap creation.*

---
*Requirements defined: 2026-07-05*
*Last updated: 2026-07-05 after roadmap creation (Phase 1-6 mapping, coverage corrected 31→35)*
