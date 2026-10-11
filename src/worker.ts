/**
 * Root on Cloudflare Workers. Cloudflare serves the built app (`dist/`)
 * itself; requests under /api/* come here (see `wrangler.jsonc`).
 *
 * The API is the same Express app the Node server runs (`src/lib/app.ts`),
 * started once per Worker instance on its first request, with D1 for the
 * database, R2 for images and Cloudflare's rate limiter for AI requests.
 */
import http from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';

import { createApp } from './lib/app';
import { createAuth } from './lib/auth';
import { r2BlobStore } from './lib/blob-store';
import type { WorkerEnv } from './lib/cloudflare';
import { d1Sql } from './lib/sql';
import { cloudflareRateLimiter, createRateLimiter } from './lib/ai/ai-store';

/** A port inside the Worker only; nothing outside can reach it. */
const PORT = 3001;

let started: Promise<void> | undefined;

async function start(env: WorkerEnv, origin: string): Promise<void> {
  // Vars and secrets are strings; bindings (DB, FILES, AI_LIMITER) are not.
  const settings: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) if (typeof value === 'string') settings[name] = value;
  // Without a URL set in wrangler.jsonc, the app's URL is the one it is reached on.
  settings.BETTER_AUTH_URL ??= origin;
  settings.VITE_APP_URL ??= settings.BETTER_AUTH_URL;
  // Code that reads process.env (email, for one) sees the same settings.
  Object.assign(process.env, settings);

  if (!settings.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not set: run `npx wrangler secret put BETTER_AUTH_SECRET`.');

  const app = await createApp({
    sql: d1Sql(env.DB),
    auth: createAuth({
      database: env.DB,
      appUrl: settings.VITE_APP_URL,
      rateLimitInDatabase: true,
      validateSchema: false,
    }),
    blobs: r2BlobStore(env.FILES),
    aiLimiter: env.AI_LIMITER ? cloudflareRateLimiter(env.AI_LIMITER) : createRateLimiter(10, 60_000),
    env: settings,
  });
  await new Promise<void>((resolve) => http.createServer(app).listen(PORT, resolve));
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: unknown): Promise<Response> {
    started ??= start(env, new URL(request.url).origin).catch((error: unknown) => {
      started = undefined; // try again on the next request
      throw error;
    });
    await started;
    return handleAsNodeRequest(PORT, request, env, ctx);
  },
};
