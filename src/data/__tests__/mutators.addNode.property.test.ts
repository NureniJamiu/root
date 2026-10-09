/**
 * Property test — addNode postcondition.
 *
 * For any `Position` `p` and any canvas `c`,
 *
 *     addNode(c, { position: p })
 *
 * appends exactly one node whose fields are fully determined by the mutator
 * contract (a blank `topic` card at `p`), adds no connector, and leaves every
 * existing node untouched. The canvas may be empty or hold any number of
 * cards: ideas do not have to hang from anything.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { addNode, emptyCanvas } from '../mutators';
import { arbCanvas, arbPosition } from './arbitraries';

describe('addNode postcondition', () => {
  test('addNode(emptyCanvas(), { position: p }) yields one blank topic node at p with createdAt === updatedAt', () => {
    fc.assert(
      fc.property(arbPosition, (p) => {
        const c = addNode(emptyCanvas(), { position: p });

        expect(c.nodes).toHaveLength(1);
        expect(c.edges).toHaveLength(0);

        const node = c.nodes[0]!;
        expect(node.type).toBe('topic');
        expect(node.title).toBe('');
        expect(node.body).toBe('');
        expect(node.images).toEqual([]);
        expect(node.collapsed).toBe(false);
        expect(node.position).toEqual(p);
        expect(node.createdAt).toBe(node.updatedAt);
      }),
      { numRuns: 100 },
    );
  });

  test('on any canvas it appends one unconnected node and keeps the rest as they were', () => {
    fc.assert(
      fc.property(arbCanvas, arbPosition, (c, p) => {
        const next = addNode(c, { position: p });

        expect(next.nodes).toHaveLength(c.nodes.length + 1);
        expect(next.nodes.slice(0, c.nodes.length)).toEqual(c.nodes);
        expect(next.edges).toEqual(c.edges);

        const added = next.nodes[next.nodes.length - 1]!;
        expect(next.edges.some((e) => e.source === added.id || e.target === added.id)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
