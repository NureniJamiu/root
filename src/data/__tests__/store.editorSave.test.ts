import { beforeEach, describe, expect, it } from 'vitest';

import { emptyCanvas } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';
import type { ImageEntry } from '../types';

const canvas = () => useCanvasStore.getState().canvas;

const image = (id: string): ImageEntry => ({
  id,
  dataUrl: 'data:image/png;base64,AAAA',
  addedAt: new Date(0).toISOString(),
});

describe('canvasActions — editor save and cancel', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
  });

  it('saveNodeEdits writes text, type and images as one undo step and closes the editor', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const id = canvas().nodes[0]!.id;

    canvasActions.saveNodeEdits(id, {
      title: 'Saved',
      body: 'Body',
      type: 'finding',
      images: [image('11111111-1111-4111-8111-111111111111')],
    });

    const node = canvas().nodes[0]!;
    expect(node.title).toBe('Saved');
    expect(node.body).toBe('Body');
    expect(node.type).toBe('finding');
    expect(node.images.map((i) => i.id)).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(useCanvasStore.getState().editor.openNodeId).toBeNull();

    canvasActions.undo();
    expect(canvas().nodes[0]!.title).toBe('');
    expect(canvas().nodes[0]!.images).toHaveLength(0);
  });

  it('saveNodeEdits with nothing changed adds no undo step', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const node = canvas().nodes[0]!;
    canvasActions.saveNodeEdits(node.id, {
      title: node.title,
      body: node.body,
      type: node.type,
      images: node.images,
    });
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);
  });

  it('discardNewNode removes a just-added child and its connector without an undo step', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const parentId = canvas().nodes[0]!.id;
    canvasActions.addChild(parentId, { x: 200, y: 0 });
    const childId = useCanvasStore.getState().editor.openNodeId!;
    expect(canvas().edges).toHaveLength(1);

    canvasActions.discardNewNode(childId);

    expect(canvas().nodes.map((n) => n.id)).toEqual([parentId]);
    expect(canvas().edges).toHaveLength(0);
    expect(useCanvasStore.getState().editor.openNodeId).toBeNull();

    // The next undo goes back past the parent's add, not to the discarded child.
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);
    canvasActions.redo();
    expect(canvas().nodes.map((n) => n.id)).toEqual([parentId]);
  });
});
