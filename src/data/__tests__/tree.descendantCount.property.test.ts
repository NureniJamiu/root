/**
 * Property test — Property 11: descendantCount correctness (task 3.3).
 *
 * `Feature: root-mvp, Property 11: descendantCount correctness`
 *
 * For any `Canvas` `c` and any node id present in `c`,
 *
 *     descendantCount(c, id) === subtreeIds(c, id).size - 1
 *
 * i.e. the count reported by `descendantCount` equals the number of strict
 * transitive descendants of the node (subtreeIds is inclusive of `id`).
 *
 * Validates: Requirements 6.5.
 *
 * Task 4.2 (a shared `arbCanvas` in `src/data/__tests__/arbitraries.ts`) has
 * not been implemented yet, so this file defines a LOCAL fast-check arbitrary
 * that builds structurally valid canvases by generating a random rooted tree
 * over N ∈ [1, 20] nodes: node 0 is the root, and every subsequent node
 * picks a parent from an earlier index (guaranteeing acyclicity and a single
 * root by construction). Each generated canvas is validated against
 * `canvasSchema` inside the property so a bug in the generator would surface
 * immediately.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { canvasSchema } from '../schema';
import { descendantCount, subtreeIds } from '../tree';
import type { Canvas, Node, NodeType } from '../types';

/* -------------------------------------------------------------------------- */
/* Local generators                                                            */
/* -------------------------------------------------------------------------- */

const ISO_TIMESTAMP = '2024-01-01T00:00:00.000Z';
const CANVAS_ID = '00000000-0000-4000-8000-00000000ffff';

/**
 * Deterministically map an integer index (0..2^48-1) to a valid v4 UUID
 * string. Guarantees the ids in a generated canvas are unique because
 * distinct indices produce distinct hex suffixes.
 */
function idFromIndex(i: number): string {
  const hex = i.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const nodeTypeArb: fc.Arbitrary<NodeType> = fc.constantFrom(
  'topic',
  'finding',
  'question',
  'conclusion',
);

const positionArb = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
});

/**
 * Generate an array of length `n` where the value at position `i` is a
 * parent-index chosen uniformly from `[0, i - 1]`. Used to build a random
 * rooted tree: node 0 is the root; node i > 0 attaches under `parents[i-1]`.
 * For `n === 1` the array is empty (only the root exists).
 */
function parentIndicesArb(n: number): fc.Arbitrary<number[]> {
  if (n <= 1) return fc.constant([]);
  const perIndex = Array.from({ length: n - 1 }, (_, i) =>
    fc.integer({ min: 0, max: i }),
  );
  return fc.tuple(...perIndex).map((t) => Array.from(t));
}

/**
 * Build a structurally valid `Canvas` with 1..20 nodes by:
 *   1. Choosing `n`.
 *   2. Choosing parent indices for nodes 1..n-1 (each from earlier indices).
 *   3. Choosing independent per-node type / collapsed / position values.
 *   4. Materializing the nodes with UUIDs derived from their index.
 *
 * Because every non-root node's parent has a lower index, the resulting
 * `parentId` chain is acyclic and there is exactly one root — satisfying
 * `canvasSchema.superRefine` by construction.
 */
const arbCanvas: fc.Arbitrary<Canvas> = fc
  .integer({ min: 1, max: 20 })
  .chain((n) =>
    fc.record({
      n: fc.constant(n),
      parents: parentIndicesArb(n),
      types: fc.array(nodeTypeArb, { minLength: n, maxLength: n }),
      collapsedFlags: fc.array(fc.boolean(), {
        minLength: n,
        maxLength: n,
      }),
      positions: fc.array(positionArb, { minLength: n, maxLength: n }),
    }),
  )
  .map(({ n, parents, types, collapsedFlags, positions }): Canvas => {
    const nodes: Node[] = [];
    for (let i = 0; i < n; i++) {
      nodes.push({
        id: idFromIndex(i),
        parentId: i === 0 ? null : idFromIndex(parents[i - 1] as number),
        title: '',
        body: '',
        images: [],
        type: types[i] as NodeType,
        position: positions[i] as { x: number; y: number },
        collapsed: collapsedFlags[i] as boolean,
        createdAt: ISO_TIMESTAMP,
        updatedAt: ISO_TIMESTAMP,
      });
    }
    return {
      id: CANVAS_ID,
      title: '',
      nodes,
      updatedAt: ISO_TIMESTAMP,
    };
  });

/* -------------------------------------------------------------------------- */
/* Property 11                                                                 */
/* -------------------------------------------------------------------------- */

describe('Feature: root-mvp, Property 11: descendantCount correctness', () => {
  test('descendantCount(c, id) === subtreeIds(c, id).size - 1 for every id in c', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        // Sanity check: the local generator must always produce a canvas
        // that satisfies the structural invariants. A regression here would
        // silently invalidate the property below.
        const parsed = canvasSchema.safeParse(c);
        expect(parsed.success).toBe(true);

        for (const node of c.nodes) {
          const count = descendantCount(c, node.id);
          const subtree = subtreeIds(c, node.id);
          // subtreeIds is inclusive of `id`, so its size is always >= 1 for
          // any id present in the canvas.
          expect(subtree.size).toBeGreaterThanOrEqual(1);
          expect(count).toBe(subtree.size - 1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
