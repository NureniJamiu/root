/**
 * Property test — addChild postcondition.
 *
 * For any non-empty `Canvas` `c`, any node id `parentId` in `c` and any
 * `Position` `p`, `c' = addChild(c, parentId, { position: p })`:
 *
 *   1. adds exactly one node (a blank `topic` at `p`) and keeps every other
 *      node, apart from the parent being auto-expanded;
 *   2. adds exactly one connector, from `parentId` to the new node, on the
 *      sides that face each other;
 *   3. keeps every existing connector;
 *   4. still satisfies `canvasSchema`.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { computeFacingSides } from '../graph';
import { addChild } from '../mutators';
import { canvasSchema } from '../schema';
import type { Canvas } from '../types';

import { arbCanvas, arbNodeId, arbPosition, arbSide } from './arbitraries';

const arbInput = arbCanvas
  .filter((c) => c.nodes.length > 0)
  .chain((canvas) =>
    fc.record({
      canvas: fc.constant(canvas),
      parentId: arbNodeId(canvas),
      position: arbPosition,
    }),
  );

describe('addChild postcondition', () => {
  test('adds one blank topic node and one connector from the parent, and preserves invariants', () => {
    fc.assert(
      fc.property(arbInput, ({ canvas, parentId, position }) => {
        const after = addChild(canvas, parentId, { position });

        expect(after.nodes).toHaveLength(canvas.nodes.length + 1);
        const beforeIds = new Set(canvas.nodes.map((n) => n.id));
        const added = after.nodes.filter((n) => !beforeIds.has(n.id));
        expect(added).toHaveLength(1);
        const child = added[0]!;
        expect(child.type).toBe('topic');
        expect(child.title).toBe('');
        expect(child.body).toBe('');
        expect(child.images).toEqual([]);
        expect(child.collapsed).toBe(false);
        expect(child.position).toEqual(position);
        expect(child.updatedAt).toBe(child.createdAt);

        // The parent is expanded so the new card is visible.
        expect(after.nodes.find((n) => n.id === parentId)!.collapsed).toBe(false);

        // Every other card is untouched.
        const priorById = new Map(canvas.nodes.map((n) => [n.id, n]));
        for (const n of after.nodes) {
          if (n.id === child.id || n.id === parentId) continue;
          expect(n).toEqual(priorById.get(n.id));
        }

        // One new connector, parent -> child, on the facing sides.
        expect(after.edges).toHaveLength(canvas.edges.length + 1);
        expect(after.edges.slice(0, canvas.edges.length)).toEqual(canvas.edges);
        const edge = after.edges[after.edges.length - 1]!;
        const parent = canvas.nodes.find((n) => n.id === parentId)!;
        expect(edge.source).toBe(parentId);
        expect(edge.target).toBe(child.id);
        const facing = computeFacingSides(parent.position, position);
        expect(edge.sourceSide).toBe(facing.sourceSide);
        expect(edge.targetSide).toBe(facing.targetSide);

        expect(canvasSchema.safeParse(after).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('explicit sides override the facing sides', () => {
    fc.assert(
      fc.property(arbInput, arbSide, arbSide, ({ canvas, parentId, position }, sourceSide, targetSide) => {
        const after = addChild(canvas, parentId, { position, sourceSide, targetSide });
        const edge = after.edges[after.edges.length - 1]!;
        expect(edge.sourceSide).toBe(sourceSide);
        expect(edge.targetSide).toBe(targetSide);
      }),
      { numRuns: 50 },
    );
  });

  test('an unknown parent leaves the canvas unchanged', () => {
    const c: Canvas = { id: crypto.randomUUID(), title: '', nodes: [], edges: [], updatedAt: new Date().toISOString() };
    expect(addChild(c, crypto.randomUUID(), { position: { x: 0, y: 0 } })).toBe(c);
  });
});
