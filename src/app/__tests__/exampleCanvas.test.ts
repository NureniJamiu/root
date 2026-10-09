import { describe, expect, it } from 'vitest';

import { canvasSchema, emptyCanvas, addRoot } from '../../data';
import type { Node } from '../../data';
import { NODE_HEIGHT, NODE_WIDTH } from '../../canvas';
import { buildExampleCanvas } from '../exampleCanvas';

function overlaps(a: Node, b: Node, heightOf: (n: Node) => number): boolean {
  return (
    a.position.x < b.position.x + NODE_WIDTH &&
    b.position.x < a.position.x + NODE_WIDTH &&
    a.position.y < b.position.y + heightOf(b) &&
    b.position.y < a.position.y + heightOf(a)
  );
}

describe('buildExampleCanvas', () => {
  it('builds a valid, connected tree of four ideas from an empty canvas', () => {
    const base = emptyCanvas();
    const example = buildExampleCanvas(base);

    expect(canvasSchema.safeParse(example).success).toBe(true);
    expect(example.id).toBe(base.id);
    expect(example.nodes).toHaveLength(4);
    expect(example.nodes.filter((n) => n.parentId === null)).toHaveLength(1);
    expect(example.nodes.map((n) => n.type).sort()).toEqual(['conclusion', 'finding', 'question', 'topic']);
  });

  it('lays the cards out so none overlap, including the one carrying an image', () => {
    const example = buildExampleCanvas(emptyCanvas());
    const heightOf = (n: Node) => (n.images.length > 0 ? 340 : NODE_HEIGHT);
    for (let i = 0; i < example.nodes.length; i++) {
      for (let j = i + 1; j < example.nodes.length; j++) {
        expect(overlaps(example.nodes[i]!, example.nodes[j]!, heightOf)).toBe(false);
      }
    }
  });

  it('does not claim measured results the example cannot back up', () => {
    const text = buildExampleCanvas(emptyCanvas()).nodes.map((n) => `${n.title} ${n.body}`).join(' ');
    expect(text).not.toMatch(/\b73%|\b3x\b/);
  });

  it('leaves a canvas that already has ideas untouched', () => {
    const existing = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    expect(buildExampleCanvas(existing)).toBe(existing);
  });
});
