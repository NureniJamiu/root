/**
 * Starting points for a new document. Each is ordinary document content the
 * writer replaces; headings carry the structure, placeholders say what goes
 * under them.
 */

import type { JSONContent } from '@tiptap/core';

import { emptyDocument } from './links';

export interface DocumentTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly content: () => JSONContent;
}

const h = (level: 2 | 3, text: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});
const hint = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks: [{ type: 'italic' }] }],
});
const todo = (...items: string[]): JSONContent => ({
  type: 'taskList',
  content: items.map((text) => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })),
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content: [...content, { type: 'paragraph' }] });

export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
  {
    id: 'blank',
    name: 'Blank document',
    description: 'Start from an empty page.',
    content: emptyDocument,
  },
  {
    id: 'brief',
    name: 'Research brief',
    description: 'Question, findings, evidence and what to do next.',
    content: () =>
      doc(
        h(2, 'Question'),
        hint('What are you trying to find out, and why does it matter? Type @ to cite an idea from the canvas.'),
        h(2, 'Key findings'),
        hint('One short paragraph per finding. Drag a card in to show it here.'),
        h(2, 'Evidence'),
        hint('What supports each finding, and how strong is it?'),
        h(2, 'Open questions'),
        todo('First thing still unknown'),
        h(2, 'Conclusion'),
        hint('What you now believe, and what you would do next.'),
      ),
  },
  {
    id: 'literature',
    name: 'Literature review',
    description: 'Themes across sources, gaps and where your work fits.',
    content: () =>
      doc(
        h(2, 'Scope'),
        hint('Which question, field and time span does this review cover?'),
        h(2, 'Themes'),
        h(3, 'Theme one'),
        hint('What the sources agree and disagree on.'),
        h(3, 'Theme two'),
        hint('What the sources agree and disagree on.'),
        h(2, 'Gaps'),
        hint('What nobody has answered yet.'),
        h(2, 'Sources'),
        hint('Author, year, title and a link for each source.'),
      ),
  },
  {
    id: 'notes',
    name: 'Meeting or interview notes',
    description: 'Who, what was said, and follow-ups.',
    content: () =>
      doc(
        h(2, 'Who and when'),
        hint('People, date and context.'),
        h(2, 'Notes'),
        hint('What was said. Highlight text and choose Make idea to send a finding to the canvas.'),
        h(2, 'Follow-ups'),
        todo('Follow-up'),
      ),
  },
];
