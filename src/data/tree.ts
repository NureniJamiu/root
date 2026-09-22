/**
 * Tree utilities for the Root MVP data model.
 *
 * These functions treat a `Canvas` as an immutable, `parentId`-only tree and
 * expose the derived views the rest of the app depends on:
 *
 * - `childrenIndex`      — group nodes by their parent (root under key `null`).
 * - `visibleNodeIds`     — DFS from the root that stops descending past any
 *                          node whose `collapsed === true`. Per design.md
 *                          §Tree Utilities and Requirement 6.2, a node's own
 *                          `collapsed` hides its CHILDREN, not itself.
 * - `descendantCount`    — strict transitive descendants of a node.
 * - `subtreeIds`         — inclusive set `{id} ∪ descendants(id)`.
 * - `hasCycle`           — would reparenting `childId` under `newParentId`
 *                          introduce a cycle? (Requirement 3.5)
 * - `rootNode`           — the unique `parentId === null` node, if any.
 *
 * All functions are pure, do not mutate the input canvas, and run in O(n) in
 * the size of `canvas.nodes` (aside from `rootNode`, which is O(n) with an
 * early exit). No memoization is applied here; callers (e.g. the Zustand
 * selectors) memoize by canvas identity where beneficial.
 *
 * The layer has zero UI / framework dependencies (Requirement 10.1).
 */

import type { Canvas, Node, UUID } from './types';

/* -------------------------------------------------------------------------- */
/* childrenIndex                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Group every node in `c` by its `parentId`. The root (if present) lives
 * under the `null` key. Nodes appear in the same order as `c.nodes`.
 */
export function childrenIndex(c: Canvas): Map<UUID | null, Node[]> {
  const index = new Map<UUID | null, Node[]>();
  for (const node of c.nodes) {
    const bucket = index.get(node.parentId);
    if (bucket === undefined) {
      index.set(node.parentId, [node]);
    } else {
      bucket.push(node);
    }
  }
  return index;
}

/* -------------------------------------------------------------------------- */
/* rootNode                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The single node with `parentId === null`, or `undefined` when the canvas
 * is empty. `canvasSchema` guarantees at most one root for validated canvases.
 */
export function rootNode(c: Canvas): Node | undefined {
  return c.nodes.find((n) => n.parentId === null);
}

/* -------------------------------------------------------------------------- */
/* visibleNodeIds                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Set of node ids reachable from the root by descending only through parents
 * whose `collapsed === false`. The root itself is always visible when it
 * exists — a node's own `collapsed` hides its children, not itself
 * (design.md §Tree Utilities, Requirement 6.2).
 *
 * Equivalent to: `n` is visible iff every STRICT ancestor of `n` has
 * `collapsed === false` (Property 1).
 */
export function visibleNodeIds(c: Canvas): Set<UUID> {
  const visible = new Set<UUID>();
  const root = rootNode(c);
  if (root === undefined) return visible;

  const children = childrenIndex(c);
  // Iterative DFS. Each frame is a node we have already marked visible; we
  // only enqueue its children when it is not collapsed.
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    visible.add(node.id);
    if (node.collapsed) continue;
    const kids = children.get(node.id);
    if (kids === undefined) continue;
    for (const kid of kids) stack.push(kid);
  }
  return visible;
}

/* -------------------------------------------------------------------------- */
/* subtreeIds                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Inclusive set of ids in the subtree rooted at `id`: `{id}` plus every
 * transitive descendant of `id`. Returns an empty set when `id` is not
 * present in `c`.
 */
export function subtreeIds(c: Canvas, id: UUID): Set<UUID> {
  const ids = new Set<UUID>();
  const hasTarget = c.nodes.some((n) => n.id === id);
  if (!hasTarget) return ids;

  const children = childrenIndex(c);
  const stack: UUID[] = [id];
  while (stack.length > 0) {
    const current = stack.pop() as UUID;
    if (ids.has(current)) continue; // defensive; validated canvases are acyclic
    ids.add(current);
    const kids = children.get(current);
    if (kids === undefined) continue;
    for (const kid of kids) stack.push(kid.id);
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/* descendantCount                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Number of strict transitive descendants of `id` (i.e. excludes `id`
 * itself). Returns 0 when `id` is not present in `c`.
 */
export function descendantCount(c: Canvas, id: UUID): number {
  const subtree = subtreeIds(c, id);
  return subtree.size === 0 ? 0 : subtree.size - 1;
}

/* -------------------------------------------------------------------------- */
/* hasCycle                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Would setting `childId.parentId := newParentId` introduce a cycle in the
 * parent-child relation?
 *
 * Per Property 14 / design.md §Tree Utilities, the answer is `true` iff:
 *   - `newParentId === childId`, or
 *   - `newParentId ∈ subtreeIds(c, childId)`.
 *
 * Reparenting to `null` (making the node a root) can never create a cycle.
 */
export function hasCycle(
  c: Canvas,
  childId: UUID,
  newParentId: UUID | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === childId) return true;
  return subtreeIds(c, childId).has(newParentId);
}
