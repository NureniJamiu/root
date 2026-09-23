/**
 * Integration tests for the persistence layer's timing behaviours
 * (task 7.2).
 *
 * These are integration tests rather than unit tests because they
 * exercise the full seam between three collaborators:
 *
 *   1. `useCanvasStore` / `canvasActions` from `data/` — the source of
 *      the changes the middleware observes.
 *   2. `installPersistenceMiddleware` from `persistence/middleware.ts`
 *      — the debounced writer under test.
 *   3. `loadInitialCanvas` from `persistence/load.ts` — the corrupted-
 *      payload recovery path under test.
 *   4. `window.localStorage` — the `Storage`-shaped surface the
 *      middleware writes to. The shared test setup installs an in-
 *      memory polyfill on `globalThis.localStorage` (see
 *      `src/test/setup.ts` for the rationale — Node's stub shadows
 *      jsdom's real Storage under this Vitest configuration); the
 *      spy below wraps that polyfill directly so we can assert
 *      *when* (not just *whether*) the write happens.
 *
 * Requirements covered:
 *   - R8.1  A change schedules a write 500 ms later; rapid changes
 *           coalesce into a single write.
 *   - R8.5  A corrupted payload is preserved to `RAW_KEY`, an empty
 *           canvas is returned, and a `loadError` event fires.
 *   - R8.6  `beforeunload` flushes any pending write synchronously.
 *
 * Test hygiene:
 *   - `vi.useFakeTimers()` is installed in `beforeEach` so the
 *     debounce interval can be advanced deterministically; the real
 *     clock is restored in `afterEach`.
 *   - The store is reset to a clean `initialState`-equivalent shape
 *     before each test so persisted UI state from previous tests
 *     cannot leak into the observed writes.
 *   - `localStorage` is cleared before each test so seeded keys from
 *     one case cannot influence the next.
 *   - The middleware cleanup returned by `installPersistenceMiddleware`
 *     is captured and invoked in `afterEach`, so no dangling subscriber
 *     or `beforeunload` listener survives into the next test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { canvasActions, emptyCanvas, useCanvasStore } from '../../data';
import type { CanvasState, UUID } from '../../data';
import { CANVAS_KEY, RAW_KEY } from '../keys';
import { loadInitialCanvas } from '../load';
import { installPersistenceMiddleware } from '../middleware';
import { onLoadError } from '../persistenceEvents';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a clean `CanvasState` matching the store's private
 * `initialState()`. Local to this test file rather than re-exported
 * from `store.ts` because tests are the only consumer that needs to
 * synthesize this shape from the outside.
 */
function cleanState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/* -------------------------------------------------------------------------- */
/* Debounce coalescing (R8.1)                                                 */
/* -------------------------------------------------------------------------- */

describe('installPersistenceMiddleware — debounce coalescing (R8.1)', () => {
  let cleanupMiddleware: (() => void) | null = null;
  let setItemSpy: MockInstance<Storage['setItem']>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    // Fully overwrite every top-level field to purge residue from any
    // earlier test that ran against the same singleton store.
    useCanvasStore.setState(cleanState());
    // Spy on the polyfilled localStorage directly (see setup.ts for
    // why we do not use Storage.prototype). The wrapped call still
    // delegates to the real polyfill, so post-conditions can be
    // observed via `localStorage.getItem`.
    setItemSpy = vi.spyOn(window.localStorage, 'setItem');
  });

  afterEach(() => {
    if (cleanupMiddleware !== null) {
      cleanupMiddleware();
      cleanupMiddleware = null;
    }
    setItemSpy.mockRestore();
    vi.useRealTimers();
  });

  it('coalesces three rapid updateNode calls into exactly one setItem after 500ms of quiet', () => {
    // Install the middleware first so the addRoot below is observed by
    // the subscriber. Reversing the order would let addRoot slip past
    // the middleware unnoticed and make the setup dependent on an
    // implementation detail (which mutation triggers the subscriber).
    cleanupMiddleware = installPersistenceMiddleware();

    // Seed a root so we have a node to `updateNode` on. `addRoot` is
    // itself a canvas change and therefore schedules a debounced write
    // — we advance past that window and then reset the spy so the
    // assertions below only see calls originating from the three
    // `updateNode` invocations we care about.
    canvasActions.addRoot({ x: 0, y: 0 });
    vi.advanceTimersByTime(500);
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const rootId = useCanvasStore.getState().canvas.nodes[0]?.id as
      | UUID
      | undefined;
    expect(rootId).toBeDefined();
    setItemSpy.mockClear();

    // Three rapid changes. Each one clears the pending timeout and
    // installs a fresh one; the middleware's contract is that only the
    // final scheduled flush actually runs.
    canvasActions.updateNode(rootId as UUID, { title: 'one' });
    canvasActions.updateNode(rootId as UUID, { title: 'two' });
    canvasActions.updateNode(rootId as UUID, { title: 'three' });

    // 499 ms elapsed: still inside the 500 ms quiet window that
    // started at the third `updateNode`. R8.1 says nothing has been
    // written yet.
    vi.advanceTimersByTime(499);
    expect(setItemSpy).not.toHaveBeenCalled();

    // 500 ms elapsed: the debounce fires exactly once, with the
    // payload reflecting the *last* update. Coalescing is the
    // observable outcome of "clear pending, schedule fresh".
    vi.advanceTimersByTime(1);
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    // Sanity: the single write went to `CANVAS_KEY` and encodes the
    // final title. This guards against a coalescing regression where
    // a stale earlier payload wins the race.
    const [key, value] = setItemSpy.mock.calls[0] as [string, string];
    expect(key).toBe(CANVAS_KEY);
    expect(value).toContain('"title":"three"');
  });
});

