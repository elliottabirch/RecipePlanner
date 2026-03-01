# Testing Patterns

**Analysis Date:** 2026-03-01

## Test Framework

**Status:** No testing framework detected

**What's Missing:**
- No Jest, Vitest, or other test runner configured
- No `*.test.*` or `*.spec.*` files found in codebase
- No test configuration files (jest.config.ts, vitest.config.ts, etc.)
- No test scripts in `package.json` (only `dev`, `build`, `lint`, `preview`)
- No testing libraries installed (@testing-library/react, @testing-library/jest-dom, etc.)

**Implication:**
- All testing is currently manual/browser-based
- No automated test suite for CI/CD
- No coverage metrics tracked

## Recommendations for Test Implementation

**Framework Choice:**
- **Recommended:** Vitest + @testing-library/react
  - Vitest is ESM-native and faster than Jest
  - Pairs well with existing Vite build setup
  - @testing-library/react for component testing aligns with React best practices

**Installation:**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Configuration Location:** `recipe-planner/vitest.config.ts`

## Suggested Test Structure

**Location Strategy:**
- Co-locate tests next to source: `ComponentName.tsx` paired with `ComponentName.test.tsx`
- Utility tests in same directory as utilities with `.test.ts` suffix
- Integration tests in `src/__tests__/integration/`

**Naming Convention:**
- `[Module].test.ts(x)` - matches source file name
- Describe blocks: describe("[Component Name]", () => {})

## Test Patterns to Establish

**Component Testing Example:**
```typescript
// src/components/CheckableListItem.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckableListItem } from './CheckableListItem';

describe('CheckableListItem', () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
  });

  it('renders with primary text', () => {
    render(
      <CheckableListItem
        itemKey="test-1"
        checked={false}
        onToggle={mockOnToggle}
        primary="Test Item"
      />
    );
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });

  it('calls onToggle with correct itemKey when checkbox is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CheckableListItem
        itemKey="test-1"
        checked={false}
        onToggle={mockOnToggle}
        primary="Test Item"
      />
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(mockOnToggle).toHaveBeenCalledWith('test-1');
  });

  it('applies strikethrough styling when checked', () => {
    render(
      <CheckableListItem
        itemKey="test-1"
        checked={true}
        onToggle={mockOnToggle}
        primary="Test Item"
      />
    );

    const text = screen.getByText('Test Item');
    expect(text.parentElement).toHaveStyle({ textDecoration: 'line-through' });
  });
});
```

**Utility Function Testing Example:**
```typescript
// src/lib/aggregation/utils/product-utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  createProductKey,
  shouldCreateInstances,
  extractMealDestination,
  determineStorageLocation,
} from './product-utils';
import { ProductType, StorageLocation, type Product } from '../../types';

describe('product-utils', () => {
  describe('createProductKey', () => {
    it('creates unique key for stored products with meal destination', () => {
      const key = createProductKey(
        'prod-123',
        ProductType.Stored,
        'Monday Dinner',
        'meal-456',
        0
      );

      expect(key).toBe('prod-123-Monday Dinner-meal-456-0');
    });

    it('returns product ID for non-stored products', () => {
      const key = createProductKey(
        'prod-789',
        ProductType.Raw,
        'Monday Dinner',
        'meal-456',
        0
      );

      expect(key).toBe('prod-789');
    });
  });

  describe('shouldCreateInstances', () => {
    it('returns true for stored products', () => {
      expect(shouldCreateInstances(ProductType.Stored)).toBe(true);
    });

    it('returns false for raw products', () => {
      expect(shouldCreateInstances(ProductType.Raw)).toBe(false);
    });

    it('returns false for transient products', () => {
      expect(shouldCreateInstances(ProductType.Transient)).toBe(false);
    });
  });

  describe('extractMealDestination', () => {
    it('extracts destination from parentheses', () => {
      const result = extractMealDestination('Chicken (Monday Dinner) #1');

      expect(result.cleanName).toBe('Chicken');
      expect(result.destination).toBe('Monday Dinner');
    });

    it('returns original name when no destination found', () => {
      const result = extractMealDestination('Chicken Breast');

      expect(result.cleanName).toBe('Chicken Breast');
      expect(result.destination).toBeUndefined();
    });
  });

  describe('determineStorageLocation', () => {
    it('uses explicit storage location for stored products', () => {
      const product: Product = {
        id: '1',
        created: '',
        updated: '',
        collectionId: '',
        collectionName: '',
        name: 'Frozen Chicken',
        type: ProductType.Stored,
        storage_location: StorageLocation.Freezer,
      };

      expect(determineStorageLocation(product)).toBe(StorageLocation.Freezer);
    });

    it('defaults to fridge for stored products without explicit location', () => {
      const product: Product = {
        id: '1',
        created: '',
        updated: '',
        collectionId: '',
        collectionName: '',
        name: 'Cooked Rice',
        type: ProductType.Stored,
      };

      expect(determineStorageLocation(product)).toBe(StorageLocation.Fridge);
    });

    it('returns pantry for raw products marked as pantry', () => {
      const product: Product = {
        id: '1',
        created: '',
        updated: '',
        collectionId: '',
        collectionName: '',
        name: 'Rice',
        type: ProductType.Raw,
        pantry: true,
      };

      expect(determineStorageLocation(product)).toBe('pantry');
    });
  });
});
```

