/**
 * Property test — Property 10: Collapse round-trip (task 4.8).
 *
 * `Feature: root-mvp, Property 10: Collapse round-trip`
 *
 * For any `Canvas` `c` and any node id `id` present in `c` whose
 * `collapsed` flag is currently `false`,
 *
 *     setCollapsed(setCollapsed(c, id, true), id, false).nodes
 *       ≡ c.nodes (deep-equal, modulo `updatedAt` on the toggled node)
 *
 * i.e. toggling collapse from `false → true → false` is a value-level
 * no-op on every node except that the toggled node's `updatedAt` will
 * have moved forward (`setCollapsed` unconditionally bumps `updatedAt`
 * on each call, so the round-trip touches it twice). Every other field
 * on the toggled node — including `collapsed`, which ends back at
 * `false` — and every field on every non-toggled node is byte-identical.
 *
 * This exercises Requirement 6.3 ("WHEN the user activates the expand
 * affordance on a Node with Collapse_State true, THE Data_Model_Layer
 * SHALL set that Node's Collapse_State to false"): expanding a
 * previously-collapsed node returns the tree to its pre-collapse state.
 *
 * The property is stated in design.md §Property 10 as "for any id in c"
 * without a precondition. Taken literally, the property fails for nodes
 * whose `collapsed` is already `true`: `setCollapsed(c, id, true)` still
 * routes through the replaceNode helper (it does not short-circuit on
 * equal values), and the follow-up `setCollapsed(_, id, false)` then
 * flips the flag away from its original `true`. The property statement
 * is really about the false → true → false round-trip that R6.3
 * describes, so we `filter` the drawn id to nodes with
 * `collapsed === false`. Nodes born via `addRoot` / `addChild` are
 * always created with `collapsed: false` (see mutators.ts), so the
 * filter still leaves a large in-canvas selection.
 *
 * Validates: Requirements 6.3.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { setCollapsed } from '../mutators';
import type { Canvas, Node, UUID } from '../types';

import { arbCanvas, arbNodeId } from './arbitraries';

/**
 * Look up a node in `c` by id. Callers hold an id drawn via `arbNodeId(c)`
 * on a canvas we already know contains it, so the lookup never fails.
 */
function nodeById(c: Canvas, id: UUID): Node {
  const n = c.nodes.find((x) => x.id === id);
  if (n === undefined) throw new Error(`nodeById: id ${id} not in canvas`);
  return n;
}

/** Strip `updatedAt` from a node so two nodes can be compared "modulo" it. */
function withoutUpdatedAt(n: Node): Omit<Node, 'updatedAt'> {
  const { updatedAt: _updatedAt, ...rest } = n;
  return rest;
}

describe('Feature: root-mvp, Property 10: Collapse round-trip', () => {
  test('setCollapsed(setCollapsed(c, id, true), id, false).nodes ≡ c.nodes modulo updatedAt of the toggled node', () => {
    fc.assert(
      fc.property(
        // Draw a non-empty canvas, then draw a target id whose current
        // `collapsed` is `false`. The `filter` inside the inner chain keeps
        // the round-trip within its natural precondition (see the file
        // header for why); `arbCanvas` reliably produces canvases with
        // several `collapsed: false` nodes because every node is born
        // collapsed-false and `setCollapsed` ops in the plan flip a small
        // fraction of them.
        arbCanvas
          .filter((c) => c.nodes.some((n) => !n.collapsed))
          .chain((c) =>
            fc
              .tuple(
                fc.constant(c),
                arbNodeId(c).filter((id) => !nodeById(c, id).collapsed),
              ),
          ),
        ([c, id]) => {
          const once = setCollapsed(c, id, true);
          const twice = setCollapsed(once, id, false);

          // Same number of nodes and same id order — `setCollapsed` only
          // replaces the target slot in place, so both invariants hold.
          expect(twice.nodes.length).toBe(c.nodes.length);
          expect(twice.nodes.map((n) => n.id)).toEqual(
            c.nodes.map((n) => n.id),
          );

          // Every non-toggled node is byte-identical to its pre-image
          // (including its own `updatedAt` — only the *toggled* node's
          // `updatedAt` is moduloed out by the property statement).
          const beforeById = new Map(c.nodes.map((n) => [n.id, n]));
          for (const n of twice.nodes) {
            if (n.id === id) continue;
            expect(n).toEqual(beforeById.get(n.id));
          }

          // The toggled node deep-equals its pre-image modulo `updatedAt`.
          // The round-trip ends with `collapsed: false`, matching the
          // pre-image (which we filtered to `collapsed: false`).
          const before = nodeById(c, id);
          const after = nodeById(twice, id);
          expect(withoutUpdatedAt(after)).toEqual(withoutUpdatedAt(before));

          // `updatedAt` on the toggled node is monotonic (>= input). Two
          // calls within the same millisecond may yield equal strings, so
          // the check is non-strict. ISO 8601 UTC strings sort
          // lexicographically in chronological order, so `>=` on the raw
          // strings is a temporal comparison.
          expect(after.updatedAt >= before.updatedAt).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
