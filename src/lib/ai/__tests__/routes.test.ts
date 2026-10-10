// @vitest-environment node
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import express from 'express';
import { APICallError } from 'ai';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vitest';

import { createRateLimiter, createSqliteAiStore } from '../ai-store';
import type { AiStore } from '../ai-store';
import { deriveKeyFromSecret } from '../keys';
import type { AiModel } from '../models';
import { readAiEnv } from '../providers';
import type { ProjectContent } from '../project-content';
import { createAiRouter } from '../routes';
import { createSearchIndex } from '../search-index';
import { jsonModel, streamModel } from './mock';

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

interface Setup {
  env?: Record<string, string>;
  model?: LanguageModel;
  plan?: 'free' | 'pro';
  limit?: number;
  /** Pick a model per catalog entry; wins over `model`. */
  modelFor?: (model: AiModel) => LanguageModel;
  timeouts?: Partial<Record<'suggest' | 'draft' | 'rewrite' | 'test' | 'ask' | 'review', number>>;
  projects?: Record<string, ProjectContent>;
}

/** A model whose every call fails the way a provider's HTTP error does. */
function failingModel(statusCode: number, message: string): MockLanguageModelV4 {
  const fail = async (): Promise<never> => {
    throw new APICallError({
      message: `HTTP ${statusCode}`,
      url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent',
      requestBodyValues: {},
      statusCode,
      responseBody: JSON.stringify({ error: { code: statusCode, message } }),
      isRetryable: statusCode === 429 || statusCode >= 500,
    });
  };
  return new MockLanguageModelV4({ doGenerate: fail, doStream: fail });
}

/** A model that never answers, until the call is aborted. */
function silentModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal?.addEventListener('abort', () => reject(abortSignal.reason ?? new Error('aborted')));
      }),
  });
}

const PRO = 'google:gemini-3.1-pro-preview';
/** An app with a separate model for drafts, so fallback has somewhere to go. */
const SMART_ENV = { GOOGLE_GENERATIVE_AI_API_KEY: 'app-google-key', AI_SMART_MODEL: PRO };

const ROOT = '00000000-0000-4000-8000-00000000000a';
const draftBody = {
  rootId: ROOT,
  canvas: { title: 'Sleep', nodes: [{ id: ROOT, title: 'Sleep', body: '', type: 'topic' }], edges: [] },
};

