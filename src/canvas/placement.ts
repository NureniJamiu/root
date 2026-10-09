/**
 * Placement helper for the Canvas Layer.
 *
 * `computeChildPosition(canvas, parentId)` returns a `Position` for a
 * newly created child node such that its bounding box (at the standard
 * node width/height constants defined below) does not intersect the
 * parent's bounding box or any existing direct sibling's bounding box.
 *
 * Satisfies Requirement 3.2: "THE Canvas_Layer SHALL assign the
 * Child_Node an initial position offset from the parent Node such that
 * the new Node does not overlap the parent or any existing sibling."
 *
 * The function is pure — it does not touch React or the store. The call
 * site (the App shell wiring in `src/app/App.tsx`, which is the only
 * layer allowed to combine `canvas/` geometry with `data/` writes)
 * passes the current canvas snapshot and routes the result into
 * `canvasActions.addChild`. The hover toolbar in `nodes/` triggers the
 * call site via a context, keeping the `nodes/` → `canvas/` boundary
 * clean (Requirement 10.3).
 *
 * Pass measured card sizes (see `measuredSizes.ts`) to account for cards
 * that have grown with their content; without them every card is assumed to
 * be `NODE_WIDTH` × `NODE_HEIGHT`.
 *
 * Algorithm:
 *   1. Look up the parent node. Unknown `parentId` returns the origin;
 *      the mutator layer will reject the resulting `addChild` call
 *      anyway, so the position is never observed.
 *   2. Preferred candidate: place the child immediately to the right
 *      of the parent, sharing the parent's `y`. This never overlaps
 *      the parent because the horizontal shift is
 *      `NODE_WIDTH + SIBLING_GAP > NODE_WIDTH`, so the two bounding
 *      boxes are strictly disjoint in `x`.
 *   3. If the preferred candidate overlaps any existing sibling's
 *      bounding box, fall back to placing the child strictly below
 *      every forbidden bbox. Setting the candidate's top edge to
 *      `max(forbidden.bottom) + SIBLING_GAP` guarantees no `y`-overlap
 *      with any forbidden bbox, which trivially rules out any 2D
 *      overlap (Property 5).
 *
 * The fallback trades ideal aesthetics for a hard non-overlap
 * guarantee — it may push a new child far down when siblings have been
 * dragged around, but the user can move the child manually after
 * creation (R5). This matches the MVP contract: an initial position
 * that is provably conflict-free, not an optimal layout.
 */

import type { Canvas, Node, Position, UUID } from '../data';
import type { NodeSize, NodeSizes } from './measuredSizes';

/**
 * Standard card width in canvas units used by the placement algorithm.
 * NodeCard's rendered width is bounded by `min 180 / max 320` in
 * `src/nodes/NodeCard.tsx`; 240 sits comfortably in the middle and
 * matches the diagonal offset previously hard-coded in the hover
 * toolbar. Kept as a shared constant so tests can reason about the
 * exact bounding box `computeChildPosition` assumes.
 */
export const NODE_WIDTH = 300;

/**
 * Standard card height in canvas units used by the placement algorithm.
 * Chosen to accommodate a title line, a two-line body preview, and an
 * optional image thumbnail strip without underestimating the card's
 * on-screen footprint (which would let siblings visually collide even
 * though the bounding-box math says they don't).
 */
export const NODE_HEIGHT = 160;

/**
 * Minimum gap, in canvas units, between the parent's bounding box and
 * a newly placed child (and, in the fallback, between siblings and the
 * new child). Ensures the two cards don't visually kiss even when the
 * bounding-box math reports "no overlap".
 */
export const SIBLING_GAP = 80;

/**
 * Axis-aligned bounding box in canvas units. Kept local to this module
 * because it is an implementation detail of `computeChildPosition`; the
 * public surface only trades in `Position` values.
 */
interface BBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const DEFAULT_SIZE: NodeSize = { width: NODE_WIDTH, height: NODE_HEIGHT };

function sizeOf(sizes: NodeSizes | undefined, id: UUID): NodeSize {
  return sizes?.get(id) ?? DEFAULT_SIZE;
}

function bboxOf(node: Node, sizes: NodeSizes | undefined): BBox {
  const size = sizeOf(sizes, node.id);
  return { x: node.position.x, y: node.position.y, w: size.width, h: size.height };
}

/** Box of a card that does not exist yet, so it has the default size. */
function bboxAt(p: Position): BBox {
  return { x: p.x, y: p.y, w: NODE_WIDTH, h: NODE_HEIGHT };
}

/**
 * True iff `a` and `b` share strictly-positive area. Edge contact
 * (touching but not overlapping) is deliberately treated as
 * non-overlapping so a card placed exactly at `SIBLING_GAP` distance
 * counts as a valid, gap-respecting placement rather than a collision.
 */
function overlaps(a: BBox, b: BBox): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

/**
 * Compute an initial position for a new child of `parentId` in `canvas`
 * such that the child's bounding box does not intersect the parent's
 * bounding box or any existing direct sibling's bounding box.
 *
 * Assumes standard node dimensions (`NODE_WIDTH` × `NODE_HEIGHT`). The
 * result is a `Position` — no validation against `positionSchema` is
 * performed here; callers hand the value to `canvasActions.addChild`,
 * which routes through the store's `canvasSchema.safeParse` gate.
 */
