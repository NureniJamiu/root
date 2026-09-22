/**
 * Time source for the data layer.
 *
 * Isolated so tests can mock the wall clock without touching global `Date`.
 * The returned string is an ISO 8601 timestamp in UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`),
 * which satisfies `z.string().datetime()` in `./schema`.
 */

export function now(): string {
  return new Date().toISOString();
}
