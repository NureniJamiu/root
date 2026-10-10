/**
 * Root's API server, and in production the web server for the built app.
 *
 * This Express server exposes:
 *   - /api/auth/*                         Better Auth endpoints
 *   - /api/projects/*                     Projects and their canvases
 *   - /api/projects/:pid/documents/*      Research documents
 *   - /api/projects/:pid/assets/*         Images pasted into documents
 *   - /api/ai/*                           AI features, settings and usage
 *   - /api/health                         Liveness check for the host
 *   - everything else (production)        The built app from `dist/`
 *
 * Usage:
 *   npm run auth-server     development API (Vite serves the app on :5173)
 *   npm run build && npm start   production: one process serves app + API
 *
 * Settings come from the environment, or from a `.env` file when present
 * (see `.env.example`).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth';
import { db } from './src/lib/db';
import { createDocumentStore, DocumentError } from './src/lib/document-store';
import { devMailboxEnabled, lastMailTo } from './src/lib/mailer';
import { createProjectStore, ProjectError } from './src/lib/project-store';
import { createRateLimiter, createSqliteAiStore } from './src/lib/ai/ai-store';
import { deriveKeyFromSecret } from './src/lib/ai/keys';
import { isPlan } from './src/lib/ai/plans';
import { readAiEnv } from './src/lib/ai/providers';
import { createAiRouter } from './src/lib/ai/routes';

const app = express();
const PORT = Number(process.env.PORT ?? process.env.AUTH_SERVER_PORT ?? 3001);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
// Serve the built app from this process in production, or when asked to.
const SERVE_APP = process.env.SERVE_APP ? process.env.SERVE_APP === '1' : IS_PRODUCTION;

if (IS_PRODUCTION && !process.env.BETTER_AUTH_SECRET) {
  console.error('BETTER_AUTH_SECRET must be set in production (see .env.example).');
  process.exit(1);
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(
  cors({
    origin: process.env.VITE_APP_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

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

// Body parsers, sized per route: canvases carry inline images, documents do not.
const canvasJson = express.json({ limit: '50mb' });
const documentJson = express.json({ limit: '3mb' });
const imageBody = express.raw({ type: 'image/*', limit: '5mb' });

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
app.post('/api/projects', canvasJson, (req, res) => {
  try {
    return res.status(201).json(projects.create(res.locals.userId, req.body));
  } catch (error) {
    return sendError(res, error, 'Failed to create project');
  }
});

// 4. Update an existing project (title and/or canvas). Never creates one.
app.put('/api/projects/:id', canvasJson, (req, res) => {
  try {
    const updated = projects.update(res.locals.userId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, ...updated });
  } catch (error) {
    return sendError(res, error, 'Failed to update project');
  }
});

// 5. Delete project, with its documents and their images
app.delete('/api/projects/:id', (req, res) => {
  try {
    const removed = db.transaction(() => {
      const gone = projects.remove(res.locals.userId, req.params.id);
      if (gone) documents.removeProject(req.params.id);
      return gone;
    })();
    if (!removed) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, id: req.params.id });
  } catch (error) {
    return sendError(res, error, 'Failed to delete project');
  }
});

/* -------------------------------------------------------------------------- */
/* Document API Routes                                                        */
/* -------------------------------------------------------------------------- */

const documents = createDocumentStore(db);

function sendDocumentError(res: express.Response, error: unknown, fallback: string): express.Response {
  if (error instanceof DocumentError) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.current ? { current: error.current } : {}),
    });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

app.get('/api/projects/:pid/documents', (req, res) => {
  try {
    return res.json(documents.list(res.locals.userId, req.params.pid));
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to fetch documents');
  }
});

app.post('/api/projects/:pid/documents', documentJson, (req, res) => {
  try {
    return res.status(201).json(documents.create(res.locals.userId, req.params.pid, req.body));
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to create document');
  }
});

