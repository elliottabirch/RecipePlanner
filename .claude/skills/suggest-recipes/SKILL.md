---
name: suggest-recipes
description: Propose 3-5 new recipe candidates that reuse the existing product registry, favor low active-prep time, and fit batch-prep — then land only the ones the user accepts as drafts. Use when the user asks for recipe ideas / inspiration / "what should I cook", "suggest recipes", "give me some new recipes to add", or wants registry-reusing candidates. Chat-first and confirm-before-write: proposes in chat, builds ONLY accepted candidates as drafts (never a bulk generator).
---

# Suggest Recipes

Propose a small set (3-5) of **new** recipe candidates tuned to this household's registry
and habits, print a constraint summary per candidate in chat, and — only for the ones the
user accepts — emit the D-01 import JSON (as a **draft**) to land direct in prod.

This is a **manual, chat-first** skill (D-07). It feels like the `recipe-import` skill:
propose → confirm → write. It is NOT a bulk generator — nothing is written until the user
picks, and only accepted candidates become drafts (no junk drafts, threat T-06-11a).

## What makes a good candidate

Score every candidate against four constraints (computed by
`recipe-planner/src/lib/suggest/constraints.ts` — a pure, tested module; reuse it, don't
re-derive the math):

1. **Registry overlap %** (`registryOverlap`) — fraction of the candidate's ingredients
   that confidently match existing `products` (via `scoreProduct` at the ≈0.15 gate).
   Higher = more reuse of what's already tracked. Aim for ≈80%+.
2. **Active prep time** (`activePrepMinutes`) — sum of `active_minutes` across steps
   (hands-on time; lower = better). Passive/unattended time doesn't count.
3. **Batch-prep fit** (`batchFit`) — from `recipe_type` + step `timing` (`batch` vs
   `just_in_time`). Prefer candidates that belong on prep day.
4. **Protein / macro** (`macroEstimate`) — a **SOFT, "estimated" figure only** (D-08).
   `protein_g`/`kcal` are 0 across the registry (no macro data backfilled), so this is a
   heuristic, never a hard filter. Always print it with its "estimated" caveat; never
   reject a candidate on it.

## Household fit — what to suggest

The four constraints above are mechanical; this is the household's actual taste + rhythm.
Honor it or the suggestion is off-target.

### The make-ahead rule (MANDATORY — reject anything that fails it)

~90% of the work must be front-loaded to **prep day (Saturday)**. The household's process is:
Saturday, fully cut / slice / cook / parboil everything; then eat **fast 5–10 min meals** the
rest of the week. A candidate qualifies only if it takes ONE of these two shapes:
1. **Fully assembled ahead → frozen or stored**, reheated as-is; or
2. **Cooked/prepped almost all the way** on prep day, leaving only a small **sear / assemble
   / reheat** step (5–10 min) the night it's eaten.

Anything needing real day-of cooking is out. Proven-fit templates the household loves:
**Indian dishes** (bulk-cook → freeze → serve over rice) and **Thai curries** (same) — lean
on these shapes when you can.

### Keep it simple — low ingredient count, low complexity

Mental load and the tedium of prepping many small ingredients matter as much as active time.
**Favor short ingredient lists; reduce the complexity of any complex recipe.** Two reliable
ways to keep it simple while still tasting great:
- **Lean on a premade sauce/paste** (curry paste, jarred sauce, tahini, pesto, etc.) instead
  of building a sauce from many components; or
- **Stick to the base flavors of the ingredients already in the dish** — let the food + one
  or two accents carry it.

The goal is easy to make, portion, and assemble, yet still interesting and engaging when done
right. Exemplars: **simple roasted broccoli with garlic**; **tahini sauce over roasted veggies
and shrimp**. When a candidate's ingredient list starts sprawling, cut it back or pick a
premade-sauce shortcut before proposing it.

### Hard dietary rules (never violate)

- **Adult dinners are pescatarian** — fish/shellfish only, never meat/poultry. And feature a
  substantial protein at every dinner (they prioritize protein intake).
- **Micah's vegetables must be COOKED** — never suggest raw veg for him.
- **Micah is a kid** — keep it approachable (mild/sweet/familiar landing pad) even when
  introducing a new flavor.
- **Favor low active-prep, batch-prep** across the board (this is the make-ahead rule above).

### Per-eater preferences (steer flavor by whose meal it is)

- **Micah (component meals — protein / green / starch / vegetable):** simple, kid-friendly,
  cooked; gently introduce new flavors.
