/**
 * Project storage, on SQLite or D1 (see `sql.ts`).
 *
 * Every function takes the owning `userId` and only ever touches that user's
 * rows. Canvases are validated with the same `canvasSchema` the client uses,
 * `nodeCount` is computed here rather than trusted from the request, and
 * image data is kept in its own table so saving a canvas does not re-write
 * every image (see `IMAGE_REF_DATA_URL`).
 */

import crypto from 'node:crypto';
import { z } from 'zod';

import { CANVAS_TITLE_MAX } from '../data/limits';
import { canvasSchema, migrateLegacyCanvas } from '../data/schema';
import type { Canvas } from '../data/types';
import { blobKeys } from './blob-store';
import type { BlobStore } from './blob-store';
import { IMAGE_REF_DATA_URL } from './image-ref';
import { stmt } from './sql';
import type { Sql, SqlStatement } from './sql';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ProjectSummary {
  id: string;
  title: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  canvas: Canvas;
}

/** A request the store refuses, with the HTTP status the route should use. */
export class ProjectError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly code: 'invalid' | 'exists' | 'missing-image',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectError';
  }
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

const createInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(CANVAS_TITLE_MAX).optional(),
  canvas: canvasSchema.optional(),
});

const updateInputSchema = z.object({
  title: z.string().max(CANVAS_TITLE_MAX).optional(),
  canvas: canvasSchema.optional(),
});

export type CreateProjectInput = z.input<typeof createInputSchema>;
export type UpdateProjectInput = z.input<typeof updateInputSchema>;

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new ProjectError(400, 'invalid', message);
  }
  return result.data;
}

