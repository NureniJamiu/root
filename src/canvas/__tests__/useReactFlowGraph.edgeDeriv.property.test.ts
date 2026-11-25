/**
 * Property test — graph derivation.
 *
 * For any canvas, `deriveReactFlowGraph` hands React Flow exactly the visible
 * cards, and exactly one edge per connector whose two ends are both visible.
 * Each edge keeps the connector's id and ends, names the sides it attaches to
 * through its handle ids (a pinned end its stored side, an automatic end the
 * side facing the other card), and is drawn from its relation: an untyped
 * (`related-to`) connector is coloured by the type of the card it leaves and
 * shows its label only when active; a typed one takes its relation's colour
 * and label; one whose relation does not fit its cards is dashed in the
 * warning colour.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { ENABLED_NODE_TYPE_IDS, isRelationAllowed, relationLabel, resolveEdgeSides, visibleNodeIds } from '../../data';
import type { Canvas, NodeType, RelationType } from '../../data';
import { arbCanvas, arbRichCanvas } from '../../data/__tests__/arbitraries';
import { EDGE_COLOR_BY_RELATION, EDGE_COLOR_BY_TYPE, EDGE_INVALID_COLOR } from '../edgeStyles';
import { connectorLook, deriveReactFlowGraph, relayoutEdges } from '../useReactFlowGraph';

/** A rich canvas (every relation) whose cards take any enabled type. */
const arbTypedCanvas: fc.Arbitrary<Canvas> = arbRichCanvas.chain((c) =>
  fc
    .array(fc.constantFrom(...ENABLED_NODE_TYPE_IDS), { minLength: c.nodes.length, maxLength: c.nodes.length })
    .map((types): Canvas => ({ ...c, nodes: c.nodes.map((n, i) => ({ ...n, type: types[i]!, fields: {} })) })),
);

