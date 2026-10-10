/**
 * What the AI layer remembers per person: their plan, chosen model, own API
 * keys (sealed, see `keys.ts`) and every call they made.
 *
 * The routes only see the `AiStore` interface, which is async so a store on
 * another database (for example a hosted SQL service) can stand in for the
 * SQLite one here without touching them.
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

import type { AiProvider, KeyedProvider } from './models';
import type { SealedKey } from './keys';
import { isPlan } from './plans';
import type { AiFeature, Plan } from './plans';

export interface UsageEntry {
  readonly userId: string;
  readonly feature: AiFeature;
  readonly provider: AiProvider;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Estimated cost in millionths of a dollar, or null when unknown. */
  readonly costMicros: number | null;
  /** Ran on the person's own key, so it does not count against their plan. */
  readonly ownKey: boolean;
}

export interface StoredKeyInfo {
  readonly provider: KeyedProvider;
  readonly last4: string;
}

export interface AiStore {
  getPlan(userId: string): Promise<Plan | null>;
  setPlan(userId: string, plan: Plan): Promise<void>;
  getModelId(userId: string): Promise<string | null>;
  setModelId(userId: string, modelId: string | null): Promise<void>;
  listKeys(userId: string): Promise<StoredKeyInfo[]>;
  getKey(userId: string, provider: KeyedProvider): Promise<SealedKey | null>;
  putKey(userId: string, provider: KeyedProvider, sealed: SealedKey, last4: string): Promise<void>;
  deleteKey(userId: string, provider: KeyedProvider): Promise<boolean>;
  recordUsage(entry: UsageEntry): Promise<void>;
  /** Calls on the app's keys since `sinceIso`. */
  countActions(userId: string, sinceIso: string): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/* Monthly allowance window                                                   */
/* -------------------------------------------------------------------------- */

/** The calendar month (UTC) containing `now`: when it began and when it ends. */
export function monthWindow(now: Date): { readonly start: string; readonly resetsAt: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), resetsAt: next.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* Rate limit                                                                 */
/* -------------------------------------------------------------------------- */

export interface RateLimiter {
  /** Count one request for `userId`; false when they are over the limit. */
  take(userId: string, now?: number): boolean;
}

/**
 * At most `limit` requests per `windowMs` per person, kept in memory. Enough
 * for one server process; several would share a store instead.
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(userId, now = Date.now()) {
      const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(userId, recent);
        return false;
      }
      recent.push(now);
      hits.set(userId, recent);
      // Forget people who have gone quiet so the map does not grow forever.
      if (hits.size > 10_000) {
        for (const [id, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(id);
      }
      return true;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* SQLite store                                                               */
/* -------------------------------------------------------------------------- */

export function ensureAiSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "ai_usage" (
      "id"           TEXT PRIMARY KEY NOT NULL,
      "userId"       TEXT NOT NULL,
      "feature"      TEXT NOT NULL,
      "provider"     TEXT NOT NULL,
      "model"        TEXT NOT NULL,
      "inputTokens"  INTEGER NOT NULL DEFAULT 0,
      "outputTokens" INTEGER NOT NULL DEFAULT 0,
      "costMicros"   INTEGER,
      "ownKey"       INTEGER NOT NULL DEFAULT 0,
      "createdAt"    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "idx_ai_usage_userId_createdAt" ON "ai_usage" ("userId", "createdAt");

    CREATE TABLE IF NOT EXISTS "ai_user_settings" (
      "userId"  TEXT PRIMARY KEY NOT NULL,
      "modelId" TEXT
    );

    CREATE TABLE IF NOT EXISTS "ai_user_key" (
      "userId"     TEXT NOT NULL,
      "provider"   TEXT NOT NULL,
      "ciphertext" TEXT NOT NULL,
      "iv"         TEXT NOT NULL,
      "last4"      TEXT NOT NULL,
      "updatedAt"  TEXT NOT NULL,
      PRIMARY KEY ("userId", "provider")
    );

    CREATE TABLE IF NOT EXISTS "user_plan" (
      "userId"    TEXT PRIMARY KEY NOT NULL,
      "plan"      TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL
    );
  `);
}

export function createSqliteAiStore(db: Database.Database): AiStore {
  ensureAiSchema(db);
  const stmt = {
    getPlan: db.prepare<[string], { plan: string }>('SELECT "plan" FROM "user_plan" WHERE "userId" = ?'),
    setPlan: db.prepare(
      `INSERT INTO "user_plan" ("userId", "plan", "updatedAt") VALUES (?, ?, ?)
       ON CONFLICT ("userId") DO UPDATE SET "plan" = excluded."plan", "updatedAt" = excluded."updatedAt"`,
    ),
    getModel: db.prepare<[string], { modelId: string | null }>(
      'SELECT "modelId" FROM "ai_user_settings" WHERE "userId" = ?',
    ),
    setModel: db.prepare(
      `INSERT INTO "ai_user_settings" ("userId", "modelId") VALUES (?, ?)
       ON CONFLICT ("userId") DO UPDATE SET "modelId" = excluded."modelId"`,
    ),
    listKeys: db.prepare<[string], { provider: KeyedProvider; last4: string }>(
      'SELECT "provider", "last4" FROM "ai_user_key" WHERE "userId" = ? ORDER BY "provider"',
    ),
    getKey: db.prepare<[string, string], { ciphertext: string; iv: string }>(
      'SELECT "ciphertext", "iv" FROM "ai_user_key" WHERE "userId" = ? AND "provider" = ?',
    ),
    putKey: db.prepare(
      `INSERT INTO "ai_user_key" ("userId", "provider", "ciphertext", "iv", "last4", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT ("userId", "provider") DO UPDATE SET
         "ciphertext" = excluded."ciphertext", "iv" = excluded."iv",
         "last4" = excluded."last4", "updatedAt" = excluded."updatedAt"`,
    ),
    deleteKey: db.prepare('DELETE FROM "ai_user_key" WHERE "userId" = ? AND "provider" = ?'),
    recordUsage: db.prepare(
      `INSERT INTO "ai_usage"
         ("id", "userId", "feature", "provider", "model", "inputTokens", "outputTokens", "costMicros", "ownKey", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    countActions: db.prepare<[string, string], { n: number }>(
      'SELECT COUNT(*) AS "n" FROM "ai_usage" WHERE "userId" = ? AND "ownKey" = 0 AND "createdAt" >= ?',
    ),
  };

  return {
    async getPlan(userId) {
      const plan = stmt.getPlan.get(userId)?.plan;
      return isPlan(plan) ? plan : null;
    },
    async setPlan(userId, plan) {
      stmt.setPlan.run(userId, plan, new Date().toISOString());
    },
    async getModelId(userId) {
      return stmt.getModel.get(userId)?.modelId ?? null;
    },
    async setModelId(userId, modelId) {
      stmt.setModel.run(userId, modelId);
    },
    async listKeys(userId) {
      return stmt.listKeys.all(userId);
    },
    async getKey(userId, provider) {
      return stmt.getKey.get(userId, provider) ?? null;
    },
    async putKey(userId, provider, sealed, last4) {
      stmt.putKey.run(userId, provider, sealed.ciphertext, sealed.iv, last4, new Date().toISOString());
    },
    async deleteKey(userId, provider) {
      return stmt.deleteKey.run(userId, provider).changes > 0;
    },
    async recordUsage(e) {
      stmt.recordUsage.run(
        crypto.randomUUID(),
        e.userId,
        e.feature,
        e.provider,
        e.model,
        e.inputTokens,
        e.outputTokens,
        e.costMicros,
        e.ownKey ? 1 : 0,
        new Date().toISOString(),
      );
    },
    async countActions(userId, sinceIso) {
      return stmt.countActions.get(userId, sinceIso)?.n ?? 0;
    },
  };
}
