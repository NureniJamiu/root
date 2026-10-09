import Database from 'better-sqlite3';

import { DB_PATH, ensureDbDirectory } from './db-path';
import { ensureProjectSchema } from './project-store';

ensureDbDirectory();
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure project tables exist on boot
ensureProjectSchema(db);
