/**
 * The small part of Cloudflare's Workers API the server uses: D1, R2 and the
 * rate limiting binding. Written out here (rather than pulling in
 * `@cloudflare/workers-types`, whose globals clash with Node's) so the server
 * code type-checks the same for Node and for Workers.
 */

export interface D1Result<T> {
  results: T[];
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface R2ObjectBody {
  readonly httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The bindings and settings `wrangler.jsonc` gives the Worker. */
export interface WorkerEnv {
  readonly DB: D1Database;
  readonly FILES: R2Bucket;
  readonly AI_LIMITER?: RateLimit;
  readonly [name: string]: unknown;
}
