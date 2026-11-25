/**
 * What the AI may say about a canvas, derived from the node-type registry and
 * the relation validity map (M0 plan D9), so prompts, output schemas and the
 * clean-up of answers can never drift from the model the canvas uses.
 *
 * Pure: no SDKs, no React.
 */

import { ENABLED_NODE_TYPE_IDS } from '../../data/model/enabled';
import type { EnabledNodeTypeId } from '../../data/model/enabled';
import { NODE_TYPES } from '../../data/model/nodeTypes';
import { FALLBACK_RELATION, RELATIONS, RELATION_IDS, isRelationAllowed } from '../../data/model/relations';
import type { RelationDefinition, RelationId } from '../../data/model/relations';
import type { AiFeature } from './plans';

/** The enabled types `feature` may propose, in picker order. */
export function typesFor(feature: AiFeature): [EnabledNodeTypeId, ...EnabledNodeTypeId[]] {
  const types = ENABLED_NODE_TYPE_IDS.filter((t) => (NODE_TYPES[t].ai as readonly AiFeature[]).includes(feature));
  if (types.length === 0) throw new Error(`no node type may be proposed by ${feature}`);
  return types as [EnabledNodeTypeId, ...EnabledNodeTypeId[]];
}

/** The prompt lines that explain `types`, one per type, in the order given. */
export function typesGuide(types: readonly EnabledNodeTypeId[]): string {
  return ['Each idea has a type:', ...types.map((t) => `- ${t}: ${NODE_TYPES[t].aiGuide}`)].join('\n');
}

/** "a finding", "an objective". */
function aType(type: string): string {
  return `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
}

/**
 * The typed relations (not `related-to`) that join two of `types`, each with
 * the pairs it allows among them as "subject → object".
 */
export function relationsAmong(types: readonly EnabledNodeTypeId[]): Array<{ id: RelationId; pairs: string[] }> {
  const set = new Set<string>(types);
  const out: Array<{ id: RelationId; pairs: string[] }> = [];
  for (const id of RELATION_IDS) {
    if (id === FALLBACK_RELATION) continue;
    const pairs = (RELATIONS[id] as RelationDefinition).pairs
      .filter((p) => set.has(p.subject) && set.has(p.object))
      .map((p) => `${aType(p.subject)} ${(RELATIONS[id] as RelationDefinition).label.forward} ${aType(p.object)}`);
    if (pairs.length > 0) out.push({ id, pairs });
  }
  return out;
}

/**
 * The prompt lines that explain the `relation` field of a suggestion: the
 * typed relations among `types`, and null for everything else.
 */
export function relationsGuide(types: readonly EnabledNodeTypeId[]): string {
  const lines = relationsAmong(types).map(({ id, pairs }) => `- ${id}: ${pairs.join('; ')}`);
  return [
    'Each idea may say how it connects to its parent with a relation, read in either direction:',
    ...lines,
    'Set relation to null when none of these fits exactly; the connector is then a plain link. Never force a relation.',
  ].join('\n');
}

/**
 * The relation a suggestion keeps for the connector from a `parentType` card
 * to a `childType` card: `relation` when the map allows it between them and
 * it says more than `related-to`, otherwise null (a plain link).
 */
export function keptRelation(
  relation: RelationId | null | undefined,
  parentType: EnabledNodeTypeId | undefined,
  childType: EnabledNodeTypeId,
): RelationId | null {
  if (relation == null || relation === FALLBACK_RELATION || parentType === undefined) return null;
  return isRelationAllowed(relation, parentType, childType) ? relation : null;
}
