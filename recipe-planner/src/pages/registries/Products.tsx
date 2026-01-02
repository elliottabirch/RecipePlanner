import { useState, useEffect } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getAll, create, update, remove, collections } from '../../lib/api';
import type { Product, ProductType, StorageLocation, Store, Section, ContainerType } from '../../lib/types';

interface ProductExpanded extends Product {
  expand?: {
    store?: Store;
    section?: Section;
    container_type?: ContainerType;
  };
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  raw: 'Raw Ingredient',
  transient: 'Transient',
  stored: 'Stored',
};

const PRODUCT_TYPE_COLORS: Record<ProductType, string> = {
  raw: '#4caf50',
  transient: '#ff9800',
  stored: '#2196f3',
};

export default function Products() {
  const [items, setItems] = useState<ProductExpanded[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookup data for dropdowns
  const [stores, setStores] = useState<Store[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductExpanded | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<ProductType>('raw');
  const [pantry, setPantry] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [storageLocation, setStorageLocation] = useState<StorageLocation | ''>('');
  const [containerTypeId, setContainerTypeId] = useState('');

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ProductExpanded | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await getAll<ProductExpanded>(collections.products, {
        sort: 'name',
        expand: 'store,section,container_type',
      });
      setItems(records);
    } catch (err) {
      setError('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLookupData = async () => {
    try {
      const [storesData, sectionsData, containerTypesData] = await Promise.all([
        getAll<Store>(collections.stores, { sort: 'name' }),
        getAll<Section>(collections.sections, { sort: 'name' }),
        getAll<ContainerType>(collections.containerTypes, { sort: 'name' }),
      ]);
      setStores(storesData);
      setSections(sectionsData);
      setContainerTypes(containerTypesData);
    } catch (err) {
      console.error('Failed to load lookup data:', err);
    }
  };

  useEffect(() => {
    loadItems();
    loadLookupData();
  }, []);

  const resetForm = () => {
    setName('');
    setType('raw');
    setPantry(false);
    setStoreId('');
    setSectionId('');
    setStorageLocation('');
    setContainerTypeId('');
  };

  const handleOpenDialog = (item?: ProductExpanded) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setType(item.type);
      setPantry(item.pantry || false);
      setStoreId(item.store || '');
      setSectionId(item.section || '');
      setStorageLocation(item.storage_location || '');
      setContainerTypeId(item.container_type || '');
    } else {
      setEditingItem(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      setSaving(true);
      const data: Partial<Product> = {
        name: name.trim(),
        type,
      };

      // Add type-specific fields
      if (type === 'raw') {
        data.pantry = pantry;
        data.store = storeId || undefined;
        data.section = sectionId || undefined;
        // Clear stored fields
        data.storage_location = undefined;
        data.container_type = undefined;
      } else if (type === 'stored') {
        data.storage_location = storageLocation || undefined;
        data.container_type = containerTypeId || undefined;
        // Clear raw fields
        data.pantry = false;
        data.store = undefined;
        data.section = undefined;
      } else {
        // Transient - clear all type-specific fields
        data.pantry = false;
        data.store = undefined;
        data.section = undefined;
        data.storage_location = undefined;
        data.container_type = undefined;
      }

      if (editingItem) {
        await update(collections.products, editingItem.id, data);
      } else {
        await create(collections.products, data);
      }
      handleCloseDialog();
      loadItems();
    } catch (err) {
      setError('Failed to save product');
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
      setError('Failed to delete product');
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
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

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        {items.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography color="text.secondary">
              No products yet. Add one to get started.
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
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={PRODUCT_TYPE_LABELS[item.type]}
                      size="small"
                      sx={{
                        backgroundColor: PRODUCT_TYPE_COLORS[item.type],
                        color: 'white',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {item.type === 'raw' && (
                      <Box>
                        {item.pantry && <Chip label="Pantry" size="small" sx={{ mr: 1 }} />}
                        {item.expand?.store && (
                          <Typography variant="body2" component="span" sx={{ mr: 1 }}>
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
                    {item.type === 'stored' && (
                      <Box>
                        {item.storage_location && (
                          <Chip
                            label={item.storage_location}
                            size="small"
                            sx={{ mr: 1, textTransform: 'capitalize' }}
                          />
                        )}
                        {item.expand?.container_type && (
                          <Typography variant="body2" component="span">
                            Container: {item.expand.container_type.name}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {item.type === 'transient' && (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpenDialog(item)} size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => handleDeleteClick(item)} size="small">
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
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingItem ? 'Edit Product' : 'Add Product'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={type}
              label="Type"
              onChange={(e) => setType(e.target.value as ProductType)}
            >
              <MenuItem value="raw">Raw Ingredient</MenuItem>
              <MenuItem value="transient">Transient</MenuItem>
              <MenuItem value="stored">Stored</MenuItem>
            </Select>
          </FormControl>

          {/* Raw-specific fields */}
          {type === 'raw' && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={pantry}
                    onChange={(e) => setPantry(e.target.checked)}
                  />
                }
                label="Pantry item (already in stock, just verify)"
                sx={{ mb: 2, display: 'block' }}
              />

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Store</InputLabel>
                <Select
                  value={storeId}
                  label="Store"
                  onChange={(e) => setStoreId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {stores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Section</InputLabel>
                <Select
                  value={sectionId}
                  label="Section"
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {sections.map((section) => (
                    <MenuItem key={section.id} value={section.id}>
                      {section.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {/* Stored-specific fields */}
          {type === 'stored' && (
            <>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Storage Location</InputLabel>
                <Select
                  value={storageLocation}
                  label="Storage Location"
                  onChange={(e) => setStorageLocation(e.target.value as StorageLocation)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  <MenuItem value="fridge">Fridge</MenuItem>
                  <MenuItem value="freezer">Freezer</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Container Type</InputLabel>
                <Select
                  value={containerTypeId}
                  label="Container Type"
                  onChange={(e) => setContainerTypeId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {containerTypes.map((ct) => (
                    <MenuItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {type === 'transient' && (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              Transient products have no additional configuration. They exist only during prep.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!name.trim() || saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Product?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
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