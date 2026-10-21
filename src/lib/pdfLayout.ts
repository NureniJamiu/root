/**
 * Turning the positioned text runs pdf.js reads out of a PDF into something
 * readable: lines, then paragraphs, with running headers and page numbers
 * dropped and words hyphenated across lines joined again. Also reads a
 * citation's details (title, authors, date, DOI) from the PDF's own
 * information and first page.
 *
 * Pure and free of pdf.js, so it can be tested on plain data; `pdfText.ts`
 * feeds it.
 */

import type { ReaderBlock } from './reader';
import { normaliseDate } from './reader';

/** One run of text as pdf.js places it on the page. */
export interface PdfRun {
  readonly text: string;
  readonly x: number;
  /** Baseline, measured up from the bottom of the page. */
  readonly y: number;
  /** Font size, roughly. */
  readonly size: number;
}

export interface PdfLine {
  readonly text: string;
  readonly y: number;
  readonly size: number;
}

/** Runs grouped into lines, top to bottom, each line's runs left to right. */
export function linesOf(runs: readonly PdfRun[]): PdfLine[] {
  const sorted = runs.filter((r) => r.text.trim() !== '').slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ runs: PdfRun[]; y: number; size: number }> = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    // Same line when the baselines are within a third of the type size.
    if (last && Math.abs(last.y - run.y) <= Math.max(last.size, run.size) * 0.35) {
      last.runs.push(run);
      last.size = Math.max(last.size, run.size);
    } else {
      lines.push({ runs: [run], y: run.y, size: run.size });
    }
  }
  return lines.map((l) => {
    const ordered = l.runs.sort((a, b) => a.x - b.x);
    let text = '';
    for (const r of ordered) {
      const piece = r.text.replace(/\s+/g, ' ');
      text += text && !/\s$/.test(text) && !/^\s/.test(piece) ? ` ${piece}` : piece;
    }
    return { text: text.replace(/\s+/g, ' ').trim(), y: l.y, size: l.size };
  });
}

/**
 * A line's text without a leading or trailing page number, so a running
 * head such as "12  Journal of Sleep" matches on every page.
 */
const shape = (text: string) => text.replace(/^\d{1,4}\s+|\s+\d{1,4}$/g, '').trim().toLowerCase();

/** "7", "Page 7", "7 of 20", "- 7 -". */
const PAGE_NUMBER = /^[-–\s]*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?[-–\s]*$/i;

/**
 * Lines that repeat on most pages (running heads, journal footers, page
 * numbers), to leave out of the text.
 */
export function repeatedLines(pages: readonly (readonly PdfLine[])[]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const page of pages) {
    // Only the edges of a page carry running heads and footers.
    const edges = [...page.slice(0, 3), ...page.slice(-3)];
    for (const key of new Set(edges.map((l) => shape(l.text)))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [key, n] of counts) if (n >= Math.max(3, pages.length * 0.5)) repeated.add(key);
  return repeated;
}

/** Join two lines of one paragraph, mending a word hyphenated across them. */
function joinLines(a: string, b: string): string {
  if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

/**
 * One page's lines as paragraphs. A new paragraph starts where the gap to
 * the next line is clearly wider than the page's usual line spacing, or the
 * type size changes (a heading).
 */
export function paragraphsOf(lines: readonly PdfLine[], skip: ReadonlySet<string>): ReaderBlock[] {
  const kept = lines.filter((l) => !skip.has(shape(l.text)) && !PAGE_NUMBER.test(l.text));
  if (kept.length === 0) return [];
  const body = [...kept].map((l) => l.size).sort((a, b) => a - b)[Math.floor(kept.length / 2)] ?? 10;
  // Usual line spacing: the lower median of gaps between body-size lines,
  // so headings and paragraph breaks do not stretch it.
  const isBody = (l: PdfLine) => Math.abs(l.size - body) < body * 0.1;
  const gaps: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const [a, b] = [kept[i - 1]!, kept[i]!];
    if (isBody(a) && isBody(b) && a.y > b.y) gaps.push(a.y - b.y);
  }
  gaps.sort((a, b) => a - b);
  const usual = gaps[Math.floor((gaps.length - 1) / 2)] ?? body * 1.2;

  const blocks: ReaderBlock[] = [];
  let text = '';
  let heading = false;
  const flush = () => {
    const t = text.trim();
    if (t) blocks.push({ kind: heading ? 'heading' : 'paragraph', text: t });
    text = '';
  };
  kept.forEach((line, i) => {
    const prev = kept[i - 1];
    const isHeading = line.size >= body * 1.18 && line.text.length < 160;
    const gap = prev ? prev.y - line.y : 0;
    const breaks = !prev || gap > usual * 1.45 || gap < 0 || isHeading !== heading || Math.abs(line.size - prev.size) > body * 0.15;
    if (breaks) {
      flush();
      heading = isHeading;
      text = line.text;
    } else {
      text = joinLines(text, line.text);
    }
  });
  flush();
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Citation details                                                           */
/* -------------------------------------------------------------------------- */

/** The PDF's information dictionary, as pdf.js returns it. */
export interface PdfInfo {
  readonly Title?: unknown;
  readonly Author?: unknown;
  readonly CreationDate?: unknown;
  readonly Subject?: unknown;
}

/** "D:20240318093000Z" (a PDF date) → "2024-03-18". */
export function pdfDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?/);
  if (!m) return normaliseDate(value);
  return [m[1], m[2], m[3]].filter(Boolean).join('-');
}

/** Titles that are really file or tool names ("Microsoft Word - draft.docx", "untitled"). */
function usableTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (t.length < 4 || /\.(docx?|pdf|tex|indd|rtf)$/i.test(t) || /^(microsoft word|untitled|title|document)\b/i.test(t)) return null;
  return t;
}

/** Authors from the PDF information ("A. Lovelace; A. Turing", "Lovelace and Turing"). */
function authorsOf(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(/\s*(?:;|\band\b|&|\n)\s*/i)
    .flatMap((part) => (/,.*,/.test(part) ? part.split(/\s*,\s*/) : [part]))
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && !/^(admin|user|owner)$/i.test(a))
    .slice(0, 30);
}

export interface PdfDetails {
  readonly title: string;
  readonly authors: string[];
  readonly published: string | null;
  readonly doi: string | null;
}

/**
 * Title, authors, date and DOI. The information dictionary comes first;
 * failing that, the title is the largest type on the first page, and the DOI
 * is the first one printed in the opening pages.
 */
export function pdfDetails(info: PdfInfo, firstPage: readonly PdfLine[], openingText: string, fallbackTitle: string): PdfDetails {
  let title = usableTitle(info.Title);
  if (!title && firstPage.length > 0) {
    const largest = Math.max(...firstPage.map((l) => l.size));
    const parts = firstPage.filter((l) => l.size >= largest * 0.95 && l.text.length > 3).slice(0, 3);
    title = parts.map((l) => l.text).join(' ').slice(0, 300) || null;
  }
  const doi = openingText.match(/\b(10\.\d{4,9}\/[^\s"'<>]+[^\s"'<>.,;)])/)?.[1] ?? null;
  return {
    title: title ?? fallbackTitle,
    authors: authorsOf(info.Author),
    published: pdfDate(info.CreationDate),
    doi,
  };
}
