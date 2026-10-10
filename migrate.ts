/**
 * migrate.ts — creates Better Auth and Project tables in the SQLite database
 * Usage: npx tsx migrate.ts
 */
import Database from 'better-sqlite3';
import { DB_PATH, ensureDbDirectory } from './src/lib/db-path';
import { ensureDocumentSchema } from './src/lib/document-store';
import { ensureProjectSchema } from './src/lib/project-store';

ensureDbDirectory();
const db = new Database(DB_PATH);
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
`);

ensureProjectSchema(db);
ensureDocumentSchema(db);

console.log(`✅  Migration complete — tables created in ${DB_PATH}.`);
