/**
 * The sources a document cites, as a BibTeX file, in order of first mention.
 * Ideas without a recorded source are left out. Pure.
 */

import type { JSONContent } from '@tiptap/core';

import type { Node } from '../../data';
import { bibKey, bibtexEntry } from '../../lib/citation';

import { ideaTarget } from './notes';

/** Ids of the ideas `doc` mentions or embeds, each once, in reading order. */
function citedIdeas(doc: JSONContent): string[] {
  const ids: string[] = [];
  const visit = (node: JSONContent): void => {
    const target = ideaTarget(node);
    if (target && !ids.includes(target.id)) ids.push(target.id);
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return ids;
}

/** BibTeX entries for every cited idea that has a source; the count is 0 when none do. */
export function documentToBibtex(content: JSONContent, ideas: ReadonlyMap<string, Node>): { text: string; count: number } {
  const taken = new Set<string>();
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const id of citedIdeas(content)) {
    const source = ideas.get(id)?.source;
    if (!source) continue;
    const same = JSON.stringify(source);
    if (seen.has(same)) continue;
    seen.add(same);
    entries.push(bibtexEntry(source, bibKey(source, taken)));
  }
  return { text: entries.length > 0 ? `${entries.join('\n\n')}\n` : '', count: entries.length };
}
