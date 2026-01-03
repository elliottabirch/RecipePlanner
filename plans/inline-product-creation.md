# Inline Product Creation in Recipe Editor

## Problem

Currently, when creating a recipe, users must:

1. Go to Products registry page
2. Create all needed products
3. Return to Recipe Editor
4. Add products to recipe

This back-and-forth workflow is inefficient and breaks the recipe creation flow.

## Solution

Add inline product creation directly in the Recipe Editor's "Add Product" dialog.

---

## Current Add Product Dialog Flow

```
[Add Product Button]
  → Opens dialog
    → Autocomplete dropdown (existing products only)
    → Quantity field
    → Unit field (for raw/transient)
    → Meal Destination (for stored)
    → [Add button]
```

---

## Proposed Enhanced Flow

```
[Add Product Button]
  → Opens dialog
    → Autocomplete dropdown with:
      - All existing products
      - "+ Create New Product" option at top

    IF selecting existing product:
      → Shows quantity/unit/destination fields (current behavior)

    IF selecting "+ Create New Product":
      → Expands dialog to show product creation form
      → After creating product, auto-selects it
      → Shows quantity/unit/destination fields
```

---

## UI Design Options

### Option 1: Expandable Dialog (RECOMMENDED)

**Single dialog that expands when "Create New" is selected**

**Advantages:**

- ✅ Clean, single-dialog experience
- ✅ No modal stacking
- ✅ Smooth transition
- ✅ User stays in context

**Implementation:**

```typescript
const [showCreateForm, setShowCreateForm] = useState(false);

// In Autocomplete onChange:
if (newValue === CREATE_NEW_SENTINEL) {
  setShowCreateForm(true);
} else {
  setShowCreateForm(false);
  setSelectedProduct(newValue);
}
```

**Dialog Layout:**

```
┌─────────────────────────────────────────┐
│ Add Product Node                         │
├─────────────────────────────────────────┤
│ [Autocomplete: "+ Create New Product"]  │
│                                          │
│ ┌──────────────────────────────────────┐│
│ │ 📦 Create New Product                ││
│ │                                       ││
│ │ Name: [____________]                 ││
│ │                                       ││
│ │ Type: [Raw Ingredient ▼]             ││
│ │                                       ││
│ │ (Type-specific fields below...)      ││
│ │                                       ││
│ │ [Create & Use Product]               ││
│ └──────────────────────────────────────┘│
│                                          │
│ Quantity: [___]  Unit: [___]            │
│ Meal Destination: [___]                 │
│                                          │
│         [Cancel]  [Add to Recipe]       │
└─────────────────────────────────────────┘
```

### Option 2: Nested Modal

**Separate dialog opens on top**

**Disadvantages:**

- ❌ Modal stacking (can be confusing)
- ❌ Requires closing two dialogs
- ❌ Loses context

### Option 3: Redirect to Products Page

**Not recommended - defeats the purpose**

---

## Required Fields by Product Type

### Raw Product

- ✅ **Name** (required)
- ✅ **Type** = "raw" (fixed)
- ⚪ **Pantry** checkbox (optional, default false)
- ⚪ **Store** dropdown (optional, from stores registry)
- ⚪ **Section** dropdown (optional, from sections registry)

### Transient Product

- ✅ **Name** (required)
- ✅ **Type** = "transient" (fixed)
- No additional fields needed

### Stored Product

- ✅ **Name** (required)
- ✅ **Type** = "stored" (fixed)
- ⚪ **Storage Location** dropdown (optional: fridge/freezer)
- ⚪ **Container Type** dropdown (optional, from container_types registry)

---

## Implementation Plan

### Phase 1: Add Create New Option to Autocomplete

```typescript
// Add special option to products list
const productOptions = [
  { id: "__CREATE_NEW__", name: "+ Create New Product", type: "raw" },
  ...products,
];
```

### Phase 2: Expandable Form UI

```typescript
const [creatingProduct, setCreatingProduct] = useState(false);
const [newProductName, setNewProductName] = useState("");
const [newProductType, setNewProductType] = useState<ProductType>("raw");
// ... other product fields
```

### Phase 3: Product Creation Logic

```typescript
const handleCreateProduct = async () => {
  // Validate fields
  if (!newProductName.trim()) return;

  // Build product data
  const data: Partial<Product> = {
    name: newProductName.trim(),
    type: newProductType,
    // ... type-specific fields
  };

  // Create in database
  const newProduct = await create<Product>(collections.products, data);

  // Refresh products list
  await loadLookupData();

  // Auto-select the new product
  setSelectedProduct(newProduct);
  setCreatingProduct(false);

  // Reset create form
  resetCreateForm();
};
```

### Phase 4: Form Validation

- Product name cannot be empty
- Product name should be unique (warn if duplicate exists)
- For raw products: store and section should ideally be set
- For stored products: storage location and container type should ideally be set

### Phase 5: User Experience Enhancements

- **Auto-type selection**: When creating "diced onion", suggest type "transient"
- **Smart defaults**: Pre-fill common values based on product type
- **Inline validation**: Show errors immediately
- **Success feedback**: Brief toast notification "Product created"

---

## Detailed UI Component Structure

### Add Product Dialog States

**State 1: Normal Product Selection**

```
┌─────────────────────────────────────────┐
│ Add Product Node                         │
├─────────────────────────────────────────┤
│ Product: [+ Create New Product    ▼]    │
│                                          │
│         [Cancel]  [Add to Recipe]       │
└─────────────────────────────────────────┘
```

