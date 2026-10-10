/**
 * SQLite-backed research documents and the images pasted into them.
 *
 * Documents belong to a project and are saved on their own, not inside the
 * canvas JSON: they change at typing speed and can be large, while a canvas
 * save rewrites the whole canvas. Every function takes the owning `userId`
 * and only touches documents of that user's projects.
 *
 *   - Content is TipTap JSON. It is checked against the same ProseMirror
 *     schema the editor uses (`editor/schema.ts`), links and images with an
 *     unsafe address are dropped, and anything that does not fit is refused.
 *   - Each save carries the `revision` it was based on; a stale one is refused
 *     with 409 so two open tabs cannot silently overwrite each other.
 *   - `document_link` is rebuilt on every save from the ideas the document
 *     mentions or embeds, so backlinks never need to load every document.
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';

import {
  countWords,
  documentSchema,
  emptyDocument,
  extractLinks,
  isAllowedHref,
} from '../editor/schema';

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const DOCUMENT_TITLE_MAX = 200;
/** Largest document accepted, measured as its JSON text. */
export const DOCUMENT_CONTENT_MAX_BYTES = 2 * 1024 * 1024;
/** Largest image accepted for a document. */
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface DocumentSummary {
  id: string;
  projectId: string;
  title: string;
  wordCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: JSONContent;
}

/** idea id → ids of the documents that mention or embed it. */
export type Backlinks = Record<string, string[]>;

export class DocumentError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 413,
    readonly code: 'invalid' | 'not-found' | 'conflict' | 'too-large',
    message: string,
    readonly current?: DocumentDetail,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export function ensureDocumentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "document" (
      "id"            TEXT PRIMARY KEY NOT NULL,
      "projectId"     TEXT NOT NULL,
      "userId"        TEXT NOT NULL,
      "title"         TEXT NOT NULL,
      "content"       TEXT NOT NULL,
      "schemaVersion" INTEGER NOT NULL DEFAULT 1,
      "revision"      INTEGER NOT NULL DEFAULT 1,
      "wordCount"     INTEGER NOT NULL DEFAULT 0,
      "createdAt"     TEXT NOT NULL,
      "updatedAt"     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_document_project" ON "document" ("projectId", "updatedAt" DESC);

    CREATE TABLE IF NOT EXISTS "document_link" (
      "documentId" TEXT NOT NULL,
      "projectId"  TEXT NOT NULL,
      "nodeId"     TEXT NOT NULL,
      "kind"       TEXT NOT NULL,
      PRIMARY KEY ("documentId", "nodeId", "kind")
    );
    CREATE INDEX IF NOT EXISTS "idx_document_link_project" ON "document_link" ("projectId");

    CREATE TABLE IF NOT EXISTS "project_asset" (
      "projectId" TEXT NOT NULL,
      "id"        TEXT NOT NULL,
      "mime"      TEXT NOT NULL,
      "bytes"     BLOB NOT NULL,
      "createdAt" TEXT NOT NULL,
      PRIMARY KEY ("projectId", "id")
    );
  `);
}

/* -------------------------------------------------------------------------- */
/* Content checks                                                             */
/* -------------------------------------------------------------------------- */

/** Images in a document must be ones uploaded to this project, or https. */
function isAllowedImageSrc(src: unknown, projectId: string): boolean {
  if (typeof src !== 'string') return false;
  if (src.startsWith(`/api/projects/${projectId}/assets/`)) return true;
  return /^https:\/\//i.test(src);
}

/** Drop unsafe links and images; everything else is kept as sent. */
function sanitize(node: JSONContent, projectId: string): JSONContent | null {
  if (node.type === 'image' && !isAllowedImageSrc(node.attrs?.src, projectId)) return null;
  const out: JSONContent = { ...node };
  if (node.marks) {
    out.marks = node.marks.filter(
      (m) => m.type !== 'link' || (typeof m.attrs?.href === 'string' && isAllowedHref(m.attrs.href)),
    );
  }
  if (node.content) {
    out.content = node.content.flatMap((child) => {
      const clean = sanitize(child, projectId);
      return clean ? [clean] : [];
    });
  }
  return out;
}

/** Validate content against the editor's schema; returns the normalised JSON. */
export function checkContent(content: unknown, projectId: string): JSONContent {
  if (typeof content !== 'object' || content === null || (content as JSONContent).type !== 'doc') {
    throw new DocumentError(400, 'invalid', 'content must be a document');
  }
  const size = Buffer.byteLength(JSON.stringify(content));
  if (size > DOCUMENT_CONTENT_MAX_BYTES) {
    throw new DocumentError(413, 'too-large', 'this document is too large to save');
  }
  const clean = sanitize(content as JSONContent, projectId) as JSONContent;
  try {
    const node = documentSchema().nodeFromJSON(clean);
    node.check();
    return node.toJSON() as JSONContent;
  } catch (err) {
    throw new DocumentError(400, 'invalid', `content does not fit the document schema: ${(err as Error).message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

const createInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(DOCUMENT_TITLE_MAX).optional(),
  content: z.unknown().optional(),
});

