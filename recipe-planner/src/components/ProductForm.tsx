import { useState, useMemo } from "react";
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
  Alert,
  Chip,
} from "@mui/material";
import {
  ProductType,
  StorageLocation,
  type Product,
  type Store,
  type Section,
  type ContainerType,
} from "../lib/types";

interface ProductFormProps {
  // Registries
  stores: Store[];
  sections: Section[];
  containerTypes: ContainerType[];

  // Form state from useProductForm hook
  form: ReturnType<typeof useProductForm>;

  // All existing products for duplicate detection
  existingProducts?: Product[];

  // Optional: ID of product being edited (to exclude from duplicate check)
  editingProductId?: string;
}

export interface ProductFormValues {
  name: string;
  type: ProductType;
  pantry: boolean;
  trackQuantity: boolean;
  storeId: string;
  sectionId: string;
  storageLocation: StorageLocation | "";
  containerTypeId: string;
  readyToEat: boolean;
  mealSlot: "snack" | "meal" | "";
}

export function useProductForm(initialValues?: Partial<ProductFormValues>) {
  const [name, setName] = useState(initialValues?.name || "");
  const [type, setType] = useState<ProductType>(
    initialValues?.type || ProductType.Raw
  );
  const [pantry, setPantry] = useState(initialValues?.pantry || false);
  const [trackQuantity, setTrackQuantity] = useState(
    initialValues?.trackQuantity || false
  );
  const [storeId, setStoreId] = useState(initialValues?.storeId || "");
  const [sectionId, setSectionId] = useState(initialValues?.sectionId || "");
  const [storageLocation, setStorageLocation] = useState<StorageLocation | "">(
    initialValues?.storageLocation || ""
  );
  const [containerTypeId, setContainerTypeId] = useState(
    initialValues?.containerTypeId || ""
  );
  const [readyToEat, setReadyToEat] = useState(
    initialValues?.readyToEat || false
  );
  const [mealSlot, setMealSlot] = useState<"snack" | "meal" | "">(
    initialValues?.mealSlot || ""
  );

  const resetForm = () => {
    setName("");
    setType(ProductType.Raw);
    setPantry(false);
    setTrackQuantity(false);
    setStoreId("");
    setSectionId("");
    setStorageLocation("");
    setContainerTypeId("");
    setReadyToEat(false);
    setMealSlot("");
  };

  const getValues = (): ProductFormValues => ({
    name,
    type,
    pantry,
    trackQuantity,
    storeId,
    sectionId,
    storageLocation,
    containerTypeId,
    readyToEat,
    mealSlot,
  });

  const getProductData = (): Partial<Product> => {
    const data: Partial<Product> = {
      name: name.trim(),
      type,
    };

    // Add type-specific fields
    if (type === ProductType.Raw) {
      data.pantry = pantry;
      data.track_quantity = pantry && trackQuantity ? true : false;
      data.store = storeId || undefined;
      data.section = sectionId || undefined;
      // Clear other type fields
      data.storage_location = undefined;
      data.container_type = undefined;
      data.ready_to_eat = undefined;
      data.meal_slot = undefined;
    } else if (type === ProductType.Stored) {
      data.storage_location = storageLocation || undefined;
      data.container_type = containerTypeId || undefined;
      // Clear other type fields
      data.pantry = false;
      data.track_quantity = false;
      data.store = undefined;
      data.section = undefined;
      data.ready_to_eat = undefined;
      data.meal_slot = undefined;
    } else if (type === ProductType.Inventory) {
      data.ready_to_eat = readyToEat;
      data.meal_slot =
        readyToEat && mealSlot ? (mealSlot as "snack" | "meal") : undefined;
      data.storage_location = storageLocation || undefined;
      // Clear other type fields
      data.pantry = false;
      data.track_quantity = false;
      data.store = undefined;
      data.section = undefined;
      data.container_type = undefined;
    } else {
      // Transient - clear all type-specific fields
      data.pantry = false;
      data.track_quantity = false;
      data.store = undefined;
      data.section = undefined;
      data.storage_location = undefined;
      data.container_type = undefined;
      data.ready_to_eat = undefined;
      data.meal_slot = undefined;
    }

    return data;
  };

  const isValid = () => {
    return name.trim().length > 0;
  };

  return {
    name,
    setName,
    type,
    setType,
    pantry,
    setPantry,
    trackQuantity,
    setTrackQuantity,
    storeId,
    setStoreId,
    sectionId,
    setSectionId,
    storageLocation,
    setStorageLocation,
    containerTypeId,
    setContainerTypeId,
    readyToEat,
    setReadyToEat,
    mealSlot,
    setMealSlot,
    resetForm,
    getValues,
    getProductData,
    isValid,
  };
}

