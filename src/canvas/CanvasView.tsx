/**
 * `CanvasView` — the React Flow adapter for the Root canvas.
 *
 * Architecture:
 * - React Flow is fully controlled: nodes and connectors are derived from the
 *   store (`useReactFlowGraph`); there is no local mirror.
 * - Dragging cards is live: `onNodeDrag` overlays the dragged cards'
 *   positions (every selected card moves together) without touching the
 *   store, and connectors follow inside React Flow. The positions are written
 *   to the store once, on drop, as a single undo step. Dragging is free; hold
 *   Shift to snap to the 20px grid.
 * - Connectors can be dragged from any side of a card and dropped on any side
 *   of another card, or anywhere on its body (the nearest side is used). A
 *   card can have any number of connectors. Either end of a connector can be
 *   dragged to a new card or side; dropping an end on empty canvas puts it
 *   back where it was. A side the user picked is pinned; double-click a
 *   connector to hand it back to automatic routing. Click selects a
 *   connector; Delete/Backspace or its remove button deletes it.
 * - Double-clicking empty canvas adds an idea there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge as RFEdge,
  type EdgeTypes,
  type NodeChange,
  type NodeDragHandler,
  type NodeTypes,
  type OnConnectStartParams,
  type OnMove,
} from 'reactflow';

// React Flow stylesheet
import 'reactflow/dist/style.css';

import { canvasActions, isDuplicateEdge, useCanvasStore } from '../data';
import type { NodeType, Position, Side, UUID } from '../data';
import { FitViewIcon, NodeCard, ZoomInIcon, ZoomOutIcon } from '../nodes';

import { BranchToolbarGroup, WalkthroughBar } from './BranchControls';
import { ConnectorEdge } from './ConnectorEdge';
import { CONNECTION_LINE_STYLE, CONNECTOR_EDGE_TYPE } from './edgeStyles';
import { getMeasuredSizes, setMeasuredSize } from './measuredSizes';
import type { NodeSize } from './measuredSizes';
import { relayoutEdges, useReactFlowGraph } from './useReactFlowGraph';
import { useBranchMotion } from './useBranchMotion';
import { computeFacingSides, connectionToEnds, handleIdToSide, nearestSide } from './reconnect';
import { NODE_HEIGHT, computeTreeLayout, findFreePosition } from './placement';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

/**
 * Fitting the view never zooms in past 100%: one or two cards would
 * otherwise fill the screen at 250% and push new ideas out of sight.
 */
const FIT_VIEW_OPTIONS = { duration: 200, padding: 0.25, maxZoom: 1 } as const;

/** Grid used while Shift is held. */
const SNAP_GRID: [number, number] = [20, 20];

/** Rendered width of a card; used to centre a new card on a point. */
const CARD_WIDTH = 290;

const NODE_TYPES: NodeTypes = { research: NodeCard };
const EDGE_TYPES: EdgeTypes = { [CONNECTOR_EDGE_TYPE]: ConnectorEdge };

