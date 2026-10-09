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
import { createProjectStore, ProjectError } from './src/lib/project-store';

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

// Resolve the signed-in user's id, or null when there is no valid session.
async function getUserId(req: express.Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return session?.user?.id ?? null;
  } catch (_err) {
    return null;
  }
}

// Every project route requires a signed-in user; the id is stored on res.locals.
async function requireUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.locals.userId = userId;
  next();
}

app.use('/api/projects', requireUser);

/* -------------------------------------------------------------------------- */
/* Project API Routes (Database-backed)                                       */
/* -------------------------------------------------------------------------- */

const projects = createProjectStore(db);

// Map a refused request to its HTTP response; anything else is a 500.
function sendError(
  res: express.Response,
  error: unknown,
  fallback: string,
): express.Response {
  if (error instanceof ProjectError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

// 1. List all projects for current user (summaries only, excluding heavy canvas payloads)
app.get('/api/projects', (_req, res) => {
  try {
    return res.json(projects.list(res.locals.userId));
  } catch (error) {
    return sendError(res, error, 'Failed to fetch projects');
  }
});

// 2. Get single project with full canvas document
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = projects.get(res.locals.userId, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json(project);
  } catch (error) {
    return sendError(res, error, 'Failed to fetch project');
  }
});

// 3. Create a new project
app.post('/api/projects', (req, res) => {
  try {
    return res.status(201).json(projects.create(res.locals.userId, req.body));
  } catch (error) {
    return sendError(res, error, 'Failed to create project');
  }
});

// 4. Update an existing project (title and/or canvas). Never creates one.
app.put('/api/projects/:id', (req, res) => {
  try {
    const updated = projects.update(res.locals.userId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, ...updated });
  } catch (error) {
    return sendError(res, error, 'Failed to update project');
  }
});

// 5. Delete project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const removed = projects.remove(res.locals.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, id: req.params.id });
  } catch (error) {
    return sendError(res, error, 'Failed to delete project');
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
