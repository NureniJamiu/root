/**
 * migrate.ts — creates Better Auth and Project tables in auth.db
 * Usage: npx tsx migrate.ts
 */
import Database from 'better-sqlite3';

const db = new Database('./auth.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS "user" (
    "id"            TEXT PRIMARY KEY NOT NULL,
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL UNIQUE,
    "emailVerified" INTEGER NOT NULL DEFAULT 0,
    "image"         TEXT,
    "createdAt"     TEXT NOT NULL,
    "updatedAt"     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "session" (
    "id"         TEXT PRIMARY KEY NOT NULL,
    "expiresAt"  TEXT NOT NULL,
    "token"      TEXT NOT NULL UNIQUE,
    "createdAt"  TEXT NOT NULL,
    "updatedAt"  TEXT NOT NULL,
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    "userId"     TEXT NOT NULL REFERENCES "user"("id")
  );

  CREATE TABLE IF NOT EXISTS "account" (
    "id"                     TEXT PRIMARY KEY NOT NULL,
    "accountId"              TEXT NOT NULL,
    "providerId"             TEXT NOT NULL,
    "userId"                 TEXT NOT NULL REFERENCES "user"("id"),
    "accessToken"            TEXT,
    "refreshToken"           TEXT,
    "idToken"                TEXT,
    "accessTokenExpiresAt"   TEXT,
    "refreshTokenExpiresAt"  TEXT,
    "scope"                  TEXT,
    "password"               TEXT,
    "createdAt"              TEXT NOT NULL,
    "updatedAt"              TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    "id"         TEXT PRIMARY KEY NOT NULL,
    "identifier" TEXT NOT NULL,
    "value"      TEXT NOT NULL,
    "expiresAt"  TEXT NOT NULL,
    "createdAt"  TEXT,
    "updatedAt"  TEXT
  );

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

console.log('✅  Migration complete — auth.db tables created including project table.');
