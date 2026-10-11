import Database from 'better-sqlite3';

import { DB_PATH, ensureDbDirectory } from './db-path';
import { ensureSchema } from './schema';

/** The local SQLite database (Node only; on Workers it is D1). */
ensureDbDirectory();
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create any missing table on boot.
ensureSchema(db);
