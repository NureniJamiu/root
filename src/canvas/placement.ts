/**
 * Placement helpers for the Canvas Layer.
 *
 * `computeChildPosition(canvas, parentId)` returns a `Position` for a newly
 * created child card: immediately right of the parent when that spot is free,
 * otherwise the first free spot below it. `findFreePosition` is the same
 * search for a card that hangs from nothing. Both guarantee the returned box
 * (at the measured or standard card size) overlaps no existing card.
 *
 * The functions are pure; they do not touch React or the store. The App shell
 * (the only layer allowed to combine `canvas/` geometry with `data/` writes)
 * passes the current canvas snapshot and routes the result into
 * `canvasActions`. The hover toolbar in `nodes/` reaches it through a
 * context, keeping the `nodes/` -> `canvas/` boundary clean.
 *
 * Pass measured card sizes (see `measuredSizes.ts`) to account for cards that
 * have grown with their content; without them every card is assumed to be
 * `NODE_WIDTH` x `NODE_HEIGHT`.
 */

import { computeFacingSides, outgoingIndex } from '../data';
import type { Canvas, Node, Position, Side, UUID } from '../data';
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

  // Preferred candidate: immediately to the right of the parent at the same
  // `y`; when a card is already there (a sibling, or any other card on the
  // canvas), step down until the spot is free.
  const preferred: Position = {
    x: parent.position.x + sizeOf(sizes, parent.id).width + SIBLING_GAP,
    y: parent.position.y,
  };
  return findFreePosition(canvas, preferred, sizes);
}

/**
 * The free spot closest to `desired` for a new card: `desired` itself when no
 * card is there, otherwise the spot straight below whatever is in the way,
 * repeated until nothing is. Used for ideas created from the header, the
 * keyboard or a double click, which do not hang from anything.
 */
export function findFreePosition(
  canvas: Canvas,
  desired: Position,
  sizes?: NodeSizes,
): Position {
  const boxes = canvas.nodes.map((n) => bboxOf(n, sizes));
  let candidate = desired;
  // Each pass moves the candidate below at least one box it overlapped, so at
  // most one pass per card is needed.
  for (let i = 0; i <= boxes.length; i += 1) {
    const box = bboxAt(candidate);
    const blocking = boxes.filter((b) => overlaps(box, b));
    if (blocking.length === 0) return candidate;
    const bottom = blocking.reduce((acc, b) => Math.max(acc, b.y + b.h), Number.NEGATIVE_INFINITY);
    candidate = { x: desired.x, y: bottom + SIBLING_GAP };
  }
  return candidate;
}

/**
 * Arranges the canvas in rows, top to bottom, following the connectors.
 *
 * - A card with no incoming connector starts a tree. Every other card goes
 *   one row below the first card found pointing at it; a card reachable only
 *   through a cycle starts its own tree. Unconnected cards each form a
 *   one-card tree, so they are laid out in the top row.
 * - A row starts below the tallest card of the row above, so tall cards never
 *   run into the next row. Trees sit side by side with non-overlapping boxes.
 * - Every automatic connector end is re-attached to the facing sides: bottom
 *   to top when it goes down a row, top to bottom when it goes up, and
 *   right/left or left/right within a row. Pinned ends keep their side.
 *
 * Pass measured card sizes to lay out the cards as they are actually rendered.
 */
