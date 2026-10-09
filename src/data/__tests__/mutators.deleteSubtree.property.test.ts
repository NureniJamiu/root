/**
 * Property test — deleteSubtree semantics.
 *
 * For any canvas `c` and node `id` in `c`, `c' = deleteSubtree(c, id)` removes
 * exactly `subtreeIds(c, id)` (the node plus every idea that hangs only from
 * it) and every connector touching one of them; everything else is unchanged
 * and the result still satisfies `canvasSchema`.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { subtreeIds } from '../graph';
import { deleteSubtree } from '../mutators';
import { canvasSchema } from '../schema';

import { arbCanvas, arbNodeId } from './arbitraries';

const arbInput = arbCanvas
  .filter((c) => c.nodes.length > 0)
  .chain((canvas) => fc.record({ canvas: fc.constant(canvas), id: arbNodeId(canvas) }));

describe('deleteSubtree semantics', () => {
  test('removes exactly the subtree and the connectors that touch it', () => {
    fc.assert(
      fc.property(arbInput, ({ canvas, id }) => {
        const doomed = subtreeIds(canvas, id);
        expect(doomed.has(id)).toBe(true);

        const after = deleteSubtree(canvas, id);
        expect(after.nodes).toEqual(canvas.nodes.filter((n) => !doomed.has(n.id)));
        expect(after.edges).toEqual(
          canvas.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
        );
        expect(canvasSchema.safeParse(after).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('ideas that something else also points at are kept', () => {
    // a -> shared <- b, a -> only. Deleting `a` removes `only` but keeps `shared`.
    const ids = { a: crypto.randomUUID(), b: crypto.randomUUID(), shared: crypto.randomUUID(), only: crypto.randomUUID() };
    const ts = new Date().toISOString();
    const node = (id: string) => ({
      id, title: '', body: '', images: [], type: 'topic' as const,
      position: { x: 0, y: 0 }, collapsed: false, createdAt: ts, updatedAt: ts,
    });
    const edge = (source: string, target: string) => ({
      id: crypto.randomUUID(), source, target, sourceSide: 'right' as const, targetSide: 'left' as const, sourcePinned: false, targetPinned: false,
    });
    const c = {
      id: crypto.randomUUID(), title: '', updatedAt: ts,
      nodes: [node(ids.a), node(ids.b), node(ids.shared), node(ids.only)],
      edges: [edge(ids.a, ids.shared), edge(ids.b, ids.shared), edge(ids.a, ids.only)],
    };
    const after = deleteSubtree(c, ids.a);
    expect(after.nodes.map((n) => n.id).sort()).toEqual([ids.b, ids.shared].sort());
    expect(after.edges).toHaveLength(1);
    expect(after.edges[0]).toMatchObject({ source: ids.b, target: ids.shared });
  });
});
