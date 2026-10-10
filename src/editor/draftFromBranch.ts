/**
 * Turn a branch of the canvas into the skeleton of a document.
 *
 * The chosen idea becomes the document's title and opening, its connected
 * ideas become sections (H2), theirs subsections (H3), and anything deeper a
 * bulleted outline. Every heading and bullet starts with a mention of its
 * idea, so the draft stays linked to the canvas, and each idea's notes become
 * starter paragraphs. Children are ordered top-to-bottom, then left-to-right,
 * the way they sit on the canvas. Deterministic and offline: no AI involved.
 */

import type { JSONContent } from '@tiptap/core';

import { outgoingIndex } from '../data';
import type { Canvas, Node, UUID } from '../data';
import { parseMarkdown } from '../lib/markdown';
import type { Inline } from '../lib/markdown';

import { IDEA_REF } from './links';

function mention(node: Node): JSONContent {
  return { type: IDEA_REF, attrs: { id: node.id, label: node.title || 'Untitled idea' } };
}

function textRuns(runs: readonly Inline[]): JSONContent[] {
  return runs
    .filter((r) => r.text.length > 0)
    .map((r) => {
      const marks: JSONContent['marks'] = [];
      if (r.bold) marks.push({ type: 'bold' });
      if (r.italic) marks.push({ type: 'italic' });
      if (r.strike) marks.push({ type: 'strike' });
      if (r.code) marks.push({ type: 'code' });
      if (r.href) marks.push({ type: 'link', attrs: { href: r.href } });
      return marks.length > 0 ? { type: 'text', text: r.text, marks } : { type: 'text', text: r.text };
    });
}

/** An idea's Markdown notes as document blocks. */
export function notesToBlocks(body: string): JSONContent[] {
  return parseMarkdown(body).map((block): JSONContent => {
    if (block.kind === 'list') {
      return {
        type: block.ordered ? 'orderedList' : 'bulletList',
        content: block.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: textRuns(item) }],
        })),
      };
    }
    if (block.kind === 'heading') {
      return { type: 'paragraph', content: textRuns(block.inlines.map((i) => ({ ...i, bold: true as const }))) };
    }
    const content: JSONContent[] = [];
    block.lines.forEach((line, i) => {
      if (i > 0) content.push({ type: 'hardBreak' });
      content.push(...textRuns(line));
    });
    return { type: 'paragraph', content };
  });
}

function childrenOf(canvas: Canvas, out: Map<UUID, { target: UUID }[]>, id: UUID, seen: Set<UUID>): Node[] {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const kids: Node[] = [];
  for (const e of out.get(id) ?? []) {
    const child = byId.get(e.target);
    if (child && !seen.has(child.id)) {
      seen.add(child.id);
      kids.push(child);
    }
  }
  return kids.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
}

export interface BranchDraft {
  readonly title: string;
  readonly content: JSONContent;
  /** Ideas included in the draft. */
  readonly ideaCount: number;
}

export function draftFromBranch(canvas: Canvas, rootId: UUID): BranchDraft | null {
  const root = canvas.nodes.find((n) => n.id === rootId);
  if (!root) return null;
  const out = outgoingIndex(canvas);
  const seen = new Set<UUID>([root.id]);
  const content: JSONContent[] = [];

  content.push({ type: 'paragraph', content: [{ type: 'text', text: 'Draft from ' }, mention(root)] });
  content.push(...notesToBlocks(root.body));

  const outline = (node: Node): JSONContent => {
    const kids = childrenOf(canvas, out, node.id, seen);
    const item: JSONContent = {
      type: 'listItem',
      content: [{ type: 'paragraph', content: [mention(node)] }],
    };
    if (kids.length > 0) item.content!.push({ type: 'bulletList', content: kids.map(outline) });
    return item;
  };

  for (const section of childrenOf(canvas, out, root.id, seen)) {
    content.push({ type: 'heading', attrs: { level: 2 }, content: [mention(section)] });
    content.push(...notesToBlocks(section.body));
    for (const sub of childrenOf(canvas, out, section.id, seen)) {
      content.push({ type: 'heading', attrs: { level: 3 }, content: [mention(sub)] });
      content.push(...notesToBlocks(sub.body));
      const deeper = childrenOf(canvas, out, sub.id, seen);
      if (deeper.length > 0) content.push({ type: 'bulletList', content: deeper.map(outline) });
    }
  }
  content.push({ type: 'paragraph' });

  return {
    title: root.title || 'Untitled draft',
    content: { type: 'doc', content },
    ideaCount: seen.size,
  };
}
