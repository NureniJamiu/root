/**
 * Footnotes for an exported document: every idea the document mentions or
 * embeds becomes a note that says what the idea is and where it came from
 * (its title, its type, the start of its notes and any links in them).
 *
 * Shared by the Markdown and Word exporters so both say the same thing.
 * Pure: the caller passes the canvas ideas in.
 */

import type { JSONContent } from '@tiptap/core';

import type { Node, NodeType, Source } from '../../data';
import { CITATION_STYLES, formatReference, sortKey } from '../../lib/citation';
import type { CitationStyle, Run } from '../../lib/citation';
import { markdownToPlainText, parseMarkdown } from '../../lib/markdown';
import { IDEA_CARD, IDEA_REF } from '../links';

const TYPE_NAMES: Record<NodeType, string> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

/** Longest stretch of an idea's notes quoted in its footnote. */
export const NOTE_EXCERPT_MAX = 240;

export interface Footnote {
  /** 1-based, in order of first mention. */
  readonly number: number;
  readonly ideaId: string;
  readonly title: string;
  /** "Finding", or null when the idea is no longer on the canvas. */
  readonly typeName: string | null;
  readonly excerpt: string;
  readonly links: readonly string[];
  /** The idea's recorded source, when it has one. */
  readonly source?: Source;
}

/**
 * How cited ideas are described: `notes` says what the idea is (title, type,
 * notes, links); a citation style gives the idea's source as a formal
 * reference instead, for ideas that have one.
 */
export type CitationMode = 'notes' | CitationStyle;

/** The footnote as runs (titles in italics), in `mode`. */
export function footnoteRuns(note: Footnote, mode: CitationMode = 'notes'): Run[] {
  if (mode !== 'notes' && note.source) return formatReference(note.source, mode);
  return [{ text: footnoteText(note) }];
}

/** The reference list for `notes` in `style`: each source once, sorted. */
export function referenceList(notes: readonly Footnote[], style: CitationStyle): { title: string; entries: Run[][] } {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const n of notes) {
    if (!n.source) continue;
    const key = JSON.stringify(n.source);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(n.source);
  }
  sources.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const title = CITATION_STYLES.find((s) => s.style === style)?.listTitle ?? 'References';
  return { title, entries: sources.map((s) => formatReference(s, style)) };
}

/** The footnote as one line of plain text, describing the idea. */
export function footnoteText(note: Footnote): string {
  const parts = [note.typeName ? `${note.title} (${note.typeName}).` : `${note.title} (no longer on the canvas).`];
  if (note.excerpt) parts.push(note.excerpt);
  if (note.links.length > 0) parts.push(note.links.join(' '));
  return parts.join(' ');
}

function excerptOf(body: string): string {
  const first = markdownToPlainText(body).split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() ?? '';
  if (first.length <= NOTE_EXCERPT_MAX) return first;
  const cut = first.slice(0, NOTE_EXCERPT_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), NOTE_EXCERPT_MAX / 2)).trimEnd()}…`;
}

function linksOf(body: string): string[] {
  const links = new Set<string>();
  for (const block of parseMarkdown(body)) {
    const runs = block.kind === 'paragraph' ? block.lines.flat() : block.kind === 'heading' ? block.inlines : block.items.flat();
    for (const run of runs) if (run.href && !run.href.startsWith('mailto:')) links.add(run.href);
  }
  // Bare addresses written straight into the notes.
  for (const m of body.matchAll(/https?:\/\/[^\s)<>\]]+/g)) links.add(m[0].replace(/[.,;:]+$/, ''));
  return [...links];
}

/** The idea an `ideaRef` or `ideaCard` node points at, with its saved label. */
export function ideaTarget(node: JSONContent): { id: string; label: string } | null {
  if (node.type === IDEA_REF && typeof node.attrs?.id === 'string') {
    return { id: node.attrs.id, label: String(node.attrs.label ?? '') };
  }
  if (node.type === IDEA_CARD && typeof node.attrs?.nodeId === 'string') {
    return { id: node.attrs.nodeId, label: String(node.attrs.label ?? '') };
  }
  return null;
}

/**
 * Numbers the ideas a document points at, in reading order. `noteFor` returns
 * the same footnote every time an idea comes up again.
 */
export class FootnoteRegistry {
  private readonly byIdea = new Map<string, Footnote>();

  constructor(private readonly ideas: ReadonlyMap<string, Node>) {}

  /** The idea itself, when it is still on the canvas. */
  idea(id: string): Node | undefined {
    return this.ideas.get(id);
  }

  /** The idea's current title, falling back to the label saved in the document. */
  titleOf(id: string, label: string): string {
    return this.ideas.get(id)?.title || label || 'Untitled idea';
  }

  noteFor(id: string, label: string): Footnote {
    const existing = this.byIdea.get(id);
    if (existing) return existing;
    const idea = this.ideas.get(id);
    const note: Footnote = {
      number: this.byIdea.size + 1,
      ideaId: id,
      title: this.titleOf(id, label),
      typeName: idea ? TYPE_NAMES[idea.type] : null,
      excerpt: idea ? excerptOf(idea.body) : '',
      links: idea ? linksOf(idea.body) : [],
      ...(idea?.source ? { source: idea.source } : {}),
    };
    this.byIdea.set(id, note);
    return note;
  }

  all(): Footnote[] {
    return [...this.byIdea.values()];
  }
}
