/**
 * Property test — Property 12: deleteNodeOnly semantics (task 4.9).
 *
 * `Feature: root-mvp, Property 12: deleteNodeOnly semantics`
 *
 * For any `Canvas` `c` and any non-root node id `id` present in `c`, the
 * canvas `c' = deleteNodeOnly(c, id)` satisfies:
 *
 *   (a) Target absent — `id` is not the id of any node in `c'`.
 *
 *   (b) Children of the target are reparented to the target's own
 *       `parentId` — for every node in `c` whose `parentId === id`, the
 *       corresponding node in `c'` (keyed by its id, which is preserved
 *       across the reparent) has `parentId === c.nodes[id].parentId`.
 *
 *   (c) Every other node's `parentId` is unchanged — for every node in
 *       `c` that is neither the target nor a direct child of the target,
 *       the corresponding node in `c'` has the same `parentId`.
 *
 *   (d) Structural invariants hold — `canvasSchema.safeParse(c').success`
 *       is `true`. This is the "last line of defence" contract from
 *       design.md §Mutator Semantics: a mutator's output is always a
 *       schema-valid canvas.
 *
 * The property is stated for non-root targets specifically because
 * `deleteNodeOnly` on the root of a canvas with children is a guarded
 * no-op per R7.5 (reparenting the root's children to `null` would
 * produce multiple roots and violate `canvasSchema`) — that case is
 * covered by the unit tests in `mutators.edgeCases.test.ts` and is
 * intentionally out of scope here. Deleting a root-only canvas (a lone
 * root with no children) is also allowed by the mutator but is likewise
 * outside this property's frame, since (b) is vacuous and (c) is
 * trivially empty; restricting to non-root ids keeps the property
 * exercising the interesting reparenting path on every run.
 *
 * Validates: Requirements 7.1, 7.3.
 *
 * Uses the shared `arbCanvas` / `arbNodeId` arbitraries so the canvas is
 * drawn from the same op-plan space as every other Data Model property
 * test.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { deleteNodeOnly } from '../mutators';
import { canvasSchema } from '../schema';
import type { Canvas, UUID } from '../types';

import { arbCanvas, arbNodeId } from './arbitraries';

/**
 * True when `c` contains at least one non-root node — i.e. at least one
 * node whose `parentId` is not `null`. Used as an `arbCanvas.filter` so
 * `arbNodeId(c).filter(nonRoot)` always has at least one candidate to
 * draw from.
 */
function hasNonRootNode(c: Canvas): boolean {
  return c.nodes.some((n) => n.parentId !== null);
}

/**
 * True when `id` refers to a non-root node in `c`. Callers guarantee
 * `id` is present in `c` by drawing it from `arbNodeId(c)`.
 */
function isNonRoot(c: Canvas, id: UUID): boolean {
  const node = c.nodes.find((n) => n.id === id);
  if (node === undefined) throw new Error(`isNonRoot: id ${id} not in canvas`);
  return node.parentId !== null;
}

describe('Feature: root-mvp, Property 12: deleteNodeOnly semantics', () => {
  test('target absent, children reparented to target.parentId, other parentIds unchanged, canvasSchema valid', () => {
    fc.assert(
      fc.property(
        // Draw a canvas that has at least one non-root node, then draw an
        // in-canvas id restricted to non-root nodes. The two filters work
        // together: the outer filter guarantees `arbNodeId(c)` has a
        // non-root to shrink toward, and the inner filter discards the
        // (guaranteed to exist) root when it comes up.
        arbCanvas
          .filter(hasNonRootNode)
          .chain((c) =>
            fc.tuple(
              fc.constant(c),
              arbNodeId(c).filter((id) => isNonRoot(c, id)),
            ),
          ),
        ([c, id]) => {
          const target = c.nodes.find((n) => n.id === id);
          if (target === undefined) {
            throw new Error(`target ${id} not present in canvas`);
          }
          // `isNonRoot` above guarantees this; narrow for the checks below.
          const targetParentId = target.parentId;
          expect(targetParentId).not.toBeNull();

          const cPrime = deleteNodeOnly(c, id);

          // (a) Target absent.
          expect(cPrime.nodes.some((n) => n.id === id)).toBe(false);
          // No new nodes are introduced; exactly one node was removed.
          expect(cPrime.nodes).toHaveLength(c.nodes.length - 1);

          // Index the pre-image by id so (b)/(c) can look up each node's
          // original `parentId` in O(1). `id` itself is deliberately
          // included so a stray reappearance of the target would still
          // fail (a) rather than silently pass the parent-id checks.
          const beforeById = new Map(c.nodes.map((n) => [n.id, n]));

          for (const after of cPrime.nodes) {
            const before = beforeById.get(after.id);
            if (before === undefined) {
              throw new Error(
                `deleteNodeOnly introduced a new node id ${after.id}`,
              );
            }
            if (before.parentId === id) {
              // (b) Direct child of the target: reparented to the
              //     target's own parent. Because the target was
              //     non-root, `targetParentId` is a UUID (never `null`),
              //     so this equality is well-defined.
              expect(after.parentId).toBe(targetParentId);
            } else {
              // (c) Anyone else keeps their original parentId. This
              //     covers the target's siblings, ancestors, indirect
              //     descendants, and unrelated subtrees.
              expect(after.parentId).toBe(before.parentId);
            }
          }

          // (d) Structural invariants hold. The four `canvasSchema`
          //     invariants (unique ids, exactly one root when non-empty,
          //     no dangling parentId, acyclic parent chain) are the
          //     mutator's post-condition. Non-root deletion preserves
          //     the root count (the root is untouched), preserves
          //     uniqueness (we remove one node and rename no ids),
          //     preserves acyclicity (parents-of-parents chain can only
          //     shrink), and preserves referential integrity (children
          //     land on `targetParentId` which was already a valid id
          //     in `c`).
          expect(canvasSchema.safeParse(cPrime).success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
