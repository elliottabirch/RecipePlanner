import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSyncQueue } from "./sync-queue";

describe("createSyncQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces by key: a second enqueue while the first is in flight replaces the payload and does not double-invoke process", async () => {
    let resolveFirst: (() => void) | undefined;
    const process = vi.fn((_key: string, _payload: string) => {
      return new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const queue = createSyncQueue<string>({ process });

    queue.enqueue("line-1", "payload-A");
    // Still in flight (first promise unresolved) — coalesce a newer payload.
    queue.enqueue("line-1", "payload-B");

    expect(process).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledWith("line-1", "payload-A");
    expect(queue.pending).toBe(1);

    // Resolve the in-flight call; since payload-B differs from what was sent,
    // the queue should immediately fire a second process() call with payload-B.
    resolveFirst?.();
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(2));
    expect(process).toHaveBeenNthCalledWith(2, "line-1", "payload-B");
  });

  it("decrements pending and fires onChange when process resolves", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    const queue = createSyncQueue<string>({ process, onChange });

    queue.enqueue("line-1", "payload-A");
    expect(queue.pending).toBe(1);
    expect(onChange).toHaveBeenCalledWith({ pending: 1, failed: 0 });

    await vi.waitFor(() => expect(queue.pending).toBe(0));
    expect(onChange).toHaveBeenCalledWith({ pending: 0, failed: 0 });
  });

  it("retries a failing write with exponential backoff (baseDelayMs * 2 ** attempt)", async () => {
    const process = vi
      .fn<(key: string, payload: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network drop"))
      .mockRejectedValueOnce(new Error("network drop"))
      .mockResolvedValueOnce(undefined);
    const queue = createSyncQueue<string>({
      process,
      maxAttempts: 3,
      baseDelayMs: 1000,
    });

    queue.enqueue("line-1", "payload-A");
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(1));

    // First retry after 1000ms (baseDelayMs * 2**0)
    await vi.advanceTimersByTimeAsync(999);
    expect(process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(2));

    // Second retry after 2000ms (baseDelayMs * 2**1)
    await vi.advanceTimersByTimeAsync(1999);
    expect(process).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(3));

    await vi.waitFor(() => expect(queue.pending).toBe(0));
    expect(queue.failed).toBe(0);
  });

  it("moves a key to failed (retry-exhausted) after maxAttempts rejections, without silently dropping it", async () => {
    const process = vi.fn().mockRejectedValue(new Error("permanent drop"));
    const onChange = vi.fn();
    const queue = createSyncQueue<string>({
      process,
      maxAttempts: 2,
      baseDelayMs: 1000,
      onChange,
    });

    queue.enqueue("line-1", "payload-A");
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(1000); // retry 1 (attempt 0 -> delay 1000*2**0)
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(2000); // retry 2 (attempt 1 -> delay 1000*2**1)
    await vi.waitFor(() => expect(process).toHaveBeenCalledTimes(3));

    // maxAttempts=2 retries exhausted after 3 total invocations (initial + 2 retries)
    await vi.waitFor(() => expect(queue.failed).toBe(1));
    expect(queue.pending).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith({ pending: 0, failed: 1 });

    // No further retries scheduled — advancing time doesn't invoke process again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(process).toHaveBeenCalledTimes(3);
  });

  it("clears a key from failed once a subsequent retry succeeds (recovery)", async () => {
    const process = vi
      .fn<(key: string, payload: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("drop"))
      .mockResolvedValueOnce(undefined);
    const queue = createSyncQueue<string>({
      process,
      maxAttempts: 0, // exhaust immediately on first failure
      baseDelayMs: 1000,
    });

    queue.enqueue("line-1", "payload-A");
    await vi.waitFor(() => expect(queue.failed).toBe(1));
    expect(queue.pending).toBe(0);

    // User/hook retries with a fresh enqueue.
    queue.enqueue("line-1", "payload-B");
    expect(queue.failed).toBe(0);
    expect(queue.pending).toBe(1);

    await vi.waitFor(() => expect(queue.pending).toBe(0));
    expect(queue.failed).toBe(0);
    expect(process).toHaveBeenLastCalledWith("line-1", "payload-B");
  });

  it("supports independent maxAttempts/baseDelayMs per instance (constructor options, not hardcoded)", async () => {
    const process = vi.fn().mockRejectedValue(new Error("drop"));
    const queue = createSyncQueue<string>({
      process,
      maxAttempts: 0,
      baseDelayMs: 5000,
    });

    queue.enqueue("line-1", "payload-A");
    await vi.waitFor(() => expect(queue.failed).toBe(1));
    // No retry ever scheduled since maxAttempts=0 exhausts on the first failure.
    expect(process).toHaveBeenCalledTimes(1);
  });
});
