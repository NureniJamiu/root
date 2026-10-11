/**
 * migrate.ts — creates every table in the local SQLite database.
 * Usage: npx tsx migrate.ts (or npm run auth:migrate)
 *
 * The tables are defined in src/lib/schema.ts. Cloudflare D1 gets the same
 * tables from migrations/0001_init.sql instead.
 */
import Database from 'better-sqlite3';
import { DB_PATH, ensureDbDirectory } from './src/lib/db-path';
import { ensureSchema } from './src/lib/schema';

ensureDbDirectory();
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
ensureSchema(db);

console.log(`✅  Migration complete — tables created in ${DB_PATH}.`);
