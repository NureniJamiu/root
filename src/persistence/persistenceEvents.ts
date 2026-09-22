/**
 * Persistence-layer event bus for the Root MVP.
 *
 * The persistence layer is deliberately silent: the middleware never
 * throws, and `loadInitialCanvas` always returns a `Canvas`. Something
 * outside the layer still needs to know when a write failed
 * (`localStorage.setItem` threw — quota exceeded, private mode, disk
 * full) or when a stored payload could not be parsed on load, so the
 * app shell can surface a toast (design.md §Error Handling — persistence
 * errors are one of the three user-facing error surfaces).
 *
 * This bus is separate from the store's `saveError` bus in `data/` on
 * purpose: `data/` reports schema failures inside mutator writes,
 * `persistence/` reports I/O failures at the `localStorage` boundary.
 * Two channels means either surface can be silenced or re-routed in
 * tests without dragging the other along.
 *
 * The API mirrors `data/storeEvents.ts` — an `EventTarget`-backed pair of
 * emit / on functions per event kind, each `on*` returning an
 * unsubscribe callback so callers can register in a `useEffect` cleanup
 * or a test `afterEach` without tracking the underlying listener.
 */

/* -------------------------------------------------------------------------- */
/* Event payloads                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Detail attached to every `saveError` event. Emitted by the debounced
 * middleware when `localStorage.setItem` throws.
 *
 * `message` is a compact human-readable string suitable for a toast
 * body; it is drawn from the caught error's `message` when the error is
 * an `Error`, otherwise from `String(error)`. It is not a stack trace.
 */
export interface SaveErrorDetail {
  /** Compact human-readable description of the write failure. */
  message: string;
}

/**
 * Detail attached to every `loadError` event. Emitted by the load path
 * when a payload exists at `CANVAS_KEY` but cannot be turned back into a
 * valid `Canvas` — either malformed JSON or a schema failure. The raw
 * payload is copied to `RAW_KEY` before this event fires (R8.5), so a
 * listener does not need the raw bytes here; the `message` is what the
 * toast displays.
 */
export interface LoadErrorDetail {
  /** Compact human-readable description of the load failure. */
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Internal bus                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Module-level `EventTarget`. Kept private so the surface stays
 * constrained to the exported `emit*` / `on*` pairs; consumers cannot
 * dispatch arbitrary events onto our channel.
 */
const bus: EventTarget = new EventTarget();

const SAVE_ERROR_EVENT = 'saveError' as const;
const LOAD_ERROR_EVENT = 'loadError' as const;

/* -------------------------------------------------------------------------- */
/* Save-error API                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Broadcast a `saveError` event. Called by the debounced middleware
 * when `localStorage.setItem` throws. Silently returns when no listeners
 * are registered — the middleware must not throw from its write path.
 */
export function emitSaveError(detail: SaveErrorDetail): void {
  bus.dispatchEvent(
    new CustomEvent<SaveErrorDetail>(SAVE_ERROR_EVENT, { detail }),
  );
}

/**
 * Subscribe to `saveError` events. Returns an unsubscribe function.
 */
export function onSaveError(
  handler: (detail: SaveErrorDetail) => void,
): () => void {
  const listener = (event: Event): void => {
    // `dispatchEvent` above only ever sends `CustomEvent<SaveErrorDetail>`,
    // so the cast is safe. The `undefined` guard keeps the callsite
    // resilient to a synthetic `Event` from tests.
    const custom = event as CustomEvent<SaveErrorDetail>;
    if (custom.detail !== undefined) handler(custom.detail);
  };
  bus.addEventListener(SAVE_ERROR_EVENT, listener);
  return () => {
    bus.removeEventListener(SAVE_ERROR_EVENT, listener);
  };
}

/* -------------------------------------------------------------------------- */
/* Load-error API                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Broadcast a `loadError` event. Called by `loadInitialCanvas` after it
 * has already copied the offending raw payload to `RAW_KEY` and decided
 * to return `emptyCanvas()`. Silently returns when no listeners are
 * registered — the load path must not throw.
 */
export function emitLoadError(detail: LoadErrorDetail): void {
  bus.dispatchEvent(
    new CustomEvent<LoadErrorDetail>(LOAD_ERROR_EVENT, { detail }),
  );
}

/**
 * Subscribe to `loadError` events. Returns an unsubscribe function.
 */
export function onLoadError(
  handler: (detail: LoadErrorDetail) => void,
): () => void {
  const listener = (event: Event): void => {
    const custom = event as CustomEvent<LoadErrorDetail>;
    if (custom.detail !== undefined) handler(custom.detail);
  };
  bus.addEventListener(LOAD_ERROR_EVENT, listener);
  return () => {
    bus.removeEventListener(LOAD_ERROR_EVENT, listener);
  };
}

/* -------------------------------------------------------------------------- */
/* Barrel object                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Convenience grouping so callers can `import { persistenceEvents }` and
 * discover the full surface via completion. All four functions are also
 * exported individually above for direct import.
 */
export const persistenceEvents = {
  emitSaveError,
  onSaveError,
  emitLoadError,
  onLoadError,
} as const;
