/**
 * Better Auth API server for the Vite SPA.
 *
 * This Express server exposes the Better Auth handler at /api/auth/*
 * and must run alongside the Vite dev server.
 *
 * Usage:
 *   npx tsx server.ts          (development)
 *   node dist/server.js        (after compiling)
 *
 * The Vite app proxies /api/auth/* to this server (see vite.config.ts).
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './src/lib/auth';

const app = express();
const PORT = process.env.AUTH_SERVER_PORT ?? 3001;

app.use(
  cors({
    origin: process.env.VITE_APP_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// Better Auth handles all /api/auth/* requests.
// toNodeHandler converts the fetch-based handler to an Express-compatible one.
app.all('/api/auth/*splat', toNodeHandler(auth));

app.listen(PORT, () => {
  console.log(`Auth server running → http://localhost:${PORT}/api/auth`);
});
