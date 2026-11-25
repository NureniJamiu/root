/**
 * Which parts of the contract the app exposes today.
 *
 * The registry and the validity map define the full M0 vocabulary, but the
 * canvas schema only accepts what is listed here, so a node or edge cannot use
 * a type or relation the interface does not show yet. The problem-framing
 * types arrive with the type picker (plan slice S4) and the other relations
 * with the relation picker (S5); each is enabled by adding its id below.
 */

import type { NodeTypeId } from './nodeTypes';
import type { RelationId } from './relations';

/** Node types a canvas may hold. The order is the order of the old type enum. */
export const ENABLED_NODE_TYPE_IDS = ['topic', 'finding', 'question', 'conclusion'] as const satisfies readonly [
  NodeTypeId,
  ...NodeTypeId[],
];

/** Relations an edge may carry. */
export const ENABLED_RELATION_IDS = ['related-to'] as const satisfies readonly [RelationId, ...RelationId[]];

export type EnabledNodeTypeId = (typeof ENABLED_NODE_TYPE_IDS)[number];
export type EnabledRelationId = (typeof ENABLED_RELATION_IDS)[number];
