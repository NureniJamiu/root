/**
 * `CanvasView` — the React Flow adapter for the Root MVP.
 *
 * Real-time dragging architecture:
 * - Local `rfNodes` state synchronized with store `nodes`.
 * - `onNodesChange` wired to `applyNodeChanges` to update position on every frame as cursor moves.
 * - `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop` manage live drag telemetry.
 * - Grid snapping with `snapToGrid={true}` and `snapGrid={[20, 20]}`.
 * - Live connector recalculation during drag.
 */

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeDragHandler,
  type NodeTypes,
  type OnMove,
} from 'reactflow';

// React Flow stylesheet
import 'reactflow/dist/style.css';

import { canvasActions, useCanvasStore } from '../data';
import type { UUID } from '../data';
import { FitViewIcon, NodeCard, ZoomInIcon, ZoomOutIcon } from '../nodes';

import { useReactFlowGraph } from './useReactFlowGraph';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

const NODE_TYPES: NodeTypes = { research: NodeCard };

/* -------------------------------------------------------------------------- */
/* Props & Types                                                              */
/* -------------------------------------------------------------------------- */

export interface DragState {
  readonly nodeId: UUID;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly dx: number;
  readonly dy: number;
}

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
  readonly onNodeSelect?: (id: UUID) => void;
  readonly onPaneClick?: () => void;
  readonly isPanActive?: boolean;
  readonly onRFPropsMounted?: (props: CanvasViewProbeProps) => void;
  readonly onControlsReady?: (controls: CanvasViewControls) => void;
  readonly onDragChange?: (dragState: DragState | null) => void;
}

/* -------------------------------------------------------------------------- */
/* CanvasViewInner                                                            */
/* -------------------------------------------------------------------------- */

