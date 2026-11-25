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
 * Schema version 2 (M0) adds the typed graph: each node carries its type's
 * `fields`, each edge a `relationType`, and both a required `provenance`.
 * Older canvases are migrated on parse, see `migrateCanvas`.
 */

import { z } from 'zod';

import {
  ENABLED_NODE_TYPE_IDS,
  ENABLED_RELATION_IDS,
  FALLBACK_RELATION,
  fieldsSchemaFor,
  provenanceSchema,
  unrecordedProvenance,
  workspaceSchema,
} from './model';
import {
  CANVAS_TITLE_MAX,
  IMAGE_CAPTION_MAX,
  IMAGE_TEXT_MAX,
  NODE_BODY_MAX,
  NODE_TITLE_MAX,
  SOURCE_AUTHORS_MAX,
  SOURCE_QUOTE_MAX,
  SOURCE_TEXT_MAX,
  SOURCE_URL_MAX,
} from './limits';

/* -------------------------------------------------------------------------- */
/* Primitive schemas                                                          */
/* -------------------------------------------------------------------------- */

/** The current canvas schema version. Saved canvases without one are version 1. */
export const CANVAS_SCHEMA_VERSION = 2;

/** The node types a canvas may hold today (see `model/enabled.ts`). */
export const nodeTypeSchema = z.enum(ENABLED_NODE_TYPE_IDS);

/** The relations an edge may carry today (see `model/enabled.ts`). */
export const relationTypeSchema = z.enum(ENABLED_RELATION_IDS);

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const imageEntrySchema = z.object({
  id: z.string().uuid(),
  dataUrl: z.string().startsWith('data:'),
  addedAt: z.string().datetime(),
  /** What the image shows, in a sentence; absent until described. */
  caption: z.string().max(IMAGE_CAPTION_MAX).optional(),
  /** Text visible in the image (a chart's labels, a slide, a page). */
  text: z.string().max(IMAGE_TEXT_MAX).optional(),
});

export const sideSchema = z.enum(['top', 'right', 'bottom', 'left']);

/** What kind of work a source is; picks the citation layout. */
export const sourceKindSchema = z.enum(['web', 'article', 'book', 'report', 'other']);

/**
 * Where an idea came from, for citations. Every field is optional: a source
 * may be no more than a link, or a book with no address at all.
 */
export const sourceSchema = z.object({
  kind: sourceKindSchema,
  /** The work's own title (the page, article, chapter or book). */
  title: z.string().max(SOURCE_TEXT_MAX).optional(),
  /** People or organisations, each as written ("Ada Lovelace" or "Lovelace, Ada"). */
  authors: z.array(z.string().max(SOURCE_TEXT_MAX)).max(SOURCE_AUTHORS_MAX).optional(),
  /** Publication date: "2024", "2024-03" or "2024-03-18". */
  published: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).optional(),
  /** The site, journal or publisher it appeared in. */
  container: z.string().max(SOURCE_TEXT_MAX).optional(),
  url: z.string().max(SOURCE_URL_MAX).regex(/^https?:\/\//i).optional(),
  doi: z.string().max(SOURCE_TEXT_MAX).optional(),
  /** When the page was read (YYYY-MM-DD), for web sources. */
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** The passage the idea is drawn from. */
  quote: z.string().max(SOURCE_QUOTE_MAX).optional(),
});

/* -------------------------------------------------------------------------- */
/* Node + edge schemas                                                        */
/* -------------------------------------------------------------------------- */

const nodeObjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(NODE_TITLE_MAX),
  body: z.string().max(NODE_BODY_MAX),
  images: z.array(imageEntrySchema),
  type: nodeTypeSchema,
  /** The type's own fields (see the registry); checked against `type` below. */
  fields: z.record(z.string(), z.unknown()),
  /** Where the idea came from; absent when no source is recorded. */
  source: sourceSchema.optional(),
  /** Who made the idea: the researcher, an accepted AI suggestion, ... */
  provenance: provenanceSchema,
  position: positionSchema,
  collapsed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * A node. `fields` is validated by the registry schema of the node's type,
 * which also drops keys that type does not define.
 */
export const nodeSchema = nodeObjectSchema.transform((node, ctx): z.infer<typeof nodeObjectSchema> => {
  const fields = fieldsSchemaFor(node.type).safeParse(node.fields);
  if (!fields.success) {
    for (const issue of fields.error.issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: ['fields', ...issue.path] });
    }
    return z.NEVER;
  }
  return { ...node, fields: fields.data };
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
  /**
   * The target is kept out of view by the source, which reveals its ideas
   * one at a time (see `revealChild`). Absent when not hidden.
   */
  hidden: z.boolean().optional(),
  /**
   * What the connector means. Parsing checks only that the relation is
   * known; whether it fits the two card types is a rule, not a parse error.
   */
  relationType: relationTypeSchema,
  /** Who drew the connector. */
  provenance: provenanceSchema,
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

/**
 * The schema version a stored or sent canvas claims. Canvases saved before
 * versions were recorded are version 1.
 */
export function canvasSchemaVersion(input: unknown): number {
  return isRecord(input) && typeof input.schemaVersion === 'number' ? input.schemaVersion : 1;
}

/**
 * Turn a version 1 canvas into version 2. Node types keep their ids, nodes
 * get empty `fields`, every edge becomes `related-to`, and nodes and edges are
 * marked `unrecorded`, because who made them was never recorded. No meaning
 * is inferred for old connectors. Anything that is not a version 1 canvas is
 * returned untouched.
 */
function migrateV1ToV2(input: unknown): unknown {
  if (!isRecord(input) || 'schemaVersion' in input) return input;
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) return input;
  return {
    ...input,
    schemaVersion: CANVAS_SCHEMA_VERSION,
    nodes: input.nodes.map((n: unknown) =>
      isRecord(n) ? { ...n, fields: {}, provenance: unrecordedProvenance() } : n,
    ),
    edges: input.edges.map((e: unknown) =>
      isRecord(e) ? { ...e, relationType: FALLBACK_RELATION, provenance: unrecordedProvenance() } : e,
    ),
  };
}

/**
 * Bring a stored canvas of any version up to the current one:
 * legacy `parentId` canvas → version 1 → version 2. Idempotent, and it leaves
 * anything it does not recognise for the schema to reject.
 */
export function migrateCanvas(input: unknown): unknown {
  return migrateV1ToV2(migrateLegacyCanvas(input));
}

/* -------------------------------------------------------------------------- */
/* Canvas schema + structural invariants                                      */
/* -------------------------------------------------------------------------- */

const canvasObjectSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.literal(CANVAS_SCHEMA_VERSION),
    title: z.string().max(CANVAS_TITLE_MAX),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    /** The intake answer and the stage the workspace opens on; absent until set. */
    workspace: workspaceSchema.optional(),
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

export const canvasSchema = z.preprocess(migrateCanvas, canvasObjectSchema);
