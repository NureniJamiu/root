/**
 * Lookups the rules share, built once per graph (graphs are immutable).
 *
 * Connectors count in both directions: what matters is that two cards are
 * joined, not which one the line was dragged from. Connectors whose ends are
 * not on the graph are ignored.
 */

import type { NodeTypeId } from '../model/nodeTypes';
import type { GraphView } from '../model/rules';
import type { UUID } from '../types';

export interface GraphIndex {
  readonly typeOf: (id: UUID) => NodeTypeId | undefined;
  /** The cards joined to `id`, once per connector. */
  readonly near: (id: UUID) => readonly UUID[];
  /** Ids reachable from `start` (not including it) while `through` allows passing a card. */
  readonly reach: (start: UUID, through: (id: UUID) => boolean) => Set<UUID>;
}

const cache = new WeakMap<GraphView, GraphIndex>();

export function indexGraph(g: GraphView): GraphIndex {
  const cached = cache.get(g);
  if (cached) return cached;

  const types = new Map<UUID, NodeTypeId>(g.nodes.map((n) => [n.id, n.type]));
  const neighbours = new Map<UUID, UUID[]>();
  for (const e of g.edges) {
    if (!types.has(e.source) || !types.has(e.target)) continue;
    (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(e.target);
    (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(e.source);
  }
  const typeOf = (id: UUID) => types.get(id);
  const near = (id: UUID): readonly UUID[] => neighbours.get(id) ?? [];

  const reach = (start: UUID, through: (id: UUID) => boolean): Set<UUID> => {
    const seen = new Set<UUID>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as UUID;
      if (current !== start && !through(current)) continue;
      for (const next of near(current)) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    seen.delete(start);
    return seen;
  };

  const index: GraphIndex = { typeOf, near, reach };
  cache.set(g, index);
  return index;
}
