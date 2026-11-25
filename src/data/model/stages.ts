/**
 * The eight stages of the research journey (product-decisions §2).
 *
 * Stages are views over the graph, not steps in a path: a project can be
 * active in several at once. Node types say which stages they belong to (see
 * `nodeTypes.ts`), and stage state is derived from that, never stored.
 */

import { z } from 'zod';

export const STAGES = {
  topic: { order: 1, label: 'Topic discovery & selection' },
  problem: { order: 2, label: 'Problem identification' },
  literature: { order: 3, label: 'Literature discovery & review' },
  framework: { order: 4, label: 'Theoretical & conceptual framework' },
  methodology: { order: 5, label: 'Research methodology' },
  data: { order: 6, label: 'Data collection & analysis' },
  interpretation: { order: 7, label: 'Interpretation & discussion' },
  documentation: { order: 8, label: 'Research documentation & presentation' },
} as const satisfies Record<string, { readonly order: number; readonly label: string }>;

export type StageId = keyof typeof STAGES;

/** Stage ids in journey order. */
export const STAGE_IDS = Object.keys(STAGES) as [StageId, ...StageId[]];

export const stageIdSchema = z.enum(STAGE_IDS);
