// Feature: root-mvp, Property 1: Visibility rule — for any Canvas c and any
// node n in c, n ∈ visibleNodeIds(c) iff every strict ancestor of n (via
// parentId) has collapsed === false. Equivalently, n is hidden iff at least
// one strict ancestor of n has collapsed === true.
//
// Validates: Requirements 1.1, 6.2, 6.4.
//
// Design references: .kiro/specs/root-mvp/design.md §Correctness Properties
// (Property 1) and §Tree Utilities. This test uses a LOCAL, self-contained
// fast-check arbitrary because task 4.2 (the shared `arbCanvas` in
// `src/data/__tests__/arbitraries.ts`) has not yet been implemented. Once
// that shared arbitrary lands, this file can be updated to consume it.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { visibleNodeIds } from '../tree';
import type { Canvas, Node, NodeType, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Local arbitrary                                                             */
/* -------------------------------------------------------------------------- */

// Every generated canvas needs a valid canvas id and ISO timestamps for the
// nodes so the resulting shape conforms to the `Canvas` / `Node` types.
// The visibility rule only reads `parentId` and `collapsed`, so the other
// fields are held constant.
const CANVAS_ID: UUID = '00000000-0000-4000-8000-000000000fff';
const TIMESTAMP = '2024-01-01T00:00:00.000Z';

const NODE_TYPES: readonly NodeType[] = [
  'topic',
  'finding',
  'question',
  'conclusion',
];

/**
 * Builds a valid canvas by picking `n` unique node ids and then, for each
 * non-root index `i`, choosing its parent from indices `0..i-1`. This
 * construction guarantees the four structural invariants for free:
 *   - unique ids (via `fc.uniqueArray`);
 *   - exactly one root when non-empty (index 0 is the sole `parentId === null`);
 *   - no dangling parentIds (every parent is drawn from an earlier index);
 *   - no cycles (parents strictly precede children).
 *
 * Canvas size is bounded to keep the property test cheap while still
 * exercising interesting collapse patterns (small trees with several
 * collapsed ancestors along a path).
 */
const arbCanvas: fc.Arbitrary<Canvas> = fc
  .integer({ min: 0, max: 8 })
  .chain((n) => {
    if (n === 0) {
      return fc.constant<Canvas>({
        id: CANVAS_ID,
        title: '',
        nodes: [],
        updatedAt: TIMESTAMP,
      });
    }

    const perNodeSpec = (i: number) =>
      fc.record({
        // -1 means "no parent" (root). Only allowed for the first node.
        parentIdx:
          i === 0 ? fc.constant(-1) : fc.integer({ min: 0, max: i - 1 }),
        collapsed: fc.boolean(),
        type: fc.constantFrom(...NODE_TYPES),
        x: fc.integer({ min: -1_000, max: 1_000 }),
        y: fc.integer({ min: -1_000, max: 1_000 }),
      });

    return fc
      .uniqueArray(fc.uuid(), { minLength: n, maxLength: n })
      .chain((ids) =>
        fc
          .tuple(...Array.from({ length: n }, (_, i) => perNodeSpec(i)))
          .map((specs): Canvas => {
            const nodes: Node[] = ids.map((id, i) => {
              // `specs` has length n and is indexed in lockstep with `ids`, and
              // for non-root nodes `parentIdx` is drawn from [0, i-1], so every
              // indexed access below is in-bounds by construction.
              const spec = specs[i]!;
              return {
                id,
                parentId: spec.parentIdx === -1 ? null : ids[spec.parentIdx]!,
                title: '',
                body: '',
                images: [],
                type: spec.type,
                position: { x: spec.x, y: spec.y },
                collapsed: spec.collapsed,
                createdAt: TIMESTAMP,
                updatedAt: TIMESTAMP,
              };
            });
            return {
              id: CANVAS_ID,
              title: '',
              nodes,
              updatedAt: TIMESTAMP,
            };
          }),
      );
  });

/* -------------------------------------------------------------------------- */
/* Oracle                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reference implementation of the visibility predicate, used as the oracle
 * for `visibleNodeIds`. Returns `true` when every STRICT ancestor of `id`
 * has `collapsed === false`. The root has no strict ancestors and therefore
 * satisfies the predicate vacuously.
 */
function everyStrictAncestorExpanded(c: Canvas, id: UUID): boolean {
  const byId = new Map<UUID, Node>();
  for (const node of c.nodes) byId.set(node.id, node);
  const self = byId.get(id);
  if (self === undefined) return false; // outside the canvas — cannot occur

  let cursor: UUID | null = self.parentId;
  while (cursor !== null) {
    const parent = byId.get(cursor);
    // Dangling parentId cannot occur in canvases produced by `arbCanvas`,
    // but if it did we treat the chain as broken (no collapsed ancestor
    // found), matching the "iff every ancestor is expanded" reading.
    if (parent === undefined) return true;
    if (parent.collapsed) return false;
    cursor = parent.parentId;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Property                                                                    */
/* -------------------------------------------------------------------------- */

describe('visibleNodeIds — Property 1: visibility rule', () => {
  it('n ∈ visibleNodeIds(c) iff every strict ancestor of n has collapsed === false', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const visible = visibleNodeIds(c);
        for (const node of c.nodes) {
          const expected = everyStrictAncestorExpanded(c, node.id);
          expect(visible.has(node.id)).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });
});
