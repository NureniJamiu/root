/**
 * Property test — Property 2: Edge derivation from parentId (task 9.4).
 *
 * `Feature: root-mvp, Property 2: Edge derivation from parentId`
 *
 * For any canvas `c`, `deriveReactFlowGraph(c).edges` contains exactly one
 * edge per visible (parent, child) pair where both parent and child are in
 * `visibleNodeIds(c)`. Edge ids follow the `e:{parentId}->{childId}` format.
 *
 * Specifically, for every node `n` in `visibleNodeIds(c)`:
 *
 *   1. If `n.parentId` is non-null AND `n.parentId` ∈ `visibleNodeIds(c)`,
 *      there is exactly one edge with:
 *        - `id   === e:{n.parentId}->{n.id}`
 *        - `source === n.parentId`
 *        - `target === n.id`
 *
 *   2. If `n.parentId === null` OR `n.parentId` ∉ `visibleNodeIds(c)`,
 *      there is NO edge whose `target === n.id`.
 *
 *   3. Total edge count equals the count of visible nodes whose parentId is
 *      also visible (i.e., nodes that satisfy the criterion in point 1).
 *
 * Validates: Requirements 1.5
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { visibleNodeIds } from '../../data';
import { deriveReactFlowGraph } from '../useReactFlowGraph';

import { arbCanvas } from '../../data/__tests__/arbitraries';

describe('Feature: root-mvp, Property 2: Edge derivation from parentId', () => {
  test(
    'edges contain exactly one entry per visible (parent, child) pair, with correct id/source/target, and no edges for parentless or hidden-parent nodes',
    () => {
      fc.assert(
        fc.property(arbCanvas, (canvas) => {
          const { edges } = deriveReactFlowGraph(canvas);
          const visible = visibleNodeIds(canvas);

          // Build a map from target id to edge for easy lookup.
          const edgeByTarget = new Map(edges.map((e) => [e.target, e]));

          // Track expected edge count.
          let expectedEdgeCount = 0;

          for (const node of canvas.nodes) {
            if (!visible.has(node.id)) continue;

            const parentVisible =
              node.parentId !== null && visible.has(node.parentId);

            if (parentVisible) {
              // (1) There must be exactly one edge targeting this node.
              expectedEdgeCount++;
              const edge = edgeByTarget.get(node.id);
              expect(edge).toBeDefined();
              expect(edge!.id).toBe(`e:${node.parentId}->${node.id}`);
              expect(edge!.source).toBe(node.parentId);
              expect(edge!.target).toBe(node.id);
            } else {
              // (2) No edge should target this node.
              expect(edgeByTarget.has(node.id)).toBe(false);
            }
          }

          // (3) Total edge count matches expected.
          expect(edges.length).toBe(expectedEdgeCount);

          // Sanity: edge ids are unique.
          const edgeIds = edges.map((e) => e.id);
          expect(new Set(edgeIds).size).toBe(edgeIds.length);
        }),
        { numRuns: 100 },
      );
    },
  );
});
