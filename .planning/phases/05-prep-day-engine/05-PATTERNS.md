# Phase 5: Prep-Day Engine - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 21
**Analogs found:** 18 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `recipe-planner/src/lib/scheduler/types.ts` | model/utility | transform | `recipe-planner/src/lib/aggregation/types.ts` | role-match |
| `recipe-planner/src/lib/scheduler/week-graph.ts` | utility (pure builder) | transform | `recipe-planner/src/lib/aggregation/utils/step-utils.ts` + `builders/step-builder.ts` (to AVOID, see note) / structurally `aggregation/types.ts` consumer | role-match |
| `recipe-planner/src/lib/scheduler/resources.ts` | utility (pure predicate) | transform | `recipe-planner/src/lib/linter/rules/missing-store-section.ts` (pure filter/predicate shape) | partial-match |
| `recipe-planner/src/lib/scheduler/genetic.ts` | service (algorithm) | batch/transform | none in codebase — novel; follow RESEARCH.md Patterns 1-4 directly | no analog |
| `recipe-planner/src/lib/scheduler/retime.ts` | utility (pure) | transform | none in codebase — novel; follow RESEARCH.md Pattern 3 | no analog |
| `recipe-planner/src/hooks/useCookProgress.ts` | hook | CRUD (optimistic upsert) | `recipe-planner/src/hooks/useShoppingState.ts` + `recipe-planner/src/lib/sync-queue.ts` | exact |
| `recipe-planner/src/pages/CookMode.tsx` | component/page | request-response + event-driven (check-off) | `recipe-planner/src/components/outputs/BatchPrepTab.tsx` (surface it replaces) | role-match |
| `recipe-planner/src/components/cook-mode/NowNextCard.tsx` | component | event-driven | `recipe-planner/src/components/nodes/StepNode.tsx` (card border/shadow/chip conventions) | role-match |
| `recipe-planner/src/components/cook-mode/ReadinessChip.tsx` | component | transform (derived state) | `recipe-planner/src/components/nodes/StepNode.tsx` (Timing `Chip` — outlined vs filled) | role-match |
| `recipe-planner/src/components/cook-mode/WeightsPanel.tsx` | component | CRUD (form-over-collection) | `recipe-planner/src/components/outputs/BatchPrepTab.tsx` (full-width primary `Button` treatment) | partial-match |
| `recipe-planner/src/pages/StepBackfill.tsx` | component/page | file-I/O (JSON draft consume) + CRUD (approve-to-write) | `.claude/skills/recipe-import/SKILL.md` (draft-then-review pattern) + `recipe-planner/src/pages/registries/Products.tsx` (Lint Findings Dialog list/approve pattern) | role-match |
| `recipe-planner/src/pages/RecipeEditor.tsx` (modified — Edit Step dialog + `handleSave`) | component/page | CRUD | itself, lines 1279-1352 (Edit Step dialog) + lines 424-450, 629-649 (`handleSaveEditedStep`/`handleSave` step-node branch) | exact (self-modification) |
| `recipe-planner/src/components/nodes/StepNode.tsx` (modified — metadata chip) | component | request-response (display) | itself, lines 48-71 (existing Timing chip block) | exact (self-modification) |
| `recipe-planner/src/lib/linter/rules/missing-durations.ts` | utility (pure rule fn) | transform | `recipe-planner/src/lib/linter/rules/missing-store-section.ts` | exact |
| `recipe-planner/src/lib/linter/rules/missing-prep-action.ts` | utility (pure rule fn) | transform | `recipe-planner/src/lib/linter/rules/prep-words.ts` | exact |
| `recipe-planner/src/lib/linter/rules/missing-pull-step.ts` | utility (pure rule fn) | transform (week/graph-scoped) | `recipe-planner/src/lib/linter/rules/missing-store-section.ts` (rule shape) + `recipe-planner/src/lib/scheduler/week-graph.ts` (cross-recipe edge data it consumes) | role-match |
| `recipe-planner/src/lib/linter/index.ts` (modified — register new rules) | utility (aggregator) | transform | itself, lines 1-58 (`runLint` aggregator) | exact (self-modification) |
| `recipe-planner/src/lib/api.ts` (modified — new collections) | config | CRUD | itself, lines 51-71 (`collections` map) | exact (self-modification) |
| `recipe-planner/src/lib/types.ts` (modified — `RecipeStep` + `CookProgress`/`SchedulerConfig`) | model | CRUD | itself, lines 98-115 (`RecipeStep`) + 243-250 (`ShoppingState` as the new-collection-type template) | exact (self-modification) |
| `recipe-planner/pb_schema.json` / `pb_schema_updated.json` (modified — schema additions) | config/migration | batch (schema migration) | existing `recipe_steps` collection entry + Phase-2's additive-nullable `shopping_state` precedent | exact |
| `recipe-planner/src/lib/scheduler/*.test.ts` | test | transform | `recipe-planner/src/lib/sync-queue.ts`'s co-located `sync-queue.test.ts` (test-file convention; not read in full, referenced by RESEARCH.md) | role-match |

