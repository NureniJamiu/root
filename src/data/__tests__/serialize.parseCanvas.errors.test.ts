/**
 * Unit tests for `parseCanvas` error paths (task 5.4).
 *
 * `parseCanvas` never throws. Both failure modes flow through the tagged
 * `{ ok: false, error, raw }` branch so the persistence load path can:
 *   - surface a recoverable error to the user (R8.5), and
 *   - preserve the raw stored payload untouched for a later recovery attempt
 *     (R8.5, R9.4).
 *
 * These tests pin down the two failure modes and, critically, assert the
 * original `raw` string is echoed back **byte-for-byte** on every failure so
 * the persistence layer can write it to the recovery slot.
 *
 * Success paths (round-trip) are covered by the sibling property test for
 * Property 16; this file focuses exclusively on the failing branches.
 */

import { describe, expect, it } from 'vitest';

import { parseCanvas } from '../serialize';
import type { Canvas, Node, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

// Reuse the same UUID shapes as schema.test.ts so failure messages stay
// legible and the two files can be read together.
const NODE_IDS = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  ghost: '00000000-0000-4000-8000-0000000000ff',
} as const;

const CANVAS_ID = '00000000-0000-4000-8000-000000000010';
const TIMESTAMP = '2024-01-01T00:00:00.000Z';

function makeNode(overrides: Partial<Node> & { id: UUID }): Node {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    title: overrides.title ?? '',
    body: overrides.body ?? '',
    images: overrides.images ?? [],
    type: overrides.type ?? 'topic',
    position: overrides.position ?? { x: 0, y: 0 },
    collapsed: overrides.collapsed ?? false,
    createdAt: overrides.createdAt ?? TIMESTAMP,
    updatedAt: overrides.updatedAt ?? TIMESTAMP,
  };
}

function makeCanvas(nodes: Node[]): Canvas {
  return {
    id: CANVAS_ID,
    title: '',
    nodes,
    updatedAt: TIMESTAMP,
  };
}

/**
 * Narrow to the failure branch so subsequent assertions can touch `error` and
 * `raw` without repeating `if (result.ok) throw` in every test.
 */
function expectFailure(
  result: ReturnType<typeof parseCanvas>,
): Extract<ReturnType<typeof parseCanvas>, { ok: false }> {
  if (result.ok) {
    throw new Error('expected parseCanvas to fail, but it succeeded');
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Malformed JSON                                                              */
/* -------------------------------------------------------------------------- */

describe('parseCanvas — malformed JSON', () => {
  it.each([
    ['empty string', ''],
    ['single opening brace', '{'],
    ['unterminated string', '{"id": "abc'],
    ['trailing comma', '{"id": "abc",}'],
    ['garbage', 'not json at all'],
  ])('rejects %s and echoes raw payload', (_label, raw) => {
    const result = parseCanvas(raw);
    const failure = expectFailure(result);

    expect(failure.raw).toBe(raw);
    // The error string should be non-empty and mention JSON so the R8.5
    // toast can distinguish parse failures from schema failures.
    expect(failure.error).toMatch(/json/i);
    expect(failure.error.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Valid JSON, invalid Canvas shape                                            */
/* -------------------------------------------------------------------------- */

describe('parseCanvas — valid JSON failing schema', () => {
  it('rejects duplicate node ids', () => {
    // Two nodes sharing the same id. Keep the root count at one so the
    // duplicate-id issue is the primary invariant under test, not the
    // root-count invariant.
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const dup = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.a });
    const raw = JSON.stringify(makeCanvas([root, dup]));

    const failure = expectFailure(parseCanvas(raw));

    expect(failure.raw).toBe(raw);
    expect(failure.error).toContain('duplicate node id');
  });

  it('rejects a non-empty canvas with no root', () => {
    // Every node has a non-null parentId. The a↔b cycle also triggers a
    // cycle report; the missing-root message is what we're asserting here.
    const a = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.b });
    const b = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const raw = JSON.stringify(makeCanvas([a, b]));

    const failure = expectFailure(parseCanvas(raw));

    expect(failure.raw).toBe(raw);
    expect(failure.error).toContain('expected exactly 1 root, got 0');
  });

  it('rejects a parent cycle', () => {
    // a → b → c → a. Detected by the acyclic-chain invariant.
    const a = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.c });
    const b = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const c = makeNode({ id: NODE_IDS.c, parentId: NODE_IDS.b });
    const raw = JSON.stringify(makeCanvas([a, b, c]));

    const failure = expectFailure(parseCanvas(raw));

    expect(failure.raw).toBe(raw);
    expect(failure.error).toContain('cycle involving node');
  });

  it('rejects a dangling parentId', () => {
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const orphan = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.ghost });
    const raw = JSON.stringify(makeCanvas([root, orphan]));

    const failure = expectFailure(parseCanvas(raw));

    expect(failure.raw).toBe(raw);
    expect(failure.error).toContain('dangling parentId');
  });

  it('echoes raw payload byte-for-byte, including whitespace', () => {
    // The recovery slot must receive the *original* string, not a
    // re-serialization. Use a payload with distinctive whitespace so a
    // hidden re-serialize would be detectable.
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const dup = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.a });
    const raw = JSON.stringify(makeCanvas([root, dup]), null, 2);

    const failure = expectFailure(parseCanvas(raw));

    expect(failure.raw).toBe(raw);
    expect(failure.raw).toContain('\n'); // pretty-printed, distinct from compact
  });
});
