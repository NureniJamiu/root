/**
 * Better Auth & Dashboard API server for the Vite SPA.
 *
 * This Express server exposes:
 *   - /api/auth/*     Better Auth endpoints
 *   - /api/projects/* Database-backed projects and canvas management
 *
 * Usage:
 *   npx tsx server.ts          (development)
 *   node dist/server.js        (after compiling)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth';
import { db } from './src/lib/db';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.AUTH_SERVER_PORT ?? 3001;

app.use(
  cors({
    origin: process.env.VITE_APP_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// Body parser for JSON payloads (canvas graphs can be large)
app.use(express.json({ limit: '50mb' }));

// Helper to resolve current authenticated user or fallback to 'guest'
async function resolveUserId(req: express.Request): Promise<string> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch (_err) {
    // Session retrieval error or unauthenticated
  }
  return 'guest';
}

/* -------------------------------------------------------------------------- */
/* Project API Routes (Database-backed)                                       */
/* -------------------------------------------------------------------------- */

interface ProjectRow {
  id: string;
  userId: string;
  title: string;
  canvas: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

// 1. List all projects for current user (summaries only, excluding heavy canvas payloads)
app.get('/api/projects', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const rows = db
      .prepare(
        'SELECT id, title, nodeCount, createdAt, updatedAt FROM project WHERE userId = ? ORDER BY updatedAt DESC',
      )
      .all(userId) as Array<Omit<ProjectRow, 'canvas' | 'userId'>>;

    // If user has no projects, create an initial one
    if (rows.length === 0) {
      const initialId = crypto.randomUUID();
      const now = new Date().toISOString();
      const initialCanvas = {
        id: initialId,
        title: 'Interactive Graph',
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO project (id, userId, title, canvas, nodeCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        initialId,
        userId,
        initialCanvas.title,
        JSON.stringify(initialCanvas),
        0,
        now,
        now,
      );

      return res.json([
        {
          id: initialId,
          title: initialCanvas.title,
          nodeCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    return res.json(rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// 2. Get single project with full canvas document
app.get('/api/projects/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    const row = db
      .prepare(
        'SELECT id, title, canvas, nodeCount, createdAt, updatedAt FROM project WHERE id = ? AND (userId = ? OR userId = "guest")',
      )
      .get(id, userId) as Omit<ProjectRow, 'userId'> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let parsedCanvas;
    try {
      parsedCanvas = typeof row.canvas === 'string' ? JSON.parse(row.canvas) : row.canvas;
    } catch {
      parsedCanvas = {
        id: row.id,
        title: row.title,
        nodes: [],
        edges: [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }

    return res.json({
      id: row.id,
      title: row.title,
      nodeCount: row.nodeCount,
      canvas: parsedCanvas,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// 3. Create a new project
app.post('/api/projects', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const body = req.body || {};
    const now = new Date().toISOString();
    const id = body.id || crypto.randomUUID();
    const title = body.title || 'Interactive Graph';
    const canvasData =
      body.canvas || {
        id,
        title,
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
      };
    const serializedCanvas =
      typeof canvasData === 'string' ? canvasData : JSON.stringify(canvasData);
    const nodeCount =
      typeof body.nodeCount === 'number'
        ? body.nodeCount
        : Array.isArray(canvasData.nodes)
        ? canvasData.nodes.length
        : 0;

    db.prepare(
      `INSERT INTO project (id, userId, title, canvas, nodeCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, title, serializedCanvas, nodeCount, now, now);

    return res.status(201).json({
      id,
      title,
      nodeCount,
      canvas: typeof canvasData === 'string' ? JSON.parse(canvasData) : canvasData,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// 4. Update project (title, canvas, nodeCount)
app.put('/api/projects/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;
    const body = req.body || {};
    const now = new Date().toISOString();

    const existing = db
      .prepare('SELECT id, title, canvas, nodeCount FROM project WHERE id = ? AND (userId = ? OR userId = "guest")')
      .get(id, userId) as ProjectRow | undefined;

    if (!existing) {
      // Upsert if not existing
      const title = body.title || 'Interactive Graph';
      const canvasData = body.canvas || { id, title, nodes: [], edges: [], createdAt: now, updatedAt: now };
      const serializedCanvas = typeof canvasData === 'string' ? canvasData : JSON.stringify(canvasData);
      const nodeCount = typeof body.nodeCount === 'number' ? body.nodeCount : (Array.isArray(canvasData.nodes) ? canvasData.nodes.length : 0);

      db.prepare(
        `INSERT INTO project (id, userId, title, canvas, nodeCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, title, serializedCanvas, nodeCount, now, now);

      return res.json({ success: true, id, updatedAt: now });
    }

    const title = body.title !== undefined ? body.title : existing.title;
    const serializedCanvas =
      body.canvas !== undefined
        ? typeof body.canvas === 'string'
          ? body.canvas
          : JSON.stringify(body.canvas)
        : existing.canvas;
    const nodeCount =
      body.nodeCount !== undefined
        ? body.nodeCount
        : body.canvas && Array.isArray(body.canvas.nodes)
        ? body.canvas.nodes.length
        : existing.nodeCount;

    db.prepare(
      `UPDATE project
       SET title = ?, canvas = ?, nodeCount = ?, updatedAt = ?
       WHERE id = ? AND (userId = ? OR userId = "guest")`,
    ).run(title, serializedCanvas, nodeCount, now, id, userId);

    return res.json({
      success: true,
      id,
      title,
      nodeCount,
      updatedAt: now,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// 5. Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    const { id } = req.params;

    db.prepare(
      'DELETE FROM project WHERE id = ? AND (userId = ? OR userId = "guest")',
    ).run(id, userId);

    return res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Better Auth handles all /api/auth/* requests.
// toNodeHandler converts the fetch-based handler to an Express-compatible one.
app.all('/api/auth/*splat', toNodeHandler(auth));

app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`  Auth API:    http://localhost:${PORT}/api/auth`);
  console.log(`  Project API: http://localhost:${PORT}/api/projects`);
});
