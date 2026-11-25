/**
 * Workspace state kept in the canvas blob (M0 plan D10): the answer to the
 * new-project intake and the stage the workspace opens on.
 *
 * It sits outside undo history and is optional: projects that never ran the
 * intake have none. Stage progress is derived from the graph, never stored.
 */

import { z } from 'zod';

import { stageIdSchema } from './stages';

/** The intake answers, one per row of the D10 intake table. */
export const INTAKE_ANSWERS = [
  'no-topic',
  'has-topic',
  'objectives-drafted',
  'collected-data',
  'writing-up',
] as const;

export const intakeAnswerSchema = z.enum(INTAKE_ANSWERS);

export const workspaceSchema = z.object({
  intake: z
    .object({
      answer: intakeAnswerSchema,
      answeredAt: z.string().datetime(),
    })
    .optional(),
  focusStage: stageIdSchema.optional(),
});

export type IntakeAnswer = z.infer<typeof intakeAnswerSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
