import type { JSONContent } from '@tiptap/core';
import { describe, expect, test } from 'vitest';

import type { Node } from '../../data';
import { documentToMarkdown } from '../export/markdown';
import { IDEA_CARD, IDEA_REF } from '../links';

const TS = '2024-01-01T00:00:00.000Z';
const F1 = '00000000-0000-4000-8000-000000000001';
const C1 = '00000000-0000-4000-8000-000000000002';
const GONE = '00000000-0000-4000-8000-000000000009';

function idea(id: string, type: Node['type'], title: string, body = ''): Node {
  return { id, type, title, body, images: [], position: { x: 0, y: 0 }, collapsed: false, createdAt: TS, updatedAt: TS };
}

const ideas = new Map<string, Node>([
  [F1, idea(F1, 'finding', 'Annual wins 3 to 1', 'Survey of 400 buyers, see [the report](https://example.com/report).\n\nSecond paragraph.')],
  [C1, idea(C1, 'conclusion', 'Lead with annual', 'We should default to annual.')],
]);

const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const t = (text: string, ...marks: string[]): JSONContent =>
  marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text };
const ref = (id: string, label: string): JSONContent => ({ type: IDEA_REF, attrs: { id, label } });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

describe('documentToMarkdown', () => {
  test('mentions become numbered footnotes, reused when an idea comes up again', () => {
    const md = documentToMarkdown({
      title: 'Pricing',
      content: doc(p(t('Buyers prefer '), ref(F1, 'old label'), t('.')), p(t('Again: '), ref(F1, ''), t(' and '), ref(C1, ''))),
      ideas,
    });
    expect(md).toBe(
      [
        '# Pricing',
        '',
        'Buyers prefer Annual wins 3 to 1[^1].',
        '',
        'Again: Annual wins 3 to 1[^1] and Lead with annual[^2]',
        '',
        '[^1]: Annual wins 3 to 1 (Finding). Survey of 400 buyers, see the report. https://example.com/report',
        '[^2]: Lead with annual (Conclusion). We should default to annual.',
        '',
      ].join('\n'),
    );
  });

  test('an idea deleted from the canvas keeps its saved label', () => {
    const md = documentToMarkdown({ title: '', content: doc(p(ref(GONE, 'Old idea'))), ideas });
    expect(md).toContain('Old idea[^1]');
    expect(md).toContain('[^1]: Old idea (no longer on the canvas).');
  });

  test('formatting, headings, lists, tasks, quotes, code and tables', () => {
    const md = documentToMarkdown({
      title: '',
      ideas,
      content: doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('Method')] },
        p(t('bold', 'bold'), t(' and '), t('code', 'code'), t(' and '), {
          type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.org' } }],
        }),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one'))] }, { type: 'listItem', content: [p(t('two'))] }] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }] },
        { type: 'blockquote', content: [p(t('quoted'))] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1;')] },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('A'))] }, { type: 'tableHeader', content: [p(t('B'))] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('1'))] }, { type: 'tableCell', content: [p(t('2'))] }] },
          ],
        },
      ),
    });
    expect(md).toBe(
      [
        '## Method',
        '',
        '**bold** and `code` and [link](https://x.org)',
        '',
        '- one\n- two',
        '',
        '3. three',
        '',
        '- [x] done',
        '',
        '> quoted',
        '',
        '```ts\nconst a = 1;\n```',
        '',
        '| A | B |\n| --- | --- |\n| 1 | 2 |',
        '',
      ].join('\n'),
    );
  });

  test('text that looks like Markdown is escaped', () => {
    const md = documentToMarkdown({ title: '', ideas, content: doc(p(t('# not a heading *or* [link]'))) });
    expect(md).toBe('\\# not a heading \\*or\\* \\[link\\]\n');
  });

  test('an embedded idea card becomes a quote of the idea with a footnote', () => {
    const md = documentToMarkdown({ title: '', ideas, content: doc({ type: IDEA_CARD, attrs: { nodeId: C1, label: '' } }) });
    expect(md).toBe('> **Lead with annual**[^1]\n>\n> We should default to annual.\n\n[^1]: Lead with annual (Conclusion). We should default to annual.\n');
  });

  test('images get an address that works outside the app', () => {
    const md = documentToMarkdown({
      title: '',
      ideas,
      content: doc({ type: 'image', attrs: { src: '/api/assets/a.png', alt: 'Chart' } }),
      resolveSrc: (s) => `https://root.app${s}`,
    });
    expect(md).toBe('![Chart](https://root.app/api/assets/a.png)\n');
  });
});
