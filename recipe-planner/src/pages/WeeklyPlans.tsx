import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Autocomplete,
  List,
  ListItemButton,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { getAll, create, update, remove, collections } from '../lib/api';
import type { WeeklyPlan, PlannedMeal, Recipe, MealSlot, Day } from '../lib/types';

interface PlannedMealExpanded extends PlannedMeal {
  expand?: {
    recipe?: Recipe;
  };
}

const DAYS: { value: Day; label: string }[] = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
];

const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

const SLOT_COLORS: Record<MealSlot, string> = {
  breakfast: '#ff9800',
  lunch: '#4caf50',
  dinner: '#2196f3',
  snack: '#9c27b0',
};

export default function WeeklyPlans() {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<WeeklyPlan | null>(null);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMealExpanded[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New plan dialog
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WeeklyPlan | null>(null);
  const [planName, setPlanName] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Add meal dialog
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>('dinner');
  const [selectedDay, setSelectedDay] = useState<Day | ''>('');
  const [mealQuantity, setMealQuantity] = useState<number | ''>(1);
  const [savingMeal, setSavingMeal] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'plan' | 'meal'; item: WeeklyPlan | PlannedMealExpanded } | null>(null);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const [plansData, recipesData] = await Promise.all([
        getAll<WeeklyPlan>(collections.weeklyPlans),
        getAll<Recipe>(collections.recipes, { sort: 'name' }),
      ]);
      setPlans(plansData);
      setRecipes(recipesData);
      
      // Auto-select first plan if none selected
      if (plansData.length > 0 && !selectedPlan) {
        setSelectedPlan(plansData[0]);
      }
    } catch (err) {
      setError('Failed to load plans');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadPlannedMeals = async () => {
    if (!selectedPlan) {
      setPlannedMeals([]);
      return;
    }

    try {
      const meals = await getAll<PlannedMealExpanded>(collections.plannedMeals, {
        filter: `weekly_plan="${selectedPlan.id}"`,
        expand: 'recipe',
      });
      setPlannedMeals(meals);
    } catch (err) {
      console.error('Failed to load planned meals:', err);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    loadPlannedMeals();
  }, [selectedPlan]);

  const handleOpenPlanDialog = (plan?: WeeklyPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanName(plan.name || '');
    } else {
      setEditingPlan(null);
      setPlanName('');
    }
    setPlanDialogOpen(true);
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) return;

    try {
      setSavingPlan(true);
      if (editingPlan) {
        const updated = await update<WeeklyPlan>(collections.weeklyPlans, editingPlan.id, {
          name: planName.trim(),
        });
        setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        if (selectedPlan?.id === updated.id) {
          setSelectedPlan(updated);
        }
      } else {
        const created = await create<WeeklyPlan>(collections.weeklyPlans, {
          name: planName.trim(),
        });
        setPlans((prev) => [created, ...prev]);
        setSelectedPlan(created);
      }
      setPlanDialogOpen(false);
      setPlanName('');
      setEditingPlan(null);
    } catch (err) {
      setError('Failed to save plan');
      console.error(err);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleOpenMealDialog = () => {
    setSelectedRecipe(null);
    setSelectedSlot('dinner');
    setSelectedDay('');
    setMealQuantity(1);
    setMealDialogOpen(true);
  };

  const handleSaveMeal = async () => {
    if (!selectedPlan || !selectedRecipe) return;

    try {
      setSavingMeal(true);
      await create(collections.plannedMeals, {
        weekly_plan: selectedPlan.id,
        recipe: selectedRecipe.id,
        meal_slot: selectedSlot,
        day: selectedDay || null,
        quantity: mealQuantity || 1,
      });
      setMealDialogOpen(false);
      loadPlannedMeals();
    } catch (err) {
      setError('Failed to add meal');
      console.error(err);
    } finally {
      setSavingMeal(false);
    }
  };

  const handleDeleteClick = (type: 'plan' | 'meal', item: WeeklyPlan | PlannedMealExpanded) => {
    setItemToDelete({ type, item });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'plan') {
        await remove(collections.weeklyPlans, itemToDelete.item.id);
        setPlans((prev) => prev.filter((p) => p.id !== itemToDelete.item.id));
        if (selectedPlan?.id === itemToDelete.item.id) {
          setSelectedPlan(plans.find((p) => p.id !== itemToDelete.item.id) || null);
        }
      } else {
        await remove(collections.plannedMeals, itemToDelete.item.id);
        loadPlannedMeals();
      }
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (err) {
      setError('Failed to delete');
      console.error(err);
    }
  };

  // Group meals by day and slot
  const getMealsForDaySlot = (day: Day | null, slot: MealSlot) => {
    return plannedMeals.filter((m) => m.day === day && m.meal_slot === slot);
  };

  const weekSpanningMeals = plannedMeals.filter((m) => !m.day);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Weekly Plans
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            Plan your meals for the week
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenPlanDialog()}
        >
          New Plan
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box display="flex" gap={2}>
        {/* Plan selector */}
        <Paper sx={{ p: 2, width: 280, flexShrink: 0 }}>
          <Typography variant="h6" gutterBottom>
            Plans
          </Typography>
          {plans.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No plans yet. Create one to get started.
            </Typography>
          ) : (
            <List dense>
              {plans.map((plan) => (
                <ListItemButton
                  key={plan.id}
                  selected={selectedPlan?.id === plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemText 
                    primary={plan.name || 'Unnamed Plan'} 
                    sx={{ mr: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPlanDialog(plan);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick('plan', plan);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>

        {/* Meal grid */}
        <Paper sx={{ p: 2, flexGrow: 1, overflow: 'auto' }}>
          {selectedPlan ? (
            <>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">{selectedPlan.name || 'Unnamed Plan'}</Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleOpenMealDialog}
                  disabled={recipes.length === 0}
                >
                  Add Meal
                </Button>
              </Box>

              {/* Week-spanning meals */}
              {weekSpanningMeals.length > 0 && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Week-spanning (grab anytime)
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {weekSpanningMeals.map((meal) => (
                      <Chip
                        key={meal.id}
                        label={`${meal.expand?.recipe?.name || 'Unknown'} (${meal.meal_slot})`}
                        onDelete={() => handleDeleteClick('meal', meal)}
                        sx={{
                          backgroundColor: SLOT_COLORS[meal.meal_slot],
                          color: 'white',
                          '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' },
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {/* Day grid as table */}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Slot</TableCell>
                      {DAYS.map((day) => (
                        <TableCell key={day.value} align="center" sx={{ fontWeight: 'bold' }}>
                          {day.label.slice(0, 3)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {MEAL_SLOTS.map((slot) => (
                      <TableRow key={slot.value}>
                        <TableCell>
                          <Chip
                            label={slot.label}
                            size="small"
                            sx={{
                              backgroundColor: SLOT_COLORS[slot.value],
                              color: 'white',
                            }}
                          />
                        </TableCell>
                        {DAYS.map((day) => {
                          const meals = getMealsForDaySlot(day.value, slot.value);
                          return (
                            <TableCell
                              key={day.value}
                              sx={{
                                verticalAlign: 'top',
                                backgroundColor: meals.length > 0 ? 'action.hover' : 'inherit',
                                minWidth: 100,
                                p: 0.5,
                              }}
                            >
                              {meals.map((meal) => (
                                <Box
                                  key={meal.id}
                                  sx={{
                                    fontSize: '0.75rem',
                                    p: 0.5,
                                    mb: 0.5,
                                    backgroundColor: SLOT_COLORS[slot.value],
                                    color: 'white',
                                    borderRadius: 0.5,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 0.5,
                                  }}
                                >
                                  <Typography variant="caption" sx={{ color: 'inherit', lineHeight: 1.2 }}>
                                    {meal.expand?.recipe?.name || '?'}
                                    {meal.quantity && meal.quantity > 1 && ` (×${meal.quantity})`}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteClick('meal', meal)}
                                    sx={{ p: 0, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}
                                  >
                                    <DeleteIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Box>
                              ))}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <Box textAlign="center" py={4}>
              <Typography color="text.secondary">
                Select or create a plan to start adding meals
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      {/* New/Edit Plan Dialog */}
      <Dialog open={planDialogOpen} onClose={() => setPlanDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingPlan ? 'Edit Plan' : 'New Plan'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Plan Name"
            fullWidth
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="e.g., Week of Jan 6"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && planName.trim()) {
                handleSavePlan();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSavePlan} variant="contained" disabled={!planName.trim() || savingPlan}>
            {savingPlan ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Meal Dialog */}
      <Dialog open={mealDialogOpen} onClose={() => setMealDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Meal</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={recipes}
            value={selectedRecipe}
            onChange={(_, newValue) => setSelectedRecipe(newValue)}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => (
              <TextField {...params} label="Recipe" margin="dense" fullWidth />
            )}
          />

          <FormControl fullWidth margin="dense">
            <InputLabel>Meal Slot</InputLabel>
            <Select
              value={selectedSlot}
              label="Meal Slot"
              onChange={(e) => setSelectedSlot(e.target.value as MealSlot)}
            >
              {MEAL_SLOTS.map((slot) => (
                <MenuItem key={slot.value} value={slot.value}>
                  {slot.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="dense">
            <InputLabel>Day (optional)</InputLabel>
            <Select
              value={selectedDay}
              label="Day (optional)"
              onChange={(e) => setSelectedDay(e.target.value as Day | '')}
            >
              <MenuItem value="">
                <em>Week-spanning (no specific day)</em>
              </MenuItem>
              {DAYS.map((day) => (
                <MenuItem key={day.value} value={day.value}>
                  {day.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Quantity"
            type="number"
            value={mealQuantity}
            onChange={(e) => setMealQuantity(e.target.value ? Number(e.target.value) : '')}
            fullWidth
            margin="dense"
            inputProps={{ min: 1 }}
            helperText="How many servings/portions"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMealDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveMeal} variant="contained" disabled={!selectedRecipe || savingMeal}>
            {savingMeal ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>
          Delete {itemToDelete?.type === 'plan' ? 'Plan' : 'Meal'}?
        </DialogTitle>
        <DialogContent>
          <Typography>
            {itemToDelete?.type === 'plan'
              ? `Are you sure you want to delete "${(itemToDelete.item as WeeklyPlan).name || 'Unnamed Plan'}"? This will also delete all planned meals in this plan.`
              : `Are you sure you want to remove this meal?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}