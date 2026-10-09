/**
 * Pure mutators for the Root `Canvas`.
 *
 * Every mutator in this module is a pure function `(Canvas, ...) => Canvas`.
 * The input canvas is never mutated; on success a new `Canvas` object is
 * returned. Whenever the canvas changes, `canvas.updatedAt` is bumped to
 * `now()`.
 *
 * Guarding: an invariant-breaking or nonsensical input (unknown id, a
 * connector from a node to itself, a duplicate connector, ...) returns the
 * input canvas unchanged. No exceptions are thrown; the store's write path
 * re-validates with `canvasSchema.safeParse` before committing.
 */

import { newId } from './ids';
import { IMAGE_DATA_URL_MAX_BYTES } from './limits';
import { now } from './time';
import { computeFacingSides, downstreamIds, isDuplicateEdge, resolveEdgeSides, subtreeIds } from './graph';
import type { Canvas, Edge, ImageEntry, Node, NodeType, Position, Side, UUID } from './types';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Return the byte length of `s` when UTF-8 encoded. Used to cap image data
 * URLs by their actual on-the-wire size rather than JavaScript character
 * count.
 */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Return a new node list built by applying `patch` to the node whose `id`
 * matches; other nodes are passed through unchanged. Returns `null` when
 * `id` is not present so callers can short-circuit to a no-op.
 */
function replaceNode(
  nodes: Node[],
  id: UUID,
  patch: (n: Node) => Node,
): Node[] | null {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const current = nodes[idx];
  // idx came from findIndex on the same array, so this is defined; the
  // assertion narrows the `noUncheckedIndexedAccess` union.
  if (current === undefined) return null;
  const next = nodes.slice();
  next[idx] = patch(current);
  return next;
}

/**
 * Re-resolve the stored sides of automatic (unpinned) connector ends touching
 * `moved`, so a canvas always stores the sides its connectors are drawn on.
 * Returns `edges` itself when nothing changes.
 */
function refreshAutoSides(nodes: readonly Node[], edges: readonly Edge[], moved: ReadonlySet<UUID>): readonly Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let changed = false;
  const next = edges.map((e) => {
    if (!moved.has(e.source) && !moved.has(e.target)) return e;
    if (e.sourcePinned && e.targetPinned) return e;
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) return e;
    const sides = resolveEdgeSides(e, from.position, to.position);
    if (sides.sourceSide === e.sourceSide && sides.targetSide === e.targetSide) return e;
    changed = true;
    return { ...e, ...sides };
  });
  return changed ? next : edges;
}

/* -------------------------------------------------------------------------- */
/* emptyCanvas                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Return a fresh `Canvas` with a new id, empty title, no nodes, and a
 * timestamp of `now()`.
 */
export function emptyCanvas(): Canvas {
  return {
    id: newId(),
    title: '',
    nodes: [],
    edges: [],
    updatedAt: now(),
  };
}

/* -------------------------------------------------------------------------- */
/* addNode / addChild                                                         */
/* -------------------------------------------------------------------------- */

