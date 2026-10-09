import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addChild, addRoot, emptyCanvas } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';
import { formatNodeLabel, nodeLabel, nodeOrdinal, nodeOrdinals } from '../tree';
import type { Canvas } from '../types';

function reset(canvas: Canvas = emptyCanvas()): void {
  canvasActions.loadCanvas(canvas);
}

const canvas = () => useCanvasStore.getState().canvas;

describe('canvasActions — history', () => {
  beforeEach(() => {
    vi.useRealTimers();
    reset();
  });

  it('undo restores the canvas before the last edit and redo re-applies it', () => {
    canvasActions.addRoot({ x: 0, y: 0 });
    const rootId = canvas().nodes[0]!.id;
    canvasActions.moveNode(rootId, { x: 40, y: 40 });

    canvasActions.undo();
    expect(canvas().nodes[0]!.position).toEqual({ x: 0, y: 0 });
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);

    canvasActions.redo();
    expect(canvas().nodes).toHaveLength(1);
    canvasActions.redo();
    expect(canvas().nodes[0]!.position).toEqual({ x: 40, y: 40 });
  });

  it('a new edit clears the redo stack', () => {
    canvasActions.addRoot({ x: 0, y: 0 });
    canvasActions.undo();
    canvasActions.addRoot({ x: 5, y: 5 });
    canvasActions.redo();
    expect(canvas().nodes).toHaveLength(1);
    expect(canvas().nodes[0]!.position).toEqual({ x: 5, y: 5 });
  });

  it('coalesces a burst of typing into one undo step', () => {
    canvasActions.addRoot({ x: 0, y: 0 });
    const id = canvas().nodes[0]!.id;
    for (const title of ['H', 'He', 'Hel', 'Hell', 'Hello']) canvasActions.updateNode(id, { title });
    expect(canvas().nodes[0]!.title).toBe('Hello');

    canvasActions.undo();
    expect(canvas().nodes[0]!.title).toBe('');
    expect(canvas().nodes).toHaveLength(1);
  });

  it('undo clears selection and open dialogs that point at a node that no longer exists', () => {
    canvasActions.addRoot({ x: 0, y: 0 });
    const rootId = canvas().nodes[0]!.id;
    canvasActions.select(rootId);
    canvasActions.openEditor(rootId);

    canvasActions.undo();

    expect(useCanvasStore.getState().selection.nodeId).toBeNull();
    expect(useCanvasStore.getState().editor.openNodeId).toBeNull();
  });

  it('loadCanvas resets history so undo cannot cross into the previous project', () => {
    canvasActions.addRoot({ x: 0, y: 0 });
    const other = addRoot(emptyCanvas(), { position: { x: 1, y: 1 } });

    canvasActions.loadCanvas(other);
    canvasActions.undo();

    expect(canvas()).toBe(other);
  });

  it('a rejected write does not create an undo step', () => {
    canvasActions.undo(); // nothing to undo
    canvasActions.moveNode('11111111-1111-4111-8111-111111111111', { x: 1, y: 1 }); // unknown id: no-op
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);
  });
});

describe('canvasActions — title, layout and branch expansion', () => {
  beforeEach(() => reset());

  it('setTitle renames the canvas, bumps updatedAt and ignores an unchanged title', () => {
    const before = canvas();
    canvasActions.setTitle('Renamed');
    expect(canvas().title).toBe('Renamed');
    expect(canvas().updatedAt >= before.updatedAt).toBe(true);

    const same = canvas();
    canvasActions.setTitle('Renamed');
    expect(canvas()).toBe(same);
  });

  it('setTitle rejects a title over the limit and reports it', () => {
    const before = canvas();
    canvasActions.setTitle('x'.repeat(201));
    expect(canvas()).toBe(before);
  });

  it('applyCanvas validates: an invalid canvas is not committed', () => {
    let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 1, y: 1 } });
    reset(c);
    const before = canvas();
    const broken = { ...before, nodes: before.nodes.map((n) => ({ ...n, parentId: null })) };
    canvasActions.applyCanvas(broken);
    expect(canvas()).toBe(before);
  });

  it('expandSubtree reveals every collapsed descendant, not just one level', () => {
    let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const rootId = c.nodes[0]!.id;
    c = addChild(c, rootId, { position: { x: 1, y: 1 } });
    const childId = c.nodes[1]!.id;
    c = addChild(c, childId, { position: { x: 2, y: 2 } });
    c = { ...c, nodes: c.nodes.map((n) => (n.id === rootId || n.id === childId ? { ...n, collapsed: true } : n)) };
    reset(c);

    canvasActions.expandSubtree(rootId);

    expect(canvas().nodes.every((n) => !n.collapsed)).toBe(true);
  });

  it('setCollapsed(false) still reveals one level only', () => {
    let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const rootId = c.nodes[0]!.id;
    c = addChild(c, rootId, { position: { x: 1, y: 1 } });
    const childId = c.nodes[1]!.id;
    c = { ...c, nodes: c.nodes.map((n) => ({ ...n, collapsed: true })) };
    reset(c);

    canvasActions.setCollapsed(rootId, false);

    expect(canvas().nodes.find((n) => n.id === childId)!.collapsed).toBe(true);
  });
});

describe('node labels', () => {
  it('gives every idea a unique label, however many there are', () => {
    let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const rootId = c.nodes[0]!.id;
    for (let i = 0; i < 300; i++) c = addChild(c, rootId, { position: { x: i, y: i } });

    const ordinals = nodeOrdinals(c);
    const labels = c.nodes.map((n) => nodeLabel(n, ordinals));

    // Exactly one ROOT; the other 300 labels are all different.
    expect(labels.filter((l) => l === 'ROOT')).toHaveLength(1);
    expect(new Set(labels.filter((l) => l !== 'ROOT')).size).toBe(300);
  });

  it('nodeOrdinal agrees with nodeOrdinals for every node', () => {
    let c = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    for (let i = 0; i < 20; i++) c = addChild(c, c.nodes[0]!.id, { position: { x: i, y: i } });
    const all = nodeOrdinals(c);
    for (const n of c.nodes) {
      expect(nodeOrdinal(c, n.id)).toBe(all.get(n.id));
      expect(formatNodeLabel(n, nodeOrdinal(c, n.id))).toBe(nodeLabel(n, all));
    }
  });
});
