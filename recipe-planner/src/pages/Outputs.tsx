import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Divider,
  Chip,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ShoppingCart as ShoppingIcon,
  Kitchen as PrepIcon,
  KitchenOutlined as FridgeIcon,
  Restaurant as PullIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { getAll, collections } from '../lib/api';
import {
  buildShoppingList,
  groupShoppingList,
  buildBatchPrepList,
  buildStoredItemsList,
  buildPullLists,
  type RecipeGraphData,
  type PlannedMealWithRecipe,
} from '../lib/aggregation';
import type {
  WeeklyPlan,
  PlannedMeal,
  Recipe,
  Product,
  RecipeProductNode,
  RecipeStep,
  ProductToStepEdge,
  StepToProductEdge,
  MealSlot,
  Day,
} from '../lib/types';

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

export default function Outputs() {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Loaded data
  const [plannedMeals, setPlannedMeals] = useState<PlannedMealWithRecipe[]>([]);
  const [recipeData, setRecipeData] = useState<Map<string, RecipeGraphData>>(new Map());

  // Checkbox states
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Load plans on mount
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const plansData = await getAll<WeeklyPlan>(collections.weeklyPlans);
        setPlans(plansData);
        if (plansData.length > 0) {
          setSelectedPlanId(plansData[0].id);
        }
      } catch (err) {
        setError('Failed to load plans');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, []);

  // Load plan data when selection changes
  useEffect(() => {
    if (!selectedPlanId) return;

    const loadPlanData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        // Load planned meals with recipe expansion
        const meals = await getAll<PlannedMealWithRecipe>(collections.plannedMeals, {
          filter: `weekly_plan="${selectedPlanId}"`,
          expand: 'recipe',
        });
        setPlannedMeals(meals);

        console.log('=== Loaded Planned Meals ===');
        console.log(meals);

        // Get unique recipe IDs
        const recipeIds = [...new Set(meals.map(m => m.recipe))];
        console.log('Recipe IDs:', recipeIds);

        // Load full graph data for each recipe
        const recipeDataMap = new Map<string, RecipeGraphData>();

        for (const recipeId of recipeIds) {
          console.log(`\n=== Loading Recipe ${recipeId} ===`);

          // Load product nodes with nested expansions
          const productNodes = await getAll<RecipeProductNode>(collections.recipeProductNodes, {
            filter: `recipe="${recipeId}"`,
            expand: 'product, product.container_type, product.store, product.section',
          });

          const steps = await getAll<RecipeStep>(collections.recipeSteps, {
            filter: `recipe="${recipeId}"`,
          });
          console.log('Steps:', steps);

          const ptsEdges = await getAll<ProductToStepEdge>(collections.productToStepEdges, {
            filter: `recipe="${recipeId}"`,
          });
          console.log('Product→Step edges:', ptsEdges);

          const stpEdges = await getAll<StepToProductEdge>(collections.stepToProductEdges, {
            filter: `recipe="${recipeId}"`,
          });
          console.log('Step→Product edges:', stpEdges);

          const recipe = meals.find(m => m.recipe === recipeId)?.expand?.recipe;
          if (recipe) {
            recipeDataMap.set(recipeId, {
              recipe,
              productNodes: productNodes,
              steps,
              productToStepEdges: ptsEdges,
              stepToProductEdges: stpEdges,
            });
          }
        }

        setRecipeData(recipeDataMap);
        console.log('\n=== Final Recipe Data Map ===');
        console.log(recipeDataMap);
      } catch (err) {
        setError('Failed to load plan data');
        console.error(err);
      } finally {
        setLoadingData(false);
      }
    };

    loadPlanData();
  }, [selectedPlanId]);

  // Compute aggregated data using the aggregation module
  const shoppingList = useMemo(() => buildShoppingList(plannedMeals, recipeData), [plannedMeals, recipeData]);
  const groupedShoppingList = useMemo(() => groupShoppingList(shoppingList), [shoppingList]);
  const batchPrepSteps = useMemo(() => buildBatchPrepList(plannedMeals, recipeData), [plannedMeals, recipeData]);
  const storedItems = useMemo(() => buildStoredItemsList(plannedMeals, recipeData), [plannedMeals, recipeData]);
  const pullLists = useMemo(() => buildPullLists(plannedMeals, recipeData), [plannedMeals, recipeData]);

  const toggleChecked = (key: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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
            Outputs
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            Generated shopping lists, prep lists, and calendars
          </Typography>
        </Box>

        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel>Weekly Plan</InputLabel>
          <Select
            value={selectedPlanId}
            label="Weekly Plan"
            onChange={(e) => setSelectedPlanId(e.target.value)}
          >
            {plans.map(plan => (
              <MenuItem key={plan.id} value={plan.id}>
                {plan.name || 'Unnamed Plan'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!selectedPlanId ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Select a weekly plan to generate outputs
          </Typography>
        </Paper>
      ) : loadingData ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper sx={{ mb: 2 }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
              <Tab icon={<ShoppingIcon />} label="Shopping List" />
              <Tab icon={<PrepIcon />} label="Batch Prep" />
              <Tab icon={<FridgeIcon />} label="Fridge/Freezer" />
              <Tab icon={<PullIcon />} label="Pull Lists" />
              <Tab icon={<CalendarIcon />} label="Weekly View" />
            </Tabs>
          </Paper>

          {/* Shopping List Tab */}
          {activeTab === 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Shopping List</Typography>
              
              {shoppingList.length === 0 ? (
                <Typography color="text.secondary">
                  No items to shop for. Make sure your recipes have raw product nodes connected to steps.
                </Typography>
              ) : (
                <>
                  {Array.from(groupedShoppingList.byStore.entries()).map(([storeName, sections]) => (
                    <Box key={storeName} mb={3}>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                        {storeName}
                      </Typography>
                      {Array.from(sections.entries()).map(([sectionName, items]) => (
                        <Box key={sectionName} ml={2} mb={2}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {sectionName}
                          </Typography>
                          <List dense>
                            {items.map(item => {
                              const key = `shop-${item.productId}`;
                              return (
                                <ListItem key={item.productId} disablePadding>
                                  <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Checkbox
                                      edge="start"
                                      checked={checkedItems.has(key)}
                                      onChange={() => toggleChecked(key)}
                                      size="small"
                                    />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={
                                      <span style={{ textDecoration: checkedItems.has(key) ? 'line-through' : 'none' }}>
                                        {item.productName} — {item.totalQuantity} {item.unit}
                                      </span>
                                    }
                                    secondary={item.sources.map(s => s.recipeName).join(', ')}
                                  />
                                </ListItem>
                              );
                            })}
                          </List>
                        </Box>
                      ))}
                    </Box>
                  ))}

                  {groupedShoppingList.pantryItems.length > 0 && (
                    <Box>
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                        Pantry Check
                      </Typography>
                      <List dense>
                        {groupedShoppingList.pantryItems.map(item => {
                          const key = `pantry-${item.productId}`;
                          return (
                            <ListItem key={item.productId} disablePadding>
                              <ListItemIcon sx={{ minWidth: 36 }}>
                                <Checkbox
                                  edge="start"
                                  checked={checkedItems.has(key)}
                                  onChange={() => toggleChecked(key)}
                                  size="small"
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={
                                  <span style={{ textDecoration: checkedItems.has(key) ? 'line-through' : 'none' }}>
                                    {item.productName}
                                  </span>
                                }
                              />
                            </ListItem>
                          );
                        })}
                      </List>
                    </Box>
                  )}
                </>
              )}
            </Paper>
          )}

          {/* Batch Prep Tab */}
          {activeTab === 1 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Batch Prep List</Typography>
              
              {batchPrepSteps.length === 0 ? (
                <Typography color="text.secondary">
                  No prep steps. Make sure your recipes have prep or batch assembly steps.
                </Typography>
              ) : (
                <List>
                  {batchPrepSteps.map((step, idx) => {
                    const key = `prep-${step.stepId}`;
                    return (
                      <ListItem key={step.stepId} disablePadding sx={{ mb: 2, display: 'block' }}>
                        <Box display="flex" alignItems="flex-start">
                          <Checkbox
                            checked={checkedItems.has(key)}
                            onChange={() => toggleChecked(key)}
                            sx={{ mt: -0.5 }}
                          />
                          <Box flex={1}>
                            <Typography
                              fontWeight="medium"
                              sx={{ textDecoration: checkedItems.has(key) ? 'line-through' : 'none' }}
                            >
                              {step.name}
                              <Chip
                                label={step.stepType}
                                size="small"
                                sx={{ ml: 1 }}
                                color={step.stepType === 'prep' ? 'secondary' : 'error'}
                              />
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Inputs: {step.inputs.length > 0 
                                ? step.inputs.map(i => `${i.productName}${i.quantity ? ` (${i.quantity} ${i.unit})` : ''}`).join(', ')
                                : 'None'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Outputs: {step.outputs.length > 0
                                ? step.outputs.map(o => `${o.productName}${o.quantity ? ` (${o.quantity} ${o.unit})` : ''}${o.mealDestination ? ` → ${o.mealDestination}` : ''}`).join(', ')
                                : 'None'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              From: {step.recipeName}
                            </Typography>
                          </Box>
                        </Box>
                        {idx < batchPrepSteps.length - 1 && <Divider sx={{ mt: 2 }} />}
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </Paper>
          )}

          {/* Fridge/Freezer Tab */}
          {activeTab === 2 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Fridge/Freezer Contents After Prep</Typography>
              
              {storedItems.length === 0 ? (
                <Typography color="text.secondary">
                  No stored items. Make sure your recipes have stored product nodes as outputs from steps.
                </Typography>
              ) : (
                <>
                  {(['fridge', 'freezer'] as const).map(location => {
                    const items = storedItems.filter(i => i.storageLocation === location);
                    if (items.length === 0) return null;
                    
                    return (
                      <Box key={location} mb={3}>
                        <Typography variant="subtitle1" fontWeight="bold" textTransform="uppercase" gutterBottom>
                          {location}
                        </Typography>
                        <List dense>
                          {items.map((item, idx) => {
                            const key = `stored-${location}-${idx}`;
                            return (
                              <ListItem key={idx} disablePadding>
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                  <Checkbox
                                    edge="start"
                                    checked={checkedItems.has(key)}
                                    onChange={() => toggleChecked(key)}
                                    size="small"
                                  />
                                </ListItemIcon>
                                <ListItemText
                                  primary={
                                    <span style={{ textDecoration: checkedItems.has(key) ? 'line-through' : 'none' }}>
                                      {item.productName}
                                      {item.quantity && ` — ${item.quantity} ${item.unit}`}
                                    </span>
                                  }
                                  secondary={
                                    <>
                                      {item.containerTypeName && `Container: ${item.containerTypeName}`}
                                      {item.containerTypeName && item.mealDestination && ' • '}
                                      {item.mealDestination && `For: ${item.mealDestination}`}
                                      {(item.containerTypeName || item.mealDestination) && ' • '}
                                      From: {item.recipeName}
                                    </>
                                  }
                                />
                              </ListItem>
                            );
                          })}
                        </List>
                      </Box>
                    );
                  })}
                </>
              )}
            </Paper>
          )}

          {/* Pull Lists Tab */}
          {activeTab === 3 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Just-in-Time Pull Lists</Typography>
              
              {pullLists.length === 0 ? (
                <Typography color="text.secondary">
                  No just-in-time meals. Make sure your recipes have assembly steps with timing set to "just_in_time".
                </Typography>
              ) : (
                pullLists.map((pullList, idx) => {
                  const dayLabel = DAYS.find(d => d.value === pullList.day)?.label || pullList.day;
                  const slotLabel = MEAL_SLOTS.find(s => s.value === pullList.slot)?.label || pullList.slot;
                  
                  return (
                    <Card key={idx} variant="outlined" sx={{ mb: 2 }}>
                      <CardContent>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Chip
                            label={slotLabel}
                            size="small"
                            sx={{ backgroundColor: SLOT_COLORS[pullList.slot], color: 'white' }}
                          />
                          <Typography variant="subtitle1" fontWeight="bold">
                            {dayLabel}: {pullList.recipeName}
                          </Typography>
                        </Box>
                        
                        {(['fridge', 'freezer', 'pantry'] as const).map(storage => {
                          const items = pullList.items.filter(i => i.fromStorage === storage);
                          if (items.length === 0) return null;
                          
                          return (
                            <Box key={storage} ml={1} mb={1}>
                              <Typography variant="caption" color="text.secondary" textTransform="uppercase">
                                From {storage}:
                              </Typography>
                              <List dense disablePadding>
                                {items.map((item, itemIdx) => {
                                  const key = `pull-${idx}-${storage}-${itemIdx}`;
                                  return (
                                    <ListItem key={itemIdx} disablePadding>
                                      <ListItemIcon sx={{ minWidth: 32 }}>
                                        <Checkbox
                                          edge="start"
                                          checked={checkedItems.has(key)}
                                          onChange={() => toggleChecked(key)}
                                          size="small"
                                        />
                                      </ListItemIcon>
                                      <ListItemText
                                        primary={
                                          <Typography
                                            variant="body2"
                                            sx={{ textDecoration: checkedItems.has(key) ? 'line-through' : 'none' }}
                                          >
                                            {item.productName}
                                            {item.quantity && ` — ${item.quantity} ${item.unit}`}
                                            {item.containerTypeName && ` (${item.containerTypeName})`}
                                          </Typography>
                                        }
                                      />
                                    </ListItem>
                                  );
                                })}
                              </List>
                            </Box>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </Paper>
          )}

          {/* Weekly View Tab */}
          {activeTab === 4 && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Weekly Calendar</Typography>
              
              {/* Week-spanning meals */}
              {plannedMeals.filter(m => !m.day).length > 0 && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Week-spanning (grab anytime)
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {plannedMeals.filter(m => !m.day).map(meal => (
                      <Chip
                        key={meal.id}
                        label={`${meal.expand?.recipe?.name || 'Unknown'} (${meal.meal_slot})`}
                        sx={{
                          backgroundColor: SLOT_COLORS[meal.meal_slot],
                          color: 'white',
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Slot</TableCell>
                      {DAYS.map(day => (
                        <TableCell key={day.value} align="center" sx={{ fontWeight: 'bold' }}>
                          {day.label.slice(0, 3)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {MEAL_SLOTS.map(slot => (
                      <TableRow key={slot.value}>
                        <TableCell>
                          <Chip
                            label={slot.label}
                            size="small"
                            sx={{ backgroundColor: SLOT_COLORS[slot.value], color: 'white' }}
                          />
                        </TableCell>
                        {DAYS.map(day => {
                          const meals = plannedMeals.filter(
                            m => m.day === day.value && m.meal_slot === slot.value
                          );
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
                              {meals.map(meal => (
                                <Box
                                  key={meal.id}
                                  sx={{
                                    fontSize: '0.75rem',
                                    p: 0.5,
                                    mb: 0.5,
                                    backgroundColor: SLOT_COLORS[slot.value],
                                    color: 'white',
                                    borderRadius: 0.5,
                                  }}
                                >
                                  <Typography variant="caption" sx={{ color: 'inherit' }}>
                                    {meal.expand?.recipe?.name || '?'}
                                    {meal.quantity && meal.quantity > 1 && ` (×${meal.quantity})`}
                                  </Typography>
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
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}