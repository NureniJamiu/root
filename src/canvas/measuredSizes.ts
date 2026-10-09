/**
 * Rendered card sizes, as reported by React Flow.
 *
 * Cards grow with their notes and images, so layout and placement cannot
 * assume one fixed size. `CanvasView` records each card's measured size here;
 * `computeChildPosition` / `computeTreeLayout` accept the map as an optional
 * argument and fall back to `NODE_WIDTH` × `NODE_HEIGHT` for cards that have
 * not been measured yet.
 */

import type { UUID } from '../data';

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

export type NodeSizes = ReadonlyMap<UUID, NodeSize>;

const measured = new Map<UUID, NodeSize>();

/** Record a card's size. Returns false when nothing changed. */
export function setMeasuredSize(id: UUID, size: NodeSize): boolean {
  const current = measured.get(id);
  if (current && current.width === size.width && current.height === size.height) return false;
  measured.set(id, size);
  return true;
}

/** The sizes measured so far. The map is live; copy it if you need a snapshot. */
export function getMeasuredSizes(): NodeSizes {
  return measured;
}
