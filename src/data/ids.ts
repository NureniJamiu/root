/**
 * ID generation for the data layer.
 *
 * Isolated in its own module so tests can mock a deterministic id generator
 * without touching global `crypto`. Every id we produce is an RFC 4122 v4
 * UUID, which matches the `z.string().uuid()` constraint in `./schema`.
 */

import type { UUID } from './types';

/** Returns a fresh RFC 4122 v4 UUID string. */
export function newId(): UUID {
  return crypto.randomUUID();
}
