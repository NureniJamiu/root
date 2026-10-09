import { beforeEach, describe, expect, it } from 'vitest';

import { addChild, addNode, collapseMany, emptyCanvas, expandMany } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import { visibleNodeIds } from '../../data/graph';
import type { Canvas, UUID } from '../../data/types';
import { nextToReveal, shownNodeIds, useWalkthroughStore, walkthroughActions } from '../walkthrough';

/**
 *        root
 *       /    \
 *     a (y=0)  b (y=100)
 *     |
 *     a1
 */
function tree(): { canvas: Canvas; root: UUID; a: UUID; b: UUID; a1: UUID } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 50 } });
  const root = c.nodes[0]!.id;
  c = addChild(c, root, { position: { x: 300, y: 100 } });
  const b = c.nodes[1]!.id;
  c = addChild(c, root, { position: { x: 300, y: 0 } });
  const a = c.nodes[2]!.id;
  c = addChild(c, a, { position: { x: 600, y: 0 } });
  const a1 = c.nodes[3]!.id;
  return { canvas: c, root, a, b, a1 };
}

describe('collapseMany / expandMany', () => {
  it('collapses only ideas that have something below them', () => {
    const { canvas, root, a, b } = tree();
    const next = collapseMany(canvas, [root, a, b]);
    const flags = new Map(next.nodes.map((n) => [n.id, n.collapsed]));
    expect(flags.get(root)).toBe(true);
    expect(flags.get(a)).toBe(true);
    expect(flags.get(b)).toBe(false);
    expect([...visibleNodeIds(next)]).toEqual([root]);
  });

  it('returns the same canvas when nothing changes', () => {
    const { canvas, b } = tree();
    expect(collapseMany(canvas, [b])).toBe(canvas);
    expect(expandMany(canvas, [b])).toBe(canvas);
  });

  it('expands a branch all the way down', () => {
    const { canvas, root, a } = tree();
    const collapsed = collapseMany(canvas, [root, a]);
    const expanded = expandMany(collapsed, [root]);
    expect(expanded.nodes.every((n) => !n.collapsed)).toBe(true);
  });
});

describe('walkthrough', () => {
  let t: ReturnType<typeof tree>;

  beforeEach(() => {
    t = tree();
    canvasActions.loadCanvas(t.canvas);
    walkthroughActions.end();
  });

  it('reveals children top to bottom, then the next level', () => {
    const c = collapseMany(t.canvas, [t.root, t.a]);
    const order: UUID[] = [];
    let revealed: UUID[] = [];
    for (;;) {
      const id = nextToReveal(c, shownNodeIds(c, revealed), null);
      if (id === null) break;
      order.push(id);
      revealed = [...revealed, id];
    }
    expect(order).toEqual([t.a, t.b, t.a1]);
  });

  it('collapses the scope when starting with nothing hidden, steps forward and back, and keeps the result', () => {
    walkthroughActions.start(null);
    expect(useWalkthroughStore.getState()).toMatchObject({ active: true, total: 3 });
    expect([...visibleNodeIds(useCanvasStore.getState().canvas)]).toEqual([t.root]);

    expect(walkthroughActions.next()).toBe(t.a);
    walkthroughActions.back();
    expect(useWalkthroughStore.getState().revealed).toEqual([]);

    walkthroughActions.next();
    walkthroughActions.next();
    expect(walkthroughActions.next()).toBe(t.a1);

    // Last one revealed: the canvas is expanded for real.
    const canvas = useCanvasStore.getState().canvas;
    expect(canvas.nodes.every((n) => !n.collapsed)).toBe(true);
    expect(useWalkthroughStore.getState().revealed).toEqual([]);
    expect(walkthroughActions.next()).toBeNull();
  });

  it('only walks the selected branch', () => {
    walkthroughActions.start([t.a]);
    expect(useWalkthroughStore.getState().total).toBe(1);
    expect(walkthroughActions.next()).toBe(t.a1);
    expect(walkthroughActions.next()).toBeNull();
  });

  it('ending part-way hides what was revealed again', () => {
    walkthroughActions.start(null);
    walkthroughActions.next();
    walkthroughActions.end();
    const canvas = useCanvasStore.getState().canvas;
    expect([...shownNodeIds(canvas, useWalkthroughStore.getState().revealed)]).toEqual([t.root]);
  });
});
