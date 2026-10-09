/**
 * SQLite-backed project storage.
 *
 * Every function takes the owning `userId` and only ever touches that user's
 * rows. Canvases are validated with the same `canvasSchema` the client uses,
 * `nodeCount` is computed here rather than trusted from the request, and
 * image data is kept in its own table so saving a canvas does not re-write
 * every image (see `IMAGE_REF_DATA_URL`).
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';

import { CANVAS_TITLE_MAX } from '../data/limits';
import { canvasSchema, migrateLegacyCanvas } from '../data/schema';
import type { Canvas } from '../data/types';
import { IMAGE_REF_DATA_URL } from './image-ref';

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
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export function ensureProjectSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "project" (
      "id"          TEXT PRIMARY KEY NOT NULL,
      "userId"      TEXT NOT NULL,
      "title"       TEXT NOT NULL,
      "canvas"      TEXT NOT NULL,
      "nodeCount"   INTEGER NOT NULL DEFAULT 0,
      "createdAt"   TEXT NOT NULL,
      "updatedAt"   TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "idx_project_userId_updatedAt" ON "project" ("userId", "updatedAt" DESC);

    CREATE TABLE IF NOT EXISTS "project_image" (
      "projectId" TEXT NOT NULL,
      "id"        TEXT NOT NULL,
      "dataUrl"   TEXT NOT NULL,
      PRIMARY KEY ("projectId", "id")
    );
  `);
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

export function createProjectStore(db: Database.Database) {
  const selectSummaries = db.prepare(
    'SELECT id, title, nodeCount, createdAt, updatedAt FROM project WHERE userId = ? ORDER BY updatedAt DESC',
  );
  const selectRow = db.prepare(
    'SELECT id, title, canvas, nodeCount, createdAt, updatedAt FROM project WHERE id = ? AND userId = ?',
  );
  const idTaken = db.prepare('SELECT 1 FROM project WHERE id = ?');
  const insertProject = db.prepare(
    `INSERT INTO project (id, userId, title, canvas, nodeCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateProject = db.prepare(
    `UPDATE project SET title = ?, canvas = ?, nodeCount = ?, updatedAt = ?
     WHERE id = ? AND userId = ?`,
  );
  const deleteProject = db.prepare('DELETE FROM project WHERE id = ? AND userId = ?');
  const selectImages = db.prepare('SELECT id, dataUrl FROM project_image WHERE projectId = ?');
  const upsertImage = db.prepare(
    `INSERT INTO project_image (projectId, id, dataUrl) VALUES (?, ?, ?)
     ON CONFLICT (projectId, id) DO UPDATE SET dataUrl = excluded.dataUrl`,
  );
  const deleteImages = db.prepare('DELETE FROM project_image WHERE projectId = ?');
  const deleteImage = db.prepare('DELETE FROM project_image WHERE projectId = ? AND id = ?');

  /**
   * Move image data out of the canvas into `project_image` and return the
   * canvas JSON to store (images replaced by `IMAGE_REF_DATA_URL`). Rows for
   * images the canvas no longer contains are dropped.
   */
  function stashImages(projectId: string, canvas: Canvas): string {
    const stored = new Set(
      (selectImages.all(projectId) as Array<{ id: string }>).map((r) => r.id),
    );
    const keep = new Set<string>();
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
            upsertImage.run(projectId, image.id, image.dataUrl);
          }
          return { ...image, dataUrl: IMAGE_REF_DATA_URL };
        }),
      })),
    };
    for (const id of stored) {
      if (!keep.has(id)) {
        deleteImage.run(projectId, id);
      }
    }
    return JSON.stringify(slim);
  }

  /** Inverse of `stashImages`: put stored image data back into the canvas. */
  function hydrate(projectId: string, row: ProjectRow): Canvas {
    let parsed: Canvas;
    try {
      parsed = migrateLegacyCanvas(JSON.parse(row.canvas)) as Canvas;
    } catch {
      return blankCanvas(row.id, row.title, row.updatedAt);
    }
    const images = new Map(
      (selectImages.all(projectId) as Array<{ id: string; dataUrl: string }>).map((r) => [
        r.id,
        r.dataUrl,
      ]),
    );
    return {
      ...parsed,
      nodes: (parsed.nodes ?? []).map((node) => ({
        ...node,
        images: (node.images ?? []).flatMap((image) => {
          if (image.dataUrl !== IMAGE_REF_DATA_URL) return [image]; // legacy inline image
          const dataUrl = images.get(image.id);
          return dataUrl === undefined ? [] : [{ ...image, dataUrl }];
        }),
      })),
    };
  }

  function insert(userId: string, id: string, title: string, canvas: Canvas, now: string): void {
    insertProject.run(id, userId, title, stashImages(id, canvas), canvas.nodes.length, now, now);
  }

  function create(userId: string, input: CreateProjectInput): ProjectDetail {
    const body = parseInput(createInputSchema, input);
    const now = new Date().toISOString();
    const id = body.id ?? crypto.randomUUID();
    if (idTaken.get(id)) {
      throw new ProjectError(409, 'exists', 'a project with this id already exists');
    }
    const title = body.title ?? body.canvas?.title ?? 'Interactive Graph';
    const canvas = body.canvas ?? blankCanvas(id, title, now);
    db.transaction(() => insert(userId, id, title, canvas, now))();
    return { id, title, nodeCount: canvas.nodes.length, canvas, createdAt: now, updatedAt: now };
  }

  return {
    /** Summaries of the user's projects; creates a first one if there are none. */
    list(userId: string): ProjectSummary[] {
      const rows = selectSummaries.all(userId) as ProjectSummary[];
      if (rows.length > 0) return rows;
      return [create(userId, { title: 'Interactive Graph' })].map(
        ({ canvas: _canvas, ...summary }) => summary,
      );
    },

    get(userId: string, id: string): ProjectDetail | null {
      const row = selectRow.get(id, userId) as ProjectRow | undefined;
      if (!row) return null;
      return { ...row, canvas: hydrate(id, row) };
    },

    create,

    /** Update an existing project. Returns `null` when it does not exist. */
    update(
      userId: string,
      id: string,
      input: UpdateProjectInput,
    ): Pick<ProjectSummary, 'id' | 'title' | 'nodeCount' | 'updatedAt'> | null {
      const body = parseInput(updateInputSchema, input);
      return db.transaction(() => {
        const existing = selectRow.get(id, userId) as ProjectRow | undefined;
        if (!existing) return null;

        const now = new Date().toISOString();
        const title = body.title ?? body.canvas?.title ?? existing.title;
        let serialized = existing.canvas;
        let nodeCount = existing.nodeCount;
        if (body.canvas) {
          serialized = stashImages(id, body.canvas);
          nodeCount = body.canvas.nodes.length;
        }
        updateProject.run(title, serialized, nodeCount, now, id, userId);
        return { id, title, nodeCount, updatedAt: now };
      })();
    },

    remove(userId: string, id: string): boolean {
      return db.transaction(() => {
        const removed = deleteProject.run(id, userId).changes > 0;
        if (removed) deleteImages.run(id);
        return removed;
      })();
    },
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
