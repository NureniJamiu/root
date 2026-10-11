/**
 * Root's API as an Express app, shared by the Node server (`server.ts`) and
 * the Cloudflare Worker (`src/worker.ts`). Each of those opens its own
 * database, blob storage and rate limiter and hands them in here.
 *
 *   - /api/auth/*                         Better Auth endpoints
 *   - /api/projects/*                     Projects and their canvases
 *   - /api/projects/:pid/documents/*      Research documents
 *   - /api/projects/:pid/assets/*         Images pasted into documents
 *   - /api/ai/*                           AI features, settings and usage
 *   - /api/health                         Liveness check for the host
 */
import express from 'express';
import cors from 'cors';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';

import type { Auth } from './auth';
import type { BlobStore } from './blob-store';
import { createDocumentStore, DocumentError } from './document-store';
import { devMailboxEnabled, lastMailTo } from './mailer';
import { createProjectStore, ProjectError } from './project-store';
import type { Sql } from './sql';
import { createSqlAiStore } from './ai/ai-store';
import type { RateLimiter } from './ai/ai-store';
import { deriveKeyFromSecret } from './ai/keys';
import { isPlan } from './ai/plans';
import { toPromptCanvas } from './ai/project-content';
import { readAiEnv } from './ai/providers';
import { createAiRouter } from './ai/routes';
import { readResearchEnv, searchProvidersFor } from './ai/web-search';
import { createSearchIndex } from './ai/search-index';

export interface AppDeps {
  readonly sql: Sql;
  readonly auth: Auth;
  /** Where image bytes go; without it they stay in the database. */
  readonly blobs?: BlobStore;
  /** Limits AI requests per person. */
  readonly aiLimiter: RateLimiter;
  /** Settings: `process.env` on Node, the Worker's vars and secrets on Workers. */
  readonly env: Readonly<Record<string, string | undefined>>;
}

