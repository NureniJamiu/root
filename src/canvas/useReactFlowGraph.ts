/**
 * `useReactFlowGraph` — the derivation hook that turns the Zustand-backed
 * `Canvas` into the `{ nodes, edges }` pair `<ReactFlow>` renders.
 *
 *   - Subscribes to the `canvas` slice and to the selection. Changes that do
 *     not touch those (editor, viewport) do not re-run the derivation, and
 *     neither does dragging a card: live drag positions are overlaid by
 *     `CanvasView`, and connectors follow their cards inside React Flow.
 *   - The visible-node set is computed via `visibleNodeIds(canvas)`, so the
 *     ideas hidden by a collapsed card, and every connector that touches one,
 *     are not handed to React Flow at all.
 *   - RF `nodes` map 1:1 to visible domain nodes: `id`, `type: 'research'`,
 *     `position`, `data: { nodeId }`. The card reads its full `Node` back from
 *     the store on its own subscription.
 *   - RF `edges` map 1:1 to the canvas's visible connectors. The edge id is
 *     the connector's own id, and its handles name the sides it is attached
 *     to (`source-right`, `target-top`, ...). Pinned ends use their stored
 *     side; automatic ends use the side that faces the other card.
 */

import { useMemo } from 'react';
import type { Edge as RFEdge, Node as RFNode } from 'reactflow';

import { resolveEdgeSides, useCanvasStore, visibleNodeIds } from '../data';
import type { Canvas, Position, UUID } from '../data';

import { CONNECTOR_EDGE_TYPE, EDGE_COLOR_BY_TYPE, EDGE_INTERACTION_WIDTH } from './edgeStyles';
import type { ConnectorEdgeData } from './ConnectorEdge';
import { sourceHandleId, targetHandleId } from './reconnect';

/**
 * The `data` payload React Flow attaches to every `'research'` node. Kept
 * intentionally minimal — `nodeId` is enough for `NodeCard` to look the
 * full node up in the store on its own subscription.
 */
export interface ResearchNodeData {
  readonly nodeId: UUID;
}

export interface DeriveGraphOptions {
  readonly selectedEdgeId?: UUID | null;
}

export interface ReactFlowGraph {
  readonly nodes: RFNode<ResearchNodeData>[];
  readonly edges: RFEdge<ConnectorEdgeData>[];
}

/**
 * Pure derivation of `{ nodes, edges }` from a canvas. Split from the hook
 * so tests can call it without mounting React or the store.
 */
export function deriveReactFlowGraph(
  canvas: Canvas,
  options?: DeriveGraphOptions,
): ReactFlowGraph {
  const visible = visibleNodeIds(canvas);
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));

  const nodes: RFNode<ResearchNodeData>[] = [];
  for (const node of canvas.nodes) {
    if (!visible.has(node.id)) continue;
    nodes.push({
      id: node.id,
      type: 'research',
      position: { x: node.position.x, y: node.position.y },
      data: { nodeId: node.id },
    });
  }

  const edges: RFEdge<ConnectorEdgeData>[] = [];
  for (const edge of canvas.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    const sides = from && to ? resolveEdgeSides(edge, from.position, to.position) : edge;
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: sourceHandleId(sides.sourceSide),
      targetHandle: targetHandleId(sides.targetSide),
      type: CONNECTOR_EDGE_TYPE,
      selected: options?.selectedEdgeId === edge.id,
      data: {
        color: from ? EDGE_COLOR_BY_TYPE[from.type] : '#737785',
        dashed: to?.type === 'question',
      },
      reconnectable: true,
      interactionWidth: EDGE_INTERACTION_WIDTH,
    });
  }

  return { nodes, edges };
}

/**
 * Re-resolve the handles of connectors that touch a card being dragged, using
 * the live positions, so automatic ends re-route while the card moves.
 * Connectors that do not touch a dragged card keep their object.
 */
export function relayoutEdges(
  edges: readonly RFEdge<ConnectorEdgeData>[],
  canvas: Canvas,
  live: ReadonlyMap<UUID, Position>,
): RFEdge<ConnectorEdgeData>[] {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const stored = new Map(canvas.edges.map((e) => [e.id, e]));
  return edges.map((rf) => {
    if (!live.has(rf.source) && !live.has(rf.target)) return rf;
    const edge = stored.get(rf.id);
    const from = byId.get(rf.source);
    const to = byId.get(rf.target);
    if (!edge || !from || !to) return rf;
    const sides = resolveEdgeSides(edge, live.get(rf.source) ?? from.position, live.get(rf.target) ?? to.position);
    const sourceHandle = sourceHandleId(sides.sourceSide);
    const targetHandle = targetHandleId(sides.targetSide);
    return sourceHandle === rf.sourceHandle && targetHandle === rf.targetHandle
      ? rf
      : { ...rf, sourceHandle, targetHandle };
  });
}

function selectCanvas(s: { canvas: Canvas }): Canvas {
  return s.canvas;
}

function selectSelectedEdgeId(s: { selection: { edgeId: UUID | null } }): UUID | null {
  return s.selection.edgeId;
}

/** React hook returning the RF-ready `{ nodes, edges }`, memoized on canvas and edge selection. */
export function useReactFlowGraph(): ReactFlowGraph {
  const canvas = useCanvasStore(selectCanvas);
  const selectedEdgeId = useCanvasStore(selectSelectedEdgeId);
  return useMemo(() => deriveReactFlowGraph(canvas, { selectedEdgeId }), [canvas, selectedEdgeId]);
}
