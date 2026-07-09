import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { getAll, create, remove, collections } from "../lib/api";
import type {
  PlannedMeal,
  Recipe,
  RecipeTag,
  Tag,
  TemplateSlot,
  WeekTemplate,
  WeeklyPlan,
} from "../lib/types";
import { SLOT_COLORS } from "../constants/mealPlanning";
import { formatWeekOf } from "../lib/planning/dates";
import {
  computeLastPlannedDates,
  orderPoolByLRU,
  poolForSlot,
} from "../lib/planning/history";

const PICK_ERROR_MESSAGE =
  "That pick didn't save. Check your connection and try again.";

interface WeekWizardProps {
  open: boolean;
  plan: WeeklyPlan;
  onClose: () => void;
}

type PicksBySlot = Map<string, Map<string, string>>; // slotId -> recipeId -> plannedMealId

export default function WeekWizard({ open, plan, onClose }: WeekWizardProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [template, setTemplate] = useState<WeekTemplate | null>(null);
  const [slots, setSlots] = useState<TemplateSlot[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeTagsMap, setRecipeTagsMap] = useState<Map<string, string[]>>(
    new Map()
  );
  const [tagsById, setTagsById] = useState<Map<string, Tag>>(new Map());
  const [lastPlanned, setLastPlanned] = useState<Map<string, string>>(
    new Map()
  );

  const [picks, setPicks] = useState<PicksBySlot>(new Map());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [slotErrors, setSlotErrors] = useState<Map<string, string>>(
    new Map()
  );
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [offPoolSelections, setOffPoolSelections] = useState<
    Map<string, Recipe | null>
  >(new Map());

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      setPicks(new Map());
      setPendingKeys(new Set());
      setSlotErrors(new Map());
      setOffPoolSelections(new Map());
      setHasStarted(false);

      try {
        const [
          templates,
          recipesData,
          recipeTagsData,
          tagsData,
          allPlans,
          allPlannedMeals,
        ] = await Promise.all([
          getAll<WeekTemplate>(collections.weekTemplates),
          getAll<Recipe>(collections.recipes, { sort: "name" }),
          getAll<RecipeTag>(collections.recipeTags),
          getAll<Tag>(collections.tags),
          getAll<WeeklyPlan>(collections.weeklyPlans),
          // Unfiltered — LRU needs meals from ALL plans, not plan-scoped
          // (04-RESEARCH.md Anti-Pattern).
          getAll<PlannedMeal>(collections.plannedMeals),
        ]);

        if (cancelled) return;

        const activeTemplate = templates[0] || null;
        setTemplate(activeTemplate);

        const rtMap = new Map<string, string[]>();
        recipeTagsData.forEach((rt) => {
          if (!rtMap.has(rt.recipe)) rtMap.set(rt.recipe, []);
          rtMap.get(rt.recipe)!.push(rt.tag);
        });
        setRecipeTagsMap(rtMap);
        setTagsById(new Map(tagsData.map((t) => [t.id, t])));
        setRecipes(recipesData);
        setLastPlanned(computeLastPlannedDates(allPlans, allPlannedMeals));

        if (!activeTemplate) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const templateSlots = await getAll<TemplateSlot>(
          collections.templateSlots,
          {
            filter: `template="${activeTemplate.id}"`,
            sort: "sort_order",
          }
        );
        if (cancelled) return;
        setSlots(templateSlots);

        // Seed initial picks from meals already recorded against this plan
        // (wizard-created meals carry template_slot; manual Add-Meal ones
        // don't and are intentionally excluded from wizard pick-tracking).
        const currentPlanMeals = allPlannedMeals.filter(
          (m) => m.weekly_plan === plan.id
        );
        const initialPicks: PicksBySlot = new Map();
        currentPlanMeals.forEach((m) => {
          if (!m.template_slot) return;
          if (!initialPicks.has(m.template_slot)) {
            initialPicks.set(m.template_slot, new Map());
          }
          initialPicks.get(m.template_slot)!.set(m.recipe, m.id);
        });
        setPicks(initialPicks);

        // Staples pre-fill (D-02): only when this plan's staples slot has no
        // picks yet (don't clobber a partially-completed wizard session).
        const staplesSlot = templateSlots.find(
          (s) => s.prefill_from_last_week
        );
        const staplesAlreadyPicked =
          staplesSlot && (initialPicks.get(staplesSlot.id)?.size ?? 0) > 0;

        if (staplesSlot && !staplesAlreadyPicked && plan.start_date) {
          const previousPlan = allPlans
            .filter(
              (p) =>
                p.id !== plan.id &&
                p.start_date &&
                p.start_date < plan.start_date!
            )
            .reduce<WeeklyPlan | undefined>((max, p) => {
              if (!max) return p;
              return p.start_date! > max.start_date! ? p : max;
            }, undefined);

          if (previousPlan) {
            const prevMeals = allPlannedMeals.filter(
              (m) => m.weekly_plan === previousPlan.id
            );
            const exactMatches = prevMeals.filter(
              (m) => m.template_slot === staplesSlot.id
            );
            let candidateRecipeIds: string[];
            if (exactMatches.length > 0) {
              candidateRecipeIds = exactMatches.map((m) => m.recipe);
            } else {
              const poolTagIds = new Set(staplesSlot.pool_tags);
              candidateRecipeIds = prevMeals
                .filter((m) =>
                  (rtMap.get(m.recipe) || []).some((t) => poolTagIds.has(t))
                )
                .map((m) => m.recipe);
            }
            const uniqueIds = Array.from(new Set(candidateRecipeIds));
            uniqueIds.sort((a, b) => {
              const na = recipesData.find((r) => r.id === a)?.name || "";
              const nb = recipesData.find((r) => r.id === b)?.name || "";
              return na.localeCompare(nb);
            });
            const toPreFill = uniqueIds.slice(0, staplesSlot.count);

            // Write pre-fill picks the same way a manual tap would.
            await Promise.all(
              toPreFill.map(async (recipeId) => {
                try {
                  const createdMeal = await create(
                    collections.plannedMeals,
                    {
                      weekly_plan: plan.id,
                      recipe: recipeId,
                      meal_slot: staplesSlot.meal_slot,
                      day: staplesSlot.day ?? null,
                      quantity: 1,
                      template_slot: staplesSlot.id,
                    }
                  );
                  if (cancelled) return;
                  setPicks((prev) => {
                    const next = new Map(prev);
                    const slotMap = new Map(next.get(staplesSlot.id) || []);
                    slotMap.set(recipeId, createdMeal.id);
                    next.set(staplesSlot.id, slotMap);
                    return next;
                  });
                } catch (err) {
                  console.error("Staples pre-fill write failed:", err);
                }
              })
            );
          }
        }

        // Staples is always accordion #1, always pre-expanded on open,
        // regardless of scroll/auto-advance state elsewhere.
        setExpandedSlotId(staplesSlot?.id ?? templateSlots[0]?.id ?? null);
        setHasStarted(templateSlots.length > 0);
      } catch (err) {
        if (!cancelled) {
          setLoadError("Failed to load the guided-fill wizard.");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan.id]);

  // Auto-advance non-staples slots once their pick count reaches target.
  // Staples only advances via the explicit "Confirm Staples" action.
  useEffect(() => {
    if (!expandedSlotId) return;
    const slot = slots.find((s) => s.id === expandedSlotId);
    if (!slot || slot.prefill_from_last_week) return;
    const count = picks.get(slot.id)?.size ?? 0;
    if (slot.count > 0 && count >= slot.count) {
      advanceToNext(slot.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks]);

  function advanceToNext(currentSlotId: string) {
    const idx = slots.findIndex((s) => s.id === currentSlotId);
    const next = slots[idx + 1];
    setExpandedSlotId(next ? next.id : null);
  }

  function pendingKey(slotId: string, recipeId: string) {
    return `${slotId}|${recipeId}`;
  }

  function setSlotError(slotId: string, message: string) {
    setSlotErrors((prev) => new Map(prev).set(slotId, message));
  }

  function clearSlotError(slotId: string) {
    setSlotErrors((prev) => {
      if (!prev.has(slotId)) return prev;
      const next = new Map(prev);
      next.delete(slotId);
      return next;
    });
  }

  async function addPick(slot: TemplateSlot, recipeId: string) {
    const key = pendingKey(slot.id, recipeId);
    setPendingKeys((prev) => new Set(prev).add(key));
    clearSlotError(slot.id);
    try {
      const createdMeal = await create(
        collections.plannedMeals,
        {
          weekly_plan: plan.id,
          recipe: recipeId,
          meal_slot: slot.meal_slot, // required — always set, from the slot
          day: slot.day ?? null, // optional — week-spanning slots stay null
          quantity: 1,
          template_slot: slot.id,
        }
      );
      setPicks((prev) => {
        const next = new Map(prev);
        const slotMap = new Map(next.get(slot.id) || []);
        slotMap.set(recipeId, createdMeal.id);
        next.set(slot.id, slotMap);
        return next;
      });
    } catch (err) {
      console.error("Wizard pick write failed:", err);
      setSlotError(slot.id, PICK_ERROR_MESSAGE);
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function removePick(
    slot: TemplateSlot,
    recipeId: string,
    mealId: string
  ) {
    const key = pendingKey(slot.id, recipeId);
    setPendingKeys((prev) => new Set(prev).add(key));
    clearSlotError(slot.id);
    try {
      await remove(collections.plannedMeals, mealId);
      setPicks((prev) => {
        const next = new Map(prev);
        const slotMap = new Map(next.get(slot.id) || []);
        slotMap.delete(recipeId);
        next.set(slot.id, slotMap);
        return next;
      });
    } catch (err) {
      console.error("Wizard pick delete failed:", err);
      // Write failed — chip stays/reverts to its picked state (map unchanged).
      setSlotError(slot.id, PICK_ERROR_MESSAGE);
    } finally {
      setPendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function togglePick(slot: TemplateSlot, recipeId: string) {
    const key = pendingKey(slot.id, recipeId);
    if (pendingKeys.has(key)) return;
    const mealId = picks.get(slot.id)?.get(recipeId);
    if (mealId) {
      removePick(slot, recipeId, mealId);
    } else {
      addPick(slot, recipeId);
    }
  }

  function getChipColor(slot: TemplateSlot, recipeId: string): string {
    const tagIds = recipeTagsMap.get(recipeId) || [];
    const poolTagSet = new Set(slot.pool_tags);
    const matchedTagId = tagIds.find((t) => poolTagSet.has(t));
    const tagColor = matchedTagId ? tagsById.get(matchedTagId)?.color : undefined;
    return tagColor || SLOT_COLORS[slot.meal_slot];
  }

  async function handleOffPoolSelect(slot: TemplateSlot, recipe: Recipe | null) {
    if (!recipe) return;
    setOffPoolSelections((prev) => new Map(prev).set(slot.id, null));
    if (picks.get(slot.id)?.has(recipe.id)) return; // already picked
    await addPick(slot, recipe.id);
  }

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <Box>
          <Typography variant="h6">Fill Week</Typography>
          {formatWeekOf(plan.start_date) && (
            <Typography variant="body2" color="text.secondary">
              {formatWeekOf(plan.start_date)}
            </Typography>
          )}
        </Box>
        <IconButton onClick={handleClose} sx={{ minHeight: 44, minWidth: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : loadError ? (
          <Alert severity="error">{loadError}</Alert>
        ) : !template ? (
          <Box textAlign="center" py={4}>
            <Typography variant="h6" gutterBottom>
              No week template yet.
            </Typography>
            <Typography color="text.secondary">
              The household week template hasn't been set up on this database
              yet. Run the seed script, then reopen this wizard.
            </Typography>
          </Box>
        ) : slots.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="text.secondary">
              This template has no slots configured yet.
            </Typography>
          </Box>
        ) : (
          <Box>
            {slots.map((slot) => {
              const isActive = expandedSlotId === slot.id;
              const pickedCount = picks.get(slot.id)?.size ?? 0;
              const isFull = slot.count > 0 && pickedCount >= slot.count;
              const isStaples = !!slot.prefill_from_last_week;
              const pool = orderPoolByLRU(
                poolForSlot(slot, recipes, recipeTagsMap),
                lastPlanned
              );
              const slotError = slotErrors.get(slot.id);
              const poolTagNames = slot.pool_tags
                .map((id) => tagsById.get(id)?.name)
                .filter(Boolean)
                .join(" or ");

              return (
                <Accordion
                  key={slot.id}
                  expanded={isActive}
                  onChange={() =>
                    setExpandedSlotId((prev) => (prev === slot.id ? null : slot.id))
                  }
                  sx={{
                    mb: 1,
                    ...(isActive
                      ? { borderLeft: 4, borderColor: "primary.main" }
                      : {}),
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      minHeight: 44,
                      backgroundColor: isActive ? "#ffffff" : "#fafafa",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        mr: 1,
                      }}
                    >
                      <Typography variant={isActive ? "h6" : "body1"}>
                        {slot.label}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {isFull && (
                          <CheckCircleIcon
                            sx={{ color: "primary.main", fontSize: 16 }}
                          />
                        )}
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${pickedCount} of ${slot.count} picked`}
                          sx={{ color: "text.secondary", borderColor: "text.secondary" }}
                        />
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {slotError && (
                      <Alert
                        severity="error"
                        sx={{ mb: 1.5 }}
                        onClose={() => clearSlotError(slot.id)}
                      >
                        {slotError}
                      </Alert>
                    )}

                    {pool.length === 0 ? (
                      <Box mb={1.5}>
                        <Typography variant="subtitle2" gutterBottom>
                          No recipes tagged for this slot yet.
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Tag a recipe with '{poolTagNames || "this slot's tag"}
                          ' in the recipe editor, or add one directly below.
                        </Typography>
                      </Box>
                    ) : (
                      <Box
                        sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1.5 }}
                      >
                        {pool.map((recipe) => {
                          const isPicked = picks.get(slot.id)?.has(recipe.id) ?? false;
                          const isPending = pendingKeys.has(
                            pendingKey(slot.id, recipe.id)
                          );
                          const chipColor = getChipColor(slot, recipe.id);
                          return (
                            <Chip
                              key={recipe.id}
                              label={recipe.name}
                              onClick={() => togglePick(slot, recipe.id)}
                              variant={isPicked ? "filled" : "outlined"}
                              disabled={isPending}
                              sx={{
                                fontSize: "0.875rem",
                                height: 40,
                                px: 1.5,
                                opacity: isPending ? 0.6 : 1,
                                backgroundColor: isPicked ? chipColor : undefined,
                                color: isPicked ? "white" : "text.primary",
                                borderColor: isPicked ? chipColor : chipColor,
                              }}
                            />
                          );
                        })}
                      </Box>
                    )}

                    <Autocomplete
                      options={recipes}
                      value={offPoolSelections.get(slot.id) || null}
                      onChange={(_, newValue) => handleOffPoolSelect(slot, newValue)}
                      getOptionLabel={(option) => option.name}
                      sx={{ mb: 1.5, maxWidth: 400 }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="+ Add other recipe"
                          margin="dense"
                          size="small"
                        />
                      )}
                    />

                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      {isStaples ? (
                        <Button
                          variant="contained"
                          color="primary"
                          sx={{ minHeight: 44 }}
                          onClick={() => advanceToNext(slot.id)}
                        >
                          Confirm Staples
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          sx={{ minHeight: 44 }}
                          onClick={() => advanceToNext(slot.id)}
                        >
                          {pickedCount > 0 ? "Next slot" : "Skip this slot"}
                        </Button>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              );
            })}

            {hasStarted && expandedSlotId === null && (
              <Box textAlign="center" py={3}>
                <Typography variant="h6" gutterBottom>
                  All slots handled.
                </Typography>
                <Typography color="text.secondary" gutterBottom>
                  Close the wizard to see your week.
                </Typography>
                <Button variant="contained" onClick={handleClose} sx={{ mt: 1 }}>
                  Done
                </Button>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
