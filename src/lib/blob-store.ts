/**
 * Where image bytes live when they are too big for a database row.
 *
 * On a local SQLite file the stores keep images in their own tables, as they
 * always have. Cloudflare D1 caps a row at 2 MB, so on Workers the stores are
 * given a `BlobStore` backed by an R2 bucket and keep only a pointer row.
 */

import type { R2Bucket } from './cloudflare';

export interface Blob {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Blob | null>;
  delete(keys: readonly string[]): Promise<void>;
  /** Delete every blob whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}

/** Keys used by the stores, all under one project so a project deletes cleanly. */
export const blobKeys = {
  project: (projectId: string) => `projects/${projectId}/`,
  canvasImage: (projectId: string, imageId: string) => `projects/${projectId}/images/${imageId}`,
  documentAsset: (projectId: string, assetId: string) => `projects/${projectId}/assets/${assetId}`,
};

export function r2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async put(key, bytes, mime) {
      await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        mime: object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },
    async delete(keys) {
      // R2 deletes at most 1,000 keys per call.
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await bucket.list(cursor ? { prefix, cursor } : { prefix });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}

/** An in-memory store, for tests of the R2 code path. */
export function memoryBlobStore(): BlobStore & { readonly keys: () => string[] } {
  const blobs = new Map<string, Blob>();
  return {
    keys: () => [...blobs.keys()].sort(),
    async put(key, bytes, mime) {
      blobs.set(key, { bytes: Uint8Array.from(bytes), mime });
    },
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(keys) {
      for (const key of keys) blobs.delete(key);
    },
    async deletePrefix(prefix) {
      for (const key of [...blobs.keys()]) if (key.startsWith(prefix)) blobs.delete(key);
    },
  };
}
