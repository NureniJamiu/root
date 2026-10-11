/**
 * The project search index: every idea and document passage, searchable by
 * words (SQLite FTS5) and by meaning (embedding vectors), in the same
 * database as everything else (a SQLite file locally, D1 on Workers).
 *
 * The index is brought up to date when the AI needs it (`sync`): passages are
 * compared by a hash of their text, so only new or changed ones are stored
 * again and need new vectors. Vectors are compared in JavaScript, which is
 * plenty fast for the few thousand passages a project has and needs no SQLite
 * extension.
 */

import { bytesOf, stmt } from '../sql';
import type { Sql, SqlStatement } from '../sql';

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
  sync(userId: string, projectId: string, chunks: readonly Chunk[], embedModel: string | null): Promise<IndexedChunk[]>;
  /** Store vectors for passages returned by `sync`. */
  setEmbeddings(
    model: string,
    vectors: ReadonlyArray<{ readonly rowid: number; readonly vector: readonly number[] }>,
  ): Promise<void>;
  /** Passages matching the words of `query`, best first. */
  keywordSearch(userId: string, projectId: string, query: string, limit: number): Promise<SearchHit[]>;
  /** Passages closest in meaning to `vector`, best first. */
  vectorSearch(userId: string, projectId: string, model: string, vector: readonly number[], limit: number): Promise<SearchHit[]>;
  /** The writes that drop a project's passages, for a batch with the project's own. */
  removeProjectStatements(projectId: string): SqlStatement[];
}

/** Vectors are stored as little-endian float32. */
function toBlob(vector: readonly number[]): Uint8Array {
  const out = new Uint8Array(vector.length * 4);
  const view = new DataView(out.buffer);
  vector.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return out;
}

function fromBlob(blob: Uint8Array): Float32Array {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out = new Float32Array(Math.floor(blob.byteLength / 4));
  for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, true);
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

/** The index on `sql`; its tables are in `../schema.ts`. */
export function createSearchIndex(sql: Sql): SearchIndex {
  return {
    async sync(userId, projectId, chunks, embedModel) {
      const stamp = new Date().toISOString();
      const rows = await sql.all<ChunkRow>(
        `SELECT "rowid", "key", "source", "title", "text", "ideaIds", "hash", "embedModel",
                ("embedding" IS NOT NULL) AS "hasEmbedding"
           FROM "ai_chunk" WHERE "projectId" = ? AND "userId" = ?`,
        projectId,
        userId,
      );
      const existing = new Map(rows.map((r) => [r.key, r]));
      const writes: SqlStatement[] = [];
      /** Passages needing a vector; a new one gets its rowid from its INSERT in the batch. */
      const stale: Array<{ chunk: Chunk; rowid: number } | { chunk: Chunk; insert: number }> = [];
      for (const chunk of chunks) {
        const hash = chunkHash(chunk);
        const row = existing.get(chunk.key);
        existing.delete(chunk.key);
        const source = JSON.stringify(chunk.source);
        const ideaIds = JSON.stringify(chunk.ideaIds);
        if (!row) {
          writes.push(
            stmt(
              `INSERT INTO "ai_chunk" ("userId", "projectId", "key", "source", "title", "text", "ideaIds", "hash", "updatedAt")
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "rowid"`,
              userId,
              projectId,
              chunk.key,
              source,
              chunk.title,
              chunk.text,
              ideaIds,
              hash,
              stamp,
            ),
          );
          if (embedModel) stale.push({ chunk, insert: writes.length - 1 });
        } else if (row.hash !== hash) {
          writes.push(
            stmt(
              `UPDATE "ai_chunk" SET "source" = ?, "title" = ?, "text" = ?, "ideaIds" = ?, "hash" = ?,
                      "embedModel" = NULL, "embedding" = NULL, "updatedAt" = ?
                WHERE "rowid" = ?`,
              source,
              chunk.title,
              chunk.text,
              ideaIds,
              hash,
              stamp,
              row.rowid,
            ),
          );
          if (embedModel) stale.push({ chunk, rowid: row.rowid });
        } else if (embedModel && (!row.hasEmbedding || row.embedModel !== embedModel)) {
          stale.push({ chunk, rowid: row.rowid });
        }
      }
      for (const gone of existing.values()) writes.push(stmt('DELETE FROM "ai_chunk" WHERE "rowid" = ?', gone.rowid));

      const results = await sql.batch(writes);
      return stale.map((s) => ({
        ...s.chunk,
        rowid: 'rowid' in s ? s.rowid : Number(results[s.insert]!.rows[0]!.rowid),
      }));
    },

    async setEmbeddings(model, vectors) {
      await sql.batch(
        vectors.map((v) =>
          stmt('UPDATE "ai_chunk" SET "embedModel" = ?, "embedding" = ? WHERE "rowid" = ?', model, toBlob(v.vector), v.rowid),
        ),
      );
    },

    async keywordSearch(userId, projectId, query, limit) {
      const match = ftsQuery(query);
      if (!match) return [];
      const rows = await sql.all<{ key: string; rank: number }>(
        `SELECT c."key" AS "key", bm25("ai_chunk_fts", 2.0, 1.0) AS "rank"
           FROM "ai_chunk_fts" JOIN "ai_chunk" c ON c."rowid" = "ai_chunk_fts"."rowid"
          WHERE "ai_chunk_fts" MATCH ? AND c."projectId" = ? AND c."userId" = ?
          ORDER BY "rank" LIMIT ?`,
        match,
        projectId,
        userId,
        limit,
      );
      // bm25 is lower-is-better; flip it so every score reads higher-is-better.
      return rows.map((r) => ({ key: r.key, score: -r.rank }));
    },

    async vectorSearch(userId, projectId, model, vector, limit) {
      const rows = await sql.all<{ key: string; embedding: unknown }>(
        `SELECT "key", "embedding" FROM "ai_chunk"
          WHERE "projectId" = ? AND "userId" = ? AND "embedModel" = ? AND "embedding" IS NOT NULL`,
        projectId,
        userId,
        model,
      );
      return rows
        .map((r) => ({ key: r.key, score: cosine(fromBlob(bytesOf(r.embedding)), vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    removeProjectStatements(projectId) {
      return [stmt('DELETE FROM "ai_chunk" WHERE "projectId" = ?', projectId)];
    },
  };
}

/** Parse a stored source back; used by tests and debugging. */
export function parseSource(text: string): ChunkSource {
  return JSON.parse(text) as ChunkSource;
}
