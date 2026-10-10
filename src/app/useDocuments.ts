/**
 * `useDocuments` — the research documents of the open project.
 *
 * Mirrors `useProjects` for documents:
 *
 *   - The list and the backlinks (which documents cite which ideas) load
 *     with the project; the backlinks feed `useDocLinksStore` so cards and
 *     the inspector can show them.
 *   - Edits go through a sequenced save queue keyed by document: one request
 *     at a time, the latest title and content win, retried on failure and
 *     flushed when the page goes away.
 *   - Every save names the revision it was based on. If another tab saved in
 *     between, the server refuses (409) and the conflict is shown with a
 *     choice: load the stored version, or keep this one and overwrite it.
 */

import type { JSONContent } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { docLinksActions } from '../data';
import { countWords, extractLinks } from '../editor/links';
import {
  createDocumentApi,
  deleteDocumentApi,
  fetchBacklinks,
  fetchDocument,
  fetchDocuments,
  updateDocumentApi,
} from '../lib/documents-api';
import type { DocumentDetail, DocumentSummary } from '../lib/documents-api';
import { createSaveQueue } from '../lib/save-queue';
import type { SaveOutcome, SaveQueue, SaveStatus } from '../lib/save-queue';
import { emitLoadError, emitSaveError } from '../persistence';

const ACTIVE_DOC_KEY = (projectId: string) => `root-ui:active-document:${projectId}`;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* best-effort */
  }
}

interface Snapshot {
  readonly projectId: string;
  readonly title: string;
  readonly content: JSONContent;
}

export interface DocumentConflict {
  readonly documentId: string;
  readonly stored: DocumentDetail;
  readonly mine: Snapshot;
}

export interface OpenDocument {
  readonly id: string;
  readonly title: string;
  readonly content: JSONContent;
  /** Changes whenever the editor must start over from `content` (open, load latest). */
  readonly version: number;
}

export interface UseDocuments {
  readonly documents: readonly DocumentSummary[];
  readonly active: OpenDocument | null;
  readonly isOpening: boolean;
  readonly saveStatus: SaveStatus;
  readonly wordCount: number;
  readonly conflict: DocumentConflict | null;
  readonly open: (id: string) => Promise<boolean>;
  readonly close: () => void;
  readonly create: (input?: { title?: string; content?: JSONContent }) => Promise<string | null>;
  readonly rename: (title: string) => void;
  readonly changeContent: (content: JSONContent) => void;
  readonly remove: (id: string) => Promise<boolean>;
  readonly resolveConflict: (choice: 'stored' | 'mine') => void;
  /** Send pending edits now. */
  readonly flush: () => Promise<void>;
}

function linkedIdeas(content: JSONContent): string[] {
  const { mentions, embeds } = extractLinks(content);
  return [...new Set([...mentions, ...embeds])];
}

