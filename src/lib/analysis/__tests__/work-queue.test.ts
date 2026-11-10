import { afterEach, expect, it, vi } from "vitest";
import { createWorkQueue } from "../work-queue";

afterEach(() => vi.useRealTimers());

it("serves waiting requests in order and never releases a slot twice", async () => {
  const queue = createWorkQueue({ concurrency: 2, maxWaiting: 3, waitMs: 1000 });
  const first = await queue.acquire();
  const second = await queue.acquire();
  const started: number[] = [];
  const pending = [3, 4, 5].map((id) => queue.acquire().then((release) => { started.push(id); return release; }));
  first();
  const third = await pending[0];
  expect(started).toEqual([3]);
  first();
  await Promise.resolve();
  expect(started).toEqual([3]);
  second();
  const fourth = await pending[1];
  expect(started).toEqual([3, 4]);
  third();
  const fifth = await pending[2];
  expect(started).toEqual([3, 4, 5]);
  fourth(); fifth();
});

it("removes a cancelled waiter without starting its job or losing capacity", async () => {
  const queue = createWorkQueue({ concurrency: 1, maxWaiting: 1, waitMs: 1000 });
  const release = await queue.acquire();
  const abort = new AbortController();
  const onQueued = vi.fn();
  const cancelled = expect(queue.acquire({ signal: abort.signal, onQueued })).rejects.toMatchObject({ code: "ABORTED" });
  abort.abort();
  await cancelled;
  expect(onQueued).toHaveBeenCalledOnce();
  const replacement = queue.acquire();
  release();
  (await replacement)();
});

it("rejects an already cancelled request before it occupies capacity", async () => {
  const queue = createWorkQueue({ concurrency: 1, maxWaiting: 0, waitMs: 1000 });
  await expect(queue.acquire({ signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "ABORTED" });
  (await queue.acquire())();
});

it("rejects excess requests instead of creating an unbounded queue", async () => {
  const queue = createWorkQueue({ concurrency: 1, maxWaiting: 1, waitMs: 1000 });
  const release = await queue.acquire();
  const pending = queue.acquire();
  await expect(queue.acquire()).rejects.toMatchObject({ code: "SERVER_BUSY", retryable: true });
  release();
  (await pending)();
});

it("expires only waiting work and frees the waiting position for a new request", async () => {
  vi.useFakeTimers();
  const queue = createWorkQueue({ concurrency: 1, maxWaiting: 1, waitMs: 50 });
  const release = await queue.acquire();
  const expired = expect(queue.acquire()).rejects.toMatchObject({ code: "SERVER_BUSY" });
  await vi.advanceTimersByTimeAsync(50);
  await expired;
  const replacement = queue.acquire();
  release();
  (await replacement)();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds simultaneous work and preserves every result during a burst", async () => {
  const queue = createWorkQueue({ concurrency: 3, maxWaiting: 40, waitMs: 1000 });
  let active = 0;
  let peak = 0;
  const results = await Promise.all(Array.from({ length: 40 }, async (_, id) => {
    const release = await queue.acquire();
    try {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      return `request-${id}`;
    } finally { active--; release(); }
  }));
  expect(peak).toBe(3);
  expect(active).toBe(0);
  expect(results).toEqual(Array.from({ length: 40 }, (_, id) => `request-${id}`));
});
