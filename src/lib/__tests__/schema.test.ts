// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { ensureSchema } from '../schema';

const MIGRATIONS = path.resolve(__dirname, '../../../migrations');

function tables(db: Database.Database): Array<{ type: string; name: string; sql: string | null }> {
  return db
    .prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all() as Array<{ type: string; name: string; sql: string | null }>;
}

describe('D1 migrations', () => {
  it('add up to the same tables the local database gets', () => {
    const local = new Database(':memory:');
    ensureSchema(local);

    const d1 = new Database(':memory:');
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    expect(files[0]).toBe('0001_init.sql');
    for (const file of files) d1.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));

    expect(tables(d1)).toEqual(tables(local));
  });
});
