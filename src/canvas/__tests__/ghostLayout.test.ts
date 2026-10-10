import { describe, expect, it } from 'vitest';

import { addNode, emptyCanvas } from '../../data';
import { layoutExpansion, layoutMap } from '../ghostLayout';
import { NODE_HEIGHT, NODE_WIDTH } from '../placement';

const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH && a.y < b.y + NODE_HEIGHT && b.y < a.y + NODE_HEIGHT;

describe('ghost layout', () => {
  it('fans expansions out from the idea without overlaps', () => {
    const canvas = addNode(emptyCanvas(), { position: { x: 100, y: 100 } });
    const anchor = canvas.nodes[0]!;
    const seeds = ['a', 'b', 'c'].map((key) => ({ key, type: 'finding' as const, parentKey: null }));
    const positions = [...layoutExpansion(canvas, anchor.id, seeds).values()];
    expect(positions).toHaveLength(3);
    for (const p of positions) {
      expect(p.x).toBeGreaterThan(anchor.position.x);
      expect(overlap(p, anchor.position)).toBe(false);
    }
    expect(overlap(positions[0]!, positions[1]!)).toBe(false);
    expect(overlap(positions[1]!, positions[2]!)).toBe(false);
  });

  it('centres a map on the view when the canvas is empty', () => {
    const seeds = [
      { key: 'r', type: 'topic' as const, parentKey: null },
      { key: 'a', type: 'finding' as const, parentKey: 'r' },
      { key: 'b', type: 'question' as const, parentKey: 'r' },
    ];
    const positions = layoutMap(emptyCanvas(), seeds, { x: 1000, y: 1000 });
    const root = positions.get('r')!;
    expect(positions.get('a')!.y).toBeGreaterThan(root.y);
    const xs = [...positions.values()].map((p) => p.x);
    const mid = (Math.min(...xs) + Math.max(...xs) + NODE_WIDTH) / 2;
    expect(Math.abs(mid - 1000)).toBeLessThan(2);
  });

  it('puts a map to the right of existing ideas', () => {
    const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 50 } });
    const positions = layoutMap(canvas, [{ key: 'r', type: 'topic', parentKey: null }], { x: 0, y: 0 });
    expect(positions.get('r')).toEqual({ x: NODE_WIDTH + 200, y: 50 });
  });
});
