import { useState, useEffect } from "react";
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
  List,
  ListItem,
  ListItemText,
  Switch,
  TextField,
  Autocomplete,
  Chip,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { getAll, create, update, remove, collections } from "../lib/api";
import type { InventoryItemExpanded, Product } from "../lib/types";

export default function Inventory() {
  const [items, setItems] = useState<InventoryItemExpanded[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [notes, setNotes] = useState("");

  // Edit state
  const [editingItem, setEditingItem] = useState<InventoryItemExpanded | null>(
    null
  );
  const [editNotesDialogOpen, setEditNotesDialogOpen] = useState(false);
  const [editNotes, setEditNotes] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [inventoryData, productsData] = await Promise.all([
        getAll<InventoryItemExpanded>(collections.inventoryItems, {
          expand: "product",
          sort: "-in_stock,product",
        }),
        getAll<Product>(collections.products, {
          filter: 'type="inventory"',
          sort: "name",
        }),
      ]);
      const sortedItems = inventoryData.sort((a, b) => { if (a.product < b.product) return -1; if (a.product > b.product) return 1; return 0; });
      const sortedProducts = productsData.sort((a, b) => { if (a.name < b.name) return -1; if (a.name > b.name) return 1; return 0; });
      setItems(sortedItems);
      setProducts(sortedProducts);
    } catch (err) {
      setError("Failed to load inventory");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdd = async () => {
    if (!selectedProduct) return;

    try {
      await create(collections.inventoryItems, {
        product: selectedProduct.id,
        in_stock: true,
        notes: notes.trim() || undefined,
      });
      setDialogOpen(false);
      setSelectedProduct(null);
      setNotes("");
      loadData();
    } catch (err) {
      setError("Failed to add inventory item");
      console.error(err);
    }
  };

  const handleToggleStock = async (item: InventoryItemExpanded) => {
    try {
      await update(collections.inventoryItems, item.id, {
        in_stock: !item.in_stock,
      });
      loadData();
    } catch (err) {
      setError("Failed to update stock status");
      console.error(err);
    }
  };

  const handleUpdateNotes = async () => {
    if (!editingItem) return;

    try {
      await update(collections.inventoryItems, editingItem.id, {
        notes: editNotes.trim() || undefined,
      });
      setEditNotesDialogOpen(false);
      setEditingItem(null);
      setEditNotes("");
      loadData();
    } catch (err) {
      setError("Failed to update notes");
      console.error(err);
    }
  };

  const handleDelete = async (item: InventoryItemExpanded) => {
    if (!confirm(`Delete ${item.expand?.product?.name} from inventory?`))
      return;

    try {
      await remove(collections.inventoryItems, item.id);
      loadData();
    } catch (err) {
      setError("Failed to delete inventory item");
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

  const inStockItems = items.filter((i) => i.in_stock);
  const outOfStockItems = items.filter((i) => !i.in_stock);

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
            Inventory
          </Typography>
          <Typography color="text.secondary">
            Track long-term inventory items across weeks
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Add Inventory Item
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* In Stock Section */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, bgcolor: "success.light" }}>
          <Typography variant="h6" color="success.contrastText">
            In Stock ({inStockItems.length})
          </Typography>
        </Box>
        <List disablePadding>
          {inStockItems.map((item, index) => (
            <ListItem
              key={item.id}
              sx={{
                bgcolor:
                  index % 2 === 0 ? "rgba(46, 125, 50, 0.08)" : "transparent",
              }}
              secondaryAction={
                <Box display="flex" gap={1} alignItems="center">
                  <Switch
                    checked={item.in_stock}
                    onChange={() => handleToggleStock(item)}
                    color="success"
                  />
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditingItem(item);
                      setEditNotes(item.notes || "");
                      setEditNotesDialogOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(item)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography>{item.expand?.product?.name}</Typography>
                    {item.expand?.product?.ready_to_eat && (
                      <Chip
                        label={item.expand.product.meal_slot || "ready"}
                        size="small"
                        color="success"
                      />
                    )}
                  </Box>
                }
                secondary={item.notes}
              />
            </ListItem>
          ))}
          {inStockItems.length === 0 && (
            <ListItem>
              <ListItemText
                secondary="No items in stock"
                sx={{ textAlign: "center", color: "text.secondary" }}
              />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* Out of Stock Section */}
      <Paper>
        <Box sx={{ p: 2, bgcolor: "grey.300" }}>
          <Typography variant="h6">
            Out of Stock ({outOfStockItems.length})
          </Typography>
        </Box>
        <List disablePadding>
          {outOfStockItems.map((item, index) => (
            <ListItem
              key={item.id}
              sx={{
                opacity: 0.6,
                bgcolor: index % 2 === 0 ? "grey.100" : "transparent",
              }}
              secondaryAction={
                <Box display="flex" gap={1} alignItems="center">
                  <Switch
                    checked={item.in_stock}
                    onChange={() => handleToggleStock(item)}
                  />
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditingItem(item);
                      setEditNotes(item.notes || "");
                      setEditNotesDialogOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(item)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              }
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography>{item.expand?.product?.name}</Typography>
                    {item.expand?.product?.ready_to_eat && (
                      <Chip
                        label={item.expand.product.meal_slot || "ready"}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                }
                secondary={item.notes}
              />
            </ListItem>
          ))}
          {outOfStockItems.length === 0 && (
            <ListItem>
              <ListItemText
                secondary="All items are in stock!"
                sx={{ textAlign: "center", color: "text.secondary" }}
              />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* Add Inventory Item Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Inventory Item</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={products.filter(
              (p) => !items.some((item) => item.product === p.id)
            )}
            value={selectedProduct}
            onChange={(_, newValue) => setSelectedProduct(newValue)}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => (
              <TextField {...params} label="Product" margin="dense" fullWidth />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography>{option.name}</Typography>
                  {option.ready_to_eat && (
                    <Chip
                      label={option.meal_slot || "ready"}
                      size="small"
                      color="success"
                    />
                  )}
                </Box>
              </li>
            )}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            margin="dense"
            multiline
            rows={2}
            placeholder="Optional notes..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            disabled={!selectedProduct}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog
        open={editNotesDialogOpen}
        onClose={() => setEditNotesDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Notes</DialogTitle>
        <DialogContent>
          <TextField
            label="Notes"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            fullWidth
            margin="dense"
            multiline
            rows={3}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditNotesDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateNotes} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}