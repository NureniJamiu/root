/**
 * Unit tests for `canvasSchema.superRefine` (task 2.2).
 *
 * These pin down the four structural invariants documented on `canvasSchema`
 * in `../schema.ts`:
 *
 *   1. `id` is unique across `nodes`.
 *   2. When the canvas is non-empty, exactly one node has `parentId === null`.
 *   3. No node references a `parentId` that is not present in `nodes`.
 *   4. The parent chain is acyclic.
 *
 * Field-level shape (Requirements 9.1, 9.2, 9.3) is enforced by the primitive
 * `nodeSchema` / `canvasSchema` object shape and is exercised implicitly by
 * using well-formed fixtures — the *cases under test here are the four
 * structural invariants that live inside `superRefine`.
 */

import { describe, expect, it } from 'vitest';

import { canvasSchema } from '../schema';
import type { Canvas, Node, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

// Deterministic v4 UUIDs so tests are stable and match `z.string().uuid()`.
const NODE_IDS = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  d: '00000000-0000-4000-8000-00000000000d',
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

function messages(result: ReturnType<typeof canvasSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

/* -------------------------------------------------------------------------- */
/* Acceptance cases                                                            */
/* -------------------------------------------------------------------------- */

describe('canvasSchema.superRefine — acceptance', () => {
  it('accepts an empty canvas', () => {
    const result = canvasSchema.safeParse(makeCanvas([]));
    expect(result.success).toBe(true);
  });

  it('accepts a single-root canvas', () => {
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const result = canvasSchema.safeParse(makeCanvas([root]));
    expect(result.success).toBe(true);
  });

  it('accepts a well-formed multi-level tree with one root', () => {
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const child = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const grandchild = makeNode({ id: NODE_IDS.c, parentId: NODE_IDS.b });
    const result = canvasSchema.safeParse(
      makeCanvas([root, child, grandchild]),
    );
    expect(result.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Rejection cases                                                             */
/* -------------------------------------------------------------------------- */

describe('canvasSchema.superRefine — rejection', () => {
  it('rejects duplicate ids', () => {
    // Two roots both sharing the same id. We keep the root count at one so
    // the duplicate-id issue is not masked by the root-count invariant.
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const dup = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.a });
    const result = canvasSchema.safeParse(makeCanvas([root, dup]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate node id')]),
    );
  });

  it('rejects a non-empty canvas with no root', () => {
    // Every node has a non-null parentId → rootCount === 0. The parents also
    // form a cycle (a↔b), so we additionally expect a cycle report, but the
    // primary assertion here is the missing-root message.
    const a = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.b });
    const b = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const result = canvasSchema.safeParse(makeCanvas([a, b]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('expected exactly 1 root, got 0')]),
    );
  });

  it('rejects a canvas with multiple roots', () => {
    const r1 = makeNode({ id: NODE_IDS.a, parentId: null });
    const r2 = makeNode({ id: NODE_IDS.b, parentId: null });
    const result = canvasSchema.safeParse(makeCanvas([r1, r2]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('expected exactly 1 root, got 2')]),
    );
  });

  it('rejects a dangling parentId', () => {
    const root = makeNode({ id: NODE_IDS.a, parentId: null });
    const orphan = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.ghost });
    const result = canvasSchema.safeParse(makeCanvas([root, orphan]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('dangling parentId')]),
    );
  });

  it('rejects a two-node parent cycle', () => {
    // a → b → a. No node with parentId=null, so we also expect a missing-root
    // issue; the cycle detection must still fire.
    const a = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.b });
    const b = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const result = canvasSchema.safeParse(makeCanvas([a, b]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('cycle involving node')]),
    );
  });

  it('rejects a self-loop (node is its own parent)', () => {
    const self = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.a });
    const result = canvasSchema.safeParse(makeCanvas([self]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('cycle involving node')]),
    );
  });

  it('rejects a longer cycle (a → b → c → a)', () => {
    const a = makeNode({ id: NODE_IDS.a, parentId: NODE_IDS.c });
    const b = makeNode({ id: NODE_IDS.b, parentId: NODE_IDS.a });
    const c = makeNode({ id: NODE_IDS.c, parentId: NODE_IDS.b });
    const result = canvasSchema.safeParse(makeCanvas([a, b, c]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(
      expect.arrayContaining([expect.stringContaining('cycle involving node')]),
    );
  });
});
