/**
 * Property test — Property 5: Non-overlap (task 9.3).
 *
 * `Feature: root-mvp, Property 5: Non-overlap`
 *
 * For any canvas `c` and any `parentId` present in `c`, the bounding box
 * of `computeChildPosition(c, parentId)` does NOT intersect:
 *   - the parent node's bounding box, nor
 *   - any existing direct sibling's bounding box.
 *
 * Bounding boxes are axis-aligned rectangles of width `NODE_WIDTH` and
 * height `NODE_HEIGHT` (as exported from `src/canvas/placement.ts`).
 *
 * Two bounding boxes `a` and `b` overlap iff:
 *   a.x < b.x + b.w  &&  b.x < a.x + a.w  &&
 *   a.y < b.y + b.h  &&  b.y < a.y + a.h
 *
 * Validates: Requirement 3.2
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { arbCanvas, arbNodeId } from '../../data/__tests__/arbitraries';
import type { Canvas } from '../../data';
import {
  computeChildPosition,
  NODE_HEIGHT,
  NODE_WIDTH,
} from '../placement';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bboxAt(pos: { x: number; y: number }): BBox {
  return { x: pos.x, y: pos.y, w: NODE_WIDTH, h: NODE_HEIGHT };
}

/**
 * Returns true iff two axis-aligned bounding boxes share strictly positive
 * area (edge-contact is treated as non-overlapping, matching the semantics
 * inside `placement.ts`).
 */
function overlaps(a: BBox, b: BBox): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

/* -------------------------------------------------------------------------- */
/* Arbitraries                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Filter to non-empty canvases, then chain a random in-canvas nodeId so we
 * can test `computeChildPosition(canvas, parentId)` for every reachable
 * (canvas, parentId) pair — both when the chosen parent already has siblings
 * and when it doesn't.
 */
const arbNonEmptyCanvas: fc.Arbitrary<Canvas> = arbCanvas.filter(
  (c) => c.nodes.length > 0,
);

const arbInput: fc.Arbitrary<{ canvas: Canvas; parentId: string }> =
  arbNonEmptyCanvas.chain((canvas) =>
    fc.record({
      canvas: fc.constant(canvas),
      parentId: arbNodeId(canvas),
    }),
  );

/* -------------------------------------------------------------------------- */
/* Property                                                                   */
/* -------------------------------------------------------------------------- */

describe('Feature: root-mvp, Property 5: Non-overlap', () => {
  test(
    'computeChildPosition returns a position whose bounding box does not ' +
      'overlap the parent or any existing direct sibling',
    () => {
      fc.assert(
        fc.property(arbInput, ({ canvas, parentId }) => {
          const pos = computeChildPosition(canvas, parentId);
          const candidateBox = bboxAt(pos);

          // Locate the parent node (guaranteed to exist: parentId was
          // drawn from arbNodeId which operates on a non-empty canvas).
          const parent = canvas.nodes.find((n) => n.id === parentId)!;
          const parentBox = bboxAt(parent.position);

          // 1. The candidate must not overlap the parent's bounding box.
          expect(
            overlaps(candidateBox, parentBox),
            `candidate (${pos.x},${pos.y}) overlaps parent (${parent.position.x},${parent.position.y})`,
          ).toBe(false);

          // 2. The candidate must not overlap any existing direct sibling.
          const siblings = canvas.nodes.filter(
            (n) => n.parentId === parentId,
          );
          for (const sibling of siblings) {
            const siblingBox = bboxAt(sibling.position);
            expect(
              overlaps(candidateBox, siblingBox),
              `candidate (${pos.x},${pos.y}) overlaps sibling ${sibling.id} ` +
                `at (${sibling.position.x},${sibling.position.y})`,
            ).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    },
  );
});
