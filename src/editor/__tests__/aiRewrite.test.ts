import { beforeEach, describe, expect, it } from 'vitest';

import { canvasActions, emptyCanvas, useCanvasStore } from '../../data';
import { rewriteToContent } from '../aiRewrite';
import { IDEA_REF } from '../links';

describe('rewriteToContent', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
  });

  it('keeps one paragraph inline with its citations', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const idea = useCanvasStore.getState().canvas.nodes[0]!;
    const out = rewriteToContent(`Short version [[${idea.id}]].`);
    expect(out.inline).toBe(true);
    expect(out.content[1]).toEqual({ type: IDEA_REF, attrs: { id: idea.id, label: 'Untitled idea' } });
  });

  it('splits several paragraphs into blocks', () => {
    const out = rewriteToContent('One.\n\nTwo\nlines.\n\n');
    expect(out.inline).toBe(false);
    expect(out.content.map((b) => b.content![0]!.text)).toEqual(['One.', 'Two lines.']);
  });
});