export async function createApp({ sql, auth, blobs, aiLimiter, env }: AppDeps): Promise<express.Express> {
  const app = express();
  const isProduction = env.NODE_ENV === 'production';
  // Let Better Auth finish setting up now. On Workers the app is built during
  // one request, and set-up still running when that request ends never finishes.
  await auth.$context;

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
      origin: env.VITE_APP_URL ?? 'http://localhost:5173',
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

  const projects = createProjectStore(sql, blobs);
  const documents = createDocumentStore(sql, blobs);
  const searchIndex = createSearchIndex(sql);

  /* ------------------------------------------------------------------------ */
  /* Project API Routes                                                       */
  /* ------------------------------------------------------------------------ */

  // Map a refused request to its HTTP response; anything else is a 500.
  function sendError(res: express.Response, error: unknown, fallback: string): express.Response {
    if (error instanceof ProjectError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
  }

  // 1. List all projects for current user (summaries only, excluding heavy canvas payloads)
  app.get('/api/projects', async (_req, res) => {
    try {
      return res.json(await projects.list(res.locals.userId));
    } catch (error) {
      return sendError(res, error, 'Failed to fetch projects');
    }
  });

  // 2. Get single project with full canvas document
  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await projects.get(res.locals.userId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      return res.json(project);
    } catch (error) {
      return sendError(res, error, 'Failed to fetch project');
    }
  });

  // 3. Create a new project
  app.post('/api/projects', canvasJson, async (req, res) => {
    try {
      return res.status(201).json(await projects.create(res.locals.userId, req.body));
    } catch (error) {
      return sendError(res, error, 'Failed to create project');
    }
  });

  // 4. Update an existing project (title and/or canvas). Never creates one.
  app.put('/api/projects/:id', canvasJson, async (req, res) => {
    try {
      const updated = await projects.update(res.locals.userId, req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Project not found' });
      return res.json({ success: true, ...updated });
    } catch (error) {
      return sendError(res, error, 'Failed to update project');
    }
  });

  // 5. Delete project, with its documents, their images and its search index
  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const { userId } = res.locals;
      const id = req.params.id;
      if (!(await projects.owns(userId, id))) return res.status(404).json({ error: 'Project not found' });
      await sql.batch([
        ...documents.removeProjectStatements(id),
        ...searchIndex.removeProjectStatements(id),
        ...projects.removeStatements(userId, id),
      ]);
      await documents.removeProjectBlobs(id);
      return res.json({ success: true, id });
    } catch (error) {
      return sendError(res, error, 'Failed to delete project');
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Document API Routes                                                      */
  /* ------------------------------------------------------------------------ */

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

  app.get('/api/projects/:pid/documents', async (req, res) => {
    try {
      return res.json(await documents.list(res.locals.userId, req.params.pid));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to fetch documents');
    }
  });

  app.post('/api/projects/:pid/documents', documentJson, async (req, res) => {
    try {
      return res.status(201).json(await documents.create(res.locals.userId, req.params.pid, req.body));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to create document');
    }
  });

  app.get('/api/projects/:pid/documents/:id', async (req, res) => {
    try {
      const doc = await documents.get(res.locals.userId, req.params.pid, req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      return res.json(doc);
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to fetch document');
    }
  });

  app.put('/api/projects/:pid/documents/:id', documentJson, async (req, res) => {
    try {
      return res.json(await documents.update(res.locals.userId, req.params.pid, req.params.id, req.body));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to save document');
    }
  });

  app.delete('/api/projects/:pid/documents/:id', async (req, res) => {
    try {
      const removed = await documents.remove(res.locals.userId, req.params.pid, req.params.id);
      if (!removed) return res.status(404).json({ error: 'Document not found' });
      return res.json({ success: true, id: req.params.id });
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to delete document');
    }
  });

  app.get('/api/projects/:pid/backlinks', async (req, res) => {
    try {
      return res.json(await documents.backlinks(res.locals.userId, req.params.pid));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to fetch backlinks');
    }
  });

  app.post('/api/projects/:pid/assets', imageBody, async (req, res) => {
    try {
      const bytes = req.body instanceof Uint8Array ? req.body : new Uint8Array(0);
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim();
      return res.status(201).json(await documents.putAsset(res.locals.userId, req.params.pid, mime, bytes));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to upload image');
    }
  });

  app.get('/api/projects/:pid/assets/:id', async (req, res) => {
    try {
      const asset = await documents.getAsset(res.locals.userId, req.params.pid, req.params.id);
      if (!asset) return res.status(404).json({ error: 'Image not found' });
      res.setHeader('Content-Type', asset.mime);
      // Asset ids are never reused, so the bytes behind a URL never change.
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      return res.send(Buffer.from(asset.bytes.buffer, asset.bytes.byteOffset, asset.bytes.byteLength));
    } catch (error) {
      return sendDocumentError(res, error, 'Failed to fetch image');
    }
  });

  /* ------------------------------------------------------------------------ */
  /* AI API Routes                                                            */
  /* ------------------------------------------------------------------------ */

  // Everyone is on Pro in development so every feature can be tried; Free in production.
  const aiDefaultPlan = isPlan(env.AI_DEFAULT_PLAN) ? env.AI_DEFAULT_PLAN : isProduction ? 'free' : 'pro';
  app.use(
    '/api/ai',
    requireUser,
    createAiRouter({
      store: createSqlAiStore(sql),
      env: readAiEnv(env),
      cryptoKey: await deriveKeyFromSecret(
        env.AI_KEY_SECRET || env.BETTER_AUTH_SECRET || 'root-development-only-secret',
      ),
      defaultPlan: aiDefaultPlan,
      limiter: aiLimiter,
      index: searchIndex,
      // Research this question: Wikipedia and OpenAlex (free), plus the web with a Tavily key.
      research: searchProvidersFor(readResearchEnv(env)),
      // Ask and the gap check read the saved project: canvas and documents, never images.
      loadProject: async (userId, projectId) => {
        const project = await projects.get(userId, projectId);
        if (!project) return null;
        const summaries = await documents.list(userId, projectId);
        const docs = await Promise.all(summaries.map((summary) => documents.get(userId, projectId, summary.id)));
        return {
          title: project.title,
          canvas: toPromptCanvas(project.canvas),
          documents: docs.flatMap((doc) => (doc ? [{ id: doc.id, title: doc.title, content: doc.content }] : [])),
        };
      },
    }),
  );

  /* ------------------------------------------------------------------------ */
  /* Development mailbox (e2e tests follow password reset links through it)   */
  /* ------------------------------------------------------------------------ */

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

  return app;
}
