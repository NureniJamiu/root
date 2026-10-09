/**
 * Graph utilities for the Root data model.
 *
 * A `Canvas` is an immutable graph: nodes joined by directed edges
 * (`source` → `target`). Every function here is pure, never mutates its input
 * and runs in O(nodes + edges). Cycles are allowed, so every walk keeps a
 * visited set.
 *
 * "Downstream" of a node means the nodes reachable by following edges from
 * source to target. Collapsing a node hides what hangs only from it, and
 * "delete with sub-ideas" removes the same set, see `exclusiveDownstreamIds`.
 *
 * The layer has zero UI / framework dependencies.
 */

import type { Canvas, Edge, Node, Position, Side, UUID } from './types';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The sides of two cards that face each other: along the larger distance
 * between them, the connector leaves `from` on the side nearest `to` and
 * enters `to` on the side nearest `from`.
 */
export function computeFacingSides(
  from: Position,
  to: Position,
): { sourceSide: Side; targetSide: Side } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }
  return dy >= 0
    ? { sourceSide: 'bottom', targetSide: 'top' }
    : { sourceSide: 'top', targetSide: 'bottom' };
}

/**
 * The sides a connector is drawn on: a pinned end keeps its stored side, an
 * automatic end takes the side that faces the other card.
 */
export function resolveEdgeSides(
  edge: Pick<Edge, 'sourceSide' | 'targetSide' | 'sourcePinned' | 'targetPinned'>,
  sourcePos: Position,
  targetPos: Position,
): { sourceSide: Side; targetSide: Side } {
  const facing = computeFacingSides(sourcePos, targetPos);
  return {
    sourceSide: edge.sourcePinned ? edge.sourceSide : facing.sourceSide,
    targetSide: edge.targetPinned ? edge.targetSide : facing.targetSide,
  };
}

/* -------------------------------------------------------------------------- */
/* Indexes                                                                    */
/* -------------------------------------------------------------------------- */

/** Edges leaving each node, in `c.edges` order. */
export function outgoingIndex(c: Canvas): Map<UUID, Edge[]> {
  const index = new Map<UUID, Edge[]>();
  for (const e of c.edges) {
    const bucket = index.get(e.source);
    if (bucket === undefined) index.set(e.source, [e]);
    else bucket.push(e);
  }
  return index;
}

/** Edges entering each node, in `c.edges` order. */
export function incomingIndex(c: Canvas): Map<UUID, Edge[]> {
  const index = new Map<UUID, Edge[]>();
  for (const e of c.edges) {
    const bucket = index.get(e.target);
    if (bucket === undefined) index.set(e.target, [e]);
    else bucket.push(e);
  }
  return index;
}

/** Every edge that touches `id`, either end. */
export function connectionsOf(c: Canvas, id: UUID): Edge[] {
  return c.edges.filter((e) => e.source === id || e.target === id);
}

/** Identity of a connector's two attachment points; two edges with the same key are duplicates. */
export function edgeKey(e: Pick<Edge, 'source' | 'sourceSide' | 'target' | 'targetSide'>): string {
  return `${e.source}:${e.sourceSide}>${e.target}:${e.targetSide}`;
}

/** Would an edge with these ends repeat one that already exists (ignoring edge `ignoreId`)? */
export function isDuplicateEdge(
  c: Canvas,
  e: Pick<Edge, 'source' | 'sourceSide' | 'target' | 'targetSide'>,
  ignoreId?: UUID,
): boolean {
  const key = edgeKey(e);
  return c.edges.some((x) => x.id !== ignoreId && edgeKey(x) === key);
}

/* -------------------------------------------------------------------------- */
/* Downstream                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Nodes reachable from `id` by following edges forward, not counting `id`
 * itself. Empty when `id` is unknown.
 */
export function downstreamIds(c: Canvas, id: UUID): Set<UUID> {
  const found = new Set<UUID>();
  if (!c.nodes.some((n) => n.id === id)) return found;
  const out = outgoingIndex(c);
  const stack: UUID[] = [id];
  const seen = new Set<UUID>([id]);
  while (stack.length > 0) {
    const current = stack.pop() as UUID;
    for (const e of out.get(current) ?? []) {
      if (seen.has(e.target)) continue;
      seen.add(e.target);
      found.add(e.target);
      stack.push(e.target);
    }
  }
  return found;
}

/**
 * The part of `downstreamIds(id)` that hangs only from `id`: nodes that no
 * node outside `{id} ∪ result` points at. Collapsing `id` hides exactly these
 * nodes, and deleting "with sub-ideas" removes them.
 */
export function exclusiveDownstreamIds(c: Canvas, id: UUID): Set<UUID> {
  const candidates = downstreamIds(c, id);
  if (candidates.size === 0) return candidates;
  const incoming = incomingIndex(c);
  // A node that something outside the set points at is shared: drop it, and
  // anything that was only reachable through it may become shared in turn.
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeId of candidates) {
      const fromOutside = (incoming.get(nodeId) ?? []).some(
        (e) => e.source !== id && !candidates.has(e.source),
      );
      if (fromOutside) {
        candidates.delete(nodeId);
        changed = true;
      }
    }
  }
  return candidates;
}

/** `{id}` plus everything that hangs only from it. Empty when `id` is unknown. */
export function subtreeIds(c: Canvas, id: UUID): Set<UUID> {
  if (!c.nodes.some((n) => n.id === id)) return new Set();
  const ids = exclusiveDownstreamIds(c, id);
  ids.add(id);
  return ids;
}

