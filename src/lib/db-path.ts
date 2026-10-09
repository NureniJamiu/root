import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Location of the SQLite file. Defaults to `auth.db` in the repository root
 * regardless of the process's working directory; set `DATABASE_PATH` to
 * override (absolute, or relative to the working directory).
 */
export const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../auth.db');

/** Create the database's directory if it does not exist yet. */
export function ensureDbDirectory(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
