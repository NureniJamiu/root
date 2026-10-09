import { beforeEach, describe, expect, it } from 'vitest';

import { canvasSchema } from '../schema';
import { childReveals, hasHiddenChildren, hiddenDescendantCount, visibleNodeIds } from '../graph';
import { addChild, addNode, collapseMany, emptyCanvas, expandMany, hideChild, revealChild, setCollapsed } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';
import type { Canvas, UUID } from '../types';

/**
 * root ─┬─ a ── a1
 *       ├─ b
 *       └─ c
 * Children are placed left to right so the reveal list reads a, b, c.
 */
function tree(): { c: Canvas; root: UUID; a: UUID; b: UUID; cc: UUID; a1: UUID } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  const root = c.nodes[0]!.id;
  const child = (parent: UUID, x: number, y: number): UUID => {
    const before = new Set(c.nodes.map((n) => n.id));
    c = addChild(c, parent, { position: { x, y } });
    return c.nodes.find((n) => !before.has(n.id))!.id;
  };
  const a = child(root, 0, 200);
  const b = child(root, 300, 200);
  const cc = child(root, 600, 200);
  const a1 = child(a, 0, 400);
  return { c, root, a, b, cc, a1 };
}

const shown = (c: Canvas, parent: UUID) => childReveals(c, parent).map((r) => r.shown);

describe('revealChild / hideChild', () => {
  it('reveals one child of a collapsed parent and keeps its siblings hidden', () => {
    const t = tree();
    const collapsed = setCollapsed(t.c, t.root, true);
    const c = revealChild(collapsed, t.root, t.b);

    const visible = visibleNodeIds(c);
    expect(visible.has(t.b)).toBe(true);
    expect(visible.has(t.a)).toBe(false);
    expect(visible.has(t.cc)).toBe(false);
    expect(shown(c, t.root)).toEqual([false, true, false]);
    expect(hasHiddenChildren(c, t.root)).toBe(true);
    expect(c.nodes.find((n) => n.id === t.root)!.collapsed).toBe(false);
  });

  it('reveals children in any order and ends plainly expanded when all are shown', () => {
    const t = tree();
    let c = setCollapsed(t.c, t.root, true);
    c = revealChild(c, t.root, t.cc);
    c = revealChild(c, t.root, t.a);
    expect(shown(c, t.root)).toEqual([true, false, true]);
    c = revealChild(c, t.root, t.b);

    expect(shown(c, t.root)).toEqual([true, true, true]);
    expect(c.edges.some((e) => e.hidden === true)).toBe(false);
    expect(hasHiddenChildren(c, t.root)).toBe(false);
  });

  it('keeps a revealed child that has children of its own collapsed', () => {
    const t = tree();
    let c = setCollapsed(t.c, t.root, true);
    c = revealChild(c, t.root, t.a);
    expect(c.nodes.find((n) => n.id === t.a)!.collapsed).toBe(true);
    expect(visibleNodeIds(c).has(t.a1)).toBe(false);
  });

  it('hides a shown child, and hiding the last one collapses the parent', () => {
    const t = tree();
    let c = hideChild(t.c, t.root, t.a);
    expect(visibleNodeIds(c).has(t.a)).toBe(false);
    expect(visibleNodeIds(c).has(t.a1)).toBe(false);
    expect(hiddenDescendantCount(c, t.root)).toBe(2);

    c = hideChild(c, t.root, t.b);
    c = hideChild(c, t.root, t.cc);
    const root = c.nodes.find((n) => n.id === t.root)!;
    expect(root.collapsed).toBe(true);
    expect(c.edges.some((e) => e.hidden === true)).toBe(false);
  });

  it('is a no-op for a node that is not a child, or already in the requested state', () => {
    const t = tree();
    expect(revealChild(t.c, t.root, t.a)).toBe(t.c);
    expect(revealChild(t.c, t.root, t.a1)).toBe(t.c);
    const hidden = hideChild(t.c, t.root, t.b);
    expect(hideChild(hidden, t.root, t.b)).toBe(hidden);
  });

  it('expand all and expanding the parent clear the one-by-one state', () => {
    const t = tree();
    const partial = revealChild(setCollapsed(t.c, t.root, true), t.root, t.b);

    const expanded = setCollapsed(partial, t.root, false);
    expect(expanded.edges.some((e) => e.hidden === true)).toBe(false);
    expect(visibleNodeIds(expanded).has(t.a)).toBe(true);

    const all = expandMany(partial, partial.nodes.map((n) => n.id));
    expect(all.edges.some((e) => e.hidden === true)).toBe(false);
    expect(visibleNodeIds(all).size).toBe(all.nodes.length);

    const collapsed = collapseMany(partial, [t.root]);
    expect(collapsed.edges.some((e) => e.hidden === true)).toBe(false);
    expect(visibleNodeIds(collapsed).has(t.b)).toBe(false);
  });

  it('a hidden connector does not hide a child that another shown idea also points to', () => {
    const t = tree();
    const other = { ...t.c.edges.find((e) => e.target === t.b)!, id: '00000000-0000-4000-8000-0000000000aa', source: t.cc };
    const c0 = { ...t.c, edges: [...t.c.edges, other] };
    const c = hideChild(c0, t.root, t.b);
    expect(visibleNodeIds(c).has(t.b)).toBe(true);
    expect(childReveals(c, t.root).find((r) => r.node.id === t.b)!.shown).toBe(false);
  });

  it('the hidden flag survives the schema', () => {
    const t = tree();
    const c = hideChild(t.c, t.root, t.a);
    const parsed = canvasSchema.parse(JSON.parse(JSON.stringify(c)));
    expect(parsed.edges.filter((e) => e.hidden === true)).toHaveLength(1);
  });
});

describe('canvasActions.revealChild / hideChild', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
  });

  it('each reveal is one undo step', () => {
    const t = tree();
    canvasActions.loadCanvas(setCollapsed(t.c, t.root, true));
    canvasActions.revealChild(t.root, t.cc);
    canvasActions.revealChild(t.root, t.a);
    const canvas = () => useCanvasStore.getState().canvas;
    expect(shown(canvas(), t.root)).toEqual([true, false, true]);

    canvasActions.undo();
    expect(shown(canvas(), t.root)).toEqual([false, false, true]);
    canvasActions.hideChild(t.root, t.cc);
    expect(canvas().nodes.find((n) => n.id === t.root)!.collapsed).toBe(true);
  });
});