function blankNode(position: Position, ts: string): Node {
  return {
    id: newId(),
    title: '',
    body: '',
    images: [],
    type: 'topic',
    position,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Append a new, unconnected node at `position`. Works on any canvas, empty or
 * not: ideas do not have to hang from anything.
 */
export function addNode(c: Canvas, opts: { position: Position }): Canvas {
  const ts = now();
  return { ...c, nodes: [...c.nodes, blankNode(opts.position, ts)], updatedAt: ts };
}

/**
 * Append a new node at `position` and connect `parentId` to it. The connector
 * follows the facing sides of the two cards unless `sourceSide` / `targetSide`
 * are given, which pins that end. A collapsed parent is expanded so the new node is visible.
 * Unknown `parentId` returns `c` unchanged.
 */
export function addChild(
  c: Canvas,
  parentId: UUID,
  opts: { position: Position; sourceSide?: Side; targetSide?: Side },
): Canvas {
  const parent = c.nodes.find((n) => n.id === parentId);
  if (parent === undefined) return c;

  const ts = now();
  const child = blankNode(opts.position, ts);
  const facing = computeFacingSides(parent.position, opts.position);
  const edge: Edge = {
    id: newId(),
    source: parentId,
    target: child.id,
    sourceSide: opts.sourceSide ?? facing.sourceSide,
    targetSide: opts.targetSide ?? facing.targetSide,
    // A side that was asked for is the user's choice, so it stays put.
    sourcePinned: opts.sourceSide !== undefined,
    targetPinned: opts.targetSide !== undefined,
  };
  const nodes = c.nodes.map((n) =>
    n.id === parentId && n.collapsed ? { ...n, collapsed: false, updatedAt: ts } : n,
  );
  nodes.push(child);
  return { ...c, nodes, edges: [...c.edges, edge], updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* updateNode                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fields on a `Node` that `updateNode` is allowed to patch. Position moves
 * go through `moveNode`; collapse toggles go through `setCollapsed`; image
 * mutations go through `addImage` / `removeImage`; timestamps and structural
 * fields (`id`, `parentId`) are never patched here.
 */
export interface NodePatch {
  title?: string;
  body?: string;
  type?: NodeType;
}

/**
 * Shallow-merge `patch` into the node identified by `id` (R4.2 / R4.3 /
 * R4.6). Fields absent from the patch are preserved. `updatedAt` is bumped
 * on both the node and the canvas whenever the node exists.
 *
 * Unknown `id` returns `c` unchanged.
 */
export function updateNode(c: Canvas, id: UUID, patch: NodePatch): Canvas {
  const ts = now();
  const nextNodes = replaceNode(c.nodes, id, (n) => ({
    ...n,
    ...(patch.title !== undefined ? { title: patch.title } : null),
    ...(patch.body !== undefined ? { body: patch.body } : null),
    ...(patch.type !== undefined ? { type: patch.type } : null),
    updatedAt: ts,
  }));
  if (nextNodes === null) return c;
  return { ...c, nodes: nextNodes, updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* addImage                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Append `image` to the images list of the node identified by `id` (R4.4).
 *
 * Rejects (returns `c` unchanged) when:
 *   - The node is not present in `c`.
 *   - `image.dataUrl` exceeds the 2 MB byte cap (design.md §Error Handling
 *     — user-input error surfaced inline by the editor; the mutator itself
 *     is silently defensive).
 */
export function addImage(c: Canvas, id: UUID, image: ImageEntry): Canvas {
  if (byteLength(image.dataUrl) > IMAGE_DATA_URL_MAX_BYTES) return c;
  const ts = now();
  const nextNodes = replaceNode(c.nodes, id, (n) => ({
    ...n,
    images: [...n.images, image],
    updatedAt: ts,
  }));
  if (nextNodes === null) return c;
  return { ...c, nodes: nextNodes, updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* removeImage                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Remove the image identified by `imageId` from the images list of the node
 * identified by `id` (R4.5). If the node or the image is not present the
 * canvas is returned unchanged (no timestamp bump).
 */
export function removeImage(c: Canvas, id: UUID, imageId: UUID): Canvas {
  const nodeIdx = c.nodes.findIndex((n) => n.id === id);
  if (nodeIdx === -1) return c;
  const node = c.nodes[nodeIdx];
  // nodeIdx came from findIndex on the same array; the guard narrows the
  // `noUncheckedIndexedAccess` union.
  if (node === undefined) return c;
  const imgIdx = node.images.findIndex((img) => img.id === imageId);
  if (imgIdx === -1) return c;
  const ts = now();
  const nextImages = node.images.slice();
  nextImages.splice(imgIdx, 1);
  const nextNodes = c.nodes.slice();
  nextNodes[nodeIdx] = { ...node, images: nextImages, updatedAt: ts };
  return { ...c, nodes: nextNodes, updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* moveNode                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Set the position of the node identified by `id`. Other cards are untouched;
 * connectors follow their card, and their automatic ends are re-resolved.
 * Unknown `id` returns `c` unchanged.
 */
export function moveNode(c: Canvas, id: UUID, position: Position): Canvas {
  return moveNodes(c, new Map([[id, position]]));
}

/**
 * Set the positions of several nodes at once (a multi-card drag is one edit).
 * Ids that are unknown are ignored; `c` is returned unchanged when nothing
 * moves. Automatic connector ends touching a moved card are re-resolved.
 */
export function moveNodes(c: Canvas, positions: ReadonlyMap<UUID, Position>): Canvas {
  const ts = now();
  let changed = false;
  const nodes = c.nodes.map((n) => {
    const next = positions.get(n.id);
    if (next === undefined || (next.x === n.position.x && next.y === n.position.y)) return n;
    changed = true;
    return { ...n, position: next, updatedAt: ts };
  });
  if (!changed) return c;
  const edges = refreshAutoSides(nodes, c.edges, new Set(positions.keys()));
  return { ...c, nodes, edges: edges as Edge[], updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* setCollapsed                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Set the `collapsed` flag on the node identified by `id` (R6.1 / R6.3).
 * A node's own `collapsed` hides its children, not itself. Unknown `id`
 * returns `c` unchanged.
 */
export function setCollapsed(c: Canvas, id: UUID, collapsed: boolean): Canvas {
  const ts = now();
  const nextNodes = replaceNode(c.nodes, id, (n) => ({
    ...n,
    collapsed,
    updatedAt: ts,
  }));
  if (nextNodes === null) return c;
  return { ...c, nodes: nextNodes, updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* expandSubtree                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Clear `collapsed` on the node identified by `id` and on every descendant,
 * so the whole branch becomes visible (unlike `setCollapsed`, which only
 * reveals one level). Returns `c` unchanged when the id is unknown or no
 * node in the branch is collapsed.
 */
export function expandSubtree(c: Canvas, id: UUID): Canvas {
  if (!c.nodes.some((n) => n.id === id)) return c;
  const branch = downstreamIds(c, id);
  branch.add(id);
  if (!c.nodes.some((n) => branch.has(n.id) && n.collapsed)) return c;
  const ts = now();
  const nextNodes = c.nodes.map((n) =>
    branch.has(n.id) && n.collapsed ? { ...n, collapsed: false, updatedAt: ts } : n,
  );
  return { ...c, nodes: nextNodes, updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* setCanvasTitle                                                             */
/* -------------------------------------------------------------------------- */

/** Rename the canvas. Returns `c` unchanged when the title is identical. */
export function setCanvasTitle(c: Canvas, title: string): Canvas {
  if (c.title === title) return c;
  return { ...c, title, updatedAt: now() };
}

/* -------------------------------------------------------------------------- */
/* deleteNodeOnly / deleteSubtree                                             */
/* -------------------------------------------------------------------------- */

function removeNodes(c: Canvas, doomed: ReadonlySet<UUID>): Canvas {
  return {
    ...c,
    nodes: c.nodes.filter((n) => !doomed.has(n.id)),
    edges: c.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
    updatedAt: now(),
  };
}

/**
 * Remove the node identified by `id` and every connector attached to it. The
 * nodes it was connected to stay where they are. Unknown `id` returns `c`
 * unchanged.
 */
export function deleteNodeOnly(c: Canvas, id: UUID): Canvas {
  if (!c.nodes.some((n) => n.id === id)) return c;
  return removeNodes(c, new Set([id]));
}

/**
 * Remove the node identified by `id` together with every node that hangs only
 * from it (see `subtreeIds`), and all connectors attached to any of them.
 * Unknown `id` returns `c` unchanged.
 */
export function deleteSubtree(c: Canvas, id: UUID): Canvas {
  const doomed = subtreeIds(c, id);
  if (doomed.size === 0) return c;
  return removeNodes(c, doomed);
}

/* -------------------------------------------------------------------------- */
/* Connectors                                                                 */
/* -------------------------------------------------------------------------- */

export interface ConnectorEnds {
  source: UUID;
  target: UUID;
  sourceSide: Side;
  targetSide: Side;
  /** The user chose this side; it stays when the card moves. Defaults to false on `connect`, to the current value on `updateEdge`. */
  sourcePinned?: boolean | undefined;
  targetPinned?: boolean | undefined;
}

/** Why a set of ends cannot form a connector, or `null` when it can. */
function rejectEnds(c: Canvas, ends: ConnectorEnds, ignoreId?: UUID): string | null {
  if (ends.source === ends.target) return 'self';
  const ids = new Set(c.nodes.map((n) => n.id));
  if (!ids.has(ends.source) || !ids.has(ends.target)) return 'unknown';
  if (isDuplicateEdge(c, ends, ignoreId)) return 'duplicate';
  return null;
}

/**
 * Add a connector. Rejected (returns `c`) for a connector from a node to
 * itself, an unknown node, or a connector that repeats an existing one. Two
 * cards may share any number of connectors as long as they attach to
 * different sides.
 */
export function connect(c: Canvas, ends: ConnectorEnds): Canvas {
  if (rejectEnds(c, ends) !== null) return c;
  const edge: Edge = {
    id: newId(),
    source: ends.source,
    target: ends.target,
    sourceSide: ends.sourceSide,
    targetSide: ends.targetSide,
    sourcePinned: ends.sourcePinned ?? false,
    targetPinned: ends.targetPinned ?? false,
  };
  return { ...c, edges: [...c.edges, edge], updatedAt: now() };
}

/**
 * Re-attach an existing connector: move either end to another card or to
 * another side of the same card. Same guards as `connect`. Pin flags that are
 * not given are kept. Returns `c` when nothing changes.
 */
export function updateEdge(c: Canvas, edgeId: UUID, ends: ConnectorEnds): Canvas {
  const current = c.edges.find((e) => e.id === edgeId);
  if (current === undefined) return c;
  const next: Edge = {
    id: current.id,
    source: ends.source,
    target: ends.target,
    sourceSide: ends.sourceSide,
    targetSide: ends.targetSide,
    sourcePinned: ends.sourcePinned ?? current.sourcePinned,
    targetPinned: ends.targetPinned ?? current.targetPinned,
  };
  if (
    next.source === current.source &&
    next.target === current.target &&
    next.sourceSide === current.sourceSide &&
    next.targetSide === current.targetSide &&
    next.sourcePinned === current.sourcePinned &&
    next.targetPinned === current.targetPinned
  ) {
    return c;
  }
  if (rejectEnds(c, ends, edgeId) !== null) return c;
  return { ...c, edges: c.edges.map((e) => (e.id === edgeId ? next : e)), updatedAt: now() };
}

/**
 * Hand a connector back to automatic routing: both ends are unpinned and take
 * the sides that face each other. Returns `c` when it is already automatic or
 * the facing sides would repeat another connector.
 */
export function autoRouteEdge(c: Canvas, edgeId: UUID): Canvas {
  const edge = c.edges.find((e) => e.id === edgeId);
  if (edge === undefined) return c;
  const from = c.nodes.find((n) => n.id === edge.source);
  const to = c.nodes.find((n) => n.id === edge.target);
  if (!from || !to) return c;
  const sides = computeFacingSides(from.position, to.position);
  return updateEdge(c, edgeId, { ...edge, ...sides, sourcePinned: false, targetPinned: false });
}

/** Remove one connector. Both cards stay. Unknown `edgeId` returns `c` unchanged. */
export function removeEdge(c: Canvas, edgeId: UUID): Canvas {
  if (!c.edges.some((e) => e.id === edgeId)) return c;
  return { ...c, edges: c.edges.filter((e) => e.id !== edgeId), updatedAt: now() };
}
