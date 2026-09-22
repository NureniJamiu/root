/**
 * Property test — Property 4: addChild postcondition (task 4.4).
 *
 * `Feature: root-mvp, Property 4: addChild postcondition`
 *
 * For any structurally valid non-empty `Canvas` `c`, any node id `parentId`
 * present in `c`, and any `Position` `p`, the canvas `c' = addChild(c,
 * parentId, { position: p })` satisfies:
 *
 *   1. `c'.nodes.length === c.nodes.length + 1` (a single node was added).
 *   2. Exactly one node id is present in `c'` that was not in `c` — the
 *      new child — and every previously-present id is still present.
 *   3. The new child has `parentId === parentId`, `type === 'topic'`,
 *      empty `title` / `body` / `images`, `collapsed === false`, and
 *      `position` deep-equal to `p`.
 *   4. The new child's `createdAt` equals its `updatedAt` (freshly
 *      stamped in a single call to `now()`).
 *   5. The parent's `collapsed` is `false` in `c'` regardless of its
 *      value in `c` (R3.4 — addChild auto-expands a collapsed parent).
 *   6. Every non-parent, non-new node is byte-identical in `c` and `c'`
 *      (addChild does not perturb unrelated nodes).
 *   7. `canvasSchema.safeParse(c').success === true` — the structural
 *      invariants (unique ids, single root, no dangling parentId, no
 *      cycles) are preserved. This is the "result satisfies structural
 *      invariants" clause of the task.
 *
 * Validates: Requirements 3.1, 3.4.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { addChild } from '../mutators';
import { canvasSchema } from '../schema';
import type { Canvas, Node } from '../types';

import { arbCanvas, arbNodeId, arbPosition } from './arbitraries';

/**
 * `arbCanvas` may produce an empty canvas (its op plan can be length 0 or
 * consist entirely of no-op ops on an empty base). Property 4 is only
 * meaningful when the canvas has at least one node to serve as `parentId`,
 * so we filter down to non-empty canvases and then chain a random in-canvas
 * id and a target position.
 */
const arbNonEmptyCanvas: fc.Arbitrary<Canvas> = arbCanvas.filter(
  (c) => c.nodes.length > 0,
);

const arbInput: fc.Arbitrary<{
  canvas: Canvas;
  parentId: string;
  position: { x: number; y: number };
}> = arbNonEmptyCanvas.chain((canvas) =>
  fc.record({
    canvas: fc.constant(canvas),
    parentId: arbNodeId(canvas),
    position: arbPosition,
  }),
);

describe('Feature: root-mvp, Property 4: addChild postcondition', () => {
  test('addChild grows the canvas by exactly one topic child under parentId, auto-expands the parent, leaves other nodes untouched, and preserves structural invariants', () => {
    fc.assert(
      fc.property(arbInput, ({ canvas, parentId, position }) => {
        const before = canvas;
        const after = addChild(before, parentId, { position });

        // (1) exactly one node added.
        expect(after.nodes.length).toBe(before.nodes.length + 1);

        // (2) every prior id is retained, and exactly one new id appears.
        const beforeIds = new Set(before.nodes.map((n) => n.id));
        const afterIds = new Set(after.nodes.map((n) => n.id));
        for (const id of beforeIds) expect(afterIds.has(id)).toBe(true);
        const newIds = [...afterIds].filter((id) => !beforeIds.has(id));
        expect(newIds.length).toBe(1);
        const newId = newIds[0] as string;

        // (3) new-child field shape.
        const child = after.nodes.find((n) => n.id === newId) as Node;
        expect(child.parentId).toBe(parentId);
        expect(child.type).toBe('topic');
        expect(child.title).toBe('');
        expect(child.body).toBe('');
        expect(child.images).toEqual([]);
        expect(child.collapsed).toBe(false);
        expect(child.position).toEqual(position);

        // (4) fresh timestamps: createdAt and updatedAt were stamped in
        //     the same now() call inside addChild.
        expect(child.updatedAt).toBe(child.createdAt);

        // (5) parent is expanded in `after` regardless of its prior state
        //     (R3.4). The `!` is safe because `parentId` was drawn via
        //     `arbNodeId(before)` and (2) established it still exists.
        const parentAfter = after.nodes.find((n) => n.id === parentId)!;
        expect(parentAfter.collapsed).toBe(false);

        // (6) untouched nodes are byte-identical.
        //     Parent may have been rewritten only to clear `collapsed`
        //     and bump `updatedAt`; every other pre-existing node must
        //     be deep-equal to its pre-image.
        const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
        for (const n of after.nodes) {
          if (n.id === newId) continue;
          if (n.id === parentId) continue;
          const prior = beforeById.get(n.id);
          expect(prior).toBeDefined();
          expect(n).toEqual(prior);
        }

        // Sanity for the parent: its structural identity fields are
        // preserved; only `collapsed` (forced false) and `updatedAt`
        // (bumped when the parent was previously collapsed) may change.
        const parentBefore = beforeById.get(parentId)!;
        expect(parentAfter.id).toBe(parentBefore.id);
        expect(parentAfter.parentId).toBe(parentBefore.parentId);
        expect(parentAfter.title).toBe(parentBefore.title);
        expect(parentAfter.body).toBe(parentBefore.body);
        expect(parentAfter.images).toEqual(parentBefore.images);
        expect(parentAfter.type).toBe(parentBefore.type);
        expect(parentAfter.position).toEqual(parentBefore.position);
        expect(parentAfter.createdAt).toBe(parentBefore.createdAt);

        // (7) structural invariants — the mutator's output round-trips
        //     through the canvas schema.
        const parsed = canvasSchema.safeParse(after);
        expect(parsed.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
