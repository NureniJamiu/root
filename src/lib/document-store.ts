/**
 * Research documents and the images pasted into them, on SQLite or D1.
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
import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';

import {
  countWords,
  documentSchema,
  emptyDocument,
  extractLinks,
  isAllowedHref,
} from '../editor/schema';
import { blobKeys } from './blob-store';
import type { BlobStore } from './blob-store';
import { bytesOf, stmt } from './sql';
import type { Sql, SqlStatement, SqlValue } from './sql';

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
const SELECT_ROW = `SELECT ${SUMMARY_COLUMNS}, content FROM document WHERE id = ? AND projectId = ? AND userId = ?`;

/**
 * Documents for `sql`. With `blobs`, uploaded images go to blob storage (R2
 * on Workers) and `project_asset` keeps only their type.
 */
export function createDocumentStore(sql: Sql, blobs?: BlobStore) {
  async function requireProject(userId: string, projectId: string): Promise<void> {
    if (!(await sql.first('SELECT 1 FROM project WHERE id = ? AND userId = ?', projectId, userId))) {
      throw new DocumentError(404, 'not-found', 'Project not found');
    }
  }

  /**
   * The writes that replace a document's links. `when` is an SQL condition
   * (with its parameters) that must hold for them to apply.
   */
  function linkWrites(
    documentId: string,
    projectId: string,
    content: JSONContent,
    when: { sql: string; params: SqlValue[] } = { sql: '1', params: [] },
  ): SqlStatement[] {
    const { mentions, embeds } = extractLinks(content);
    const links = [
      ...[...mentions].map((nodeId) => [nodeId, 'mention'] as const),
      ...[...embeds].map((nodeId) => [nodeId, 'embed'] as const),
    ];
    return [
      stmt(`DELETE FROM document_link WHERE documentId = ? AND ${when.sql}`, documentId, ...when.params),
      ...links.map(([nodeId, kind]) =>
        stmt(
          `INSERT OR IGNORE INTO document_link (documentId, projectId, nodeId, kind) SELECT ?, ?, ?, ? WHERE ${when.sql}`,
          documentId,
          projectId,
          nodeId,
          kind,
          ...when.params,
        ),
      ),
    ];
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
    async list(userId: string, projectId: string): Promise<DocumentSummary[]> {
      await requireProject(userId, projectId);
      return sql.all<DocumentSummary>(
        `SELECT ${SUMMARY_COLUMNS} FROM document WHERE projectId = ? AND userId = ? ORDER BY updatedAt DESC`,
        projectId,
        userId,
      );
    },

    async get(userId: string, projectId: string, id: string): Promise<DocumentDetail | null> {
      await requireProject(userId, projectId);
      const row = await sql.first<DocumentRow>(SELECT_ROW, id, projectId, userId);
      return row ? toDetail(row) : null;
    },

    async create(userId: string, projectId: string, input: unknown): Promise<DocumentDetail> {
      await requireProject(userId, projectId);
      const body = parseInput(createInputSchema, input);
      const id = body.id ?? crypto.randomUUID();
      if (await sql.first('SELECT 1 FROM document WHERE id = ?', id)) {
        throw new DocumentError(409, 'conflict', 'a document with this id already exists');
      }
      const content = checkContent(body.content ?? emptyDocument(), projectId);
      const title = body.title?.trim() || 'Untitled document';
      const now = new Date().toISOString();
      const wordCount = countWords(content);
      await sql.batch([
        stmt(
          `INSERT INTO document (id, projectId, userId, title, content, revision, wordCount, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          id,
          projectId,
          userId,
          title,
          JSON.stringify(content),
          wordCount,
          now,
          now,
        ),
        ...linkWrites(id, projectId, content),
      ]);
      return { id, projectId, title, wordCount, revision: 1, createdAt: now, updatedAt: now, content };
    },

    /**
     * Save a document. Refused with 409 (carrying the current version) when
     * `baseRevision` is not the stored revision.
     */
    async update(userId: string, projectId: string, id: string, input: unknown): Promise<DocumentSummary> {
      await requireProject(userId, projectId);
      const body = parseInput(updateInputSchema, input);
      const content = body.content === undefined ? undefined : checkContent(body.content, projectId);
      const conflict = async (): Promise<never> => {
        const current = await sql.first<DocumentRow>(SELECT_ROW, id, projectId, userId);
        if (!current) throw new DocumentError(404, 'not-found', 'Document not found');
        throw new DocumentError(409, 'conflict', 'This document was changed somewhere else', toDetail(current));
      };

      const row = await sql.first<DocumentRow>(SELECT_ROW, id, projectId, userId);
      if (!row) throw new DocumentError(404, 'not-found', 'Document not found');
      if (row.revision !== body.baseRevision) return conflict();

      // Strictly later than the version read, so this save's (revision, updatedAt) is its own.
      const now = new Date(Math.max(Date.now(), Date.parse(row.updatedAt) + 1)).toISOString();
      const title = body.title === undefined ? row.title : body.title.trim() || 'Untitled document';
      const serialized = content === undefined ? row.content : JSON.stringify(content);
      const wordCount = content === undefined ? row.wordCount : countWords(content);
      const revision = row.revision + 1;
      // The update only applies if nobody saved since we read; the links only
      // if this very save (this revision and timestamp) is the one stored.
      const results = await sql.batch([
        stmt(
          `UPDATE document SET title = ?, content = ?, revision = ?, wordCount = ?, updatedAt = ?
           WHERE id = ? AND projectId = ? AND userId = ? AND revision = ?`,
          title,
          serialized,
          revision,
          wordCount,
          now,
          id,
          projectId,
          userId,
          row.revision,
        ),
        ...(content === undefined
          ? []
          : linkWrites(id, projectId, content, {
              sql: 'EXISTS (SELECT 1 FROM document WHERE id = ? AND revision = ? AND updatedAt = ?)',
              params: [id, revision, now],
            })),
      ]);
      if (results[0]!.changes === 0) return conflict();
      return { id, projectId, title, wordCount, revision, createdAt: row.createdAt, updatedAt: now };
    },

    async remove(userId: string, projectId: string, id: string): Promise<boolean> {
      await requireProject(userId, projectId);
      const owned = 'EXISTS (SELECT 1 FROM document WHERE id = ? AND projectId = ? AND userId = ?)';
      const results = await sql.batch([
        stmt(`DELETE FROM document_link WHERE documentId = ? AND ${owned}`, id, id, projectId, userId),
        stmt('DELETE FROM document WHERE id = ? AND projectId = ? AND userId = ?', id, projectId, userId),
      ]);
      return results[1]!.changes > 0;
    },

    /**
     * The writes that remove every document, link and asset of a project
     * (the project is being deleted), for one batch with the project's own.
     * Blob storage is cleared by `removeProjectBlobs` once they have run.
     */
    removeProjectStatements(projectId: string): SqlStatement[] {
      return [
        stmt('DELETE FROM document_link WHERE projectId = ?', projectId),
        stmt('DELETE FROM document WHERE projectId = ?', projectId),
        stmt('DELETE FROM project_asset WHERE projectId = ?', projectId),
      ];
    },

    /** Delete a deleted project's images from blob storage. */
    async removeProjectBlobs(projectId: string): Promise<void> {
      await blobs?.deletePrefix(blobKeys.project(projectId));
    },

    async backlinks(userId: string, projectId: string): Promise<Backlinks> {
      await requireProject(userId, projectId);
      const out: Backlinks = {};
      const rows = await sql.all<{ nodeId: string; documentId: string }>(
        `SELECT l.nodeId, l.documentId FROM document_link l
         JOIN document d ON d.id = l.documentId
         WHERE l.projectId = ? AND d.userId = ?`,
        projectId,
        userId,
      );
      for (const { nodeId, documentId } of rows) {
        const list = (out[nodeId] ??= []);
        if (!list.includes(documentId)) list.push(documentId);
      }
      return out;
    },

    async putAsset(
      userId: string,
      projectId: string,
      mime: string,
      bytes: Uint8Array,
    ): Promise<{ id: string; url: string }> {
      await requireProject(userId, projectId);
      if (!(ASSET_MIME_TYPES as readonly string[]).includes(mime)) {
        throw new DocumentError(400, 'invalid', 'only PNG, JPEG, GIF and WebP images can be uploaded');
      }
      if (bytes.length === 0) throw new DocumentError(400, 'invalid', 'the image is empty');
      if (bytes.length > ASSET_MAX_BYTES) throw new DocumentError(413, 'too-large', 'images must be under 5 MB');
      const id = crypto.randomUUID();
      if (blobs) await blobs.put(blobKeys.documentAsset(projectId, id), bytes, mime);
      await sql.run(
        'INSERT INTO project_asset (projectId, id, mime, bytes, createdAt) VALUES (?, ?, ?, ?, ?)',
        projectId,
        id,
        mime,
        blobs ? new Uint8Array(0) : bytes,
        new Date().toISOString(),
      );
      return { id, url: `/api/projects/${projectId}/assets/${id}` };
    },

    async getAsset(userId: string, projectId: string, id: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
      const row = await sql.first<{ mime: string; bytes: unknown }>(
        `SELECT a.mime, a.bytes FROM project_asset a
         JOIN project p ON p.id = a.projectId
         WHERE a.projectId = ? AND a.id = ? AND p.userId = ?`,
        projectId,
        id,
        userId,
      );
      if (!row) return null;
      const bytes = bytesOf(row.bytes);
      if (bytes.length > 0 || !blobs) return { mime: row.mime, bytes };
      const blob = await blobs.get(blobKeys.documentAsset(projectId, id));
      return blob ? { mime: row.mime, bytes: blob.bytes } : null;
    },
  };
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
