---
title: Make prep-step titles and prep-state output names reflect ingredient swaps
date: 2026-07-06
priority: medium
resolves_phase: 5
---

Surfaced during Phase 2 UAT (mid-shop swap). When a raw ingredient is swapped
(e.g. sweet potato -> potato (russet)), the swap now correctly re-points the
prep step's **input** (fixed in Phase 2, commit `9cf9206`), but two authored-text
layers still show the old ingredient:

- **Step titles** are free text on `recipe_steps.name` (e.g. "dice sweet potato
  (large dice)"). Nothing links the word "sweet potato" in that string to the
  product, so a swap can't rewrite it.
- **Prep-state output nodes** are separate `recipe_product_nodes` with their own
  authored product (e.g. "diced sweet potato"), not swapped by the override — so
  the step's output (and anything downstream consuming it) keeps the old name.

Desired: "large dice sweet potato" -> "large dice **potato (russet)**" after a swap.

Design threads to figure out (Phase 5, alongside PREP-01 step metadata +
`prep_action` vocabulary):
- Derive the step's displayed label from a controlled `prep_action` (e.g. "large
  dice") + its **input** product(s), instead of a free-text `name` that bakes in
  the ingredient. Then a swap re-derives the label for free.
- Decide how prep-state output nodes should be named/derived so a swapped input
  flows a swapped output name through the chain (edge-type / derived-name model),
  rather than each prep-state node carrying an authored product.
- This intersects the recipe graph model, so treat as a modeling decision, not a
  cosmetic tweak. See Phase 2 discussion (2026-07-06) and `9cf9206`.

---

## Partial resolution — 2026-07-18 (260718-e1a, E1-a + E1-a.2)

**Layer 1 (step titles) DONE + swap-aware.** This todo names two authored-text
layers; the first is resolved. Step titles now derive `"{verb} {input}"` from a
controlled `prep_action` (`src/lib/prep-actions.ts`) + the step's single input
product, on all step surfaces (cook mode, batch prep, editor). Because the label
reads the input product node — which a swap re-points (`applyVariantOverrides`) —
the title re-derives on swap for free: swapping sweet potato → potato turns
"dice sweet potato" into "dice potato (russet)" with no rename. Design +
locked decisions: `.planning/notes/E1-derived-step-labels-proposal.md`.

**Layer 2 (prep-state OUTPUT product nodes) STILL OPEN — deferred (user, 2026-07-18).**
The output product a prep step emits (`onion (yellow) small-dice`, `diced sweet
potato`) still carries an authored name, so a swap does not yet re-derive the
downstream output/consumer name. Planned as **E1-b**: derive the output node's
display name at GRAPH time from its producing step's (post-swap) input +
`prep_action` (no `base_product` schema field needed — that would not be
swap-aware; the graph-time derivation is). Held until the verbosity proves worth
it in use.
