/**
 * Read a PDF in the browser with pdf.js and give it back as a reader page
 * (see `reader.ts`): paragraphs page by page, plus what a citation needs.
 *
 * pdf.js and its worker are loaded on demand, the first time a PDF is
 * opened. Only text is read; nothing in the PDF is rendered or run (scripts
 * are off, and annotations, forms and fonts are not loaded).
 */

import type { TextItem } from 'pdfjs-dist/types/src/display/api';

import { linesOf, paragraphsOf, pdfDetails, repeatedLines } from './pdfLayout';
import type { PdfInfo, PdfLine, PdfRun } from './pdfLayout';
import type { ReaderBlock, ReaderPage } from './reader';

/** Most pages read from one PDF. */
export const PDF_MAX_PAGES = 400;

type PdfJs = typeof import('pdfjs-dist');

let pdfjs: Promise<PdfJs> | null = null;

/**
 * pdf.js's legacy build: the modern one needs very recent browser features
 * (such as `Uint8Array.prototype.toHex`, Chrome 140+); this one carries
 * what older browsers lack.
 */
async function loadPdfjs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>,
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}

export class PdfReadError extends Error {}

/**
 * The PDF's text as a reader page. `url` is where it came from (null for a
 * file from the person's computer); `name` is the file name, used as the
 * title when the PDF has none.
 */
export async function pdfToPage(bytes: Uint8Array, url: string | null, name: string): Promise<ReaderPage> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: bytes, enableXfa: false, disableFontFace: true, stopAtErrors: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    void task.destroy();
    const message = err instanceof Error && /password/i.test(err.message)
      ? 'That PDF is protected with a password.'
      : 'That file could not be read as a PDF.';
    throw new PdfReadError(message);
  }
  try {
    const count = Math.min(doc.numPages, PDF_MAX_PAGES);
    const pages: PdfLine[][] = [];
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: PdfRun[] = content.items
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => ({
          text: item.str,
          x: Number(item.transform[4]) || 0,
          y: Number(item.transform[5]) || 0,
          size: Math.abs(Number(item.transform[3])) || item.height || 10,
        }));
      pages.push(linesOf(runs));
      page.cleanup();
    }
    const skip = repeatedLines(pages);
    const blocks: ReaderBlock[] = [];
    pages.forEach((lines, i) => {
      const paragraphs = paragraphsOf(lines, skip);
      if (paragraphs.length === 0) return;
      blocks.push({ kind: 'page', text: `Page ${i + 1}` }, ...paragraphs);
    });
    if (!blocks.some((b) => b.kind !== 'page')) {
      throw new PdfReadError('This PDF has no text to read. It may be a scan of printed pages.');
    }
    const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
    const opening = pages.slice(0, 2).flat().map((l) => l.text).join(' ');
    const details = pdfDetails(info as PdfInfo, pages[0] ?? [], opening, name.replace(/\.pdf$/i, ''));
    let host: string | null = null;
    try {
      host = url ? new URL(url).hostname.replace(/^www\./, '') : null;
    } catch {
      host = null;
    }
    return {
      url: url ?? '',
      title: details.title,
      authors: details.authors,
      published: details.published,
      siteName: host,
      doi: details.doi,
      kind: details.doi ? 'article' : 'report',
      blocks,
    };
  } finally {
    void task.destroy();
  }
}
