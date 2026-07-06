// Pure, React-free optimistic-write retry/backoff primitive (D-13, SHOP-07).
//
// Deliberately NOT a generic offline queue: state lives in memory only for the
// life of the module instance (no localStorage/IndexedDB persistence — see
// Phase 2 CONTEXT.md "Deferred Ideas"). `useShoppingState` (02-06) wires a
// `createSyncQueue()` instance's `process` to a PocketBase upsert and reads
// `pending`/`failed` to drive `SyncIndicator`.

export interface SyncQueueCounts {
  pending: number;
  failed: number;
}

export interface CreateSyncQueueOptions<T> {
  /** Performs the actual write for a coalesced payload. Reject to trigger retry/backoff. */
  process: (key: string, payload: T) => Promise<void>;
  /**
   * Number of retry attempts allowed after the initial attempt fails, before the
   * key is marked failed (retry-exhausted). Total invocations for a payload that
   * never succeeds = maxAttempts + 1 (the initial attempt plus maxAttempts retries).
   * Planner-discretion default: 3 (D-13, 02-RESEARCH Assumptions Log A2).
   */
  maxAttempts?: number;
  /** Base delay (ms) for exponential backoff: baseDelayMs * 2 ** attempt. Default 1000. */
  baseDelayMs?: number;
  /** Fired whenever pending/failed counts change, so a hook can drive UI without polling. */
  onChange?: (counts: SyncQueueCounts) => void;
  /**
   * Injectable scheduler for retry delays, so tests can avoid real timers.
   * Defaults to the global `setTimeout` — compatible with vitest fake timers
   * (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`), since fake timers
   * replace the global `setTimeout` this default delegates to.
   */
  scheduleRetry?: (fn: () => void, delayMs: number) => void;
}

export interface SyncQueue<T> {
  /**
   * Enqueue a write for `key`. If a write for the same key is already in
   * flight (or awaiting a retry), the newest `payload` replaces the pending
   * one and `process` is not invoked concurrently for that key.
   */
  enqueue: (key: string, payload: T) => void;
  /** Count of keys with an active (in-flight or awaiting-retry) write. */
  readonly pending: number;
  /** Count of keys that exhausted retries (retry-exhausted, not silently dropped). */
  readonly failed: number;
}

interface QueueEntry<T> {
  payload: T;
  attempt: number;
}

const defaultScheduleRetry = (fn: () => void, delayMs: number): void => {
  setTimeout(fn, delayMs);
};

export function createSyncQueue<T>(
  options: CreateSyncQueueOptions<T>
): SyncQueue<T> {
  const {
    process,
    maxAttempts = 3,
    baseDelayMs = 1000,
    onChange,
    scheduleRetry = defaultScheduleRetry,
  } = options;

  // Keys with a payload actively pending: either currently in flight (a
  // process() call is awaiting) or coalesced/waiting for a scheduled retry.
  const entries = new Map<string, QueueEntry<T>>();
  // Keys with a process() call currently in flight or a retry timer pending —
  // guards against double-invoking process() concurrently for the same key.
  const inFlight = new Set<string>();
  // Keys that exhausted maxAttempts retries without success.
  const failedKeys = new Set<string>();

  function emitChange(): void {
    onChange?.({ pending: entries.size, failed: failedKeys.size });
  }

  function runAttempt(key: string): void {
    const entry = entries.get(key);
    if (!entry) {
      inFlight.delete(key);
      return;
    }
    const payloadSent = entry.payload;
    inFlight.add(key);

    process(key, payloadSent).then(
      () => {
        const current = entries.get(key);
        if (current && current.payload !== payloadSent) {
          // A newer payload was coalesced in while this write was in flight —
          // it hasn't been synced yet, so process it immediately (fresh attempt count).
          current.attempt = 0;
          runAttempt(key);
          return;
        }
        entries.delete(key);
        inFlight.delete(key);
        emitChange();
      },
      () => {
        const current = entries.get(key);
        if (!current) {
          inFlight.delete(key);
          return;
        }
        if (current.attempt < maxAttempts) {
          const delayMs = baseDelayMs * 2 ** current.attempt;
          current.attempt += 1;
          scheduleRetry(() => {
            // Re-check: the key may have been coalesced with a new payload
            // (still present in entries) or nothing changed — either way retry.
            if (entries.has(key)) {
              runAttempt(key);
            } else {
              inFlight.delete(key);
            }
          }, delayMs);
          // Deliberately stay in `inFlight` until the retry fires, so a coalescing
          // enqueue during the backoff window updates the payload without
          // triggering a second concurrent process() call.
        } else {
          entries.delete(key);
          failedKeys.add(key);
          inFlight.delete(key);
          emitChange();
        }
      }
    );
  }

  function enqueue(key: string, payload: T): void {
    // Re-enqueuing a previously retry-exhausted key means the caller is
    // retrying again — it's no longer "failed", it's actively pending once
    // more (recovery-clears-failed happens as soon as a fresh attempt starts,
    // not only once that attempt confirms success).
    failedKeys.delete(key);
    const existing = entries.get(key);
    if (existing) {
      existing.payload = payload;
    } else {
      entries.set(key, { payload, attempt: 0 });
    }
    emitChange();
    if (!inFlight.has(key)) {
      runAttempt(key);
    }
  }

  return {
    enqueue,
    get pending() {
      return entries.size;
    },
    get failed() {
      return failedKeys.size;
    },
  };
}