/* -------------------------------------------------------------------------- */
/* beforeunload flush (R8.6)                                                  */
/* -------------------------------------------------------------------------- */

describe('installPersistenceMiddleware — beforeunload flush (R8.6)', () => {
  let cleanupMiddleware: (() => void) | null = null;
  let setItemSpy: MockInstance<Storage['setItem']>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useCanvasStore.setState(cleanState());
    setItemSpy = vi.spyOn(window.localStorage, 'setItem');
  });

  afterEach(() => {
    if (cleanupMiddleware !== null) {
      cleanupMiddleware();
      cleanupMiddleware = null;
    }
    setItemSpy.mockRestore();
    vi.useRealTimers();
  });

  it('flushes a pending debounced write synchronously on beforeunload', () => {
    cleanupMiddleware = installPersistenceMiddleware();

    // Fire a change. A debounced write is now scheduled 500 ms out but
    // has not yet run — the spy has not been called.
    canvasActions.addRoot({ x: 10, y: 20 });
    expect(setItemSpy).not.toHaveBeenCalled();

    // Dispatch `beforeunload` on the window. The middleware's handler
    // runs synchronously inside `dispatchEvent`; by the time the call
    // returns, the flush must already have written to storage. This
    // is the R8.6 contract: the last edit is not lost on tab close.
    window.dispatchEvent(new Event('beforeunload'));

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const [key] = setItemSpy.mock.calls[0] as [string, string];
    expect(key).toBe(CANVAS_KEY);

    // Advancing timers must not produce a *second* write. The flush
    // path is expected to have cleared the pending timeout, otherwise
    // the debounce would fire on top of the beforeunload write and
    // clobber storage during unload teardown.
    setItemSpy.mockClear();
    vi.advanceTimersByTime(500);
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Load error path (R8.5)                                                     */
/* -------------------------------------------------------------------------- */

describe('loadInitialCanvas — corrupted-payload recovery (R8.5)', () => {
  beforeEach(() => {
    // Fake timers are not strictly required for the load path, but
    // keeping the setup uniform across the suite makes the fixture
    // predictable and avoids surprises if `load.ts` ever grows a
    // timer-based path.
    vi.useFakeTimers();
    localStorage.clear();
    useCanvasStore.setState(cleanState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns emptyCanvas, preserves raw payload, and emits loadError when CANVAS_KEY holds an unparseable string', () => {
    // Seed the malformed payload. `"{"` is JSON's canonical minimal
    // parse failure — enough to trip `JSON.parse` before Zod ever runs
    // — so the assertion below about `RAW_KEY` proves the raw bytes
    // survived untouched all the way through `parseCanvas`'s error
    // branch and into `RAW_KEY`.
    const raw = '{';
    localStorage.setItem(CANVAS_KEY, raw);

    // Register the listener *before* calling `loadInitialCanvas` so
    // the synchronous `emitLoadError` inside the load path reaches us.
    // Registering afterwards would race with the event bus, which
    // dispatches synchronously and has no replay semantics.
    const loadErrors: Array<{ message: string }> = [];
    const unsubscribe = onLoadError((detail) => {
      loadErrors.push(detail);
    });

    try {
      const canvas = loadInitialCanvas();

      // R8.5 fallback: an empty canvas is returned rather than
      // throwing. `emptyCanvas()` produces a fresh id/timestamp per
      // call, so we assert the *shape* (no nodes) rather than
      // reference/id equality.
      expect(canvas.nodes).toEqual([]);

      // R8.5 preservation: the raw bytes at `CANVAS_KEY` are copied
      // verbatim into `RAW_KEY`. Comparing to the seed value proves
      // no transformation slipped in.
      expect(localStorage.getItem(RAW_KEY)).toBe(raw);

      // R8.5 signalling: exactly one `loadError` event was emitted
      // with a non-empty message the shell can surface as a toast.
      expect(loadErrors).toHaveLength(1);
      expect(loadErrors[0]?.message.length ?? 0).toBeGreaterThan(0);
    } finally {
      unsubscribe();
    }
  });
});
