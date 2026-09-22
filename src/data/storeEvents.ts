/**
 * Store-level event bus for the Root MVP Data Model Layer.
 *
 * The Zustand store in `./store` is a pure state container: it does not
 * throw, it does not log, and its write path aborts silently when the
 * post-mutation `canvasSchema.safeParse` fails. Something outside the
 * store still needs to know when that happens so the app can surface a
 * toast (design.md §Error Handling — "save error" is one of the three
 * user-facing error surfaces).
 *
 * This module provides a tiny `EventTarget`-based bus dedicated to that
 * signal. It intentionally lives inside `data/` so the store can emit
 * without reaching upward into UI code, and its subscription API is
 * synchronous, framework-agnostic, and easy to stub in tests.
 *
 * Only one event kind is defined today (`saveError`); persistence errors
 * live on a separate bus in `persistence/` (task 7.1) so the two concerns
 * remain independently subscribable.
 */

/* -------------------------------------------------------------------------- */
/* Event payload                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Detail attached to every `saveError` event. `action` is the store action
 * whose write was aborted (e.g. `'addChild'`); `message` is a compact
 * human-readable string suitable for a toast body — it is derived from the
 * Zod issues but never contains a full stack trace.
 */
export interface SaveErrorDetail {
  /** The `canvasActions` entry point that produced the invalid canvas. */
  action: string;
  /** Compact human-readable description of the schema failure. */
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Internal bus                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Module-level `EventTarget`. Kept private so the surface stays constrained
 * to `emitSaveError` / `onSaveError`; consumers cannot dispatch arbitrary
 * events onto our channel.
 */
const bus: EventTarget = new EventTarget();

/** The single event name this module dispatches. */
const SAVE_ERROR_EVENT = 'saveError' as const;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Broadcast a `saveError` event. Called by the store when a mutator's
 * output fails `canvasSchema.safeParse` and the write is therefore aborted
 * (design.md §Error Handling). Silently returns when no listeners are
 * registered — the store must not throw from a write path.
 */
export function emitSaveError(detail: SaveErrorDetail): void {
  bus.dispatchEvent(new CustomEvent<SaveErrorDetail>(SAVE_ERROR_EVENT, { detail }));
}

/**
 * Subscribe to `saveError` events. Returns an unsubscribe function so
 * callers can register in a `useEffect` cleanup or a test `afterEach`
 * without tracking the underlying listener reference.
 */
export function onSaveError(
  handler: (detail: SaveErrorDetail) => void,
): () => void {
  const listener = (event: Event): void => {
    // `dispatchEvent` above only ever sends `CustomEvent<SaveErrorDetail>`,
    // so the cast is safe. Guarding against a missing `detail` keeps the
    // callsite resilient to a synthetic `Event` from tests.
    const custom = event as CustomEvent<SaveErrorDetail>;
    if (custom.detail !== undefined) handler(custom.detail);
  };
  bus.addEventListener(SAVE_ERROR_EVENT, listener);
  return () => {
    bus.removeEventListener(SAVE_ERROR_EVENT, listener);
  };
}
