/**
 * Sequenced, coalescing save queue.
 *
 * Guarantees the dashboard relies on:
 *   - at most one request is in flight, so saves reach the server in order;
 *   - each project keeps only its latest snapshot (older edits are
 *     superseded, not replayed);
 *   - snapshots belong to the project they were scheduled for, so switching
 *     projects can never write one project's canvas into another;
 *   - a failed save is retried with backoff unless the server rejected the
 *     request outright, and the failure is reported rather than swallowed;
 *   - `flush()` waits until everything pending has been sent, and
 *     `flushOnUnload()` fires what is left with `keepalive` as the page goes
 *     away.
 */

export type SaveStatus = 'saved' | 'saving' | 'error';

export type SaveOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: string;
      /** The server refused the request itself; retrying cannot help. */
      readonly fatal?: boolean;
    };

export interface SaveQueueOptions<T> {
  readonly send: (
    projectId: string,
    snapshot: T,
    options: { readonly keepalive: boolean },
  ) => Promise<SaveOutcome>;
  readonly onStatus?: (status: SaveStatus) => void;
  readonly onError?: (projectId: string, message: string) => void;
  /** Quiet period before a scheduled snapshot is sent. */
  readonly delayMs?: number;
  /** First retry delay after a failed save; doubles up to `maxRetryMs`. */
  readonly retryMs?: number;
  readonly maxRetryMs?: number;
}

export interface SaveQueue<T> {
  /** Queue `snapshot` as the latest state of `projectId`. */
  schedule(projectId: string, snapshot: T): void;
  /** Send everything pending now; resolves when the queue is idle. */
  flush(): Promise<void>;
  /** Fire pending snapshots with `keepalive` without waiting (page unload). */
  flushOnUnload(): void;
  /** Forget pending snapshots for a project (e.g. after deleting it). */
  discard(projectId: string): void;
  /** Cancel timers; nothing further is sent. */
  dispose(): void;
}

export function createSaveQueue<T>(options: SaveQueueOptions<T>): SaveQueue<T> {
  const delayMs = options.delayMs ?? 500;
  const retryBase = options.retryMs ?? 2_000;
  const retryMax = options.maxRetryMs ?? 30_000;

  const pending = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining: Promise<void> | null = null;
  let retryDelay = retryBase;
  let disposed = false;
  let status: SaveStatus = 'saved';

  const setStatus = (next: SaveStatus): void => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = (ms: number): void => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, ms);
  };

  async function run(): Promise<void> {
    while (pending.size > 0 && !disposed) {
      const [projectId, snapshot] = pending.entries().next().value as [string, T];
      pending.delete(projectId);
      setStatus('saving');

      let outcome: SaveOutcome;
      try {
        outcome = await options.send(projectId, snapshot, { keepalive: false });
      } catch (err) {
        outcome = { ok: false, message: err instanceof Error ? err.message : String(err) };
      }

      if (outcome.ok) {
        retryDelay = retryBase;
        continue;
      }

      options.onError?.(projectId, outcome.message);
      if (outcome.fatal) {
        // Nothing to retry; the next edit will try again.
        setStatus('error');
        continue;
      }
      // Keep the failed snapshot unless a newer one has been queued meanwhile.
      if (!pending.has(projectId)) pending.set(projectId, snapshot);
      setStatus('error');
      arm(retryDelay);
      retryDelay = Math.min(retryDelay * 2, retryMax);
      return;
    }
    if (pending.size === 0 && status !== 'error') setStatus('saved');
  }

  function drain(): Promise<void> {
    if (draining === null) {
      draining = run().finally(() => {
        draining = null;
      });
    }
    return draining;
  }

  return {
    schedule(projectId, snapshot) {
      if (disposed) return;
      pending.set(projectId, snapshot);
      setStatus('saving');
      // A fresh edit supersedes any scheduled retry and restarts the quiet period.
      arm(delayMs);
    },

    async flush() {
      clearTimer();
      // `drain` may be mid-flight; loop until a pass leaves nothing behind.
      do {
        await drain();
      } while (pending.size > 0 && status !== 'error' && !disposed);
    },

    flushOnUnload() {
      if (disposed) return;
      clearTimer();
      for (const [projectId, snapshot] of pending) {
        void options.send(projectId, snapshot, { keepalive: true }).catch(() => undefined);
      }
      pending.clear();
    },

    discard(projectId) {
      pending.delete(projectId);
      if (pending.size === 0 && status === 'saving' && draining === null) setStatus('saved');
    },

    dispose() {
      disposed = true;
      clearTimer();
      pending.clear();
    },
  };
}
