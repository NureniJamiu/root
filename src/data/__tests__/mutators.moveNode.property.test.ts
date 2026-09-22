/**
 * Property test — Property 9: moveNode isolation (task 4.7).
 *
 * `Feature: root-mvp, Property 9: moveNode isolation`
 *
 * For any `Canvas` `c`, any node id `id` present in `c`, and any `Position`
 * `p`, `moveNode(c, id, p)` produces a canvas `c'` such that:
 *
 *   (a) the node at `id` in `c'` has `position === p`; and
 *   (b) every other node in `c'` has the same `position` as in `c`.
 *
 * In other words a move is a *local* mutation on `position` — descendants,
 * ancestors and siblings all keep their coordinates. This is the structural
 * heart of R5.4 ("moveNode does not touch descendants"): because the canvas
 * stores independent per-node coordinates rather than a relative layout,
 * moving a subtree root leaves its children where they were.
 *
 * Validates: Requirements 5.2, 5.4.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { moveNode } from '../mutators';
import { arbCanvas, arbNodeId, arbPosition } from './arbitraries';

describe('Feature: root-mvp, Property 9: moveNode isolation', () => {
  test('target node position becomes p; every other node position is unchanged', () => {
    fc.assert(
      fc.property(
        // Draw a non-empty canvas, then draw a target id out of it and a
        // fresh position independently. Chaining keeps the id in-canvas so
        // the mutator actually runs (`moveNode` on an unknown id is a
        // guarded no-op, which would trivially satisfy (b) but hide bugs
        // in (a)).
        arbCanvas.filter((c) => c.nodes.length > 0).chain((c) =>
          fc.tuple(fc.constant(c), arbNodeId(c), arbPosition),
        ),
        ([c, id, p]) => {
          const cPrime = moveNode(c, id, p);

          const before = new Map(c.nodes.map((n) => [n.id, n.position]));

          for (const node of cPrime.nodes) {
            if (node.id === id) {
              // (a) target moved to p — deep-equal by coordinate, since
              // `moveNode` currently stores the same object reference but
              // the property is stated in terms of value equality.
              expect(node.position).toEqual(p);
            } else {
              // (b) every other node keeps its original position. The id
              // must have existed in `c` (mutators never introduce new
              // nodes on a move), so `before.get(...)` is defined.
              expect(node.position).toEqual(before.get(node.id));
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
