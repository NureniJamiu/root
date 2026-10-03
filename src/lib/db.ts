import Database from 'better-sqlite3';

export const db = new Database('./auth.db');
db.pragma('journal_mode = WAL');

// Ensure tables exist on boot
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
`);
