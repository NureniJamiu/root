/**
 * The node-type registry: the single source of truth for what kinds of idea a
 * canvas can hold (M0 plan D2, D3).
 *
 * One entry per type. Everything else (the type enum, per-type `fields`
 * validation, the type picker, card labels and styles, the AI types guide)
 * derives from these entries, so adding a type means adding one entry and its
 * field schema here.
 *
 * Every per-type field is optional: unset means "not yet specified", never a
 * default value. The four general types keep the ids they had before M0
 * (D1), so old canvases migrate as an identity mapping.
 */

import { z } from 'zod';

import type { AiFeature } from '../../lib/ai/plans';
import type { StageId } from './stages';

/** Type families, in the order a picker lists them. */
export const NODE_FAMILIES = {
  general: { label: 'General' },
  framing: { label: 'Problem framing' },
} as const satisfies Record<string, { readonly label: string }>;

export type NodeFamilyId = keyof typeof NODE_FAMILIES;

export interface NodeTypeDefinition {
  readonly id: string;
  /** Shown on the card and in the type picker. */
  readonly label: string;
  readonly family: NodeFamilyId;
  /** The stages of the research journey this type belongs to. */
  readonly stages: readonly StageId[];
  /** The type's own fields, stored in `node.fields`. Every key optional. */
  readonly fields: z.AnyZodObject;
  /** One line describing the type, used to build AI prompts. */
  readonly aiGuide: string;
  /** The AI features that may propose an idea of this type. */
  readonly ai: readonly AiFeature[];
}

/** AI features that propose general ideas today. */
const GENERAL_AI: readonly AiFeature[] = ['ai.map', 'ai.expand', 'ai.capture', 'ai.tidy'];

/** Problem-framing types come only from captured text, as ghost cards (D9). */
const FRAMING_AI: readonly AiFeature[] = ['ai.capture'];

const noFields = z.object({});

export const NODE_TYPES = {
  /* ----- General (the four pre-M0 types, ids unchanged) ------------------ */
  topic: {
    id: 'topic',
    label: 'Topic',
    family: 'general',
    stages: ['topic'],
    fields: noFields,
    aiGuide: 'a subject or theme that organises other ideas',
    ai: GENERAL_AI,
  },
  question: {
    id: 'question',
    label: 'Question',
    family: 'general',
    stages: ['topic', 'literature'],
    fields: noFields,
    aiGuide: 'an open question worth investigating',
    ai: [...GENERAL_AI, 'ai.research'],
  },
  finding: {
    id: 'finding',
    label: 'Finding',
    family: 'general',
    stages: ['literature', 'data', 'interpretation'],
    // Keeps the node-level `source` citation; no fields of its own in M0.
    fields: noFields,
    aiGuide: 'something learned, observed or supported by evidence',
    ai: [...GENERAL_AI, 'ai.research'],
  },
  conclusion: {
    id: 'conclusion',
    label: 'Conclusion',
    family: 'general',
    stages: ['interpretation'],
    fields: noFields,
    aiGuide: 'a judgement drawn from findings',
    ai: GENERAL_AI,
  },

  /* ----- Problem framing ------------------------------------------------- */
  problem: {
    id: 'problem',
    label: 'Problem statement',
    family: 'framing',
    stages: ['problem'],
    fields: noFields,
    aiGuide: 'the gap, difficulty or need the research responds to',
    ai: FRAMING_AI,
  },
  objective: {
    id: 'objective',
    label: 'Objective',
    family: 'framing',
    stages: ['problem'],
    fields: z.object({
      scope: z.enum(['general', 'specific']).optional(),
    }),
    aiGuide: 'what the research sets out to achieve, either the general aim or a specific objective',
    ai: FRAMING_AI,
  },
  'research-question': {
    id: 'research-question',
    label: 'Research question',
    family: 'framing',
    stages: ['problem'],
    fields: noFields,
    aiGuide: 'a formal question the study is designed to answer',
    ai: FRAMING_AI,
  },
  hypothesis: {
    id: 'hypothesis',
    label: 'Hypothesis',
    family: 'framing',
    stages: ['problem'],
    fields: z.object({
      form: z.enum(['null', 'alternative']).optional(),
      direction: z.enum(['directional', 'non-directional']).optional(),
    }),
    aiGuide: 'a testable prediction about how variables relate',
    ai: FRAMING_AI,
  },
  variable: {
    id: 'variable',
    label: 'Variable',
    family: 'framing',
    stages: ['problem', 'methodology'],
    fields: z.object({
      role: z.enum(['independent', 'dependent', 'control', 'moderator', 'mediator', 'other']).optional(),
      // Included now because M2's analysis-compatibility rules depend on it.
      measurementLevel: z.enum(['nominal', 'ordinal', 'interval', 'ratio']).optional(),
    }),
    aiGuide: 'a characteristic the study measures, manipulates or controls',
    ai: FRAMING_AI,
  },
} as const satisfies Record<string, NodeTypeDefinition>;

export type NodeTypeId = keyof typeof NODE_TYPES;

/** Every type id, in registry order (general family first). */
export const NODE_TYPE_IDS = Object.keys(NODE_TYPES) as [NodeTypeId, ...NodeTypeId[]];

/** Parses a type id against the full registry. */
export const nodeTypeIdSchema = z.enum(NODE_TYPE_IDS);

/** The shape of `node.fields` for a given type. */
export type NodeFields<T extends NodeTypeId> = z.infer<(typeof NODE_TYPES)[T]['fields']>;

/** The schema that validates `node.fields` for a given type. */
export function fieldsSchemaFor<T extends NodeTypeId>(type: T): (typeof NODE_TYPES)[T]['fields'] {
  return NODE_TYPES[type].fields;
}
