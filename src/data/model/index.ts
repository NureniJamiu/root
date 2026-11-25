/**
 * The M0 typed-graph contract: node types, relations, provenance, stages and
 * the rule-engine types. See `README.md` in this folder.
 */
export { NODE_FAMILIES, NODE_TYPE_IDS, NODE_TYPES, fieldsSchemaFor, nodeTypeIdSchema } from './nodeTypes';
export type { NodeFamilyId, NodeFields, NodeTypeDefinition, NodeTypeId } from './nodeTypes';
export {
  FALLBACK_RELATION,
  RELATION_IDS,
  RELATIONS,
  defaultRelation,
  isRelationAllowed,
  orient,
  relationDirection,
  relationIdSchema,
} from './relations';
export type {
  OrientableEdge,
  OrientedEdge,
  RelationDefinition,
  RelationEndpoint,
  RelationId,
  RelationPair,
} from './relations';
export {
  aiFeatureSchema,
  aiOriginSchema,
  aiProvenance,
  markEdited,
  provenanceSchema,
  researcherProvenance,
  unrecordedProvenance,
} from './provenance';
export type { AiOrigin, Provenance, ProvenanceOrigin } from './provenance';
export { STAGE_IDS, STAGES, stageIdSchema } from './stages';
export type { StageId } from './stages';
export { RULE_IDS } from './rules';
export type { GraphView, Issue, Rule, RuleId } from './rules';
