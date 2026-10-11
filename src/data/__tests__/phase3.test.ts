import { beforeEach, describe, expect, it } from 'vitest';

import { addImage, addNode, describeImages, emptyCanvas } from '../mutators';
import { noteFor, scriptText, speakerNotesActions, useSpeakerNotesStore } from '../speakerNotes';
import { canvasActions, useCanvasStore } from '../store';
import type { Canvas, ImageEntry } from '../types';

const IMG1 = '00000000-0000-4000-8000-0000000000e1';
const IMG2 = '00000000-0000-4000-8000-0000000000e2';

const image = (id: string, extra: Partial<ImageEntry> = {}): ImageEntry => ({
  id,
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  addedAt: new Date(0).toISOString(),
  ...extra,
});

function withImages(): { canvas: Canvas; id: string } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  const id = c.nodes[0]!.id;
  c = addImage(c, id, image(IMG1));
  c = addImage(c, id, image(IMG2, { caption: 'Old', text: 'Old text' }));
  return { canvas: c, id };
}

describe('describeImages', () => {
  it('sets captions and text on matching images only', () => {
    const { canvas, id } = withImages();
    const next = describeImages(canvas, id, [
      { imageId: IMG1, caption: ' A chart. ', text: 'x'.repeat(5_000) },
      { imageId: '00000000-0000-4000-8000-000000000099', caption: 'Ghost', text: '' },
    ]);
    const [first, second] = next.nodes[0]!.images;
    expect(first).toMatchObject({ caption: 'A chart.' });
    expect(first!.text).toHaveLength(2_000);
    expect(second).toMatchObject({ caption: 'Old', text: 'Old text' });
  });

  it('drops old text when the new description has none', () => {
    const { canvas, id } = withImages();
    const next = describeImages(canvas, id, [{ imageId: IMG2, caption: 'New', text: '' }]);
    expect(next.nodes[0]!.images[1]).not.toHaveProperty('text');
    expect(next.nodes[0]!.images[1]!.caption).toBe('New');
  });

  it('leaves the canvas alone when nothing matches', () => {
    const { canvas, id } = withImages();
    expect(describeImages(canvas, id, [])).toBe(canvas);
    expect(describeImages(canvas, '00000000-0000-4000-8000-000000000099', [{ imageId: IMG1, caption: 'x', text: '' }])).toBe(canvas);
  });

  it('is one undo step through the store', () => {
    const { canvas, id } = withImages();
    canvasActions.loadCanvas(canvas);
    canvasActions.describeImages(id, [{ imageId: IMG1, caption: 'A chart.', text: '' }]);
    expect(useCanvasStore.getState().canvas.nodes[0]!.images[0]!.caption).toBe('A chart.');
    canvasActions.undo();
    expect(useCanvasStore.getState().canvas.nodes[0]!.images[0]!.caption).toBeUndefined();
  });
});

describe('speaker notes', () => {
  beforeEach(() => speakerNotesActions.clear());

  it('finds notes per idea and copies the script as text', () => {
    const notes = {
      canvasId: 'c1',
      opening: 'Hello.',
      steps: [
        { ideaId: 'a', note: 'First.' },
        { ideaId: 'b', note: '' },
      ],
      closing: 'Bye.',
      modelLabel: 'Gemini',
    };
    speakerNotesActions.set(notes);
    expect(useSpeakerNotesStore.getState().notes).toBe(notes);
    expect(noteFor(notes, 'a')).toBe('First.');
    expect(noteFor(notes, 'b')).toBeNull();
    expect(scriptText(notes, (id) => id.toUpperCase())).toBe('Hello.\n\n1. A\nFirst.\n\n2. B\n\nBye.');
  });
});
