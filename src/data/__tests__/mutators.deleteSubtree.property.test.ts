/**
 * Property test — Property 13: deleteSubtree semantics (task 4.10).
 *
 * `Feature: root-mvp, Property 13: deleteSubtree semantics`
 *
 * For any structurally valid non-empty `Canvas` `c` and any node id `id`
 * present in `c`, the canvas `c' = deleteSubtree(c, id)` satisfies:
 *
 *   (a) `idsOf(c') === idsOf(c) \ subtreeIds(c, id)` — every node in the
 *       subtree rooted at `id` (inclusive of `id` itself) is removed, and
 *       nothing else is removed or added.
 *   (b) Every node that survives is byte-identical to its pre-image in
 *       `c` (deep-equal). `deleteSubtree` never rewrites a surviving
 *       node's fields — no `updatedAt` bumps, no reparenting, no
 *       position changes.
 *   (c) `canvasSchema.safeParse(c')` succeeds. Because the subtree
 *       rooted at `id` is downward-closed, dropping it cannot leave any
 *       dangling `parentId` and cannot introduce a second root. When
 *       `id` is the root of the canvas, the entire node list is
 *       removed, yielding an empty (still-valid) canvas.
 *
 * Validates: Requirements 7.4.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { deleteSubtree } from '../mutators';
import { canvasSchema } from '../schema';
import { subtreeIds } from '../tree';
import type { Canvas } from '../types';

import { arbCanvas, arbNodeId } from './arbitraries';

/**
 * `arbCanvas` may produce an empty canvas. Property 13 targets an id that
 * exists in the canvas, so we filter down to non-empty canvases and then
 * chain a random in-canvas id.
 */
const arbInput: fc.Arbitrary<{ canvas: Canvas; id: string }> = arbCanvas
  .filter((c) => c.nodes.length > 0)
  .chain((canvas) =>
    fc.record({
      canvas: fc.constant(canvas),
      id: arbNodeId(canvas),
    }),
  );

describe('Feature: root-mvp, Property 13: deleteSubtree semantics', () => {
  test('deleteSubtree removes exactly the subtree rooted at id, leaves other nodes unchanged, and preserves structural invariants', () => {
    fc.assert(
      fc.property(arbInput, ({ canvas, id }) => {
        const before = canvas;
        const after = deleteSubtree(before, id);

        // Precompute the target subtree from `before`. `subtreeIds` is
        // inclusive of `id` and returns a non-empty set whenever `id` is
        // present in the canvas (which the input arbitrary guarantees).
        const doomed = subtreeIds(before, id);
        expect(doomed.size).toBeGreaterThanOrEqual(1);
        expect(doomed.has(id)).toBe(true);

        const beforeIds = new Set(before.nodes.map((n) => n.id));
        const afterIds = new Set(after.nodes.map((n) => n.id));

        // (a) remaining ids equal idsOf(before) \ subtreeIds(before, id).
        //     Compute the expected survivor set from `before` and check
        //     both directions of equality via size + membership.
        const expectedSurvivors = new Set<string>();
        for (const nid of beforeIds) {
          if (!doomed.has(nid)) expectedSurvivors.add(nid);
        }
        expect(afterIds.size).toBe(expectedSurvivors.size);
        for (const nid of expectedSurvivors) expect(afterIds.has(nid)).toBe(true);
        // No id in `after` was ever in the doomed set.
        for (const nid of afterIds) expect(doomed.has(nid)).toBe(false);

        // (b) each surviving node is deep-equal to its pre-image in
        //     `before`. `deleteSubtree` filters the node list rather
        //     than rebuilding it, so timestamps, parentId, position,
        //     images, etc. must all be preserved.
        const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
        for (const n of after.nodes) {
          const prior = beforeById.get(n.id);
          expect(prior).toBeDefined();
          expect(n).toEqual(prior);
        }

        // (c) structural invariants — the result round-trips through the
        //     canvas schema. Deleting the root removes every node
        //     (subtreeIds at the root spans the full canvas), which
        //     yields an empty canvas that is still valid.
        const parsed = canvasSchema.safeParse(after);
        expect(parsed.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
