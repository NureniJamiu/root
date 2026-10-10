import { describe, expect, it } from 'vitest';

import { addChild, addNode, emptyCanvas, updateNode } from '../../data';
import { aiDraftToDocument, linkCitations } from '../aiDraft';
import { IDEA_REF } from '../links';

function branch() {
  let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
  const root = canvas.nodes[0]!.id;
  canvas = updateNode(canvas, root, { title: 'Sleep and memory' });
  canvas = addChild(canvas, root, { position: { x: 400, y: 0 } });
  const child = canvas.nodes[1]!.id;
  canvas = updateNode(canvas, child, { title: 'REM helps skills' });
  canvas = addChild(canvas, child, { position: { x: 800, y: 0 } });
  const grandchild = canvas.nodes[2]!.id;
  canvas = updateNode(canvas, grandchild, { title: 'Naps' });
  return { canvas, root, child, grandchild };
}

describe('AI drafts', () => {
  it('turns [[id]] citations into mentions and drops unknown ones', () => {
    const { canvas, child } = branch();
    const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
    const out = linkCitations(
      [{ type: 'paragraph', content: [{ type: 'text', text: `Skills improve [[${child}]] after sleep [[nope]].` }] }],
      byId,
    );
    expect(out[0]!.content).toEqual([
      { type: 'text', text: 'Skills improve ' },
      { type: IDEA_REF, attrs: { id: child, label: 'REM helps skills' } },
      { type: 'text', text: ' after sleep ' },
      { type: 'text', text: '.' },
    ]);
  });

  it('builds headings by depth with mentions', () => {
    const { canvas, root, child, grandchild } = branch();
    const doc = aiDraftToDocument(canvas, root, {
      title: 'A draft',
      intro: 'Intro text.',
      sections: [
        { ideaId: child, text: `About REM [[${child}]].` },
        { ideaId: grandchild, text: 'About naps.' },
      ],
    })!;
    expect(doc.title).toBe('A draft');
    const headings = doc.content.content!.filter((b) => b.type === 'heading');
    expect(headings.map((h) => [h.attrs!.level, h.content![0]!.attrs!.id])).toEqual([
      [2, child],
      [3, grandchild],
    ]);
    expect(JSON.stringify(doc.content)).toContain('Drafted with AI from');
    expect(aiDraftToDocument(canvas, '00000000-0000-4000-8000-000000000000', { title: '', intro: '', sections: [] })).toBeNull();
  });
});
