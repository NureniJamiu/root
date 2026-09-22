/**
 * Zod schemas for the Root MVP data model.
 *
 * Implements Requirement 9 (canonical serialization + structural invariants)
 * and provides the source of truth from which `src/data/types.ts` derives its
 * TypeScript types via `z.infer`.
 *
 * The `canvasSchema.superRefine` block enforces the four structural invariants
 * called out in design.md §Data Models:
 *   1. `id` is unique across `nodes`.
 *   2. When the canvas is non-empty, exactly one node has `parentId === null`.
 *   3. No node references a `parentId` that is not present in `nodes`.
 *   4. The parent chain is acyclic.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Primitive schemas                                                          */
/* -------------------------------------------------------------------------- */

export const nodeTypeSchema = z.enum([
  'topic',
  'finding',
  'question',
  'conclusion',
]);

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const imageEntrySchema = z.object({
  id: z.string().uuid(),
  dataUrl: z.string().startsWith('data:'),
  addedAt: z.string().datetime(),
});

/* -------------------------------------------------------------------------- */
/* Node schema                                                                */
/* -------------------------------------------------------------------------- */

export const nodeSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  title: z.string().max(200),
  body: z.string().max(20_000),
  images: z.array(imageEntrySchema),
  type: nodeTypeSchema,
  position: positionSchema,
  collapsed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/* -------------------------------------------------------------------------- */
/* Canvas schema + structural invariants                                      */
/* -------------------------------------------------------------------------- */

export const canvasSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(200),
    nodes: z.array(nodeSchema),
    updatedAt: z.string().datetime(),
  })
  .superRefine((canvas, ctx) => {
    // Invariant 1: unique ids + count roots in a single pass.
    const ids = new Set<string>();
    let rootCount = 0;
    for (const n of canvas.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate node id ${n.id}`,
        });
      }
      ids.add(n.id);
      if (n.parentId === null) rootCount += 1;
    }

    // Invariant 3: parentId references an id that exists in the canvas.
    for (const n of canvas.nodes) {
      if (n.parentId !== null && !ids.has(n.parentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dangling parentId ${n.parentId} on node ${n.id}`,
        });
      }
    }

    // Invariant 2: exactly one root when the canvas is non-empty.
    if (canvas.nodes.length > 0 && rootCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected exactly 1 root, got ${rootCount}`,
      });
    }

    // Invariant 4: parent chain is acyclic. Iterative walk with per-node
    // visited set; also terminates on dangling parentId (already reported
    // above) so we do not add duplicate cycle issues for that case.
    const byId = new Map<string, (typeof canvas.nodes)[number]>();
    for (const n of canvas.nodes) byId.set(n.id, n);
    for (const n of canvas.nodes) {
      let cur: string | null = n.parentId;
      const seen = new Set<string>([n.id]);
      while (cur !== null) {
        if (seen.has(cur)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `cycle involving node ${n.id}`,
          });
          break;
        }
        seen.add(cur);
        const parent = byId.get(cur);
        if (parent === undefined) break; // dangling: already reported
        cur = parent.parentId;
      }
    }
  });
