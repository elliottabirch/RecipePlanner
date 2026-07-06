import { useCallback, useEffect, useRef, useState } from "react";
import { getAll, create, update, collections } from "../lib/api";
import type { ShoppingState } from "../lib/types";
import { createSyncQueue, type SyncQueue } from "../lib/sync-queue";

/** Local, optimistic per-line-key shopping state (D-03, D-13, SHOP-01/07). */
export interface ShoppingStateEntry {
  /** PocketBase record id once the first sync completes; null before that. */
  recordId: string | null;
  checked: boolean;
  have_quantity: number | null;
  resolution: "buy" | "make" | "skip";
}

/** The subset of ShoppingStateEntry actually persisted to PocketBase. */
type WritableFields = Pick<ShoppingStateEntry, "checked" | "have_quantity" | "resolution">;

const DEFAULT_ENTRY: ShoppingStateEntry = {
  recordId: null,
  checked: false,
  have_quantity: null,
  resolution: "buy",
};

/**
 * Optimistic per-weekly-plan persistence hook (D-03, D-13, SHOP-01/SHOP-07).
 *
 * Loads all `shopping_state` rows for `weeklyPlanId` into a `Map` keyed by
 * `line_key`. `setChecked`/`setHaveQuantity`/`setResolution` update that Map
 * synchronously (optimistic) and enqueue the PocketBase write onto a
 * `createSyncQueue` instance (02-04), which owns retry/backoff/coalescing.
 * Writes use query-then-branch upsert (02-RESEARCH Pitfall 5): existing
 * `recordId` -> update; otherwise `getAll` by `(weekly_plan, line_key)` filter
 * -> update-or-create, caching the resulting id back into the Map.
 *
 * Last-write-wins (D-13) — no conflict resolution beyond the queue's
 * per-key coalescing (each enqueue carries the full writable-field set, so a
 * coalesced payload never drops an earlier partial update).
 */
export function useShoppingState(weeklyPlanId: string) {
  const [state, setState] = useState<Map<string, ShoppingStateEntry>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState(0);

  // Refs so the queue's process() closure always sees current values without
  // needing to be recreated (createSyncQueue is instantiated once, below).
  const stateRef = useRef(state);
  stateRef.current = state;
  const weeklyPlanIdRef = useRef(weeklyPlanId);
  weeklyPlanIdRef.current = weeklyPlanId;

  const setRecordId = useCallback((lineKey: string, recordId: string) => {
    setState((prev) => {
      const entry = prev.get(lineKey);
      if (!entry || entry.recordId === recordId) return prev;
      const next = new Map(prev);
      next.set(lineKey, { ...entry, recordId });
      return next;
    });
  }, []);

  const queueRef = useRef<SyncQueue<WritableFields> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createSyncQueue<WritableFields>({
      process: async (lineKey, payload) => {
        const planId = weeklyPlanIdRef.current;
        if (!planId) return;

        const current = stateRef.current.get(lineKey);
        if (current?.recordId) {
          await update<ShoppingState>(collections.shoppingState, current.recordId, payload);
          return;
        }

        // Query-then-branch upsert (02-RESEARCH Pitfall 5) — avoids racing two
        // concurrent create()s against the (weekly_plan, line_key) unique pair.
        const existing = await getAll<ShoppingState>(collections.shoppingState, {
          filter: `weekly_plan="${planId}" && line_key="${lineKey}"`,
        });
        if (existing[0]) {
          await update<ShoppingState>(collections.shoppingState, existing[0].id, payload);
          setRecordId(lineKey, existing[0].id);
        } else {
          const created = await create<ShoppingState>(collections.shoppingState, {
            weekly_plan: planId,
            line_key: lineKey,
            ...payload,
          });
          setRecordId(lineKey, created.id);
        }
      },
      onChange: (counts) => {
        setPendingCount(counts.pending);
        setFailed(counts.failed);
      },
    });
  }

  useEffect(() => {
    if (!weeklyPlanId) {
      setState(new Map());
      return;
    }
    let cancelled = false;
    getAll<ShoppingState>(collections.shoppingState, {
      filter: `weekly_plan="${weeklyPlanId}"`,
    })
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, ShoppingStateEntry>();
        for (const row of rows) {
          map.set(row.line_key, {
            recordId: row.id,
            checked: row.checked ?? false,
            have_quantity: row.have_quantity ?? null,
            resolution: row.resolution ?? "buy",
          });
        }
        setState(map);
      })
      .catch((err) => {
        console.error("Failed to load shopping state:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [weeklyPlanId]);

  const applyOptimistic = useCallback(
    (lineKey: string, patch: Partial<WritableFields>) => {
      if (!weeklyPlanIdRef.current) return; // guard empty weeklyPlanId
      setState((prev) => {
        const existing = prev.get(lineKey) ?? DEFAULT_ENTRY;
        const merged: ShoppingStateEntry = { ...existing, ...patch };
        const next = new Map(prev);
        next.set(lineKey, merged);
        // Enqueue the full writable-field set (not just this patch) so that
        // coalescing two rapid enqueues for the same key never drops an
        // earlier field's change (sync-queue replaces, not merges, payloads).
        queueRef.current!.enqueue(lineKey, {
          checked: merged.checked,
          have_quantity: merged.have_quantity,
          resolution: merged.resolution,
        });
        return next;
      });
    },
    []
  );

  const setChecked = useCallback(
    (lineKey: string, checked: boolean) => applyOptimistic(lineKey, { checked }),
    [applyOptimistic]
  );
  const setHaveQuantity = useCallback(
    (lineKey: string, have_quantity: number | null) =>
      applyOptimistic(lineKey, { have_quantity }),
    [applyOptimistic]
  );
  const setResolution = useCallback(
    (lineKey: string, resolution: ShoppingStateEntry["resolution"]) =>
      applyOptimistic(lineKey, { resolution }),
    [applyOptimistic]
  );

  return {
    state,
    isSyncing: pendingCount > 0,
    pendingCount,
    failed,
    setChecked,
    setHaveQuantity,
    setResolution,
  };
}
