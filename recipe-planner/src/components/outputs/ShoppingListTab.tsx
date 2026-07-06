import { useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
} from "@mui/material";
import {
  ContentCopy as ContentCopyIcon,
  Remove as RemoveIcon,
  Add as AddIcon,
  SwapHoriz as SwapIcon,
  Restaurant as MakeItIcon,
} from "@mui/icons-material";
import type { AggregatedProduct, InventoryStockWarning, RecipeGraphData, PlannedMealWithRecipe } from "../../lib/aggregation";
import type { OverlaidShoppingItem } from "../../lib/shopping-overlay";
import { CheckableListItem } from "../CheckableListItem";
import { EmptyState } from "../EmptyState";
import { OutOfStockSection } from "./OutOfStockSection";
import {
  UI_TEXT,
  getPantryCheckboxKey,
  getShoppingCheckboxKey,
} from "../../constants/outputs";

interface GroupedShoppingList {
  byStore: Map<string, Map<string, OverlaidShoppingItem[]>>;
  pantryItems: OverlaidShoppingItem[];
}

export interface ManualShoppingItem {
  productId: string;
  productName: string;
  storeName?: string;
  sectionName?: string;
}

const UNCATEGORIZED_STORE = "Other";
const UNCATEGORIZED_SECTION = "Uncategorized";

// Render-layer display rounding only — units.ts intentionally stays exact
// and defers this to whatever renders the quantity to the user.
const formatQty = (n: number): string =>
  Number.isFinite(n) ? String(Number(n.toFixed(2))) : String(n);

// Resolution chip labels (UI-SPEC Copywriting Contract).
const RESOLUTION_CHIP_LABEL: Record<OverlaidShoppingItem["resolution"], string> = {
  make: "Making",
  skip: "Skipped",
  buy: "Have enough", // only reached when isResolved && resolution === 'buy' (have >= needed)
};

function mergeManualItemsIntoGroups(
  byStore: Map<string, Map<string, OverlaidShoppingItem[]>>,
  manualItems: ManualShoppingItem[]
): Map<string, Map<string, OverlaidShoppingItem[]>> {
  if (manualItems.length === 0) return byStore;

  const merged = new Map(
    Array.from(byStore.entries()).map(([store, sections]) => [
      store,
      new Map(
        Array.from(sections.entries()).map(([section, items]) => [
          section,
          [...items],
        ])
      ),
    ])
  );

  for (const item of manualItems) {
    const storeName = item.storeName || UNCATEGORIZED_STORE;
    const sectionName = item.sectionName || UNCATEGORIZED_SECTION;

    if (!merged.has(storeName)) {
      merged.set(storeName, new Map());
    }
    const sections = merged.get(storeName)!;
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)!.push({
      productId: `manual-${item.productId}`,
      productName: item.productName,
      productType: "raw" as AggregatedProduct["productType"],
      isPantry: false,
      totalQuantity: 1,
      unit: "",
      lineId: `manual-${item.productId}`,
      sources: [{ recipeName: "Store-bought", quantity: 1, unit: "" }],
      // Manual items never have persisted shopping_state — overlay to the
      // same unresolved defaults `overlayShoppingItem` uses for a missing entry.
      haveQuantity: null,
      remaining: null,
      resolution: "buy",
      isResolved: false,
    });
  }

  return merged;
}

interface ShoppingListTabProps {
  groupedShoppingList: GroupedShoppingList;
  checkedItems: Set<string>;
  onToggleChecked: (key: string) => void;
  onExport: () => void;
  stockWarnings?: InventoryStockWarning[];
  plannedMeals?: PlannedMealWithRecipe[];
  recipeData?: Map<string, RecipeGraphData>;
  onAddRecipeToPlan?: (recipeId: string) => void;
  onAddToShoppingList?: (item: ManualShoppingItem) => void;
  manualShoppingItems?: ManualShoppingItem[];
  // Store-time swap/make-it entry points (SHOP-03/04, D-10). Handlers and
  // dialogs live in Outputs (02-08); the per-line buttons that call these
  // props are rendered below (SHOP-06).
  onSwap?: (item: AggregatedProduct) => void;
  onMakeIt?: (item: AggregatedProduct) => void;
  /** true when the product has a `source_recipe` (D-10 gate). */
  canMakeIt?: (productId: string) => boolean;
  /**
   * Persist a have-N entry for a line (SHOP-02, D-02). Keyed by the line's
   * shopping-state key (`getShoppingCheckboxKey(lineId)`), matching
   * `useShoppingState`'s `line_key`. `null` clears the entry (un-resolve of
   * a have-complete line).
   */
  onSetHaveQuantity?: (lineKey: string, quantity: number | null) => void;
  /** Set/clear a line's resolution (D-04/D-05). */
  onSetResolution?: (
    lineKey: string,
    resolution: OverlaidShoppingItem["resolution"]
  ) => void;
}

