import { AnalysisError } from "./errors";

type Release = () => void;
interface Waiter {
  grant: () => void;
  cancel: (error: AnalysisError) => void;
}

/** Bounded FIFO admission for one Node process. Waiting never starts the job. */
export function createWorkQueue(options: { concurrency: number; maxWaiting: number; waitMs: number }) {
  const { concurrency, maxWaiting, waitMs } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxWaiting) || maxWaiting < 0 || !Number.isFinite(waitMs) || waitMs <= 0) {
    throw new RangeError("Invalid work queue limits");
  }
  let active = 0;
  const waiting: Waiter[] = [];

  function releaseSlot(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      while (active < concurrency && waiting.length) waiting.shift()!.grant();
    };
  }

  return {
    acquire({ signal, onQueued }: { signal?: AbortSignal; onQueued?: () => void } = {}): Promise<Release> {
      if (signal?.aborted) return Promise.reject(new AnalysisError("ABORTED"));
      if (active < concurrency) {
        active++;
        return Promise.resolve(releaseSlot());
      }
      if (waiting.length >= maxWaiting) return Promise.reject(new AnalysisError("SERVER_BUSY"));
      return new Promise<Release>((resolve, reject) => {
        let settled = false;
        const onAbort = () => waiter.cancel(new AnalysisError("ABORTED"));
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          const index = waiting.indexOf(waiter);
          if (index !== -1) waiting.splice(index, 1);
        };
        const waiter: Waiter = {
          grant() {
            if (settled) return;
            if (signal?.aborted) { waiter.cancel(new AnalysisError("ABORTED")); return; }
            settled = true;
            cleanup();
            active++;
            resolve(releaseSlot());
          },
          cancel(error) {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
          },
        };
        waiting.push(waiter);
        const timer = setTimeout(() => waiter.cancel(new AnalysisError("SERVER_BUSY")), waitMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        try { onQueued?.(); } catch { waiter.cancel(new AnalysisError("INTERNAL")); }
      });
    },
  };
}

function boundedEnv(name: string, fallback: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

export const analysisQueue = createWorkQueue({
  concurrency: boundedEnv("ANALYSIS_CONCURRENCY", 3, 8),
  maxWaiting: boundedEnv("ANALYSIS_QUEUE_LIMIT", 12, 50),
  waitMs: 120_000,
});

// Capture is the expensive memory phase. Serialize it without skipping images
// on other admitted analyses; AI calls can still overlap independently.
export const captureQueue = createWorkQueue({ concurrency: 1, maxWaiting: 8, waitMs: 120_000 });
