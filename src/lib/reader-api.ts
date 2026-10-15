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
    const body = (await res.json().catch(() => null)) as (ReaderPage & { error?: string }) | null;
    if (!res.ok || !body) return { ok: false, message: body?.error ?? 'The page could not be read.' };
    return { ok: true, page: body };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, message: '' };
    return { ok: false, message: 'The page could not be reached. Check your connection.' };
  }
}