**Async/API Testing Example:**
```typescript
// src/lib/api.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAll, getOne, create, update, remove } from './api';
import { pb } from './pocketbase';

// Mock PocketBase
vi.mock('./pocketbase', () => ({
  pb: {
    collection: vi.fn(),
  },
}));

describe('API functions', () => {
  const mockCollection = {
    getFullList: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (pb.collection as any).mockReturnValue(mockCollection);
  });

  describe('getAll', () => {
    it('calls collection.getFullList with correct options', async () => {
      const mockData = [{ id: '1', name: 'Item 1' }];
      mockCollection.getFullList.mockResolvedValue(mockData);

      const result = await getAll('recipes', { sort: 'name', expand: 'tags' });

      expect(pb.collection).toHaveBeenCalledWith('recipes');
      expect(mockCollection.getFullList).toHaveBeenCalledWith({
        expand: 'tags',
        sort: 'name',
        filter: undefined,
      });
      expect(result).toEqual(mockData);
    });
  });

  describe('create', () => {
    it('creates a record and returns it', async () => {
      const newItem = { name: 'New Recipe', notes: 'Test' };
      const created = { id: '1', ...newItem, created: '', updated: '', collectionId: '', collectionName: '' };
      mockCollection.create.mockResolvedValue(created);

      const result = await create('recipes', newItem);

      expect(mockCollection.create).toHaveBeenCalledWith(newItem);
      expect(result).toEqual(created);
    });
  });

  describe('remove', () => {
    it('deletes a record and returns true', async () => {
      mockCollection.delete.mockResolvedValue(true);

      const result = await remove('recipes', 'recipe-1');

      expect(mockCollection.delete).toHaveBeenCalledWith('recipe-1');
      expect(result).toBe(true);
    });
  });
});
```

## Mocking Strategy

**What to Mock:**
- PocketBase API calls (external service)
- Router functions (`useNavigate`, `useParams`, `useLocation`)
- Event handlers and callbacks
- Timers for async operations

**What NOT to Mock:**
- Child components (use render from @testing-library/react)
- DOM elements
- React hooks like `useState` (use the real ones)
- Material-UI components (render them)

**Mocking Pattern:**
```typescript
import { vi } from 'vitest';

// Mock module
vi.mock('../lib/api', () => ({
  getAll: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

// Mock function
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));
```

## Fixtures and Test Data

**Location:** Create `src/__tests__/fixtures/` or `src/__tests__/mocks/`

**Example fixture:**
```typescript
// src/__tests__/fixtures/product-fixtures.ts
import { ProductType, StorageLocation, type Product } from '../../lib/types';

export const mockProducts = {
  rawChicken: {
    id: 'prod-1',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    collectionId: 'products',
    collectionName: 'products',
    name: 'Chicken Breast',
    type: ProductType.Raw,
    store: 'store-1',
  } as Product,

  storedRice: {
    id: 'prod-2',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    collectionId: 'products',
    collectionName: 'products',
    name: 'Cooked Rice',
    type: ProductType.Stored,
    storage_location: StorageLocation.Fridge,
  } as Product,
};
```

## Coverage

**Current Status:** Not enforced or measured

**Recommendations:**
- Set coverage threshold to 70% for lines/functions
- Focus initially on critical paths (API, utility functions, complex components)
- Run coverage reports during CI/CD

**View Coverage (when implemented):**
```bash
npm run test:coverage
```

## Test Commands

**Once testing framework is set up, add to package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run"
  }
}
```

## Critical Areas for Testing

**High Priority:**
- `src/lib/api.ts` - PocketBase API layer (all CRUD operations)
- `src/lib/aggregation/` - Complex business logic for meal planning and flow generation
- `src/lib/aggregation/builders/` - Flow connection creation logic
- `src/lib/aggregation/utils/` - Product and variant processing utilities

**Medium Priority:**
- `src/components/` - Reusable component behavior (CheckableListItem, ProductForm, etc.)
- `src/pages/` - Page-level integration tests for main user workflows
- `src/lib/listProviders/` - List generation and formatting

**Lower Priority (but useful):**
- Layout and navigation components (mostly UI structure)
- Material-UI wrapper components

---

*Testing analysis: 2026-03-01*
