/**
 * Property test — deleteNodeOnly semantics.
 *
 * For any canvas `c` and any node `id` in `c`, `c' = deleteNodeOnly(c, id)`:
 *
 *   - removes exactly that node;
 *   - removes exactly the connectors that touched it;
 *   - leaves every other node and connector as it was, so the ideas it was
 *     connected to stay where they are;
 *   - still satisfies `canvasSchema`.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { deleteNodeOnly } from '../mutators';
import { canvasSchema } from '../schema';

import { arbCanvas, arbNodeId } from './arbitraries';

describe('deleteNodeOnly semantics', () => {
  test('removes the node and its connectors only', () => {
    fc.assert(
      fc.property(
        arbCanvas
          .filter((c) => c.nodes.length > 0)
          .chain((c) => fc.tuple(fc.constant(c), arbNodeId(c))),
        ([c, id]) => {
          const next = deleteNodeOnly(c, id);

          expect(next.nodes.some((n) => n.id === id)).toBe(false);
          expect(next.nodes).toEqual(c.nodes.filter((n) => n.id !== id));
          expect(next.edges).toEqual(c.edges.filter((e) => e.source !== id && e.target !== id));
          expect(canvasSchema.safeParse(next).success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('an unknown id leaves the canvas unchanged', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        expect(deleteNodeOnly(c, crypto.randomUUID())).toBe(c);
      }),
      { numRuns: 25 },
    );
  });
});