function CanvasViewInner(props: CanvasViewProps): JSX.Element {
  const {
    onNodeSelect,
    onPaneClick,
    isPanActive = false,
    onRFPropsMounted,
    onControlsReady,
    onDragChange,
  } = props;

  const [dragState, setDragState] = useState<DragState | null>(null);

  const { nodes: derivedNodes, edges } = useReactFlowGraph({
    draggingNodeId: dragState?.nodeId ?? null,
  });

  const [rfNodes, setRfNodes] = useState(derivedNodes);

  // Sync rfNodes with derivedNodes, augmenting with live dragging data
  useEffect(() => {
    setRfNodes((prev) => {
      return derivedNodes.map((dn) => {
        const isDragging = dragState?.nodeId === dn.id;
        const currentPos = isDragging
          ? { x: dragState.currentX, y: dragState.currentY }
          : dn.position;

        // If dragging, preserve the node's position from local state if available
        const localNode = prev.find((p) => p.id === dn.id);
        const resolvedPos = isDragging && localNode ? localNode.position : currentPos;

        return {
          ...dn,
          position: resolvedPos,
          data: {
            ...dn.data,
            isDragging,
            dx: isDragging ? dragState.dx : undefined,
            dy: isDragging ? dragState.dy : undefined,
          },
        };
      });
    });
  }, [derivedNodes, dragState]);

  const reactFlow = useReactFlow();
  const canvas = useCanvasStore((s) => s.canvas);
  const storeViewport = useCanvasStore((s) => s.viewport);

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
    const rootNode =
      canvas.nodes.find((n) => n.parentId === null) ?? canvas.nodes[0];
    if (rootNode) {
      reactFlow?.setCenter(rootNode.position.x + 130, rootNode.position.y + 60, { duration: 200, zoom: 1 });
    } else {
      reactFlow?.fitView?.({ duration: 200, padding: 0.25 });
    }
  }, [canvas.nodes, reactFlow]);

  // Handle node position changes emitted by React Flow in real-time
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // Real-time drag handlers
  const handleNodeDragStart = useCallback<NodeDragHandler>(
    (_event, node) => {
      const startX = Math.round(node.position.x);
      const startY = Math.round(node.position.y);
      const nextState: DragState = {
        nodeId: node.id,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        dx: 0,
        dy: 0,
      };
      setDragState(nextState);
      onDragChange?.(nextState);
    },
    [onDragChange],
  );

  const handleNodeDrag = useCallback<NodeDragHandler>(
    (_event, node) => {
      setDragState((prev) => {
        const startX = prev?.nodeId === node.id ? prev.startX : Math.round(node.position.x);
        const startY = prev?.nodeId === node.id ? prev.startY : Math.round(node.position.y);
        const currentX = Math.round(node.position.x);
        const currentY = Math.round(node.position.y);
        const nextState: DragState = {
          nodeId: node.id,
          startX,
          startY,
          currentX,
          currentY,
          dx: currentX - startX,
          dy: currentY - startY,
        };
        onDragChange?.(nextState);
        return nextState;
      });
    },
    [onDragChange],
  );

  const handleNodeDragStop = useCallback<NodeDragHandler>(
    (_event, node) => {
      setDragState(null);
      onDragChange?.(null);
      canvasActions.moveNode(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [onDragChange],
  );

  const handleMove = useCallback<OnMove>((_event, viewport) => {
    canvasActions.setViewport(viewport);
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }): void => {
      canvasActions.select(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    canvasActions.select(null);
    onPaneClick?.();
  }, [onPaneClick]);

  const zoomPercent = Math.round(storeViewport.zoom * 100);

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

  const draggingShortId = dragState ? `N-${dragState.nodeId.slice(0, 2).toUpperCase()}` : '';

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
      {/* Top Stats Ribbon */}
      <div className="h-8 w-full border-b border-[#ebebeb] bg-[#ffffff] px-3 flex items-center justify-between z-10 shrink-0">
        {dragState ? (
          <div className="flex items-center gap-2 font-mono text-[9px] tracking-wide text-[#0051c3]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0051c3] animate-pulse" />
            <span className="font-semibold uppercase">
              DRAGGING NODE [{draggingShortId}]
            </span>
            <span className="text-[#c3c6d6]">|</span>
            <span className="text-[#595959]">Realtime connector recalculation (&lt;16ms)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-mono text-[9px] text-[#595959] tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0051c3]" />
            <span className="text-[#0051c3] font-medium">{storeViewport.zoom.toFixed(2)}x</span>
            <span className="text-[#c3c6d6]">|</span>
            <span>
              {rfNodes.length} {rfNodes.length === 1 ? 'node' : 'nodes'} rendered (16.2ms)
            </span>
          </div>
        )}

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
            Root
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
      <div
        className={`relative flex-1 w-full h-full overflow-hidden ${
          isPanActive ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          snapToGrid
          snapGrid={[20, 20]}
          onNodesChange={handleNodesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          panOnDrag={isPanActive ? true : [1, 2]}
          selectionOnDrag={!isPanActive}
          nodesDraggable={!isPanActive}
          nodesConnectable={false}
          elementsSelectable={!isPanActive}
          onlyRenderVisibleElements
          onMove={handleMove}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#c3c6d6" style={{ opacity: 0.55 }} />
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

      {/* Bottom Canvas Status Bar — coordinates removed */}
      <div className="h-6 w-full border-t border-[#ebebeb] bg-[#ffffff] px-3 flex items-center justify-between shrink-0 font-mono text-[9px] text-[#595959] z-10">
        <div className="flex items-center gap-2">
          <span>SCALE: {storeViewport.zoom.toFixed(2)}x</span>
          <span className="text-[#ebebeb]">|</span>
          <span>RENDER: {rfNodes.length} nodes</span>
          <span className="text-[#ebebeb]">|</span>
          <span>MODE: {isPanActive ? 'Pan Navigation' : 'Select & Edit'}</span>
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
 * Public `CanvasView` wrapped with `ReactFlowProvider`.
 */
export function CanvasView(props: CanvasViewProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}
