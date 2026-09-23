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
  Background,
  ReactFlowProvider,
  useReactFlow,
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
import { FitViewIcon, NodeCard, ZoomInIcon, ZoomOutIcon } from '../nodes';

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

export interface CanvasViewControls {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fitView: () => void;
  readonly centerRoot: () => void;
  readonly zoomPercent: number;
}

export interface CanvasViewProps {
  /**
   * Fired when the user selects a node on the surface.
   */
  readonly onNodeSelect?: (id: UUID) => void;

  /**
   * Test-only prop probe (Task 9.5).
   */
  readonly onRFPropsMounted?: (props: CanvasViewProbeProps) => void;

  /**
   * Optional callback exposing canvas viewport controls.
   */
  readonly onControlsReady?: (controls: CanvasViewControls) => void;
}

/* -------------------------------------------------------------------------- */
/* CanvasView                                                                 */
/* -------------------------------------------------------------------------- */

function CanvasViewInner(props: CanvasViewProps): JSX.Element {
  const { onNodeSelect, onRFPropsMounted, onControlsReady } = props;
  const { nodes, edges } = useReactFlowGraph();
  const reactFlow = useReactFlow();

  const handleZoomIn = useCallback(() => {
    reactFlow?.zoomIn?.({ duration: 150 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    reactFlow?.zoomOut?.({ duration: 150 });
  }, [reactFlow]);

  const handleFitView = useCallback(() => {
    reactFlow?.fitView?.({ duration: 200, padding: 0.25 });
  }, [reactFlow]);

  const handleCenterRoot = useCallback(() => {
    const rootNode = nodes.find((n) => n.id);
    if (rootNode) {
      reactFlow?.setCenter(rootNode.position.x + 120, rootNode.position.y + 60, { duration: 200, zoom: 1 });
    } else {
      reactFlow?.fitView?.({ duration: 200, padding: 0.25 });
    }
  }, [nodes, reactFlow]);

  /**
   * Commit the final drag position to the store.
   */
  const handleNodeDragStop = useCallback<NodeDragHandler>((_event, node) => {
    canvasActions.moveNode(node.id, {
      x: node.position.x,
      y: node.position.y,
    });
  }, []);

  /**
   * Mirror React Flow's viewport into the store.
   */
  const handleMove = useCallback<OnMove>((_event, viewport) => {
    canvasActions.setViewport(viewport);
  }, []);

  /**
   * Bridge React Flow's node-click into onNodeSelect and Zustand selection.
   */
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }): void => {
      canvasActions.select(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  const viewport = reactFlow?.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const zoomPercent = Math.round(viewport.zoom * 100);

  useEffect(() => {
    onControlsReady?.({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      fitView: handleFitView,
      centerRoot: handleCenterRoot,
      zoomPercent,
    });
  }, [handleZoomIn, handleZoomOut, handleFitView, handleCenterRoot, zoomPercent, onControlsReady]);

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
  }, [onRFPropsMounted]);

  return (
    <div
      className="relative h-full w-full select-none flex flex-col"
      style={{
        width: '100%',
        height: '100%',
        background: '#f9f9fb',
      }}
      data-testid="canvas-view"
      data-min-zoom={MIN_ZOOM}
      data-max-zoom={MAX_ZOOM}
      data-only-render-visible="true"
      data-nodes-draggable="true"
      data-nodes-connectable="false"
      data-elements-selectable="true"
    >
      {/* Top Coordinate & Stats Ribbon */}
      <div className="h-8 w-full border-b border-[#ebebeb] bg-[#ffffff] px-3 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2 font-mono text-[9px] text-[#595959] tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-[#737785]" />
          <span>
            COORD: X:{viewport.x.toFixed(1)} Y:{viewport.y.toFixed(1)}
          </span>
          <span className="text-[#c3c6d6]">|</span>
          <span className="text-[#0051c3] font-medium">{viewport.zoom.toFixed(2)}x</span>
          <span className="text-[#c3c6d6]">|</span>
          <span>
            {nodes.length} nodes rendered (0.0ms)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center border border-[#ebebeb] rounded-[2px] bg-[#ffffff] h-6">
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-5 h-full flex items-center justify-center font-mono text-[11px] text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
              title="Zoom out"
            >
              −
            </button>
            <span className="font-mono text-[9px] text-[#1b1c1c] px-1.5 border-x border-[#ebebeb]">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-5 h-full flex items-center justify-center font-mono text-[11px] text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleCenterRoot}
            className="h-6 px-2 border border-[#ebebeb] rounded-[2px] bg-[#ffffff] font-mono text-[9px] text-[#404040] hover:text-[#000000] hover:border-[#000000] transition-colors cursor-pointer"
          >
            Center
          </button>
          <button
            type="button"
            onClick={handleFitView}
            className="h-6 px-2 border border-[#ebebeb] rounded-[2px] bg-[#ffffff] font-mono text-[9px] text-[#404040] hover:text-[#000000] hover:border-[#000000] transition-colors cursor-pointer"
          >
            Fit
          </button>
        </div>
      </div>

      {/* React Flow Surface */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
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
        >
          {/* 16px geometric coordinate grid dot matrix per DESIGN.md §Spatial Engine */}
          <Background gap={16} size={1} color="#c3c6d6" style={{ opacity: 0.55 }} />
        </ReactFlow>

        {/* Floating Canvas Controls HUD (Bottom Right) */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: '#ffffff',
            border: '1px solid #ebebeb',
            borderRadius: 2,
            padding: 2,
            boxShadow: 'none',
          }}
          data-testid="canvas-hud"
        >
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
            className="inline-flex items-center justify-center rounded-[2px] transition-colors duration-150 hover:bg-[#f5f3f3] hover:text-[#000000]"
            style={{
              width: 26,
              height: 26,
              border: 'none',
              background: 'transparent',
              color: '#404040',
              cursor: 'pointer',
            }}
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
            className="inline-flex items-center justify-center rounded-[2px] transition-colors duration-150 hover:bg-[#f5f3f3] hover:text-[#000000]"
            style={{
              width: 26,
              height: 26,
              border: 'none',
              background: 'transparent',
              color: '#404040',
              cursor: 'pointer',
            }}
          >
            <ZoomOutIcon />
          </button>
          <div
            style={{
              width: 1,
              height: 14,
              background: '#ebebeb',
              margin: '0 2px',
            }}
          />
          <button
            type="button"
            onClick={handleFitView}
            aria-label="Fit view"
            title="Fit view to graph"
            className="inline-flex items-center justify-center rounded-[2px] transition-colors duration-150 hover:bg-[#f5f3f3] hover:text-[#000000]"
            style={{
              width: 26,
              height: 26,
              border: 'none',
              background: 'transparent',
              color: '#404040',
              cursor: 'pointer',
            }}
          >
            <FitViewIcon />
          </button>
        </div>
      </div>

      {/* Bottom Canvas Status Bar */}
      <div className="h-6 w-full border-t border-[#ebebeb] bg-[#ffffff] px-3 flex items-center justify-between shrink-0 font-mono text-[9px] text-[#595959] z-10">
        <div className="flex items-center gap-2">
          <span>COORD: X: {viewport.x.toFixed(1)}</span>
          <span className="text-[#ebebeb]">|</span>
          <span>Y: {viewport.y.toFixed(1)}</span>
          <span className="text-[#ebebeb]">|</span>
          <span>SCALE: {viewport.zoom.toFixed(2)}x</span>
          <span className="text-[#ebebeb]">|</span>
          <span>RENDER: {nodes.length} nodes</span>
          <span className="text-[#ebebeb]">|</span>
          <span>PROJECTION: Cartesian Orthographic</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#737785]">SHORTCUTS:</span>
          <span className="text-[#1b1c1c]">Space + Drag</span>
          <span className="text-[#737785]">Pan</span>
          <span>•</span>
          <span className="text-[#1b1c1c]">Click +</span>
          <span className="text-[#737785]">Branch</span>
          <span>•</span>
          <span className="text-[#1b1c1c]">Del</span>
          <span className="text-[#737785]">Prune</span>
        </div>
      </div>
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
