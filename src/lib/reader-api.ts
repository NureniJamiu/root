/**
 * The browser side of the source reader: ask the server to fetch a page
 * (see `reader.ts` for what comes back).
 */

import type { ReaderPage } from './reader';

export type { ReaderBlock, ReaderPage } from './reader';

export type ReadResult = { ok: true; page: ReaderPage } | { ok: false; message: string };

export async function readSource(url: string, signal?: AbortSignal): Promise<ReadResult> {
  try {
    const res = await fetch('/api/reader', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      ...(signal ? { signal } : {}),
    });
    if (res.ok && /application\/pdf/i.test(res.headers.get('content-type') ?? '')) {
      // A PDF: the server fetched it, the browser reads it.
      const finalUrl = decodeURI(res.headers.get('x-reader-url') ?? url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return readPdfBytes(bytes, finalUrl, finalUrl.split('/').pop() ?? 'document.pdf');
    }
    const body = (await res.json().catch(() => null)) as (ReaderPage & { error?: string }) | null;
    if (!res.ok || !body) return { ok: false, message: body?.error ?? 'The page could not be read.' };
    return { ok: true, page: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, message: '' };
    return { ok: false, message: 'The page could not be reached. Check your connection.' };
  }
}

/** Largest PDF opened from the person's computer. */
export const PDF_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** Read PDF bytes with pdf.js (loaded on first use). */
export async function readPdfBytes(bytes: Uint8Array, url: string | null, name: string): Promise<ReadResult> {
  try {
    const { pdfToPage } = await import('./pdfText');
    return { ok: true, page: await pdfToPage(bytes, url, name) };
  } catch (err) {
    const { PdfReadError } = await import('./pdfText');
    return { ok: false, message: err instanceof PdfReadError ? err.message : 'That PDF could not be read.' };
  }
}

/** Read a PDF file the person picked or dropped. */
export async function readPdfFile(file: File): Promise<ReadResult> {
  if (file.size > PDF_FILE_MAX_BYTES) return { ok: false, message: 'That PDF is larger than 25 MB.' };
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    return { ok: false, message: 'That file is not a PDF.' };
  }
  return readPdfBytes(new Uint8Array(await file.arrayBuffer()), null, file.name);
}