## Pattern Assignments

### `recipe-planner/src/lib/scheduler/week-graph.ts` / `resources.ts` / `genetic.ts` / `retime.ts` (pure lib modules, transform)

**Analog for module shape/exports:** `recipe-planner/src/lib/aggregation/types.ts` + `recipe-planner/src/lib/aggregation/utils/step-utils.ts`

**Imports pattern** (aggregation/utils/step-utils.ts lines 1):
```typescript
import { StepType, Timing, type RecipeStep } from "../../types";
```
Scheduler modules should mirror this relative-import-from-`lib/types`/`lib/aggregation/types` convention — no path aliases used anywhere in this codebase; always relative imports.

**Pure-function shape to copy** (step-utils.ts lines 20-27, the exact "small pure helper, JSDoc above, no class" style):
```typescript
export function createStepSignature(
  inputProductIds: string[],
  outputProductIds: string[]
): string {
  const sortedInputs = [...inputProductIds].sort().join(",");
  const sortedOutputs = [...outputProductIds].sort().join(",");
  return `${sortedInputs}=>${sortedOutputs}`;
}
```

**Input type to build FROM (do not merge/signature-collapse — this is the critical anti-pattern):** `RecipeGraphData` / `MealKeyedRecipeData` (aggregation/types.ts lines 43-56):
```typescript
export interface RecipeGraphData {
  recipe: Recipe;
  productNodes: ExpandedProductNode[];
  steps: RecipeStep[];
  productToStepEdges: ProductToStepEdge[];
  stepToProductEdges: StepToProductEdge[];
}
export type MealKeyedRecipeData = Map<string, RecipeGraphData>;
```
**AVOID:** `createStepSignature`/`addOrMergeStep` merge multiple recipe instances of an identical step into one `AggregatedFlowStep` node (aggregation/types.ts lines 104-123) — correct for `BatchPrepTab.tsx`'s flat list, wrong for the scheduler (loses per-instance precedence/resource accounting). Build `week-graph.ts` directly from `RecipeGraphData`, one node per `(plannedMealId, step.id)`.

**No genetic.ts/retime.ts/resources.ts analog exists in-repo** — these are novel. Follow RESEARCH.md Patterns 2, 3, 4 verbatim (SSGS decode, `isFeasibleAt`, `retimeSchedule`); do not invent a different shape. Their file-level JSDoc header should follow the sync-queue.ts convention below (see Shared Patterns > Module header comments).

---

### `recipe-planner/src/hooks/useCookProgress.ts` (hook, CRUD optimistic upsert)

**Analog:** `recipe-planner/src/hooks/useShoppingState.ts` (full file read, 175 lines) + `recipe-planner/src/lib/sync-queue.ts` (full file read, 164 lines, reused as-is — no changes needed to sync-queue.ts itself)

