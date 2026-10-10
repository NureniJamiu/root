import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { addChild, addNode, emptyCanvas, updateNode } from '../../data/mutators';
import type { Canvas } from '../../data/types';
import { draftFromBranch, notesToBlocks } from '../draftFromBranch';
import { extractLinks } from '../links';
import { documentSchema } from '../schema';

function lastNodeId(canvas: Canvas): string {
  return canvas.nodes[canvas.nodes.length - 1]!.id;
}

function branch(): { canvas: Canvas; root: string; a: string; b: string; a1: string; a1x: string } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  const root = c.nodes[0]!.id;
  c = updateNode(c, root, { title: 'Main question', body: 'Why does **this** happen?' });
  c = addChild(c, root, { position: { x: 300, y: 200 } });
  const b = lastNodeId(c);
  c = updateNode(c, b, { title: 'Second angle' });
  c = addChild(c, root, { position: { x: 300, y: 0 } });
  const a = lastNodeId(c);
  c = updateNode(c, a, { title: 'First angle', body: '- point one\n- point two' });
  c = addChild(c, a, { position: { x: 600, y: 0 } });
  const a1 = lastNodeId(c);
  c = updateNode(c, a1, { title: 'Detail' });
  c = addChild(c, a1, { position: { x: 900, y: 0 } });
  const a1x = lastNodeId(c);
  c = updateNode(c, a1x, { title: 'Deeper' });
  return { canvas: c, root, a, b, a1, a1x };
}

function headings(doc: JSONContent, level: number): string[] {
  return (doc.content ?? [])
    .filter((n) => n.type === 'heading' && n.attrs?.level === level)
    .map((n) => (n.content ?? []).map((c) => c.attrs?.label ?? c.text).join(''));
}

describe('drafting a document from a branch', () => {
  it('turns the branch into sections, ordered as on the canvas', () => {
    const { canvas, root } = branch();
    const draft = draftFromBranch(canvas, root)!;
    expect(draft.title).toBe('Main question');
    expect(draft.ideaCount).toBe(5);
    expect(headings(draft.content, 2)).toEqual(['First angle', 'Second angle']);
    expect(headings(draft.content, 3)).toEqual(['Detail']);
    expect(JSON.stringify(draft.content)).toContain('Deeper');
  });

  it('cites every idea it includes and fits the document schema', () => {
    const { canvas, root, a, b, a1, a1x } = branch();
    const draft = draftFromBranch(canvas, root)!;
    expect(new Set(extractLinks(draft.content).mentions)).toEqual(new Set([root, a, b, a1, a1x]));
    expect(() => documentSchema().nodeFromJSON(draft.content).check()).not.toThrow();
  });

  it('survives a cycle and an unknown idea', () => {
    const built = branch();
    const { root, a1x } = built;
    let { canvas } = built;
    canvas = { ...canvas, edges: [...canvas.edges, { ...canvas.edges[0]!, id: crypto.randomUUID(), source: a1x, target: root }] };
    expect(draftFromBranch(canvas, root)?.ideaCount).toBe(5);
    expect(draftFromBranch(canvas, 'missing')).toBeNull();
  });

  it('turns Markdown notes into document blocks', () => {
    const blocks = notesToBlocks('Hello **there**\nnext\n\n- a\n- b');
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'there', marks: [{ type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'next' },
      ],
    });
    expect(blocks[1]?.type).toBe('bulletList');
  });
});
