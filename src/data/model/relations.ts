/**
 * The relation validity map v0: what a connector can mean, and between which
 * node types (M0 plan D4, D5).
 *
 * Each relation lists the type pairs it allows as subject → object. `any`
 * matches every type. A pair marked `symmetric` reads the same both ways.
 *
 * Rules the map follows (tests enforce them):
 *   - For two different types, a relation lists a pair in only one
 *     orientation, so the semantic direction of an edge can always be read
 *     from its endpoint types (`orient`). For two cards of the same type the
 *     stored direction (source → target) is the semantic direction.
 *   - Each pair of types has at most one default relation, used when a
 *     connector is drawn. Pairs without one fall back to `related-to`.
 *
 * Validity is a rule, not a parse invariant: parsing only checks that
 * `relationType` is a known id. An edge whose relation does not fit its
 * endpoints is flagged by the `relation-invalid` rule, never deleted.
 */

import { z } from 'zod';

import type { UUID } from '../types';
import type { NodeTypeId } from './nodeTypes';

/** One end of an allowed pair: a node type, or `any` type. */
export type RelationEndpoint = NodeTypeId | 'any';

export interface RelationPair {
  readonly subject: RelationEndpoint;
  readonly object: RelationEndpoint;
  /** The relation a new connector between these types starts with. */
  readonly default?: true;
  /** The pair reads the same in both directions. */
  readonly symmetric?: true;
}

export interface RelationDefinition {
  readonly id: string;
  /** Read subject → object (`forward`) or object → subject (`reverse`). */
  readonly label: { readonly forward: string; readonly reverse: string };
  readonly pairs: readonly RelationPair[];
}

export const RELATIONS = {
  'related-to': {
    id: 'related-to',
    label: { forward: 'related to', reverse: 'related to' },
    pairs: [{ subject: 'any', object: 'any', symmetric: true }],
  },
  addresses: {
    id: 'addresses',
    label: { forward: 'addresses', reverse: 'addressed by' },
    pairs: [
      { subject: 'objective', object: 'problem', default: true },
      { subject: 'research-question', object: 'objective', default: true },
      { subject: 'hypothesis', object: 'research-question', default: true },
    ],
  },
  refines: {
    id: 'refines',
    label: { forward: 'refines', reverse: 'refined by' },
    pairs: [
      { subject: 'objective', object: 'objective', default: true },
      { subject: 'research-question', object: 'research-question', default: true },
    ],
  },
  involves: {
    id: 'involves',
    label: { forward: 'involves', reverse: 'involved in' },
    pairs: [
      { subject: 'research-question', object: 'variable', default: true },
      { subject: 'hypothesis', object: 'variable', default: true },
      { subject: 'objective', object: 'variable', default: true },
    ],
  },
  answers: {
    id: 'answers',
    label: { forward: 'answers', reverse: 'answered by' },
    pairs: [
      { subject: 'finding', object: 'question', default: true },
      { subject: 'finding', object: 'research-question', default: true },
    ],
  },
  supports: {
    id: 'supports',
    label: { forward: 'supports', reverse: 'supported by' },
    pairs: [
      { subject: 'finding', object: 'conclusion', default: true },
      { subject: 'finding', object: 'hypothesis', default: true },
    ],
  },
  contradicts: {
    id: 'contradicts',
    label: { forward: 'contradicts', reverse: 'contradicted by' },
    pairs: [
      { subject: 'finding', object: 'conclusion' },
      { subject: 'finding', object: 'hypothesis' },
      { subject: 'finding', object: 'finding', symmetric: true },
    ],
  },
} as const satisfies Record<string, RelationDefinition>;

export type RelationId = keyof typeof RELATIONS;

/** Every relation id, in map order. */
export const RELATION_IDS = Object.keys(RELATIONS) as [RelationId, ...RelationId[]];

