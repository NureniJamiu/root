/**
 * `ToolbarCallbacks` — the small React context by which the app layer
 * hands the hover toolbar an implementation of node-level actions that
 * require canvas-side geometry the `nodes/` layer isn't allowed to
 * import (Requirement 10.3 — `nodes/` cannot import from `canvas/`).
 *
 * Today only one action lives here:
 *   - `onAddChild(parentId)` — dispatches `canvasActions.addChild` with
 *      a position produced by the canvas layer's `computeChildPosition`
 *      (task 9.2, Requirement 3.2).
 *
 * The App shell installs the smart implementation via
 * `ToolbarCallbacksProvider`. When no provider is present (e.g. a
 * component test that renders `NodeCard` in isolation), a naive
 * diagonal-offset fallback keeps the toolbar functional so existing
 * behavior isn't tied to canvas geometry.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { canvasActions, useCanvasStore } from '../data';
import type { UUID } from '../data';

/**
 * The shape of the callback bundle. Kept as a single object rather
 * than an à-la-carte list of props so future actions (task 12.1 delete
 * confirmation, task 11.1 image drops, …) can slot in without another
 * context.
 */
export interface ToolbarCallbacks {
  /**
   * Add a child under `parentId` and open the editor on the new node
   * (R3.1, R3.3). The provider decides how to pick the child's initial
   * position (Requirement 3.2). The mutator layer already guards
   * against unknown ids, so callers can dispatch unconditionally.
   */
  readonly onAddChild: (parentId: UUID) => void;
}

/**
 * Naive fallback offset — matches the diagonal shift the toolbar used
 * before task 9.2 wired in `computeChildPosition`. Kept purely for
 * unit-test resilience: production always goes through the app-layer
 * provider.
 */
const FALLBACK_CHILD_OFFSET = { x: 240, y: 120 } as const;

const fallback: ToolbarCallbacks = {
  onAddChild(parentId) {
    // Read the parent's position directly from the store so the
    // fallback still positions the child relative to its parent —
    // stacking children at (0, 0) would defeat the point of the
    // "diagonal shift" contract this fallback preserves.
    const { canvas } = useCanvasStore.getState();
    const parent = canvas.nodes.find((n) => n.id === parentId);
    if (parent === undefined) return;
    canvasActions.addChild(parentId, {
      x: parent.position.x + FALLBACK_CHILD_OFFSET.x,
      y: parent.position.y + FALLBACK_CHILD_OFFSET.y,
    });
  },
};

const ToolbarCallbacksContext = createContext<ToolbarCallbacks>(fallback);

/**
 * Provider component installed by the App shell. Wrap the app's node
 * tree (or a test harness) with this to inject a real implementation
 * that consults the canvas layer for placement.
 */
export function ToolbarCallbacksProvider({
  value,
  children,
}: {
  readonly value: ToolbarCallbacks;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <ToolbarCallbacksContext.Provider value={value}>
      {children}
    </ToolbarCallbacksContext.Provider>
  );
}

/**
 * Hook used by the hover toolbar to reach the active `ToolbarCallbacks`
 * bundle. Falls back to the naive-offset implementation when no
 * provider is installed.
 */
export function useToolbarCallbacks(): ToolbarCallbacks {
  return useContext(ToolbarCallbacksContext);
}
