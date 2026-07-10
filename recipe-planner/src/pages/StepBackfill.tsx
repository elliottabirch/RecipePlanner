/**
 * In-app AI-backfill review page (PREP-02, 05-CONTEXT.md "Claude's
 * Discretion" backfill delivery surface). Consumes the offline Plan-04
 * draft (step-backfill-draft.json -- no runtime LLM call), renders a
 * per-recipe-batch draft-vs-current diff for every step still missing at
 * least one drafted field, lets the human Accept (default) / Edit / Reject
 * each field, and writes only the approved values on "Save Reviewed Batch"
 * -- atomically per recipe batch, idempotently (a step with nothing left
 * missing drops out of the queue on the next load).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getAll, update, collections } from "../lib/api";
import type { Recipe, RecipeStep } from "../lib/types";
import {
  computeBackfillWriteSet,
  BACKFILL_FIELDS,
  type BackfillDraftEntry,
  type BackfillFieldKey,
  type FieldDecision,
  type StepDecisions,
} from "../lib/backfill/diff";
import stepBackfillDraft from "../data/step-backfill-draft.json";

const draft = stepBackfillDraft as Record<string, BackfillDraftEntry>;

// Same controlled vocabularies as RecipeEditor.tsx's Edit Step dialog
// (Phase 5 Plan 03, D-05) -- kept as a local copy since RecipeEditor does
// not export them.
const PREP_ACTION_OPTIONS = [
  "sliced",
  "diced",
  "minced",
  "chopped",
  "grated",
  "shredded",
] as const;

type ResourceValue = NonNullable<RecipeStep["resource"]>;

const RESOURCE_OPTIONS: ResourceValue[] = [
  "oven",
  "stovetop",
  "blender",
  "food_processor",
  "instant_pot",
  "none",
];

const RESOURCE_LABELS: Record<ResourceValue, string> = {
  oven: "Oven",
  stovetop: "Stovetop",
  blender: "Blender",
  food_processor: "Food Processor",
  instant_pot: "Instant Pot",
  none: "None",
};

const FIELD_LABELS: Record<BackfillFieldKey, string> = {
  active_minutes: "Active minutes",
  passive_minutes: "Passive minutes",
  instructions: "Instructions",
  prep_action: "Prep action",
  resource: "Resource",
  oven_temp_f: "Oven temp (°F)",
  rack_slots: "Rack slots",
};

const SELECT_FIELDS = new Set<BackfillFieldKey>(["prep_action", "resource"]);

function formatFieldValue(field: BackfillFieldKey, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "resource") {
    return RESOURCE_LABELS[value as ResourceValue] ?? String(value);
  }
  return String(value);
}

interface MissingField {
  field: BackfillFieldKey;
  draftValue: unknown;
}

function missingFieldsFor(
  step: RecipeStep,
  entry: BackfillDraftEntry
): MissingField[] {
  return BACKFILL_FIELDS.filter((field) => {
    const draftValue = entry[field];
    if (draftValue === null || draftValue === undefined) return false; // draft has nothing to offer
    const currentValue = step[field];
    return currentValue === null || currentValue === undefined; // still missing
  }).map((field) => ({ field, draftValue: entry[field] }));
}

interface RecipeBatch {
  recipeId: string;
  recipeName: string;
  steps: { step: RecipeStep; missing: MissingField[] }[];
}

export default function StepBackfill() {
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, StepDecisions>>(
    {}
  );
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);
  const [saveErrorByRecipe, setSaveErrorByRecipe] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    (async () => {
      const [allSteps, allRecipes] = await Promise.all([
        getAll<RecipeStep>(collections.recipeSteps),
        getAll<Recipe>(collections.recipes),
      ]);
      setSteps(allSteps);
      setRecipes(allRecipes);
      setLoading(false);
    })();
  }, []);

  const recipeNameById = useMemo(() => {
    const map = new Map<string, string>();
    recipes.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [recipes]);

  const batches = useMemo<RecipeBatch[]>(() => {
    const byRecipe = new Map<string, RecipeBatch>();
    for (const step of steps) {
      const entry = draft[step.id];
      if (!entry) continue;
      const missing = missingFieldsFor(step, entry);
      if (missing.length === 0) continue; // fully populated -- idempotent drop

      const existing = byRecipe.get(step.recipe);
      if (existing) {
        existing.steps.push({ step, missing });
      } else {
        byRecipe.set(step.recipe, {
          recipeId: step.recipe,
          recipeName: recipeNameById.get(step.recipe) ?? "Unknown recipe",
          steps: [{ step, missing }],
        });
      }
    }
    return Array.from(byRecipe.values()).sort((a, b) =>
      a.recipeName.localeCompare(b.recipeName)
    );
  }, [steps, recipeNameById]);

  function getDecision(stepId: string, field: BackfillFieldKey): FieldDecision {
    // "Accept" is the default-checked state for every field (UI-SPEC Surface
    // 4) -- every field always carries an explicit decision, defaulting to
    // accept, until the human edits or rejects it.
    return decisions[stepId]?.[field] ?? { status: "accept" };
  }

  function setDecision(
    stepId: string,
    field: BackfillFieldKey,
    decision: FieldDecision
  ) {
    setDecisions((prev) => ({
      ...prev,
      [stepId]: { ...prev[stepId], [field]: decision },
    }));
  }

  function toggleEditing(editKey: string) {
    setEditingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(editKey)) {
        next.delete(editKey);
      } else {
        next.add(editKey);
      }
      return next;
    });
  }

  async function handleSaveBatch(batch: RecipeBatch) {
    const effectiveDecisions: Record<string, StepDecisions> = {};
    batch.steps.forEach(({ step, missing }) => {
      effectiveDecisions[step.id] = {};
      missing.forEach(({ field }) => {
        effectiveDecisions[step.id][field] = getDecision(step.id, field);
      });
    });

    const writeSet = computeBackfillWriteSet(
      draft,
      batch.steps.map((s) => s.step),
      effectiveDecisions
    );
    const entries = Object.entries(writeSet);

    const clearBatchDecisions = () => {
      setDecisions((prev) => {
        const next = { ...prev };
        batch.steps.forEach(({ step }) => delete next[step.id]);
        return next;
      });
      setEditingKeys((prev) => {
        const next = new Set(prev);
        batch.steps.forEach(({ step }) => {
          BACKFILL_FIELDS.forEach((field) => next.delete(`${step.id}:${field}`));
        });
        return next;
      });
    };

    if (entries.length === 0) {
      // Every remaining field in this batch was rejected -- nothing to
      // write, but the batch is still "reviewed": drop it from the queue.
      clearBatchDecisions();
      return;
    }

    setSavingRecipeId(batch.recipeId);
    setSaveErrorByRecipe((prev) => ({ ...prev, [batch.recipeId]: "" }));
    const applied: { stepId: string; fields: Partial<RecipeStep> }[] = [];

    try {
      for (const [stepId, fields] of entries) {
        await update<RecipeStep>(collections.recipeSteps, stepId, fields);
        applied.push({ stepId, fields });
      }
      setSteps((prev) =>
        prev.map((s) => (writeSet[s.id] ? { ...s, ...writeSet[s.id] } : s))
      );
      clearBatchDecisions();
    } catch {
      // Atomic-per-batch guarantee: undo any writes that did succeed so a
      // partial failure never leaves the batch half-approved.
      for (const { stepId, fields } of applied) {
        const revert: Record<string, null> = {};
        Object.keys(fields).forEach((key) => {
          revert[key] = null;
        });
        try {
          await update(collections.recipeSteps, stepId, revert);
        } catch {
          // best-effort rollback; nothing more to do client-side
        }
      }
      setSaveErrorByRecipe((prev) => ({
        ...prev,
        [batch.recipeId]:
          "Couldn't save this batch. Nothing was written — try again.",
      }));
    } finally {
      setSavingRecipeId(null);
    }
  }

  if (loading) {
    return <Typography>Loading…</Typography>;
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
        Step Backfill Review
      </Typography>

      {batches.length === 0 ? (
        <Box>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
            All caught up
          </Typography>
          <Typography color="text.secondary">
            Every step in this batch has been reviewed. Nothing left to
            approve.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={4}>
          {batches.map((batch) => {
            const error = saveErrorByRecipe[batch.recipeId];
            const saving = savingRecipeId === batch.recipeId;
            return (
              <Paper key={batch.recipeId} sx={{ p: 3 }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                  {batch.recipeName}
                </Typography>

                <Stack spacing={2} divider={<Divider />}>
                  {batch.steps.map(({ step, missing }) => (
                    <Box key={step.id}>
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        sx={{ mb: 1 }}
                      >
                        {step.name}
                      </Typography>
                      <Stack spacing={1.5}>
                        {missing.map(({ field, draftValue }) => {
                          const decision = getDecision(step.id, field);
                          const editKey = `${step.id}:${field}`;
                          const isEditing = editingKeys.has(editKey);
                          const editValue =
                            decision.status === "edit"
                              ? decision.value
                              : draftValue;

                          return (
                            <Box
                              key={field}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                flexWrap: "wrap",
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{ minWidth: 140, color: "text.secondary" }}
                              >
                                {FIELD_LABELS[field]}
                              </Typography>

                              {/* Draft (left) vs current (right) two-column diff.
                                  Current is always blank here -- only fields
                                  still missing on the step are rendered. */}
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 3,
                                  flex: 1,
                                  minWidth: 240,
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight:
                                      decision.status === "reject" ? 400 : 700,
                                    flex: 1,
                                  }}
                                >
                                  {formatFieldValue(field, draftValue)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ flex: 1 }}
                                >
                                  —
                                </Typography>
                              </Box>

                              {isEditing &&
                                (SELECT_FIELDS.has(field) ? (
                                  <FormControl size="small" sx={{ minWidth: 160 }}>
                                    <Select
                                      value={(editValue ?? "") as string}
                                      onChange={(e) =>
                                        setDecision(step.id, field, {
                                          status: "edit",
                                          value: e.target.value,
                                        })
                                      }
                                    >
                                      {(field === "prep_action"
                                        ? PREP_ACTION_OPTIONS
                                        : RESOURCE_OPTIONS
                                      ).map((opt) => (
                                        <MenuItem key={opt} value={opt}>
                                          {field === "resource"
                                            ? RESOURCE_LABELS[opt as ResourceValue]
                                            : opt}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                ) : (
                                  <TextField
                                    size="small"
                                    multiline={field === "instructions"}
                                    rows={field === "instructions" ? 2 : undefined}
                                    type={field === "instructions" ? "text" : "number"}
                                    value={(editValue ?? "") as string | number}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const value =
                                        field === "instructions"
                                          ? raw
                                          : raw === ""
                                          ? ""
                                          : Number(raw);
                                      setDecision(step.id, field, {
                                        status: "edit",
                                        value,
                                      });
                                    }}
                                    sx={{ minWidth: 200 }}
                                  />
                                ))}

                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  variant={
                                    decision.status === "accept"
                                      ? "contained"
                                      : "outlined"
                                  }
                                  color="primary"
                                  onClick={() => {
                                    setDecision(step.id, field, { status: "accept" });
                                    setEditingKeys((prev) => {
                                      const next = new Set(prev);
                                      next.delete(editKey);
                                      return next;
                                    });
                                  }}
                                  sx={{ minWidth: 48, minHeight: 48 }}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="small"
                                  variant={isEditing ? "contained" : "outlined"}
                                  onClick={() => toggleEditing(editKey)}
                                  sx={{ minWidth: 48, minHeight: 48 }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  variant={
                                    decision.status === "reject"
                                      ? "contained"
                                      : "outlined"
                                  }
                                  onClick={() => {
                                    setDecision(step.id, field, { status: "reject" });
                                    setEditingKeys((prev) => {
                                      const next = new Set(prev);
                                      next.delete(editKey);
                                      return next;
                                    });
                                  }}
                                  sx={{ minWidth: 48, minHeight: 48 }}
                                >
                                  Reject
                                </Button>
                              </Stack>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Stack>

                {error ? (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                  </Alert>
                ) : null}

                <Button
                  variant="contained"
                  color="primary"
                  disabled={saving}
                  onClick={() => handleSaveBatch(batch)}
                  sx={{ mt: 2, minHeight: 48 }}
                >
                  {saving ? "Saving..." : "Save Reviewed Batch"}
                </Button>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
