import { beforeEach, describe, expect, test } from 'vitest';

import { addNode, emptyCanvas, updateNode } from '../mutators';
import { canvasSchema } from '../schema';
import { cleanSource, sameSource } from '../source';
import { canvasActions, useCanvasStore } from '../store';

describe('cleanSource', () => {
  test('trims, drops empty and invalid fields', () => {
    expect(
      cleanSource({
        kind: 'web',
        title: '  Why   we sleep ',
        authors: ['Ada Lovelace', '', '  '],
        published: '18 March',
        url: 'javascript:alert(1)',
        doi: 'https://doi.org/10.1/abc',
        quote: '',
      }),
    ).toEqual({ kind: 'web', title: 'Why we sleep', authors: ['Ada Lovelace'], doi: '10.1/abc' });
  });

  test('nothing left to cite is null', () => {
    expect(cleanSource({ kind: 'web', title: ' ', authors: [''] })).toBeNull();
    expect(sameSource({ kind: 'book' }, undefined)).toBe(true);
  });
});

describe('updateNode with a source', () => {
  test('sets a clean source that passes the schema, and null removes it', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    const id = c.nodes[0]!.id;
    c = updateNode(c, id, { source: { kind: 'web', url: 'https://example.com', title: ' Page ' } });
    expect(c.nodes[0]!.source).toEqual({ kind: 'web', url: 'https://example.com', title: 'Page' });
    expect(canvasSchema.safeParse(c).success).toBe(true);
    c = updateNode(c, id, { source: null });
    expect('source' in c.nodes[0]!).toBe(false);
  });
});

describe('saveNodeEdits', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
    canvasActions.addNode({ x: 0, y: 0 });
  });

  test('saves a source with the other edits', () => {
    const node = useCanvasStore.getState().canvas.nodes[0]!;
    canvasActions.saveNodeEdits(node.id, {
      title: 'T', body: '', type: 'finding', images: [], source: { kind: 'book', title: 'Why We Sleep' },
    });
    expect(useCanvasStore.getState().canvas.nodes[0]!.source).toEqual({ kind: 'book', title: 'Why We Sleep' });
  });
});
