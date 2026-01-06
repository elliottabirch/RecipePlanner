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
} from "@mui/icons-material";
import { getAll, create, update, remove, collections } from "../../lib/api";
import type {
  Product,
  ProductType,
  Store,
  Section,
  ContainerType,
} from "../../lib/types";
import ProductForm, { useProductForm } from "../../components/ProductForm";

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

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(query));
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
      const [storesData, sectionsData, containerTypesData] = await Promise.all([
        getAll<Store>(collections.stores, { sort: "name" }),
        getAll<Section>(collections.sections, { sort: "name" }),
        getAll<ContainerType>(collections.containerTypes, { sort: "name" }),
      ]);
      setStores(storesData);
      setSections(sectionsData);
      setContainerTypes(containerTypesData);
    } catch (err) {
      console.error("Failed to load lookup data:", err);
    }
  };

  useEffect(() => {
    loadItems();
    loadLookupData();
  }, []);

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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Product
        </Button>
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
    </Box>
  );
}
