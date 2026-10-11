import Database from 'better-sqlite3';

import { ensureSchema } from '../schema';
import { sqliteSql } from '../sql';
import type { Sql } from '../sql';

/** A fresh in-memory database with every table, for tests. */
export function memorySql(): Sql {
  const db = new Database(':memory:');
  ensureSchema(db);
  return sqliteSql(db);
}