function blankCanvas(id: string, title: string, now: string): Canvas {
  return { id, title, nodes: [], edges: [], updatedAt: now };
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

interface ProjectRow extends ProjectSummary {
  canvas: string;
}

/** Where an image's data lives: in its `project_image` row, or in blob storage when the row is ''. */
const IN_BLOB_STORE = '';

const SELECT_ROW =
  'SELECT id, title, canvas, nodeCount, createdAt, updatedAt FROM project WHERE id = ? AND userId = ?';
const SELECT_IMAGES = 'SELECT id, dataUrl FROM project_image WHERE projectId = ?';

/**
 * Projects for `sql`. With `blobs`, image data goes to blob storage (R2 on
 * Workers) and `project_image` keeps only which images a project has.
 */
export function createProjectStore(sql: Sql, blobs?: BlobStore) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /**
   * Plan the writes that move image data out of the canvas into
   * `project_image` (or blob storage), and return the canvas JSON to store
   * (images replaced by `IMAGE_REF_DATA_URL`). Rows for images the canvas no
   * longer contains are dropped. Blob writes happen here, before the
   * database batch, so a stored row never points at a missing blob.
   */
  async function stashImages(
    projectId: string,
    canvas: Canvas,
  ): Promise<{ json: string; writes: SqlStatement[]; dropBlobs: string[] }> {
    const stored = new Set(
      (await sql.all<{ id: string }>('SELECT id FROM project_image WHERE projectId = ?', projectId)).map((r) => r.id),
    );
    const keep = new Set<string>();
    const writes: SqlStatement[] = [];
    const uploads: Array<() => Promise<void>> = [];
    const slim: Canvas = {
      ...canvas,
      nodes: canvas.nodes.map((node) => ({
        ...node,
        images: node.images.map((image) => {
          keep.add(image.id);
          if (image.dataUrl === IMAGE_REF_DATA_URL) {
            if (!stored.has(image.id)) {
              throw new ProjectError(
                409,
                'missing-image',
                `image ${image.id} is not stored on the server`,
              );
            }
          } else {
            let dataUrl = image.dataUrl;
            if (blobs) {
              const key = blobKeys.canvasImage(projectId, image.id);
              const bytes = encoder.encode(image.dataUrl);
              uploads.push(() => blobs.put(key, bytes, 'text/plain'));
              dataUrl = IN_BLOB_STORE;
            }
            writes.push(
              stmt(
                `INSERT INTO project_image (projectId, id, dataUrl) VALUES (?, ?, ?)
                 ON CONFLICT (projectId, id) DO UPDATE SET dataUrl = excluded.dataUrl`,
                projectId,
                image.id,
                dataUrl,
              ),
            );
          }
          return { ...image, dataUrl: IMAGE_REF_DATA_URL };
        }),
      })),
    };
    const dropBlobs: string[] = [];
    for (const id of stored) {
      if (!keep.has(id)) {
        writes.push(stmt('DELETE FROM project_image WHERE projectId = ? AND id = ?', projectId, id));
        dropBlobs.push(blobKeys.canvasImage(projectId, id));
      }
    }
    await Promise.all(uploads.map((upload) => upload()));
    return { json: JSON.stringify(slim), writes, dropBlobs };
  }

  /** Inverse of `stashImages`: put stored image data back into the canvas. */
  async function hydrate(projectId: string, row: ProjectRow): Promise<Canvas> {
    let parsed: Canvas;
    try {
      parsed = migrateLegacyCanvas(JSON.parse(row.canvas)) as Canvas;
    } catch {
      return blankCanvas(row.id, row.title, row.updatedAt);
    }
    const rows = await sql.all<{ id: string; dataUrl: string }>(SELECT_IMAGES, projectId);
    const images = new Map(
      await Promise.all(
        rows.map(async (r): Promise<[string, string | undefined]> => {
          if (r.dataUrl !== IN_BLOB_STORE || !blobs) return [r.id, r.dataUrl];
          const blob = await blobs.get(blobKeys.canvasImage(projectId, r.id));
          return [r.id, blob ? decoder.decode(blob.bytes) : undefined];
        }),
      ),
    );
    return {
      ...parsed,
      nodes: (parsed.nodes ?? []).map((node) => ({
        ...node,
        images: (node.images ?? []).flatMap((image) => {
          if (image.dataUrl !== IMAGE_REF_DATA_URL) return [image]; // legacy inline image
          const dataUrl = images.get(image.id);
          return dataUrl === undefined || dataUrl === IN_BLOB_STORE ? [] : [{ ...image, dataUrl }];
        }),
      })),
    };
  }

  async function dropBlobs(keys: readonly string[]): Promise<void> {
    if (blobs && keys.length) await blobs.delete(keys);
  }

  function removeStatements(userId: string, id: string): SqlStatement[] {
    const owned = 'EXISTS (SELECT 1 FROM project WHERE id = ? AND userId = ?)';
    return [
      stmt(`DELETE FROM project_image WHERE projectId = ? AND ${owned}`, id, id, userId),
      stmt('DELETE FROM project WHERE id = ? AND userId = ?', id, userId),
    ];
  }

  async function create(userId: string, input: CreateProjectInput): Promise<ProjectDetail> {
    const body = parseInput(createInputSchema, input);
    const now = new Date().toISOString();
    const id = body.id ?? crypto.randomUUID();
    if (await sql.first('SELECT 1 FROM project WHERE id = ?', id)) {
      throw new ProjectError(409, 'exists', 'a project with this id already exists');
    }
    const title = body.title ?? body.canvas?.title ?? 'Interactive Graph';
    const canvas = body.canvas ?? blankCanvas(id, title, now);
    const { json, writes } = await stashImages(id, canvas);
    await sql.batch([
      ...writes,
      stmt(
        `INSERT INTO project (id, userId, title, canvas, nodeCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        userId,
        title,
        json,
        canvas.nodes.length,
        now,
        now,
      ),
    ]);
    return { id, title, nodeCount: canvas.nodes.length, canvas, createdAt: now, updatedAt: now };
  }

  return {
    /** Summaries of the user's projects; creates a first one if there are none. */
    async list(userId: string): Promise<ProjectSummary[]> {
      const rows = await sql.all<ProjectSummary>(
        'SELECT id, title, nodeCount, createdAt, updatedAt FROM project WHERE userId = ? ORDER BY updatedAt DESC',
        userId,
      );
      if (rows.length > 0) return rows;
      const { canvas: _canvas, ...summary } = await create(userId, { title: 'Interactive Graph' });
      return [summary];
    },

    async get(userId: string, id: string): Promise<ProjectDetail | null> {
      const row = await sql.first<ProjectRow>(SELECT_ROW, id, userId);
      if (!row) return null;
      return { ...row, canvas: await hydrate(id, row) };
    },

    create,

    /** Update an existing project. Returns `null` when it does not exist. */
    async update(
      userId: string,
      id: string,
      input: UpdateProjectInput,
    ): Promise<Pick<ProjectSummary, 'id' | 'title' | 'nodeCount' | 'updatedAt'> | null> {
      const body = parseInput(updateInputSchema, input);
      const existing = await sql.first<ProjectRow>(SELECT_ROW, id, userId);
      if (!existing) return null;

      const now = new Date().toISOString();
      const title = body.title ?? body.canvas?.title ?? existing.title;
      let serialized = existing.canvas;
      let nodeCount = existing.nodeCount;
      let writes: SqlStatement[] = [];
      let dropped: string[] = [];
      if (body.canvas) {
        ({ json: serialized, writes, dropBlobs: dropped } = await stashImages(id, body.canvas));
        nodeCount = body.canvas.nodes.length;
      }
      await sql.batch([
        ...writes,
        stmt(
          `UPDATE project SET title = ?, canvas = ?, nodeCount = ?, updatedAt = ?
           WHERE id = ? AND userId = ?`,
          title,
          serialized,
          nodeCount,
          now,
          id,
          userId,
        ),
      ]);
      await dropBlobs(dropped);
      return { id, title, nodeCount, updatedAt: now };
    },

    /** Whether the user has this project. */
    async owns(userId: string, id: string): Promise<boolean> {
      return (await sql.first('SELECT 1 FROM project WHERE id = ? AND userId = ?', id, userId)) !== null;
    },

    /**
     * The writes that delete a project and its images, for a batch with the
     * other stores' writes for the project. They do nothing unless the user
     * owns the project; check with `owns` first.
     */
    removeStatements,

    async remove(userId: string, id: string): Promise<boolean> {
      const results = await sql.batch(removeStatements(userId, id));
      const removed = results[1]!.changes > 0;
      if (removed) await blobs?.deletePrefix(blobKeys.project(id));
      return removed;
    },
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