export function computeTreeLayout(canvas: Canvas, sizes?: NodeSizes): Canvas {
  if (canvas.nodes.length === 0) return canvas;

  const out = outgoingIndex(canvas);
  const hasIncoming = new Set(canvas.edges.map((e) => e.target));
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));

  const HORIZONTAL_GAP = 60;
  const VERTICAL_GAP = 120;
  const ORIGIN_X = 100;
  const ORIGIN_Y = 80;

  // Spanning forest: each card is placed under the first card that reaches it.
  const treeChildren = new Map<UUID, UUID[]>();
  const depthOf = new Map<UUID, number>();
  const roots: UUID[] = [];
  const claim = (rootId: UUID): void => {
    roots.push(rootId);
    depthOf.set(rootId, 0);
    const queue: UUID[] = [rootId];
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head] as UUID;
      for (const e of out.get(id) ?? []) {
        if (depthOf.has(e.target) || !byId.has(e.target)) continue;
        depthOf.set(e.target, (depthOf.get(id) ?? 0) + 1);
        const list = treeChildren.get(id) ?? [];
        list.push(e.target);
        treeChildren.set(id, list);
        queue.push(e.target);
      }
    }
  };
  for (const n of canvas.nodes) if (!hasIncoming.has(n.id)) claim(n.id);
  for (const n of canvas.nodes) if (!depthOf.has(n.id)) claim(n.id); // cycles

  // Row heights: each row is as tall as its tallest card.
  const rowHeights: number[] = [];
  for (const [id, depth] of depthOf) {
    rowHeights[depth] = Math.max(rowHeights[depth] ?? 0, sizeOf(sizes, id).height);
  }
  const rowTops: number[] = [];
  let top = ORIGIN_Y;
  rowHeights.forEach((height, depth) => {
    rowTops[depth] = top;
    top += height + VERTICAL_GAP;
  });

  const positions = new Map<UUID, Position>();
  let currentLeftX = ORIGIN_X;

  function layoutSubtree(id: UUID): { minX: number; maxX: number } {
    const children = treeChildren.get(id) ?? [];
    const width = sizeOf(sizes, id).width;
    const y = rowTops[depthOf.get(id) ?? 0] ?? ORIGIN_Y;

    if (children.length === 0) {
      const x = currentLeftX;
      positions.set(id, { x, y });
      currentLeftX += width + HORIZONTAL_GAP;
      return { minX: x, maxX: x + width };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    for (const child of children) {
      const span = layoutSubtree(child);
      minX = Math.min(minX, span.minX);
      maxX = Math.max(maxX, span.maxX);
    }
    // Centre the card above the span of its children.
    const x = Math.round((minX + maxX - width) / 2);
    positions.set(id, { x, y });
    return { minX: Math.min(minX, x), maxX: Math.max(maxX, x + width) };
  }

  for (const rootId of roots) layoutSubtree(rootId);

  // Keep the leftmost card at ORIGIN_X.
  let minGlobalX = Infinity;
  for (const pos of positions.values()) if (pos.x < minGlobalX) minGlobalX = pos.x;
  const xOffset = minGlobalX < ORIGIN_X ? ORIGIN_X - minGlobalX : 0;

  const finalPositions = new Map<UUID, Position>();
  const nextNodes = canvas.nodes.map((node) => {
    const pos = positions.get(node.id) ?? node.position;
    const position = { x: pos.x + xOffset, y: pos.y };
    finalPositions.set(node.id, position);
    return { ...node, position };
  });

  const nextEdges = canvas.edges.map((edge) => {
    const from = depthOf.get(edge.source) ?? 0;
    const to = depthOf.get(edge.target) ?? 0;
    let sourceSide: Side;
    let targetSide: Side;
    if (to > from) {
      sourceSide = 'bottom';
      targetSide = 'top';
    } else if (to < from) {
      sourceSide = 'top';
      targetSide = 'bottom';
    } else {
      const a = finalPositions.get(edge.source);
      const b = finalPositions.get(edge.target);
      ({ sourceSide, targetSide } =
        a && b ? computeFacingSides(a, b) : { sourceSide: 'right', targetSide: 'left' });
    }
    // Ends the user pinned keep their side; the rest follow the layout.
    return {
      ...edge,
      sourceSide: edge.sourcePinned ? edge.sourceSide : sourceSide,
      targetSide: edge.targetPinned ? edge.targetSide : targetSide,
    };
  });

  return {
    ...canvas,
    nodes: nextNodes,
    edges: nextEdges,
    updatedAt: new Date().toISOString(),
  };
}