export function computeChildPosition(
  canvas: Canvas,
  parentId: UUID,
  sizes?: NodeSizes,
): Position {
  const parent = canvas.nodes.find((n) => n.id === parentId);
  if (parent === undefined) {
    // Unknown parent: return a well-defined origin. The `addChild`
    // mutator's own guard will drop the corresponding write as a
    // no-op, so this position is never persisted.
    return { x: 0, y: 0 };
  }

  const siblings = canvas.nodes.filter((n) => n.parentId === parentId);
  const forbidden: BBox[] = [bboxOf(parent, sizes), ...siblings.map((s) => bboxOf(s, sizes))];
  const parentWidth = sizeOf(sizes, parent.id).width;

  // Preferred candidate: immediately to the right of the parent at the
  // same `y`. This is disjoint from the parent's bbox by construction
  // (horizontal shift > NODE_WIDTH), so we only need to check siblings.
  const preferred: Position = {
    x: parent.position.x + parentWidth + SIBLING_GAP,
    y: parent.position.y,
  };
  const preferredBox = bboxAt(preferred);
  const preferredCollides = forbidden.some((f) => overlaps(preferredBox, f));
  if (!preferredCollides) {
    return preferred;
  }

  // Fallback: place strictly below every forbidden bbox. The deepest
  // forbidden `y + h` plus `SIBLING_GAP` becomes the candidate's top
  // edge, so no `y`-overlap is possible with any forbidden bbox — and
  // that alone rules out any 2D overlap.
  const maxBottom = forbidden.reduce(
    (acc, f) => Math.max(acc, f.y + f.h),
    Number.NEGATIVE_INFINITY,
  );
  return {
    x: parent.position.x + parentWidth + SIBLING_GAP,
    y: maxBottom + SIBLING_GAP,
  };
}

/**
 * Arranges canvas nodes in a top-to-bottom tree layout.
 * Guarantees:
 *  1. Root node placed at top.
 *  2. Children placed on rows below their parents; a row starts below the
 *     tallest card of the row above, so tall cards never run into the next row.
 *  3. Siblings and subtrees placed side-by-side with non-overlapping bounding boxes.
 *  4. All connections (parentId) remain intact.
 *  5. Connection sides update to facing sides (bottom -> top) for unpinned connections.
 *
 * Pass measured card sizes to lay out the cards as they are actually rendered.
 */
export function computeTreeLayout(canvas: Canvas, sizes?: NodeSizes): Canvas {
  if (canvas.nodes.length <= 1) return canvas;

  const root = canvas.nodes.find((n) => n.parentId === null);
  if (!root) return canvas;

  const childrenMap = new Map<UUID, Node[]>();
  for (const n of canvas.nodes) {
    if (n.parentId !== null) {
      const list = childrenMap.get(n.parentId) ?? [];
      list.push(n);
      childrenMap.set(n.parentId, list);
    }
  }

  const HORIZONTAL_GAP = 60;
  const VERTICAL_GAP = 120;
  const ORIGIN_X = 100;
  const ORIGIN_Y = 80;

  // Row heights: each row is as tall as its tallest card.
  const rowHeights: number[] = [];
  const depthOf = new Map<UUID, number>();
  const measure = (nodeId: UUID, depth: number): void => {
    depthOf.set(nodeId, depth);
    rowHeights[depth] = Math.max(rowHeights[depth] ?? 0, sizeOf(sizes, nodeId).height);
    for (const child of childrenMap.get(nodeId) ?? []) measure(child.id, depth + 1);
  };
  measure(root.id, 0);

  const rowTops: number[] = [];
  let top = ORIGIN_Y;
  rowHeights.forEach((height, depth) => {
    rowTops[depth] = top;
    top += height + VERTICAL_GAP;
  });

  const positions = new Map<UUID, Position>();
  let currentLeftX = ORIGIN_X;

  function layoutSubtree(nodeId: UUID): { minX: number; maxX: number } {
    const children = childrenMap.get(nodeId) ?? [];
    const width = sizeOf(sizes, nodeId).width;
    const y = rowTops[depthOf.get(nodeId) ?? 0] ?? ORIGIN_Y;

    if (children.length === 0) {
      const x = currentLeftX;
      positions.set(nodeId, { x, y });
      currentLeftX += width + HORIZONTAL_GAP;
      return { minX: x, maxX: x + width };
    }

    let minX = Infinity;
    let maxX = -Infinity;

    for (const child of children) {
      const childSpan = layoutSubtree(child.id);
      minX = Math.min(minX, childSpan.minX);
      maxX = Math.max(maxX, childSpan.maxX);
    }

    // Center parent horizontally above its children span
    const x = Math.round((minX + maxX - width) / 2);
    positions.set(nodeId, { x, y });

    return { minX: Math.min(minX, x), maxX: Math.max(maxX, x + width) };
  }

  layoutSubtree(root.id);

  // Normalize so leftmost node starts at ORIGIN_X
  let minGlobalX = Infinity;
  for (const pos of positions.values()) {
    if (pos.x < minGlobalX) minGlobalX = pos.x;
  }
  const xOffset = minGlobalX < ORIGIN_X ? ORIGIN_X - minGlobalX : 0;

  const nextNodes = canvas.nodes.map((node) => {
    const pos = positions.get(node.id) ?? node.position;
    const finalPos = { x: pos.x + xOffset, y: pos.y };

    // For non-root nodes, facing sides in top-to-bottom layout are bottom -> top
    const sourceSide = node.sourcePinned ? node.sourceSide : 'bottom';
    const targetSide = node.targetPinned ? node.targetSide : 'top';

    return {
      ...node,
      position: finalPos,
      sourceSide,
      targetSide,
    };
  });

  return {
    ...canvas,
    nodes: nextNodes,
    updatedAt: new Date().toISOString(),
  };
}
