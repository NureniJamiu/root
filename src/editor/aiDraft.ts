/**
 * Turn an AI-written draft into a document linked to the canvas.
 *
 * The model returns prose per idea with citations written as `[[<idea id>]]`;
 * here each section gets a heading that mentions its idea (H2 for ideas
 * connected straight from the root, H3 below that), and every citation
 * becomes a mention, so the draft stays tied to the map like a branch draft.
 * Citations of ideas that are not on the canvas are dropped.
 */

import type { JSONContent } from '@tiptap/core';

import { outgoingIndex } from '../data';
import type { Canvas, Node, UUID } from '../data';
import type { DraftOutput } from '../lib/ai/contracts';

import { notesToBlocks } from './draftFromBranch';
import { IDEA_REF } from './links';

const CITATION = /\[\[([^\]\s]{1,64})\]\]/g;

function mention(node: Node): JSONContent {
  return { type: IDEA_REF, attrs: { id: node.id, label: node.title || 'Untitled idea' } };
}

/** Replace `[[id]]` markers in text nodes with mentions of the ideas they name. */
export function linkCitations(blocks: readonly JSONContent[], byId: ReadonlyMap<string, Node>): JSONContent[] {
  const visit = (node: JSONContent): JSONContent[] => {
    if (node.type === 'text' && typeof node.text === 'string' && node.text.includes('[[')) {
      const out: JSONContent[] = [];
      let last = 0;
      for (const match of node.text.matchAll(CITATION)) {
        const before = node.text.slice(last, match.index).replace(/\s+$/, match.index > 0 ? ' ' : '');
        if (before) out.push({ ...node, text: before });
        const idea = byId.get(match[1]!);
        if (idea) out.push(mention(idea));
        last = match.index + match[0].length;
      }
      const rest = node.text.slice(last);
      if (rest) out.push({ ...node, text: rest });
      return out;
    }
    if (!node.content) return [node];
    return [{ ...node, content: node.content.flatMap(visit) }];
  };
  return blocks.flatMap(visit);
}

/** Depth of each idea below `rootId`, following connectors. */
function depths(canvas: Canvas, rootId: UUID): Map<UUID, number> {
  const out = outgoingIndex(canvas);
  const depth = new Map<UUID, number>([[rootId, 0]]);
  const queue: UUID[] = [rootId];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head]!;
    for (const e of out.get(id) ?? []) {
      if (depth.has(e.target)) continue;
      depth.set(e.target, depth.get(id)! + 1);
      queue.push(e.target);
    }
  }
  return depth;
}

export function aiDraftToDocument(
  canvas: Canvas,
  rootId: UUID,
  draft: DraftOutput,
): { title: string; content: JSONContent } | null {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root) return null;
  const depth = depths(canvas, rootId);
  const content: JSONContent[] = [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Drafted with AI from ', marks: [{ type: 'italic' }] },
        mention(root),
        { type: 'text', text: '. Check each claim against your sources before you rely on it.', marks: [{ type: 'italic' }] },
      ],
    },
  ];
  content.push(...linkCitations(notesToBlocks(draft.intro), byId));
  for (const section of draft.sections) {
    const idea = byId.get(section.ideaId);
    if (!idea) continue;
    const level = (depth.get(idea.id) ?? 2) <= 1 ? 2 : 3;
    content.push({ type: 'heading', attrs: { level }, content: [mention(idea)] });
    content.push(...linkCitations(notesToBlocks(section.text), byId));
  }
  content.push({ type: 'paragraph' });
  return { title: draft.title || root.title || 'Untitled draft', content: { type: 'doc', content } };
}