**Structural pattern to copy verbatim, renaming domain concepts** (useShoppingState.ts lines 1-97):
```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { getAll, create, update, collections } from "../lib/api";
import type { ShoppingState } from "../lib/types";
import { createSyncQueue, type SyncQueue } from "../lib/sync-queue";

export interface ShoppingStateEntry {
  recordId: string | null;
  checked: boolean;
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip";
}
type WritableFields = Pick<ShoppingStateEntry, "checked" | "have_quantity" | "resolution">;

export function useShoppingState(weeklyPlanId: string) {
  const [state, setState] = useState<Map<string, ShoppingStateEntry>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState(0);
  const stateRef = useRef(state); stateRef.current = state;
  const weeklyPlanIdRef = useRef(weeklyPlanId); weeklyPlanIdRef.current = weeklyPlanId;

  const queueRef = useRef<SyncQueue<WritableFields> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createSyncQueue<WritableFields>({
      process: async (lineKey, payload) => {
        const planId = weeklyPlanIdRef.current;
        if (!planId) return;
        const current = stateRef.current.get(lineKey);
        if (current?.recordId) {
          await update<ShoppingState>(collections.shoppingState, current.recordId, payload);
          return;
        }
        // Query-then-branch upsert — avoids racing two concurrent create()s
        // against the (weekly_plan, key) unique pair.
        const existing = await getAll<ShoppingState>(collections.shoppingState, {
          filter: `weekly_plan="${planId}" && line_key="${lineKey}"`,
        });
        if (existing[0]) {
          await update<ShoppingState>(collections.shoppingState, existing[0].id, payload);
          setRecordId(lineKey, existing[0].id);
        } else {
          const created = await create<ShoppingState>(collections.shoppingState, {
            weekly_plan: planId, line_key: lineKey, ...payload,
          });
          setRecordId(lineKey, created.id);
        }
      },
      onChange: (counts) => { setPendingCount(counts.pending); setFailed(counts.failed); },
    });
  }
  // ... useEffect load-on-mount by filter, applyOptimistic, setters, return shape
}
```

