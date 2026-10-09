/**
 * Turning React Flow connections into connector ends.
 *
 * A connection arrives as `{ source, target, sourceHandle, targetHandle }`
 * where each handle id names the card side it sits on (`source-right`,
 * `target-top`, ...). The two sides are what the user picked by dropping the
 * connector on a handle; when a connector is dropped on a card body instead,
 * `nearestSide` picks the side closest to the drop point.
 */

import { computeFacingSides } from '../data';
import type { Canvas, ConnectorEnds, Side } from '../data';

export { computeFacingSides };

export type ConnectionLike = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
};

/** The side a handle id names, or `null` for an unknown or missing id. */
export function handleIdToSide(handleId?: string | null): Side | null {
  if (!handleId) return null;
  if (handleId.includes('left')) return 'left';
  if (handleId.includes('right')) return 'right';
  if (handleId.includes('top')) return 'top';
  if (handleId.includes('bottom')) return 'bottom';
  return null;
}

/** Handle ids for a side. Every card has one handle of each type per side. */
export function sourceHandleId(side: Side): string {
  return `source-${side}`;
}
export function targetHandleId(side: Side): string {
  return `target-${side}`;
}

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The side of `rect` that `point` is closest to, measured as a fraction of
 * the card's own size so that wide cards do not favour top and bottom.
 */
export function nearestSide(rect: RectLike, point: { x: number; y: number }): Side {
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  const distances: Array<[Side, number]> = [
    ['left', Math.abs(point.x - rect.left) / w],
    ['right', Math.abs(point.x - (rect.left + rect.width)) / w],
    ['top', Math.abs(point.y - rect.top) / h],
    ['bottom', Math.abs(point.y - (rect.top + rect.height)) / h],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]![0];
}

/**
 * Ends of the connector a connection describes, or `null` when it names a
 * missing card or the same card twice. Sides the handles do not name fall
 * back to the sides that face each other. Both ends are pinned: the user
 * picked them by dropping on a handle.
 */
export function connectionToEnds(canvas: Canvas, connection: ConnectionLike): ConnectorEnds | null {
  const { source, target } = connection;
  if (!source || !target || source === target) return null;
  const from = canvas.nodes.find((n) => n.id === source);
  const to = canvas.nodes.find((n) => n.id === target);
  if (!from || !to) return null;

  const facing = computeFacingSides(from.position, to.position);
  return {
    source,
    target,
    sourceSide: handleIdToSide(connection.sourceHandle) ?? facing.sourceSide,
    targetSide: handleIdToSide(connection.targetHandle) ?? facing.targetSide,
    sourcePinned: true,
    targetPinned: true,
  };
}
