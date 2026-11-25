/**
 * Provenance: where a node or edge came from (M0 plan D6, principle 0.1).
 *
 * Required on every node and edge. The union is discriminated on `origin`, so
 * later milestones add a basis (M1: `extracted`, with a passage anchor) as one
 * new member. The mutators stamp provenance through the constructors below;
 * feature code never builds it by hand.
 *
 * In M0 provenance is asserted by the client. The server checks its shape but
 * cannot verify it (server-side stamping arrives with M5).
 */

import { z } from 'zod';

import { FEATURES } from '../../lib/ai/plans';
import type { AiFeature } from '../../lib/ai/plans';
import { PROVENANCE_MODEL_MAX } from '../limits';

const AI_FEATURES: readonly string[] = FEATURES.filter((f) => f.startsWith('ai.'));

export const aiFeatureSchema = z.custom<AiFeature>(
  (v) => typeof v === 'string' && AI_FEATURES.includes(v),
  { message: 'unknown AI feature' },
);

/** What an AI-originated item records about the suggestion it came from. */
export const aiOriginSchema = z.object({
  feature: aiFeatureSchema,
  /** The model label shown to the person when they accepted. */
  model: z.string().min(1).max(PROVENANCE_MODEL_MAX),
  acceptedAt: z.string().datetime(),
});

/**
 * `edited` turns true once the researcher edits something that originated
 * with AI (the 9f ownership rule). It stays false for every other origin.
 */
const edited = z.boolean();

export const provenanceSchema = z.discriminatedUnion('origin', [
  /** Made by the researcher in the app. */
  z.object({ origin: z.literal('researcher'), edited }),
  /** Proposed by an AI feature and accepted by the researcher. */
  z.object({ origin: z.literal('ai'), ai: aiOriginSchema, edited }),
  /** Brought in from outside the app. */
  z.object({ origin: z.literal('import'), edited }),
  /** Saved before provenance was recorded; who made it is not known. */
  z.object({ origin: z.literal('unrecorded'), edited }),
]);

export type Provenance = z.infer<typeof provenanceSchema>;
export type ProvenanceOrigin = Provenance['origin'];
export type AiOrigin = z.infer<typeof aiOriginSchema>;

export function researcherProvenance(): Provenance {
  return { origin: 'researcher', edited: false };
}

export function unrecordedProvenance(): Provenance {
  return { origin: 'unrecorded', edited: false };
}

export function aiProvenance(ai: AiOrigin): Provenance {
  return { origin: 'ai', ai: { ...ai }, edited: false };
}

/** The provenance after a researcher edit: AI items become `edited`, others are unchanged. */
export function markEdited(p: Provenance): Provenance {
  return p.origin === 'ai' && !p.edited ? { ...p, edited: true } : p;
}
