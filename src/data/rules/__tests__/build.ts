/**
 * Test canvases from short names. A card name is a type prefix and a number
 * (`c1`, `rq2`, `o1`); an edge is `'source>target'` with an optional
 * `:relation` (default `related-to`), e.g. `'rq1>o1:addresses'`.
 */

import type { RelationId } from '../../model/relations';
import type { Canvas, Edge, Node, NodeType } from '../../types';

const PREFIXES: ReadonlyArray<readonly [string, NodeType]> = [
  // Longest first, so `rq` wins over `r`-less prefixes and `h` stays hypothesis.
  ['rq', 'research-question'],
  ['p', 'problem'],
  ['o', 'objective'],
  ['h', 'hypothesis'],
  ['v', 'variable'],
  ['t', 'topic'],
  ['f', 'finding'],
  ['q', 'question'],
  ['c', 'conclusion'],
];

const TS = '2024-01-01T00:00:00.000Z';

function typeOf(name: string): NodeType {
  const hit = PREFIXES.find(([prefix]) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)));
  if (!hit) throw new Error(`unknown card name ${name}`);
  return hit[1];
}

export function build(cards: string[], edges: string[]): { c: Canvas; id: (name: string) => string; edgeId: (i: number) => string } {
  const ids = new Map(cards.map((name, i) => [name, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`]));
  const id = (name: string): string => {
    const found = ids.get(name);
    if (!found) throw new Error(`no card ${name}`);
    return found;
  };
  const edgeId = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const nodes: Node[] = cards.map((name) => ({
    id: id(name), title: name, body: '', images: [], type: typeOf(name), position: { x: 0, y: 0 },
    collapsed: false, createdAt: TS, updatedAt: TS, fields: {}, provenance: { origin: 'researcher' as const, edited: false },
  }) as Node);
  const es: Edge[] = edges.map((spec, i) => {
    const [ends, relation = 'related-to'] = spec.split(':') as [string, string | undefined];
    const [s, t] = ends.split('>') as [string, string];
    return {
      id: edgeId(i),
      source: id(s), target: id(t), sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false,
      relationType: relation as RelationId, provenance: { origin: 'researcher' as const, edited: false },
    };
  });
  return { c: { id: '20000000-0000-4000-8000-000000000000', schemaVersion: 2, title: '', nodes, edges: es, updatedAt: TS }, id, edgeId };
}
