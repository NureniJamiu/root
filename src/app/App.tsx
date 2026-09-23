/**
 * `App` — the top-level shell.
 *
 * Full implementation of the shell (toolbar, empty-canvas affordance,
 * ErrorBoundary, toast surface) lands in task 13.1. What lives here
 * today is the piece task 9.2 needs: the `ToolbarCallbacks` provider
 * that connects the hover toolbar's `add-child` action to
 * `computeChildPosition` (Requirement 3.2).
 *
 * This wiring lives in the App layer because it is the only place
 * allowed to combine `canvas/` geometry with the shared `data/` write
 * surface — `nodes/` cannot import from `canvas/` (Requirement 10.3)
 * and `canvas/` cannot import from `nodes/*` internals (Requirement
 * 10.2). The App shell sits above both and threads the callback
 * through a small React context.
 */

import { computeChildPosition } from '../canvas';
import { canvasActions, useCanvasStore } from '../data';
import type { UUID } from '../data';
import { ToolbarCallbacksProvider } from '../nodes';
import type { ToolbarCallbacks } from '../nodes';

/**
 * The concrete callback bundle installed on the toolbar context. Reads
 * the current canvas from the store, delegates to
 * `computeChildPosition` for a non-overlapping position, and hands the
 * result to `canvasActions.addChild`.
 *
 * Held at module scope so its identity is stable across re-renders,
 * which avoids re-triggering context consumers on every `App` render.
 */
const toolbarCallbacks: ToolbarCallbacks = {
  onAddChild(parentId: UUID) {
    // Snapshot the canvas at dispatch time so the position reflects
    // the exact state the mutator will operate on. `getState()` is the
    // right read here — this callback runs outside React's render
    // cycle in response to a click.
    const { canvas } = useCanvasStore.getState();
    const position = computeChildPosition(canvas, parentId);
    canvasActions.addChild(parentId, position);
  },
};

export function App(): JSX.Element {
  return (
    <ToolbarCallbacksProvider value={toolbarCallbacks}>
      <div id="root-app" />
    </ToolbarCallbacksProvider>
  );
}
