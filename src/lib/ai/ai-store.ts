/**
 * What the AI layer remembers per person: their plan, chosen model, own API
 * keys (sealed, see `keys.ts`) and every call they made.
 *
 * The routes only see the `AiStore` interface; `createSqlAiStore` keeps it
 * in SQLite locally and in D1 on Workers.
 */

import crypto from 'node:crypto';
import type { RateLimit } from '../cloudflare';
import type { Sql } from '../sql';

import type { AcceptRate, FeedbackFeature } from './contracts';
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
  /** Note how many suggestions were shown and how many kept. */
  recordFeedback(userId: string, feature: FeedbackFeature, offered: number, accepted: number): Promise<void>;
  /** Suggestions shown and kept since `sinceIso`, per feature. */
  acceptRates(userId: string, sinceIso: string): Promise<AcceptRate[]>;
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
  take(userId: string, now?: number): boolean | Promise<boolean>;
}

/**
 * A limiter on Cloudflare's rate limiting binding, which every copy of the
 * Worker shares (the limit itself is set in `wrangler.jsonc`).
 */
export function cloudflareRateLimiter(binding: RateLimit): RateLimiter {
  return {
    async take(userId) {
      return (await binding.limit({ key: userId })).success;
    },
  };
}

/**
 * At most `limit` requests per `windowMs` per person, kept in memory. Enough
 * for one server process; on Workers use `cloudflareRateLimiter`.
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
/* SQL store (SQLite or D1)                                                   */
/* -------------------------------------------------------------------------- */

/** The store on `sql`; its tables are in `../schema.ts`. */
export function createSqlAiStore(sql: Sql): AiStore {
  return {
    async getPlan(userId) {
      const row = await sql.first<{ plan: string }>('SELECT "plan" FROM "user_plan" WHERE "userId" = ?', userId);
      return isPlan(row?.plan) ? row.plan : null;
    },
    async setPlan(userId, plan) {
      await sql.run(
        `INSERT INTO "user_plan" ("userId", "plan", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT ("userId") DO UPDATE SET "plan" = excluded."plan", "updatedAt" = excluded."updatedAt"`,
        userId,
        plan,
        new Date().toISOString(),
      );
    },
    async getModelId(userId) {
      const row = await sql.first<{ modelId: string | null }>(
        'SELECT "modelId" FROM "ai_user_settings" WHERE "userId" = ?',
        userId,
      );
      return row?.modelId ?? null;
    },
    async setModelId(userId, modelId) {
      await sql.run(
        `INSERT INTO "ai_user_settings" ("userId", "modelId") VALUES (?, ?)
         ON CONFLICT ("userId") DO UPDATE SET "modelId" = excluded."modelId"`,
        userId,
        modelId,
      );
    },
    async listKeys(userId) {
      return sql.all<StoredKeyInfo>(
        'SELECT "provider", "last4" FROM "ai_user_key" WHERE "userId" = ? ORDER BY "provider"',
        userId,
      );
    },
    async getKey(userId, provider) {
      return sql.first<SealedKey>(
        'SELECT "ciphertext", "iv" FROM "ai_user_key" WHERE "userId" = ? AND "provider" = ?',
        userId,
        provider,
      );
    },
    async putKey(userId, provider, sealed, last4) {
      await sql.run(
        `INSERT INTO "ai_user_key" ("userId", "provider", "ciphertext", "iv", "last4", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT ("userId", "provider") DO UPDATE SET
           "ciphertext" = excluded."ciphertext", "iv" = excluded."iv",
           "last4" = excluded."last4", "updatedAt" = excluded."updatedAt"`,
        userId,
        provider,
        sealed.ciphertext,
        sealed.iv,
        last4,
        new Date().toISOString(),
      );
    },
    async deleteKey(userId, provider) {
      const result = await sql.run('DELETE FROM "ai_user_key" WHERE "userId" = ? AND "provider" = ?', userId, provider);
      return result.changes > 0;
    },
    async recordUsage(e) {
      await sql.run(
        `INSERT INTO "ai_usage"
           ("id", "userId", "feature", "provider", "model", "inputTokens", "outputTokens", "costMicros", "ownKey", "createdAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      const row = await sql.first<{ n: number }>(
        'SELECT COUNT(*) AS "n" FROM "ai_usage" WHERE "userId" = ? AND "ownKey" = 0 AND "createdAt" >= ?',
        userId,
        sinceIso,
      );
      return row?.n ?? 0;
    },
    async recordFeedback(userId, feature, offered, accepted) {
      await sql.run(
        'INSERT INTO "ai_feedback" ("id", "userId", "feature", "offered", "accepted", "createdAt") VALUES (?, ?, ?, ?, ?, ?)',
        crypto.randomUUID(),
        userId,
        feature,
        offered,
        Math.min(accepted, offered),
        new Date().toISOString(),
      );
    },
    async acceptRates(userId, sinceIso) {
      return sql.all<AcceptRate>(
        `SELECT "feature", SUM("offered") AS "offered", SUM("accepted") AS "accepted" FROM "ai_feedback"
          WHERE "userId" = ? AND "createdAt" >= ? GROUP BY "feature" ORDER BY "feature"`,
        userId,
        sinceIso,
      );
    },
  };
}
