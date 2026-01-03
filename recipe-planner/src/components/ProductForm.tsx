import { useState } from "react";
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
} from "@mui/material";
import type {
  Product,
  ProductType,
  StorageLocation,
  Store,
  Section,
  ContainerType,
} from "../lib/types";

interface ProductFormProps {
  // Registries
  stores: Store[];
  sections: Section[];
  containerTypes: ContainerType[];

  // Form state from useProductForm hook
  form: ReturnType<typeof useProductForm>;
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
}

export function useProductForm(initialValues?: Partial<ProductFormValues>) {
  const [name, setName] = useState(initialValues?.name || "");
  const [type, setType] = useState<ProductType>(initialValues?.type || "raw");
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

  const resetForm = () => {
    setName("");
    setType("raw");
    setPantry(false);
    setTrackQuantity(false);
    setStoreId("");
    setSectionId("");
    setStorageLocation("");
    setContainerTypeId("");
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
  });

  const getProductData = (): Partial<Product> => {
    const data: Partial<Product> = {
      name: name.trim(),
      type,
    };

    // Add type-specific fields
    if (type === "raw") {
      data.pantry = pantry;
      data.track_quantity = pantry && trackQuantity ? true : false;
      data.store = storeId || undefined;
      data.section = sectionId || undefined;
      // Clear stored fields
      data.storage_location = undefined;
      data.container_type = undefined;
    } else if (type === "stored") {
      data.storage_location = storageLocation || undefined;
      data.container_type = containerTypeId || undefined;
      // Clear raw fields
      data.pantry = false;
      data.track_quantity = false;
      data.store = undefined;
      data.section = undefined;
    } else {
      // Transient - clear all type-specific fields
      data.pantry = false;
      data.track_quantity = false;
      data.store = undefined;
      data.section = undefined;
      data.storage_location = undefined;
      data.container_type = undefined;
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
}: ProductFormProps) {
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
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={form.type}
          label="Type"
          onChange={(e) => form.setType(e.target.value as ProductType)}
        >
          <MenuItem value="raw">Raw Ingredient</MenuItem>
          <MenuItem value="transient">Transient</MenuItem>
          <MenuItem value="stored">Stored</MenuItem>
        </Select>
      </FormControl>

      {/* Raw-specific fields */}
      {form.type === "raw" && (
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
      {form.type === "stored" && (
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
              <MenuItem value="fridge">Fridge</MenuItem>
              <MenuItem value="freezer">Freezer</MenuItem>
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

      {form.type === "transient" && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Transient products have no additional configuration. They exist only
          during prep.
        </Typography>
      )}
    </Box>
  );
}
