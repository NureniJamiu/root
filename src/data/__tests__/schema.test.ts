/**
 * Unit tests for `canvasSchema`: the structural invariants (unique ids, no
 * dangling or self connectors), the permissive graph shape (no
 * root, several clusters, cycles, many connectors per card) and the migration
 * of canvases saved in the older `parentId` format.
 */

import { describe, expect, it } from 'vitest';

import { canvasSchema } from '../schema';
import type { Canvas, Edge, Node, UUID } from '../types';

const NODE_IDS = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  ghost: '00000000-0000-4000-8000-0000000000ff',
} as const;

const CANVAS_ID = '00000000-0000-4000-8000-000000000010';
const TIMESTAMP = '2024-01-01T00:00:00.000Z';

function makeNode(id: UUID, overrides: Partial<Node> = {}): Node {
  return {
    id,
    title: '',
    body: '',
    images: [],
    type: 'topic',
    position: { x: 0, y: 0 },
    collapsed: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

let edgeCounter = 0;
function makeEdge(source: UUID, target: UUID, overrides: Partial<Edge> = {}): Edge {
  edgeCounter += 1;
  return {
    id: `30000000-0000-4000-8000-${String(edgeCounter).padStart(12, '0')}`,
    source,
    target,
    sourceSide: 'right',
    targetSide: 'left',
    sourcePinned: false,
    targetPinned: false,
    ...overrides,
  };
}

function makeCanvas(nodes: Node[], edges: Edge[] = []): Canvas {
  return { id: CANVAS_ID, title: '', nodes, edges, updatedAt: TIMESTAMP };
}

function messages(result: ReturnType<typeof canvasSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('canvasSchema — acceptance', () => {
  it('accepts an empty canvas', () => {
    expect(canvasSchema.safeParse(makeCanvas([])).success).toBe(true);
  });

  it('accepts cards with no connectors, several unconnected clusters and no single root', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b), makeNode(NODE_IDS.c)];
    expect(canvasSchema.safeParse(makeCanvas(nodes)).success).toBe(true);
    expect(canvasSchema.safeParse(makeCanvas(nodes, [makeEdge(NODE_IDS.a, NODE_IDS.b)])).success).toBe(true);
  });

  it('accepts several connectors per card, including parallel ones on different sides', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b), makeNode(NODE_IDS.c)];
    const edges = [
      makeEdge(NODE_IDS.a, NODE_IDS.b),
      makeEdge(NODE_IDS.a, NODE_IDS.c),
      makeEdge(NODE_IDS.c, NODE_IDS.b),
      makeEdge(NODE_IDS.a, NODE_IDS.b, { sourceSide: 'bottom', targetSide: 'top' }),
      makeEdge(NODE_IDS.b, NODE_IDS.a),
    ];
    expect(canvasSchema.safeParse(makeCanvas(nodes, edges)).success).toBe(true);
  });

  it('accepts cycles', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b)];
    const edges = [makeEdge(NODE_IDS.a, NODE_IDS.b), makeEdge(NODE_IDS.b, NODE_IDS.a)];
    expect(canvasSchema.safeParse(makeCanvas(nodes, edges)).success).toBe(true);
  });
});

describe('canvasSchema — rejection', () => {
  it('rejects duplicate node ids', () => {
    const result = canvasSchema.safeParse(makeCanvas([makeNode(NODE_IDS.a), makeNode(NODE_IDS.a)]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(expect.arrayContaining([expect.stringContaining('duplicate node id')]));
  });

  it('rejects duplicate edge ids', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b)];
    const e = makeEdge(NODE_IDS.a, NODE_IDS.b);
    const result = canvasSchema.safeParse(makeCanvas(nodes, [e, { ...e, sourceSide: 'top' }]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(expect.arrayContaining([expect.stringContaining('duplicate edge id')]));
  });

  it('rejects a connector to a card that does not exist', () => {
    const nodes = [makeNode(NODE_IDS.a)];
    const result = canvasSchema.safeParse(makeCanvas(nodes, [makeEdge(NODE_IDS.a, NODE_IDS.ghost)]));
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(expect.arrayContaining([expect.stringContaining('dangling edge')]));
  });

  it('rejects a connector from a card to itself', () => {
    const result = canvasSchema.safeParse(
      makeCanvas([makeNode(NODE_IDS.a)], [makeEdge(NODE_IDS.a, NODE_IDS.a)]),
    );
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(expect.arrayContaining([expect.stringContaining('to itself')]));
  });

  it('rejects an unknown side', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b)];
    const edge = { ...makeEdge(NODE_IDS.a, NODE_IDS.b), sourceSide: 'middle' };
    expect(canvasSchema.safeParse(makeCanvas(nodes, [edge as unknown as Edge])).success).toBe(false);
  });
});