describe('deriveReactFlowGraph', () => {
  test('nodes are the visible cards; edges are the connectors with both ends visible', () => {
    fc.assert(
      fc.property(arbCanvas, (canvas) => {
        const { nodes, edges } = deriveReactFlowGraph(canvas);
        const visible = visibleNodeIds(canvas);

        expect(nodes.map((n) => n.id).sort()).toEqual([...visible].sort());

        const expected = canvas.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
        expect(edges.map((e) => e.id)).toEqual(expected.map((e) => e.id));

        for (const rf of edges) {
          const edge = canvas.edges.find((e) => e.id === rf.id)!;
          expect(rf.source).toBe(edge.source);
          expect(rf.target).toBe(edge.target);
          const from = canvas.nodes.find((n) => n.id === edge.source)!;
          const to = canvas.nodes.find((n) => n.id === edge.target)!;
          const sides = resolveEdgeSides(edge, from.position, to.position);
          expect(rf.sourceHandle).toBe(`source-${sides.sourceSide}`);
          expect(rf.targetHandle).toBe(`target-${sides.targetSide}`);
          expect(rf.data?.relation).toBe(edge.relationType);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('each connector is drawn from its relation and the types of its two cards', () => {
    fc.assert(
      fc.property(arbTypedCanvas, (canvas) => {
        const types = new Map(canvas.nodes.map((n) => [n.id, n.type]));
        for (const rf of deriveReactFlowGraph(canvas).edges) {
          const edge = canvas.edges.find((e) => e.id === rf.id)!;
          const from = types.get(edge.source)!;
          const to = types.get(edge.target)!;
          const data = rf.data!;
          expect(data.label).toBe(relationLabel(edge.relationType, from, to));
          if (edge.relationType === 'related-to') {
            expect(data).toMatchObject({ color: EDGE_COLOR_BY_TYPE[from], dashed: to === 'question', quiet: true, invalid: false });
          } else if (isRelationAllowed(edge.relationType, from, to)) {
            expect(data).toMatchObject({
              color: EDGE_COLOR_BY_RELATION[edge.relationType],
              dashed: false,
              quiet: false,
              invalid: false,
            });
          } else {
            expect(data).toMatchObject({ color: EDGE_INVALID_COLOR, dashed: true, quiet: false, invalid: true });
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  test('an untyped canvas draws connectors as before relations: source colour, dashed into a question, label only when active', () => {
    fc.assert(
      fc.property(arbCanvas, (canvas) => {
        const untyped: Canvas = { ...canvas, edges: canvas.edges.map((e) => ({ ...e, relationType: 'related-to' as const })) };
        const types = new Map(untyped.nodes.map((n) => [n.id, n.type]));
        for (const rf of deriveReactFlowGraph(untyped).edges) {
          expect(rf.data?.color).toBe(EDGE_COLOR_BY_TYPE[types.get(rf.source)!]);
          expect(rf.data?.dashed).toBe(types.get(rf.target) === 'question');
          expect(rf.data?.quiet).toBe(true);
          expect(rf.data?.invalid).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('labels read from the card a connector leaves', () => {
    const look = (relationType: RelationType, from: NodeType, to: NodeType) =>
      connectorLook({ relationType }, { type: from }, { type: to });
    expect(look('supports', 'finding', 'conclusion')).toMatchObject({ label: 'supports', invalid: false, color: 'rgb(var(--finding))' });
    expect(look('supports', 'conclusion', 'finding')).toMatchObject({ label: 'supported by', invalid: false });
    expect(look('addresses', 'objective', 'research-question')).toMatchObject({ label: 'addressed by', color: 'rgb(var(--framing))' });
    expect(look('refines', 'objective', 'objective')).toMatchObject({ label: 'refines', invalid: false });
    expect(look('contradicts', 'finding', 'finding')).toMatchObject({ label: 'contradicts', color: 'rgb(var(--question))' });
    expect(look('related-to', 'topic', 'question')).toMatchObject({ label: 'related to', quiet: true, dashed: true });
  });

  test('a relation that does not fit its cards is dashed in the warning colour', () => {
    expect(connectorLook({ relationType: 'supports' }, { type: 'question' }, { type: 'topic' })).toMatchObject({
      invalid: true,
      dashed: true,
      quiet: false,
      color: EDGE_INVALID_COLOR,
      label: 'supports',
    });
  });

  test('relayoutEdges re-routes automatic ends of a dragged card and leaves pinned ends and other edges alone', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const node = (id: string, x: number) => ({
      id, title: '', body: '', images: [], type: 'topic' as const, position: { x, y: 0 },
      collapsed: false, createdAt: ts, updatedAt: ts, fields: {}, provenance: { origin: 'researcher' as const, edited: false },
    });
    const [a, b, c] = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c'];
    const canvas = {
      id: '00000000-0000-4000-8000-000000000010', schemaVersion: 2 as const, title: '', updatedAt: ts,
      nodes: [node(a, 0), node(b, 500), node(c, 1000)],
      edges: [
        { id: '30000000-0000-4000-8000-000000000001', source: a, target: b, sourceSide: 'right' as const, targetSide: 'left' as const, sourcePinned: false, targetPinned: false, relationType: 'related-to' as const, provenance: { origin: 'researcher' as const, edited: false } },
        { id: '30000000-0000-4000-8000-000000000002', source: a, target: b, sourceSide: 'top' as const, targetSide: 'top' as const, sourcePinned: true, targetPinned: true, relationType: 'related-to' as const, provenance: { origin: 'researcher' as const, edited: false } },
        { id: '30000000-0000-4000-8000-000000000003', source: b, target: c, sourceSide: 'right' as const, targetSide: 'left' as const, sourcePinned: false, targetPinned: false, relationType: 'related-to' as const, provenance: { origin: 'researcher' as const, edited: false } },
      ],
    };
    const { edges } = deriveReactFlowGraph(canvas);
    const live = new Map([[b, { x: 0, y: 600 }]]);

    const next = relayoutEdges(edges, canvas, live);

    expect(next[0]).toMatchObject({ sourceHandle: 'source-bottom', targetHandle: 'target-top' }); // b is below a now
    expect(next[1]).toBe(edges[1]); // fully pinned: untouched
    expect(next[2]!.sourceHandle).toBe('source-right'); // c is still to the right of b? b moved to x=0
    expect(relayoutEdges(edges, canvas, new Map([['00000000-0000-4000-8000-0000000000ff', { x: 0, y: 0 }]]))[0]).toBe(edges[0]);
  });

  test('only the selected connector is marked selected', () => {
    fc.assert(
      fc.property(
        arbCanvas.filter((c) => c.edges.length > 0 && c.nodes.every((n) => !n.collapsed)),
        (canvas) => {
          const pick = canvas.edges[0]!;
          const { edges } = deriveReactFlowGraph(canvas, { selectedEdgeId: pick.id });
          for (const e of edges) expect(e.selected).toBe(e.id === pick.id);
        },
      ),
      { numRuns: 50 },
    );
  });
});
