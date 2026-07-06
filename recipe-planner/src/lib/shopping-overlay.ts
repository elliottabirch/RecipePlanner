/**
 * Derive-then-overlay layer for the shopping list.
 *
 * Pure, dependency-free join of the flow-graph-derived `AggregatedProduct`
 * list with the persisted shopping-state map (have-N, resolution). No React
 * import, no PocketBase import — see 02-RESEARCH Architecture Patterns
 * Pattern 2 / Don't-Hand-Roll (unit conversion is NOT re-implemented here;
 * have-N is entered/compared in the line's existing display unit).
 *
 * D-04: resolution enum is `buy` | `make` | `skip`.
 * D-05/D-06: a resolved line (resolution !== 'buy', or have >= needed) stays
 * visible on-screen but is excluded from the export list.
 */
import type { AggregatedProduct } from "./aggregation";
import { getShoppingCheckboxKey } from "../constants/outputs";

/**
 * Minimal structural shape this module needs from a persisted shopping-state
 * row. Defined locally rather than imported from `./types` since 02-05 (the
 * PocketBase `ShoppingState` collection type) is a sibling Wave-1 plan — this
 * module must not hard-depend on that plan's ordering.
 */
export interface ShoppingStateEntry {
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip";
}

export interface OverlaidShoppingItem extends AggregatedProduct {
  /** Quantity the shopper already has on hand, or `null` if not entered. */
  haveQuantity: number | null;
  /** `max(0, totalQuantity - haveQuantity)`, or `null` when haveQuantity is null. */
  remaining: number | null;
  /** D-04: buy | make | skip. Defaults to 'buy' when no state entry exists. */
  resolution: "buy" | "make" | "skip";
  /** true when resolution !== 'buy' OR remaining <= 0 (D-05/D-06). */
  isResolved: boolean;
}

/**
 * Overlay a single aggregated shopping-list item with its persisted state
 * entry (looked up via `getShoppingCheckboxKey(item.lineId)`).
 *
 * A line with no state entry overlays to: haveQuantity null, remaining null,
 * resolution 'buy', isResolved false.
 */
export function overlayShoppingItem(
  item: AggregatedProduct,
  state: Map<string, ShoppingStateEntry>
): OverlaidShoppingItem {
  const key = getShoppingCheckboxKey(item.lineId);
  const entry = state.get(key);

  const haveQuantity = entry?.have_quantity ?? null;
  const remaining =
    haveQuantity != null ? Math.max(0, item.totalQuantity - haveQuantity) : null;
  const resolution = entry?.resolution ?? "buy";
  const isResolved = resolution !== "buy" || (remaining !== null && remaining <= 0);

  return {
    ...item,
    haveQuantity,
    remaining,
    resolution,
    isResolved,
  };
}

/**
 * D-06: the export excludes every resolved line (make / skip / have-complete),
 * keeping only buy-with-remaining lines. The on-screen list is unaffected by
 * this function — callers show the full `isResolved` set dimmed/struck (D-05)
 * and only apply `filterForExport` on the export path.
 */
export function filterForExport(
  items: OverlaidShoppingItem[]
): OverlaidShoppingItem[] {
  return items.filter((item) => !item.isResolved);
}