/** Parses a relation id. Says nothing about whether it fits its endpoints. */
export const relationIdSchema = z.enum(RELATION_IDS);

/** The relation every pair of types allows, and the one old edges migrate to. */
export const FALLBACK_RELATION = 'related-to' satisfies RelationId;

function matches(end: RelationEndpoint, type: NodeTypeId): boolean {
  return end === 'any' || end === type;
}

function pairs(relation: RelationId): readonly RelationPair[] {
  return (RELATIONS[relation] as RelationDefinition).pairs;
}

/**
 * Which way `relation` reads for a connector drawn from a `sourceType` card
 * to a `targetType` card: `forward` when the source is the subject, `reverse`
 * when the target is, `null` when the map does not allow it for these types.
 * Same-type and symmetric pairs always read `forward` (stored direction).
 */
export function relationDirection(
  relation: RelationId,
  sourceType: NodeTypeId,
  targetType: NodeTypeId,
): 'forward' | 'reverse' | null {
  const list = pairs(relation);
  if (list.some((p) => matches(p.subject, sourceType) && matches(p.object, targetType))) return 'forward';
  if (list.some((p) => matches(p.subject, targetType) && matches(p.object, sourceType))) return 'reverse';
  return null;
}

/** Whether the map allows `relation` between cards of these two types, either way round. */
export function isRelationAllowed(relation: RelationId, sourceType: NodeTypeId, targetType: NodeTypeId): boolean {
  return relationDirection(relation, sourceType, targetType) !== null;
}

/**
 * The label of `relation` read from the drawn source to the drawn target:
 * the reverse label when the target is the subject ("supported by"), the
 * forward label otherwise, including when the relation does not fit.
 */
export function relationLabel(relation: RelationId, sourceType: NodeTypeId, targetType: NodeTypeId): string {
  const { label } = RELATIONS[relation] as RelationDefinition;
  return relationDirection(relation, sourceType, targetType) === 'reverse' ? label.reverse : label.forward;
}

/** The relations the map allows between cards of these two types, in map order. */
export function allowedRelations(sourceType: NodeTypeId, targetType: NodeTypeId): RelationId[] {
  return RELATION_IDS.filter((id) => isRelationAllowed(id, sourceType, targetType));
}

/** The relation a new connector between these two types starts with. */
export function defaultRelation(sourceType: NodeTypeId, targetType: NodeTypeId): RelationId {
  for (const id of RELATION_IDS) {
    const fits = pairs(id).some(
      (p) =>
        p.default === true &&
        ((matches(p.subject, sourceType) && matches(p.object, targetType)) ||
          (matches(p.subject, targetType) && matches(p.object, sourceType))),
    );
    if (fits) return id;
  }
  return FALLBACK_RELATION;
}

/** The edge fields `orient` reads. */
export interface OrientableEdge {
  readonly source: UUID;
  readonly target: UUID;
  readonly relationType: RelationId;
}

/** An edge read in its semantic direction. */
export interface OrientedEdge {
  readonly subject: UUID;
  readonly object: UUID;
  /** The subject is the drawn target, so the edge reads with its reverse label. */
  readonly reversed: boolean;
}

/**
 * Read an edge in its semantic direction. The drawn geometry (`source`,
 * `target`) is untouched; the subject and object come from the map. Returns
 * `null` when an endpoint is unknown or the relation does not fit the
 * endpoint types (the `relation-invalid` case).
 */
export function orient(edge: OrientableEdge, typeOf: (id: UUID) => NodeTypeId | undefined): OrientedEdge | null {
  const sourceType = typeOf(edge.source);
  const targetType = typeOf(edge.target);
  if (sourceType === undefined || targetType === undefined) return null;
  const direction = relationDirection(edge.relationType, sourceType, targetType);
  if (direction === null) return null;
  return direction === 'forward'
    ? { subject: edge.source, object: edge.target, reversed: false }
    : { subject: edge.target, object: edge.source, reversed: true };
}
