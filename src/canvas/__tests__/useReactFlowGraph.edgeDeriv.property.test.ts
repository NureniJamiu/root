/**
 * Property test — graph derivation.
 *
 * For any canvas, `deriveReactFlowGraph` hands React Flow exactly the visible
 * cards, and exactly one edge per connector whose two ends are both visible.
 * Each edge keeps the connector's id and ends, names the sides it attaches to
 * through its handle ids (a pinned end its stored side, an automatic end the
 * side facing the other card), and is coloured by the type of the card it
 * leaves.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { resolveEdgeSides, visibleNodeIds } from '../../data';
import { arbCanvas } from '../../data/__tests__/arbitraries';
import { EDGE_COLOR_BY_TYPE } from '../edgeStyles';
import { deriveReactFlowGraph, relayoutEdges } from '../useReactFlowGraph';

describe('deriveReactFlowGraph', () => {
  test('nodes are the visible cards; edges are the connectors with both ends visible', () => {
    fc.assert(
      fc.property(arbCanvas, (canvas) => {
        const { nodes, edges } = deriveReactFlowGraph(canvas);
        const visible = visibleNodeIds(canvas);

        expect(nodes.map((n) => n.id).sort()).toEqual([...visible].sort());

        const expected = canvas.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
        expect(edges.map((e) => e.id)).toEqual(expected.map((e) => e.id));

        const types = new Map(canvas.nodes.map((n) => [n.id, n.type]));
        for (const rf of edges) {
          const edge = canvas.edges.find((e) => e.id === rf.id)!;
          expect(rf.source).toBe(edge.source);
          expect(rf.target).toBe(edge.target);
          const from = canvas.nodes.find((n) => n.id === edge.source)!;
          const to = canvas.nodes.find((n) => n.id === edge.target)!;
          const sides = resolveEdgeSides(edge, from.position, to.position);
          expect(rf.sourceHandle).toBe(`source-${sides.sourceSide}`);
          expect(rf.targetHandle).toBe(`target-${sides.targetSide}`);
          expect(rf.data?.color).toBe(EDGE_COLOR_BY_TYPE[types.get(edge.source)!]);
          expect(rf.data?.dashed).toBe(types.get(edge.target) === 'question');
        }
      }),
      { numRuns: 100 },
    );
  });

  test('relayoutEdges re-routes automatic ends of a dragged card and leaves pinned ends and other edges alone', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const node = (id: string, x: number) => ({
      id, title: '', body: '', images: [], type: 'topic' as const, position: { x, y: 0 },
      collapsed: false, createdAt: ts, updatedAt: ts,
    });
    const [a, b, c] = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c'];
    const canvas = {
      id: '00000000-0000-4000-8000-000000000010', title: '', updatedAt: ts,
      nodes: [node(a, 0), node(b, 500), node(c, 1000)],
      edges: [
        { id: '30000000-0000-4000-8000-000000000001', source: a, target: b, sourceSide: 'right' as const, targetSide: 'left' as const, sourcePinned: false, targetPinned: false },
        { id: '30000000-0000-4000-8000-000000000002', source: a, target: b, sourceSide: 'top' as const, targetSide: 'top' as const, sourcePinned: true, targetPinned: true },
        { id: '30000000-0000-4000-8000-000000000003', source: b, target: c, sourceSide: 'right' as const, targetSide: 'left' as const, sourcePinned: false, targetPinned: false },
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