export default function ProductForm({
  stores,
  sections,
  containerTypes,
  form,
  existingProducts = [],
  editingProductId,
}: ProductFormProps) {
  // Find potential duplicates based on the current name input
  const potentialDuplicates = useMemo(() => {
    if (!form.name.trim() || form.name.trim().length < 2) {
      return [];
    }

    const searchTerm = form.name.toLowerCase().trim();

    return existingProducts
      .filter((product) => {
        // Exclude the product being edited
        if (editingProductId && product.id === editingProductId) {
          return false;
        }

        const productName = product.name.toLowerCase();

        // Check for exact match or contains
        return (
          productName.includes(searchTerm) || searchTerm.includes(productName)
        );
      })
      .slice(0, 5); // Limit to 5 results
  }, [form.name, existingProducts, editingProductId]);

  const hasExactMatch = useMemo(() => {
    const searchTerm = form.name.toLowerCase().trim();
    return potentialDuplicates.some(
      (product) => product.name.toLowerCase() === searchTerm
    );
  }, [form.name, potentialDuplicates]);

  return (
    <Box>
      <TextField
        autoFocus
        margin="dense"
        label="Name"
        fullWidth
        value={form.name}
        onChange={(e) => form.setName(e.target.value)}
        sx={{ mb: 2 }}
        error={hasExactMatch}
        helperText={
          hasExactMatch ? "A product with this exact name already exists" : ""
        }
      />

      {/* Duplicate warning */}
      {potentialDuplicates.length > 0 && (
        <Alert severity={hasExactMatch ? "error" : "warning"} sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            {hasExactMatch
              ? "⚠️ Exact match found - this product already exists!"
              : "Similar products found:"}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
            {potentialDuplicates.map((product) => (
              <Chip
                key={product.id}
                label={product.name}
                size="small"
                sx={{
                  backgroundColor:
                    product.type === "raw"
                      ? "#4caf50"
                      : product.type === "transient"
                      ? "#ff9800"
                      : product.type === "stored"
                      ? "#2196f3"
                      : "#9c27b0",
                  color: "white",
                }}
              />
            ))}
          </Box>
          <Typography variant="caption" display="block" mt={1}>
            {hasExactMatch
              ? "Please use the existing product or choose a different name."
              : "Make sure you're not creating a duplicate product."}
          </Typography>
        </Alert>
      )}

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={form.type}
          label="Type"
          onChange={(e) => form.setType(e.target.value as ProductType)}
        >
          <MenuItem value={ProductType.Raw}>Raw Ingredient</MenuItem>
          <MenuItem value={ProductType.Transient}>Transient</MenuItem>
          <MenuItem value={ProductType.Stored}>Stored</MenuItem>
          <MenuItem value={ProductType.Inventory}>Inventory</MenuItem>
        </Select>
      </FormControl>

      {/* Raw-specific fields */}
      {form.type === ProductType.Raw && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.pantry}
                onChange={(e) => form.setPantry(e.target.checked)}
              />
            }
            label="Pantry item (already in stock, just verify)"
            sx={{ mb: 2, display: "block" }}
          />

          {form.pantry && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.trackQuantity}
                  onChange={(e) => form.setTrackQuantity(e.target.checked)}
                />
              }
              label="Track quantity (show amounts needed in shopping list)"
              sx={{ mb: 2, ml: 4, display: "block" }}
            />
          )}

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Store</InputLabel>
            <Select
              value={form.storeId}
              label="Store"
              onChange={(e) => form.setStoreId(e.target.value)}
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
              value={form.sectionId}
              label="Section"
              onChange={(e) => form.setSectionId(e.target.value)}
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
      {form.type === ProductType.Stored && (
        <>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Storage Location</InputLabel>
            <Select
              value={form.storageLocation}
              label="Storage Location"
              onChange={(e) =>
                form.setStorageLocation(e.target.value as StorageLocation)
              }
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value={StorageLocation.Fridge}>Fridge</MenuItem>
              <MenuItem value={StorageLocation.Freezer}>Freezer</MenuItem>
              <MenuItem value={StorageLocation.Dry}>Dry Storage</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Container Type</InputLabel>
            <Select
              value={form.containerTypeId}
              label="Container Type"
              onChange={(e) => form.setContainerTypeId(e.target.value)}
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

      {/* Inventory-specific fields */}
      {form.type === ProductType.Inventory && (
        <>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.readyToEat}
                onChange={(e) => form.setReadyToEat(e.target.checked)}
              />
            }
            label="Ready to Eat (can be consumed without cooking)"
            sx={{ mb: 2, display: "block" }}
          />

          {form.readyToEat && (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Meal Slot</InputLabel>
              <Select
                value={form.mealSlot}
                label="Meal Slot"
                onChange={(e) =>
                  form.setMealSlot(e.target.value as "snack" | "meal")
                }
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                <MenuItem value="meal">Meal</MenuItem>
                <MenuItem value="snack">Snack</MenuItem>
              </Select>
            </FormControl>
          )}

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Storage Location</InputLabel>
            <Select
              value={form.storageLocation}
              label="Storage Location"
              onChange={(e) =>
                form.setStorageLocation(e.target.value as StorageLocation)
              }
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value={StorageLocation.Fridge}>Fridge</MenuItem>
              <MenuItem value={StorageLocation.Freezer}>Freezer</MenuItem>
              <MenuItem value={StorageLocation.Dry}>Dry Storage</MenuItem>
            </Select>
          </FormControl>

          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            Inventory items are tracked long-term across multiple weeks.
          </Typography>
        </>
      )}

      {form.type === ProductType.Transient && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Transient products have no additional configuration. They exist only
          during prep.
        </Typography>
      )}
    </Box>
  );
}