async function start(setup: Setup = {}) {
  const store: AiStore = createSqliteAiStore(new Database(':memory:'));
  const calls: Array<{ model: AiModel; apiKey: string }> = [];
  const app = express();
  app.use((req, res, next) => {
    res.locals.userId = req.header('x-user') ?? 'user-1';
    next();
  });
  app.use(
    '/api/ai',
    createAiRouter({
      store,
      env: readAiEnv(setup.env ?? { GOOGLE_GENERATIVE_AI_API_KEY: 'app-google-key' }),
      cryptoKey: await deriveKeyFromSecret('test'),
      defaultPlan: setup.plan ?? 'pro',
      limiter: createRateLimiter(setup.limit ?? 100, 60_000),
      ...(setup.timeouts ? { timeouts: setup.timeouts } : {}),
      index: createSearchIndex(new Database(':memory:')),
      loadProject: async (userId, projectId) => (userId === 'user-1' ? setup.projects?.[projectId] ?? null : null),
      buildEmbedder: (modelId) => ({ modelId, embed: async (values) => values.map(() => [1, 0]) }),
      buildModel: (model, apiKey) => {
        calls.push({ model, apiKey });
        if (setup.modelFor) return setup.modelFor(model);
        return setup.model ?? jsonModel({ ideas: [{ key: 'i1', title: 'An idea', body: '', type: 'topic', parent: null }] });
      },
    }),
  );
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`;
  const call = (path: string, init: { method?: string; body?: unknown; user?: string } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', 'x-user': init.user ?? 'user-1' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  return { store, calls, call };
}

describe('/api/ai', () => {
  it('reports config with the Gemini default and no keys leaked', async () => {
    const { call } = await start();
    const config = await (await call('/config')).json();
    expect(config).toMatchObject({ enabled: true, plan: 'pro', appProviders: ['google'], keys: [] });
    expect(config.activeModels).toEqual({ fast: 'google:gemini-3.8-flash', smart: 'google:gemini-3.8-flash' });
    expect(JSON.stringify(config)).not.toContain('app-google-key');
  });

  it('maps a topic, counts it and returns the allowance', async () => {
    const { call, calls } = await start();
    const res = await call('/map', { body: { topic: 'Sleep' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ideas).toHaveLength(1);
    expect(body.allowance.used).toBe(1);
    expect(body.ownKey).toBe(false);
    expect(calls[0]).toMatchObject({ apiKey: 'app-google-key' });
  });

  it('rejects invalid requests', async () => {
    const { call } = await start();
    const res = await call('/map', { body: { topic: '' } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid');
  });

  it('asks Free users to upgrade for drafting', async () => {
    const { call } = await start({ plan: 'free' });
    const res = await call('/draft', {
      body: { rootId: '00000000-0000-4000-8000-00000000000a', canvas: { title: '', nodes: [], edges: [] } },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'upgrade', feature: 'ai.draft' });
  });

  it('stops at the monthly allowance', async () => {
    const { call, store } = await start({ plan: 'free' });
    for (let i = 0; i < 30; i += 1) {
      await store.recordUsage({
        userId: 'user-1',
        feature: 'ai.map',
        provider: 'google',
        model: 'm',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: null,
        ownKey: false,
      });
    }
    const res = await call('/map', { body: { topic: 'Sleep' } });
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('quota');
  });

  it('says when no model is set up, until the person adds a key', async () => {
    const { call, calls } = await start({ env: {} });
    expect((await call('/map', { body: { topic: 'x' } })).status).toBe(503);
    const saved = await call('/keys/google', { method: 'PUT', body: { apiKey: 'my-own-gemini-key-9876' } });
    const config = await saved.json();
    expect(config.keys).toEqual([{ provider: 'google', last4: '9876' }]);
    expect(JSON.stringify(config)).not.toContain('my-own-gemini-key');
    const res = await call('/map', { body: { topic: 'x' } });
    const body = await res.json();
    expect(body.ownKey).toBe(true);
    expect(body.allowance.used).toBe(0);
    expect(calls[0]!.apiKey).toBe('my-own-gemini-key-9876');
    // Another user cannot use it.
    expect((await call('/map', { body: { topic: 'x' }, user: 'user-2' })).status).toBe(503);
    await call('/keys/google', { method: 'DELETE' });
    expect((await call('/map', { body: { topic: 'x' } })).status).toBe(503);
  });

  it('saves a model choice and refuses unknown ones', async () => {
    const { call } = await start();
    const ok = await call('/settings', { method: 'PUT', body: { modelId: 'google:gemini-3.5-flash-lite' } });
    expect((await ok.json()).activeModels.fast).toBe('google:gemini-3.5-flash-lite');
    expect((await call('/settings', { method: 'PUT', body: { modelId: 'x:y' } })).status).toBe(400);
  });

  it('rate limits', async () => {
    const { call } = await start({ limit: 1 });
    expect((await call('/map', { body: { topic: 'a' } })).status).toBe(200);
    const res = await call('/map', { body: { topic: 'b' } });
    expect(res.status).toBe(429);
  });

  it('streams a rewrite and counts it', async () => {
    const { call, store } = await start({ model: streamModel(['Hello ', 'world.']) });
    const res = await call('/rewrite', { body: { action: 'improve', text: 'hello world' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello world.');
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(1);
  });

  it('answers a bad model answer with bad-output', async () => {
    const { call } = await start({ model: jsonModel({ nope: true }) });
    const res = await call('/map', { body: { topic: 'a' } });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('bad-output');
  });

  it('passes on what the provider said, without the key', async () => {
    const { call } = await start({
      model: failingModel(400, 'API key not valid. Please pass a valid API key. (AIzaSyD-abcdefghijklmnop)'),
    });
    const res = await call('/map', { body: { topic: 'a' } });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('provider');
    expect(body.error).toContain('Google Gemini refused the API key');
    expect(body.error).toContain('API key not valid');
    expect(body.error).not.toContain('abcdefghijklmnop');
  });

  it('says when a model is not available to the key', async () => {
    const { call } = await start({ model: failingModel(404, 'models/gemini-x is not found for API version v1beta') });
    const body = await (await call('/map', { body: { topic: 'a' } })).json();
    expect(body.error).toContain("isn't available to this API key");
    expect(body.error).toContain('is not found');
  });

  it('gives up on a model that does not answer', async () => {
    const { call, store } = await start({ model: silentModel(), timeouts: { suggest: 100 } });
    const res = await call('/map', { body: { topic: 'a' } });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toContain('took too long');
    expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(0);
  });

  it('drafts on the fast model when the smart one is busy or retired', async () => {
    const draft = { title: 'Sleep', intro: 'About sleep.', sections: [] };
    for (const [status, message] of [
      [503, 'The model is overloaded.'],
      [404, 'This model models/gemini-3.1-pro-preview is no longer available to new users.'],
    ] as const) {
      const { call, calls, store } = await start({
        env: SMART_ENV,
        modelFor: (m) => (m.id === PRO ? failingModel(status, message) : jsonModel(draft)),
      });
      const res = await call('/draft', { body: draftBody });
      expect(res.status).toBe(200);
      expect((await res.json()).draft.title).toBe('Sleep');
      expect(calls.map((c) => c.model.id)).toEqual([PRO, 'google:gemini-3.8-flash']);
      expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(1);
    }
  });

  it('does not fall back when the key is refused', async () => {
    const { call, calls } = await start({ env: SMART_ENV, model: failingModel(403, 'Permission denied.') });
    const res = await call('/draft', { body: draftBody });
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1);
  });

  it('tests each model without counting it', async () => {
    const { call, store } = await start({
      env: SMART_ENV,
      modelFor: (m) => (m.id === PRO ? failingModel(429, 'Quota exceeded.') : jsonModel('OK')),
    });
    const res = await call('/test', { body: {} });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ role: 'fast', modelId: 'google:gemini-3.8-flash', ok: true });
    expect(results[1]).toMatchObject({ role: 'smart', modelId: PRO, ok: false });
    expect(results[1].message).toContain('Quota exceeded');
    expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(0);
  });

  describe('phase 2', () => {
    const PROJECT = '00000000-0000-4000-8000-0000000000aa';
    const IDEA = '00000000-0000-4000-8000-0000000000a1';
    const CONCLUSION = '00000000-0000-4000-8000-0000000000a2';
    const projects: Record<string, ProjectContent> = {
      [PROJECT]: {
        title: 'Sleep',
        canvas: {
          title: 'Sleep',
          nodes: [
            { id: IDEA, title: 'REM consolidates skills', body: '', type: 'finding' },
            { id: CONCLUSION, title: 'Sleep matters', body: '', type: 'conclusion' },
          ],
          edges: [],
        },
        documents: [],
      },
    };

    it('answers a question with citations to real ideas', async () => {
      const { call, store } = await start({ projects, model: streamModel(['Skills [[I1]] and ', 'more [[I7]].']) });
      const res = await call('/ask', { body: { projectId: PROJECT, question: 'What helps skills?' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-ai-search')).toBe('whole');
      expect(await res.text()).toBe(`Skills [[idea:${IDEA}]] and more .`);
      await new Promise((r) => setTimeout(r, 20));
      expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(1);
    });

    it('will not read another person\'s project', async () => {
      const { call } = await start({ projects });
      const res = await call('/ask', { body: { projectId: PROJECT, question: 'Hi' }, user: 'user-2' });
      expect(res.status).toBe(404);
    });

    it('checks for gaps with rules and the model, on Pro only', async () => {
      const model = jsonModel({ issues: [{ kind: 'gap', refs: [], message: 'Nothing on naps.', suggestion: 'Add one.' }] });
      const { call } = await start({ projects, model });
      const res = await call('/review', { body: { projectId: PROJECT } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.issues.map((i: { kind: string; rule: boolean }) => [i.kind, i.rule])).toEqual([
        ['unsupported', true],
        ['gap', false],
      ]);
      const free = await start({ projects, model, plan: 'free' });
      expect((await free.call('/review', { body: { projectId: PROJECT } })).status).toBe(403);
    });

    it('makes ideas from text and suggests tidying', async () => {
      const capture = await start({ projects });
      const ideas = await capture.call('/capture', { body: { text: 'Naps help.', canvas: projects[PROJECT]!.canvas } });
      expect((await ideas.json()).ideas).toHaveLength(1);
      const tidy = await start({
        model: jsonModel({ suggestions: [{ kind: 'connect', ref: 'I1', type: null, title: null, to: 'I2', reason: 'Supports it.' }] }),
      });
      const res = await tidy.call('/tidy', { body: { canvas: projects[PROJECT]!.canvas } });
      expect((await res.json()).suggestions).toEqual([{ kind: 'connect', sourceId: IDEA, targetId: CONCLUSION, reason: 'Supports it.' }]);
    });

    it('records accept rates without counting them as actions', async () => {
      const { call, store } = await start();
      expect((await call('/feedback', { body: { feature: 'ai.expand', offered: 5, accepted: 3 } })).status).toBe(204);
      await call('/feedback', { body: { feature: 'ai.expand', offered: 4, accepted: 9 } });
      const config = await (await call('/config')).json();
      expect(config.acceptRates).toEqual([{ feature: 'ai.expand', offered: 9, accepted: 7 }]);
      expect(config.semanticSearch).toBe(true);
      expect(await store.countActions('user-1', '2000-01-01T00:00:00.000Z')).toBe(0);
    });
  });
});
