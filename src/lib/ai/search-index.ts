/**
 * The project search index: every idea and document passage, searchable by
 * words (SQLite FTS5) and by meaning (embedding vectors), in the same SQLite
 * file as everything else.
 *
 * The index is brought up to date when the AI needs it (`sync`): passages are
 * compared by a hash of their text, so only new or changed ones are stored
 * again and need new vectors. Vectors are compared in JavaScript, which is
 * plenty fast for the few thousand passages a project has and needs no SQLite
 * extension.
 */

import type Database from 'better-sqlite3';

import { chunkHash } from './project-content';
import type { Chunk, ChunkSource } from './project-content';

export interface IndexedChunk extends Chunk {
  readonly rowid: number;
}

export interface SearchHit {
  readonly key: string;
  readonly score: number;
}

export interface SearchIndex {
  /**
   * Make the stored passages of a project match `chunks`. Returns the
   * passages that have no vector from `embedModel` yet.
   */
  sync(userId: string, projectId: string, chunks: readonly Chunk[], embedModel: string | null): IndexedChunk[];
  /** Store vectors for passages returned by `sync`. */
  setEmbeddings(model: string, vectors: ReadonlyArray<{ readonly rowid: number; readonly vector: readonly number[] }>): void;
  /** Passages matching the words of `query`, best first. */
  keywordSearch(userId: string, projectId: string, query: string, limit: number): SearchHit[];
  /** Passages closest in meaning to `vector`, best first. */
  vectorSearch(userId: string, projectId: string, model: string, vector: readonly number[], limit: number): SearchHit[];
  removeProject(projectId: string): void;
}

export function ensureSearchSchema(db: Database.Database): void {
  db.exec(`
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
  `);
}

/** Vectors are stored as little-endian float32. */
function toBlob(vector: readonly number[]): Buffer {
  const out = Buffer.alloc(vector.length * 4);
  vector.forEach((v, i) => out.writeFloatLE(v, i * 4));
  return out;
}

function fromBlob(blob: Buffer): Float32Array {
  const out = new Float32Array(blob.length / 4);
  for (let i = 0; i < out.length; i += 1) out[i] = blob.readFloatLE(i * 4);
  return out;
}

function cosine(a: Float32Array, b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * An FTS5 query from free text: each word quoted (so punctuation and words
 * like OR are taken literally), any of them may match.
 */
export function ftsQuery(text: string): string | null {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1)
    .slice(0, 24);
  if (words.length === 0) return null;
  return [...new Set(words)].map((w) => `"${w}"`).join(' OR ');
}

interface ChunkRow {
  rowid: number;
  key: string;
  source: string;
  title: string;
  text: string;
  ideaIds: string;
  hash: string;
  embedModel: string | null;
  hasEmbedding: number;
}

export function createSearchIndex(db: Database.Database): SearchIndex {
  ensureSearchSchema(db);
  const stmt = {
    rows: db.prepare<[string, string], ChunkRow>(
      `SELECT "rowid", "key", "source", "title", "text", "ideaIds", "hash", "embedModel",
              ("embedding" IS NOT NULL) AS "hasEmbedding"
         FROM "ai_chunk" WHERE "projectId" = ? AND "userId" = ?`,
    ),
    insert: db.prepare(
      `INSERT INTO "ai_chunk" ("userId", "projectId", "key", "source", "title", "text", "ideaIds", "hash", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    update: db.prepare(
      `UPDATE "ai_chunk" SET "source" = ?, "title" = ?, "text" = ?, "ideaIds" = ?, "hash" = ?,
              "embedModel" = NULL, "embedding" = NULL, "updatedAt" = ?
        WHERE "rowid" = ?`,
    ),
    remove: db.prepare('DELETE FROM "ai_chunk" WHERE "rowid" = ?'),
    setEmbedding: db.prepare('UPDATE "ai_chunk" SET "embedModel" = ?, "embedding" = ? WHERE "rowid" = ?'),
    keyword: db.prepare<[string, string, string, number], { key: string; rank: number }>(
      `SELECT c."key" AS "key", bm25("ai_chunk_fts", 2.0, 1.0) AS "rank"
         FROM "ai_chunk_fts" JOIN "ai_chunk" c ON c."rowid" = "ai_chunk_fts"."rowid"
        WHERE "ai_chunk_fts" MATCH ? AND c."projectId" = ? AND c."userId" = ?
        ORDER BY "rank" LIMIT ?`,
    ),
    vectors: db.prepare<[string, string, string], { key: string; embedding: Buffer }>(
      `SELECT "key", "embedding" FROM "ai_chunk"
        WHERE "projectId" = ? AND "userId" = ? AND "embedModel" = ? AND "embedding" IS NOT NULL`,
    ),
    removeProject: db.prepare('DELETE FROM "ai_chunk" WHERE "projectId" = ?'),
  };

  return {
    sync(userId, projectId, chunks, embedModel) {
      const stamp = new Date().toISOString();
      const stale: IndexedChunk[] = [];
      db.transaction(() => {
        const existing = new Map(stmt.rows.all(projectId, userId).map((r) => [r.key, r]));
        for (const chunk of chunks) {
          const hash = chunkHash(chunk);
          const row = existing.get(chunk.key);
          existing.delete(chunk.key);
          const source = JSON.stringify(chunk.source);
          const ideaIds = JSON.stringify(chunk.ideaIds);
          let rowid: number;
          let needsVector: boolean;
          if (!row) {
            rowid = Number(stmt.insert.run(userId, projectId, chunk.key, source, chunk.title, chunk.text, ideaIds, hash, stamp).lastInsertRowid);
            needsVector = true;
          } else if (row.hash !== hash) {
            stmt.update.run(source, chunk.title, chunk.text, ideaIds, hash, stamp, row.rowid);
            rowid = row.rowid;
            needsVector = true;
          } else {
            rowid = row.rowid;
            needsVector = !row.hasEmbedding || row.embedModel !== embedModel;
          }
          if (embedModel && needsVector) stale.push({ ...chunk, rowid });
        }
        for (const gone of existing.values()) stmt.remove.run(gone.rowid);
      })();
      return stale;
    },

    setEmbeddings(model, vectors) {
      db.transaction(() => {
        for (const v of vectors) stmt.setEmbedding.run(model, toBlob(v.vector), v.rowid);
      })();
    },

    keywordSearch(userId, projectId, query, limit) {
      const match = ftsQuery(query);
      if (!match) return [];
      // bm25 is lower-is-better; flip it so every score reads higher-is-better.
      return stmt.keyword.all(match, projectId, userId, limit).map((r) => ({ key: r.key, score: -r.rank }));
    },

    vectorSearch(userId, projectId, model, vector, limit) {
      return stmt.vectors
        .all(projectId, userId, model)
        .map((r) => ({ key: r.key, score: cosine(fromBlob(r.embedding), vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    removeProject(projectId) {
      stmt.removeProject.run(projectId);
    },
  };
}

/** Parse a stored source back; used by tests and debugging. */
export function parseSource(text: string): ChunkSource {
  return JSON.parse(text) as ChunkSource;
}
