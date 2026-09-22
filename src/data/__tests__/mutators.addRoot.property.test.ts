/**
 * Property test — Property 3: addRoot postcondition (task 4.3).
 *
 * `Feature: root-mvp, Property 3: addRoot postcondition`
 *
 * For any `Position` `p`,
 *
 *     addRoot(emptyCanvas(), { position: p })
 *
 * yields a canvas with exactly one node whose fields are fully determined by
 * the mutator contract (design.md §Mutator Semantics, requirement R2.2):
 *
 *   - `parentId === null`         (the new node is the root)
 *   - `type === 'topic'`          (root defaults to the topic style)
 *   - `title === ''`              (empty content — editor fills in later)
 *   - `body === ''`
 *   - `images.length === 0`
 *   - `collapsed === false`
 *   - `position` deep-equals `p`
 *   - `createdAt === updatedAt`   (single stamp on creation)
 *
 * Validates: Requirements 2.2.
 *
 * The test consumes `arbPosition` from the shared `arbitraries` module so
 * every point in the coordinate space the canvas actually uses is exercised.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { addRoot, emptyCanvas } from '../mutators';
import { arbPosition } from './arbitraries';

describe('Feature: root-mvp, Property 3: addRoot postcondition', () => {
  test('addRoot(emptyCanvas(), { position: p }) has exactly one root-shaped node with position === p and createdAt === updatedAt', () => {
    fc.assert(
      fc.property(arbPosition, (p) => {
        const c = addRoot(emptyCanvas(), { position: p });

        expect(c.nodes).toHaveLength(1);

        // Index is safe: we just asserted length === 1.
        const root = c.nodes[0]!;

        expect(root.parentId).toBeNull();
        expect(root.type).toBe('topic');
        expect(root.title).toBe('');
        expect(root.body).toBe('');
        expect(root.images).toEqual([]);
        expect(root.collapsed).toBe(false);
        expect(root.position).toEqual(p);
        expect(root.createdAt).toBe(root.updatedAt);
      }),
      { numRuns: 100 },
    );
  });
});
