/**
 * Root on Node: the API server, and in production the web server for the
 * built app. (On Cloudflare the same API runs from `src/worker.ts`.)
 *
 * The API itself is in `src/lib/app.ts`. This file opens the local SQLite
 * database, adds the built app from `dist/` when asked, and listens.
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
import { createApp } from './src/lib/app';
import { createAuth } from './src/lib/auth';
import { db } from './src/lib/db';
import { sqliteSql } from './src/lib/sql';
import { createRateLimiter } from './src/lib/ai/ai-store';
import { readAiEnv } from './src/lib/ai/providers';

const PORT = Number(process.env.PORT ?? process.env.AUTH_SERVER_PORT ?? 3001);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
// Serve the built app from this process in production, or when asked to.
const SERVE_APP = process.env.SERVE_APP ? process.env.SERVE_APP === '1' : IS_PRODUCTION;

if (IS_PRODUCTION && !process.env.BETTER_AUTH_SECRET) {
  console.error('BETTER_AUTH_SECRET must be set in production (see .env.example).');
  process.exit(1);
}

const app = await createApp({
  sql: sqliteSql(db),
  auth: createAuth({ database: db, appUrl: process.env.VITE_APP_URL ?? 'http://localhost:5173' }),
  aiLimiter: createRateLimiter(10, 60_000),
  env: process.env,
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
  const aiProviders = Object.keys(readAiEnv(process.env).appKeys);
  console.log(`  AI:          ${aiProviders.length ? aiProviders.join(', ') : 'no app keys (people can add their own)'}`);
  if (SERVE_APP) console.log(`  App:         http://localhost:${PORT}/`);
});
