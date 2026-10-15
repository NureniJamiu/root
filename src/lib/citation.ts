/**
 * Formatting a source as a reference in APA (7th), MLA (9th) or Chicago
 * (17th, bibliography form), and as a BibTeX entry.
 *
 * A reference is a list of runs, some italic, so the Word export can set
 * titles in italics and the Markdown export can wrap them in `*`. Fields a
 * source lacks are left out rather than guessed, so a source that is only a
 * link still gives a usable reference. Pure.
 */

import type { Source } from '../data';

export type CitationStyle = 'apa' | 'mla' | 'chicago';

export interface Run {
  readonly text: string;
  readonly italic?: true;
}

export const CITATION_STYLES: ReadonlyArray<{ readonly style: CitationStyle; readonly label: string; readonly listTitle: string }> = [
  { style: 'apa', label: 'APA', listTitle: 'References' },
  { style: 'mla', label: 'MLA', listTitle: 'Works Cited' },
  { style: 'chicago', label: 'Chicago', listTitle: 'Bibliography' },
];

/* -------------------------------------------------------------------------- */
/* Names and dates                                                            */
/* -------------------------------------------------------------------------- */

export interface Name {
  /** Family name, or the whole name of an organisation. */
  readonly family: string;
  readonly given: string;
  readonly organisation: boolean;
}

const ORG_WORDS =
  /\b(organi[sz]ation|institute|university|college|association|agency|department|ministry|council|foundation|society|bureau|office|commission|committee|group|cent(er|re)|company|corporation|inc|ltd|llc|news|times|press|government|bank|service|trust|network|team|project|lab|laboratory)\b/i;

/** "Lovelace, Ada", "Ada Lovelace", or an organisation such as "World Health Organization". */
export function parseName(raw: string): Name {
  const name = raw.trim();
  const comma = name.indexOf(',');
  if (comma > 0) return { family: name.slice(0, comma).trim(), given: name.slice(comma + 1).trim(), organisation: false };
  const words = name.split(/\s+/);
  if (words.length === 1 || words.length > 4 || ORG_WORDS.test(name)) return { family: name, given: '', organisation: true };
  return { family: words[words.length - 1]!, given: words.slice(0, -1).join(' '), organisation: false };
}

/** "Ada Byron" → "A. B." */
function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.split('-').map((p) => `${p[0]!.toUpperCase()}.`).join('-'))
    .join(' ');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

interface DateParts {
  readonly year: string;
  readonly month?: number;
  readonly day?: number;
}

function dateParts(value: string | undefined): DateParts | null {
  const m = value?.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : undefined;
  const day = m[3] ? Number(m[3]) : undefined;
  return {
    year: m[1]!,
    ...(month && month >= 1 && month <= 12 ? { month } : {}),
    ...(month && day ? { day } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Add closing punctuation unless the text already ends with some. */
function close(text: string, mark = '.'): string {
  return /[.?!]$/.test(text) ? text : `${text}${mark}`;
}

function joinList(items: readonly string[], conj: string, serialComma = true): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${serialComma ? ',' : ''} ${conj} ${items[items.length - 1]}`;
}

function link(source: Source): string | undefined {
  if (source.doi) return `https://doi.org/${source.doi}`;
  return source.url;
}

/** Runs with neighbouring plain text merged and empty runs dropped. */
function tidy(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && !last.italic && !r.italic) out[out.length - 1] = { text: last.text + r.text };
    else out.push(r);
  }
  return out;
}

const italicTitle = (s: Source) => s.kind !== 'article' && s.kind !== 'web';

/* -------------------------------------------------------------------------- */
/* APA 7                                                                      */
/* -------------------------------------------------------------------------- */

function apaName(n: Name): string {
  return n.organisation || !n.given ? n.family : `${n.family}, ${initials(n.given)}`;
}

function apaAuthors(names: readonly Name[]): string {
  const list = names.map(apaName);
  if (list.length === 1) return list[0]!;
  if (list.length <= 20) return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  return `${list.slice(0, 19).join(', ')}, … ${list[list.length - 1]}`;
}

