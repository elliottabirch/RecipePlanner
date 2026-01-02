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
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { getAll, create, update, remove, collections } from '../../lib/api';
import type { Tag } from '../../lib/types';

const PRESET_COLORS = [
  '#f44336', // red
  '#e91e63', // pink
  '#9c27b0', // purple
  '#673ab7', // deep purple
  '#3f51b5', // indigo
  '#2196f3', // blue
  '#03a9f4', // light blue
  '#00bcd4', // cyan
  '#009688', // teal
  '#4caf50', // green
  '#8bc34a', // light green
  '#cddc39', // lime
  '#ffeb3b', // yellow
  '#ffc107', // amber
  '#ff9800', // orange
  '#ff5722', // deep orange
  '#795548', // brown
  '#607d8b', // blue grey
];

export default function Tags() {
  const [items, setItems] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2196f3');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Tag | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const records = await getAll<Tag>(collections.tags, { sort: 'name' });
      setItems(records);
    } catch (err) {
      setError('Failed to load tags');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleOpenDialog = (item?: Tag) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setColor(item.color || '#2196f3');
    } else {
      setEditingItem(null);
      setName('');
      setColor('#2196f3');
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setName('');
    setColor('#2196f3');
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      setSaving(true);
      const data = { name: name.trim(), color };
      if (editingItem) {
        await update(collections.tags, editingItem.id, data);
      } else {
        await create(collections.tags, data);
      }
      handleCloseDialog();
      loadItems();
    } catch (err) {
      setError('Failed to save tag');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (item: Tag) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      await remove(collections.tags, itemToDelete.id);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadItems();
    } catch (err) {
      setError('Failed to delete tag');
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
            Tags
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            Manage recipe tags (e.g., breakfast, dinner, baby food)
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Tag
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
              No tags yet. Add one to get started.
            </Typography>
          </Box>
        ) : (
          <List>
            {items.map((item) => (
              <ListItem key={item.id} divider>
                <ListItemText
                  primary={
                    <Chip
                      label={item.name}
                      sx={{
                        backgroundColor: item.color || '#2196f3',
                        color: 'white',
                      }}
                    />
                  }
                />
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
          {editingItem ? 'Edit Tag' : 'Add Tag'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 3 }}
          />
          <Typography variant="subtitle2" gutterBottom>
            Color
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {PRESET_COLORS.map((presetColor) => (
              <Box
                key={presetColor}
                onClick={() => setColor(presetColor)}
                sx={{
                  width: 32,
                  height: 32,
                  backgroundColor: presetColor,
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: color === presetColor ? '3px solid #000' : '3px solid transparent',
                  '&:hover': {
                    opacity: 0.8,
                  },
                }}
              />
            ))}
          </Box>
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Preview:
            </Typography>
            <Chip
              label={name || 'Tag name'}
              sx={{
                mt: 1,
                backgroundColor: color,
                color: 'white',
              }}
            />
          </Box>
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
        <DialogTitle>Delete Tag?</DialogTitle>
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