/** Attribute set on a card while a connector hovers over it, naming the side it would attach to. */
const DROP_SIDE_ATTR = 'data-drop-side';

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
  /** Centre of the visible canvas, in canvas coordinates. */
  readonly getViewportCenter: () => Position;
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

  const reactFlow = useReactFlow();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvas = useCanvasStore((s) => s.canvas);
  const storeViewport = useCanvasStore((s) => s.viewport);
  const selectedNodeId = useCanvasStore((s) => s.selection.nodeId);

  const { nodes: derivedNodes, edges: derivedEdges } = useReactFlowGraph();

  // Every selected card (Ctrl/⌘-click or a drag box selects several). The
  // store keeps the one the inspector shows; this keeps the rest so they
  // stay highlighted and branch controls can act on all of them.
  const [multiSelected, setMultiSelected] = useState<ReadonlySet<UUID>>(() => new Set());
  const multiSelectedRef = useRef<ReadonlySet<UUID>>(multiSelected);
  useEffect(() => {
    const prev = multiSelectedRef.current;
    let next = prev;
    if (selectedNodeId === null) next = prev.size === 0 ? prev : new Set();
    else if (!prev.has(selectedNodeId)) next = new Set([selectedNodeId]);
    if (next !== prev) {
      multiSelectedRef.current = next;
      setMultiSelected(next);
    }
  }, [selectedNodeId]);

  // Card sizes measured by React Flow. React Flow keeps width/height on the
  // node objects it is given, so they are merged back in below.
  const [sizes, setSizes] = useState<ReadonlyMap<UUID, NodeSize>>(() => new Map());

  /* ------------------------------ viewport ------------------------------ */

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
    reactFlow?.fitView?.(FIT_VIEW_OPTIONS);
  }, [reactFlow]);

  const handleCenterSelected = useCallback(() => {
    const { canvas: current, selection } = useCanvasStore.getState();
    const target = current.nodes.find((n) => n.id === selection.nodeId) ?? current.nodes[0];
    if (target) {
      const size = getMeasuredSizes().get(target.id);
      reactFlow?.setCenter(
        target.position.x + (size?.width ?? CARD_WIDTH) / 2,
        target.position.y + (size?.height ?? NODE_HEIGHT) / 2,
        { duration: 200, zoom: 1 },
      );
    } else {
      reactFlow?.fitView?.(FIT_VIEW_OPTIONS);
    }
  }, [reactFlow]);

  const getViewportCenter = useCallback((): Position => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    const point = rect
      ? reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }, [reactFlow]);

  const handleMove = useCallback<OnMove>((_event, viewport) => {
    canvasActions.setViewport(viewport);
  }, []);

  /* ------------------------------ node drag ----------------------------- */

  // Shift snaps dragging to the grid; otherwise movement is free.
  const [snap, setSnap] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setSnap(e.shiftKey);
    const onBlur = () => setSnap(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Positions of the cards being dragged right now. They overlay the store's
  // positions until the drop is committed.
  const [livePositions, setLivePositions] = useState<ReadonlyMap<UUID, Position> | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const handleNodeDragStart = useCallback<NodeDragHandler>(
    (_event, node) => {
      const startX = Math.round(node.position.x);
      const startY = Math.round(node.position.y);
      const next: DragState = {
        nodeId: node.id,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        dx: 0,
        dy: 0,
      };
      setDragState(next);
      onDragChange?.(next);
    },
    [onDragChange],
  );

  const handleNodeDrag = useCallback<NodeDragHandler>(
    (_event, node, nodes) => {
      const positions = new Map<UUID, Position>();
      for (const n of nodes) positions.set(n.id, { x: n.position.x, y: n.position.y });
      if (!positions.has(node.id)) positions.set(node.id, { x: node.position.x, y: node.position.y });
      setLivePositions(positions);

      setDragState((prev) => {
        const startX = prev?.nodeId === node.id ? prev.startX : Math.round(node.position.x);
        const startY = prev?.nodeId === node.id ? prev.startY : Math.round(node.position.y);
        const currentX = Math.round(node.position.x);
        const currentY = Math.round(node.position.y);
        const next: DragState = {
          nodeId: node.id,
          startX,
          startY,
          currentX,
          currentY,
          dx: currentX - startX,
          dy: currentY - startY,
        };
        onDragChange?.(next);
        return next;
      });
    },
    [onDragChange],
  );

  const handleNodeDragStop = useCallback<NodeDragHandler>(
    (_event, node, nodes) => {
      const committed = new Map<UUID, Position>();
      for (const n of nodes) {
        committed.set(n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) });
      }
      if (!committed.has(node.id)) {
        committed.set(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
      }
      // Commit first so the card never flashes back to its old spot.
      canvasActions.moveNodes(committed);
      setLivePositions(null);
      setDragState(null);
      onDragChange?.(null);
    },
    [onDragChange],
  );

  /* --------------------------- measured sizes --------------------------- */

  // React Flow reports measured sizes and selection through `onNodesChange`;
  // positions come from the drag handlers above.
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const measured: Array<[UUID, NodeSize]> = [];
    let selectedId: UUID | null = null;
    const selectChanges: Array<{ id: UUID; selected: boolean }> = [];
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        if (setMeasuredSize(change.id, change.dimensions)) {
          measured.push([change.id, change.dimensions]);
        }
      } else if (change.type === 'select') {
        selectChanges.push({ id: change.id, selected: change.selected });
        if (change.selected) selectedId = change.id;
      }
    }
    if (selectChanges.length > 0) {
      const next = new Set(multiSelectedRef.current);
      for (const c of selectChanges) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      multiSelectedRef.current = next;
      setMultiSelected(next);
      // Ctrl/⌘-click took the inspected card out of a multi-selection:
      // inspect one of the cards still selected instead.
      const current = useCanvasStore.getState().selection.nodeId;
      if (selectedId === null && current !== null && !next.has(current) && next.size > 0) {
        selectedId = [...next][next.size - 1] as UUID;
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

  const handleEdgesChange = useCallback((changes: Array<{ type: string; id?: string; selected?: boolean }>) => {
    // Keyboard selection of a connector (Tab, then Enter/Space).
    for (const change of changes) {
      if (change.type === 'select' && change.selected && change.id) {
        if (change.id !== useCanvasStore.getState().selection.edgeId) canvasActions.selectEdge(change.id);
      }
    }
  }, []);

  /* ----------------------------- selection ------------------------------ */

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: { id: string }): void => {
      // Ctrl/⌘-click toggles the card in a multi-selection; React Flow has
      // already reported that through onNodesChange.
      if ((event.metaKey || event.ctrlKey) && !multiSelectedRef.current.has(node.id)) {
        if (useCanvasStore.getState().selection.nodeId === node.id) canvasActions.select(null);
        return;
      }
      canvasActions.select(node.id);
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge): void => {
    canvasActions.selectEdge(edge.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    canvasActions.select(null);
    onPaneClick?.();
  }, [onPaneClick]);

  /* ----------------------------- connectors ----------------------------- */

  // What the pointer is doing with a connector. `kind: 'new'` drags a fresh
  // connector out of `fromNodeId`'s side; `kind: 'reconnect'` drags one end of
  // an existing connector. `made` is set once React Flow reports a connection
  // dropped on a handle, so the body-drop fallback below only runs otherwise.
  type Gesture =
    | { kind: 'new'; fromNodeId: UUID; fromSide: Side | null; made: boolean }
    | { kind: 'reconnect'; edge: RFEdge; movingEnd: 'source' | 'target'; made: boolean };
  const gestureRef = useRef<Gesture | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const pointerOf = (event: MouseEvent | TouchEvent): { x: number; y: number } => {
    if ('changedTouches' in event && event.changedTouches.length > 0) {
      const t = event.changedTouches[0]!;
      return { x: t.clientX, y: t.clientY };
    }
    const m = event as MouseEvent;
    return { x: m.clientX, y: m.clientY };
  };

  /** The card under a screen point, with its rectangle, or null over empty canvas. */
  const cardAt = (point: { x: number; y: number }): { id: UUID; rect: DOMRect; el: Element } | null => {
    for (const el of document.elementsFromPoint(point.x, point.y)) {
      const card = el.closest('.react-flow__node');
      const id = card?.getAttribute('data-id');
      if (card && id) return { id, rect: card.getBoundingClientRect(), el: card };
    }
    return null;
  };

  /** Facing sides of two cards in the store, for a drag that did not start on a handle. */
  const computeFacingSidesFor = (fromId: UUID, toId: UUID) => {
    const { canvas: current } = useCanvasStore.getState();
    const from = current.nodes.find((n) => n.id === fromId);
    const to = current.nodes.find((n) => n.id === toId);
    return from && to ? computeFacingSides(from.position, to.position) : { sourceSide: 'right' as Side, targetSide: 'left' as Side };
  };

  // While a connector is dragged, mark the card under the pointer with the side
  // it would attach to, so dropping on a card body is as predictable as dropping on a dot.
  useEffect(() => {
    if (!isConnecting) return;
    let marked: Element | null = null;
    const clear = () => {
      marked?.removeAttribute(DROP_SIDE_ATTR);
      marked = null;
    };
    const onMove = (e: PointerEvent | MouseEvent) => {
      const hit = cardAt({ x: e.clientX, y: e.clientY });
      if (!hit) return clear();
      if (marked && marked !== hit.el) clear();
      marked = hit.el;
      hit.el.setAttribute(DROP_SIDE_ATTR, nearestSide(hit.rect, { x: e.clientX, y: e.clientY }));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      clear();
    };
  }, [isConnecting]);

  const handleConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      setIsConnecting(true);
      if (gestureRef.current?.kind === 'reconnect') return;
      gestureRef.current = {
        kind: 'new',
        fromNodeId: params.nodeId ?? '',
        fromSide: handleIdToSide(params.handleId),
        made: false,
      };
    },
    [],
  );

  const handleConnect = useCallback((connection: Connection) => {
    if (gestureRef.current) gestureRef.current.made = true;
    const ends = connectionToEnds(useCanvasStore.getState().canvas, connection);
    if (ends) canvasActions.connect(ends);
  }, []);

  const handleReconnectStart = useCallback(
    (_event: React.MouseEvent, edge: RFEdge, handleType: 'source' | 'target') => {
      // `handleType` names the end that stays put.
      gestureRef.current = {
        kind: 'reconnect',
        edge,
        movingEnd: handleType === 'target' ? 'source' : 'target',
        made: false,
      };
    },
    [],
  );

  /**
   * Re-attach connector `edgeId` so that `moving` end goes to `node` on `side`.
   * The moved end is pinned (the user chose it); the other end keeps its state.
   */
  const reattach = useCallback((edgeId: UUID, moving: 'source' | 'target', node: UUID, side: Side) => {
    const edge = useCanvasStore.getState().canvas.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    canvasActions.updateEdge(edgeId, {
      source: moving === 'source' ? node : edge.source,
      sourceSide: moving === 'source' ? side : edge.sourceSide,
      sourcePinned: moving === 'source' ? true : edge.sourcePinned,
      target: moving === 'target' ? node : edge.target,
      targetSide: moving === 'target' ? side : edge.targetSide,
      targetPinned: moving === 'target' ? true : edge.targetPinned,
    });
  }, []);

  const handleReconnect = useCallback((oldEdge: RFEdge, connection: Connection) => {
    const gesture = gestureRef.current;
    if (gesture) gesture.made = true;
    const ends = connectionToEnds(useCanvasStore.getState().canvas, connection);
    if (!ends) return;
    const moving = gesture?.kind === 'reconnect' ? gesture.movingEnd : null;
    if (moving === 'source') reattach(oldEdge.id, 'source', ends.source, ends.sourceSide);
    else if (moving === 'target') reattach(oldEdge.id, 'target', ends.target, ends.targetSide);
    else canvasActions.updateEdge(oldEdge.id, ends);
  }, [reattach]);

  // Runs after React Flow has resolved the drop. When it did not land on a
  // handle, a drop on a card body attaches to the side nearest the pointer.
  // A connector end dropped on empty canvas goes back where it was.
  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setIsConnecting(false);
    if (!gesture || gesture.made) return;

    const point = pointerOf(event);
    const hit = cardAt(point);
    if (!hit) return;
    const side = nearestSide(hit.rect, point);

    if (gesture.kind === 'new') {
      if (hit.id === gesture.fromNodeId) return;
      canvasActions.connect({
        source: gesture.fromNodeId,
        target: hit.id,
        sourceSide: gesture.fromSide ?? computeFacingSidesFor(gesture.fromNodeId, hit.id).sourceSide,
        targetSide: side,
        sourcePinned: true,
        targetPinned: true,
      });
    } else {
      reattach(gesture.edge.id, gesture.movingEnd, hit.id, side);
    }
  }, [reattach]);

  // Double-clicking a connector hands both ends back to automatic routing.
  const handleEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    canvasActions.autoRouteEdge(edge.id);
  }, []);

  const isValidConnection = useCallback((connection: Connection): boolean => {
    const { canvas: current } = useCanvasStore.getState();
    const ends = connectionToEnds(current, connection);
    if (!ends) return false;
    const reconnecting = gestureRef.current?.kind === 'reconnect' ? gestureRef.current.edge.id : undefined;
    return !isDuplicateEdge(current, ends, reconnecting);
  }, []);

  /* ----------------------------- new ideas ------------------------------ */

  const handleSurfaceDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (isPanActive) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const desired = { x: Math.round(point.x - CARD_WIDTH / 2), y: Math.round(point.y - NODE_HEIGHT / 2) };
      const { canvas: current } = useCanvasStore.getState();
      canvasActions.addNode(findFreePosition(current, desired, getMeasuredSizes()));
    },
    [isPanActive, reactFlow],
  );

  const handleAutoLayout = useCallback(() => {
    const current = useCanvasStore.getState().canvas;
    canvasActions.applyCanvas(computeTreeLayout(current, getMeasuredSizes()));
    setTimeout(() => {
      reactFlow?.fitView?.(FIT_VIEW_OPTIONS);
    }, 50);
  }, [reactFlow]);

  const zoomPercent = Math.round(storeViewport.zoom * 100);

  /* ------------------------------- display ------------------------------ */

  // What React Flow renders: derived nodes plus selection, measured sizes and
  // the type-highlight dimming. Rebuilt only when one of those changes.
  const baseNodes = useMemo(() => {
    const typeById = highlightType
      ? new Map(canvas.nodes.map((n) => [n.id, n.type]))
      : null;
    return derivedNodes.map((dn) => {
      const size = sizes.get(dn.id);
      return {
        ...dn,
        selected: dn.id === selectedNodeId || multiSelected.has(dn.id),
        ...(size ? { width: size.width, height: size.height } : {}),
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
  }, [derivedNodes, sizes, selectedNodeId, multiSelected, canvas.nodes, highlightType]);

  // Selected ideas that are on screen, for the branch controls.
  const selectedIds = useMemo(() => {
    const onScreen = new Set(derivedNodes.map((n) => n.id));
    const ids = new Set<UUID>(multiSelected);
    if (selectedNodeId !== null) ids.add(selectedNodeId);
    return [...ids].filter((id) => onScreen.has(id));
  }, [derivedNodes, multiSelected, selectedNodeId]);

  // Bring a freshly revealed idea into view when it lands off screen.
  const handleRevealed = useCallback(
    (id: UUID) => {
      const node = useCanvasStore.getState().canvas.nodes.find((n) => n.id === id);
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!node || !rect) return;
      const size = getMeasuredSizes().get(id) ?? { width: CARD_WIDTH, height: NODE_HEIGHT };
      const { x, y, zoom } = reactFlow.getViewport();
      const left = node.position.x * zoom + x;
      const top = node.position.y * zoom + y;
      const margin = 48;
      const inView =
        left >= margin &&
        top >= margin &&
        left + size.width * zoom <= rect.width - margin &&
        top + size.height * zoom <= rect.height - 96;
      if (!inView) {
        reactFlow.setCenter(node.position.x + size.width / 2, node.position.y + size.height / 2, {
          zoom,
          duration: 450,
        });
      }
    },
    [reactFlow],
  );

  // During a drag only the dragged cards change; every other card keeps its object.
  // Ideas grow out of / slide back into their parent as branches open and close.
  const animated = useBranchMotion(canvas, baseNodes, derivedEdges);

  const displayNodes = useMemo(() => {
    if (!livePositions) return animated.nodes;
    return animated.nodes.map((n) => {
      const live = livePositions.get(n.id);
      if (!live) return n;
      const isPrimary = dragState?.nodeId === n.id;
      return {
        ...n,
        position: live,
        data: {
          ...n.data,
          isDragging: true,
          dx: isPrimary ? dragState.dx : undefined,
          dy: isPrimary ? dragState.dy : undefined,
        },
      };
    });
  }, [animated.nodes, livePositions, dragState]);

  // Automatic connector ends re-route live while a card is dragged.
  const displayEdges = useMemo(
    () => (livePositions ? relayoutEdges(animated.edges, canvas, livePositions) : animated.edges),
    [animated.edges, canvas, livePositions],
  );

  /* ------------------------------ keyboard ------------------------------ */

  // Delete / Backspace removes the selected connector straight away (undo
  // brings it back) or opens the delete prompt for the selected idea.
  // Escape clears the selection.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const { selection, editor, deletePrompt } = useCanvasStore.getState();
      if (editor.openNodeId || deletePrompt.nodeId) return;

      if (e.key === 'Escape') {
        if (selection.nodeId || selection.edgeId) canvasActions.select(null);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (selection.edgeId) {
        e.preventDefault();
        canvasActions.removeEdge(selection.edgeId);
      } else if (selection.nodeId) {
        e.preventDefault();
        canvasActions.openDeletePrompt(selection.nodeId);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    onControlsReady?.({ fitView: handleFitView, getViewportCenter });
  }, [handleFitView, getViewportCenter, onControlsReady]);

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
      className={`relative h-full w-full select-none ${isConnecting ? 'is-connecting' : ''}`}
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
        ref={surfaceRef}
        className={`relative w-full h-full overflow-hidden ${
          isPanActive ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onDoubleClick={handleSurfaceDoubleClick}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          snapToGrid={snap}
          snapGrid={SNAP_GRID}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          panOnDrag={isPanActive ? true : [1, 2]}
          selectionOnDrag={!isPanActive}
          nodesDraggable={!isPanActive}
          nodesConnectable={!isPanActive}
          edgesUpdatable={!isPanActive}
          edgesFocusable={!isPanActive}
          zoomOnDoubleClick={false}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={CONNECTION_LINE_STYLE}
          connectionRadius={36}
          reconnectRadius={14}
          isValidConnection={isValidConnection}
          onConnectStart={handleConnectStart}
          onConnect={handleConnect}
          onConnectEnd={handleConnectEnd}
          onReconnectStart={handleReconnectStart}
          onReconnect={handleReconnect}
          elementsSelectable={!isPanActive}
          elevateEdgesOnSelect
          // Deletion goes through the store (see the keydown effect above);
          // React Flow's built-in delete only drops local view state.
          deleteKeyCode={null}
          onlyRenderVisibleElements
          onMove={handleMove}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onEdgeDoubleClick={handleEdgeDoubleClick}
          onPaneClick={handlePaneClick}
          proOptions={{ hideAttribution: true }}
        >
          {/* Two dot layers: a fine grid and a sparser, stronger one every 100px. */}
          <Background id="minor" variant={BackgroundVariant.Dots} gap={20} size={1.6} color="#b4b9cb" />
          <Background id="major" variant={BackgroundVariant.Dots} gap={100} size={2.6} color="#9299b3" />
        </ReactFlow>

        <WalkthroughBar onRevealed={handleRevealed} />

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
          <ToolbarIconButton label="Center on the selected idea" onClick={handleCenterSelected} testId="btn-root">
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

          <ToolbarDivider />

          <BranchToolbarGroup selectedIds={selectedIds} />
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
