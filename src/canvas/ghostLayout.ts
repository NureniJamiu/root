/**
 * Where AI suggestions appear before they are accepted.
 *
 * An expansion fans out from its idea the way "Add connected idea" places a
 * child, one free spot after another. A topic map is laid out as a tree and
 * set down in empty space: centred on the view when the canvas is empty,
 * otherwise to the right of everything already there. Pure geometry.
 */

import type { Canvas, Edge, Node, NodeType, Position, UUID } from '../data';
import type { NodeSizes } from './measuredSizes';
import { NODE_HEIGHT, NODE_WIDTH, computeChildPosition, computeTreeLayout, findFreePosition } from './placement';

export interface GhostSeed {
  readonly key: string;
  readonly type: NodeType;
  readonly parentKey: string | null;
}

/** Gap kept between existing ideas and a new topic map. */
const MAP_GAP = 200;

function placeholder(id: string, position: Position, type: NodeType): Node {
  return {
    id,
    title: '',
    body: '',
    images: [],
    type,
    position,
    collapsed: false,
    createdAt: '',
    updatedAt: '',
  };
}

/** Positions for ideas that connect from `anchorId`, by key. */
export function layoutExpansion(
  canvas: Canvas,
  anchorId: UUID,
  seeds: readonly GhostSeed[],
  sizes?: NodeSizes,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  let working = canvas;
  for (const seed of seeds) {
    const parentId = seed.parentKey !== null && positions.has(seed.parentKey) ? `ghost:${seed.parentKey}` : anchorId;
    const position = computeChildPosition(working, parentId, sizes);
    positions.set(seed.key, position);
    working = { ...working, nodes: [...working.nodes, placeholder(`ghost:${seed.key}`, position, seed.type)] };
  }
  return positions;
}

/** Positions for a topic map, by key. `viewCenter` is the middle of the visible canvas. */
export function layoutMap(
  canvas: Canvas,
  seeds: readonly GhostSeed[],
  viewCenter: Position,
  sizes?: NodeSizes,
): Map<string, Position> {
  const keys = new Set(seeds.map((s) => s.key));
  const tree: Canvas = {
    ...canvas,
    nodes: seeds.map((s) => placeholder(s.key, { x: 0, y: 0 }, s.type)),
    edges: seeds
      .filter((s) => s.parentKey !== null && keys.has(s.parentKey))
      .map(
        (s): Edge => ({
          id: `${s.parentKey}->${s.key}`,
          source: s.parentKey as string,
          target: s.key,
          sourceSide: 'bottom',
          targetSide: 'top',
          sourcePinned: false,
          targetPinned: false,
        }),
      ),
  };
  const laidOut = computeTreeLayout(tree).nodes;
  if (laidOut.length === 0) return new Map();
  const minX = Math.min(...laidOut.map((n) => n.position.x));
  const minY = Math.min(...laidOut.map((n) => n.position.y));
  const maxX = Math.max(...laidOut.map((n) => n.position.x + NODE_WIDTH));
  const maxY = Math.max(...laidOut.map((n) => n.position.y + NODE_HEIGHT));

  let origin: Position;
  if (canvas.nodes.length === 0) {
    origin = {
      x: Math.round(viewCenter.x - (maxX - minX) / 2),
      y: Math.round(viewCenter.y - (maxY - minY) / 2),
    };
  } else {
    const right = Math.max(...canvas.nodes.map((n) => n.position.x + (sizes?.get(n.id)?.width ?? NODE_WIDTH)));
    const top = Math.min(...canvas.nodes.map((n) => n.position.y));
    origin = { x: Math.round(right + MAP_GAP), y: Math.round(top) };
  }

  const positions = new Map<string, Position>();
  for (const n of laidOut) {
    positions.set(n.id, { x: n.position.x - minX + origin.x, y: n.position.y - minY + origin.y });
  }
  // A stray card in the way nudges only the cards that would overlap it.
  if (canvas.nodes.length > 0) {
    for (const [key, position] of positions) positions.set(key, findFreePosition(canvas, position, sizes));
  }
  return positions;
}
