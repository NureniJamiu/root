/**
 * Pure mutators for the Root MVP `Canvas`.
 *
 * Every mutator in this module is a pure function `(Canvas, ...) => Canvas`.
 * The input canvas is never mutated; on success a new `Canvas` object is
 * returned. Whenever nodes change, `canvas.updatedAt` is bumped to `now()`.
 *
 * Guarding: an invariant-breaking or nonsensical input returns the input
 * canvas unchanged (design.md §Mutator Semantics, §Error Handling — the
 * mutators are the "last line of defense before the store `set` call"). No
 * exceptions are thrown; the store's write path re-validates with
 * `canvasSchema.safeParse` before committing.
 *
 * Requirements covered here:
 *   R2.2  addRoot shape and precondition
 *   R3.1  addChild shape
 *   R3.4  addChild auto-expands a collapsed parent
 *   R3.5  reject operations that would create a cycle (addChild rejects
 *         unknown parentId; new nodes have no children so no other
 *         cycle-creating paths exist for the MVP mutators)
 *   R4.2  updateNode(title) bumps updatedAt
 *   R4.3  updateNode(body) bumps updatedAt
 *   R4.4  addImage appends an image entry (data URL cap 2 MB)
 *   R4.5  removeImage removes an image entry
 *   R4.6  updateNode(type) bumps updatedAt
 *   R5.2  moveNode commits final position and bumps updatedAt
 *   R5.4  moveNode does not touch descendants
 *   R6.1  setCollapsed(id, true)
 *   R6.3  setCollapsed(id, false)
 *   R7.1  deleteNodeOnly on a leaf (or any non-root node)
 *   R7.3  deleteNodeOnly reparents children to the deleted node's parent
 *   R7.4  deleteSubtree removes id and all descendants
 *   R7.5  deleteNodeOnly on the root with children is a no-op
 */

import { newId } from './ids';
import { now } from './time';
import { subtreeIds } from './tree';
import type { Canvas, ImageEntry, Node, NodeType, Position, UUID } from './types';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Per-image data-URL byte cap: 2 MB (design.md §Error Handling, R4.4). */
const IMAGE_DATA_URL_MAX_BYTES = 2 * 1024 * 1024;

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
 * Return `c` with `updatedAt` refreshed and `nodes` replaced by `nodes`. This
 * is the single point where the canvas timestamp is bumped, so every mutator
 * routes its final assembly through here.
 */
function withNodes(c: Canvas, nodes: Node[]): Canvas {
  return { ...c, nodes, updatedAt: now() };
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
    updatedAt: now(),
  };
}

/* -------------------------------------------------------------------------- */
/* addRoot                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Append a root node to an empty canvas. Precondition: `c.nodes.length === 0`
 * (R2.2). If the canvas is non-empty, returns `c` unchanged.
 */
export function addRoot(c: Canvas, opts: { position: Position }): Canvas {
  if (c.nodes.length !== 0) return c;
  const ts = now();
  const root: Node = {
    id: newId(),
    parentId: null,
    title: '',
    body: '',
    images: [],
    type: 'topic',
    position: opts.position,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
  };
  return { ...c, nodes: [root], updatedAt: ts };
}

/* -------------------------------------------------------------------------- */
/* addChild                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Append a child node under `parentId` (R3.1). If `parentId` is not present
 * in `c` the operation is a no-op and `c` is returned unchanged (R3.5 —
 * dangling parents are rejected at the mutator boundary).
 *
 * If the parent is collapsed at the time of the call, its `collapsed` flag
 * is cleared in the returned canvas (R3.4). The parent's other fields are
 * preserved.
 *
 * The new node is a `topic` with empty title / body / images, `collapsed:
 * false`, and matching `createdAt` / `updatedAt` timestamps.
 */
export function addChild(
  c: Canvas,
  parentId: UUID,
  opts: { position: Position },
): Canvas {
  const parentIdx = c.nodes.findIndex((n) => n.id === parentId);
  if (parentIdx === -1) return c;
  const parent = c.nodes[parentIdx];
  // parentIdx came from findIndex on the same array, so this is defined; the
  // guard narrows the `noUncheckedIndexedAccess` union.
  if (parent === undefined) return c;

  const ts = now();

  // Auto-expand the parent per R3.4. Only rebuild the parent object when
  // the flag actually needs to change to keep referential-equality churn
  // minimal.
  const nextNodes = c.nodes.slice();
  if (parent.collapsed) {
    nextNodes[parentIdx] = { ...parent, collapsed: false, updatedAt: ts };
  }

  const child: Node = {
    id: newId(),
    parentId,
    title: '',
    body: '',
    images: [],
    type: 'topic',
    position: opts.position,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
  };
  nextNodes.push(child);

  return { ...c, nodes: nextNodes, updatedAt: ts };
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
 * Set the position of the node identified by `id` (R5.2). Descendants are
 * untouched (R5.4 — the canvas is a parentId-only tree with independent
 * positions per node). Unknown `id` returns `c` unchanged.
 */
export function moveNode(c: Canvas, id: UUID, position: Position): Canvas {
  const ts = now();
  const nextNodes = replaceNode(c.nodes, id, (n) => ({
    ...n,
    position,
    updatedAt: ts,
  }));
  if (nextNodes === null) return c;
  return { ...c, nodes: nextNodes, updatedAt: ts };
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
/* deleteNodeOnly                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Remove the node identified by `id` and reparent its direct children to
 * that node's own `parentId` (R7.1 / R7.3).
 *
 * R7.5 no-op: when the target is the root (`parentId === null`) *and* has
 * at least one child, reparenting the children to `null` would produce
 * multiple roots and violate `canvasSchema`. In that case `c` is returned
 * unchanged so the store's `safeParse` guard never fires. Deleting the root
 * of an empty tree (i.e. a leaf root) is allowed.
 *
 * Unknown `id` returns `c` unchanged.
 */
export function deleteNodeOnly(c: Canvas, id: UUID): Canvas {
  const target = c.nodes.find((n) => n.id === id);
  if (target === undefined) return c;

  const hasChildren = c.nodes.some((n) => n.parentId === id);
  if (target.parentId === null && hasChildren) return c; // R7.5

  const ts = now();
  const nextNodes: Node[] = [];
  for (const n of c.nodes) {
    if (n.id === id) continue;
    if (n.parentId === id) {
      nextNodes.push({ ...n, parentId: target.parentId, updatedAt: ts });
    } else {
      nextNodes.push(n);
    }
  }
  return withNodes(c, nextNodes);
}

/* -------------------------------------------------------------------------- */
/* deleteSubtree                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Remove the node identified by `id` together with every transitive
 * descendant (R7.4). Unknown `id` returns `c` unchanged.
 */
export function deleteSubtree(c: Canvas, id: UUID): Canvas {
  const doomed = subtreeIds(c, id);
  if (doomed.size === 0) return c;
  const nextNodes = c.nodes.filter((n) => !doomed.has(n.id));
  return withNodes(c, nextNodes);
}