function apa(s: Source): Run[] {
  const names = (s.authors ?? []).map(parseName);
  const d = dateParts(s.published);
  const date =
    d === null
      ? '(n.d.).'
      : s.kind === 'web' && d.month
        ? `(${d.year}, ${MONTHS[d.month - 1]}${d.day ? ` ${d.day}` : ''}).`
        : `(${d.year}).`;
  const title = s.title ? close(s.title) : '';
  const runs: Run[] = [];
  if (names.length > 0) runs.push({ text: `${close(apaAuthors(names))} ${date} ` });
  else if (title) {
    runs.push(italicTitle(s) || s.kind === 'web' ? { text: title, italic: true } : { text: title }, { text: ` ${date} ` });
  } else runs.push({ text: `${date} ` });
  if (names.length > 0 && title) runs.push(italicTitle(s) || s.kind === 'web' ? { text: title, italic: true } : { text: title }, { text: ' ' });
  if (s.container) {
    const sameAsAuthor = names.length === 1 && names[0]!.organisation && names[0]!.family === s.container;
    if (s.kind === 'article') runs.push({ text: s.container, italic: true }, { text: '. ' });
    else if (!sameAsAuthor) runs.push({ text: `${close(s.container)} ` });
  }
  const url = link(s);
  if (url) runs.push({ text: url });
  return tidy(runs).map((r, i, all) => (i === all.length - 1 && !r.italic ? { text: r.text.trimEnd() } : r));
}

/* -------------------------------------------------------------------------- */
/* MLA 9                                                                      */
/* -------------------------------------------------------------------------- */

function mlaDate(d: DateParts): string {
  return `${d.day ? `${d.day} ` : ''}${d.month ? `${MLA_MONTHS[d.month - 1]} ` : ''}${d.year}`;
}

function mlaAuthors(names: readonly Name[]): string {
  const first = names[0]!;
  const head = first.organisation || !first.given ? first.family : `${first.family}, ${first.given}`;
  if (names.length === 1) return head;
  if (names.length === 2) {
    const second = names[1]!;
    return `${head}, and ${second.organisation || !second.given ? second.family : `${second.given} ${second.family}`}`;
  }
  return `${head}, et al`;
}

