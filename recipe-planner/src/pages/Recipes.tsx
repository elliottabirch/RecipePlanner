import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  IconButton,
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
  CardActions,
  Grid,
  Chip,
  InputAdornment,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Restaurant as RecipeIcon,
} from "@mui/icons-material";
import { getAll, create, remove, collections } from "../lib/api";
import type { Recipe, RecipeTag, Tag } from "../lib/types";
import FilterGroup from "../components/FilterGroup";
import type { FilterOption } from "../components/FilterGroup";
import type { FilterState } from "../components/FilterChip";

export default function Recipes() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Recipe[]>([]);
  const [recipeTags, setRecipeTags] = useState<Record<string, Tag[]>>({});
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter states
  const [filterStates, setFilterStates] = useState<Record<string, FilterState>>(
    {},
  );

  // New recipe dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Recipe | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);

      const [recipes, recipeTagsData, tags] = await Promise.all([
        getAll<Recipe>(collections.recipes, { sort: "name" }),
        getAll<RecipeTag>(collections.recipeTags, { expand: "tag" }),
        getAll<Tag>(collections.tags, { sort: "name" }),
      ]);

      setItems(recipes);
      setAllTags(tags);
      // Group tags by recipe
      const tagsByRecipe: Record<string, Tag[]> = {};
      recipeTagsData.forEach((rt) => {
        if (rt.expand?.tag) {
          if (!tagsByRecipe[rt.recipe]) {
            tagsByRecipe[rt.recipe] = [];
          }
          tagsByRecipe[rt.recipe].push(rt.expand.tag);
        }
      });
      setRecipeTags(tagsByRecipe);
    } catch (err) {
      setError("Failed to load recipes");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleCreateRecipe = async () => {
    if (!newName.trim()) return;

    try {
      setSaving(true);
      const recipe = await create<Recipe>(collections.recipes, {
        name: newName.trim(),
      });
      setDialogOpen(false);
      setNewName("");
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      setError("Failed to create recipe");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (item: Recipe) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      await remove(collections.recipes, itemToDelete.id);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadItems();
    } catch (err) {
      setError("Failed to delete recipe");
      console.error(err);
    }
  };

  const handleFilterChange = (id: string, state: FilterState) => {
    setFilterStates((prev) => ({
      ...prev,
      [id]: state,
    }));
  };

  // Filter options
  const recipeTypeOptions: FilterOption[] = [
    { id: "recipe_type_batch", label: "Batch", color: "#9c27b0" },
    { id: "recipe_type_meal", label: "Meal", color: "#f44336" },
  ];

  const userOptions: FilterOption[] = [
    { id: "user_micah", label: "Micah", color: "#ff9800" },
  ];

  const tagOptions: FilterOption[] = allTags.map((tag) => ({
    id: `tag_${tag.id}`,
    label: tag.name,
    color: tag.color || "#2196f3",
  }));

  const filteredItems = items.filter((item) => {
    // Search filter
    if (!item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Recipe Type filters
    const batchState = filterStates["recipe_type_batch"];
    const mealState = filterStates["recipe_type_meal"];
    if (batchState === "include" && item.recipe_type !== "batch_prep") {
      return false;
    }
    if (batchState === "exclude" && item.recipe_type === "batch_prep") {
      return false;
    }
    if (mealState === "include" && item.recipe_type !== "meal") {
      return false;
    }
    if (mealState === "exclude" && item.recipe_type === "meal") {
      return false;
    }

    // User filters (based on tags)
    const itemTags = recipeTags[item.id] || [];
    const micahState = filterStates["user_micah"];
    const adultsState = filterStates["user_adults"];

    const hasMicahTag = itemTags.some(
      (tag) => tag.name.toLowerCase() === "micah meal",
    );
    const hasAdultsTag = itemTags.some(
      (tag) => tag.name.toLowerCase() === "adults",
    );

    if (micahState === "include" && !hasMicahTag) {
      return false;
    }
    if (micahState === "exclude" && hasMicahTag) {
      return false;
    }
    if (adultsState === "include" && !hasAdultsTag) {
      return false;
    }
    if (adultsState === "exclude" && hasAdultsTag) {
      return false;
    }

    // Tag filters
    for (const tag of allTags) {
      const tagState = filterStates[`tag_${tag.id}`];
      const hasTag = itemTags.some((t) => t.id === tag.id);

      if (tagState === "include" && !hasTag) {
        return false;
      }
      if (tagState === "exclude" && hasTag) {
        return false;
      }
    }

    return true;
  });

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Recipes
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            Manage your recipes with visual graph editor
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          New Recipe
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TextField
        fullWidth
        placeholder="Search recipes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {/* Filters */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          backgroundColor: "background.default",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 3,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <FilterGroup
            title="Recipe Type"
            options={recipeTypeOptions}
            filterStates={filterStates}
            onFilterChange={handleFilterChange}
          />
          <Divider orientation="vertical" flexItem />
          <FilterGroup
            title="User"
            options={userOptions}
            filterStates={filterStates}
            onFilterChange={handleFilterChange}
          />
          {tagOptions.length > 0 && (
            <>
              <Divider orientation="vertical" flexItem />
              <FilterGroup
                title="Tags"
                options={tagOptions}
                filterStates={filterStates}
                onFilterChange={handleFilterChange}
              />
            </>
          )}
        </Box>
      </Paper>

      {filteredItems.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <RecipeIcon sx={{ fontSize: 64, color: "text.secondary", mb: 2 }} />
          <Typography color="text.secondary">
            {searchQuery
              ? "No recipes match your search"
              : "No recipes yet. Create one to get started."}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {filteredItems.map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item.id}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {item.name}
                  </Typography>
                  {item.notes && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {item.notes}
                    </Typography>
                  )}
                  {recipeTags[item.id] && recipeTags[item.id].length > 0 && (
                    <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                      {recipeTags[item.id].map((tag) => (
                        <Chip
                          key={tag.id}
                          label={tag.name}
                          size="small"
                          sx={{
                            backgroundColor: tag.color || "#2196f3",
                            color: "white",
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/recipes/${item.id}`)}
                  >
                    Edit
                  </Button>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteClick(item)}
                    sx={{ ml: "auto" }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* New Recipe Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>New Recipe</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Recipe Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                handleCreateRecipe();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateRecipe}
            variant="contained"
            disabled={!newName.trim() || saving}
          >
            {saving ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Recipe?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{itemToDelete?.name}"? This will
            also delete all associated steps and product nodes. This action
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
