import type { JSONContent } from '@tiptap/core';

/** A document as listed in the sidebar. */
export interface DocumentSummary {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly wordCount: number;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  readonly content: JSONContent;
}

/** idea id → ids of the documents that mention or embed it. */
export type Backlinks = Readonly<Record<string, readonly string[]>>;

export type DocumentSaveResult =
  | { readonly ok: true; readonly summary: DocumentSummary }
  | {
      readonly ok: false;
      /** HTTP status, or 0 when the request never completed. */
      readonly status: number;
      readonly code?: string;
      readonly message: string;
      /** The stored version, when the save lost a race with another tab. */
      readonly current?: DocumentDetail;
    };

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`GET ${url} failed:`, err);
    return null;
  }
}

export function fetchDocuments(projectId: string): Promise<DocumentSummary[] | null> {
  return getJson<DocumentSummary[]>(`${base(projectId)}/documents`);
}

export function fetchDocument(projectId: string, id: string): Promise<DocumentDetail | null> {
  return getJson<DocumentDetail>(`${base(projectId)}/documents/${encodeURIComponent(id)}`);
}

export function fetchBacklinks(projectId: string): Promise<Backlinks | null> {
  return getJson<Backlinks>(`${base(projectId)}/backlinks`);
}

export async function createDocumentApi(
  projectId: string,
  payload: { id?: string; title?: string; content?: JSONContent },
): Promise<DocumentDetail | null> {
  try {
    const res = await fetch(`${base(projectId)}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as DocumentDetail;
  } catch (err) {
    console.warn('createDocument failed:', err);
    return null;
  }
}

/** Save a document. Never throws; the result says why a save was refused. */
export async function updateDocumentApi(
  projectId: string,
  id: string,
  payload: { title?: string; content?: JSONContent; baseRevision: number },
  options: { keepalive?: boolean } = {},
): Promise<DocumentSaveResult> {
  try {
    const res = await fetch(`${base(projectId)}/documents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      ...(options.keepalive ? { keepalive: true } : {}),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, summary: body as unknown as DocumentSummary };
    return {
      ok: false,
      status: res.status,
      ...(typeof body.code === 'string' ? { code: body.code } : {}),
      message: typeof body.error === 'string' ? body.error : `Save failed (${res.status})`,
      ...(body.current ? { current: body.current as DocumentDetail } : {}),
    };
  } catch (err) {
    console.warn(`updateDocument(${id}) failed:`, err);
    return { ok: false, status: 0, message: 'Could not reach the server' };
  }
}

export async function deleteDocumentApi(projectId: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${base(projectId)}/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn(`deleteDocument(${id}) failed:`, err);
    return false;
  }
}

/** Upload an image for a document; resolves to its URL, or an error message. */
export async function uploadAsset(
  projectId: string,
  file: Blob,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${base(projectId)}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      credentials: 'include',
      body: file,
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && body.url) return { ok: true, url: body.url };
    return { ok: false, message: body.error ?? `Upload failed (${res.status})` };
  } catch {
    return { ok: false, message: 'Could not reach the server' };
  }
}
