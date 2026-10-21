/**
 * The source reader's server side: fetch a web page for someone, and return
 * its readable text and what a citation needs (title, authors, date, site,
 * DOI), so they can read it inside Root and lift passages onto the canvas.
 *
 * The page is a stranger's: only public http(s) addresses on the standard
 * ports are fetched, every redirect is checked the same way, the body is cut
 * off at `READER_MAX_BYTES`, and what comes back is plain text, never markup.
 * A PDF is passed back as its bytes (checked to be a PDF) for the browser to
 * read with pdf.js.
 * Parsing is a small, dependency-free pass over the HTML (no DOM on the
 * server); it favours the page's `<article>` or `<main>` and drops
 * navigation, scripts and boilerplate.
 */

import type { SourceKind } from '../data';

export const READER_MAX_BYTES = 3 * 1024 * 1024;
export const READER_TIMEOUT_MS = 12_000;
/** Largest PDF the reader fetches. */
export const READER_PDF_MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** Most paragraphs returned for one page. */
const MAX_BLOCKS = 600;

export interface ReaderBlock {
  /** `page` marks where a PDF page begins; its text is "Page 3". */
  readonly kind: 'heading' | 'paragraph' | 'quote' | 'item' | 'page';
  readonly text: string;
}

export interface ReaderPage {
  /** The address the page was finally read from, after redirects. */
  readonly url: string;
  readonly title: string;
  readonly authors: readonly string[];
  /** YYYY, YYYY-MM or YYYY-MM-DD. */
  readonly published: string | null;
  readonly siteName: string | null;
  readonly doi: string | null;
  readonly kind: SourceKind;
  readonly blocks: readonly ReaderBlock[];
}

export class ReaderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Address checks                                                             */
/* -------------------------------------------------------------------------- */

function privateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/**
 * Whether `raw` is a public web address the reader may fetch. Hostnames are
 * not resolved here, so a public name that points at a private address is
 * not caught; the Workers runtime cannot reach private networks anyway.
 */
export function isFetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return null; // localhost, intranet names
  if (/\.(localhost|local|internal|lan|home|corp|test|invalid)$/.test(host)) return null;
  if (privateIPv4(host)) return null;
  if (host.includes(':')) {
    // IPv6 literal: refuse loopback, link-local, unique-local and mapped IPv4.
    if (host === '::1' || host === '::' || /^(fe8|fe9|fea|feb|fc|fd)/.test(host) || host.startsWith('::ffff:')) return null;
  }
  return url;
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                       */
/* -------------------------------------------------------------------------- */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', middot: '·', laquo: '«', raquo: '»',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').trim() : null;
}

/** Every `<meta>` as name/property → contents (several for repeated names). */
function metaTags(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'name') ?? attr(m[0], 'property') ?? attr(m[0], 'itemprop'))?.toLowerCase();
    const content = attr(m[0], 'content');
    if (!key || !content) continue;
    (out.get(key) ?? out.set(key, []).get(key)!).push(content);
  }
  return out;
}

interface LinkedData {
  headline?: string;
  authors: string[];
  published?: string;
  publisher?: string;
}

/** Article details from JSON-LD blocks, when the page has them. */
function linkedData(html: string): LinkedData {
  const out: LinkedData = { authors: [] };
  const names = (v: unknown): string[] =>
    Array.isArray(v) ? v.flatMap(names) : typeof v === 'string' ? [v] : v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? [(v as { name: string }).name] : [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) visit(o['@graph']);
    const type = String(o['@type'] ?? '');
    if (!/Article|BlogPosting|Report|ScholarlyArticle|WebPage|Book/i.test(type)) return;
    if (!out.headline && typeof o.headline === 'string') out.headline = o.headline;
    if (out.authors.length === 0) out.authors = names(o.author);
    if (!out.published && typeof o.datePublished === 'string') out.published = o.datePublished;
    const publisher = names(o.publisher)[0];
    if (!out.publisher && publisher) out.publisher = publisher;
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]!));
    } catch {
      /* malformed block: ignore it */
    }
  }
  return out;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2024-03-18T10:00:00Z", "2024/03/18", "18 March 2024"… → "2024-03-18" (or less). */
