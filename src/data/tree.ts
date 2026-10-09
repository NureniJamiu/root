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
  const roots = c.nodes.filter((n) => n.parentId === null);
  if (roots.length === 0) return visible;

  const children = childrenIndex(c);
  // Iterative DFS. Each frame is a node we have already marked visible; we
  // only enqueue its children when it is not collapsed.
  const stack: Node[] = [...roots];
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

/* -------------------------------------------------------------------------- */
/* nodeOrdinals                                                               */
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

/** Short label such as `ROOT` or `#04` for a node, using `nodeOrdinals`. */
export function nodeLabel(node: Node, ordinals: ReadonlyMap<UUID, number>): string {
  return formatNodeLabel(node, ordinals.get(node.id) ?? 0);
}

/** Label for a node whose ordinal is already known. */
export function formatNodeLabel(node: Node, ordinal: number): string {
  if (node.parentId === null) return 'ROOT';
  return `#${String(ordinal).padStart(2, '0')}`;
}
