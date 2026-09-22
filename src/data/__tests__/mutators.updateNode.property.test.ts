/**
 * Property test — Property 6: updateNode preserves the patch (task 4.5).
 *
 * `Feature: root-mvp, Property 6: updateNode preserves the patch`
 *
 * For any `Canvas` `c`, any node id `id` present in `c`, and any
 * `NodePatch` `patch` (each of `title`, `body`, `type` independently
 * present or absent), the canvas `c' = updateNode(c, id, patch)` satisfies:
 *
 *   (a) Patched fields match — for every key `k ∈ { title, body, type }`
 *       present in `patch`, `c'.nodes[id][k] === patch[k]`.
 *
 *   (b) Unpatched fields on the target node are unchanged — for every
 *       patchable key absent from `patch`, and for every non-patchable
 *       field (`id`, `parentId`, `images`, `position`, `collapsed`,
 *       `createdAt`), the field is byte-identical to the pre-image.
 *
 *   (c) Other nodes are unchanged — every node in `c'` whose id is not
 *       `id` is byte-identical to its pre-image in `c`.
 *
 *   (d) `updatedAt` is monotonic (>= input) — both on the target node
 *       (`c'.nodes[id].updatedAt >= c.nodes[id].updatedAt`) and on the
 *       canvas (`c'.updatedAt >= c.updatedAt`). ISO 8601 UTC timestamps
 *       compare lexicographically in chronological order, so `>=` on
 *       strings is the correct temporal comparison.
 *
 * Validates: Requirements 4.2, 4.3, 4.6.
 *
 * Uses the shared `arbCanvas` / `arbNodeId` / `arbNodeType` arbitraries so
 * the canvas is drawn from the same op-plan space as every other Data
 * Model property test. `arbNodePatch` is defined locally because the
 * shared file keeps its patch arbitrary private — the patch shape here
 * is a `fc.record` with `requiredKeys: []` so each of the three patch
 * keys is independently either present or absent (never `undefined`),
 * matching the `NodePatch` shape under `exactOptionalPropertyTypes`.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { updateNode, type NodePatch } from '../mutators';
import type { Canvas, Node, UUID } from '../types';

import { arbCanvas, arbNodeId, arbNodeType } from './arbitraries';

/**
 * A `NodePatch` with each key independently present or absent.
 *
 * Under `exactOptionalPropertyTypes`, an absent key is meaningfully
 * different from `key: undefined`; `fc.record` with `requiredKeys: []`
 * omits keys entirely rather than emitting `undefined` values, which is
 * exactly what `updateNode`'s optional-field patching contract expects.
 */
const arbNodePatch: fc.Arbitrary<NodePatch> = fc.record(
  {
    title: fc.string({ maxLength: 200 }),
    body: fc.string({ maxLength: 2_000 }),
    type: arbNodeType,
  },
  { requiredKeys: [] },
);

/**
 * Look up a node in `c` by id. Callers hold an id drawn via `arbNodeId(c)`
 * or a mutator that preserves it, so the node is always present.
 */
function nodeById(c: Canvas, id: UUID): Node {
  const n = c.nodes.find((x) => x.id === id);
  if (n === undefined) throw new Error(`nodeById: id ${id} not in canvas`);
  return n;
}

describe('Feature: root-mvp, Property 6: updateNode preserves the patch', () => {
  test('patched fields match, unpatched fields and other nodes unchanged, updatedAt monotonic', () => {
    fc.assert(
      fc.property(
        // Draw a non-empty canvas, then draw a target id out of it and a
        // random partial patch independently. Filtering to non-empty
        // canvases keeps the mutator on its non-trivial path — an
        // `updateNode` call against an unknown id is a guarded no-op and
        // would trivially satisfy every clause without exercising the
        // patch logic.
        arbCanvas
          .filter((c) => c.nodes.length > 0)
          .chain((c) =>
            fc.tuple(fc.constant(c), arbNodeId(c), arbNodePatch),
          ),
        ([c, id, patch]) => {
          const before = nodeById(c, id);
          const cPrime = updateNode(c, id, patch);
          const after = nodeById(cPrime, id);

          // (a) Patched fields match. Each key is checked only when the
          //     patch actually carries it, so a key absent from the patch
          //     falls through to the unchanged-field checks below.
          if ('title' in patch) {
            expect(after.title).toBe(patch.title);
          }
          if ('body' in patch) {
            expect(after.body).toBe(patch.body);
          }
          if ('type' in patch) {
            expect(after.type).toBe(patch.type);
          }

          // (b) Unpatched patchable fields on the target are unchanged.
          if (!('title' in patch)) {
            expect(after.title).toBe(before.title);
          }
          if (!('body' in patch)) {
            expect(after.body).toBe(before.body);
          }
          if (!('type' in patch)) {
            expect(after.type).toBe(before.type);
          }

          //     Non-patchable fields on the target are always unchanged.
          //     `updateNode` never touches structural identity, position,
          //     images, collapse state, or the createdAt timestamp.
          expect(after.id).toBe(before.id);
          expect(after.parentId).toBe(before.parentId);
          expect(after.images).toEqual(before.images);
          expect(after.position).toEqual(before.position);
          expect(after.collapsed).toBe(before.collapsed);
          expect(after.createdAt).toBe(before.createdAt);

          // (c) Every non-target node is byte-identical to its pre-image.
          //     No new nodes are introduced and no existing node is
          //     dropped, so the id sets match and each non-target lookup
          //     succeeds.
          expect(cPrime.nodes.length).toBe(c.nodes.length);
          const beforeById = new Map(c.nodes.map((n) => [n.id, n]));
          for (const n of cPrime.nodes) {
            if (n.id === id) continue;
            expect(n).toEqual(beforeById.get(n.id));
          }

          // (d) updatedAt is monotonic (>= input). ISO 8601 UTC strings
          //     sort lexicographically in chronological order, so `>=`
          //     on the raw strings is a temporal comparison. Two calls
          //     within the same millisecond yield equal strings, so the
          //     property is non-strict monotonic.
          expect(after.updatedAt >= before.updatedAt).toBe(true);
          expect(cPrime.updatedAt >= c.updatedAt).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