app.get('/api/projects/:pid/documents/:id', (req, res) => {
  try {
    const doc = documents.get(res.locals.userId, req.params.pid, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    return res.json(doc);
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to fetch document');
  }
});

app.put('/api/projects/:pid/documents/:id', documentJson, (req, res) => {
  try {
    return res.json(documents.update(res.locals.userId, req.params.pid, req.params.id, req.body));
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to save document');
  }
});

app.delete('/api/projects/:pid/documents/:id', (req, res) => {
  try {
    const removed = documents.remove(res.locals.userId, req.params.pid, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Document not found' });
    return res.json({ success: true, id: req.params.id });
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to delete document');
  }
});

app.get('/api/projects/:pid/backlinks', (req, res) => {
  try {
    return res.json(documents.backlinks(res.locals.userId, req.params.pid));
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to fetch backlinks');
  }
});

app.post('/api/projects/:pid/assets', imageBody, (req, res) => {
  try {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
    return res.status(201).json(documents.putAsset(res.locals.userId, req.params.pid, mime, bytes));
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to upload image');
  }
});

app.get('/api/projects/:pid/assets/:id', (req, res) => {
  try {
    const asset = documents.getAsset(res.locals.userId, req.params.pid, req.params.id);
    if (!asset) return res.status(404).json({ error: 'Image not found' });
    res.setHeader('Content-Type', asset.mime);
    // Asset ids are never reused, so the bytes behind a URL never change.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.send(asset.bytes);
  } catch (error) {
    return sendDocumentError(res, error, 'Failed to fetch image');
  }
});

/* -------------------------------------------------------------------------- */
/* AI API Routes                                                              */
/* -------------------------------------------------------------------------- */

const aiEnv = readAiEnv(process.env);
// Everyone is on Pro in development so every feature can be tried; Free in production.
const aiDefaultPlan = isPlan(process.env.AI_DEFAULT_PLAN) ? process.env.AI_DEFAULT_PLAN : IS_PRODUCTION ? 'free' : 'pro';
app.use(
  '/api/ai',
  requireUser,
  createAiRouter({
    store: createSqliteAiStore(db),
    env: aiEnv,
    cryptoKey: await deriveKeyFromSecret(
      process.env.AI_KEY_SECRET || process.env.BETTER_AUTH_SECRET || 'root-development-only-secret',
    ),
    defaultPlan: aiDefaultPlan,
    limiter: createRateLimiter(10, 60_000),
  }),
);

/* -------------------------------------------------------------------------- */
/* Development mailbox (e2e tests follow password reset links through it)     */
/* -------------------------------------------------------------------------- */

if (devMailboxEnabled()) {
  app.get('/api/dev/mailbox', (req, res) => {
    const mail = lastMailTo(String(req.query.to ?? ''));
    if (!mail) return res.status(404).json({ error: 'No mail for that address' });
    return res.json(mail);
  });
}

// Better Auth handles all /api/auth/* requests.
// toNodeHandler converts the fetch-based handler to an Express-compatible one.
app.all('/api/auth/*splat', toNodeHandler(auth));

// Unknown API paths are a 404, never the app's HTML.
app.all('/api/{*splat}', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* -------------------------------------------------------------------------- */
/* The built app (production)                                                 */
/* -------------------------------------------------------------------------- */

if (SERVE_APP) {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error(`No built app at ${DIST_DIR}. Run \`npm run build\` first.`);
    process.exit(1);
  }
  // Hashed bundles can be cached forever; index.html must always be fresh.
  app.use(
    '/assets',
    express.static(path.join(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  // Client-side routes (/dashboard, /auth/login, …) all load the app.
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}

app.listen(PORT, () => {
  console.log(`Server running → http://localhost:${PORT}`);
  console.log(`  Auth API:    http://localhost:${PORT}/api/auth`);
  console.log(`  Project API: http://localhost:${PORT}/api/projects`);
  const aiProviders = Object.keys(aiEnv.appKeys);
  console.log(`  AI:          ${aiProviders.length ? aiProviders.join(', ') : 'no app keys (people can add their own)'}`);
  if (SERVE_APP) console.log(`  App:         http://localhost:${PORT}/`);
});
