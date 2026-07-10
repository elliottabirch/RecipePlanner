// Cook-mode check-off progress (D-03). Direct analog of useShoppingState.ts's
// optimistic createSyncQueue-backed upsert pattern; keyed by
// (weekly_plan, step_instance) instead of (weekly_plan, line_key). Cross-
// device, survives tablet refresh/sleep (D-03 — new cook_progress collection,
// never overloads shopping_state). step_instance is StepInstance.id
// (`${plannedMealId}::${step.id}`, see scheduler/week-graph.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import { getAll, create, update, collections } from "../lib/api";
import type { CookProgress } from "../lib/types";
import { createSyncQueue, type SyncQueue } from "../lib/sync-queue";

/** Local, optimistic per-step-instance cook progress (D-03). */
export interface CookProgressEntry {
  /** PocketBase record id once the first sync completes; null before that. */
  recordId: string | null;
  checked: boolean;
  checked_at: string | null;
}

/** The subset of CookProgressEntry actually persisted to PocketBase. */
type WritableFields = Pick<CookProgressEntry, "checked" | "checked_at">;

const DEFAULT_ENTRY: CookProgressEntry = {
  recordId: null,
  checked: false,
  checked_at: null,
};

/**
 * Optimistic per-weekly-plan cook-progress persistence hook (D-03, PREP-04).
 *
 * Loads all `cook_progress` rows for `weeklyPlanId` into a `Map` keyed by
 * `step_instance`. `setChecked` updates that Map synchronously (optimistic)
 * and enqueues the PocketBase write onto a `createSyncQueue` instance
 * (reused unmodified from Phase 2), which owns retry/backoff/coalescing.
 * Writes use query-then-branch upsert (mirrors useShoppingState.ts,
 * 02-RESEARCH Pitfall 5): existing `recordId` -> update; otherwise `getAll`
 * by `(weekly_plan, step_instance)` filter -> update-or-create, caching the
 * resulting id back into the Map. This is also T-05-11a's mitigation:
 * query-then-branch prevents duplicate records from concurrent cross-device
 * check-off on the same (weekly_plan, step_instance) pair.
 */
export function useCookProgress(weeklyPlanId: string) {
  const [state, setState] = useState<Map<string, CookProgressEntry>>(
    new Map()
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState(0);

  // Refs so the queue's process() closure always sees current values without
  // needing to be recreated (createSyncQueue is instantiated once, below).
  const stateRef = useRef(state);
  stateRef.current = state;
  const weeklyPlanIdRef = useRef(weeklyPlanId);
  weeklyPlanIdRef.current = weeklyPlanId;

  const setRecordId = useCallback((stepInstance: string, recordId: string) => {
    setState((prev) => {
      const entry = prev.get(stepInstance);
      if (!entry || entry.recordId === recordId) return prev;
      const next = new Map(prev);
      next.set(stepInstance, { ...entry, recordId });
      return next;
    });
  }, []);

  const queueRef = useRef<SyncQueue<WritableFields> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createSyncQueue<WritableFields>({
      process: async (stepInstance, payload) => {
        const planId = weeklyPlanIdRef.current;
        if (!planId) return;

        const current = stateRef.current.get(stepInstance);
        if (current?.recordId) {
          await update<CookProgress>(
            collections.cookProgress,
            current.recordId,
            payload
          );
          return;
        }

        // Query-then-branch upsert — avoids racing two concurrent create()s
        // against the (weekly_plan, step_instance) unique pair (T-05-11a).
        const existing = await getAll<CookProgress>(collections.cookProgress, {
          filter: `weekly_plan="${planId}" && step_instance="${stepInstance}"`,
        });
        if (existing[0]) {
          await update<CookProgress>(
            collections.cookProgress,
            existing[0].id,
            payload
          );
          setRecordId(stepInstance, existing[0].id);
        } else {
          const created = await create<CookProgress>(collections.cookProgress, {
            weekly_plan: planId,
            step_instance: stepInstance,
            ...payload,
          });
          setRecordId(stepInstance, created.id);
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
    getAll<CookProgress>(collections.cookProgress, {
      filter: `weekly_plan="${weeklyPlanId}"`,
    })
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, CookProgressEntry>();
        for (const row of rows) {
          map.set(row.step_instance, {
            recordId: row.id,
            checked: row.checked ?? false,
            checked_at: row.checked_at ?? null,
          });
        }
        setState(map);
      })
      .catch((err) => {
        console.error("Failed to load cook progress:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [weeklyPlanId]);

  const applyOptimistic = useCallback(
    (stepInstance: string, patch: Partial<WritableFields>) => {
      if (!weeklyPlanIdRef.current) return; // guard empty weeklyPlanId
      setState((prev) => {
        const existing = prev.get(stepInstance) ?? DEFAULT_ENTRY;
        const merged: CookProgressEntry = { ...existing, ...patch };
        const next = new Map(prev);
        next.set(stepInstance, merged);
        // Enqueue the full writable-field set (not just this patch) so that
        // coalescing two rapid enqueues for the same key never drops an
        // earlier field's change (sync-queue replaces, not merges, payloads).
        queueRef.current!.enqueue(stepInstance, {
          checked: merged.checked,
          checked_at: merged.checked_at,
        });
        return next;
      });
    },
    []
  );

  const setChecked = useCallback(
    (stepInstance: string, checked: boolean) =>
      applyOptimistic(stepInstance, {
        checked,
        checked_at: checked ? new Date().toISOString() : null,
      }),
    [applyOptimistic]
  );

  return {
    state,
    isSyncing: pendingCount > 0,
    pendingCount,
    failed,
    setChecked,
  };
}
