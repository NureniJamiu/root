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

import type { Canvas, Position, UUID } from '../data';

/**
 * Standard card width in canvas units used by the placement algorithm.
 * NodeCard's rendered width is bounded by `min 180 / max 320` in
 * `src/nodes/NodeCard.tsx`; 240 sits comfortably in the middle and
 * matches the diagonal offset previously hard-coded in the hover
 * toolbar. Kept as a shared constant so tests can reason about the
 * exact bounding box `computeChildPosition` assumes.
 */
export const NODE_WIDTH = 240;

/**
 * Standard card height in canvas units used by the placement algorithm.
 * Chosen to accommodate a title line, a two-line body preview, and an
 * optional image thumbnail strip without underestimating the card's
 * on-screen footprint (which would let siblings visually collide even
 * though the bounding-box math says they don't).
 */
export const NODE_HEIGHT = 140;

/**
 * Minimum gap, in canvas units, between the parent's bounding box and
 * a newly placed child (and, in the fallback, between siblings and the
 * new child). Ensures the two cards don't visually kiss even when the
 * bounding-box math reports "no overlap".
 */
export const SIBLING_GAP = 40;

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
export function computeChildPosition(canvas: Canvas, parentId: UUID): Position {
  const parent = canvas.nodes.find((n) => n.id === parentId);
  if (parent === undefined) {
    // Unknown parent: return a well-defined origin. The `addChild`
    // mutator's own guard will drop the corresponding write as a
    // no-op, so this position is never persisted.
    return { x: 0, y: 0 };
  }

  const siblings = canvas.nodes.filter((n) => n.parentId === parentId);
  const forbidden: BBox[] = [
    bboxAt(parent.position),
    ...siblings.map((s) => bboxAt(s.position)),
  ];

  // Preferred candidate: immediately to the right of the parent at the
  // same `y`. This is disjoint from the parent's bbox by construction
  // (horizontal shift > NODE_WIDTH), so we only need to check siblings.
  const preferred: Position = {
    x: parent.position.x + NODE_WIDTH + SIBLING_GAP,
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
    x: parent.position.x + NODE_WIDTH + SIBLING_GAP,
    y: maxBottom + SIBLING_GAP,
  };
}