/** Number of ideas that hang only from `id`. */
export function descendantCount(c: Canvas, id: UUID): number {
  return exclusiveDownstreamIds(c, id).size;
}

/* -------------------------------------------------------------------------- */
/* Visibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ids of the nodes that are shown. A collapsed node hides what is downstream
 * of it, and a hidden connector (an idea not yet revealed by its parent)
 * hides its target and what is downstream of that — unless the node can also
 * be reached from a visible node that is not collapsed, over a connector that
 * is not hidden. The collapsed node itself stays visible.
 */
export function visibleNodeIds(c: Canvas): Set<UUID> {
  const collapsed = c.nodes.filter((n) => n.collapsed);
  const hiddenEdges = c.edges.filter((e) => e.hidden === true);
  if (collapsed.length === 0 && hiddenEdges.length === 0) return new Set(c.nodes.map((n) => n.id));

  const hiddenCandidates = new Set<UUID>();
  for (const n of collapsed) {
    for (const id of downstreamIds(c, n.id)) hiddenCandidates.add(id);
  }
  for (const e of hiddenEdges) {
    hiddenCandidates.add(e.target);
    for (const id of downstreamIds(c, e.target)) hiddenCandidates.add(id);
  }

  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const visible = new Set<UUID>();
  const stack: UUID[] = [];
  for (const n of c.nodes) {
    if (hiddenCandidates.has(n.id)) continue;
    visible.add(n.id);
    if (!n.collapsed) stack.push(n.id);
  }

  // Pull a candidate back in when a shown, expanded node points at it.
  const out = outgoingIndex(c);
  while (stack.length > 0) {
    const current = stack.pop() as UUID;
    for (const e of out.get(current) ?? []) {
      if (e.hidden === true || visible.has(e.target)) continue;
      visible.add(e.target);
      if (!byId.get(e.target)?.collapsed) stack.push(e.target);
    }
  }
  return visible;
}

/**
 * The ideas connected straight from `id` (its children), each once, with
 * whether they are on screen. Ordered top to bottom, then left to right.
 */
export function childReveals(c: Canvas, id: UUID): Array<{ node: Node; shown: boolean }> {
  const parent = c.nodes.find((n) => n.id === id);
  if (!parent) return [];
  const visible = visibleNodeIds(c);
  // Shown from this parent: on screen and reached over a connector it has not hidden.
  const shownVia = new Set(
    parent.collapsed ? [] : c.edges.filter((e) => e.source === id && e.hidden !== true).map((e) => e.target),
  );
  const seen = new Set<UUID>();
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const children: Node[] = [];
  for (const e of c.edges) {
    if (e.source !== id || seen.has(e.target)) continue;
    seen.add(e.target);
    const child = byId.get(e.target);
    if (child) children.push(child);
  }
  children.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return children.map((node) => ({ node, shown: visible.has(node.id) && shownVia.has(node.id) }));
}

/** True when `id` keeps some of its children out of view (collapsed, or revealing one at a time). */
export function hasHiddenChildren(c: Canvas, id: UUID): boolean {
  const node = c.nodes.find((n) => n.id === id);
  if (!node) return false;
  const hasOut = c.edges.some((e) => e.source === id);
  return hasOut && (node.collapsed || c.edges.some((e) => e.source === id && e.hidden === true));
}

/** How many ideas hanging only from `id` are hidden right now. */
export function hiddenDescendantCount(c: Canvas, id: UUID): number {
  const visible = visibleNodeIds(c);
  let count = 0;
  for (const d of exclusiveDownstreamIds(c, id)) if (!visible.has(d)) count++;
  return count;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Give every node a 1-based number by creation order (ties broken by position
 * in `c.nodes`). Unlike a slice of the uuid, ordinals are unique within a
 * canvas, so they are safe to show as a short label.
 */
export function nodeOrdinals(c: Canvas): Map<UUID, number> {
  const ordered = c.nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) =>
      a.node.createdAt < b.node.createdAt ? -1
        : a.node.createdAt > b.node.createdAt ? 1
        : a.index - b.index,
    );
  const ordinals = new Map<UUID, number>();
  ordered.forEach(({ node }, i) => ordinals.set(node.id, i + 1));
  return ordinals;
}

/**
 * The ordinal `nodeOrdinals` would give `id`, computed for one node in O(n)
 * (no sort, no map) so a card can subscribe to just its own label.
 */
export function nodeOrdinal(c: Canvas, id: UUID): number {
  const index = c.nodes.findIndex((n) => n.id === id);
  const me = c.nodes[index];
  if (me === undefined) return 0;
  let before = 0;
  c.nodes.forEach((n, i) => {
    if (n.createdAt < me.createdAt || (n.createdAt === me.createdAt && i < index)) before += 1;
  });
  return before + 1;
}

/** Short label such as `#04` for a node, using `nodeOrdinals`. */
export function nodeLabel(node: Node, ordinals: ReadonlyMap<UUID, number>): string {
  return formatNodeLabel(node, ordinals.get(node.id) ?? 0);
}

/** Label for a node whose ordinal is already known. */
export function formatNodeLabel(_node: Node, ordinal: number): string {
  return `#${String(ordinal).padStart(2, '0')}`;
}
