/**
 * `CanvasView` — the React Flow adapter for the Root MVP.
 *
 * Real-time dragging architecture:
 * - React Flow is fully controlled: nodes are derived from the store on every
 *   render (selection and measured sizes included); there is no local mirror.
 * - `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop` keep the live drag
 *   position in `dragState`, which overlays the dragged node's position.
 * - `onNodesChange` records measured card sizes and forwards selection.
 * - Grid snapping with `snapToGrid={true}` and `snapGrid={[20, 20]}`.
 * - Live connector recalculation during drag.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import ReactFlow, {
  Background,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
  type NodeDragHandler,
  type NodeTypes,
  type OnMove,
} from 'reactflow';

// React Flow stylesheet
import 'reactflow/dist/style.css';

import { canvasActions, hasCycle, useCanvasStore } from '../data';
import type { NodeType, UUID } from '../data';
import { FitViewIcon, NodeCard, ZoomInIcon, ZoomOutIcon } from '../nodes';

import { getMeasuredSizes, setMeasuredSize } from './measuredSizes';
import type { NodeSize } from './measuredSizes';
import { useReactFlowGraph } from './useReactFlowGraph';
import { determineReconnect, determineReparent, resolveConnectionSides } from './reconnect';
import { computeTreeLayout } from './placement';

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
  readonly fitView: () => void;
}

export interface CanvasViewProps {
  readonly onNodeSelect?: (id: UUID) => void;
  readonly onPaneClick?: () => void;
  readonly isPanActive?: boolean;
  readonly onTogglePan?: () => void;
  /** When set, ideas of other types are dimmed so this type stands out. */
  readonly highlightType?: NodeType | null;
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
    onTogglePan,
    highlightType = null,
    onRFPropsMounted,
    onControlsReady,
    onDragChange,
  } = props;

  const [dragState, setDragState] = useState<DragState | null>(null);

  const nodePositions = useMemo(() => {
    if (!dragState) return undefined;
    const map = new Map<UUID, { x: number; y: number }>();
    map.set(dragState.nodeId, { x: dragState.currentX, y: dragState.currentY });
    return map;
  }, [dragState]);

  const { nodes: derivedNodes, edges } = useReactFlowGraph({
    draggingNodeId: dragState?.nodeId ?? null,
    nodePositions,
  });

  // Card sizes measured by React Flow. React Flow keeps width/height on the
  // node objects it is given, so they are merged back in below.
  const [sizes, setSizes] = useState<ReadonlyMap<UUID, NodeSize>>(() => new Map());
  const selectedNodeId = useCanvasStore((s) => s.selection.nodeId);

  const reactFlow = useReactFlow();
  const canvas = useCanvasStore((s) => s.canvas);
  const storeViewport = useCanvasStore((s) => s.viewport);

  const handleZoomIn = useCallback(() => {
    reactFlow?.zoomIn?.({ duration: 150 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    reactFlow?.zoomOut?.({ duration: 150 });
  }, [reactFlow]);

  const handleResetZoom = useCallback(() => {
    reactFlow?.zoomTo?.(1, { duration: 150 });
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

  // React Flow reports measured sizes and selection through `onNodesChange`;
  // positions come from the drag handlers below.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const measured: Array<[UUID, NodeSize]> = [];
    let selectedId: UUID | null = null;
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        if (setMeasuredSize(change.id, change.dimensions)) {
          measured.push([change.id, change.dimensions]);
        }
      } else if (change.type === 'select' && change.selected) {
        selectedId = change.id;
      }
    }
    if (measured.length > 0) {
      setSizes((prev) => {
        const next = new Map(prev);
        for (const [id, size] of measured) next.set(id, size);
        return next;
      });
    }
    // Keyboard selection (Tab, then Enter/Space) arrives here, not via click.
    if (selectedId !== null && selectedId !== useCanvasStore.getState().selection.nodeId) {
      canvasActions.select(selectedId);
      onNodeSelect?.(selectedId);
    }
  }, [onNodeSelect]);

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
      const newPos = {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      };
      canvasActions.moveNode(node.id, newPos);

      // Record updated connection sides for this node and any child connections in store
      const { canvas: currentCanvas } = useCanvasStore.getState();
      const updatedNode = currentCanvas.nodes.find((n) => n.id === node.id);
      if (updatedNode) {
        if (updatedNode.parentId) {
          const parent = currentCanvas.nodes.find((n) => n.id === updatedNode.parentId);
          if (parent) {
            const resolved = resolveConnectionSides(parent.position, newPos, updatedNode);
            if (!updatedNode.sourcePinned || !updatedNode.targetPinned) {
              canvasActions.updateConnection(updatedNode.id, {
                sourceSide: updatedNode.sourcePinned ? updatedNode.sourceSide : resolved.sourceSide,
                targetSide: updatedNode.targetPinned ? updatedNode.targetSide : resolved.targetSide,
              });
            }
          }
        }
        for (const child of currentCanvas.nodes) {
          if (child.parentId === node.id && (!child.sourcePinned || !child.targetPinned)) {
            const resolved = resolveConnectionSides(newPos, child.position, child);
            canvasActions.updateConnection(child.id, {
              sourceSide: child.sourcePinned ? child.sourceSide : resolved.sourceSide,
              targetSide: child.targetPinned ? child.targetSide : resolved.targetSide,
            });
          }
        }
      }
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

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const { canvas } = useCanvasStore.getState();
    const resolution = determineReparent(canvas, connection);
    if (resolution && !hasCycle(canvas, resolution.childId, resolution.parentId)) {
      canvasActions.updateConnection(resolution.childId, resolution);
    }
  }, []);

  const handleReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return;
    const { canvas } = useCanvasStore.getState();
    const resolution = determineReconnect(canvas, oldEdge, newConnection);
    if (resolution && !hasCycle(canvas, resolution.childId, resolution.parentId)) {
      canvasActions.updateConnection(resolution.childId, resolution);
    }
  }, []);

  const handleEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    const { canvas } = useCanvasStore.getState();
    const child = canvas.nodes.find((n) => n.id === edge.target);
    if (child && (child.sourcePinned || child.targetPinned)) {
      canvasActions.updateConnection(child.id, {
        sourcePinned: false,
        targetPinned: false,
      });
    }
  }, []);

  const handleAutoLayout = useCallback(() => {
    const current = useCanvasStore.getState().canvas;
    canvasActions.applyCanvas(computeTreeLayout(current, getMeasuredSizes()));
    setTimeout(() => {
      reactFlow?.fitView?.({ duration: 200, padding: 0.25 });
    }, 50);
  }, [reactFlow]);

  const zoomPercent = Math.round(storeViewport.zoom * 100);

  // What React Flow renders: derived nodes plus selection, measured sizes,
  // live drag data and the type-highlight dimming.
  const displayNodes = useMemo(() => {
    const typeById = highlightType
      ? new Map(canvas.nodes.map((n) => [n.id, n.type]))
      : null;
    return derivedNodes.map((dn) => {
      const size = sizes.get(dn.id);
      const isDragging = dragState?.nodeId === dn.id;
      return {
        ...dn,
        selected: dn.id === selectedNodeId,
        ...(size ? { width: size.width, height: size.height } : {}),
        data: {
          ...dn.data,
          isDragging,
          dx: isDragging ? dragState.dx : undefined,
          dy: isDragging ? dragState.dy : undefined,
        },
        ...(typeById
          ? {
              style: {
                opacity: typeById.get(dn.id) === highlightType ? 1 : 0.25,
                transition: 'opacity 150ms ease-out',
              },
            }
          : {}),
      };
    });
  }, [derivedNodes, sizes, selectedNodeId, dragState, canvas.nodes, highlightType]);

  // Delete / Backspace opens the delete prompt for the selected idea.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const { selection, editor, deletePrompt } = useCanvasStore.getState();
      if (!selection.nodeId || editor.openNodeId || deletePrompt.nodeId) return;
      e.preventDefault();
      canvasActions.openDeletePrompt(selection.nodeId);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    onControlsReady?.({ fitView: handleFitView });
  }, [handleFitView, onControlsReady]);

  useEffect(() => {
    if (onRFPropsMounted === undefined) return;
    onRFPropsMounted({
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      onlyRenderVisibleElements: true,
      nodesDraggable: true,
      nodesConnectable: true,
      elementsSelectable: true,
    });
  }, [onRFPropsMounted]);

  return (
    <div
      className="relative h-full w-full select-none"
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
      data-nodes-connectable="true"
      data-elements-selectable="true"
    >
      {/* React Flow Surface */}
      <div
        className={`relative w-full h-full overflow-hidden ${
          isPanActive ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        <ReactFlow
          nodes={displayNodes}
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
          nodesConnectable={!isPanActive}
          edgesUpdatable={!isPanActive}
          edgesFocusable={!isPanActive}
          connectionMode={ConnectionMode.Loose}
          reconnectRadius={20}
          onConnect={handleConnect}
          onReconnect={handleReconnect}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          elementsSelectable={!isPanActive}
          // Deletion goes through the store's delete prompt (see the keydown
          // effect above); React Flow's built-in delete only drops local view state.
          deleteKeyCode={null}
          onlyRenderVisibleElements
          onMove={handleMove}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#c3c6d6" style={{ opacity: 0.55 }} />
        </ReactFlow>

        {/* Canvas toolbar — the single home for viewport controls */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-[#ffffff] border border-[#ebebeb] rounded-[2px] p-1"
          role="toolbar"
          aria-label="Canvas controls"
          data-testid="canvas-hud"
        >
          <div className="flex items-center gap-0.5 bg-[#f5f3f3] rounded-[2px] p-0.5" role="group" aria-label="Interaction mode">
            <ToolbarModeButton
              label="Select & edit"
              isActive={!isPanActive}
              onClick={() => isPanActive && onTogglePan?.()}
              testId="btn-select-mode"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 4 7.07 17 2.51-7.39L21 11.07z" />
              </svg>
            </ToolbarModeButton>
            <ToolbarModeButton
              label="Pan mode (or hold Space)"
              isActive={isPanActive}
              onClick={() => !isPanActive && onTogglePan?.()}
              testId="btn-pan"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
                <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
                <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
              </svg>
            </ToolbarModeButton>
          </div>

          <ToolbarDivider />

          <ToolbarIconButton label="Zoom out" onClick={handleZoomOut} testId="btn-zoom-out">
            <ZoomOutIcon />
          </ToolbarIconButton>
          <button
            type="button"
            onClick={handleResetZoom}
            className="h-7 min-w-[48px] px-1 font-mono text-[10.5px] text-[#1b1c1c] rounded-[2px] hover:bg-[#f5f3f3] transition-colors cursor-pointer tabular-nums"
            title="Reset zoom to 100%"
            data-testid="zoom-percent"
          >
            {zoomPercent}%
          </button>
          <ToolbarIconButton label="Zoom in" onClick={handleZoomIn} testId="btn-zoom-in">
            <ZoomInIcon />
          </ToolbarIconButton>

          <ToolbarDivider />

          <ToolbarIconButton label="Fit all ideas in view" onClick={handleFitView} testId="btn-fit">
            <FitViewIcon />
          </ToolbarIconButton>
          <ToolbarIconButton label="Center on the main idea" onClick={handleCenterRoot} testId="btn-root">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
            </svg>
          </ToolbarIconButton>
          <ToolbarIconButton label="Tidy up layout" onClick={handleAutoLayout} testId="btn-auto-layout">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="6" height="5" rx="1" />
              <rect x="15" y="16" width="6" height="5" rx="1" />
              <rect x="3" y="16" width="6" height="5" rx="1" />
              <path d="M6 8v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8" />
              <path d="M12 14v2" />
            </svg>
          </ToolbarIconButton>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar primitives                                                         */
/* -------------------------------------------------------------------------- */

interface ToolbarButtonBaseProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly children: ReactNode;
}

function ToolbarIconButton({ label, onClick, testId, children }: ToolbarButtonBaseProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-7 h-7 inline-flex items-center justify-center rounded-[2px] text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function ToolbarModeButton({
  label,
  onClick,
  testId,
  children,
  isActive,
}: ToolbarButtonBaseProps & { readonly isActive: boolean }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={`w-7 h-6 inline-flex items-center justify-center rounded-[2px] border transition-colors cursor-pointer ${
        isActive
          ? 'bg-[#ffffff] text-[#000000] border-[#ebebeb]'
          : 'border-transparent text-[#737785] hover:text-[#000000]'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function ToolbarDivider(): JSX.Element {
  return <div className="w-px h-4 bg-[#ebebeb] mx-1" aria-hidden="true" />;
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
