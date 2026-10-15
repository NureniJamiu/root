/**
 * A Root document as Markdown (CommonMark plus GFM tables, task lists,
 * strikethrough and footnotes).
 *
 * Every idea the document mentions becomes a numbered footnote (`[^1]`) that
 * says what the idea is and links to its sources, so the draft keeps its
 * evidence when it leaves Root. An embedded idea card becomes a quote of the
 * idea with its own footnote. Pure and synchronous.
 */

import type { JSONContent } from '@tiptap/core';

import type { Node } from '../../data';
import { IDEA_CARD, IDEA_REF } from '../links';

import { FootnoteRegistry, footnoteText, ideaTarget } from './notes';

export interface MarkdownExportInput {
  readonly title: string;
  readonly content: JSONContent;
  /** The canvas ideas, for footnotes. */
  readonly ideas: ReadonlyMap<string, Node>;
  /** Turns an image `src` into an address that works outside the app (made absolute). */
  readonly resolveSrc?: (src: string) => string;
}

/** Characters that would otherwise start Markdown syntax inside text. */
function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]<>~|])/g, '\\$1');
}

/** Escape what would read as a block marker at the start of a line. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)([#>+-]|\d+[.)])(?=\s|$)/, '$1\\$2');
}

function wrap(text: string, marks: JSONContent['marks']): string {
  if (!marks || marks.length === 0 || text.trim() === '') return text;
  const has = (type: string) => marks.some((m) => m.type === type);
  if (has('code')) {
    const fence = text.includes('`') ? '``' : '`';
    return `${fence}${text.replace(/\\(.)/g, '$1')}${fence}`;
  }
  // Keep spaces outside the markers, where Markdown needs them.
  const lead = text.match(/^\s*/)?.[0] ?? '';
  const trail = text.match(/\s*$/)?.[0] ?? '';
  let inner = text.slice(lead.length, text.length - trail.length);
  if (has('bold')) inner = `**${inner}**`;
  if (has('italic')) inner = `*${inner}*`;
  if (has('strike')) inner = `~~${inner}~~`;
  if (has('highlight')) inner = `==${inner}==`;
  const link = marks.find((m) => m.type === 'link');
  if (typeof link?.attrs?.href === 'string') inner = `[${inner}](${link.attrs.href})`;
  return `${lead}${inner}${trail}`;
}

class MarkdownWriter {
  readonly notes: FootnoteRegistry;

  constructor(
    ideas: ReadonlyMap<string, Node>,
    private readonly resolveSrc: (src: string) => string,
  ) {
    this.notes = new FootnoteRegistry(ideas);
  }

  inline(nodes: readonly JSONContent[] | undefined): string {
    let out = '';
    for (const node of nodes ?? []) {
      if (node.type === 'text') out += wrap(escapeText(node.text ?? ''), node.marks);
      else if (node.type === 'hardBreak') out += '\\\n';
      else if (node.type === IDEA_REF) {
        const target = ideaTarget(node);
        if (!target) continue;
        const note = this.notes.noteFor(target.id, target.label);
        out += `${escapeText(this.notes.titleOf(target.id, target.label))}[^${note.number}]`;
      } else if (node.type === 'image') out += this.image(node);
    }
    return out;
  }

  image(node: JSONContent): string {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    if (!src) return '';
    return `![${escapeText(String(node.attrs?.alt ?? ''))}](${this.resolveSrc(src)})`;
  }

  /** Blocks separated by blank lines. */
  blocks(nodes: readonly JSONContent[] | undefined): string {
    return (nodes ?? [])
      .map((n) => this.block(n))
      .filter((b) => b !== '')
      .join('\n\n');
  }

  block(node: JSONContent): string {
    switch (node.type) {
      case 'paragraph':
        return this.inline(node.content).split('\n').map(escapeLineStart).join('\n');
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        return `${'#'.repeat(level)} ${this.inline(node.content)}`;
      }
      case 'blockquote':
        return quote(this.blocks(node.content));
      case 'codeBlock': {
        const text = (node.content ?? []).map((t) => t.text ?? '').join('');
        const fence = text.includes('```') ? '~~~~' : '```';
        return `${fence}${String(node.attrs?.language ?? '')}\n${text}\n${fence}`;
      }
      case 'horizontalRule':
        return '---';
      case 'image':
        return this.image(node);
      case 'bulletList':
        return this.list(node, () => '- ');
      case 'orderedList': {
        const start = Number(node.attrs?.start) || 1;
        return this.list(node, (i) => `${start + i}. `);
      }
      case 'taskList':
        return this.list(node, (_i, item) => `- [${item.attrs?.checked ? 'x' : ' '}] `);
      case 'table':
        return this.table(node);
      case IDEA_CARD:
        return this.ideaCard(node);
      default:
        return node.content ? this.blocks(node.content) : '';
    }
  }

  list(node: JSONContent, marker: (index: number, item: JSONContent) => string): string {
    return (node.content ?? [])
      .map((item, i) => {
        const prefix = marker(i, item);
        const body = this.blocks(item.content);
        const pad = ' '.repeat(prefix.length);
        return prefix + body.split('\n').map((line, j) => (j === 0 || line === '' ? line : pad + line)).join('\n');
      })
      .join('\n');
  }

  table(node: JSONContent): string {
    const rows = (node.content ?? []).map((row) =>
      (row.content ?? []).map((cell) =>
        (cell.content ?? []).map((p) => this.inline(p.content)).join(' ').replace(/\n/g, ' ').trim(),
      ),
    );
    if (rows.length === 0) return '';
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
    const [head, ...body] = rows;
    return [line(head!), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(line)].join('\n');
  }

  ideaCard(node: JSONContent): string {
    const target = ideaTarget(node);
    if (!target) return '';
    const note = this.notes.noteFor(target.id, target.label);
    const idea = this.notes.idea(target.id);
    const head = `**${escapeText(this.notes.titleOf(target.id, target.label))}**[^${note.number}]`;
    const body = idea?.body.trim() ? `\n\n${idea.body.trim()}` : '';
    return quote(head + body);
  }
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

/** The document as Markdown, its title as the top heading and its citations as footnotes. */
export function documentToMarkdown({ title, content, ideas, resolveSrc = (s) => s }: MarkdownExportInput): string {
  const writer = new MarkdownWriter(ideas, resolveSrc);
  const parts: string[] = [];
  if (title.trim()) parts.push(`# ${escapeText(title.trim())}`);
  const body = writer.blocks(content.content);
  if (body) parts.push(body);
  const notes = writer.notes.all();
  if (notes.length > 0) {
    parts.push(notes.map((n) => `[^${n.number}]: ${footnoteText(n).replace(/([[\]])/g, '\\$1')}`).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}
