/**
 * A small, safe Markdown reader for idea notes.
 *
 * Card bodies stay plain strings (easy to save, search and generate), and are
 * shown with light formatting: paragraphs, `#` headings, `-` / `1.` lists,
 * **bold**, *italic*, ~~strike~~, `code` and [links](https://…). The result
 * is a small tree that the UI renders as React elements, never as HTML, so a
 * note can never inject markup. Links keep only http(s) and mailto addresses.
 */

export interface Inline {
  readonly text: string;
  readonly bold?: true;
  readonly italic?: true;
  readonly strike?: true;
  readonly code?: true;
  readonly href?: string;
}

export type Block =
  | { readonly kind: 'paragraph'; readonly lines: Inline[][] }
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly inlines: Inline[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly items: Inline[][] };

type Marks = Omit<Inline, 'text'>;

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

interface Rule {
  readonly re: RegExp;
  readonly apply: (m: RegExpExecArray, marks: Marks) => Inline[];
}

const RULES: readonly Rule[] = [
  { re: /`([^`]+)`/, apply: (m, marks) => [{ ...marks, text: m[1]!, code: true }] },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    apply: (m, marks) =>
      SAFE_HREF.test(m[2]!) ? parseInline(m[1]!, { ...marks, href: m[2]! }) : parseInline(m[1]!, marks),
  },
  { re: /\*\*([^*]+?)\*\*|__([^_]+?)__/, apply: (m, marks) => parseInline(m[1] ?? m[2]!, { ...marks, bold: true }) },
  { re: /~~([^~]+?)~~/, apply: (m, marks) => parseInline(m[1]!, { ...marks, strike: true }) },
  {
    re: /\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/,
    apply: (m, marks) => parseInline(m[1] ?? m[2]!, { ...marks, italic: true }),
  },
];

/** Split one line of text into styled runs. */
export function parseInline(text: string, marks: Marks = {}): Inline[] {
  if (text === '') return [];
  let best: { index: number; match: RegExpExecArray; rule: Rule } | null = null;
  for (const rule of RULES) {
    const match = rule.re.exec(text);
    if (match && (best === null || match.index < best.index)) best = { index: match.index, match, rule };
  }
  if (best === null) return [{ ...marks, text }];
  const before = text.slice(0, best.index);
  const after = text.slice(best.index + best.match[0].length);
  return [
    ...(before ? [{ ...marks, text: before }] : []),
    ...best.rule.apply(best.match, marks),
    ...parseInline(after, marks),
  ];
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

/** Read a note into blocks. */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph });
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
    paragraph = [];
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, inlines: parseInline(heading[2]!) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = numbered !== null;
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[1]!));
      continue;
    }
    if (list) flush();
    paragraph.push(parseInline(line));
  }
  flush();
  return blocks;
}

/** The note's text with Markdown markers removed (for search and previews). */
export function markdownToPlainText(source: string): string {
  return parseMarkdown(source)
    .map((b) =>
      b.kind === 'paragraph'
        ? b.lines.map((l) => l.map((i) => i.text).join('')).join('\n')
        : b.kind === 'heading'
          ? b.inlines.map((i) => i.text).join('')
          : b.items.map((it) => it.map((i) => i.text).join('')).join('\n'),
    )
    .join('\n\n');
}
