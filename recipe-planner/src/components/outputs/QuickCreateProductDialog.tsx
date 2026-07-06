import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Box,
} from "@mui/material";
import { getAll, create, collections } from "../../lib/api";
import type { Product, Store, Section } from "../../lib/types";
import { ProductType } from "../../lib/types";
import { UNIT_DIMENSIONS, type Unit } from "../../lib/units";

const UNIT_OPTIONS = Object.keys(UNIT_DIMENSIONS) as Unit[];

interface QuickCreateProductDialogProps {
  open: boolean;
  onClose: () => void;
  /** Returns the created product straight into the caller's picker (D-08) — never navigates away. */
  onCreated: (product: Product) => void;
}

/**
 * Phone-friendly minimal product creation, nested inside ShopSwapDialog
 * (D-08). Fields are exactly name + store/section + unit — no more — per
 * the decision record's "ruthlessly minimal" intent. Unit is bound to the
 * Phase-1 unit enum (D-12), not free text.
 */
export function QuickCreateProductDialog({
  open,
  onClose,
  onCreated,
}: QuickCreateProductDialogProps) {
  const [name, setName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const [stores, setStores] = useState<Store[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form and (re)load store/section options each time the dialog
  // opens — it may be reopened multiple times within one swap session.
  useEffect(() => {
    if (!open) return;
    setName("");
    setStoreId("");
    setSectionId("");
    setUnit("");
    setError(null);
    getAll<Store>(collections.stores, { sort: "name" })
      .then(setStores)
      .catch((err) => console.error("Failed to load stores:", err));
    getAll<Section>(collections.sections, { sort: "name" })
      .then(setSections)
      .catch((err) => console.error("Failed to load sections:", err));
  }, [open]);

  const isValid = name.trim().length > 0 && unit !== "";

  const handleCreate = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const created = await create<Product>(collections.products, {
        name: name.trim(),
        type: ProductType.Raw,
        store: storeId || undefined,
        section: sectionId || undefined,
        canonical_unit: unit as Unit,
      });
      onCreated(created);
      onClose();
    } catch (err) {
      console.error("Failed to create product:", err);
      // Copywriting Contract — quick-create failure copy. Dialog stays open
      // with the user's typed input preserved (do not close on failure).
      setError(
        "Couldn't create that product. Check the name isn't already in use, then try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 20, fontWeight: 600 }}>
        Create Product
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            fullWidth
          />

          <FormControl fullWidth>
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

          <FormControl fullWidth>
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

          <FormControl fullWidth required>
            <InputLabel>Unit</InputLabel>
            <Select
              value={unit}
              label="Unit"
              displayEmpty
              onChange={(e) => setUnit(e.target.value as Unit)}
            >
              <MenuItem value="" disabled>
                <em>Select a unit</em>
              </MenuItem>
              {UNIT_OPTIONS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={saving || !isValid}
          sx={{ minHeight: 48 }}
        >
          {saving ? "Creating..." : "Create Product"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
