/**
 * Public barrel for the Canvas Layer.
 *
 * This is the surface the `app/` layer imports to reach canvas-side
 * geometry helpers without touching internal files. `data/` and
 * `nodes/` are forbidden from importing this module by the ESLint
 * boundary rules (Requirements 10.1, 10.3).
 *
 * Current exports:
 *   - `computeChildPosition`, `NODE_WIDTH`, `NODE_HEIGHT`, `SIBLING_GAP`
 *     (from `./placement`) — used by the App shell to compute a
 *     non-overlapping initial position for a newly created child node
 *     (task 9.2, Requirement 3.2).
 *
 * Future exports (later tasks): `CanvasView` (task 9.1), plus any edge
 * style helpers the app layer needs.
 */

export {
  NODE_HEIGHT,
  NODE_WIDTH,
  SIBLING_GAP,
  computeChildPosition,
} from './placement';
