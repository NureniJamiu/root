/**
 * Lookups the rules share, built once per graph (graphs are immutable).
 *
 * Two views of the connectors:
 *   - **Joins** (`near`, `backing`): connectors count in both directions,
 *     because for evidence what matters is that two cards are joined, not
 *     which one the line was dragged from. `backing` leaves out `contradicts`
 *     connectors: a finding that contradicts a conclusion is part of the
 *     argument, but it does not back it.
 *   - **Meanings** (`objectsOf`, `subjectsOf`): connectors read in their
 *     semantic direction (`orient`), by relation. A connector whose relation
 *     does not fit its endpoint types has no meaning here; the
 *     `relation-invalid` rule reports it.
 *
 * Connectors whose ends are not on the graph are ignored. A connector with
 * no known relation (a raw v1 graph, before migration) reads as `related-to`,
 * the relation the v1 → v2 migration gives it.
 */

import type { NodeTypeId } from '../model/nodeTypes';
import { FALLBACK_RELATION, RELATIONS, orient } from '../model/relations';
import type { RelationId } from '../model/relations';
import type { GraphView } from '../model/rules';
import type { UUID } from '../types';

/** Relations that join two cards without one backing the other. */
const NOT_BACKING: ReadonlySet<RelationId> = new Set<RelationId>(['contradicts']);

/** The relation a rule reads for a connector: its own when known, `related-to` otherwise. */
export function relationOf(edge: { readonly relationType?: RelationId | undefined }): RelationId {
  const r = edge.relationType;
  return r !== undefined && Object.hasOwn(RELATIONS, r) ? r : FALLBACK_RELATION;
}

export interface GraphIndex {
  readonly typeOf: (id: UUID) => NodeTypeId | undefined;
  /** The cards joined to `id`, once per connector, whatever the relation. */
  readonly near: (id: UUID) => readonly UUID[];
  /** The cards joined to `id` by a connector that can carry evidence (not `contradicts`). */
  readonly backing: (id: UUID) => readonly UUID[];
  /**
   * Ids reachable from `start` (not including it) while `through` allows
   * passing a card, stepping along `via` (default `near`).
   */
  readonly reach: (
    start: UUID,
    through: (id: UUID) => boolean,
    via?: (id: UUID) => readonly UUID[],
  ) => Set<UUID>;
  /** The objects of `relation` connectors whose subject is `id`. */
  readonly objectsOf: (id: UUID, relation: RelationId) => readonly UUID[];
  /** The subjects of `relation` connectors whose object is `id`. */
  readonly subjectsOf: (id: UUID, relation: RelationId) => readonly UUID[];
}

const cache = new WeakMap<GraphView, GraphIndex>();

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  (map.get(key) ?? map.set(key, []).get(key)!).push(value);
}

const NONE: readonly UUID[] = [];

export function indexGraph(g: GraphView): GraphIndex {
  const cached = cache.get(g);
  if (cached) return cached;

  const types = new Map<UUID, NodeTypeId>(g.nodes.map((n) => [n.id, n.type]));
  const typeOf = (id: UUID) => types.get(id);
  const neighbours = new Map<UUID, UUID[]>();
  const backers = new Map<UUID, UUID[]>();
  const objects = new Map<string, UUID[]>();
  const subjects = new Map<string, UUID[]>();
  const key = (id: UUID, relation: RelationId) => `${relation}:${id}`;

  for (const e of g.edges) {
    if (!types.has(e.source) || !types.has(e.target)) continue;
    push(neighbours, e.source, e.target);
    push(neighbours, e.target, e.source);
    const relationType = relationOf(e);
    if (!NOT_BACKING.has(relationType)) {
      push(backers, e.source, e.target);
      push(backers, e.target, e.source);
    }
    const o = orient({ source: e.source, target: e.target, relationType }, typeOf);
    if (o === null) continue;
    push(objects, key(o.subject, relationType), o.object);
    push(subjects, key(o.object, relationType), o.subject);
  }

  const near = (id: UUID): readonly UUID[] => neighbours.get(id) ?? NONE;
  const backing = (id: UUID): readonly UUID[] => backers.get(id) ?? NONE;

  const reach = (start: UUID, through: (id: UUID) => boolean, via: (id: UUID) => readonly UUID[] = near): Set<UUID> => {
    const seen = new Set<UUID>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as UUID;
      if (current !== start && !through(current)) continue;
      for (const next of via(current)) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    seen.delete(start);
    return seen;
  };

  const index: GraphIndex = {
    typeOf,
    near,
    backing,
    reach,
    objectsOf: (id, relation) => objects.get(key(id, relation)) ?? NONE,
    subjectsOf: (id, relation) => subjects.get(key(id, relation)) ?? NONE,
  };
  cache.set(g, index);
  return index;
}
