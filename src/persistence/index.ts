/**
 * Public barrel for the Root MVP Persistence Layer.
 *
 * The persistence layer is a one-way projection of the Zustand store's
 * `canvas` slice into `localStorage` (design.md §Persistence). This
 * barrel is the only surface `app/` should reach into:
 *
 *   - `installPersistenceMiddleware()` — mount-time installer for the
 *     debounced writer; returns a cleanup function.
 *   - `loadInitialCanvas()` — mount-time reader; returns a validated
 *     `Canvas` or `emptyCanvas()` on any failure.
 *   - `persistenceEvents` — event-bus API (`onSaveError`, `onLoadError`,
 *     and their `emit*` counterparts) for the toast surface to
 *     subscribe to. Individual functions are also re-exported for
 *     callers who prefer direct import.
 *   - `CANVAS_KEY` / `RAW_KEY` — storage keys, re-exported so tests
 *     (task 7.2, 13.2) and the app shell can reference the same
 *     constants the middleware uses.
 *
 * Deliberately not exported: the debounce constant, internal flush
 * routine, and any helpers — they are implementation detail.
 */

export { CANVAS_KEY, RAW_KEY } from './keys';
export { installPersistenceMiddleware } from './middleware';
export { loadInitialCanvas } from './load';
export {
  emitLoadError,
  emitSaveError,
  onLoadError,
  onSaveError,
  persistenceEvents,
} from './persistenceEvents';
export type {
  LoadErrorDetail,
  SaveErrorDetail,
} from './persistenceEvents';
