/**
 * Property test — Property 16: Serialization round-trip (task 5.3).
 *
 * `Feature: root-mvp, Property 16: Serialization round-trip`
 *
 * For any `Canvas` `c` reachable through the Data Model mutators,
 *
 *     parseCanvas(serializeCanvas(c)) === { ok: true, canvas: c' }
 *
 * with `c'` deep-equal to `c`. That is, writing a canvas out to JSON and
 * reading it back yields the same structural value — never a parse error,
 * never a schema-validation failure, never lossy re-encoding.
 *
 * This is the load/save contract the persistence layer (R8.2, R8.3) relies
 * on. The two directions matter for slightly different reasons:
 *   - `serializeCanvas` emits a JSON document with a fixed, deterministic
 *     field order (R9.6). Field-order normalization is invisible to
 *     structural (deep) equality, so it never breaks the round-trip.
 *   - `parseCanvas` validates against `canvasSchema` (R9.4, R9.5). By
 *     Property 15 every canvas drawn from `arbCanvas` already satisfies
 *     the schema, so `parseCanvas` must always land on the `ok: true`
 *     branch here. If it ever doesn't, either `serializeCanvas` is lossy
 *     or the schema is stricter than the mutators — both are bugs this
 *     test is designed to catch.
 *   - Together they close the loop the recovery path in R14.3 depends on:
 *     a canvas persisted after any mutator sequence can be reloaded
 *     without drift.
 *
 * Validates: Requirements 6.6, 8.2, 8.3, 9.4, 9.5, 9.6, 14.3.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { parseCanvas, serializeCanvas } from '../serialize';
import { arbCanvas } from './arbitraries';

describe('Feature: root-mvp, Property 16: Serialization round-trip', () => {
  test('parseCanvas(serializeCanvas(c)) === { ok: true, canvas: c\' } with c\' deep-equal to c', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const result = parseCanvas(serializeCanvas(c));

        // Two assertions rather than one so a failure points at the exact
        // property that broke: (a) parseCanvas rejected a canvas the
        // mutators produced (schema drift / lossy serialize), or (b) the
        // round-tripped canvas differs structurally from the input
        // (encoding lost or transformed a field).
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.canvas).toEqual(c);
        }
      }),
      { numRuns: 100 },
    );
  });
});