describe('canvasSchema — legacy parentId canvases', () => {
  /** A canvas as saved before connectors were first-class. */
  function legacy(nodes: Array<Record<string, unknown>>): unknown {
    return { id: CANVAS_ID, title: 'Old', nodes, updatedAt: TIMESTAMP };
  }
  const legacyNode = (id: UUID, parentId: UUID | null, extra: Record<string, unknown> = {}) => ({
    ...makeNode(id),
    parentId,
    ...extra,
  });

  it('turns each parentId into a connector from the parent to the child', () => {
    const result = canvasSchema.safeParse(
      legacy([
        legacyNode(NODE_IDS.a, null, { position: { x: 0, y: 0 } }),
        legacyNode(NODE_IDS.b, NODE_IDS.a, { position: { x: 400, y: 0 } }),
        legacyNode(NODE_IDS.c, NODE_IDS.a, { position: { x: 0, y: 400 } }),
      ]),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nodes).toHaveLength(3);
    expect(result.data.edges).toHaveLength(2);
    expect(result.data.edges[0]).toMatchObject({
      id: NODE_IDS.b, source: NODE_IDS.a, target: NODE_IDS.b, sourceSide: 'right', targetSide: 'left',
    });
    expect(result.data.edges[1]).toMatchObject({
      source: NODE_IDS.a, target: NODE_IDS.c, sourceSide: 'bottom', targetSide: 'top',
    });
    expect(result.data.nodes.every((n) => !('parentId' in n))).toBe(true);
  });

  it('carries the old pin flags over and defaults them to automatic', () => {
    const result = canvasSchema.safeParse(
      legacy([
        legacyNode(NODE_IDS.a, null),
        legacyNode(NODE_IDS.b, NODE_IDS.a, { sourcePinned: true }),
        legacyNode(NODE_IDS.c, NODE_IDS.a),
      ]),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.edges[0]).toMatchObject({ sourcePinned: true, targetPinned: false });
    expect(result.data.edges[1]).toMatchObject({ sourcePinned: false, targetPinned: false });
  });

  it('defaults pin flags to false on an edge that has none', () => {
    const nodes = [makeNode(NODE_IDS.a), makeNode(NODE_IDS.b)];
    const { sourcePinned: _s, targetPinned: _t, ...bare } = makeEdge(NODE_IDS.a, NODE_IDS.b);
    const result = canvasSchema.safeParse({ ...makeCanvas(nodes), edges: [bare] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.edges[0]).toMatchObject({ sourcePinned: false, targetPinned: false });
  });

  it('keeps the sides the old canvas stored', () => {
    const result = canvasSchema.safeParse(
      legacy([
        legacyNode(NODE_IDS.a, null),
        legacyNode(NODE_IDS.b, NODE_IDS.a, { sourceSide: 'top', targetSide: 'bottom', sourcePinned: true }),
      ]),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.edges[0]).toMatchObject({ sourceSide: 'top', targetSide: 'bottom' });
  });

  it('turns a dangling parent into a free card instead of failing', () => {
    const result = canvasSchema.safeParse(legacy([legacyNode(NODE_IDS.a, NODE_IDS.ghost)]));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.edges).toEqual([]);
  });

  it('adds an empty edge list to a canvas that has neither parentId nor edges', () => {
    const result = canvasSchema.safeParse({ id: CANVAS_ID, title: '', nodes: [], updatedAt: TIMESTAMP });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.edges).toEqual([]);
  });

  it('does not touch a canvas already in the new format', () => {
    const c = makeCanvas([makeNode(NODE_IDS.a), makeNode(NODE_IDS.b)], [makeEdge(NODE_IDS.a, NODE_IDS.b)]);
    const result = canvasSchema.safeParse(c);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(c);
  });
});
