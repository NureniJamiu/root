/**
 * `useBranchMotion` — animates ideas as they are shown and hidden.
 *
 * React Flow simply drops a node when it leaves the list it is given, so
 * collapsing would make a branch blink out. This hook compares what is on
 * screen now with the previous render and:
 *
 *   - glides ideas that just appeared (expand, a reveal, a walkthrough step,
 *     undo) out from the idea they hang from into place, fading in;
 *   - keeps ideas that were just hidden on screen for one short exit, gliding
 *     back into their parent while fading out.
 *
 * Card and connector move as one: the card's real position is animated
 * frame by frame, so React Flow redraws its connectors attached to it on
 * every frame, and the connector's opacity follows the same clock as the
 * card's. Nothing lags behind.
 *
 * Opening a project, and users who ask for reduced motion, get no animation.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Edge as RFEdge, Node as RFNode } from 'reactflow';

import type { Canvas, Position, UUID } from '../data';

import type { ConnectorEdgeData } from './ConnectorEdge';

export const ENTER_MS = 380;
export const LEAVE_MS = 260;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t ** 3;

interface Flight {
  readonly kind: 'enter' | 'leave';
  readonly from: Position;
  readonly to: Position;
  readonly start: number;
  /** For a leaving idea, the last node React Flow was given for it. */
  readonly node?: RFNode;
}

interface Motion {
  readonly flights: ReadonlyMap<UUID, Flight>;
  /** Connectors of a leaving idea, kept until it has gone. */
  readonly leavingEdges: ReadonlyMap<string, { edge: RFEdge; start: number }>;
  /** Connectors that just appeared between ideas that were already shown. */
  readonly fadingInEdges: ReadonlyMap<string, number>;
}

const still: Motion = { flights: new Map(), leavingEdges: new Map(), fadingInEdges: new Map() };