- **Pescatarian meals (the wife's):** she eats fish/shellfish only and likes it **healthier,
  balanced, vegetable-forward — salads and lighter dishes**. Pescatarian dinners + the
  pescatarian lunch carry HER preferences.
- **Meat meals (the meat lunch / his dishes):** carry HIS preferences — **fattier, cheesier,
  pork, saucy** dishes.

### Slot targeting

The user names the target recipe type in the ask (e.g. "a Micah vegetable", "a pescatarian
dinner", "a meat lunch"). Take the slot/pool from the ask, propose candidates tailored to it,
and tag accordingly (Micah component, adult pescatarian dinner, meat lunch, pescatarian
lunch, staple). Don't invent a slot they didn't ask for. Favor **new flavor profiles** —
don't re-propose ones the registry already covers well.

## Workflow

1. **Read context** (read-only) — pull the product registry + recent plans/recipes.
2. **Form candidates** — draft 3-5 new recipes that lean on existing products.
3. **Score + print** — compute the four constraints per candidate and print a summary
   table in chat.
4. **User picks** — the user accepts some, rejects others (or asks for more).
5. **Land accepted as drafts** — for each accepted candidate, emit the D-01 JSON with
   `status: "draft"` and hand it to the `/import` page (which lands it as a draft via
   `buildRecipeGraph({status:"draft"})`). Rejected candidates are simply dropped.

## Step 1: Read context (read-only)

Run from inside `recipe-planner/` (its `node_modules`). READ ONLY — this skill never
writes to the DB; landing happens via the `/import` page.

```javascript
// One-shot inline node script — READ ONLY. Run from recipe-planner/.
import PocketBase from "pocketbase";
async function main() {
  const pb = new PocketBase("http://192.168.50.95:8090"); // prod, read-only

  // Product registry — the reuse target for registryOverlap.
  const products = await pb.collection("products").getFullList({ sort: "name" });
  console.log(`products: ${products.length}`);

  // Recent plans/recipes — to avoid re-proposing what's already cooked a lot,
  // and to sense which products the household actually uses.
  // NOTE: weekly_plans has no `created` field — do NOT sort by it (400). Sort
  // client-side or omit sort.
  const plans = await pb.collection("weekly_plans").getFullList();
  const meals = await pb.collection("planned_meals").getFullList({ expand: "recipe" });
  const recipes = await pb.collection("recipes").getFullList({ sort: "name" });

  // Print whatever helps you form + de-dupe candidates.
  console.log("recent recipes:", recipes.map((r) => r.name).slice(0, 40));
}
main().catch((e) => console.error("ERROR:", e.message, e.status, e.url));
```

## Step 2: Form 3-5 candidates

Draft new recipes (name, ingredients, steps) that satisfy **"Household fit — what to suggest"
above** (the make-ahead rule, low-ingredient/low-complexity preference, hard dietary rules,
and per-eater flavor steering are the real filter — apply them first), and that:
- **reuse existing products** — favor ingredients already in the registry (raise overlap);
- **keep active time low** — push work into passive/unattended time where possible;
- **front-load to prep day** — assemble-then-freeze/store, or prep-almost-fully with a small
  day-of sear/assemble step (this is the mandatory make-ahead rule, not just "nice");
- **aren't near-duplicates** of recipes already in the list (check against `recipes`), and
  lean toward new flavor profiles.

Each candidate is analyzed the same way the `recipe-import` skill analyzes a recipe:
products (raw/transient/stored/inventory) + steps (prep/assembly) + `Product → Step →
Product` edges, with the full Phase-5 step metadata (`active_minutes`, `passive_minutes`,
`timing`, `prep_action`, `resource`, etc.). Two things it's easy to get wrong (see
recipe-import "Step 2", "Recipe Type", "Step Timing"):
- **Raw whole veg/aromatics ALWAYS go through a `prep` step → transient** (reuse existing
  cuts like `cucumber small dice`, `onion (red) brunoise`, `tomato cherry halved`) before an
  assembly — never wire a raw onion/cucumber/tomato straight into a salad or dish.
- **`recipe_type` is `meal`** for these weekly recipes; `batch_prep` is ONLY for multi-week
  freeze/preserve batches. Prep steps leave `timing` unset; prep-day cook/assembly steps are
  `batch`; genuine day-of steps are `just_in_time`.

## Step 3: Score + print a summary per candidate

Compute the four constraints using the pure module. Conceptually (run inside
`recipe-planner/`, feeding in the registry from Step 1):

```javascript
import {
  registryOverlap,
  activePrepMinutes,
  batchFit,
  macroEstimate,
} from "./src/lib/suggest/constraints";

// candidate.ingredientNames: string[]  (the raw ingredient names)
// candidate.steps: [{ active_minutes, passive_minutes, timing }]
// candidate.recipe_type: "meal" | "batch_prep"
// matchedProducts: the registry products the candidate's ingredients matched

const overlap = registryOverlap(candidate.ingredientNames, products); // 0..1
const active = activePrepMinutes(candidate.steps);                    // minutes
const batch = batchFit(candidate.recipe_type, candidate.steps);       // { fit, batchStepRatio }
const macro = macroEstimate(matchedProducts);                        // { estimated:true, proteinG, note }
```

Then print a chat summary — one row per candidate:

```
Candidate            | Overlap | Active | Batch-fit | Protein (est.)
---------------------|---------|--------|-----------|----------------
Miso-glazed tofu     |   85%   | 12 min | yes       | ~19 g  (ESTIMATED — soft, D-08)
Charred cabbage bowl |   78%   | 18 min | no        | ~8 g   (ESTIMATED — soft, D-08)
...
```

Always attach the `macroEstimate` "estimated" note (or an abbreviated "(estimated)" tag)
to the protein column so it is never read as a hard number. Reject nothing on macro.

## Step 4: User picks

Present the candidates and ask which to keep. The user may accept a subset, reject the
rest, or ask for a fresh batch. **Only accepted candidates proceed.** This is the
confirm-before-write gate — nothing has been written yet.

## Step 5: Land accepted candidates as drafts

For each **accepted** candidate, emit the D-01 import JSON with `status: "draft"` (the same
contract the `recipe-import` skill produces — see
`.claude/skills/recipe-import/SKILL.md` Step 4 and `references/schema.md`). Reuse existing
products via `matchProductId` hints (from the Step 1 registry read) so you don't mint
near-duplicates, and put `store`/`section` hints on any genuinely new non-pantry product.

**Populate `recipe.tags`** by matching the candidate against the **existing** tags — never
invent new ones — exactly as the recipe-import skill's "Match tags" section describes. Read
the `tags` collection, include the id of every tag that genuinely applies (a candidate
usually earns several: e.g. a vegetable side is `vegetable`, a leafy one also `green`; a
fish dish is `protein` + `pescatarian`). **Only include the `micah meal` tag when the user
explicitly asked for a Micah meal** — never infer it from the recipe alone.

**Match each product line's `unit` to the product's `canonical_unit`** (recipe-import skill,
"Match each product line's unit" section) or the publish linter hard-blocks on
cross-dimension. Read `canonical_unit` in the Step 1 registry pull and pick a convertible
unit: whole produce → `each` (broccoli/carrot/squash are `each`, not `lb`), oils/liquids/
pastes → volume (`tbsp`/`fl_oz`), `garlic minced` → `each`. Also flag any existing non-pantry
product whose `canonical_unit` is null (it warns as missing-canonical-unit on publish).

```json
{
  "recipe": { "name": "Miso-glazed Tofu", "recipe_type": "meal", "status": "draft" },
  "tags": [],
  "products": [
    { "ref": "product-1", "name": "firm tofu", "unit": "block", "quantity": 1, "matchProductId": "…" }
  ],
  "steps": [
    { "ref": "step-1", "name": "Press + cube tofu", "step_type": "prep", "timing": "batch", "active_minutes": 5, "passive_minutes": 20 }
  ],
  "edges": [ { "from": "product-1", "to": "step-1" } ]
}
```

**Write each accepted candidate to `import-drafts/<kebab-case-recipe-name>.json`** at the
repo root (create `import-drafts/` if needed) — one file per recipe, ASCII-only, following
the recipe-import skill's "Deliver the JSON as a FILE" rules (copying a large JSON out of a
chat code block corrupts it — smart quotes, mid-string wraps, truncation). Show the JSON
inline for review, but the file is the artifact the user imports from.

