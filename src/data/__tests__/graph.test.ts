/**
 * Graph utilities: downstream sets, collapse visibility, facing sides.
 *
 * Property checks run on canvases built by random mutator sequences (which can
 * contain diamonds and cycles); hand-built canvases pin the cases that matter.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import {
  computeFacingSides,
  descendantCount,
  downstreamIds,
  exclusiveDownstreamIds,
  incomingIndex,
  isDuplicateEdge,
  subtreeIds,
  visibleNodeIds,
} from '../graph';
import type { Canvas, Edge, Node } from '../types';

import { arbCanvas, arbNodeId } from './arbitraries';

const TS = '2024-01-01T00:00:00.000Z';

/** Cards named by letter; edges given as 'ab' = a -> b (right to left). */
function build(letters: string, edges: string[], collapsed: string[] = []): { c: Canvas; id: (l: string) => string } {
  const ids = new Map(letters.split('').map((l, i) => [l, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`]));
  const id = (l: string): string => ids.get(l)!;
  const nodes: Node[] = letters.split('').map((l) => ({
    id: id(l), title: l, body: '', images: [], type: 'topic', position: { x: 0, y: 0 },
    collapsed: collapsed.includes(l), createdAt: TS, updatedAt: TS,
  }));
  const es: Edge[] = edges.map((e, i) => ({
    id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    source: id(e[0]!), target: id(e[1]!), sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false,
  }));
  return { c: { id: '20000000-0000-4000-8000-000000000000', title: '', nodes, edges: es, updatedAt: TS }, id };
}

const names = (c: Canvas, set: Set<string>): string => c.nodes.filter((n) => set.has(n.id)).map((n) => n.title).sort().join('');

describe('exclusive downstream / subtree', () => {
  test('a chain hangs entirely from its head', () => {
    const { c, id } = build('abcd', ['ab', 'bc', 'cd']);
    expect(names(c, exclusiveDownstreamIds(c, id('a')))).toBe('bcd');
    expect(names(c, exclusiveDownstreamIds(c, id('b')))).toBe('cd');
    expect(descendantCount(c, id('a'))).toBe(3);
    expect(names(c, subtreeIds(c, id('b')))).toBe('bcd');
  });

  test('a node something else also feeds is not exclusive', () => {
    const { c, id } = build('abcd', ['ab', 'cb', 'bd']); // a->b<-c, b->d
    expect(names(c, exclusiveDownstreamIds(c, id('a')))).toBe('');
    expect(names(c, downstreamIds(c, id('a')))).toBe('bd');
  });

  test('sharing is resolved transitively', () => {
    const { c, id } = build('abcde', ['ab', 'bc', 'bd', 'ed']); // d is also fed by e
    expect(names(c, exclusiveDownstreamIds(c, id('a')))).toBe('bc');
  });

  test('cycles terminate', () => {
    const { c, id } = build('abc', ['ab', 'bc', 'ca']);
    expect(names(c, downstreamIds(c, id('a')))).toBe('bc');
    expect(exclusiveDownstreamIds(c, id('a')).size).toBeGreaterThanOrEqual(0);
  });

  test('unknown id gives empty sets', () => {
    const { c } = build('ab', ['ab']);
    expect(downstreamIds(c, 'nope').size).toBe(0);
    expect(subtreeIds(c, 'nope').size).toBe(0);
    expect(descendantCount(c, 'nope')).toBe(0);
  });

  test('properties on random canvases', () => {
    fc.assert(
      fc.property(
        arbCanvas.filter((c) => c.nodes.length > 0).chain((c) => fc.tuple(fc.constant(c), arbNodeId(c))),
        ([c, id]) => {
          const down = downstreamIds(c, id);
          const excl = exclusiveDownstreamIds(c, id);
          const incoming = incomingIndex(c);
          for (const n of excl) {
            expect(down.has(n)).toBe(true);
            for (const e of incoming.get(n) ?? []) {
              expect(e.source === id || excl.has(e.source)).toBe(true);
            }
          }
          // Maximal: anything left out is fed from outside.
          for (const n of down) {
            if (excl.has(n)) continue;
            expect((incoming.get(n) ?? []).some((e) => e.source !== id && !excl.has(e.source))).toBe(true);
          }
          expect(subtreeIds(c, id).size).toBe(excl.size + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('visibleNodeIds', () => {
  test('everything is visible when nothing is collapsed', () => {
    const { c } = build('abc', ['ab', 'bc']);
    expect(visibleNodeIds(c).size).toBe(3);
  });

  test('collapsing hides what hangs below, but not the collapsed card', () => {
    const { c, id } = build('abcd', ['ab', 'bc', 'cd'], ['b']);
    expect([...visibleNodeIds(c)].sort()).toEqual([id('a'), id('b')].sort());
  });

  test('a card also reachable from an expanded visible card stays visible', () => {
    const { c, id } = build('abcd', ['ab', 'bc', 'ac', 'cd'], ['b']); // a->b->c, a->c, c->d
    expect(visibleNodeIds(c).has(id('c'))).toBe(true);
    expect(visibleNodeIds(c).has(id('d'))).toBe(true);
  });

  test('a card reachable only through a collapsed card stays hidden even if it feeds a visible one', () => {
    const { c, id } = build('abcd', ['ab', 'bc', 'cd'], ['b']);
    expect(visibleNodeIds(c).has(id('c'))).toBe(false);
    expect(visibleNodeIds(c).has(id('d'))).toBe(false);
  });

  test('a collapsed card inside a cycle stays visible', () => {
    const { c, id } = build('ab', ['ab', 'ba'], ['a']);
    expect(visibleNodeIds(c).has(id('a'))).toBe(true);
  });

  test('definition holds on random canvases', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const visible = visibleNodeIds(c);
        const incoming = incomingIndex(c);
        const hiddenByCollapse = new Set<string>();
        for (const n of c.nodes) if (n.collapsed) for (const d of downstreamIds(c, n.id)) hiddenByCollapse.add(d);
        const byId = new Map(c.nodes.map((n) => [n.id, n]));

        for (const n of c.nodes) {
          if (!hiddenByCollapse.has(n.id)) {
            expect(visible.has(n.id)).toBe(true);
            continue;
          }
          const supported = (incoming.get(n.id) ?? []).some(
            (e) => visible.has(e.source) && !byId.get(e.source)!.collapsed,
          );
          expect(visible.has(n.id)).toBe(supported);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('computeFacingSides', () => {
  test.each([
    [{ x: 0, y: 0 }, { x: 300, y: 10 }, 'right', 'left'],
    [{ x: 300, y: 0 }, { x: 0, y: 10 }, 'left', 'right'],
    [{ x: 0, y: 0 }, { x: 10, y: 300 }, 'bottom', 'top'],
    [{ x: 0, y: 300 }, { x: 10, y: 0 }, 'top', 'bottom'],
  ] as const)('%j -> %j', (from, to, sourceSide, targetSide) => {
    expect(computeFacingSides(from, to)).toEqual({ sourceSide, targetSide });
  });
});

describe('isDuplicateEdge', () => {
  test('same pair on different sides is not a duplicate; same sides are; ignoring the edge itself', () => {
    const { c } = build('ab', ['ab']);
    const e = c.edges[0]!;
    expect(isDuplicateEdge(c, e)).toBe(true);
    expect(isDuplicateEdge(c, e, e.id)).toBe(false);
    expect(isDuplicateEdge(c, { ...e, sourceSide: 'top' })).toBe(false);
  });
});
