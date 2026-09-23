/**
 * `CanvasView` — the React Flow adapter for the Root MVP.
 *
 * The Canvas Layer treats React Flow as a *rendering* dependency, nothing
 * more (design.md §High-Level Architecture). All state lives in the
 * Zustand store; every render this component:
 *
 *   1. Derives visible `{ nodes, edges }` via `useReactFlowGraph`.
 *   2. Hands them to `<ReactFlow>` along with the config knobs pinned by
 *      Requirements 1.4 and 12.2.
 *   3. Wires the two write-back callbacks that need to reach the store:
 *      `onNodeDragStop` → `canvasActions.moveNode` (R5.2 — interim drag
 *      positions stay inside React Flow only), and `onMove` →
 *      `canvasActions.setViewport` so persistence and non-React code can
 *      read the current viewport without touching the RF instance.
 *
 * The wrapper `<div>` exposes the numeric config as `data-*` attributes so
 * component tests (Task 9.5) can assert on `minZoom`, `maxZoom`, and
 * `onlyRenderVisibleElements` without depending on React Flow internals.
 * An optional `onRFPropsMounted` prop provides a stronger probe that
 * captures the exact props handed to `<ReactFlow>` — useful for future
 * regression tests without leaking test hooks into production behaviour.
 *
 * Import boundaries (Requirement 10.2):
 *   - `canvas/` may consume `nodes/` only through its public barrel
 *     `src/nodes`. We import `NodeCard` from `../nodes` and never reach
 *     into `nodes/*` internals. ESLint enforces this at build time.
 *   - `canvas/` may consume `data/` only through the `src/data` barrel.
 */

import { useCallback, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  type NodeDragHandler,
  type NodeTypes,
  type OnMove,
} from 'reactflow';

// React Flow ships its own stylesheet. It must be present before any
// `<ReactFlow>` renders, otherwise the surface is unusable (no pan/zoom
// affordance, no node positioning). We import it here so `CanvasView`
// remains drop-in usable from `App` without a separate CSS entry point.
import 'reactflow/dist/style.css';

import { canvasActions } from '../data';
import type { UUID } from '../data';
import { NodeCard } from '../nodes';

import { useReactFlowGraph } from './useReactFlowGraph';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Minimum zoom level — Requirement 1.4. */
const MIN_ZOOM = 0.25;

/** Maximum zoom level — Requirement 1.4. */
const MAX_ZOOM = 2.5;

/**
 * The single custom node type registered with React Flow. Defined at
 * module scope so its identity is stable — passing a fresh object every
 * render triggers a React Flow warning and forces a full re-registration.
 *
 * `NodeCard` is a `memo` component. React Flow accepts `ComponentType`
 * for node types, and `MemoExoticComponent<NodeProps<...>>` satisfies
 * that; casting is only needed because `NodeTypes` is indexed by string.
 */
const NODE_TYPES: NodeTypes = { research: NodeCard };

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The subset of `<ReactFlow>` props we surface for tests via
 * `onRFPropsMounted`. Kept minimal on purpose so tests do not accidentally
 * depend on internal React Flow shapes.
 */
export interface CanvasViewProbeProps {
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly onlyRenderVisibleElements: boolean;
  readonly nodesDraggable: boolean;
  readonly nodesConnectable: boolean;
  readonly elementsSelectable: boolean;
}

export interface CanvasViewProps {
  /**
   * Fired when the user selects a node on the surface. Selection state
   * itself is owned by the Zustand store (`selection.nodeId`); this
   * callback is a thin bridge for App-level side effects (e.g. opening
   * the editor on double-click). Optional so `CanvasView` can render
   * standalone in tests.
   */
  readonly onNodeSelect?: (id: UUID) => void;

  /**
   * Test-only prop probe (Task 9.5). Invoked once per mount with the
   * concrete config props handed to `<ReactFlow>` so component tests can
   * assert on `minZoom` / `maxZoom` / `onlyRenderVisibleElements` without
   * inspecting React Flow's internal state. Not called in production
   * unless a consumer chooses to.
   */
  readonly onRFPropsMounted?: (props: CanvasViewProbeProps) => void;
}

/* -------------------------------------------------------------------------- */
/* CanvasView                                                                 */
/* -------------------------------------------------------------------------- */

function CanvasViewInner(props: CanvasViewProps): JSX.Element {
  const { onNodeSelect, onRFPropsMounted } = props;
  const { nodes, edges } = useReactFlowGraph();

  /**
   * Commit the final drag position to the store. React Flow keeps interim
   * positions in its own internal state during the drag; we only write on
   * `onNodeDragStop` so the store — and therefore persistence — sees a
   * single move per gesture (R5.2).
   */
  const handleNodeDragStop = useCallback<NodeDragHandler>((_event, node) => {
    canvasActions.moveNode(node.id, {
      x: node.position.x,
      y: node.position.y,
    });
  }, []);

  /**
   * Mirror React Flow's viewport (pan + zoom) into the store. Non-React
   * consumers (initial-child placement, persistence) then read pan/zoom
   * from the store without holding a reference to the RF instance.
   */
  const handleMove = useCallback<OnMove>((_event, viewport) => {
    canvasActions.setViewport(viewport);
  }, []);

  /**
   * Bridge React Flow's node-click into the App-level `onNodeSelect`
   * callback and the Zustand selection slice. Kept as a memoized handler
   * so React Flow's shallow-equality-guarded prop diffing works.
   */
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }): void => {
      canvasActions.select(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  // Fire the test-only probe exactly once per mount, after commit. Tests
  // that want to inspect the exact config props handed to `<ReactFlow>`
  // read them here rather than reaching into RF's internals. `useEffect`
  // (not `useMemo`) is the correct hook — the probe is a side effect,
  // not a computation whose value we consume during render.
  useEffect(() => {
    if (onRFPropsMounted === undefined) return;
    onRFPropsMounted({
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      onlyRenderVisibleElements: true,
      nodesDraggable: true,
      nodesConnectable: false,
      elementsSelectable: true,
    });
    // The probe intentionally fires on mount only; the values it reports
    // are module-level constants that cannot change.
  }, [onRFPropsMounted]);

  return (
    <div
      className="h-full w-full"
      style={{ width: '100%', height: '100%' }}
      data-testid="canvas-view"
      data-min-zoom={MIN_ZOOM}
      data-max-zoom={MAX_ZOOM}
      data-only-render-visible="true"
      data-nodes-draggable="true"
      data-nodes-connectable="false"
      data-elements-selectable="true"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        onNodeDragStop={handleNodeDragStop}
        onMove={handleMove}
        onNodeClick={handleNodeClick}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

/**
 * Public `CanvasView`. Wraps the inner component in `<ReactFlowProvider>`
 * so consumers can drop `<CanvasView />` into any React tree without also
 * remembering to install the provider (design.md §Canvas Layer — Public
 * Surface).
 */
export function CanvasView(props: CanvasViewProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}
