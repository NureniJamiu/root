/**
 * The `relation-invalid` rule (M0 plan D4): a connector whose relation the
 * validity map does not allow between its two cards, typically after one of
 * them was retyped. The connector is flagged, never deleted or changed.
 *
 * One issue per card the connectors were drawn from, naming that card first,
 * then the cards at the other ends, with the connectors in `edgeIds`.
 * Connectors without ids (prompt canvases) are still counted.
 */

import { isRelationAllowed } from '../model/relations';
import type { GraphView, Issue, Rule } from '../model/rules';
import type { UUID } from '../types';
import { indexGraph, relationOf } from './graph';

const RELATION_INVALID = { id: 'relation-invalid', version: 1 } as const;

export const relationInvalid: Rule = {
  ...RELATION_INVALID,
  run(g: GraphView): Issue[] {
    const { typeOf } = indexGraph(g);
    const bySource = new Map<UUID, { targets: UUID[]; edgeIds: UUID[]; count: number }>();
    for (const e of g.edges) {
      const from = typeOf(e.source);
      const to = typeOf(e.target);
      if (from === undefined || to === undefined || isRelationAllowed(relationOf(e), from, to)) continue;
      const entry = bySource.get(e.source) ?? bySource.set(e.source, { targets: [], edgeIds: [], count: 0 }).get(e.source)!;
      entry.count += 1;
      if (!entry.targets.includes(e.target)) entry.targets.push(e.target);
      if (e.id !== undefined) entry.edgeIds.push(e.id);
    }
    return g.nodes.flatMap((n) => {
      const entry = bySource.get(n.id);
      if (!entry) return [];
      const one = entry.count === 1;
      return [
        {
          ruleId: RELATION_INVALID.id,
          ruleVersion: RELATION_INVALID.version,
          nodeIds: [n.id, ...entry.targets],
          edgeIds: entry.edgeIds,
          label: one ? "Connector doesn't fit" : `${entry.count} connectors don't fit`,
          hint: one
            ? 'The relation on a connector from this card does not fit the cards it joins. Select the connector and pick another relation.'
            : 'The relations on some connectors from this card do not fit the cards they join. Select each one and pick another relation.',
        },
      ];
    });
  },
};
