// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createRateLimiter, createSqliteAiStore, monthWindow } from '../ai-store';

describe('AI store', () => {
  it('stores plan, model and keys per user', async () => {
    const store = createSqliteAiStore(new Database(':memory:'));
    expect(await store.getPlan('u')).toBeNull();
    await store.setPlan('u', 'pro');
    expect(await store.getPlan('u')).toBe('pro');
    await store.setModelId('u', 'google:gemini-2.5-pro');
    expect(await store.getModelId('u')).toBe('google:gemini-2.5-pro');
    await store.setModelId('u', null);
    expect(await store.getModelId('u')).toBeNull();

    await store.putKey('u', 'google', { ciphertext: 'c', iv: 'i' }, '1234');
    await store.putKey('u', 'google', { ciphertext: 'c2', iv: 'i2' }, '5678');
    expect(await store.listKeys('u')).toEqual([{ provider: 'google', last4: '5678' }]);
    expect(await store.getKey('u', 'google')).toEqual({ ciphertext: 'c2', iv: 'i2' });
    expect(await store.listKeys('other')).toEqual([]);
    expect(await store.deleteKey('u', 'google')).toBe(true);
    expect(await store.deleteKey('u', 'google')).toBe(false);
  });

  it('counts only calls on the app’s keys', async () => {
    const store = createSqliteAiStore(new Database(':memory:'));
    const base = {
      userId: 'u',
      feature: 'ai.map' as const,
      provider: 'google' as const,
      model: 'gemini-3.8-flash',
      inputTokens: 1,
      outputTokens: 1,
      costMicros: null,
    };
    await store.recordUsage({ ...base, ownKey: false });
    await store.recordUsage({ ...base, ownKey: false });
    await store.recordUsage({ ...base, ownKey: true });
    expect(await store.countActions('u', '2000-01-01T00:00:00.000Z')).toBe(2);
    expect(await store.countActions('u', '2999-01-01T00:00:00.000Z')).toBe(0);
  });
});

describe('monthWindow', () => {
  it('spans the UTC calendar month', () => {
    expect(monthWindow(new Date('2026-12-15T10:00:00Z'))).toEqual({
      start: '2026-12-01T00:00:00.000Z',
      resetsAt: '2027-01-01T00:00:00.000Z',
    });
  });
});

describe('rate limiter', () => {
  it('allows the limit per window per user', () => {
    const limiter = createRateLimiter(2, 1_000);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 10)).toBe(true);
    expect(limiter.take('a', 20)).toBe(false);
    expect(limiter.take('b', 20)).toBe(true);
    expect(limiter.take('a', 1_001)).toBe(true);
  });
});
