/**
 * Debounced `localStorage` persistence middleware for the Root MVP.
 *
 * The Zustand store in `data/` is the single source of truth for the
 * running app; persistence is a one-way projection of the store's
 * `canvas` slice into `localStorage` (design.md §Persistence). This
 * middleware sits at that seam and honors three requirements:
 *
 *   - R8.1  Every change to the `canvas` slice schedules a write to
 *           `localStorage` after `DEBOUNCE_MS` (500 ms) of quiet. Rapid
 *           bursts of writes coalesce into a single `setItem`.
 *   - R8.2  Each write is the output of `serializeCanvas(canvas)` — a
 *           deterministic JSON document with a stable field order.
 *   - R8.6  A `beforeunload` event flushes any pending timeout
 *           synchronously so the last edit is not lost when the tab
 *           closes.
 *
 * The middleware is scoped to the `canvas` slice only. UI-state changes
 * (`selection`, `editor`, `deletePrompt`, `viewport`) do not schedule a
 * write — they are ephemeral and would waste the 500 ms budget on
 * churn that the user does not care about persisting. Detection uses
 * reference equality on `state.canvas`; because every canvas write in
 * the store commits a fresh object built by a pure mutator, a reference
 * change is exactly the set of writes we want to persist.
 *
 * Errors: `localStorage.setItem` can throw (quota exceeded, private-mode
 * Safari, disk full). The middleware catches, drops the pending payload,
 * and emits a `saveError` on `persistenceEvents` for the app shell to
 * surface as a toast. Continuing to attempt writes on subsequent
 * changes is the intended behavior — the failure may be transient (e.g.
 * the user closed a large tab that was hogging quota).
 *
 * The `install` function returns a cleanup callback that unsubscribes
 * from the store, removes the `beforeunload` listener, and cancels any
 * pending timeout. That callback is what `App` calls from its
 * `useEffect` cleanup (task 13.1) and what tests call in `afterEach`.
 */

import { serializeCanvas, useCanvasStore } from '../data';
import { CANVAS_KEY } from './keys';
import { emitSaveError } from './persistenceEvents';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Debounce interval in milliseconds. Sourced from R8.1 and design.md
 * §Persistence. Exported so tests can reference the same constant
 * rather than hard-coding `500` in two places.
 */
export const DEBOUNCE_MS = 500;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Install the debounced persistence middleware.
 *
 * On success returns a cleanup function that:
 *   1. Unsubscribes from the Zustand store.
 *   2. Removes the `beforeunload` listener.
 *   3. Clears any pending debounce timeout (without flushing — the
 *      caller is choosing to tear down, so a lingering write would be
 *      surprising).
 *
 * The function is safe to call multiple times; each call installs an
 * independent listener pair. The typical caller is `App`'s mount effect
 * (task 13.1) which will only ever install once per app lifetime.
 */
export function installPersistenceMiddleware(): () => void {
  // Pending timeout id and the serialized payload the timeout should
  // write. Held in this closure so `flush` and the subscribe callback
  // can share them without leaking module-level state between installs.
  //
  // Using `ReturnType<typeof setTimeout>` avoids `NodeJS.Timeout` vs
  // `number` divergence between Node and browser typings — Vitest
  // (jsdom) uses `number`, Node uses `Timeout`; either satisfies the
  // return type.
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingSerialized: string | null = null;

  /**
   * Write the currently pending payload to `localStorage`, if any, and
   * clear all pending state. Idempotent and synchronous.
   *
   * Called from:
   *   - The debounce timer once `DEBOUNCE_MS` of quiet elapses.
   *   - The `beforeunload` handler at tab close.
   *
   * A `setItem` failure is caught, the pending payload is dropped, and
   * a `saveError` event is emitted so the shell can toast. The pending
   * payload is dropped rather than retried on the next change because
   * the next change will produce its own fresh, superseding payload;
   * holding onto a stale one would risk overwriting a newer state.
   */
  const flush = (): void => {
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    if (pendingSerialized === null) return;
    const payload = pendingSerialized;
    // Clear before the write so a throwing `setItem` cannot leave us
    // with `pendingSerialized` set and no timeout — a state that would
    // silently persist on the next flush.
    pendingSerialized = null;
    try {
      localStorage.setItem(CANVAS_KEY, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitSaveError({ message });
    }
  };

  // Zustand v4 `subscribe(listener)` fires with `(state, prevState)` on
  // every state change. The initial state is not delivered — which is
  // exactly what we want: we do not need to write the empty canvas
  // that `loadInitialCanvas` just produced back into storage.
  const unsubscribeStore = useCanvasStore.subscribe((state, prevState) => {
    // Filter to `canvas`-slice changes. UI-state writes reuse the same
    // canvas reference by construction (see `store.ts`), so reference
    // equality is a correct and cheap discriminator.
    if (state.canvas === prevState.canvas) return;

    // Serialize eagerly. Doing it here (rather than inside the timeout)
    // keeps the interaction-critical path off the flush callback and
    // captures the exact state at the moment of change; if a later
    // change arrives during the debounce window, its own serialized
    // payload will overwrite this one.
    pendingSerialized = serializeCanvas(state.canvas);

    if (pendingTimeout !== null) clearTimeout(pendingTimeout);
    pendingTimeout = setTimeout(flush, DEBOUNCE_MS);
  });

  // `beforeunload` runs synchronously during tab close; whatever we do
  // here must complete before the browser tears the page down.
  // `localStorage.setItem` is a synchronous API, so a plain call is
  // enough — no `sendBeacon`-style trickery required.
  const beforeUnloadHandler = (): void => {
    flush();
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  return () => {
    unsubscribeStore();
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    if (pendingTimeout !== null) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    pendingSerialized = null;
  };
}