**For `useCookProgress`:** replace `ShoppingStateEntry` → `CookProgressEntry { recordId, checked, checked_at }`; replace `line_key` filter key → `step_instance` (the `${plannedMealId}::${step.id}` id from `week-graph.ts`'s `StepInstance.id`); replace `collections.shoppingState` → `collections.cookProgress`; writable fields become `{ checked, checked_at }` (no `have_quantity`/`resolution` — cook_progress has no have-N/resolution concept per D-03). Filter pattern: `` weekly_plan="${planId}" && step_instance="${stepInstanceKey}" ``.

**`createSyncQueue` itself needs NO modification** — reuse the exact export from `recipe-planner/src/lib/sync-queue.ts` unchanged; it is already generic over payload type `T`.

---

### `recipe-planner/src/pages/CookMode.tsx` (page, supersedes `BatchPrepTab.tsx` interactive role)

**Analog:** `recipe-planner/src/components/outputs/BatchPrepTab.tsx` (full file, 158 lines)

**Checkbox/tap-target pattern to copy exactly** (BatchPrepTab.tsx lines 85-90 — the 48px minimum touch target, per UI-SPEC's locked spacing exception):
```typescript
<Checkbox
  checked={checkedItems.has(key)}
  onChange={() => onToggleChecked(key)}
  size="medium"
  sx={{ mt: -0.5, p: 1.5, minWidth: 48, minHeight: 48 }}
/>
```
Mirror this `sx` block verbatim for `CookMode.tsx`'s check-off control (UI-SPEC Surface 1 says "mirrors `CheckableListItem.tsx`'s existing `ListItemIcon` checkbox position/sizing exactly" — both `BatchPrepTab.tsx` and `CheckableListItem.tsx` converge on the same 48px `sx` shape; either is a valid direct source, `BatchPrepTab.tsx` shown here since it's the surface actually being replaced).

**Empty-state pattern** (BatchPrepTab.tsx line 50, reuse `EmptyState` component):
```typescript
if (batchPrepSteps.length === 0) {
  return <EmptyState message={UI_TEXT.noPrepSteps} />;
}
```
For `CookMode.tsx`: `<EmptyState message="No prep schedule yet" />` plus the CTA button per UI-SPEC's copy contract ("Generate Prep Schedule").

**Print stylesheet:** keep `BatchPrepTab.tsx`'s `useReactToPrint` + `BatchPrepPrintView` (lines 39-47, 154-156) untouched — CookMode.tsx does NOT need print support; `BatchPrepTab.tsx` itself stays for the batch-prep print view per Topic 1 (do not delete it, only stop rendering its interactive checklist as the prep-day default surface).

---

### `recipe-planner/src/components/cook-mode/NowNextCard.tsx` + `ReadinessChip.tsx`

**Analog:** `recipe-planner/src/components/nodes/StepNode.tsx` (full file, 78 lines)

**Border/shadow/selected-state pattern to copy exactly** (StepNode.tsx lines 27-35 — UI-SPEC Surface 1 explicitly says reuse this convention):
```typescript
<Box
  sx={{
    backgroundColor: "white",
    border: selected ? "2px solid #1976d2" : "1px solid #ccc",
    borderRadius: 2,
    padding: 1.5,
    minWidth: 150,
    boxShadow: selected ? 3 : 1,
  }}
>
```
Now card = `border: "2px solid" primary.main` (theme accent, not the hardcoded `#1976d2`), `boxShadow: 3`, padding 3 (24px, the phase-specific exception). Next card = `border: "1px solid #ccc"`, `boxShadow: 1` (or none per UI-SPEC "no shadow").

**Chip pattern to copy exactly** (StepNode.tsx lines 60-70, the Timing outlined chip — UI-SPEC Surface 3 cites this exact block for the new metadata chip too):
```typescript
<Chip
  label={TIMING_LABELS[data.timing]}
  size="small"
  variant="outlined"
  sx={{ fontSize: "0.7rem", height: 20 }}
/>
```
`ReadinessChip.tsx`: "Waiting" state = this exact outlined-chip shape with `text.secondary`; "Ready" state = same shape but `variant="filled"` + accent green background (per UI-SPEC Color section); "Passive/counting-down" = filled + `secondary.main` (orange).

---

### `recipe-planner/src/components/cook-mode/WeightsPanel.tsx`

**Analog (primary CTA button treatment):** `recipe-planner/src/components/outputs/BatchPrepTab.tsx` lines 65-72:
```typescript
<Button
  variant="contained"
  color="primary"
  onClick={() => handlePrint()}
  startIcon={<PrintIcon />}
>
  {UI_TEXT.printList}
</Button>
```
Mirror this for "Regenerate Plan": `variant="contained"` `color="primary"`, full-width, 48px+ tall per UI-SPEC. No direct slider-panel analog exists in-repo; MUI `Slider` component itself is new to this codebase (verify `@mui/material` version already includes it — v7.3.6 does, no new dependency).

---

### `recipe-planner/src/pages/StepBackfill.tsx`

**Analog (list/approve dialog shape):** `recipe-planner/src/pages/registries/Products.tsx` lines 522-561 (Lint Findings Dialog):
```typescript
<Dialog open={lintDialogOpen} onClose={() => setLintDialogOpen(false)} maxWidth="md" fullWidth>
  <DialogTitle>Lint Findings ({findings.length})</DialogTitle>
  <DialogContent>
    {findings.length === 0 ? (
      <Typography color="text.secondary">
        No issues found — all products are clean.
      </Typography>
    ) : (
      findings.map((finding, index) => (
        <Alert key={`${finding.rule}-${finding.productId ?? index}`} severity={finding.severity} sx={{ mb: 1 }}>
          <strong>{finding.rule}</strong>: {finding.message}
        </Alert>
      ))
    )}
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setLintDialogOpen(false)}>Close</Button>
  </DialogActions>
</Dialog>
```
`StepBackfill.tsx` is a full page (not a dialog) but should reuse this "list, empty-state copy string, per-item severity/actionable row" shape — replace `Alert` rows with the two-column draft-vs-current diff rows per UI-SPEC Surface 4, replace the empty-state string with "All caught up" / "Every step in this batch has been reviewed. Nothing left to approve."

**Offline-draft-JSON flow to follow:** `.claude/skills/recipe-import/SKILL.md` (read in full) — the draft-then-review pattern (offline LLM produces JSON, app only reads/reviews/writes, no runtime LLM client). No code excerpt to copy (it's a process pattern, not a code pattern) — the page's job is: load draft JSON (static import or file picker), diff against current `recipe_steps` rows fetched via `getAll(collections.recipeSteps, ...)`, render Accept/Edit per field, write only accepted values via `update()` on "Save Reviewed Batch", and skip any step already fully populated (idempotency).

---

### `recipe-planner/src/pages/RecipeEditor.tsx` (modify — Edit Step dialog + `handleSave`)

**Analog:** itself. Two touchpoints, both read in full:

**Touchpoint 1 — Edit Step Dialog** (RecipeEditor.tsx lines 1292-1330, insert new fields after the existing `Timing` `Select` conditional block):
```typescript
<TextField
  autoFocus
  label="Step Name"
  value={stepName}
  onChange={(e) => setStepName(e.target.value)}
  fullWidth
  margin="dense"
  placeholder="e.g., Dice onions, Sauté vegetables"
/>
<FormControl fullWidth margin="dense">
  <InputLabel>Step Type</InputLabel>
  <Select value={stepType} label="Step Type" onChange={(e) => setStepType(e.target.value as StepType)}>
    <MenuItem value={StepType.Prep}>Prep (raw ingredients only)</MenuItem>
    <MenuItem value={StepType.Assembly}>Assembly</MenuItem>
  </Select>
</FormControl>
{stepType === "assembly" && (
  <FormControl fullWidth margin="dense">
    <InputLabel>Timing</InputLabel>
    <Select value={stepTiming} label="Timing" onChange={(e) => setStepTiming(e.target.value as Timing)}>
      <MenuItem value="batch">Batch (prep day)</MenuItem>
      <MenuItem value="just_in_time">Just-in-time (serve time)</MenuItem>
    </Select>
  </FormControl>
)}
```
Append, in this exact `TextField`/`Select` + `margin="dense"`/`fullWidth` pattern (per UI-SPEC Surface 3 field order): `active_minutes` (`TextField` type number), `passive_minutes` (`TextField` type number), `instructions` (`TextField multiline rows={3}`), `prep_action` (`Select`, conditional on `step_type === "prep"` — mirror the `stepType === "assembly"` conditional pattern shown above), `resource` (`Select`), `oven_temp_f` (`TextField` type number, conditional on `resource === "oven"`, with `error`/`helperText` per UI-SPEC's inline-validation copy), `rack_slots` (`TextField` type number, default 1).

**Touchpoint 2 — `handleSaveEditedStep`** (lines 424-450) and the `handleSave` step-node branch (lines 629-649):
```typescript
const handleSaveEditedStep = () => {
  if (!stepName.trim() || !editingNodeId) return;
  setNodes((nds) => nds.map((node) => {
    if (node.id === editingNodeId) {
      return { ...node, data: { ...node.data, label: stepName.trim(), stepType, timing: stepType === "assembly" ? stepTiming : undefined } } as FlowNode;
    }
    return node;
  }));
  setEditStepDialogOpen(false);
  setEditingNodeId(null);
  setStepName("");
  setStepType(StepType.Prep);
  setStepTiming(Timing.Batch);
};
```
```typescript
} else if (node.type === "step") {
  const data = node.data as StepNodeData;
  const nodeData = {
    recipe: recipeId,
    name: data.label,
    step_type: data.stepType,
    timing: data.timing,
    position_x: node.position.x,
    position_y: node.position.y,
  };
  if (existingDbId) {
    await update(collections.recipeSteps, existingDbId, nodeData);
  } else {
    const created = await create<RecipeStep>(collections.recipeSteps, nodeData);
    newNodeDbIds[node.id] = created.id;
  }
}
```
Both touchpoints need the same 7 new fields threaded through `StepNodeData` (local component state), the `handleSaveEditedStep` node-data merge, and the `nodeData` object passed to `create`/`update`.

---

### `recipe-planner/src/components/nodes/StepNode.tsx` (modify — metadata chip)

**Analog:** itself, lines 48-71 (existing chip row, `Box display="flex" gap={0.5}"`):
```typescript
<Box display="flex" gap={0.5} flexWrap="wrap">
  <Chip label={data.stepType} size="small" sx={{ backgroundColor: STEP_TYPE_COLORS[data.stepType], color: "white", fontSize: "0.7rem", height: 20 }} />
  {data.stepType === StepType.Assembly && data.timing && (
    <Chip label={TIMING_LABELS[data.timing]} size="small" variant="outlined" sx={{ fontSize: "0.7rem", height: 20 }} />
  )}
</Box>
```
Append a third `Chip` (same `sx`, `variant="outlined"`, `size="small"`) reading `"12m active / 30m passive"` when `active_minutes`/`passive_minutes` are populated on the node's `data`. No new visual style — exact copy of the existing chip `sx` block per UI-SPEC Surface 3's explicit instruction.

---

### `recipe-planner/src/lib/linter/rules/missing-durations.ts` (PREP-06 rule b)

**Analog:** `recipe-planner/src/lib/linter/rules/missing-store-section.ts` (full file, 39 lines):
```typescript
import type { LintFinding, ProductExpanded } from "../index";

export const SECTION_REQUIRED_STORES = new Set(["safeway"]);

export function lintMissingStoreSection(products: ProductExpanded[]): LintFinding[] {
  return products
    .filter((p) => p.type !== "transient" && !p.pantry)
    .flatMap((p) => {
      const findings: LintFinding[] = [];
      if (!p.expand?.store) {
        findings.push({
          severity: "error",
          rule: "missing-store-section",
          message: `${p.name}: missing store`,
          productId: p.id,
        });
        return findings;
      }
      // ... second conditional finding
      return findings;
    });
}
```
Copy the `filter` + `flatMap`-building-`findings[]` shape exactly. `missing-durations.ts` operates on `RecipeStep[]` (or a `LinterStepExpanded[]` wrapper analogous to `ProductExpanded`), filters where `active_minutes == null && passive_minutes == null`, and emits one `error`-severity finding per match with `rule: "missing-durations"`.

---

### `recipe-planner/src/lib/linter/rules/missing-prep-action.ts` (PREP-06 rule c)

**Analog:** `recipe-planner/src/lib/linter/rules/prep-words.ts` (full file, 40 lines) — the simplest single-loop `for...of` + `findings.push` shape:
```typescript
export function lintPrepWords(products: ProductExpanded[]): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const product of products) {
    if (product.type !== "raw") continue;
    // ... condition check
    if (hasPrepVerb || hasRawSuffix) {
      findings.push({
        severity: "warning",
        rule: "prep-words",
        message: `${product.name}: raw product name contains a prep verb or "(raw)" suffix`,
        productId: product.id,
      });
    }
  }
  return findings;
}
```
`missing-prep-action.ts`: `for (const step of steps) { if (step.step_type !== "prep") continue; if (step.prep_action == null) findings.push({ severity: "error", rule: "missing-prep-action", message: ..., nodeId: step.id }); }`.

---

### `recipe-planner/src/lib/linter/rules/missing-pull-step.ts` (PREP-06 rule a, week-scoped per D-07)

**Analog for rule-function shape:** same as above (`missing-store-section.ts`), but this rule's INPUT is week-scope, not a flat product/step array — it must consume the week-graph builder's cross-recipe producer→consumer edges (per D-07/CONTEXT.md, resolves RESEARCH A6). Wire its signature to accept a `WeekGraph` (from `week-graph.ts`) rather than `RecipeStep[]`/`ProductExpanded[]`, since it needs the cross-recipe edges, not a single recipe's local graph. This is the one linter rule whose input shape diverges from the Phase-1 precedent — call this out explicitly in the plan (the RESEARCH.md Open Question #2 flags this scope decision as the correct one per D-07).

---

### `recipe-planner/src/lib/linter/index.ts` (modify — register 3 new rules)

**Analog:** itself, lines 51-58:
```typescript
export function runLint(products: ProductExpanded[]): LintFinding[] {
  return [
    ...lintCrossDimension(products),
    ...lintPrepWords(products),
    ...lintMissingStoreSection(products),
    ...lintMissingCanonicalUnit(products),
  ];
}
```
The two per-step/per-recipe rules (`missing-durations`, `missing-prep-action`) slot into this exact array-spread aggregator pattern if `runLint` (or a new `runStepLint`) is extended to accept steps. `missing-pull-step` (week-scoped) likely needs its own aggregator entry point (e.g. `runWeekLint(weekGraph)`) since its input shape differs — do not force it into the per-recipe `runLint` signature.

---

### `recipe-planner/src/lib/api.ts` (modify — register `cook_progress` + `scheduler_config`)

**Analog:** itself, lines 51-71 (`collections` map — flat string-literal object, `as const`):
```typescript
export const collections = {
  stores: "stores",
  // ...
  shoppingState: "shopping_state",
  weekTemplates: "week_templates",
  templateSlots: "template_slots",
} as const;
```
Add `cookProgress: "cook_progress",` and `schedulerConfig: "scheduler_config",` following the exact camelCase-key/snake_case-value convention. `getAll`/`create`/`update`/`remove` generic helpers (lines 5-48) need NO changes — they're already collection-agnostic.

---

### `recipe-planner/src/lib/types.ts` (modify — extend `RecipeStep`, add `CookProgress`/`SchedulerConfig`)

**Analog:** itself. `RecipeStep` extension point (lines 108-115):
```typescript
export interface RecipeStep extends BaseRecord {
  recipe: string; // relation ID
  name: string;
  step_type: StepType;
  timing?: Timing;
  position_x?: number;
  position_y?: number;
}
```
Add the 7 new nullable fields directly here: `active_minutes?: number; passive_minutes?: number; instructions?: string; prep_action?: string; resource?: "oven" | "stovetop" | "blender" | "food_processor" | "instant_pot" | "none"; oven_temp_f?: number; rack_slots?: number;`.

**New-collection-type template:** `ShoppingState` (lines 243-250) is the direct shape template for the two new collections:
```typescript
export interface ShoppingState extends BaseRecord {
  weekly_plan: string; // relation ID
  line_key: string;
  checked: boolean;
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip" | null;
}
```
`CookProgress extends BaseRecord { weekly_plan: string; step_instance: string; checked: boolean; checked_at: string | null; }`. `SchedulerConfig extends BaseRecord { seed: number; weights: { active: number; chopping: number; grouping: number; elapsed: number; resource_pressure: number }; burner_count: number; oven_rack_slots: number; appliances: string[]; }` — singleton, so no `weekly_plan` relation.

---

## Shared Patterns

### Optimistic CRUD + sync queue
**Source:** `recipe-planner/src/lib/sync-queue.ts` (reuse unmodified) + `recipe-planner/src/hooks/useShoppingState.ts` (structural template)
**Apply to:** `useCookProgress.ts` only (the one new persistence hook this phase adds). `scheduler_config` (read by weights panel + GA) does NOT need the sync-queue treatment — it's a low-frequency singleton write, a plain `getAll`/`update` on slider-release-debounce is sufficient (no coalescing/retry infra needed, per UI-SPEC's "write on release, debounced" contract, which is a simpler need than `sync-queue.ts` solves).

### Pure rule-function shape (linter)
**Source:** `recipe-planner/src/lib/linter/rules/missing-store-section.ts`, `prep-words.ts`
**Apply to:** `missing-durations.ts`, `missing-prep-action.ts`, `missing-pull-step.ts` — same `LintFinding[]` return type, same `severity`/`rule`/`message`/`productId-or-nodeId` shape, same filter-then-map/flatMap-to-findings pattern, no classes, pure functions only.

### MUI chip/border/shadow visual conventions
**Source:** `recipe-planner/src/components/nodes/StepNode.tsx` lines 27-71
**Apply to:** `NowNextCard.tsx`, `ReadinessChip.tsx`, `StepNode.tsx`'s own modification — the `2px solid <accent>` selected-border / `1px solid #ccc` unselected-border / `boxShadow: 3` vs `1` / `size="small" variant="outlined" fontSize: "0.7rem" height: 20` chip styling must be copied verbatim, not reinvented, per UI-SPEC's explicit "reuse the exact `sx` block" instructions in Surfaces 1 and 3.

### 48px minimum touch target
**Source:** `recipe-planner/src/components/outputs/BatchPrepTab.tsx` line 89 (`sx={{ mt: -0.5, p: 1.5, minWidth: 48, minHeight: 48 }}`)
**Apply to:** `CookMode.tsx`'s check-off control, `WeightsPanel.tsx`'s slider thumbs (MUI `Slider` default thumb is smaller — wrap or size up per UI-SPEC), `StepBackfill.tsx`'s Accept/Reject buttons.

### Additive-nullable PocketBase schema migration
**Source:** existing `recipe_steps` schema (pb_schema.json) + Phase-2's `shopping_state` precedent (new collection, zero-data-rewrite)
**Apply to:** all `recipe_steps` field additions (7 new nullable columns) and the two new collections (`cook_progress`, `scheduler_config`) — no data rewrite needed, additive-only, validated against `:8091` test instance first per this repo's established workflow.

### Module header JSDoc comments citing decision IDs
**Source:** `recipe-planner/src/lib/sync-queue.ts` lines 1-7, `recipe-planner/src/lib/linter/index.ts` lines 1-13, `recipe-planner/src/lib/linter/rules/missing-store-section.ts` lines 1-7
**Apply to:** every new file in this phase — this codebase's convention is a top-of-file comment citing the relevant decision ID (`D-03`, `D-01a`, `PREP-04`, etc.) and one sentence of rationale, e.g.:
```typescript
// Cook-mode check-off progress (D-03). Mirrors useShoppingState.ts's
// optimistic createSyncQueue-backed upsert pattern; keyed by
// (weekly_plan, step_instance) instead of (weekly_plan, line_key).
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `recipe-planner/src/lib/scheduler/genetic.ts` | service | batch/transform | No GA/scheduling algorithm exists anywhere in this codebase; follow RESEARCH.md Patterns 2-4 (SSGS decode, seeded-PRNG operators, fitness function) directly — genuinely novel per RESEARCH.md's own "treat the GA module as the one genuinely novel piece" framing |
| `recipe-planner/src/lib/scheduler/retime.ts` | utility | transform | No existing "recompute a fixed order's clock" function; follow RESEARCH.md Pattern 3 |
| `recipe-planner/src/lib/scheduler/resources.ts` | utility | transform | No resource-feasibility/constraint-checking code exists (closest is the pure-predicate *shape* of linter rules, but the domain — overlapping time windows, capacity counting — has no precedent); follow RESEARCH.md Pattern 2 |

## Metadata

**Analog search scope:** `recipe-planner/src/lib/**`, `recipe-planner/src/hooks/**`, `recipe-planner/src/pages/**`, `recipe-planner/src/components/**`, `.claude/skills/recipe-import/`
**Files scanned (read in full):** `useShoppingState.ts`, `sync-queue.ts`, `linter/index.ts`, `linter/rules/missing-store-section.ts`, `linter/rules/prep-words.ts`, `api.ts`, `types.ts`, `aggregation/utils/step-utils.ts`, `aggregation/types.ts`, `components/nodes/StepNode.tsx`, `components/outputs/BatchPrepTab.tsx`, `pages/RecipeEditor.tsx` (targeted ranges: 400-660, 1260-1355), `pages/registries/Products.tsx` (targeted range: 500-564)
**Pattern extraction date:** 2026-07-09