const updateInputSchema = z.object({
  title: z.string().max(DOCUMENT_TITLE_MAX).optional(),
  content: z.unknown().optional(),
  baseRevision: z.number().int().positive(),
});

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new DocumentError(400, 'invalid', message);
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

interface DocumentRow extends DocumentSummary {
  content: string;
}

const SUMMARY_COLUMNS = 'id, projectId, title, wordCount, revision, createdAt, updatedAt';

export function createDocumentStore(db: Database.Database) {
  const ownsProject = db.prepare('SELECT 1 FROM project WHERE id = ? AND userId = ?');
  const selectSummaries = db.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM document WHERE projectId = ? AND userId = ? ORDER BY updatedAt DESC`,
  );
  const selectRow = db.prepare(
    `SELECT ${SUMMARY_COLUMNS}, content FROM document WHERE id = ? AND projectId = ? AND userId = ?`,
  );
  const idTaken = db.prepare('SELECT 1 FROM document WHERE id = ?');
  const insertDocument = db.prepare(
    `INSERT INTO document (id, projectId, userId, title, content, revision, wordCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  );
  const updateDocument = db.prepare(
    `UPDATE document SET title = ?, content = ?, revision = ?, wordCount = ?, updatedAt = ?
     WHERE id = ? AND projectId = ? AND userId = ?`,
  );
  const deleteDocument = db.prepare('DELETE FROM document WHERE id = ? AND projectId = ? AND userId = ?');
  const deleteLinks = db.prepare('DELETE FROM document_link WHERE documentId = ?');
  const insertLink = db.prepare(
    'INSERT OR IGNORE INTO document_link (documentId, projectId, nodeId, kind) VALUES (?, ?, ?, ?)',
  );
  const selectLinks = db.prepare(
    `SELECT l.nodeId, l.documentId FROM document_link l
     JOIN document d ON d.id = l.documentId
     WHERE l.projectId = ? AND d.userId = ?`,
  );
  const insertAsset = db.prepare(
    'INSERT INTO project_asset (projectId, id, mime, bytes, createdAt) VALUES (?, ?, ?, ?, ?)',
  );
  const selectAsset = db.prepare(
    `SELECT a.mime, a.bytes FROM project_asset a
     JOIN project p ON p.id = a.projectId
     WHERE a.projectId = ? AND a.id = ? AND p.userId = ?`,
  );

  function requireProject(userId: string, projectId: string): void {
    if (!ownsProject.get(projectId, userId)) {
      throw new DocumentError(404, 'not-found', 'Project not found');
    }
  }

  function writeLinks(documentId: string, projectId: string, content: JSONContent): void {
    deleteLinks.run(documentId);
    const { mentions, embeds } = extractLinks(content);
    for (const nodeId of mentions) insertLink.run(documentId, projectId, nodeId, 'mention');
    for (const nodeId of embeds) insertLink.run(documentId, projectId, nodeId, 'embed');
  }

  function toDetail(row: DocumentRow): DocumentDetail {
    let content: JSONContent;
    try {
      content = JSON.parse(row.content) as JSONContent;
    } catch {
      content = emptyDocument();
    }
    const { content: _raw, ...summary } = row;
    return { ...summary, content };
  }

  return {
    list(userId: string, projectId: string): DocumentSummary[] {
      requireProject(userId, projectId);
      return selectSummaries.all(projectId, userId) as DocumentSummary[];
    },

    get(userId: string, projectId: string, id: string): DocumentDetail | null {
      requireProject(userId, projectId);
      const row = selectRow.get(id, projectId, userId) as DocumentRow | undefined;
      return row ? toDetail(row) : null;
    },

    create(userId: string, projectId: string, input: unknown): DocumentDetail {
      requireProject(userId, projectId);
      const body = parseInput(createInputSchema, input);
      const id = body.id ?? crypto.randomUUID();
      if (idTaken.get(id)) throw new DocumentError(409, 'conflict', 'a document with this id already exists');
      const content = checkContent(body.content ?? emptyDocument(), projectId);
      const title = body.title?.trim() || 'Untitled document';
      const now = new Date().toISOString();
      const wordCount = countWords(content);
      db.transaction(() => {
        insertDocument.run(id, projectId, userId, title, JSON.stringify(content), wordCount, now, now);
        writeLinks(id, projectId, content);
      })();
      return { id, projectId, title, wordCount, revision: 1, createdAt: now, updatedAt: now, content };
    },

    /**
     * Save a document. Refused with 409 (carrying the current version) when
     * `baseRevision` is not the stored revision.
     */
    update(userId: string, projectId: string, id: string, input: unknown): DocumentSummary {
      requireProject(userId, projectId);
      const body = parseInput(updateInputSchema, input);
      const content = body.content === undefined ? undefined : checkContent(body.content, projectId);
      return db.transaction(() => {
        const row = selectRow.get(id, projectId, userId) as DocumentRow | undefined;
        if (!row) throw new DocumentError(404, 'not-found', 'Document not found');
        if (row.revision !== body.baseRevision) {
          throw new DocumentError(409, 'conflict', 'This document was changed somewhere else', toDetail(row));
        }
        const now = new Date().toISOString();
        const title = body.title === undefined ? row.title : body.title.trim() || 'Untitled document';
        const serialized = content === undefined ? row.content : JSON.stringify(content);
        const wordCount = content === undefined ? row.wordCount : countWords(content);
        const revision = row.revision + 1;
        updateDocument.run(title, serialized, revision, wordCount, now, id, projectId, userId);
        if (content !== undefined) writeLinks(id, projectId, content);
        return { id, projectId, title, wordCount, revision, createdAt: row.createdAt, updatedAt: now };
      })();
    },

    remove(userId: string, projectId: string, id: string): boolean {
      requireProject(userId, projectId);
      return db.transaction(() => {
        const removed = deleteDocument.run(id, projectId, userId).changes > 0;
        if (removed) deleteLinks.run(id);
        return removed;
      })();
    },

    /** Remove every document, link and asset of a project (the project is being deleted). */
    removeProject(projectId: string): void {
      db.prepare('DELETE FROM document_link WHERE projectId = ?').run(projectId);
      db.prepare('DELETE FROM document WHERE projectId = ?').run(projectId);
      db.prepare('DELETE FROM project_asset WHERE projectId = ?').run(projectId);
    },

    backlinks(userId: string, projectId: string): Backlinks {
      requireProject(userId, projectId);
      const out: Backlinks = {};
      for (const { nodeId, documentId } of selectLinks.all(projectId, userId) as Array<{
        nodeId: string;
        documentId: string;
      }>) {
        const list = (out[nodeId] ??= []);
        if (!list.includes(documentId)) list.push(documentId);
      }
      return out;
    },

    putAsset(userId: string, projectId: string, mime: string, bytes: Buffer): { id: string; url: string } {
      requireProject(userId, projectId);
      if (!(ASSET_MIME_TYPES as readonly string[]).includes(mime)) {
        throw new DocumentError(400, 'invalid', 'only PNG, JPEG, GIF and WebP images can be uploaded');
      }
      if (bytes.length === 0) throw new DocumentError(400, 'invalid', 'the image is empty');
      if (bytes.length > ASSET_MAX_BYTES) throw new DocumentError(413, 'too-large', 'images must be under 5 MB');
      const id = crypto.randomUUID();
      insertAsset.run(projectId, id, mime, bytes, new Date().toISOString());
      return { id, url: `/api/projects/${projectId}/assets/${id}` };
    },

    getAsset(userId: string, projectId: string, id: string): { mime: string; bytes: Buffer } | null {
      const row = selectAsset.get(projectId, id, userId) as { mime: string; bytes: Buffer } | undefined;
      return row ?? null;
    },
  };
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