export function useDocuments(projectId: string): UseDocuments {
  const [documents, setDocuments] = useState<readonly DocumentSummary[]>([]);
  const [active, setActive] = useState<OpenDocument | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [wordCount, setWordCount] = useState(0);
  const [conflict, setConflict] = useState<DocumentConflict | null>(null);

  const projectRef = useRef(projectId);
  projectRef.current = projectId;
  /** Revision each document's next save is based on. */
  const revisionsRef = useRef(new Map<string, number>());
  /** Latest local state of the open document. */
  const latestRef = useRef<{ id: string; title: string; content: JSONContent } | null>(null);
  const versionRef = useRef(0);
  const openSeqRef = useRef(0);
  const errorShownRef = useRef(false);

  /* ------------------------------ save queue ----------------------------- */

  const queueRef = useRef<SaveQueue<Snapshot> | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue<Snapshot>({
      send: async (documentId, snap, { keepalive }): Promise<SaveOutcome> => {
        const baseRevision = revisionsRef.current.get(documentId) ?? 1;
        const result = await updateDocumentApi(
          snap.projectId,
          documentId,
          { title: snap.title, content: snap.content, baseRevision },
          { keepalive },
        );
        if (result.ok) {
          revisionsRef.current.set(documentId, result.summary.revision);
          setDocuments((list) => list.map((d) => (d.id === documentId ? result.summary : d)));
          docLinksActions.setDocumentLinks(documentId, linkedIdeas(snap.content));
          docLinksActions.setTitle(documentId, result.summary.title);
          return { ok: true };
        }
        if (result.status === 409 && result.current) {
          setConflict({ documentId, stored: result.current, mine: snap });
          return { ok: false, message: 'This document was changed in another tab or window.', fatal: true };
        }
        if (result.status === 404) {
          return { ok: false, message: 'This document no longer exists.', fatal: true };
        }
        const retryable = result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500;
        return { ok: false, message: result.message, fatal: !retryable };
      },
      onStatus: (status) => {
        setSaveStatus(status);
        if (status === 'saved') errorShownRef.current = false;
      },
      onError: (_id, message) => {
        if (errorShownRef.current) return;
        errorShownRef.current = true;
        emitSaveError({ message: `Document not saved: ${message}` });
      },
      delayMs: 700,
    });
  }
  const queue = queueRef.current;

  const scheduleSave = useCallback(() => {
    const latest = latestRef.current;
    if (!latest || !projectRef.current) return;
    queue.schedule(latest.id, { projectId: projectRef.current, title: latest.title, content: latest.content });
  }, [queue]);

  /* ------------------------------ open / close --------------------------- */

  const show = useCallback((detail: DocumentDetail) => {
    revisionsRef.current.set(detail.id, detail.revision);
    latestRef.current = { id: detail.id, title: detail.title, content: detail.content };
    versionRef.current += 1;
    setActive({ id: detail.id, title: detail.title, content: detail.content, version: versionRef.current });
    setWordCount(detail.wordCount);
    writeStored(ACTIVE_DOC_KEY(detail.projectId), detail.id);
  }, []);

  const open = useCallback(
    async (id: string): Promise<boolean> => {
      if (latestRef.current?.id === id) return true;
      const pid = projectRef.current;
      const seq = ++openSeqRef.current;
      setIsOpening(true);
      await queue.flush();
      const detail = await fetchDocument(pid, id);
      if (seq !== openSeqRef.current || pid !== projectRef.current) return false;
      setIsOpening(false);
      if (!detail) {
        emitLoadError({ message: 'That document could not be opened.' });
        return false;
      }
      show(detail);
      return true;
    },
    [queue, show],
  );

  const close = useCallback(() => {
    void queue.flush();
    openSeqRef.current += 1;
    latestRef.current = null;
    setActive(null);
    setConflict(null);
    writeStored(ACTIVE_DOC_KEY(projectRef.current), null);
  }, [queue]);

  /* ------------------------------ project load --------------------------- */

  useEffect(() => {
    let cancelled = false;
    latestRef.current = null;
    setActive(null);
    setConflict(null);
    setDocuments([]);
    docLinksActions.reset({}, {});
    if (!projectId) return undefined;

    void (async () => {
      const [list, links] = await Promise.all([fetchDocuments(projectId), fetchBacklinks(projectId)]);
      if (cancelled) return;
      if (list) {
        setDocuments(list);
        docLinksActions.reset(links ?? {}, Object.fromEntries(list.map((d) => [d.id, d.title])));
        for (const d of list) revisionsRef.current.set(d.id, d.revision);
        const stored = readStored(ACTIVE_DOC_KEY(projectId));
        if (stored && list.some((d) => d.id === stored)) {
          const seq = ++openSeqRef.current;
          const detail = await fetchDocument(projectId, stored);
          if (!cancelled && detail && seq === openSeqRef.current) show(detail);
        }
      }
    })();
    return () => {
      cancelled = true;
      void queue.flush();
    };
  }, [projectId, queue, show]);

  /* ------------------------- flush when the page goes -------------------- */

  useEffect(() => {
    const onHide = () => queue.flushOnUnload();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void queue.flush();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      void queue.flush();
    };
  }, [queue]);

  /* -------------------------------- edits -------------------------------- */

  const changeContent = useCallback(
    (content: JSONContent) => {
      const latest = latestRef.current;
      if (!latest) return;
      latestRef.current = { ...latest, content };
      setWordCount(countWords(content));
      scheduleSave();
    },
    [scheduleSave],
  );

  const rename = useCallback(
    (title: string) => {
      const latest = latestRef.current;
      if (!latest) return;
      latestRef.current = { ...latest, title };
      setActive((a) => (a && a.id === latest.id ? { ...a, title } : a));
      setDocuments((list) => list.map((d) => (d.id === latest.id ? { ...d, title: title || 'Untitled document' } : d)));
      docLinksActions.setTitle(latest.id, title || 'Untitled document');
      scheduleSave();
    },
    [scheduleSave],
  );

  const create = useCallback(
    async (input: { title?: string; content?: JSONContent } = {}): Promise<string | null> => {
      const pid = projectRef.current;
      if (!pid) return null;
      await queue.flush();
      const detail = await createDocumentApi(pid, input);
      if (!detail) {
        emitSaveError({ message: 'Could not create the document. Check your connection and try again.' });
        return null;
      }
      if (pid !== projectRef.current) return null;
      setDocuments((list) => [detail, ...list.filter((d) => d.id !== detail.id)]);
      docLinksActions.setTitle(detail.id, detail.title);
      docLinksActions.setDocumentLinks(detail.id, linkedIdeas(detail.content));
      openSeqRef.current += 1;
      setIsOpening(false);
      show(detail);
      return detail.id;
    },
    [queue, show],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const pid = projectRef.current;
      queue.discard(id);
      const ok = await deleteDocumentApi(pid, id);
      if (!ok) {
        emitSaveError({ message: 'Could not delete the document. Check your connection and try again.' });
        return false;
      }
      setDocuments((list) => list.filter((d) => d.id !== id));
      docLinksActions.removeDocument(id);
      revisionsRef.current.delete(id);
      if (latestRef.current?.id === id) {
        latestRef.current = null;
        setActive(null);
        setConflict(null);
        writeStored(ACTIVE_DOC_KEY(pid), null);
      }
      return true;
    },
    [queue],
  );

  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  const resolveConflict = useCallback(
    (choice: 'stored' | 'mine') => {
      const c = conflictRef.current;
      if (!c) return;
      setConflict(null);
      revisionsRef.current.set(c.documentId, c.stored.revision);
      if (choice === 'stored') {
        if (latestRef.current?.id === c.documentId) show(c.stored);
        setDocuments((list) => list.map((d) => (d.id === c.documentId ? { ...c.stored } : d)));
        docLinksActions.setDocumentLinks(c.documentId, linkedIdeas(c.stored.content));
        return;
      }
      const latest = latestRef.current;
      const snap =
        latest && latest.id === c.documentId ? { ...c.mine, title: latest.title, content: latest.content } : c.mine;
      queue.schedule(c.documentId, snap);
    },
    [queue, show],
  );

  const flush = useCallback(() => queue.flush(), [queue]);

  return {
    documents,
    active,
    isOpening,
    saveStatus,
    wordCount,
    conflict,
    open,
    close,
    create,
    rename,
    changeContent,
    remove,
    resolveConflict,
    flush,
  };
}