**State 2: Creating New Product**

```
┌─────────────────────────────────────────┐
│ Add Product Node                         │
├─────────────────────────────────────────┤
│ Product: [+ Create New Product    ▼]    │
│                                          │
│ ┌──────────────────────────────────────┐│
│ │ 📦 New Product Details               ││
│ │                                       ││
│ │ Name: [diced onion____________]      ││
│ │                                       ││
│ │ Type: [Transient ▼]                  ││
│ │                                       ││
│ │ (No additional fields for transient) ││
│ │                                       ││
│ │ [← Back]  [Create Product →]         ││
│ └──────────────────────────────────────┘│
│                                          │
│         [Cancel]  [Add to Recipe]       │
└─────────────────────────────────────────┘
```

**State 3: Product Created, Ready to Add**

```
┌─────────────────────────────────────────┐
│ Add Product Node                         │
├─────────────────────────────────────────┤
│ Product: [diced onion [transient] ▼]    │
│                                          │
│ Quantity: [1__]  Unit: [cup]            │
│                                          │
│         [Cancel]  [Add to Recipe]       │
└─────────────────────────────────────────┘
```

---

## Code Changes Required

### File: `recipe-planner/src/pages/RecipeEditor.tsx`

#### 1. Add State for Product Creation

```typescript
// Add to existing state
const [creatingProduct, setCreatingProduct] = useState(false);
const [newProductName, setNewProductName] = useState("");
const [newProductType, setNewProductType] = useState<ProductType>("raw");
const [newProductPantry, setNewProductPantry] = useState(false);
const [newProductStoreId, setNewProductStoreId] = useState("");
const [newProductSectionId, setNewProductSectionId] = useState("");
const [newProductStorageLocation, setNewProductStorageLocation] = useState<
  StorageLocation | ""
>("");
const [newProductContainerTypeId, setNewProductContainerTypeId] = useState("");
```

#### 2. Add Lookup Data for Registries

```typescript
// Add to existing state
const [stores, setStores] = useState<Store[]>([]);
const [sections, setSections] = useState<Section[]>([]);
const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);

// Update loadLookupData function
const loadLookupData = async () => {
  try {
    const [
      productsData,
      tagsData,
      storesData,
      sectionsData,
      containerTypesData,
    ] = await Promise.all([
      getAll<Product>(collections.products, {
        sort: "name",
        expand: "container_type",
      }),
      getAll<Tag>(collections.tags, { sort: "name" }),
      getAll<Store>(collections.stores, { sort: "name" }),
      getAll<Section>(collections.sections, { sort: "name" }),
      getAll<ContainerType>(collections.containerTypes, { sort: "name" }),
    ]);
    setProducts(productsData);
    setAllTags(tagsData);
    setStores(storesData);
    setSections(sectionsData);
    setContainerTypes(containerTypesData);
  } catch (err) {
    console.error("Failed to load lookup data:", err);
  }
};
```

#### 3. Add Product Creation Handler

```typescript
const handleCreateProduct = async () => {
  if (!newProductName.trim()) return;

  try {
    const data: Partial<Product> = {
      name: newProductName.trim(),
      type: newProductType,
    };

    // Type-specific fields
    if (newProductType === "raw") {
      data.pantry = newProductPantry;
      data.store = newProductStoreId || undefined;
      data.section = newProductSectionId || undefined;
    } else if (newProductType === "stored") {
      data.storage_location = newProductStorageLocation || undefined;
      data.container_type = newProductContainerTypeId || undefined;
    }

    const newProduct = await create<Product>(collections.products, data);

    // Refresh products and select the new one
    await loadLookupData();
    setSelectedProduct(newProduct);
    setCreatingProduct(false);
    resetProductCreateForm();
  } catch (err) {
    console.error("Failed to create product:", err);
    // Could show error in UI
  }
};

const resetProductCreateForm = () => {
  setNewProductName("");
  setNewProductType("raw");
  setNewProductPantry(false);
  setNewProductStoreId("");
  setNewProductSectionId("");
  setNewProductStorageLocation("");
  setNewProductContainerTypeId("");
};
```

#### 4. Update Add Product Dialog

- Add sentinel value for "Create New"
- Conditionally render create form
- Handle form submission

---

## Alternative: Quick Create for Common Types

For fastest workflow, could add quick-create buttons:

```
┌─────────────────────────────────────────┐
│ Add Product Node                         │
├─────────────────────────────────────────┤
│ Product: [Select or create...     ▼]    │
│                                          │
│ Quick Create:                            │
│ [+ Raw] [+ Transient] [+ Stored]        │
│                                          │
│ (Clicking shows inline form for that    │
│  type with relevant fields only)        │
└─────────────────────────────────────────┘
```

---

## Summary

**Recommended Approach:**

- Single expandable dialog (Option 1)
- "Create New Product" option at top of autocomplete
- Form expands inline when selected
- Auto-selects created product
- User can immediately set quantity and add to recipe

**Benefits:**

- ✅ No context switching
- ✅ Maintains recipe creation flow
- ✅ Single dialog (no modal stacking)
- ✅ Immediately usable after creation
- ✅ Can still browse existing products

**Implementation Complexity:** Medium

- Need to replicate product creation form
- Need to handle all product types
- Need to load registry data (stores, sections, containers)
- Need to refresh products list after creation

**User Impact:** High

- Significantly improves recipe authoring experience
- Reduces friction for new users
- Makes the tool more self-contained
