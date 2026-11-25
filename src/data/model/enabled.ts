/**
 * Which parts of the contract the app exposes today.
 *
 * The registry and the validity map define the full M0 vocabulary, but the
 * canvas schema only accepts what is listed here, so a node or edge cannot use
 * a type or relation the interface does not show yet. The other relations
 * arrive with the relation picker (plan slice S5); each is enabled by adding
 * its id below.
 */
import { NODE_FAMILIES, NODE_TYPES } from './nodeTypes';
import type { NodeFamilyId, NodeTypeId } from './nodeTypes';
import type { RelationId } from './relations';

/**
 * Node types a canvas may hold, in picker order within each family. The
 * general types keep the order of the old type enum.
 */
export const ENABLED_NODE_TYPE_IDS = [
  'topic',
  'finding',
  'question',
  'conclusion',
  'problem',
  'objective',
  'research-question',
  'hypothesis',
  'variable',
] as const satisfies readonly [NodeTypeId, ...NodeTypeId[]];

/** Relations an edge may carry. */
export const ENABLED_RELATION_IDS = ['related-to'] as const satisfies readonly [RelationId, ...RelationId[]];

export type EnabledNodeTypeId = (typeof ENABLED_NODE_TYPE_IDS)[number];
export type EnabledRelationId = (typeof ENABLED_RELATION_IDS)[number];

/** The enabled types of each family, families in picker order (general first). */
export const ENABLED_TYPES_BY_FAMILY: ReadonlyArray<{
  readonly family: NodeFamilyId;
  readonly label: string;
  readonly types: readonly EnabledNodeTypeId[];
}> = (Object.keys(NODE_FAMILIES) as NodeFamilyId[])
  .map((family) => ({
    family,
    label: NODE_FAMILIES[family].label,
    types: ENABLED_NODE_TYPE_IDS.filter((t) => NODE_TYPES[t].family === family),
  }))
  .filter((group) => group.types.length > 0);

/** The enabled types that share `type`'s family, in picker order. */
export function familyTypes(type: EnabledNodeTypeId): readonly EnabledNodeTypeId[] {
  return ENABLED_TYPES_BY_FAMILY.find((g) => g.family === NODE_TYPES[type].family)?.types ?? [type];
}
