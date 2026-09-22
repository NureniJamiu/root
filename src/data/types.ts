/**
 * Public TypeScript types for the Root MVP data model.
 *
 * All types are inferred from the Zod schemas in `./schema` so the schema
 * remains the single source of truth (Requirement 9). Consumers should import
 * from here (or the future `src/data/index.ts` barrel) rather than reaching
 * into `./schema` directly.
 */

import type { z } from 'zod';

import type {
  canvasSchema,
  imageEntrySchema,
  nodeSchema,
  nodeTypeSchema,
  positionSchema,
} from './schema';

/** RFC 4122 UUID string. Alias kept for documentation intent. */
export type UUID = string;

export type NodeType = z.infer<typeof nodeTypeSchema>;
export type Position = z.infer<typeof positionSchema>;
export type ImageEntry = z.infer<typeof imageEntrySchema>;
export type Node = z.infer<typeof nodeSchema>;
export type Canvas = z.infer<typeof canvasSchema>;