interface Snapshot {
  readonly canvasId: string;
  readonly nodes: ReadonlyMap<UUID, RFNode>;
  readonly edges: readonly RFEdge[];
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Where the idea `id` hangs from: the position of a shown idea connected to it. */
function parentPosition(canvas: Canvas, id: UUID, shown: (id: UUID) => boolean): Position | null {
  const edge = canvas.edges.find((e) => e.target === id && shown(e.source));
  if (!edge) return null;
  return canvas.nodes.find((n) => n.id === edge.source)?.position ?? null;
}

function lerp(a: Position, b: Position, t: number): Position {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 0 → 1 progress of a flight at `now`, already eased, plus its opacity. */
function progress(f: Flight, now: number): { t: number; opacity: number; done: boolean } {
  const ms = f.kind === 'enter' ? ENTER_MS : LEAVE_MS;
  const raw = Math.min(1, Math.max(0, (now - f.start) / ms));
  const t = f.kind === 'enter' ? easeOut(raw) : easeIn(raw);
  return { t, opacity: f.kind === 'enter' ? t : 1 - t, done: raw >= 1 };
}

function withOpacity(edge: RFEdge<ConnectorEdgeData>, opacity: number): RFEdge<ConnectorEdgeData> {
  return { ...edge, data: { ...(edge.data as ConnectorEdgeData), opacity } };
}

export function useBranchMotion(
  canvas: Canvas,
  nodes: RFNode[],
  edges: RFEdge<ConnectorEdgeData>[],
): { nodes: RFNode[]; edges: RFEdge<ConnectorEdgeData>[] } {
  const [motion, setMotion] = useState<Motion>(still);
  const [now, setNow] = useState(clock);
  const previous = useRef<Snapshot | null>(null);

  useLayoutEffect(() => {
    const prev = previous.current;
    const shownNow = new Map(nodes.map((n) => [n.id, n]));
    previous.current = { canvasId: canvas.id, nodes: shownNow, edges };
    if (prev === null || prev.canvasId !== canvas.id || prefersReducedMotion()) return;

    const start = clock();
    const exists = new Set(canvas.nodes.map((n) => n.id));
    const flights = new Map<UUID, Flight>();
    for (const [id, node] of shownNow) {
      if (prev.nodes.has(id)) continue;
      const from = parentPosition(canvas, id, (p) => shownNow.has(p) && p !== id) ?? node.position;
      flights.set(id, { kind: 'enter', from, to: node.position, start });
    }
    for (const [id, node] of prev.nodes) {
      // Hidden, not deleted: deleted ideas just go.
      if (shownNow.has(id) || !exists.has(id)) continue;
      const to = parentPosition(canvas, id, (p) => shownNow.has(p)) ?? node.position;
      flights.set(id, { kind: 'leave', from: node.position, to, start, node });
    }

    const prevEdgeIds = new Set(prev.edges.map((e) => e.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    const leavingEdges = new Map<string, { edge: RFEdge; start: number }>();
    for (const e of prev.edges) {
      if (edgeIds.has(e.id)) continue;
      const leavingEnd = flights.get(e.source)?.kind === 'leave' || flights.get(e.target)?.kind === 'leave';
      const endsKept = (id: UUID) => shownNow.has(id) || flights.get(id)?.kind === 'leave';
      if (leavingEnd && endsKept(e.source) && endsKept(e.target)) leavingEdges.set(e.id, { edge: e, start });
    }
    // Connectors whose ends were both already on screen (a new connection, undo).
    const fadingInEdges = new Map<string, number>();
    for (const e of edges) {
      if (prevEdgeIds.has(e.id) || flights.has(e.source) || flights.has(e.target)) continue;
      fadingInEdges.set(e.id, start);
    }
    if (flights.size === 0 && fadingInEdges.size === 0) return;

    setMotion((m) => ({
      flights: new Map([...[...m.flights].filter(([id]) => !flights.has(id)), ...flights]),
      leavingEdges: new Map([...[...m.leavingEdges].filter(([id]) => !edgeIds.has(id)), ...leavingEdges]),
      fadingInEdges: new Map([...m.fadingInEdges, ...fadingInEdges]),
    }));
    setNow(start);
  }, [canvas, nodes, edges]);

  // One clock for every card and connector in flight.
  const active = motion.flights.size > 0 || motion.fadingInEdges.size > 0;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const t = clock();
      setNow(t);
      setMotion((m) => {
        const flights = new Map([...m.flights].filter(([, f]) => !progress(f, t).done));
        const leavingEdges = new Map([...m.leavingEdges].filter(([, e]) => t - e.start < LEAVE_MS));
        const fadingInEdges = new Map([...m.fadingInEdges].filter(([, s]) => t - s < ENTER_MS));
        const changed =
          flights.size !== m.flights.size ||
          leavingEdges.size !== m.leavingEdges.size ||
          fadingInEdges.size !== m.fadingInEdges.size;
        return changed ? { flights, leavingEdges, fadingInEdges } : m;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return useMemo(() => {
    if (!active && motion.leavingEdges.size === 0) return { nodes, edges };

    const opacityOf = new Map<UUID, number>();
    const outNodes = nodes.map((n) => {
      const f = motion.flights.get(n.id);
      if (!f || f.kind !== 'enter') return n;
      const p = progress(f, now);
      opacityOf.set(n.id, p.opacity);
      return {
        ...n,
        position: lerp(f.from, f.to, p.t),
        className: n.className ? `${n.className} node-in-flight` : 'node-in-flight',
        style: { ...n.style, opacity: p.opacity },
      };
    });
    for (const [id, f] of motion.flights) {
      if (f.kind !== 'leave' || !f.node || nodes.some((n) => n.id === id)) continue;
      const p = progress(f, now);
      opacityOf.set(id, p.opacity);
      outNodes.push({
        ...f.node,
        position: lerp(f.from, f.to, p.t),
        className: f.node.className ? `${f.node.className} node-in-flight` : 'node-in-flight',
        style: { ...f.node.style, opacity: p.opacity },
        selected: false,
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      });
    }

    // A connector is exactly as faded as the card in flight at either end.
    const edgeOpacity = (e: RFEdge): number | undefined => {
      const a = opacityOf.get(e.source);
      const b = opacityOf.get(e.target);
      if (a === undefined && b === undefined) return undefined;
      return Math.min(a ?? 1, b ?? 1);
    };
    const outEdges = edges.map((e) => {
      const fromCard = edgeOpacity(e);
      if (fromCard !== undefined) return withOpacity(e, fromCard);
      const fadeStart = motion.fadingInEdges.get(e.id);
      if (fadeStart !== undefined) return withOpacity(e, easeOut(Math.min(1, (now - fadeStart) / ENTER_MS)));
      return e;
    });
    for (const [id, { edge }] of motion.leavingEdges) {
      if (edges.some((x) => x.id === id)) continue;
      outEdges.push({
        ...withOpacity(edge as RFEdge<ConnectorEdgeData>, edgeOpacity(edge) ?? 0),
        selected: false,
        reconnectable: false,
        className: `${edge.className ?? ''} edge-in-flight`.trim(),
      });
    }
    return { nodes: outNodes, edges: outEdges };
  }, [active, motion, nodes, edges, now]);
}
