/**
 * Zod schemas for the Root data model.
 *
 * A canvas is a free graph: `nodes` (ideas) joined by `edges` (connectors).
 * Any node may have any number of connectors, on any of its four sides, and
 * the canvas may be empty or hold several unconnected clusters.
 *
 * `canvasSchema` enforces these structural invariants:
 *   1. Node ids are unique.
 *   2. Edge ids are unique.
 *   3. Every edge joins two nodes that exist, and never a node to itself.
 *
 * Each connector end is either *pinned* (the user chose its side; it stays
 * there when cards move) or automatic (it follows the sides that face each
 * other and is refreshed whenever a card moves).
 *
 * Canvases saved before connectors were first-class (each node carried a
 * `parentId` and optional side hints) are migrated on parse, see
 * `migrateLegacyCanvas`.
 */

import { z } from 'zod';

import { CANVAS_TITLE_MAX, NODE_BODY_MAX, NODE_TITLE_MAX } from './limits';

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

export const sideSchema = z.enum(['top', 'right', 'bottom', 'left']);

/* -------------------------------------------------------------------------- */
/* Node + edge schemas                                                        */
/* -------------------------------------------------------------------------- */

export const nodeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(NODE_TITLE_MAX),
  body: z.string().max(NODE_BODY_MAX),
  images: z.array(imageEntrySchema),
  type: nodeTypeSchema,
  position: positionSchema,
  collapsed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * A connector from `source` to `target`. `sourceSide` / `targetSide` are the
 * sides of the two cards it is attached to. An end that is `*Pinned` keeps its
 * side when cards move; an end that is not follows the facing sides.
 */
export const edgeSchema = z.object({
  id: z.string().uuid(),
  source: z.string().uuid(),
  target: z.string().uuid(),
  sourceSide: sideSchema,
  targetSide: sideSchema,
  sourcePinned: z.boolean().default(false),
  targetPinned: z.boolean().default(false),
});

/* -------------------------------------------------------------------------- */
/* Legacy migration                                                           */
/* -------------------------------------------------------------------------- */

type Loose = Record<string, unknown>;

function isRecord(v: unknown): v is Loose {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPosition(v: unknown): v is { x: number; y: number } {
  return isRecord(v) && typeof v.x === 'number' && typeof v.y === 'number';
}

/** Sides that face each other, along the larger distance between two cards. */
function facingSides(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { sourceSide: string; targetSide: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: 'right', targetSide: 'left' }
      : { sourceSide: 'left', targetSide: 'right' };
  }
  return dy >= 0
    ? { sourceSide: 'bottom', targetSide: 'top' }
    : { sourceSide: 'top', targetSide: 'bottom' };
}

/**
 * Turn a canvas that stores `parentId` on each node into one with `edges`.
 * Anything that is not a legacy canvas is returned untouched. The connector
 * reuses the child's id as its own id, which keeps ids unique and stable.
 */
export function migrateLegacyCanvas(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.nodes)) return input;
  const legacy = input.nodes.some((n) => isRecord(n) && 'parentId' in n);
  if (!legacy && Array.isArray(input.edges)) return input;

  const byId = new Map<string, Loose>();
  for (const n of input.nodes) if (isRecord(n) && typeof n.id === 'string') byId.set(n.id, n);

  const edges: Loose[] = Array.isArray(input.edges) ? [...(input.edges as Loose[])] : [];
  for (const node of input.nodes) {
    if (!isRecord(node) || typeof node.parentId !== 'string') continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue; // dangling parent: the child simply becomes a free card
    const auto =
      isPosition(parent.position) && isPosition(node.position)
        ? facingSides(parent.position, node.position)
        : { sourceSide: 'right', targetSide: 'left' };
    edges.push({
      id: node.id,
      source: node.parentId,
      target: node.id,
      sourceSide: node.sourceSide ?? auto.sourceSide,
      targetSide: node.targetSide ?? auto.targetSide,
      sourcePinned: node.sourcePinned === true,
      targetPinned: node.targetPinned === true,
    });
  }
  const nodes = input.nodes.map((n) => {
    if (!isRecord(n)) return n;
    const { parentId: _p, sourceSide: _s, targetSide: _t, sourcePinned: _sp, targetPinned: _tp, ...rest } = n;
    return rest;
  });
  return { ...input, nodes, edges };
}

/* -------------------------------------------------------------------------- */
/* Canvas schema + structural invariants                                      */
/* -------------------------------------------------------------------------- */

const canvasObjectSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(CANVAS_TITLE_MAX),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    updatedAt: z.string().datetime(),
  })
  .superRefine((canvas, ctx) => {
    const nodeIds = new Set<string>();
    for (const n of canvas.nodes) {
      if (nodeIds.has(n.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate node id ${n.id}` });
      }
      nodeIds.add(n.id);
    }

    const edgeIds = new Set<string>();
    for (const e of canvas.edges) {
      if (edgeIds.has(e.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate edge id ${e.id}` });
      }
      edgeIds.add(e.id);
      if (e.source === e.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge ${e.id} connects node ${e.source} to itself`,
        });
      }
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `dangling edge ${e.id}`,
        });
      }
    }
  });

export const canvasSchema = z.preprocess(migrateLegacyCanvas, canvasObjectSchema);
