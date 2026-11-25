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
import type { Canvas } from './types';

/* -------------------------------------------------------------------------- */
/* Stable field ordering                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild a JSON value with the keys of every object in sorted order. Array
 * order is preserved as-is (node and edge order is meaningful). Every key is
 * kept, so a field added to the schema is serialized without listing it here.
 */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, ordered(record[key])]),
    );
  }
  return value;
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
  return JSON.stringify(ordered(c));
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
 *   2. Schema validation failure (shape mismatch, or a structural invariant
 *      enforced by `canvasSchema`: unique ids, no dangling or duplicate
 *      connectors).
 * Canvases saved in the older `parentId` format are migrated, not rejected.
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