export function normaliseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const iso = raw.match(/(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
  if (iso) {
    const [, y, mo, d] = iso;
    return `${y}-${mo!.padStart(2, '0')}${d ? `-${d.padStart(2, '0')}` : ''}`;
  }
  const year = raw.match(/\b(1[5-9]\d{2}|20\d{2})\b/)?.[1];
  if (!year) return null;
  // "18 March 2024", "March 18, 2024", "Mar 2024": keep only what is written.
  const month = MONTH_NAMES.findIndex((m) => new RegExp(`\\b${m}`, 'i').test(raw));
  if (month === -1) return year;
  const day = raw.replace(year, '').match(/\b([0-3]?\d)(st|nd|rd|th)?\b/)?.[1];
  const mm = String(month + 1).padStart(2, '0');
  return day && Number(day) >= 1 && Number(day) <= 31 ? `${year}-${mm}-${day.padStart(2, '0')}` : `${year}-${mm}`;
}

const DROP = /<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form|button|select|figure|picture)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS = 'p|li|h[1-6]|blockquote|pre|td|th|dd|dt|div|section|article|main|ul|ol|dl|table|tr|tbody|thead';
const BLOCK = new RegExp(
  `<(h[1-4]|p|li|blockquote|pre|td|dd)\\b[^>]*>((?:(?!<\\/?(?:${BLOCK_TAGS})\\b)[\\s\\S])*)`,
  'gi',
);
const BOILERPLATE = /\b(cookie|subscribe|newsletter|sign up|sign in|advertisement|all rights reserved|share this)\b/i;

const textLength = (blocks: readonly ReaderBlock[]) => blocks.reduce((n, b) => n + b.text.length, 0);

/**
 * The readable part of the page as headings, paragraphs, quotes and list
 * items. Tries the page's `<article>`, then `<main>`, then the whole body,
 * and keeps the narrowest one that holds most of the text (an `<article>`
 * that is only a teaser card loses to `<main>`).
 */
export function readableBlocks(html: string): ReaderBlock[] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  // Greedy, so an article with nested <article> cards is taken whole.
  const candidates = [
    clean.match(/<article\b[^>]*>([\s\S]*)<\/article>/i)?.[1],
    clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1],
    clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? clean,
  ].filter((c): c is string => c !== undefined);
  const results = candidates.map(blocksIn);
  const most = Math.max(...results.map(textLength));
  return results.find((r) => textLength(r) >= most * 0.6) ?? results[results.length - 1] ?? [];
}

function blocksIn(html: string): ReaderBlock[] {
  const body = html.replace(DROP, ' ');
  const blocks: ReaderBlock[] = [];
  // Paragraphs inside a <blockquote> are quotes.
  const quoted: Array<[number, number]> = [];
  for (const q of body.matchAll(/<blockquote\b[\s\S]*?<\/blockquote\s*>/gi)) quoted.push([q.index!, q.index! + q[0].length]);
  const inQuote = (at: number) => quoted.some(([a, b]) => at > a && at < b);
  // A block runs until the next block-level tag opens or closes, so an
  // unclosed <p> or <li> (valid HTML) cannot swallow what follows it.
  for (const m of body.matchAll(BLOCK)) {
    const tag = m[1]!.toLowerCase();
    const text = stripTags(m[2]!);
    if (!text) continue;
    const kind: ReaderBlock['kind'] = tag.startsWith('h')
      ? 'heading'
      : tag === 'blockquote' || inQuote(m.index!)
        ? 'quote'
        : tag === 'li' || tag === 'dd'
          ? 'item'
          : 'paragraph';
    // Short lines outside headings are mostly menus and bylines; boilerplate is noise.
    if (kind !== 'heading' && text.length < 25) continue;
    if (text.length < 140 && BOILERPLATE.test(text)) continue;
    const last = blocks[blocks.length - 1];
    if (last?.text === text) continue; // nested <p> inside <li>, repeated blocks
    blocks.push({ kind, text });
    if (blocks.length >= MAX_BLOCKS) break;
  }
  return blocks;
}

