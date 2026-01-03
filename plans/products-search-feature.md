# Products Search Feature

## Overview

Add a search function to the Products page that allows users to filter products by name in real-time.

## Current State

The [`Products.tsx`](../recipe-planner/src/pages/registries/Products.tsx:57) page currently displays all products in a table with:

- Product name
- Product type (raw/transient/stored) with color-coded chips
- Details (store, section, storage location, container type based on product type)
- Edit and Delete actions

Products are loaded from the API and sorted by name, but there's no filtering capability.

## Proposed Solution

### UI Changes

Add a search input field to the header area of the Products page between the title/description and the "Add Product" button.

**Components to add:**

- MUI [`TextField`](https://mui.com/material-ui/react-text-field/) component with:
  - Search icon (using MUI [`SearchIcon`](https://mui.com/material-ui/material-icons/))
  - Placeholder text: "Search products..."
  - Clear button (using MUI [`InputAdornment`](https://mui.com/material-ui/api/input-adornment/) with [`ClearIcon`](https://mui.com/material-ui/material-icons/))
  - Full-width on mobile, fixed width (300-400px) on desktop

### Implementation Details

#### 1. State Management

Add a new state variable to track the search query:

```typescript
const [searchQuery, setSearchQuery] = useState("");
```

#### 2. Filter Logic

Create a computed/derived list that filters items based on the search query:

```typescript
const filteredItems = useMemo(() => {
  if (!searchQuery.trim()) {
    return items;
  }

  const query = searchQuery.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(query));
}, [items, searchQuery]);
```

Use `useMemo` to optimize performance and prevent unnecessary re-filtering on every render.

#### 3. Display Updates

- Replace direct usage of `items` in the table rendering with `filteredItems`
- Add a results counter when search is active:
  - Show: "Showing X of Y products" when filtered
  - Hide when search is empty

#### 4. UX Enhancements

- Clear button appears only when search has text
- Clicking clear resets the search query
- Search is case-insensitive
- Real-time filtering (no need to press Enter)
- Maintain all existing functionality (add, edit, delete)

### Code Structure

#### Location

All changes will be in [`recipe-planner/src/pages/registries/Products.tsx`](../recipe-planner/src/pages/registries/Products.tsx:57)

#### New Imports Needed

```typescript
import { Search as SearchIcon, Clear as ClearIcon } from "@mui/icons-material";
import { TextField, InputAdornment } from "@mui/material";
import { useMemo } from "react"; // Add to existing React import
```

#### Component Structure Changes

```
Products Component
├── Search state (searchQuery)
├── Filter logic (filteredItems with useMemo)
├── Header section
│   ├── Title and description
│   ├── Search input field (NEW)
│   └── Add Product button
├── Results indicator (NEW - conditional)
├── Table with filtered results
└── Dialogs (unchanged)
```

### Edge Cases & Considerations

1. **Empty Search Results**: Display message "No products match your search" when `filteredItems.length === 0` but `searchQuery` is not empty
2. **Performance**: Using `useMemo` ensures filtering only runs when items or searchQuery changes
3. **Special Characters**: Search should handle special characters in product names gracefully
4. **Whitespace**: Trim search query to avoid issues with leading/trailing spaces
5. **Existing State**: Search state is local - doesn't affect the Add/Edit dialog or deletion flows

### Future Enhancements (Not in Scope)

- Search by additional fields (type, store, section)
- Filter by product type with dropdown/chips
- Advanced filtering UI
- Persist search query in URL or localStorage
- Search highlighting in results

## Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Products                                    [Add Product]    │
│ Manage products (raw ingredients, ...)                      │
│                                                              │
│ [🔍 Search products...                              ✕]      │
│                                                              │
│ Showing 3 of 15 products                                    │
│                                                              │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Name     │ Type      │ Details           │ Actions    │  │
│ ├───────────────────────────────────────────────────────┤  │
│ │ Flour    │ Raw       │ Store: ...        │ [✏️] [🗑️]  │  │
│ │ ...      │ ...       │ ...               │ ...        │  │
│ └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Search by full product name
- [ ] Search by partial product name
- [ ] Case-insensitive search works correctly
- [ ] Clear button clears search and shows all products
- [ ] Empty search shows all products
- [ ] No matches shows appropriate message
- [ ] Results counter updates correctly
- [ ] Add/Edit/Delete functionality still works with search active
- [ ] Responsive design on mobile and desktop
