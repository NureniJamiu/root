/**
 * Reading a saved document without loading the editor: which ideas it cites
 * and how many words it has. Dependency-free so the canvas side of the app
 * (and the server) can use it without pulling in TipTap.
 */

import type { JSONContent } from '@tiptap/core';

/** Name of the inline node that cites an idea on the canvas. */
export const IDEA_REF = 'ideaRef';
/** Name of the block node that shows an idea's card inside a document. */
export const IDEA_CARD = 'ideaCard';

/** An empty document. */
export function emptyDocument(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Idea ids a document points at, by how it points at them. */
export interface DocumentLinks {
  readonly mentions: string[];
  readonly embeds: string[];
}

/** Walk a document and collect the ideas it mentions or embeds (each id once). */
export function extractLinks(doc: JSONContent): DocumentLinks {
  const mentions = new Set<string>();
  const embeds = new Set<string>();
  const visit = (node: JSONContent): void => {
    if (node.type === IDEA_REF && typeof node.attrs?.id === 'string') mentions.add(node.attrs.id);
    if (node.type === IDEA_CARD && typeof node.attrs?.nodeId === 'string') embeds.add(node.attrs.nodeId);
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return { mentions: [...mentions], embeds: [...embeds] };
}

/** Number of words in a document's text. */
export function countWords(doc: JSONContent): number {
  let words = 0;
  const visit = (node: JSONContent): void => {
    if (node.type === 'text' && node.text) words += node.text.split(/\s+/).filter(Boolean).length;
    if (node.type === IDEA_REF) words += 1;
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return words;
}
