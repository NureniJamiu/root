/**
 * Canvas serialization and deserialization (Requirements 8.2, 8.3, 8.5,
 * 9.4, 9.5, 9.6).
 *
 * `serializeCanvas` emits a JSON document with a **stable, deterministic
 * field order** so two semantically equal canvases produce byte-identical
 * strings. This matters for:
 *   - Requirement 8.2: canvas persisted as a single JSON document containing
 *     id, title, nodes, updatedAt.
 *   - Requirement 9.6: serialize/deserialize is a round-trip.
 *   - Downstream diffing / test snapshot stability.
 *
 * `parseCanvas` is the sole entry point for turning stored JSON back into a
 * validated `Canvas`. It never throws: JSON errors and schema failures both
 * flow through the tagged-union return type so callers (persistence load
 * path, R8.5) can preserve the raw payload for recovery.
 */

import { canvasSchema } from './schema';
import type { Canvas, ImageEntry, Node, Position } from './types';

/* -------------------------------------------------------------------------- */
/* Stable field ordering                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild a `Position` with a fixed key order.
 */
function orderedPosition(p: Position): Position {
  return { x: p.x, y: p.y };
}

/**
 * Rebuild an `ImageEntry` with a fixed key order: id, dataUrl, addedAt.
 */
function orderedImage(img: ImageEntry): ImageEntry {
  return {
    id: img.id,
    dataUrl: img.dataUrl,
    addedAt: img.addedAt,
  };
}

/**
 * Rebuild a `Node` with a fixed key order:
 * id, parentId, title, body, images, type, position, collapsed,
 * createdAt, updatedAt.
 */
function orderedNode(n: Node): Node {
  return {
    id: n.id,
    parentId: n.parentId,
    title: n.title,
    body: n.body,
    images: n.images.map(orderedImage),
    type: n.type,
    position: orderedPosition(n.position),
    collapsed: n.collapsed,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/**
 * Rebuild a `Canvas` with a fixed key order:
 * id, title, nodes, updatedAt.
 *
 * Node array order is preserved as-is; only the *field* order within each
 * object is normalized. Callers that need a canonical node ordering should
 * do that upstream.
 */
function orderedCanvas(c: Canvas): Canvas {
  return {
    id: c.id,
    title: c.title,
    nodes: c.nodes.map(orderedNode),
    updatedAt: c.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Serialize a `Canvas` to a JSON string with deterministic key ordering.
 *
 * Preconditions: `c` is assumed to satisfy `canvasSchema`. This function does
 * not re-validate; the store's write path is responsible for validation
 * before persistence.
 */
export function serializeCanvas(c: Canvas): string {
  return JSON.stringify(orderedCanvas(c));
}

/**
 * Result of `parseCanvas`. Tagged union so the caller can branch cleanly
 * without try/catch and, on failure, preserve the raw payload for R8.5
 * recovery.
 */
export type ParseCanvasResult =
  | { ok: true; canvas: Canvas }
  | { ok: false; error: string; raw: string };

/**
 * Parse a stored JSON payload back into a validated `Canvas`.
 *
 * Never throws. Two failure modes, both surfaced through the `ok: false`
 * branch with the original `raw` string echoed so callers can persist it to
 * the `.raw` recovery slot (R8.5):
 *   1. JSON parse failure (malformed payload).
 *   2. Schema validation failure (shape mismatch, or any of the four
 *      structural invariants enforced by `canvasSchema.superRefine`:
 *      unique ids, single root, no dangling parentId, no cycles).
 */
export function parseCanvas(raw: string): ParseCanvasResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Invalid JSON: ${message}`, raw };
  }

  const result = canvasSchema.safeParse(json);
  if (!result.success) {
    // Flatten Zod issues into a single human-readable line so the toast in
    // R8.5 can show a useful summary without pulling in Zod's formatter.
    const error = result.error.issues
      .map((i) => {
        const path = i.path.length > 0 ? i.path.join('.') : '<root>';
        return `${path}: ${i.message}`;
      })
      .join('; ');
    return { ok: false, error, raw };
  }

  return { ok: true, canvas: result.data };
}
