import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Checklist as ChecklistIcon,
} from "@mui/icons-material";
import { getAll, create, update, remove, collections } from "../../lib/api";
import type {
  Product,
  ProductType,
  Store,
  Section,
  ContainerType,
  Recipe,
  RecipeProductNode,
} from "../../lib/types";
import ProductForm, { useProductForm } from "../../components/ProductForm";
import { runLint, type LintFinding } from "../../lib/linter";
import { searchProducts } from "../../lib/search/product-search";

interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
  };
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  raw: "Raw Ingredient",
  transient: "Transient",
  stored: "Stored",
  inventory: "Inventory",
};

const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  raw: "#4caf50",
  transient: "#ff9800",
  stored: "#2196f3",
  inventory: "#9c27b0",
};

export default function Products() {
  const [items, setItems] = useState<ProductExpanded[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Lookup data for dropdowns
  const [stores, setStores] = useState<Store[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductExpanded | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const productForm = useProductForm();

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ProductExpanded | null>(
    null
  );

  // Lint findings
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [linting, setLinting] = useState(false);
  const [lintDialogOpen, setLintDialogOpen] = useState(false);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    return searchProducts(searchQuery, items);
  }, [items, searchQuery]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await getAll<ProductExpanded>(collections.products, {
        sort: "name",
        expand: "store,section,container_type",
      });
      setItems(records);
    } catch (err) {
      setError("Failed to load products");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLookupData = async () => {
    try {
      const [storesData, sectionsData, containerTypesData, recipesData] =
        await Promise.all([
          getAll<Store>(collections.stores, { sort: "name" }),
          getAll<Section>(collections.sections, { sort: "name" }),
          getAll<ContainerType>(collections.containerTypes, { sort: "name" }),
          getAll<Recipe>(collections.recipes, { sort: "name" }),
        ]);
      setStores(storesData);
      setSections(sectionsData);
      setContainerTypes(containerTypesData);
      setRecipes(recipesData);
    } catch (err) {
      console.error("Failed to load lookup data:", err);
    }
  };

  useEffect(() => {
    loadItems();
    loadLookupData();
  }, []);

  const handleRunLint = async () => {
    try {
      setLinting(true);
      setError(null);
      // The cross-dimension rule needs each product's recipe_product_nodes
      // unit values, and mixed-denomination needs their quantities, which
      // loadItems' product-only expand doesn't carry — fetch them separately
      // and group by product id. This fetch is registry-wide (no filter),
      // which is what makes mixed-denomination meaningful here: it compares
      // denominations across recipes.
      const nodes = await getAll<RecipeProductNode>(
        collections.recipeProductNodes
      );
      const nodesByProduct = new Map<
        string,
        { unit?: string; quantity?: number }[]
      >();
      for (const node of nodes) {
        if (!node.product) continue;
        const list = nodesByProduct.get(node.product) ?? [];
        list.push({ unit: node.unit, quantity: node.quantity });
        nodesByProduct.set(node.product, list);
      }
      const enriched = items.map((item) => ({
        ...item,
        nodes: nodesByProduct.get(item.id) ?? [],
      }));
      setFindings(runLint(enriched));
      setLintDialogOpen(true);
    } catch (err) {
      setError("Failed to run linter");
      console.error(err);
    } finally {
      setLinting(false);
    }
  };

  const handleOpenDialog = (item?: ProductExpanded) => {
    if (item) {
      setEditingItem(item);
      productForm.setName(item.name);
      productForm.setType(item.type);
      productForm.setPantry(item.pantry || false);
      productForm.setTrackQuantity(item.track_quantity || false);
      productForm.setStoreId(item.store || "");
      productForm.setSectionId(item.section || "");
      productForm.setStorageLocation(item.storage_location || "");
      productForm.setContainerTypeId(item.container_type || "");
      productForm.setReadyToEat(item.ready_to_eat || false);
      productForm.setMealSlot(item.meal_slot || "");
      productForm.setSourceRecipeId(item.source_recipe || "");
      productForm.setStoreBoughtProductId(item.store_bought_product || "");
    } else {
      setEditingItem(null);
      productForm.resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    productForm.resetForm();
  };

  const handleSave = async () => {
    if (!productForm.isValid()) return;

    try {
      setSaving(true);
      const data = productForm.getProductData();

      if (editingItem) {
        await update(collections.products, editingItem.id, data);
      } else {
        await create(collections.products, data);
      }
      handleCloseDialog();
      loadItems();
    } catch (err) {
      setError("Failed to save product");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (item: ProductExpanded) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      await remove(collections.products, itemToDelete.id);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadItems();
    } catch (err) {
      setError("Failed to delete product");
      console.error(err);
    }
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
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Products
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            Manage products (raw ingredients, transient items, stored items)
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<ChecklistIcon />}
            onClick={handleRunLint}
            disabled={linting}
          >
            {linting ? "Linting..." : "Lint"}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Product
          </Button>
        </Box>
      </Box>

      {/* Search Field */}
      <Box mb={2}>
        <TextField
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ width: { xs: "100%", sm: 400 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => setSearchQuery("")}
                  edge="end"
                >
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Results Counter */}
      {searchQuery && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Showing {filteredItems.length} of {items.length} products
        </Typography>
      )}

      <TableContainer component={Paper}>
        {filteredItems.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography color="text.secondary">
              {searchQuery
                ? "No products match your search"
                : "No products yet. Add one to get started."}
            </Typography>
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Details</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={PRODUCT_TYPE_LABELS[item.type]}
                      size="small"
                      sx={{
                        backgroundColor: PRODUCT_TYPE_COLORS[item.type],
                        color: "white",
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {item.type === "raw" && (
                      <Box>
                        {item.pantry && (
                          <Chip label="Pantry" size="small" sx={{ mr: 1 }} />
                        )}
                        {item.track_quantity && (
                          <Chip
                            label="Track Qty"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ mr: 1 }}
                          />
                        )}
                        {item.expand?.store && (
                          <Typography
                            variant="body2"
                            component="span"
                            sx={{ mr: 1 }}
                          >
                            Store: {item.expand.store.name}
                          </Typography>
                        )}
                        {item.expand?.section && (
                          <Typography variant="body2" component="span">
                            Section: {item.expand.section.name}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {item.type === "stored" && (
                      <Box>
                        {item.storage_location && (
                          <Chip
                            label={item.storage_location}
                            size="small"
                            sx={{ mr: 1, textTransform: "capitalize" }}
                          />
                        )}
                        {item.expand?.container_type && (
                          <Typography variant="body2" component="span">
                            Container: {item.expand.container_type.name}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {item.type === "inventory" && (
                      <Box>
                        {item.ready_to_eat && (
                          <Chip
                            label={`Ready to Eat - ${
                              item.meal_slot || "unspecified"
                            }`}
                            size="small"
                            color="success"
                            sx={{ mr: 1, textTransform: "capitalize" }}
                          />
                        )}
                        {!item.ready_to_eat && (
                          <Chip
                            label="Ingredient Only"
                            size="small"
                            variant="outlined"
                            sx={{ mr: 1 }}
                          />
                        )}
                        {item.storage_location && (
                          <Typography variant="body2" component="span">
                            Storage: {item.storage_location}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {item.type === "transient" && (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={() => handleOpenDialog(item)}
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDeleteClick(item)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingItem ? "Edit Product" : "Add Product"}
        </DialogTitle>
        <DialogContent>
          <ProductForm
            stores={stores}
            sections={sections}
            containerTypes={containerTypes}
            form={productForm}
            existingProducts={items}
            editingProductId={editingItem?.id}
            recipes={recipes}
            products={items}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!productForm.isValid() || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Product?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{itemToDelete?.name}"? This action
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

      {/* Lint Findings Dialog */}
      <Dialog
        open={lintDialogOpen}
        onClose={() => setLintDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Lint Findings ({findings.length})
        </DialogTitle>
        <DialogContent>
          {findings.length === 0 ? (
            <Typography color="text.secondary">
              No issues found — all products are clean.
            </Typography>
          ) : (
            findings.map((finding, index) => {
              const product = items.find((i) => i.id === finding.productId);
              return (
                <Alert
                  key={`${finding.rule}-${finding.productId ?? index}`}
                  severity={finding.severity}
                  sx={{ mb: 1, cursor: product ? "pointer" : "default" }}
                  onClick={() => {
                    if (product) {
                      setLintDialogOpen(false);
                      handleOpenDialog(product);
                    }
                  }}
                >
                  <strong>{finding.rule}</strong>: {finding.message}
                </Alert>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLintDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
