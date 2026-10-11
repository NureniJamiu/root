/**
 * Every table Root stores, in one place.
 *
 * A local SQLite file gets them on start-up (`ensureSchema`); Cloudflare D1
 * gets them from the files in `migrations/`, applied in order by
 * `wrangler d1 migrations apply`. `0001_init.sql` is this SQL as first
 * deployed (`npm run db:migration` rewrites it, which is only safe before
 * the first deploy). After that, change a table here and in a new numbered
 * migration file; a test checks that the migrations add up to this schema.
 */

import type Database from 'better-sqlite3';

/** Better Auth's tables (users, sessions, accounts, reset tokens, rate limits). */
const AUTH = `
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
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

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
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TEXT NOT NULL,
  "createdAt"  TEXT,
  "updatedAt"  TEXT
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "key"         TEXT NOT NULL UNIQUE,
  "count"       INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);
`;

/** Projects (canvases) and the images on their cards. */
const PROJECTS = `
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

-- dataUrl is '' when the image itself is in blob storage (R2).
CREATE TABLE IF NOT EXISTS "project_image" (
  "projectId" TEXT NOT NULL,
  "id"        TEXT NOT NULL,
  "dataUrl"   TEXT NOT NULL,
  PRIMARY KEY ("projectId", "id")
);
`;

/** Research documents, what they link to, and the images pasted into them. */
const DOCUMENTS = `
CREATE TABLE IF NOT EXISTS "document" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "projectId"     TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "content"       TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "revision"      INTEGER NOT NULL DEFAULT 1,
  "wordCount"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_document_project" ON "document" ("projectId", "updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "document_link" (
  "documentId" TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "nodeId"     TEXT NOT NULL,
  "kind"       TEXT NOT NULL,
  PRIMARY KEY ("documentId", "nodeId", "kind")
);
CREATE INDEX IF NOT EXISTS "idx_document_link_project" ON "document_link" ("projectId");

-- bytes is empty when the image itself is in blob storage (R2).
CREATE TABLE IF NOT EXISTS "project_asset" (
  "projectId" TEXT NOT NULL,
  "id"        TEXT NOT NULL,
  "mime"      TEXT NOT NULL,
  "bytes"     BLOB NOT NULL,
  "createdAt" TEXT NOT NULL,
  PRIMARY KEY ("projectId", "id")
);
`;

/** What the AI layer remembers per person (see `ai/ai-store.ts`). */
const AI = `
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "userId"       TEXT NOT NULL,
  "feature"      TEXT NOT NULL,
  "provider"     TEXT NOT NULL,
  "model"        TEXT NOT NULL,
  "inputTokens"  INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costMicros"   INTEGER,
  "ownKey"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ai_usage_userId_createdAt" ON "ai_usage" ("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "ai_user_settings" (
  "userId"  TEXT PRIMARY KEY NOT NULL,
  "modelId" TEXT
);

CREATE TABLE IF NOT EXISTS "ai_user_key" (
  "userId"     TEXT NOT NULL,
  "provider"   TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "iv"         TEXT NOT NULL,
  "last4"      TEXT NOT NULL,
  "updatedAt"  TEXT NOT NULL,
  PRIMARY KEY ("userId", "provider")
);

CREATE TABLE IF NOT EXISTS "ai_feedback" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "userId"    TEXT NOT NULL,
  "feature"   TEXT NOT NULL,
  "offered"   INTEGER NOT NULL,
  "accepted"  INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ai_feedback_userId_createdAt" ON "ai_feedback" ("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "user_plan" (
  "userId"    TEXT PRIMARY KEY NOT NULL,
  "plan"      TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
`;

/** The project search index (see `ai/search-index.ts`). */
const SEARCH = `
CREATE TABLE IF NOT EXISTS "ai_chunk" (
  "rowid"      INTEGER PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "key"        TEXT NOT NULL,
  "source"     TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "ideaIds"    TEXT NOT NULL,
  "hash"       TEXT NOT NULL,
  "embedModel" TEXT,
  "embedding"  BLOB,
  "updatedAt"  TEXT NOT NULL,
  UNIQUE ("projectId", "key")
);

CREATE VIRTUAL TABLE IF NOT EXISTS "ai_chunk_fts" USING fts5(
  "title", "text", content='ai_chunk', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS "ai_chunk_ai" AFTER INSERT ON "ai_chunk" BEGIN
  INSERT INTO "ai_chunk_fts" ("rowid", "title", "text") VALUES (new."rowid", new."title", new."text");
END;
CREATE TRIGGER IF NOT EXISTS "ai_chunk_ad" AFTER DELETE ON "ai_chunk" BEGIN
  INSERT INTO "ai_chunk_fts" ("ai_chunk_fts", "rowid", "title", "text") VALUES ('delete', old."rowid", old."title", old."text");
END;
CREATE TRIGGER IF NOT EXISTS "ai_chunk_au" AFTER UPDATE OF "title", "text" ON "ai_chunk" BEGIN
  INSERT INTO "ai_chunk_fts" ("ai_chunk_fts", "rowid", "title", "text") VALUES ('delete', old."rowid", old."title", old."text");
  INSERT INTO "ai_chunk_fts" ("rowid", "title", "text") VALUES (new."rowid", new."title", new."text");
END;
`;

export const SCHEMA_SQL = [AUTH, PROJECTS, DOCUMENTS, AI, SEARCH].map((part) => part.trim()).join('\n\n');

/** The D1 migration file's contents: the schema, with a header saying where it comes from. */
export function migrationSql(): string {
  return `-- Root's tables, from src/lib/schema.ts (\`npm run db:migration\`).\n-- Once deployed, never edit this file: add a 0002_<name>.sql file for changes.\n\n${SCHEMA_SQL}\n`;
}

/** Create any missing table in a local SQLite file. */
export function ensureSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
