/**
 * `useReactFlowGraph` — the derivation hook that turns the Zustand-backed
 * `Canvas` into the `{ nodes, edges }` pair `<ReactFlow>` renders.
 *
 * Contract (design.md §Canvas Layer — Public Surface):
 *
 *   - Subscribes to `useCanvasStore` on the `canvas` slice only. Any change
 *     that does not touch `canvas` (selection, editor, viewport) does not
 *     re-trigger the derivation.
 *   - The visible-node set is computed via `visibleNodeIds(canvas)` so a
 *     collapsed subtree is *not* handed to React Flow at all — cheaper than
 *     rendering-and-hiding, and it matches Requirement 6.4 (collapsed
 *     children and their connectors are absent from the DOM).
 *   - RF `nodes` map 1:1 to visible domain nodes: `id`, `type: 'research'`,
 *     `position`, `data: { nodeId }`. The card itself reads its full `Node`
 *     back from the store via a memoized selector on `nodeId` (see
 *     `nodes/NodeCard.tsx`); duplicating the whole node into `data` would
 *     make React Flow re-diff every prop on every edit.
 *   - RF `edges` are derived from `parentId` restricted to visible pairs
 *     (Property 2). Every edge uses the shared style from
 *     `./edgeStyles` — 1 px stroke, `#404040`, bezier.
 *
 * Edge id format is `e:{parentId}->{childId}`. It is stable per pair and
 * unique within a canvas, which is all React Flow requires.
 */

import { useMemo } from 'react';
import type { Edge, Node as RFNode } from 'reactflow';

import { useCanvasStore, visibleNodeIds } from '../data';
import type { Canvas, UUID } from '../data';

import {
  DEFAULT_EDGE_STYLE,
  DEFAULT_EDGE_TYPE,
} from './edgeStyles';

/**
 * The `data` payload React Flow attaches to every `'research'` node. Kept
 * intentionally minimal — `nodeId` is enough for `NodeCard` to look the
 * full node up in the store on its own subscription.
 */
export interface ResearchNodeData {
  readonly nodeId: UUID;
}

/**
 * The React Flow shape returned to `<ReactFlow>`. Exported so tests
 * (Property 2 / Task 9.4) can call the derivation function directly.
 */
export interface ReactFlowGraph {
  readonly nodes: RFNode<ResearchNodeData>[];
  readonly edges: Edge[];
}

/* -------------------------------------------------------------------------- */
/* Pure derivation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pure derivation of `{ nodes, edges }` from a canvas. Split from the hook
 * so property tests can call it without mounting React or the store.
 */
export function deriveReactFlowGraph(canvas: Canvas): ReactFlowGraph {
  const visible = visibleNodeIds(canvas);
  const rfNodes: RFNode<ResearchNodeData>[] = [];
  const rfEdges: Edge[] = [];

  for (const node of canvas.nodes) {
    if (!visible.has(node.id)) continue;

    rfNodes.push({
      id: node.id,
      type: 'research',
      position: { x: node.position.x, y: node.position.y },
      data: { nodeId: node.id },
    });

    // Derive the connector to the parent. Restrict to visible pairs so a
    // parent hidden behind a collapsed grandparent never produces a
    // dangling edge (Property 2, Requirement 1.5 / 6.4).
    if (node.parentId !== null && visible.has(node.parentId)) {
      rfEdges.push({
        id: `e:${node.parentId}->${node.id}`,
        source: node.parentId,
        target: node.id,
        type: DEFAULT_EDGE_TYPE,
        style: DEFAULT_EDGE_STYLE,
      });
    }
  }

  return { nodes: rfNodes, edges: rfEdges };
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Selector that returns just the `canvas` slice. Declared at module scope
 * so its identity is stable across renders — Zustand uses reference
 * equality on the selector output to decide whether to re-run subscribers.
 */
function selectCanvas(s: { canvas: Canvas }): Canvas {
  return s.canvas;
}

/**
 * React hook returning the RF-ready `{ nodes, edges }`. Memoized on the
 * canvas reference — mutators return a new `Canvas` on every write, so any
 * relevant change invalidates the memo; unrelated store slices (viewport,
 * selection) leave the cached derivation intact.
 */
export function useReactFlowGraph(): ReactFlowGraph {
  const canvas = useCanvasStore(selectCanvas);
  return useMemo(() => deriveReactFlowGraph(canvas), [canvas]);
}
