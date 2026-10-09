import { describe, expect, it } from 'vitest';

import { addChild, addRoot, emptyCanvas } from '../../data/mutators';
import type { Canvas, Node } from '../../data';
import { NODE_HEIGHT, NODE_WIDTH, SIBLING_GAP, computeChildPosition, computeTreeLayout } from '../placement';
import type { NodeSizes } from '../measuredSizes';

function tree(children: number): Canvas {
  let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
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
  it('without sizes behaves as before', () => {
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
