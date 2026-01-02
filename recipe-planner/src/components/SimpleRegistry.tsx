import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getAll, create, update, remove } from '../lib/api';
import type { BaseRecord } from '../lib/types';

interface SimpleRegistryProps {
  title: string;
  collection: string;
  description?: string;
}

interface NamedRecord extends BaseRecord {
  name: string;
}

export default function SimpleRegistry({ title, collection, description }: SimpleRegistryProps) {
  const [items, setItems] = useState<NamedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NamedRecord | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<NamedRecord | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await getAll<NamedRecord>(collection, { sort: 'name' });
      setItems(records);
    } catch (err) {
      setError('Failed to load items');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [collection]);

  const handleOpenDialog = (item?: NamedRecord) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
    } else {
      setEditingItem(null);
      setName('');
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setName('');
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      setSaving(true);
      if (editingItem) {
        await update(collection, editingItem.id, { name: name.trim() });
      } else {
        await create(collection, { name: name.trim() });
      }
      handleCloseDialog();
      loadItems();
    } catch (err) {
      setError('Failed to save item');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (item: NamedRecord) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      await remove(collection, itemToDelete.id);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadItems();
    } catch (err) {
      setError('Failed to delete item');
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
            {title}
          </Typography>
          {description && (
            <Typography color="text.secondary" gutterBottom>
              {description}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add {title.replace(/s$/, '')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper>
        {items.length === 0 ? (
          <Box p={3} textAlign="center">
            <Typography color="text.secondary">
              No {title.toLowerCase()} yet. Add one to get started.
            </Typography>
          </Box>
        ) : (
          <List>
            {items.map((item) => (
              <ListItem key={item.id} divider>
                <ListItemText primary={item.name} />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleOpenDialog(item)} sx={{ mr: 1 }}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end" onClick={() => handleDeleteClick(item)}>
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingItem ? `Edit ${title.replace(/s$/, '')}` : `Add ${title.replace(/s$/, '')}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                handleSave();
              }
            }}
          />
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
        <DialogTitle>Delete {title.replace(/s$/, '')}?</DialogTitle>
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