/** Title, authors, date, site and DOI from the page's metadata. */
export function pageDetails(html: string, url: URL): Omit<ReaderPage, 'blocks' | 'url'> {
  const meta = metaTags(html);
  const first = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta.get(k)?.[0];
      if (v) return v;
    }
    return undefined;
  };
  const ld = linkedData(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const siteName = first('og:site_name', 'citation_journal_title', 'application-name') ?? ld.publisher ?? null;
  let title = first('citation_title', 'og:title', 'twitter:title') ?? ld.headline ?? (titleTag ? stripTags(titleTag) : '');
  // "Article title | Site" or "Article title - Wikipedia" → "Article title"
  const brand = url.hostname.replace(/^(www|en|m)\./, '').split('.')[0] ?? '';
  for (const name of [siteName, brand]) {
    if (!name || title.length <= name.length + 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title.replace(new RegExp(`\\s+[|\\-–—:·]\\s+${escaped}\\s*$`, 'i'), '');
  }
  const authors = (meta.get('citation_author') ?? (ld.authors.length > 0 ? ld.authors : meta.get('author') ?? meta.get('article:author') ?? []))
    .map((a) => a.trim())
    .filter((a) => a && !/^https?:\/\//i.test(a))
    .slice(0, 30);
  const doiRaw = first('citation_doi', 'dc.identifier', 'prism.doi') ?? html.match(/\b(10\.\d{4,9}\/[^\s"'<>]+)/)?.[1];
  const doi = doiRaw?.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '').match(/^10\.\d{4,9}\/\S+$/) ? doiRaw.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '') : null;
  const scholarly = meta.has('citation_journal_title') || meta.has('citation_title');
  return {
    title: stripTags(title).slice(0, 500) || url.hostname,
    authors,
    published: normaliseDate(first('citation_publication_date', 'citation_date', 'article:published_time', 'dc.date', 'date', 'pubdate') ?? ld.published),
    siteName: siteName ? stripTags(siteName).slice(0, 500) : url.hostname.replace(/^www\./, ''),
    doi: scholarly ? doi : (first('citation_doi') ? doi : null),
    kind: scholarly ? 'article' : 'web',
  };
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

/** The body as bytes, or null when it is longer than `max`. */
async function readBytes(res: Response, max: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

/** The body as text, cut off at `READER_MAX_BYTES` (a long page is still worth reading). */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > READER_MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(Math.min(size, READER_MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, all.length - at), at);
    at += c.byteLength;
    if (at >= all.length) break;
  }
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(all);
  } catch {
    return new TextDecoder('utf-8').decode(all);
  }
}

/**
 * A bot check or sign-in wall instead of the page ("Just a moment…",
 * "Client Challenge"). The reader does not try to get past these.
 */
export function isBrowserCheck(html: string): boolean {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  if (/client challenge|just a moment|attention required|are you a robot|captcha|access denied|verify you are human/i.test(title)) return true;
  return /enable javascript (to proceed|and cookies to continue)/i.test(html) && readableBlocks(html).length < 3;
}

/** A PDF the reader fetched; the browser extracts its text (see `pdfText.ts`). */
export interface ReaderPdf {
  /** The address it was finally read from, after redirects. */
  readonly url: string;
  readonly bytes: Uint8Array;
}

/**
 * Fetch `raw` with the reader's checks: a public address, every redirect
 * checked, cookies kept along the chain, a time limit. Returns the final
 * response (status 2xx) and where it came from.
 */
async function fetchChecked(raw: string, fetchImpl: typeof fetch): Promise<{ res: Response; url: URL }> {
  const start = isFetchableUrl(raw.trim());
  if (!start) throw new ReaderError('That is not a public web address.', 400);
  let url: URL = start;
  let res: Response | null = null;
  // Cookies set along the redirect chain, sent back on the next hop (some
  // publishers bounce through a sign-in service that sets one). Kept for
  // this one read only.
  const cookies = new Map<string, string>();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      res = await fetchImpl(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(READER_TIMEOUT_MS),
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,application/pdf;q=0.8,*/*;q=0.1',
          'user-agent': 'Mozilla/5.0 (compatible; RootReader/1.0)',
          ...(cookies.size > 0 ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        },
      });
    } catch {
      throw new ReaderError('The page could not be reached.', 502);
    }
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of setCookies) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get('location');
    const target = next ? isFetchableUrl(new URL(next, url).href) : null;
    if (!target) throw new ReaderError('The page redirects somewhere the reader cannot follow.', 502);
    url = target;
    res = null;
  }
  if (!res) throw new ReaderError('The page redirects too many times.', 502);
  if (!res.ok) throw new ReaderError(`The site answered ${res.status}.`, 502);
  return { res, url };
}

/**
 * Fetch and read the page at `raw`: a web page comes back as text blocks,
 * a PDF as its bytes for the browser to read. Throws `ReaderError` with a
 * message for people.
 */
export async function readPage(raw: string, fetchImpl: typeof fetch = fetch): Promise<ReaderPage | ReaderPdf> {
  const { res, url } = await fetchChecked(raw, fetchImpl);
  const type = res.headers.get('content-type') ?? '';
  if (/application\/pdf/i.test(type) || (!type && /\.pdf$/i.test(url.pathname))) {
    const bytes = await readBytes(res, READER_PDF_MAX_BYTES);
    if (!bytes) throw new ReaderError(`That PDF is larger than ${READER_PDF_MAX_BYTES / 1024 / 1024} MB.`, 413);
    if (!isPdf(bytes)) throw new ReaderError('That address says it is a PDF, but it is not one.', 415);
    return { url: url.href, bytes };
  }
  if (type && !/text\/html|application\/xhtml/i.test(type)) throw new ReaderError('That address is not a web page or a PDF.', 415);
  const html = await readCapped(res);
  if (isBrowserCheck(html)) {
    throw new ReaderError(
      'This site checks for a real browser before showing the page, so the reader cannot open it. Open it in your browser and paste the text instead.',
      422,
    );
  }
  const blocks = readableBlocks(html);
  if (blocks.length === 0) throw new ReaderError('No readable text was found on that page.', 422);
  return { url: url.href, ...pageDetails(html, url), blocks };
}

/** Does `bytes` start like a PDF (`%PDF-`)? */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}

export function isReaderPdf(read: ReaderPage | ReaderPdf): read is ReaderPdf {
  return 'bytes' in read;
}
