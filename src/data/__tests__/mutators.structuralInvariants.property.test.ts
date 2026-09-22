/**
 * Property test — Property 15: Structural invariants under all mutator
 * sequences (task 4.11).
 *
 * `Feature: root-mvp, Property 15: Structural invariants under all mutator sequences`
 *
 * For any finite sequence of pure mutators applied to `emptyCanvas()`,
 *
 *     canvasSchema.safeParse(c).success === true
 *
 * i.e. the four structural invariants enforced by `canvasSchema.superRefine`
 * (unique ids, exactly one root when non-empty, no dangling `parentId`, no
 * cycles) hold for every reachable canvas.
 *
 * Validates: Requirements 9.1, 9.2.
 *
 * The shared `arbCanvas` arbitrary (see `arbitraries.ts`) is defined as a
 * fold of a random mutator sequence over `emptyCanvas()`, which is exactly
 * the space Property 15 quantifies over. Every draw from `arbCanvas` is a
 * concrete witness of the property, so the test is a direct check on the
 * arbitrary's contract.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { canvasSchema } from '../schema';
import { arbCanvas } from './arbitraries';

describe('Feature: root-mvp, Property 15: Structural invariants under all mutator sequences', () => {
  test('every canvas reached by a finite mutator sequence satisfies canvasSchema', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        expect(canvasSchema.safeParse(c).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
