/**
 * Property test for `hasCycle` correctness (task 3.4).
 *
 * Feature: root-mvp, Property 14: hasCycle correctness
 *
 *   For any `Canvas` `c`, any node id `childId` present in `c`, and any
 *   candidate `newParentId ∈ (nodeIds(c) ∪ { null })`:
 *
 *     hasCycle(c, childId, newParentId) === true
 *       iff  newParentId === childId
 *         || newParentId ∈ subtreeIds(c, childId)
 *
 * Reparenting to `null` (making a node a root) can never create a cycle.
 *
 * Validates: Requirements 3.5
 *
 * Task 4.2 (the shared `arbCanvas` arbitrary) is not yet implemented, so this
 * file defines a small LOCAL fast-check arbitrary that builds structurally
 * valid single-root canvases by generating each non-root node's parent from
 * an index strictly less than its own. That construction is acyclic by
 * design, keeping the arbitrary orthogonal to the code under test.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { hasCycle, subtreeIds } from '../tree';
import type { Canvas, Node, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Local arbitrary                                                            */
/* -------------------------------------------------------------------------- */

const TIMESTAMP = '2024-01-01T00:00:00.000Z';
const CANVAS_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Builds a `Canvas` with `n` nodes (1 ≤ n ≤ 8). Node 0 is the root; every
 * subsequent node picks its parent from a strictly-earlier index, so the
 * resulting parent chain is guaranteed acyclic and has a single root.
 */
const arbCanvasLocal: fc.Arbitrary<Canvas> = fc
  .integer({ min: 1, max: 8 })
  .chain((n) =>
    fc.record({
      ids: fc.uniqueArray(fc.uuid(), { minLength: n, maxLength: n }),
      // For i ∈ [1, n-1], parentIdxs[i-1] ∈ [0, i-1] (strictly earlier index).
      parentIdxs:
        n <= 1
          ? fc.constant<number[]>([])
          : fc.tuple(
              ...Array.from({ length: n - 1 }, (_, i) =>
                fc.integer({ min: 0, max: i }),
              ),
            ),
    }),
  )
  .map(({ ids, parentIdxs }) => {
    const nodes: Node[] = ids.map((id, i) => ({
      id,
      parentId: i === 0 ? null : ids[parentIdxs[i - 1]],
      title: '',
      body: '',
      images: [],
      type: 'topic',
      position: { x: 0, y: 0 },
      collapsed: false,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    }));
    return {
      id: CANVAS_ID,
      title: '',
      nodes,
      updatedAt: TIMESTAMP,
    } satisfies Canvas;
  });

/** Pair a canvas with an in-range `childId` and a candidate `newParentId`. */
const arbHasCycleInput = arbCanvasLocal.chain((canvas) =>
  fc.record({
    canvas: fc.constant(canvas),
    childId: fc
      .integer({ min: 0, max: canvas.nodes.length - 1 })
      .map((i) => canvas.nodes[i].id),
    newParentId: fc.oneof(
      fc.constant<UUID | null>(null),
      fc
        .integer({ min: 0, max: canvas.nodes.length - 1 })
        .map((i) => canvas.nodes[i].id as UUID | null),
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/* Property                                                                   */
/* -------------------------------------------------------------------------- */

describe('Feature: root-mvp, Property 14: hasCycle correctness', () => {
  it('hasCycle === (newParentId === childId || newParentId ∈ subtreeIds(c, childId))', () => {
    fc.assert(
      fc.property(arbHasCycleInput, ({ canvas, childId, newParentId }) => {
        const expected =
          newParentId !== null &&
          (newParentId === childId ||
            subtreeIds(canvas, childId).has(newParentId));
        expect(hasCycle(canvas, childId, newParentId)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Case coverage — pins down the four scenarios called out in the task        */
/* -------------------------------------------------------------------------- */

const IDS = {
  root: '00000000-0000-4000-8000-000000000001',
  a: '00000000-0000-4000-8000-000000000002',
  b: '00000000-0000-4000-8000-000000000003',
  a1: '00000000-0000-4000-8000-000000000004',
  a2: '00000000-0000-4000-8000-000000000005',
  a11: '00000000-0000-4000-8000-000000000006',
} as const;

function makeNode(id: UUID, parentId: UUID | null): Node {
  return {
    id,
    parentId,
    title: '',
    body: '',
    images: [],
    type: 'topic',
    position: { x: 0, y: 0 },
    collapsed: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

/**
 * Tree:
 *   root
 *   ├── a
 *   │   ├── a1
 *   │   │   └── a11
 *   │   └── a2
 *   └── b
 */
const sample: Canvas = {
  id: CANVAS_ID,
  title: '',
  nodes: [
    makeNode(IDS.root, null),
    makeNode(IDS.a, IDS.root),
    makeNode(IDS.b, IDS.root),
    makeNode(IDS.a1, IDS.a),
    makeNode(IDS.a2, IDS.a),
    makeNode(IDS.a11, IDS.a1),
  ],
  updatedAt: TIMESTAMP,
};

describe('hasCycle — case coverage', () => {
  it('returns false when newParentId is null (reparenting to root can never cycle)', () => {
    for (const n of sample.nodes) {
      expect(hasCycle(sample, n.id, null)).toBe(false);
    }
  });

  it('returns true when newParentId === childId (self-parenting)', () => {
    for (const n of sample.nodes) {
      expect(hasCycle(sample, n.id, n.id)).toBe(true);
    }
  });

  it('returns true when newParentId is a descendant of childId', () => {
    // a's descendants: a1, a2, a11 — moving a under any of them would cycle.
    expect(hasCycle(sample, IDS.a, IDS.a1)).toBe(true);
    expect(hasCycle(sample, IDS.a, IDS.a2)).toBe(true);
    expect(hasCycle(sample, IDS.a, IDS.a11)).toBe(true);
    // Deeper example: a1 under its own descendant a11.
    expect(hasCycle(sample, IDS.a1, IDS.a11)).toBe(true);
  });

  it('returns false when newParentId is unrelated (sibling / ancestor / cousin)', () => {
    // Sibling: move a under b — legal.
    expect(hasCycle(sample, IDS.a, IDS.b)).toBe(false);
    // Ancestor: move a under root — legal (no-op-ish, but not a cycle).
    expect(hasCycle(sample, IDS.a, IDS.root)).toBe(false);
    // Cousin: move a1 under b — legal.
    expect(hasCycle(sample, IDS.a1, IDS.b)).toBe(false);
    // Move a leaf (b) under a's subtree — legal.
    expect(hasCycle(sample, IDS.b, IDS.a11)).toBe(false);
  });
});
