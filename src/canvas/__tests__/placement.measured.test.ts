import { describe, expect, it } from 'vitest';

import { addChild, addNode, emptyCanvas } from '../../data/mutators';
import type { Canvas, Node } from '../../data';
import { NODE_HEIGHT, NODE_WIDTH, SIBLING_GAP, computeChildPosition, computeTreeLayout, findFreePosition } from '../placement';
import type { NodeSizes } from '../measuredSizes';

/** One card with `children` cards connected from it. */
function tree(children: number): Canvas {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  for (let i = 0; i < children; i++) c = addChild(c, c.nodes[0]!.id, { position: { x: 0, y: 0 } });
  return c;
}

function overlap(a: Node, b: Node, sizes: NodeSizes): boolean {
  const sa = sizes.get(a.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
  const sb = sizes.get(b.id) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
  return (
    a.position.x < b.position.x + sb.width &&
    b.position.x < a.position.x + sa.width &&
    a.position.y < b.position.y + sb.height &&
    b.position.y < a.position.y + sa.height
  );
}

describe('computeChildPosition with measured sizes', () => {
  it('without sizes puts the child just right of the parent', () => {
    const c = tree(0);
    expect(computeChildPosition(c, c.nodes[0]!.id)).toEqual({ x: NODE_WIDTH + SIBLING_GAP, y: 0 });
  });

  it('keeps clear of a wide parent', () => {
    const c = tree(0);
    const root = c.nodes[0]!;
    const sizes: NodeSizes = new Map([[root.id, { width: 500, height: 200 }]]);
    expect(computeChildPosition(c, root.id, sizes).x).toBe(500 + SIBLING_GAP);
  });

  it('places the next child below a sibling that has grown tall', () => {
    let c = tree(1);
    const root = c.nodes[0]!;
    const sibling = c.nodes[1]!;
    c = {
      ...c,
      nodes: c.nodes.map((n) => (n.id === sibling.id ? { ...n, position: { x: NODE_WIDTH + SIBLING_GAP, y: 0 } } : n)),
    };
    const sizes: NodeSizes = new Map([[sibling.id, { width: NODE_WIDTH, height: 500 }]]);

    const pos = computeChildPosition(c, root.id, sizes);

    expect(pos.y).toBe(500 + SIBLING_GAP);
  });
});

describe('findFreePosition', () => {
  it('returns the desired spot when it is free', () => {
    const c = tree(0);
    expect(findFreePosition(c, { x: 1000, y: 1000 })).toEqual({ x: 1000, y: 1000 });
  });

  it('moves below the card in the way, and keeps going while something is still in the way', () => {
    let c = tree(0);
    c = addNode(c, { position: { x: 0, y: NODE_HEIGHT + SIBLING_GAP } });
    const pos = findFreePosition(c, { x: 0, y: 0 });
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(2 * NODE_HEIGHT + 2 * SIBLING_GAP);
  });

  it('never overlaps any card, however crowded', () => {
    let c = tree(0);
    for (let i = 0; i < 6; i++) c = addNode(c, { position: { x: 0, y: i * 90 } });
    const pos = findFreePosition(c, { x: 10, y: 10 });
    const box = { id: 'new', position: pos } as unknown as Node;
    for (const n of c.nodes) expect(overlap(box, n, new Map())).toBe(false);
  });
});

describe('computeTreeLayout with measured sizes', () => {
  it('leaves no two cards overlapping when cards have very different heights', () => {
    const c = tree(4);
    const sizes: NodeSizes = new Map([
      [c.nodes[0]!.id, { width: 290, height: 120 }],
      [c.nodes[1]!.id, { width: 290, height: 700 }],
      [c.nodes[2]!.id, { width: 290, height: 180 }],
      [c.nodes[3]!.id, { width: 290, height: 420 }],
      [c.nodes[4]!.id, { width: 290, height: 260 }],
    ]);
    const laid = computeTreeLayout(c, sizes);

    for (let i = 0; i < laid.nodes.length; i++) {
      for (let j = i + 1; j < laid.nodes.length; j++) {
        expect(overlap(laid.nodes[i]!, laid.nodes[j]!, sizes)).toBe(false);
      }
    }
  });

  it('starts a row below the tallest card of the row above', () => {
    let c = tree(2);
    const childA = c.nodes[1]!;
    c = addChild(c, childA.id, { position: { x: 0, y: 0 } });
    const grandchild = c.nodes[3]!;
    const sizes: NodeSizes = new Map([[c.nodes[2]!.id, { width: 290, height: 600 }]]);

    const laid = computeTreeLayout(c, sizes);
    const gc = laid.nodes.find((n) => n.id === grandchild.id)!;
    const sibling = laid.nodes.find((n) => n.id === c.nodes[2]!.id)!;

    expect(gc.position.y).toBeGreaterThanOrEqual(sibling.position.y + 600);
  });

  it('lays out wide cards without overlap too', () => {
    const c = tree(3);
    const sizes: NodeSizes = new Map(c.nodes.map((n) => [n.id, { width: 420, height: 200 }]));
    const laid = computeTreeLayout(c, sizes);
    for (let i = 0; i < laid.nodes.length; i++) {
      for (let j = i + 1; j < laid.nodes.length; j++) {
        expect(overlap(laid.nodes[i]!, laid.nodes[j]!, sizes)).toBe(false);
      }
    }
  });
});

describe('computeTreeLayout on a graph', () => {
  it('lays out unconnected cards side by side in the top row', () => {
    let c = addNode(emptyCanvas(), { position: { x: 5, y: 5 } });
    c = addNode(c, { position: { x: 5, y: 5 } });
    c = addNode(c, { position: { x: 5, y: 5 } });
    const laid = computeTreeLayout(c);
    const ys = new Set(laid.nodes.map((n) => n.position.y));
    expect(ys.size).toBe(1);
    expect(new Set(laid.nodes.map((n) => n.position.x)).size).toBe(3);
  });

  it('puts a card with several incoming connectors one row below its first source and keeps every connector', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addNode(c, { position: { x: 0, y: 0 } });
    const [a, b] = c.nodes.map((n) => n.id) as [string, string];
    c = addChild(c, a, { position: { x: 0, y: 0 } });
    const shared = c.nodes[2]!.id;
    c = { ...c, edges: [...c.edges, { id: crypto.randomUUID(), source: b, target: shared, sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false }] };

    const laid = computeTreeLayout(c);

    expect(laid.edges).toHaveLength(2);
    const y = (id: string) => laid.nodes.find((n) => n.id === id)!.position.y;
    expect(y(shared)).toBeGreaterThan(y(a));
    // Downward connectors leave the bottom and enter the top.
    for (const e of laid.edges) {
      if (y(e.target) > y(e.source)) expect(e).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' });
    }
  });

  it('terminates on a cycle and lays every card out', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 0, y: 0 } });
    c = { ...c, edges: [...c.edges, { id: crypto.randomUUID(), source: c.nodes[1]!.id, target: c.nodes[0]!.id, sourceSide: 'left', targetSide: 'right', sourcePinned: false, targetPinned: false }] };
    const laid = computeTreeLayout(c);
    expect(laid.nodes).toHaveLength(2);
    expect(laid.nodes[0]!.position).not.toEqual(laid.nodes[1]!.position);
  });

  it('is a no-op on an empty canvas', () => {
    const c = emptyCanvas();
    expect(computeTreeLayout(c)).toBe(c);
  });
});
