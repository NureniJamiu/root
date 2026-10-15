// @vitest-environment node
import type { JSONContent } from '@tiptap/core';
import JSZip from 'jszip';
import { expect, test } from 'vitest';

import type { Node } from '../../data';
import { documentToDocx } from '../export/docx';
import { IDEA_CARD, IDEA_REF } from '../links';

const TS = '2024-01-01T00:00:00.000Z';
const F1 = '00000000-0000-4000-8000-000000000001';

const ideas = new Map<string, Node>([
  [F1, {
    id: F1, type: 'finding', title: 'Annual wins 3 to 1', body: 'Survey of 400 buyers. https://example.com/report',
    images: [], position: { x: 0, y: 0 }, collapsed: false, createdAt: TS, updatedAt: TS,
  }],
]);

async function unzip(blob: Blob): Promise<{ body: string; notes: string }> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    body: (await zip.file('word/document.xml')?.async('string')) ?? '',
    notes: (await zip.file('word/footnotes.xml')?.async('string')) ?? '',
  };
}

test('mentions become Word footnotes with the idea and its sources', async () => {
  const content: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Findings' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Buyers prefer ' }, { type: IDEA_REF, attrs: { id: F1, label: '' } }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }] },
      { type: IDEA_CARD, attrs: { nodeId: F1, label: '' } },
      { type: 'image', attrs: { src: '/missing.png', alt: 'Chart' } },
    ],
  };
  const { body, notes } = await unzip(await documentToDocx({ title: 'Pricing', content, ideas }));

  expect(body).toContain('Pricing');
  expect(body).toContain('w:val="Heading2"');
  expect(body).toContain('Buyers prefer ');
  expect(body).toContain('Annual wins 3 to 1');
  expect(body.match(/<w:footnoteReference w:id="\d+"\/>/g)).toHaveLength(2);
  expect(body).toContain('[Image: Chart]');
  expect(notes).toContain('Annual wins 3 to 1 (Finding). Survey of 400 buyers. https://example.com/report');
});