export function ShoppingListTab({
  groupedShoppingList,
  checkedItems,
  onToggleChecked,
  onExport,
  stockWarnings,
  plannedMeals,
  recipeData,
  onAddRecipeToPlan,
  onAddToShoppingList,
  manualShoppingItems,
  onSwap,
  onMakeIt,
  canMakeIt,
  onSetHaveQuantity,
  onSetResolution,
}: ShoppingListTabProps) {
  const hasOutOfStock = stockWarnings?.some((w) => !w.inStock) ?? false;

  const mergedByStore = useMemo(
    () =>
      mergeManualItemsIntoGroups(
        groupedShoppingList.byStore,
        manualShoppingItems || []
      ),
    [groupedShoppingList.byStore, manualShoppingItems]
  );

  const hasItems =
    mergedByStore.size > 0 ||
    groupedShoppingList.pantryItems.length > 0 ||
    hasOutOfStock;

  if (!hasItems) {
    return <EmptyState message={UI_TEXT.noShoppingItems} />;
  }

  // Swap/make-it icon buttons, shared by both the have-N line and the
  // pantry-style line (48x48 tap targets, 8px gap, per UI-SPEC Spacing).
  const renderLineActions = (item: OverlaidShoppingItem) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {onSwap && (
        <IconButton
          size="medium"
          aria-label={`Swap ${item.productName}`}
          onClick={() => onSwap(item)}
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <SwapIcon />
        </IconButton>
      )}
      {onMakeIt && canMakeIt?.(item.productId) && (
        <IconButton
          size="medium"
          aria-label="Make it at home"
          onClick={() => onMakeIt(item)}
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <MakeItIcon />
        </IconButton>
      )}
    </Box>
  );

  const renderNonPantryLine = (item: OverlaidShoppingItem) => {
    const key = getShoppingCheckboxKey(item.lineId);
    const primary = item.totalQuantity && item.unit
      ? `${item.productName} — ${formatQty(item.totalQuantity)} ${item.unit}`
      : item.productName;
    const secondary = item.sources.map((s) => s.recipeName).join(", ");

    const total = item.totalQuantity;
    const haveValue = item.haveQuantity ?? 0;
    const remainingValue = item.remaining ?? Math.max(0, total - haveValue);
    const resolved = item.isResolved;
    const atMin = haveValue <= 0;
    const atMax = haveValue >= total;

    const handleDecrease = () => {
      if (atMin) return;
      onSetHaveQuantity?.(key, Math.max(0, haveValue - 1));
    };
    const handleIncrease = () => {
      if (atMax) return;
      onSetHaveQuantity?.(key, Math.min(total, haveValue + 1));
    };
    const handleUnresolve = () => {
      if (item.resolution !== "buy") {
        onSetResolution?.(key, "buy");
      } else {
        // resolved via have >= needed — clear the have-N entry
        onSetHaveQuantity?.(key, null);
      }
    };

    return (
      <ListItem
        key={item.lineId}
        disablePadding
        sx={{
          opacity: resolved ? 0.55 : 1,
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.5,
        }}
      >
        <ListItemText
          primaryTypographyProps={{ variant: "body1" }}
          primary={
            <span
              style={{ textDecoration: resolved ? "line-through" : "none" }}
            >
              {primary}
            </span>
          }
          secondary={secondary}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            size="medium"
            aria-label="Decrease have quantity"
            onClick={handleDecrease}
            disabled={atMin}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <RemoveIcon />
          </IconButton>
          <Typography sx={{ minWidth: 40, textAlign: "center" }}>
            {formatQty(haveValue)}
          </Typography>
          <IconButton
            size="medium"
            aria-label="Increase have quantity"
            onClick={handleIncrease}
            disabled={atMax}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <AddIcon />
          </IconButton>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ minWidth: 64 }}
        >
          {remainingValue > 0 ? `${formatQty(remainingValue)} to buy` : "All set"}
        </Typography>

        {resolved && (
          <Box
            sx={{
              minWidth: 48,
              minHeight: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Chip
              size="small"
              variant="outlined"
              label={RESOLUTION_CHIP_LABEL[item.resolution]}
              onClick={handleUnresolve}
              aria-label={`Undo resolution for ${item.productName}`}
              sx={{ cursor: "pointer" }}
            />
          </Box>
        )}

        {renderLineActions(item)}
      </ListItem>
    );
  };

  const renderPantryStyleLine = (item: OverlaidShoppingItem) => {
    const key = getShoppingCheckboxKey(item.lineId);
    const primary = item.totalQuantity && item.unit
      ? `${item.productName} — ${formatQty(item.totalQuantity)} ${item.unit}`
      : item.productName;
    const secondary = item.sources.map((s) => s.recipeName).join(", ");

    return (
      <Box
        key={item.lineId}
        sx={{ display: "flex", alignItems: "center", gap: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CheckableListItem
            itemKey={key}
            checked={checkedItems.has(key)}
            onToggle={onToggleChecked}
            primary={primary}
            secondary={secondary}
            disablePadding
          />
        </Box>
        {renderLineActions(item)}
      </Box>
    );
  };

  return (
    <>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">{UI_TEXT.shoppingListTitle}</Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={onExport}
          startIcon={<ContentCopyIcon />}
        >
          {UI_TEXT.copyToClipboard}
        </Button>
      </Box>

      {/* Out of Stock Inventory Items */}
      {hasOutOfStock &&
        stockWarnings &&
        plannedMeals &&
        recipeData &&
        onAddRecipeToPlan &&
        onAddToShoppingList && (
          <OutOfStockSection
            stockWarnings={stockWarnings}
            plannedMeals={plannedMeals}
            recipeData={recipeData}
            onAddRecipeToPlan={onAddRecipeToPlan}
            onAddToShoppingList={onAddToShoppingList}
          />
        )}

      {/* Items by Store/Section */}
      {Array.from(mergedByStore.entries()).map(
        ([storeName, sections]) => (
          <Box key={storeName} mb={3}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
              {storeName}
            </Typography>
            {Array.from(sections.entries()).map(([sectionName, items]) => {
              const visibleItems = items.filter((item) => {
                if (item.isPantry) {
                  const pantryKey = getPantryCheckboxKey(item.productId);
                  return !checkedItems.has(pantryKey);
                }
                return true;
              });

              if (visibleItems.length === 0) return null;

              return (
                <Box key={sectionName} ml={2} mb={2}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    gutterBottom
                  >
                    {sectionName}
                  </Typography>
                  <List dense>
                    {visibleItems.map((item) =>
                      item.isPantry
                        ? renderPantryStyleLine(item)
                        : renderNonPantryLine(item)
                    )}
                  </List>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* Pantry Check Section */}
      {groupedShoppingList.pantryItems.length > 0 && (
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            {UI_TEXT.pantryCheckTitle}
          </Typography>
          <List dense>
            {groupedShoppingList.pantryItems.map((item) => {
              const key = getPantryCheckboxKey(item.productId);
              const showQuantity = item.trackQuantity;
              const primary = showQuantity
                ? `${item.productName} — ${formatQty(item.totalQuantity)} ${item.unit}`
                : item.productName;
              const secondary = showQuantity
                ? item.sources.map((s) => s.recipeName).join(", ")
                : undefined;

              return (
                <CheckableListItem
                  key={item.productId}
                  itemKey={key}
                  checked={checkedItems.has(key)}
                  onToggle={onToggleChecked}
                  primary={primary}
                  secondary={secondary}
                  disablePadding
                />
              );
            })}
          </List>
        </Box>
      )}
    </>
  );
}
