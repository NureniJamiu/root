/**
 * `useBranchMotion` — animates ideas as they are shown and hidden.
 *
 * React Flow simply drops a node when it leaves the list it is given, so
 * collapsing would make a branch blink out. This hook compares what is on
 * screen now with the previous render and:
 *
 *   - marks ideas that just appeared (expand, a walkthrough step, undo) with
 *     `node-entering`, plus the offset back to the idea they hang from, so the
 *     card grows out of its parent into place;
 *   - keeps ideas that were just hidden (collapse, walkthrough Back) on screen
 *     for one short exit animation, marked `node-leaving`, sliding back into
 *     their parent while their connectors fade.
 *
 * React Flow measures a card's connection dots when it first renders, which
 * is mid-animation for an entering card, so they are measured again once
 * the card has landed.
 *
 * Opening a project, and users who ask for reduced motion, get no animation.
 * The animations themselves live in `app/index.css`.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useUpdateNodeInternals } from 'reactflow';
import type { Edge as RFEdge, Node as RFNode } from 'reactflow';

import type { Canvas, Position, UUID } from '../data';

export const ENTER_MS = 420;
export const LEAVE_MS = 240;

interface Motion {
  /** Ideas animating in, with the offset from their final spot to their parent. */
  readonly entering: ReadonlyMap<UUID, Position>;
  readonly enteringEdges: ReadonlySet<string>;
  /** Ideas animating out (no longer shown), with the offset to their parent. */
  readonly leaving: ReadonlyMap<UUID, { node: RFNode; offset: Position }>;
  readonly leavingEdges: readonly RFEdge[];
}

const still: Motion = {
  entering: new Map(),
  enteringEdges: new Set(),
  leaving: new Map(),
  leavingEdges: [],
};

interface Snapshot {
  readonly canvasId: string;
  readonly nodes: ReadonlyMap<UUID, RFNode>;
  readonly edges: readonly RFEdge[];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Offset from `id` to the shown idea it hangs from, scaled down a little. */
function offsetToParent(canvas: Canvas, id: UUID, shown: (id: UUID) => boolean): Position {
  const pos = new Map(canvas.nodes.map((n) => [n.id, n.position]));
  const self = pos.get(id);
  const parentEdge = canvas.edges.find((e) => e.target === id && shown(e.source));
  const parent = parentEdge ? pos.get(parentEdge.source) : undefined;
  if (!self || !parent) return { x: 0, y: 0 };
  return { x: Math.round((parent.x - self.x) * 0.85), y: Math.round((parent.y - self.y) * 0.85) };
}

function withOffset(node: RFNode, className: string, offset: Position): RFNode {
  return {
    ...node,
    className: node.className ? `${node.className} ${className}` : className,
    style: {
      ...node.style,
      '--branch-dx': `${offset.x}px`,
      '--branch-dy': `${offset.y}px`,
    } as CSSProperties,
  };
}

export function useBranchMotion(
  canvas: Canvas,
  nodes: RFNode[],
  edges: RFEdge[],
): { nodes: RFNode[]; edges: RFEdge[] } {
  const [motion, setMotion] = useState<Motion>(still);
  const previous = useRef<Snapshot | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    const prev = previous.current;
    const shownNow = new Map(nodes.map((n) => [n.id, n]));
    previous.current = { canvasId: canvas.id, nodes: shownNow, edges };
    if (prev === null || prev.canvasId !== canvas.id || prefersReducedMotion()) return;

    const exists = new Set(canvas.nodes.map((n) => n.id));
    const entering = new Map<UUID, Position>();
    for (const id of shownNow.keys()) {
      if (!prev.nodes.has(id)) entering.set(id, offsetToParent(canvas, id, (p) => shownNow.has(p)));
    }
    const leaving = new Map<UUID, { node: RFNode; offset: Position }>();
    for (const [id, node] of prev.nodes) {
      // Hidden, not deleted: deleted ideas just go.
      if (shownNow.has(id) || !exists.has(id)) continue;
      leaving.set(id, { node, offset: offsetToParent(canvas, id, (p) => shownNow.has(p)) });
    }
    if (entering.size === 0 && leaving.size === 0) return;

    const prevEdgeIds = new Set(prev.edges.map((e) => e.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    const enteringEdges = new Set(edges.filter((e) => !prevEdgeIds.has(e.id)).map((e) => e.id));
    const leavingEdges = prev.edges.filter(
      (e) => !edgeIds.has(e.id) && (leaving.has(e.source) || leaving.has(e.target)) &&
        (shownNow.has(e.source) || leaving.has(e.source)) && (shownNow.has(e.target) || leaving.has(e.target)),
    );

    setMotion((m) => ({
      entering: new Map([...m.entering, ...entering]),
      enteringEdges: new Set([...m.enteringEdges, ...enteringEdges]),
      leaving: new Map([...[...m.leaving].filter(([id]) => !shownNow.has(id)), ...leaving]),
      leavingEdges: [...m.leavingEdges.filter((e) => !edgeIds.has(e.id)), ...leavingEdges],
    }));

    const settle = (ms: number, apply: (m: Motion) => Motion) => {
      timers.current.push(setTimeout(() => setMotion(apply), ms));
    };
    if (entering.size > 0 || enteringEdges.size > 0) {
      settle(ENTER_MS + 40, (m) => ({
        ...m,
        entering: new Map([...m.entering].filter(([id]) => !entering.has(id))),
        enteringEdges: new Set([...m.enteringEdges].filter((id) => !enteringEdges.has(id))),
      }));
      // Re-measure the connection dots now that the cards sit in place.
      timers.current.push(setTimeout(() => updateNodeInternals([...entering.keys()]), ENTER_MS + 60));
    }
    if (leaving.size > 0) {
      const leavingEdgeIds = new Set(leavingEdges.map((e) => e.id));
      settle(LEAVE_MS + 20, (m) => ({
        ...m,
        leaving: new Map([...m.leaving].filter(([id]) => !leaving.has(id))),
        leavingEdges: m.leavingEdges.filter((e) => !leavingEdgeIds.has(e.id)),
      }));
    }
  }, [canvas, nodes, edges, updateNodeInternals]);

  useLayoutEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return useMemo(() => {
    const idle =
      motion.entering.size === 0 &&
      motion.enteringEdges.size === 0 &&
      motion.leaving.size === 0 &&
      motion.leavingEdges.length === 0;
    if (idle) return { nodes, edges };
    const outNodes = nodes.map((n) => {
      const offset = motion.entering.get(n.id);
      return offset ? withOffset(n, 'node-entering', offset) : n;
    });
    for (const [id, { node, offset }] of motion.leaving) {
      if (nodes.some((n) => n.id === id)) continue;
      outNodes.push({
        ...withOffset(node, 'node-leaving', offset),
        selected: false,
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      });
    }
    const outEdges = edges.map((e) =>
      motion.enteringEdges.has(e.id) ? { ...e, className: `${e.className ?? ''} edge-entering`.trim() } : e,
    );
    for (const e of motion.leavingEdges) {
      if (edges.some((x) => x.id === e.id)) continue;
      outEdges.push({ ...e, className: `${e.className ?? ''} edge-leaving`.trim(), selected: false, reconnectable: false });
    }
    return { nodes: outNodes, edges: outEdges };
  }, [motion, nodes, edges]);
}