Then hand off:

> I wrote it to `import-drafts/<name>.json`. Open that file, copy its contents, and paste
> into the **/import** page and submit. It lands as a **draft** directly in prod (via
> `buildRecipeGraph({status:"draft"})`), then drops you into the editor to review. Drafts
> are invisible to weekly planning until you **Publish** — so accepting a suggestion can
> never leak a half-formed recipe into a meal plan.

Do this once per accepted candidate. Rejected candidates are dropped — nothing is written
for them.

## Guardrails

- **Chat-first, confirm-before-write** — propose in chat; only write accepted candidates.
  Never bulk-generate drafts.
- **Land as `draft`, always** — accepted candidates are drafts (excluded from planning
  until published), so a suggestion can never contaminate a real plan (threat T-06-11a).
- **Macro is soft** — the protein figure is `estimated` and never a filter (threat
  T-06-11b, D-08). Print it with its caveat; reject nothing on it.
- **Match existing tags, never invent** — populate `recipe.tags` from the tags already in
  the collection; include every one that applies. `micah meal` goes on ONLY when the user
  explicitly asked for a Micah meal.
- **Units must match `canonical_unit`** — each product line's `unit` must be convertible to
  the matched product's `canonical_unit` (produce `each`, liquids/pastes volume), or the
  publish linter hard-blocks on cross-dimension.
- **Read-only DB access** — this skill only reads the registry/plans; the `/import` page
  performs the write. Wrap read scripts in `async function main()` + `.catch` and run them
  from inside `recipe-planner/`.
- **Reuse the constraints module** — do the overlap/active/batch/macro math via
  `src/lib/suggest/constraints.ts`, not ad-hoc, so proposals match the tested logic.
