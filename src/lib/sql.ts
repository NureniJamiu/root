/**
 * The one way server code talks to the database, so the same stores run on a
 * local SQLite file (`better-sqlite3`, development and tests) and on
 * Cloudflare D1 (production on Workers).
 *
 * Everything is async because D1 is. D1 has no interactive transactions, so
 * code that must change several rows together reads first, decides, then
 * sends every write in one `batch`, which runs all-or-nothing on both.
 */

import type Database from 'better-sqlite3';

import type { D1Database } from './cloudflare';

export type SqlValue = string | number | null | Uint8Array;

export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

export interface SqlResult<T = Record<string, unknown>> {
  /** Rows changed by an INSERT, UPDATE or DELETE. */
  readonly changes: number;
  /** Rows returned, for a SELECT or a statement with RETURNING. */
  readonly rows: T[];
}

export interface Sql {
  first<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  run(sql: string, ...params: SqlValue[]): Promise<SqlResult>;
  /** Run the statements in order, all-or-nothing. */
  batch(statements: readonly SqlStatement[]): Promise<SqlResult[]>;
}

export function stmt(sql: string, ...params: SqlValue[]): SqlStatement {
  return { sql, params };
}

/**
 * A BLOB as bytes, whichever form the driver returned it in: a Node Buffer
 * (better-sqlite3), an ArrayBuffer or an array of byte values (D1).
 */
export function bytesOf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return new Uint8Array(0);
}

/* -------------------------------------------------------------------------- */
/* better-sqlite3                                                             */
/* -------------------------------------------------------------------------- */

export function sqliteSql(db: Database.Database): Sql {
  const cache = new Map<string, Database.Statement>();
  const prepare = (sql: string): Database.Statement => {
    let prepared = cache.get(sql);
    if (!prepared) {
      prepared = db.prepare(sql);
      cache.set(sql, prepared);
    }
    return prepared;
  };
  const exec = (s: SqlStatement): SqlResult => {
    const prepared = prepare(s.sql);
    if (prepared.reader) return { changes: 0, rows: prepared.all(...s.params) as Record<string, unknown>[] };
    return { changes: prepared.run(...s.params).changes, rows: [] };
  };
  const runAll = db.transaction((statements: readonly SqlStatement[]) => statements.map(exec));

  return {
    async first<T>(sql: string, ...params: SqlValue[]) {
      return (prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, ...params: SqlValue[]) {
      return prepare(sql).all(...params) as T[];
    },
    async run(sql, ...params) {
      return exec({ sql, params });
    },
    async batch(statements) {
      return statements.length === 0 ? [] : runAll(statements);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cloudflare D1                                                              */
/* -------------------------------------------------------------------------- */

export function d1Sql(d1: D1Database): Sql {
  const bind = (s: SqlStatement) => d1.prepare(s.sql).bind(...s.params);
  return {
    async first<T>(sql: string, ...params: SqlValue[]) {
      return (await bind({ sql, params }).first<T>()) ?? null;
    },
    async all<T>(sql: string, ...params: SqlValue[]) {
      return (await bind({ sql, params }).all<T>()).results;
    },
    async run(sql, ...params) {
      const result = await bind({ sql, params }).all<Record<string, unknown>>();
      return { changes: result.meta.changes ?? 0, rows: result.results };
    },
    async batch(statements) {
      if (statements.length === 0) return [];
      const results = await d1.batch<Record<string, unknown>>(statements.map(bind));
      return results.map((r) => ({ changes: r.meta.changes ?? 0, rows: r.results ?? [] }));
    },
  };
}