function mla(s: Source): Run[] {
  const names = (s.authors ?? []).map(parseName);
  const d = dateParts(s.published);
  const runs: Run[] = [];
  if (names.length > 0) runs.push({ text: `${close(mlaAuthors(names))} ` });
  if (s.title) {
    runs.push(italicTitle(s) ? { text: close(s.title), italic: true } : { text: `“${close(s.title)}” ` });
    if (italicTitle(s)) runs.push({ text: ' ' });
  }
  const tail: string[] = [];
  if (s.container && s.kind !== 'book') runs.push({ text: s.container, italic: true });
  if (s.container && s.kind === 'book') tail.push(s.container);
  if (d) tail.push(mlaDate(d));
  const url = s.doi ? `https://doi.org/${s.doi}` : s.url?.replace(/^https?:\/\//i, '');
  if (url) tail.push(url);
  if (tail.length > 0) runs.push({ text: `${s.container && s.kind !== 'book' ? ', ' : ''}${tail.join(', ')}.` });
  else if (s.container && s.kind !== 'book') runs.push({ text: '.' });
  const accessed = s.kind === 'web' && !d ? dateParts(s.accessed) : null;
  if (accessed) runs.push({ text: ` Accessed ${mlaDate(accessed)}.` });
  return tidy(runs).map((r, i, all) => (i === all.length - 1 && !r.italic ? { text: r.text.trimEnd() } : r));
}

/* -------------------------------------------------------------------------- */
/* Chicago 17 (bibliography)                                                  */
/* -------------------------------------------------------------------------- */

function chicagoAuthors(names: readonly Name[]): string {
  const list = names.map((n, i) =>
    n.organisation || !n.given ? n.family : i === 0 ? `${n.family}, ${n.given}` : `${n.given} ${n.family}`,
  );
  if (list.length > 10) return `${list.slice(0, 7).join(', ')}, et al`;
  // The first name is inverted ("Walker, Matthew"), so even two names take a comma.
  if (list.length === 2) return `${list[0]}, and ${list[1]}`;
  return joinList(list, 'and');
}

function chicagoDate(d: DateParts): string {
  if (!d.month) return d.year;
  return `${MONTHS[d.month - 1]}${d.day ? ` ${d.day},` : ''} ${d.year}`;
}

function chicago(s: Source): Run[] {
  const names = (s.authors ?? []).map(parseName);
  const d = dateParts(s.published);
  const runs: Run[] = [];
  if (names.length > 0) runs.push({ text: `${close(chicagoAuthors(names))} ` });
  if (s.title) {
    if (italicTitle(s)) runs.push({ text: close(s.title), italic: true }, { text: ' ' });
    else runs.push({ text: `“${close(s.title)}” ` });
  }
  if (s.container) {
    if (s.kind === 'book' || s.kind === 'report') runs.push({ text: `${s.container}${d ? `, ${d.year}` : ''}. ` });
    else if (s.kind === 'article') runs.push({ text: s.container, italic: true }, { text: d ? ` (${d.year}). ` : '. ' });
    else runs.push({ text: `${s.container}${d ? `, ${chicagoDate(d)}` : ''}. ` });
  } else if (d) runs.push({ text: `${chicagoDate(d)}. ` });
  const accessed = s.kind === 'web' && !d ? dateParts(s.accessed) : null;
  if (accessed) runs.push({ text: `Accessed ${chicagoDate(accessed)}. ` });
  const url = link(s);
  if (url) runs.push({ text: `${url}.` });
  return tidy(runs).map((r, i, all) => (i === all.length - 1 && !r.italic ? { text: r.text.trimEnd() } : r));
}

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/** The source as a reference in `style`. */
export function formatReference(source: Source, style: CitationStyle): Run[] {
  return style === 'apa' ? apa(source) : style === 'mla' ? mla(source) : chicago(source);
}

/** The reference as plain text (no italics). */
export function referenceText(source: Source, style: CitationStyle): string {
  return formatReference(source, style).map((r) => r.text).join('');
}

/** The key a reference list is sorted by: first author's family name, else the title. */
export function sortKey(source: Source): string {
  const first = source.authors?.[0];
  const key = first ? parseName(first).family : source.title ?? source.url ?? '';
  return key.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* BibTeX                                                                     */
/* -------------------------------------------------------------------------- */

const BIB_TYPES: Record<Source['kind'], string> = {
  web: 'online',
  article: 'article',
  book: 'book',
  report: 'techreport',
  other: 'misc',
};

/** Escape what BibTeX treats as special inside a braced value. */
function bib(value: string): string {
  return value.replace(/([\\{}%&$#_^~])/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : `\\${c}`));
}

/** A citation key such as `lovelace2024analytical`, unique within `taken` (which it updates). */
export function bibKey(source: Source, taken: Set<string>): string {
  const first = source.authors?.[0];
  const who = (first ? parseName(first).family : '').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
  const year = dateParts(source.published)?.year ?? '';
  const word =
    (source.title ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .find((w) => w.length > 3 && !['this', 'that', 'with', 'from', 'their', 'what'].includes(w)) ?? '';
  const base = `${who}${year}${word}` || 'source';
  let key = base;
  for (let i = 0; taken.has(key); i++) key = `${base}${String.fromCharCode(97 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`;
  taken.add(key);
  return key;
}

/** The source as a BibTeX entry. */
export function bibtexEntry(source: Source, key: string): string {
  const fields: Array<[string, string]> = [];
  const names = (source.authors ?? []).map(parseName);
  if (names.length > 0) {
    fields.push(['author', names.map((n) => (n.organisation || !n.given ? `{${bib(n.family)}}` : `${bib(n.family)}, ${bib(n.given)}`)).join(' and ')]);
  }
  if (source.title) fields.push(['title', `{${bib(source.title)}}`]);
  if (source.container) {
    const field = source.kind === 'article' ? 'journal' : source.kind === 'book' ? 'publisher' : source.kind === 'report' ? 'institution' : 'organization';
    fields.push([field, bib(source.container)]);
  }
  const d = dateParts(source.published);
  if (d) {
    fields.push(['year', d.year]);
    if (d.month) fields.push(['month', String(d.month)]);
  }
  if (source.doi) fields.push(['doi', bib(source.doi)]);
  if (source.url) fields.push(['url', source.url]);
  if (source.accessed) fields.push(['urldate', source.accessed]);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${BIB_TYPES[source.kind]}{${key}${body ? `,\n${body}` : ''}\n}`;
}
